// acdl-verify recording proxy.
//
// Stands between an agent and its model provider. Every request is appended to a
// JSONL trace whose first line is a manifest describing the episode -- what was
// run, against which provider, with which variables held at which values -- so a
// trace is self-describing evidence rather than a bare list of requests.
//
// Three modes, differing only in where the reply comes from:
//
//   scripted  bun run acdl-verify/proxy.ts --scenario s.json --run '...'
//   record    bun run acdl-verify/proxy.ts --base-url https://api.anthropic.com --run '...'
//   replay    bun run acdl-verify/proxy.ts --replay traces/e1.jsonl --run '...'
//
// The provider registry knows three wire formats (Anthropic Messages, OpenAI
// Chat Completions, Google Gemini) well enough to *synthesise* a reply, streamed
// or not. Record and replay need no such knowledge -- they move bytes -- and so
// work against any provider at all, including ones this file has never heard of.

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';

// ---------------------------------------------------------------- scenarios

/**
 * One block of an assistant turn. A response is a *composition* of these, and
 * which ones a target reads is a property of its parser, not of the provider --
 * so a reply has to be able to carry several at once rather than being either
 * "some text" or "a tool call".
 */
export type ReplyBlock =
    | { type: 'thinking'; text: string }
    | { type: 'text'; text: string }
    | { type: 'tool_use'; name: string; input?: Record<string, unknown> };

/** One scripted model reply, in provider-neutral terms. */
export type Reply =
    | { tool: string; input?: Record<string, unknown>; repeat?: number }
    | { tools: Array<{ name: string; input?: Record<string, unknown> }>; repeat?: number }
    | { text: string; repeat?: number }
    | { blocks: ReplyBlock[]; repeat?: number };

/**
 * Supplies the reply for one call. A scenario is the simplest possible one -- an
 * array lookup -- but a responder may also consult a real model, which is what
 * makes an episode realistic rather than merely reproducible.
 */
export type Responder = (request: any, callIndex: number) => Promise<Reply | undefined>;

export type Scenario = {
    name: string;
    /** Consumed in order, one per model call. When exhausted, the turn ends. */
    replies: Reply[];
    /** Hard cap on model calls, so a misbehaving loop cannot run away. */
    maxCalls?: number;
};

const DEFAULT_MAX_CALLS = 200;

/** Expand `repeat` so the list is one entry per model call. */
function expand(replies: Reply[]): Reply[] {
    const out: Reply[] = [];
    for (const r of replies) {
        const n = Math.max(1, r.repeat ?? 1);
        for (let i = 0; i < n; i++) out.push(r);
    }
    return out;
}

// ------------------------------------------------------------ trace format

export const TRACE_VERSION = 2;

export type Mode = 'scripted' | 'record' | 'replay';

/** Everything about an episode that is not the traffic itself. */
export type Episode = {
    episode: string;
    cwd: string;
    run?: string;
    /**
     * The episode's controlled variables. Ablation compares two traces that
     * differ here and nowhere else, so this is the independent variable of the
     * experiment and belongs in the evidence.
     */
    variables: Record<string, string>;
    /** Base-URL overrides the target was launched with. Filled in by the proxy. */
    targetEnv: Record<string, string>;
    provider: ProviderId | 'any';
    baseUrl?: string;
    scenario?: { name: string; path: string; replies: number; sha256: string };
    replayFrom?: { path: string; calls: number };
    git?: { sha: string; branch: string; dirty: boolean };
};

export type Manifest = Episode & {
    record: 'manifest';
    traceVersion: number;
    tool: string;
    startedAt: string;
    mode: Mode;
    port: number;
};

export type CallRecord = {
    record: 'call';
    episode: string;
    seq: number;
    /** Seconds since the proxy opened, for ordering only. Never compared. */
    t: number;
    method: string;
    path: string;
    provider?: ProviderId;
    /** False for anything that is not a model call: a health check, a 404. */
    modelCall: boolean;
    headers: Record<string, string>;
    request?: any;
    requestRaw?: string;
    status: number;
    contentType: string;
    streamed: boolean;
    response?: any;
    responseRaw?: string;
    /** Replay mode: which recorded call answered this one, and whether it fit. */
    replayOf?: number;
    diverged?: boolean;
    error?: string;
};

