// bun test acdl-verify/proxy.test.ts
//
// Pins the two things the proxy promises: a scripted reply comes back in the
// dialect the target asked in (streamed or not), and the trace is self-describing.

import { test, expect, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import {
    startProxy, readTrace, joinUpstream, targetEnv, providerForUrl, FAKE_KEY,
    type ProxyHandle, type Scenario,
} from './proxy';

const SCENARIO: Scenario = {
    name: 'unit',
    replies: [{ tool: 'read_file', input: { path: 'a.py' } }, { text: 'done' }],
};

let dir = '';
let proxy: ProxyHandle | undefined;

afterEach(async () => {
    await proxy?.close(0);
    proxy = undefined;
});

async function open(overrides: Partial<Parameters<typeof startProxy>[0]> = {}) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acdl-verify-'));
    const tracePath = path.join(dir, 'trace.jsonl');
    proxy = await startProxy({
        mode: 'scripted', scenario: SCENARIO, tracePath, port: 0,
        episode: { episode: 'unit-1', cwd: dir, variables: { tier: 'premium' }, provider: 'any' },
        ...overrides,
    } as Parameters<typeof startProxy>[0]);
    return { tracePath, url: (p: string) => `http://127.0.0.1:${proxy!.port}${p}` };
}

const post = (url: string, body: unknown) =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// ------------------------------------------------------------------ dialects

test('anthropic: scripted tool_use', async () => {
    const { url } = await open();
    const r = await post(url('/v1/messages'), { model: 'claude-haiku-4-5-20251001', messages: [{ role: 'user', content: 'hi' }] });
    const body = await r.json();

    expect(body.type).toBe('message');
    expect(body.stop_reason).toBe('tool_use');
    expect(body.content[0]).toMatchObject({ type: 'tool_use', name: 'read_file', input: { path: 'a.py' } });
});

test('anthropic: stream:true gets SSE, not JSON', async () => {
    const { url } = await open();
    const r = await post(url('/v1/messages'), { messages: [{ role: 'user', content: 'hi' }], stream: true });

    expect(r.headers.get('content-type')).toBe('text/event-stream');
    const text = await r.text();
    expect(text).toContain('event: message_start');
    expect(text).toContain('"type":"input_json_delta"');
    expect(text).toContain('event: message_stop');
    // The tool input must survive reassembly, or the SDK sees an empty call.
    const frames = text.split('\n').filter((l) => l.startsWith('data: '))
        .map((l) => JSON.parse(l.slice(6)));
    const delta = frames.find((f) => f.delta?.type === 'input_json_delta');
    expect(JSON.parse(delta.delta.partial_json)).toEqual({ path: 'a.py' });
});

test('openai: same scenario, chat.completion shape', async () => {
    const { url } = await open();
    const r = await post(url('/v1/chat/completions'), { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] });
    const body = await r.json();

    expect(body.object).toBe('chat.completion');
    expect(body.choices[0].finish_reason).toBe('tool_calls');
    expect(body.choices[0].message.tool_calls[0].function).toEqual({
        name: 'read_file', arguments: '{"path":"a.py"}',
    });
});

test('openai: streaming ends with [DONE]', async () => {
    const { url } = await open();
    const r = await post(url('/v1/chat/completions'), { messages: [], stream: true });
    const text = await r.text();

    expect(text).toContain('"object":"chat.completion.chunk"');
    expect(text.trimEnd().endsWith('data: [DONE]')).toBe(true);
});

test('google: same scenario, functionCall shape', async () => {
    const { url } = await open();
    const r = await post(
        url('/v1beta/models/gemini-2.5-flash:generateContent'),
        { contents: [{ role: 'user', parts: [{ text: 'hi' }] }] });
    const body = await r.json();

    expect(body.candidates[0].content.parts[0].functionCall).toEqual({
        name: 'read_file', args: { path: 'a.py' },
    });
});

