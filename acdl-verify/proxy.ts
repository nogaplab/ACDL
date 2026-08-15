// acdl-verify recording proxy.
//
// Stands between an agent and its model provider. Every request is appended to a
// JSONL trace; the reply comes from a scenario file instead of the network, so the
// run is free, offline, and deterministic -- and the scenario decides where the
// agent's loop goes.
//
//   bun run acdl-verify/proxy.ts --scenario s.json --out traces/s.jsonl \
//       --run 'python acdl-agent/acdl-agent.py --target foo'
//
// With --upstream it forwards to the real provider and records both halves
// instead (record mode, the one mode that costs money).

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

// ---------------------------------------------------------------- scenarios

/** One scripted model reply. `tool`/`tools` produce tool_use, `text` ends the turn. */
export type Reply =
    | { tool: string; input?: Record<string, unknown>; repeat?: number }
    | { tools: Array<{ name: string; input?: Record<string, unknown> }>; repeat?: number }
    | { text: string; repeat?: number };

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

// ---------------------------------------------------------------- responses

let toolUseCounter = 0;

/** Build an Anthropic Messages response body for one scripted reply. */
function buildResponse(reply: Reply | undefined, requestBody: any) {
    const model = requestBody?.model ?? 'claude-opus-5';
    let content: unknown[];
    let stopReason: string;

    if (reply === undefined || 'text' in reply) {
        content = [{ type: 'text', text: reply === undefined ? 'done' : reply.text }];
        stopReason = 'end_turn';
    } else {
        const calls = 'tools' in reply
            ? reply.tools
            : [{ name: reply.tool, input: reply.input }];
        content = calls.map((c) => ({
            type: 'tool_use',
            id: `toolu_acdl${String(++toolUseCounter).padStart(4, '0')}`,
            name: c.name,
            input: c.input ?? {},
        }));
        stopReason = 'tool_use';
    }

    return {
        id: `msg_acdl${String(toolUseCounter).padStart(4, '0')}`,
        type: 'message',
        role: 'assistant',
        model,
        content,
        stop_reason: stopReason,
        stop_sequence: null,
        // Constants: the target may read these, but nothing structural depends on them.
        usage: { input_tokens: 1, output_tokens: 1 },
    };
}

/** Reply the target's SDK will surface as an error, for paths we refuse to serve. */
function errorBody(message: string) {
    return { type: 'error', error: { type: 'invalid_request_error', message } };
}

// ------------------------------------------------------------------- server

export type ProxyOptions = {
    scenario: Scenario;
    tracePath: string;
    port: number;
    /** When set, forward to this origin and record the real response (record mode). */
    upstream?: string;
    verbose?: boolean;
};

export type ProxyHandle = {
    port: number;
    calls: () => number;
    close: () => Promise<void>;
};

export async function startProxy(opts: ProxyOptions): Promise<ProxyHandle> {
    const replies = expand(opts.scenario.replies);
    const maxCalls = opts.scenario.maxCalls ?? DEFAULT_MAX_CALLS;
    const started = Date.now();
    let seq = 0;

    fs.mkdirSync(path.dirname(path.resolve(opts.tracePath)), { recursive: true });
    const trace = fs.createWriteStream(opts.tracePath, { flags: 'w' });

    const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', async () => {
            const raw = Buffer.concat(chunks).toString('utf8');

            // Anything that is not a model call passes through untouched-but-refused;
            // we record it so an unexpected endpoint is visible rather than silent.
            let body: any;
            try {
                body = raw ? JSON.parse(raw) : undefined;
            } catch {
                body = undefined;
            }
            const isModelCall = req.method === 'POST' && body && Array.isArray(body.messages);

            if (!isModelCall) {
                trace.write(JSON.stringify({
                    seq: ++seq, t: (Date.now() - started) / 1000,
                    unexpected: true, method: req.method, path: req.url,
                    raw: raw.slice(0, 2000),
                }) + '\n');
                res.writeHead(404, { 'content-type': 'application/json' });
                res.end(JSON.stringify(errorBody(`acdl-verify: unhandled ${req.method} ${req.url}`)));
                return;
            }

            const n = ++seq;
            if (n > maxCalls) {
                res.writeHead(429, { 'content-type': 'application/json' });
                res.end(JSON.stringify(errorBody(`acdl-verify: exceeded maxCalls=${maxCalls}`)));
                return;
            }

            let response: any;
            if (opts.upstream) {
                response = await forward(opts.upstream, req, raw);
            } else {
                response = buildResponse(replies[n - 1], body);
            }

            // The record: the exact request the agent built, and what it got back.
            trace.write(JSON.stringify({
                seq: n,
                t: (Date.now() - started) / 1000,
                path: req.url,
                request: body,
                response,
            }) + '\n');

            if (opts.verbose) {
                const kind = response?.stop_reason ?? 'forwarded';
                console.error(`  [proxy] call ${n}: ${body.messages.length} messages in, ${kind} out`);
            }

            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(response));
        });
    });

    await new Promise<void>((resolve) => server.listen(opts.port, '127.0.0.1', resolve));

    return {
        port: (server.address() as any).port,
        calls: () => seq,
        close: () =>
            new Promise<void>((resolve) => {
                trace.end(() => server.close(() => resolve()));
            }),
    };
}

/** Record mode: relay the call to the real provider, headers and all. */
async function forward(upstream: string, req: http.IncomingMessage, raw: string) {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
        if (k === 'host' || k === 'content-length' || v === undefined) continue;
        headers[k] = Array.isArray(v) ? v.join(', ') : v;
    }
    const r = await fetch(new URL(req.url ?? '/', upstream), {
        method: req.method, headers, body: raw,
    });
    return await r.json();
}

// ---------------------------------------------------------------------- CLI

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * Environment that redirects a target's SDK at us. Every mainstream SDK reads a
 * base-URL override; the fake key exists only because clients refuse to start
 * without one.
 */
export function targetEnv(port: number): Record<string, string> {
    const base = `http://127.0.0.1:${port}`;
    return {
        ANTHROPIC_BASE_URL: base,
        ANTHROPIC_API_KEY: 'acdl-verify-not-a-real-key',
        OPENAI_BASE_URL: `${base}/v1`,
        OPENAI_API_KEY: 'acdl-verify-not-a-real-key',
    };
}

async function main() {
    const scenarioPath = arg('scenario');
    if (!scenarioPath) {
        console.error(
            'Usage: bun run acdl-verify/proxy.ts --scenario <file.json> [--out <trace.jsonl>]\n' +
            '                                    [--run <command>] [--port N] [--upstream URL]');
        process.exit(1);
    }
    const scenario: Scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
    const tracePath = arg('out', `acdl-verify/traces/${scenario.name}.jsonl`)!;
    const port = Number(arg('port', '8931'));

    const proxy = await startProxy({
        scenario, tracePath, port,
        upstream: arg('upstream'),
        verbose: true,
    });
    console.error(`acdl-verify proxy on http://127.0.0.1:${proxy.port} -> ${tracePath}`);

    const run = arg('run');
    if (!run) {
        console.error('No --run given; serving until interrupted.');
        return;
    }

    console.error(`running: ${run}`);
    const code = await new Promise<number>((resolve) => {
        const child = spawn(run, {
            shell: true,
            stdio: 'inherit',
            env: { ...process.env, ...targetEnv(proxy.port) },
        });
        child.on('exit', (c) => resolve(c ?? 0));
    });

    await proxy.close();
    console.error(`target exited ${code}; recorded ${proxy.calls()} calls to ${tracePath}`);
    process.exit(code);
}

if (import.meta.main) await main();