export type SummaryRecord = {
    record: 'summary';
    episode: string;
    endedAt: string;
    durationMs: number;
    calls: number;
    modelCalls: number;
    unexpected: number;
    exitCode?: number;
};

export type TraceRecord = Manifest | CallRecord | SummaryRecord;

/** Read a trace, tolerating v1 traces that predate the record discriminator. */
export function readTrace(file: string): { manifest?: Manifest; calls: CallRecord[] } {
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
    const recs = lines.map((l) => JSON.parse(l) as any);
    const manifest = recs.find((r) => r.record === 'manifest') as Manifest | undefined;
    const calls = recs.filter((r) =>
        r.record === 'call' || (r.record === undefined && !r.unexpected && r.request));
    return { manifest, calls: calls as CallRecord[] };
}

// ---------------------------------------------------------------- providers

export type ProviderId = 'anthropic' | 'openai' | 'google';

/** The fake key the target runs with, so a real credential never leaves here. */
export const FAKE_KEY = 'acdl-verify-not-a-real-key';

/**
 * Fixed timestamp for synthesised replies. Two runs of one scenario must differ
 * nowhere, and nothing structural reads this field.
 */
const FIXED_CREATED = 1735689600; // 2025-01-01T00:00:00Z

/**
 * Every reply spelling reduced to an ordered block list, so each provider
 * renders one shape rather than branching on which convenience form was used.
 */
function normalizeReply(reply: Reply | undefined): ReplyBlock[] {
    if (reply === undefined) return [{ type: 'text', text: 'done' }];
    if ('blocks' in reply) return reply.blocks;
    if ('text' in reply) return [{ type: 'text', text: reply.text }];
    const calls = 'tools' in reply ? reply.tools : [{ name: reply.tool, input: reply.input }];
    return calls.map((c) => ({ type: 'tool_use', name: c.name, input: c.input ?? {} }));
}

/** A turn ends unless it asked for a tool. */
function stopReasonFor(blocks: ReplyBlock[]): 'tool_use' | 'end_turn' {
    return blocks.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn';
}

/** Deterministic ids: replaying a scenario must reproduce the same bytes. */
class Ids {
    private msgN = 0;
    private toolN = 0;
    msg(prefix: string) { return prefix + String(++this.msgN).padStart(4, '0'); }
    tool(prefix: string) { return prefix + String(++this.toolN).padStart(4, '0'); }
}

interface Provider {
    id: ProviderId;
    /** Where record mode goes when --base-url is omitted. */
    upstream: string;
    /** Is this request a model call in this provider's dialect? */
    matches(pathname: string, body: any): boolean;
    /** Base-URL and key overrides that point a target's SDK at us. */
    targetEnv(base: string): Record<string, string>;
    /** The real credential, read from the proxy's own environment. */
    credential(): { header: string; value: string } | undefined;
    /** Does this request ask for a streamed response? */
    streaming(pathname: string, search: string, body: any): boolean;
    /** A scripted reply, in this provider's response shape. */
    build(reply: Reply | undefined, body: any, ids: Ids): any;
    /** That same response, as the SSE event stream its SDK expects. */
    sse(response: any): string;
}

function envCred(name: string, header: string, wrap = (v: string) => v) {
    const v = process.env[name];
    if (!v || v === FAKE_KEY) return undefined;
    return { header, value: wrap(v) };
}