test('google: alt=sse is recognised as streaming', async () => {
    const { url } = await open();
    const r = await post(url('/v1beta/models/x:streamGenerateContent?alt=sse'), { contents: [] });

    expect(r.headers.get('content-type')).toBe('text/event-stream');
    expect(await r.text()).toStartWith('data: {');
});

// -------------------------------------------------------------------- trace

test('trace opens with a manifest and closes with a summary', async () => {
    const { url, tracePath } = await open();
    await post(url('/v1/messages'), { messages: [] });
    await proxy!.close(0);
    proxy = undefined;

    const lines = fs.readFileSync(tracePath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const [manifest, call, summary] = lines;

    expect(manifest).toMatchObject({
        record: 'manifest', traceVersion: 2, mode: 'scripted',
        episode: 'unit-1', variables: { tier: 'premium' },
    });
    expect(manifest.targetEnv.ANTHROPIC_BASE_URL).toContain('127.0.0.1');
    expect(call).toMatchObject({ record: 'call', seq: 1, modelCall: true, provider: 'anthropic' });
    expect(summary).toMatchObject({ record: 'summary', calls: 1, modelCalls: 1, exitCode: 0 });

    expect(readTrace(tracePath).calls).toHaveLength(1);
    expect(readTrace(tracePath).manifest!.episode).toBe('unit-1');
});

test('credentials are redacted, unknown endpoints are recorded not dropped', async () => {
    const { url, tracePath } = await open();
    await fetch(url('/v1/messages'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': 'sk-ant-secret', 'anthropic-beta': 'tools-2024' },
        body: JSON.stringify({ messages: [] }),
    });
    const missed = await post(url('/v1/embeddings'), { input: 'x' });
    await proxy!.close(0);
    proxy = undefined;

    const { calls } = readTrace(tracePath);
    expect(calls[0].headers['x-api-key']).toBe('<redacted:13>');
    expect(calls[0].headers['anthropic-beta']).toBe('tools-2024');   // evidence, kept

    expect(missed.status).toBe(404);
    expect(calls[1]).toMatchObject({ modelCall: false, status: 404, path: '/v1/embeddings' });
});

test('replay serves recorded bytes back and flags divergence', async () => {
    const first = await open();
    await post(first.url('/v1/messages'), { messages: [{ role: 'user', content: 'hi' }] });
    await proxy!.close(0);
    const recorded = readTrace(first.tracePath).calls;

    const second = await open({ mode: 'replay', replay: recorded, scenario: undefined });
    const same = await post(second.url('/v1/messages'), { messages: [{ role: 'user', content: 'hi' }] });
    const other = await post(second.url('/v1/messages'), { messages: [{ role: 'user', content: 'CHANGED' }] });
    await proxy!.close(0);
    proxy = undefined;

    expect((await same.json()).content[0].name).toBe('read_file');
    expect(other.status).toBe(404);   // recording holds one call

    const replayed = readTrace(second.tracePath).calls;
    expect(replayed[0].replayOf).toBe(1);
    expect(replayed[0].diverged).toBeUndefined();
});

// --------------------------------------------------------------- record mode

/** A stand-in provider, so forwarding is tested without touching the network. */
async function upstream(handler: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void) {
    const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => handler(req, res, Buffer.concat(chunks).toString('utf8')));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    return {
        url: `http://127.0.0.1:${(server.address() as any).port}`,
        close: () => new Promise<void>((r) => { server.close(() => r()); }),
    };
}