const anthropic: Provider = {
    id: 'anthropic',
    upstream: 'https://api.anthropic.com',
    matches: (p) => p.endsWith('/messages') || p.endsWith('/messages/count_tokens'),
    targetEnv: (base) => ({ ANTHROPIC_BASE_URL: base, ANTHROPIC_API_KEY: FAKE_KEY }),
    credential: () => envCred('ANTHROPIC_API_KEY', 'x-api-key'),
    streaming: (_p, _s, body) => body?.stream === true,

    build(reply, body, ids) {
        const blocks = normalizeReply(reply);
        const content = blocks.map((b) =>
            b.type === 'thinking'
                // A real thinking block carries a signature the SDK round-trips;
                // it is opaque, so a placeholder keeps the shape without pretending.
                ? { type: 'thinking', thinking: b.text, signature: 'acdl-verify' }
                : b.type === 'text'
                ? { type: 'text', text: b.text }
                : { type: 'tool_use', id: ids.tool('toolu_acdl'), name: b.name, input: b.input ?? {} });
        return {
            id: ids.msg('msg_acdl'),
            type: 'message',
            role: 'assistant',
            model: body?.model ?? 'claude-opus-5',
            content,
            stop_reason: stopReasonFor(blocks),
            stop_sequence: null,
            // Constants: the target may read these, but nothing structural depends on them.
            usage: { input_tokens: 1, output_tokens: 1 },
        };
    },

    sse(r) {
        const ev = (event: string, data: unknown) =>
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        let out = ev('message_start', {
            type: 'message_start',
            message: { ...r, content: [], stop_reason: null, stop_sequence: null },
        });
        r.content.forEach((b: any, i: number) => {
            const start = b.type === 'text' ? { type: 'text', text: '' }
                : b.type === 'thinking' ? { type: 'thinking', thinking: '', signature: '' }
                : { type: 'tool_use', id: b.id, name: b.name, input: {} };
            const deltas = b.type === 'text'
                ? [{ type: 'text_delta', text: b.text }]
                : b.type === 'thinking'
                // A thinking block streams its text and then its signature, and an
                // SDK that reassembles blocks expects both.
                ? [{ type: 'thinking_delta', thinking: b.thinking },
                   { type: 'signature_delta', signature: b.signature }]
                : [{ type: 'input_json_delta', partial_json: JSON.stringify(b.input) }];
            out += ev('content_block_start', { type: 'content_block_start', index: i, content_block: start });
            for (const delta of deltas) {
                out += ev('content_block_delta', { type: 'content_block_delta', index: i, delta });
            }
            out += ev('content_block_stop', { type: 'content_block_stop', index: i });
        });
        out += ev('message_delta', {
            type: 'message_delta',
            delta: { stop_reason: r.stop_reason, stop_sequence: null },
            usage: { output_tokens: 1 },
        });
        out += ev('message_stop', { type: 'message_stop' });
        return out;
    },
};

const openai: Provider = {
    id: 'openai',
    upstream: 'https://api.openai.com/v1',
    matches: (p) => p.endsWith('/chat/completions') || p.endsWith('/responses'),
    targetEnv: (base) => ({ OPENAI_BASE_URL: `${base}/v1`, OPENAI_API_KEY: FAKE_KEY }),
    credential: () => envCred('OPENAI_API_KEY', 'authorization', (v) => `Bearer ${v}`),
    streaming: (_p, _s, body) => body?.stream === true,

    build(reply, body, ids) {
        const n = normalizeReply(reply);
        const message: any = { role: 'assistant', content: n.kind === 'text' ? n.text : null };
        if (n.kind === 'tools') {
            message.tool_calls = n.calls.map((c) => ({
                id: ids.tool('call_acdl'),
                type: 'function',
                function: { name: c.name, arguments: JSON.stringify(c.input) },
            }));
        }
        return {
            id: ids.msg('chatcmpl-acdl'),
            object: 'chat.completion',
            created: FIXED_CREATED,
            model: body?.model ?? 'gpt-4o',
            choices: [{
                index: 0, message, logprobs: null,
                finish_reason: n.kind === 'text' ? 'stop' : 'tool_calls',
            }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        };
    },

    sse(r) {
        const head = { id: r.id, object: 'chat.completion.chunk', created: r.created, model: r.model };
        const chunk = (delta: unknown, finish: string | null) =>
            `data: ${JSON.stringify({ ...head, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
        const m = r.choices[0].message;
        let out = chunk({ role: 'assistant', content: '' }, null);
        if (m.content !== null) out += chunk({ content: m.content }, null);
        (m.tool_calls ?? []).forEach((tc: any, i: number) => {
            out += chunk({ tool_calls: [{ index: i, id: tc.id, type: 'function', function: tc.function }] }, null);
        });
        out += chunk({}, r.choices[0].finish_reason);
        out += 'data: [DONE]\n\n';
        return out;
    },
};

const google: Provider = {
    id: 'google',
    upstream: 'https://generativelanguage.googleapis.com',
    matches: (p, body) => /:(stream)?[gG]enerateContent$/.test(p) || Array.isArray(body?.contents),
    targetEnv: (base) => ({
        GOOGLE_GEMINI_BASE_URL: base,
        GEMINI_API_KEY: FAKE_KEY,
        GOOGLE_API_KEY: FAKE_KEY,
    }),
    credential: () =>
        envCred('GEMINI_API_KEY', 'x-goog-api-key') ?? envCred('GOOGLE_API_KEY', 'x-goog-api-key'),
    streaming: (p, s) => p.includes(':streamGenerateContent') || /[?&]alt=sse\b/.test(s),

    build(reply, body, ids) {
        const n = normalizeReply(reply);
        const parts = n.kind === 'text'
            ? [{ text: n.text }]
            : n.calls.map((c) => ({ functionCall: { name: c.name, args: c.input } }));
        return {
            // Gemini reports STOP for a function call too; the parts say which.
            candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP', index: 0 }],
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
            modelVersion: body?.model ?? 'gemini-2.5-flash',
            responseId: ids.msg('resp_acdl'),
        };
    },

    // Gemini's stream is the same object, one SSE frame, no terminator sentinel.
    sse: (r) => `data: ${JSON.stringify(r)}\n\n`,
};

export const PROVIDERS: Record<ProviderId, Provider> = { anthropic, openai, google };

/** Which provider a request speaks, or undefined for a dialect we don't know. */
function detect(pathname: string, body: any): Provider | undefined {
    for (const p of Object.values(PROVIDERS)) if (p.matches(pathname, body)) return p;
    return undefined;
}

/** Infer the provider from a --base-url, so --provider is rarely needed. */
export function providerForUrl(url: string): ProviderId | undefined {
    let host = '';
    try { host = new URL(url).hostname; } catch { return undefined; }
    if (/anthropic/i.test(host)) return 'anthropic';
    if (/openai|azure/i.test(host)) return 'openai';
    if (/google|gemini/i.test(host)) return 'google';
    return undefined;
}

/**
 * Environment that redirects a target's SDK at us. Every mainstream SDK reads a
 * base-URL override; the fake key exists only because clients refuse to start
 * without one. All providers are redirected even when only one is being
 * forwarded, so a stray call to a second provider lands in the trace instead of
 * escaping to the network.
 */
export function targetEnv(port: number, only?: ProviderId): Record<string, string> {
    const base = `http://127.0.0.1:${port}`;
    const ps = only ? [PROVIDERS[only]] : Object.values(PROVIDERS);
    return Object.assign({}, ...ps.map((p) => p.targetEnv(base)));
}

// ------------------------------------------------------------------- server

/** Reply the target's SDK will surface as an error, for paths we refuse to serve. */
function errorBody(message: string) {
    return { type: 'error', error: { type: 'invalid_request_error', message } };
}

const SECRET_HEADERS = new Set([
    'authorization', 'x-api-key', 'x-goog-api-key', 'api-key', 'cookie', 'proxy-authorization',
]);

/** Headers are evidence -- beta flags, SDK version -- but must not carry secrets. */
function redactHeaders(h: http.IncomingHttpHeaders): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(h)) {
        if (v === undefined) continue;
        const s = Array.isArray(v) ? v.join(', ') : String(v);
        out[k] = SECRET_HEADERS.has(k.toLowerCase()) ? `<redacted:${s.length}>` : s;
    }
    return out;
}

/** Gemini passes its key in the query string, so the recorded URL needs scrubbing too. */
function redactUrl(u: string): string {
    return u.replace(/([?&](?:key|api_key|access_token)=)[^&]*/gi, '$1<redacted>');
}

function splitUrl(u: string): [string, string] {
    const i = u.indexOf('?');
    return i === -1 ? [u, ''] : [u.slice(0, i), u.slice(i)];
}

function safeJson(text: string): any {
    try { return text ? JSON.parse(text) : undefined; } catch { return undefined; }
}

/**
 * Upstream URL for an incoming request. `--base-url` may carry a path prefix
 * (`https://host/v1`); it is applied unless the request already includes it,
 * which is exactly what happens when the SDK was pointed at us with that prefix
 * already appended.
 */