test('record: forwards verbatim, swaps in the real credential, records both halves', async () => {
    let seenKey: string | undefined;
    let seenPath: string | undefined;
    const up = await upstream((req, res) => {
        seenKey = req.headers['x-api-key'] as string;
        seenPath = req.url;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: 'msg_real', content: [{ type: 'text', text: 'upstream said this' }] }));
    });

    const prev = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-real';
    try {
        const { url, tracePath } = await open({
            mode: 'record', baseUrl: up.url, provider: 'anthropic', scenario: undefined,
        });
        const r = await fetch(url('/v1/messages'), {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': 'acdl-verify-not-a-real-key' },
            body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
        });
        expect((await r.json()).content[0].text).toBe('upstream said this');
        await proxy!.close(0);
        proxy = undefined;

        expect(seenPath).toBe('/v1/messages');
        expect(seenKey).toBe('sk-ant-real');   // the target never held this

        const { calls } = readTrace(tracePath);
        expect(calls[0].request.messages).toHaveLength(1);
        expect(calls[0].response.id).toBe('msg_real');
        expect(calls[0].headers['x-api-key']).toBe(`<redacted:${FAKE_KEY.length}>`);
    } finally {
        if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
        else process.env.ANTHROPIC_API_KEY = prev;
        await up.close();
    }
});

test('record: an SSE response streams through and is kept raw for replay', async () => {
    const up = await upstream((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('event: message_start\ndata: {"type":"message_start"}\n\n');
        res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
    });
    try {
        const { url, tracePath } = await open({
            mode: 'record', baseUrl: up.url, provider: 'anthropic', scenario: undefined,
        });
        const r = await post(url('/v1/messages'), { messages: [], stream: true });
        expect(r.headers.get('content-type')).toBe('text/event-stream');
        expect(await r.text()).toContain('event: message_stop');
        await proxy!.close(0);
        proxy = undefined;

        const call = readTrace(tracePath).calls[0];
        expect(call.streamed).toBe(true);
        expect(call.responseRaw).toContain('event: message_start');
        expect(call.response).toBeUndefined();   // raw bytes are the record
    } finally {
        await up.close();
    }
});

test('record: refuses to forward one provider to another provider origin', async () => {
    const up = await upstream((_req, res) => { res.writeHead(200).end('{}'); });
    try {
        const { url } = await open({
            mode: 'record', baseUrl: up.url, provider: 'openai', scenario: undefined,
        });
        const r = await post(url('/v1/messages'), { messages: [] });
        expect(r.status).toBe(502);
        expect((await r.json()).error.message).toContain('target called anthropic');
    } finally {
        await up.close();
    }
});

test('maxCalls caps the episode', async () => {
    const { url } = await open({ scenario: { ...SCENARIO, maxCalls: 1 } });
    expect((await post(url('/v1/messages'), { messages: [] })).status).toBe(200);
    expect((await post(url('/v1/messages'), { messages: [] })).status).toBe(429);
});

// -------------------------------------------------------------------- units

test('joinUpstream applies a base path without doubling it', () => {
    const j = (b: string, p: string) => joinUpstream(b, p).toString();
    expect(j('https://api.anthropic.com', '/v1/messages')).toBe('https://api.anthropic.com/v1/messages');
    expect(j('https://api.openai.com/v1', '/v1/chat/completions')).toBe('https://api.openai.com/v1/chat/completions');
    expect(j('https://gw.internal/proxy', '/v1/messages')).toBe('https://gw.internal/proxy/v1/messages');
    expect(j('https://x.dev', '/m:generateContent?alt=sse')).toBe('https://x.dev/m:generateContent?alt=sse');
});

test('provider inference and target env', () => {
    expect(providerForUrl('https://api.anthropic.com')).toBe('anthropic');
    expect(providerForUrl('https://generativelanguage.googleapis.com')).toBe('google');
    expect(providerForUrl('https://llm.corp.internal/v1')).toBeUndefined();

    expect(targetEnv(8931, 'openai')).toEqual({
        OPENAI_BASE_URL: 'http://127.0.0.1:8931/v1',
        OPENAI_API_KEY: 'acdl-verify-not-a-real-key',
    });
    // With no provider named, every SDK is redirected so nothing escapes.
    expect(Object.keys(targetEnv(1))).toContain('GOOGLE_GEMINI_BASE_URL');
});