export function joinUpstream(base: string, reqUrl: string): URL {
    const b = new URL(base);
    const prefix = b.pathname.replace(/\/+$/, '');
    const [p, search] = splitUrl(reqUrl);
    const full = prefix && p !== prefix && !p.startsWith(prefix + '/') ? prefix + p : p;
    const out = new URL(b.origin + full);
    out.search = search;
    return out;
}

export type ProxyOptions = {
    mode: Mode;
    tracePath: string;
    port: number;
    /** Scripted mode: the replies, and the cap on model calls. */
    scenario?: Scenario;
    /** Record mode: the real provider origin. Any provider; path is preserved. */
    baseUrl?: string;
    /** Replay mode: the calls to answer from. */
    replay?: CallRecord[];
    /** Overrides the scenario in scripted mode; the cap still applies. */
    responder?: Responder;
    /** Provider to forward to in record mode; detection still runs per request. */
    provider?: ProviderId;
    /** `targetEnv` is supplied by the proxy, which alone knows the bound port. */
    episode: Omit<Episode, 'targetEnv'>;
    verbose?: boolean;
};

export type ProxyHandle = {
    port: number;
    calls: () => number;
    modelCalls: () => number;
    close: (exitCode?: number) => Promise<void>;
};

export async function startProxy(opts: ProxyOptions): Promise<ProxyHandle> {
    const replies = expand(opts.scenario?.replies ?? []);
    const maxCalls = opts.scenario?.maxCalls ?? DEFAULT_MAX_CALLS;
    const ids = new Ids();
    const started = Date.now();
    let seq = 0, modelCalls = 0, unexpected = 0;

    fs.mkdirSync(path.dirname(path.resolve(opts.tracePath)), { recursive: true });
    const trace = fs.createWriteStream(opts.tracePath, { flags: 'w' });
    const write = (rec: TraceRecord) => trace.write(JSON.stringify(rec) + '\n');

    const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', async () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            const [pathname, search] = splitUrl(req.url ?? '/');
            const body = safeJson(raw);
            const provider = detect(pathname, body);

            const rec: CallRecord = {
                record: 'call',
                episode: opts.episode.episode,
                seq: ++seq,
                t: (Date.now() - started) / 1000,
                method: req.method ?? 'GET',
                path: redactUrl(req.url ?? '/'),
                provider: provider?.id,
                modelCall: provider !== undefined,
                headers: redactHeaders(req.headers),
                status: 200,
                contentType: 'application/json',
                streamed: false,
            };
            if (body !== undefined) rec.request = body;
            else if (raw) rec.requestRaw = raw.slice(0, 4000);

            if (provider) modelCalls++;
            else unexpected++;

            try {
                if (provider && modelCalls > maxCalls) {
                    send(res, 429, 'application/json',
                        JSON.stringify(errorBody(`acdl-verify: exceeded maxCalls=${maxCalls}`)), rec);
                } else if (opts.mode === 'replay') {
                    serveReplay(opts.replay ?? [], res, rec);
                } else if (opts.mode === 'record') {
                    await forward(opts, provider, req, raw, res, rec);
                } else if (!provider) {
                    // Not a model call in any dialect we synthesise. Recorded rather
                    // than dropped, so an unexpected endpoint is visible.
                    send(res, 404, 'application/json', JSON.stringify(errorBody(
                        `acdl-verify: no provider handles ${req.method} ${pathname}`)), rec);
                } else {
                    const reply = opts.responder
                        ? await opts.responder(body, modelCalls - 1)
                        : replies[modelCalls - 1];
                    const response = provider.build(reply, body, ids);
                    rec.response = response;
                    if (provider.streaming(pathname, search, body)) {
                        rec.streamed = true;
                        send(res, 200, 'text/event-stream', provider.sse(response), rec);
                    } else {
                        send(res, 200, 'application/json', JSON.stringify(response), rec);
                    }
                }
            } catch (e) {
                rec.error = (e as Error).message;
                if (!res.headersSent) {
                    send(res, 502, 'application/json',
                        JSON.stringify(errorBody(`acdl-verify: ${rec.error}`)), rec);
                } else {
                    res.end();
                }
            }

            write(rec);
            if (opts.verbose) {
                const what = rec.modelCall
                    ? `${(rec.request?.messages ?? rec.request?.contents ?? []).length} messages in, ` +
                      `${rec.status}${rec.streamed ? ' sse' : ''} out`
                    : `${rec.method} ${pathname} -> ${rec.status}`;
                console.error(`  [proxy] call ${rec.seq}: ${what}`);
            }
        });
    });

    await new Promise<void>((resolve) => server.listen(opts.port, '127.0.0.1', resolve));
    const port = (server.address() as any).port;

    const manifest: Manifest = {
        record: 'manifest',
        traceVersion: TRACE_VERSION,
        tool: 'acdl-verify/proxy',
        startedAt: new Date(started).toISOString(),
        mode: opts.mode,
        port,
        ...opts.episode,
        targetEnv: targetEnv(port, opts.provider),
    };
    write(manifest);

    return {
        port,
        calls: () => seq,
        modelCalls: () => modelCalls,
        close: (exitCode?: number) =>
            new Promise<void>((resolve) => {
                const summary: SummaryRecord = {
                    record: 'summary',
                    episode: opts.episode.episode,
                    endedAt: new Date().toISOString(),
                    durationMs: Date.now() - started,
                    calls: seq,
                    modelCalls,
                    unexpected,
                };
                if (exitCode !== undefined) summary.exitCode = exitCode;
                write(summary);
                trace.end(() => server.close(() => resolve()));
            }),
    };
}

function send(
    res: http.ServerResponse, status: number, type: string, payload: string, rec: CallRecord,
) {
    rec.status = status;
    rec.contentType = type;
    const headers: Record<string, string> = { 'content-type': type };
    if (type.startsWith('text/event-stream')) {
        headers['cache-control'] = 'no-cache';
        headers['connection'] = 'keep-alive';
    }
    res.writeHead(status, headers);
    res.end(payload);
}

// --------------------------------------------------------------- record mode

/**
 * Relay to the real provider and record both halves. Nothing here is
 * provider-specific: path, query, headers and body pass through untouched
 * except for the credential, which the target deliberately does not hold.
 */
async function forward(
    opts: ProxyOptions, provider: Provider | undefined,
    req: http.IncomingMessage, raw: string, res: http.ServerResponse, rec: CallRecord,
) {
    const declared = opts.provider ?? providerForUrl(opts.baseUrl!);
    if (provider && declared && provider.id !== declared) {
        // Forwarding an Anthropic request to an OpenAI origin would produce
        // garbage; refusing is the honest answer, and the trace shows it.
        send(res, 502, 'application/json', JSON.stringify(errorBody(
            `acdl-verify: target called ${provider.id} but --base-url is ${declared}`)), rec);
        return;
    }

    const url = joinUpstream(opts.baseUrl!, req.url ?? '/');
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
        if (v === undefined) continue;
        if (['host', 'content-length', 'connection', 'accept-encoding'].includes(k.toLowerCase())) continue;
        headers[k] = Array.isArray(v) ? v.join(', ') : String(v);
    }

    // The one place a real credential is used. The target never sees it.
    const cred = (provider ?? PROVIDERS[declared ?? 'anthropic']).credential();
    if (cred) {
        for (const k of SECRET_HEADERS) delete headers[k];
        headers[cred.header] = cred.value;
        if (url.searchParams.get('key') === FAKE_KEY) {
            url.searchParams.set('key', cred.value.replace(/^Bearer /, ''));
        }
    }

    const upstream = await fetch(url, {
        method: req.method,
        headers,
        body: raw || undefined,
    });
    const type = upstream.headers.get('content-type') ?? 'application/json';
    rec.status = upstream.status;
    rec.contentType = type;
    rec.streamed = type.includes('event-stream');

    res.writeHead(upstream.status, { 'content-type': type, 'cache-control': 'no-cache' });
    if (!upstream.body) { res.end(); return; }

    // Byte-for-byte passthrough: an SSE response has to reach the target as it
    // arrives, and the raw text is exactly what replay mode later serves back.
    const out: Buffer[] = [];
    const reader = upstream.body.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const buf = Buffer.from(value);
        out.push(buf);
        res.write(buf);
    }
    res.end();

    const text = Buffer.concat(out).toString('utf8');
    const parsed = rec.streamed ? undefined : safeJson(text);
    if (parsed !== undefined) rec.response = parsed;
    else rec.responseRaw = text;
}

// --------------------------------------------------------------- replay mode

/**
 * Answer call k with the bytes recorded for call k. Provider-agnostic by
 * construction, since we never interpret what we are serving -- and divergence
 * from the recorded request is reported rather than papered over.
 */
function serveReplay(recorded: CallRecord[], res: http.ServerResponse, rec: CallRecord) {
    const src = recorded[rec.seq - 1];
    if (!src) {
        send(res, 404, 'application/json', JSON.stringify(errorBody(
            `acdl-verify: recording has only ${recorded.length} call(s), target asked for ${rec.seq}`)), rec);
        return;
    }
    rec.replayOf = src.seq;
    if (JSON.stringify(src.request) !== JSON.stringify(rec.request)) rec.diverged = true;

    const payload = src.responseRaw ?? JSON.stringify(src.response ?? {});
    rec.streamed = src.streamed;
    if (src.response !== undefined) rec.response = src.response;
    if (src.responseRaw !== undefined) rec.responseRaw = src.responseRaw;
    send(res, src.status, src.contentType, payload, rec);
}

// ---------------------------------------------------------------------- CLI

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function args(name: string): string[] {
    const out: string[] = [];
    process.argv.forEach((a, i) => {
        if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
    });
    return out;
}

function flag(name: string): boolean {
    return process.argv.includes(`--${name}`);
}

function gitInfo(cwd: string): Episode['git'] {
    const git = (...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
    try {
        return {
            sha: git('rev-parse', 'HEAD'),
            branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
            dirty: git('status', '--porcelain').length > 0,
        };
    } catch {
        return undefined;   // not a checkout, or no git: not worth failing over
    }
}

/** `--var tier=premium` / `--vars file.json`, merged in that order. */
function collectVariables(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of args('vars')) Object.assign(out, JSON.parse(fs.readFileSync(f, 'utf8')));
    for (const kv of args('var')) {
        const i = kv.indexOf('=');
        if (i === -1) throw new Error(`--var expects key=value, got '${kv}'`);
        out[kv.slice(0, i)] = kv.slice(i + 1);
    }
    return out;
}

const USAGE = `Usage: bun run acdl-verify/proxy.ts <mode> [options]

  scripted   --scenario <file.json>        replies come from the scenario
  record     --base-url <url>              replies come from the real provider
  replay     --replay <trace.jsonl>        replies come from a previous recording
  live       --live <model>                 replies come from a real model via the
                                            Claude Code binary, on a subscription

Options:
  --run <command>     drive one episode; without it the proxy just serves
  --out <trace.jsonl> default acdl-verify/traces/<episode>.jsonl
  --episode <id>      default <scenario|mode>-<timestamp>
  --provider <id>     anthropic | openai | google (inferred from --base-url)
  --port <n>          default 8931; 0 picks a free port
  --var k=v           controlled variable for this episode (repeatable)
  --vars <file.json>  the same, as a JSON object
  --max-calls <n>     override the scenario cap
  --quiet             no per-call logging`;

async function main() {
    const scenarioPath = arg('scenario');
    const baseUrl = arg('base-url') ?? arg('upstream');   // --upstream: v1 spelling
    const replayPath = arg('replay');

    const live = arg('live');
    const mode: Mode | undefined =
        replayPath ? 'replay' : baseUrl ? 'record'
        : (scenarioPath || live) ? 'scripted' : undefined;
    if (!mode) { console.error(USAGE); process.exit(2); }

    // A live responder still runs in scripted mode: the proxy composes the reply
    // rather than forwarding, so the target never reaches the network and the
    // trace shape is identical to a scripted run.
    let responder;
    if (live) {
        const exe = process.env.CLAUDE_CODE_EXECPATH;
        if (!exe) { console.error('--live needs CLAUDE_CODE_EXECPATH set'); process.exit(2); }
        const { haikuResponder, liveResponder } = await import('./responder');
        const { claudeCliTransport } = await import('./discover');
        responder = live === 'haiku'
            ? haikuResponder(exe, { maxTurns: Number(arg('max-turns', '8')) })
            : liveResponder({
                transport: claudeCliTransport({ exe, model: live, allowedTools: [] }),
                maxTurns: Number(arg('max-turns', '8')),
            });
    }

    let scenario: Scenario | undefined;
    let scenarioMeta: Episode['scenario'];
    if (scenarioPath) {
        const text = fs.readFileSync(scenarioPath, 'utf8');
        scenario = JSON.parse(text);
        scenarioMeta = {
            name: scenario!.name,
            path: scenarioPath,
            replies: expand(scenario!.replies).length,
            sha256: crypto.createHash('sha256').update(text).digest('hex').slice(0, 16),
        };
    }
    const maxCalls = arg('max-calls');
    if (maxCalls) scenario = { name: 'ad-hoc', replies: [], ...scenario, maxCalls: Number(maxCalls) };

    let replay: CallRecord[] | undefined;
    let replayMeta: Episode['replayFrom'];
    if (replayPath) {
        replay = readTrace(replayPath).calls;
        replayMeta = { path: replayPath, calls: replay.length };
    }

    const named = arg('provider');
    if (named && !(named in PROVIDERS)) {
        console.error(`unknown --provider '${named}'; expected one of ${Object.keys(PROVIDERS).join(', ')}`);
        process.exit(2);
    }
    const provider = (named as ProviderId | undefined)
        ?? (baseUrl ? providerForUrl(baseUrl) : undefined);
    if (mode === 'record' && !provider) {
        console.error(
            `--base-url '${baseUrl}' is not a host I recognise; pass --provider so the right\n` +
            `credential and base-URL variable are used. Traffic still forwards verbatim.`);
    }

    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const episodeId = arg('episode', `${scenario?.name ?? mode}-${stamp}`)!;
    const tracePath = arg('out', `acdl-verify/traces/${episodeId}.jsonl`)!;
    const cwd = process.cwd();
    const variables = collectVariables();

    // Port 0 means "any free port", which is what a matrix runner wants.
    const requested = Number(arg('port', '8931'));

    const proxy = await startProxy({
        mode, tracePath, port: requested, scenario, baseUrl, replay, provider, responder,
        verbose: !flag('quiet'),
        episode: {
            episode: episodeId,
            cwd,
            run: arg('run'),
            variables,
            provider: provider ?? 'any',
            baseUrl,
            scenario: scenarioMeta,
            replayFrom: replayMeta,
            git: gitInfo(cwd),
        },
    });

    const injected = targetEnv(proxy.port, provider);

    console.error(
        `acdl-verify proxy [${mode}] on http://127.0.0.1:${proxy.port}` +
        (baseUrl ? ` -> ${baseUrl}` : '') + `\n  trace: ${tracePath}  episode: ${episodeId}` +
        (Object.keys(variables).length
            ? `\n  vars:  ${Object.entries(variables).map(([k, v]) => `${k}=${v}`).join(' ')}`
            : ''));

    let run = arg('run');
    if (!run) {
        console.error('No --run given; serving until interrupted.');
        return;
    }
    // {port} and {var} placeholders, so a matrix runner can vary the command too.
    run = run.replace(/\{port\}/g, String(proxy.port));
    for (const [k, v] of Object.entries(variables)) run = run.split(`{${k}}`).join(v);

    // Re-quote for this platform unless the command wants a shell for more than
    // word splitting: cmd.exe does not treat `'` as a quote, so a POSIX-style
    // `--run 'node x.js'` would otherwise reach the target with quotes attached
    // and the file would not be found.
    const { tokenize, buildCommand, needsShell } = await import('./runner');
    if (!needsShell(run)) run = buildCommand(tokenize(run));

    console.error(`running: ${run}`);
    const code = await new Promise<number>((resolve) => {
        const child = spawn(run!, {
            shell: true,
            stdio: 'inherit',
            env: { ...process.env, ...injected },
        });
        child.on('exit', (c) => resolve(c ?? 0));
    });

    await proxy.close(code);
    console.error(
        `target exited ${code}; recorded ${proxy.modelCalls()} model call(s) ` +
        `of ${proxy.calls()} request(s) to ${tracePath}`);
    process.exit(code);
}

if (import.meta.main) await main();
