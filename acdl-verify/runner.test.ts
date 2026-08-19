// bun test acdl-verify/runner.test.ts
//
// The runner is the deterministic half of verification, so it is tested with a
// hand-written recipe and no model anywhere: an episode really is spawned, it
// really posts through the proxy, and the trace really comes back.

import { test, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    runEpisode, runMatrix, cells, locate, signature, shape, substitute,
    baseline, scrub, envName, EMPTY_MASK, TIME,
    tokenize, quoteArg, buildCommand, needsShell,
} from './runner';
import { canary } from './verify';
import type { CallRecord, Scenario } from './proxy';
import type { Recipe } from './bindings';

const SCENARIO: Scenario = { name: 't', replies: [{ text: 'ok', repeat: 3 }], maxCalls: 4 };

/** A driver that posts a fixed shape, with the value dropped where asked. */
const driver = (body: string): Recipe => ({
    language: 'node',
    entry: 'h.mjs',
    program: `
const value = process.env.ACDL_VALUE;
const base = process.env.ANTHROPIC_BASE_URL;
await fetch(base + '/v1/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(${body}),
});
`,
    env: { ACDL_VALUE: '{value}' },
    args: [],
    stdin: '',
});

function tmp(name: string) {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'acdl-run-')), name);
}

const call = (request: unknown): CallRecord => ({
    record: 'call', episode: 'e', seq: 1, t: 0, method: 'POST', path: '/v1/messages',
    modelCall: true, headers: {}, request, status: 200,
    contentType: 'application/json', streamed: false,
});

// -------------------------------------------------------------- unit parts

test('substitution fills {value} and every named axis', () => {
    const a = { 'env.tier': 'X', time: '3' };
    expect(substitute('a{value}b{value}', a, 'env.tier')).toBe('aXbX');
    expect(substitute('turn={time} tier={env.tier}', a, 'env.tier')).toBe('turn=3 tier=X');
    expect(substitute('none here', a, 'env.tier')).toBe('none here');
});

test('an axis name becomes a readable environment variable', () => {
    expect(envName('env.customer_tier')).toBe('ACDL_ENV_CUSTOMER_TIER');
    expect(envName(TIME)).toBe('ACDL_TIME');
});

test('a canary is deterministic per key and distinct across keys', () => {
    expect(canary('env.tier')).toBe(canary('env.tier'));
    expect(canary('env.tier')).not.toBe(canary('env.name'));
    expect(canary('env.tier')).toMatch(/^ACDLV[0-9A-F]{8}$/);
});

test('locate reports role, index and field', () => {
    const c = call({
        system: 'tier is NEEDLE',
        messages: [
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: [{ type: 'text', text: 'saw NEEDLE' }] },
        ],
    });
    expect(locate(c, 'NEEDLE')).toEqual([
        { message: -1, role: 'system', field: 'system' },
        { message: 1, role: 'assistant', field: 'content[0].text' },
    ]);
    expect(locate(c, 'ABSENT')).toEqual([]);
});

test('shape is the role sequence, with tool results split out', () => {
    expect(shape(call({ system: 's', messages: [{ role: 'user', content: 'u' }] }))).toBe('S U');
    expect(shape(call({
        messages: [
            { role: 'assistant', content: [{ type: 'tool_use', name: 'f', input: {} }] },
            { role: 'user', content: [{ type: 'tool_result' }, { type: 'tool_result' }] },
        ],
    }))).toBe('A T T');
});

test('signature keeps text and drops masked paths', () => {
    const a = call({ messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] });
    const b = call({ messages: [{ role: 'user', content: [{ type: 'text', text: 'y' }] }] });
    // Block `type` is kept on purpose: text turning into tool_use is a real change.
    expect(signature(a).split(/\n/)).toEqual([
        'user[0].content[0].type = text',
        'user[0].content[0].text = x',
    ]);
    expect(signature(a)).not.toBe(signature(b));

    const mask = { paths: new Set(['user[0].content[0].text']), sources: 2 };
    expect(signature(a, mask)).toBe(signature(b, mask));
});

test('volatile shapes are scrubbed before anything is compared', () => {
    expect(scrub('id 550e8400-e29b-41d4-a716-446655440000 at 2026-08-19T12:00:00Z'))
        .toBe('id <uuid> at <timestamp>');
    expect(scrub('msg_01ABCDEFGH and toolu_9ZYXWVUT')).toBe('<id> and <id>');
    expect(scrub('tier: premium')).toBe('tier: premium');
});

test('the baseline flags exactly the paths that moved between identical runs', () => {
    const mk = (greeting: string, stamp: string) => ({
        calls: [call({ messages: [
            { role: 'user', content: [{ type: 'text', text: greeting }] },
            { role: 'user', content: [{ type: 'text', text: stamp }] },
        ] })],
    }) as any;

    const mask = baseline([mk('hello', 'run A'), mk('hello', 'run B')]);
    expect([...mask.paths]).toEqual(['user[1].content[0].text']);
    expect(mask.sources).toBe(2);

    // A uuid that differs is scrubbed first, so it never reaches the mask.
    const u1 = mk('hello', 'id 550e8400-e29b-41d4-a716-446655440000');
    const u2 = mk('hello', 'id 660e8400-e29b-41d4-a716-446655440111');
    expect([...baseline([u1, u2]).paths]).toEqual([]);
});

test('a single run cannot establish a baseline', () => {
    expect(baseline([]).paths.size).toBe(0);
    expect(baseline([{ calls: [] } as any]).sources).toBe(1);
});

test('cells is the cartesian product, with fixed values carried into each', () => {
    expect(cells({ time: ['1', '2'], tier: ['a', 'b'] }, { run: 'x' })).toEqual([
        { run: 'x', time: '1', tier: 'a' }, { run: 'x', time: '1', tier: 'b' },
        { run: 'x', time: '2', tier: 'a' }, { run: 'x', time: '2', tier: 'b' },
    ]);
    expect(cells({})).toEqual([{}]);
});

// ---------------------------------------------------------- real episodes

test('an episode runs the recipe and the value reaches the recorded request', async () => {
    const value = canary('env.demo');
    const r = await runEpisode({
        targetRoot: process.cwd(),
        tracePath: tmp('e.jsonl'),
        episode: 'unit-1',
        scenario: SCENARIO,
        recipe: driver(`{ model: 'm', max_tokens: 8, system: 'tier: ' + value,
                          messages: [{ role: 'user', content: 'hi' }] }`),
        assignments: { 'env.demo': value },
        primary: 'env.demo',
    });

    expect(r.exitCode).toBe(0);
    expect(r.calls).toHaveLength(1);
    expect(locate(r.calls[0], value)).toEqual([{ message: -1, role: 'system', field: 'system' }]);
});

test('the assignment is recorded in the trace manifest as the independent variable', async () => {
    const trace = tmp('e.jsonl');
    await runEpisode({
        targetRoot: process.cwd(), tracePath: trace, episode: 'unit-2', scenario: SCENARIO,
        recipe: driver(`{ model: 'm', max_tokens: 8, messages: [{ role: 'user', content: value }] }`),
        assignments: { 'env.customer_tier': 'premium' }, primary: 'env.customer_tier',
    });
    const manifest = JSON.parse(fs.readFileSync(trace, 'utf8').split('\n')[0]);
    expect(manifest.variables).toEqual({ 'env.customer_tier': 'premium' });
});

test('two values produce two shapes when the driver branches on the value', async () => {
    // Stands in for a conditional target: the extra system message appears only
    // for one arm, which is exactly the signal a differential looks for.
    const branching = driver(`{ model: 'm', max_tokens: 8,
        messages: value === 'premium'
            ? [{ role: 'user', content: 'hi' }, { role: 'system', content: 'NOTICE' }]
            : [{ role: 'user', content: 'hi' }] }`);

    const shapes: string[] = [];
    for (const value of ['premium', 'basic']) {
        const r = await runEpisode({
            targetRoot: process.cwd(), tracePath: tmp(`${value}.jsonl`), episode: value,
            scenario: SCENARIO, recipe: branching,
            assignments: { 'env.customer_tier': value }, primary: 'env.customer_tier',
        });
        shapes.push(r.calls.map(shape).join(''));
    }
    expect(shapes).toEqual(['U S', 'U']);
});

test('a recipe that sends nothing yields no calls rather than throwing', async () => {
    const r = await runEpisode({
        targetRoot: process.cwd(), tracePath: tmp('e.jsonl'), episode: 'silent',
        scenario: SCENARIO,
        recipe: { language: 'node', entry: 'h.mjs', program: 'process.exit(0);', env: {}, args: [], stdin: '' },
        assignments: { 'env.x': 'x' }, primary: 'env.x',
    });
    expect(r.calls).toHaveLength(0);
    expect(r.exitCode).toBe(0);
});

test('a crashing recipe surfaces its stderr instead of hanging', async () => {
    const r = await runEpisode({
        targetRoot: process.cwd(), tracePath: tmp('e.jsonl'), episode: 'boom',
        scenario: SCENARIO,
        recipe: { language: 'node', entry: 'h.mjs', program: 'throw new Error("nope");', env: {}, args: [], stdin: '' },
        assignments: { 'env.x': 'x' }, primary: 'env.x',
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('nope');
    expect(r.calls).toHaveLength(0);
});

test('a language:none recipe drives the target entrypoint and needs a run command', async () => {
    const bare: Recipe = { language: 'none', entry: '', program: '', env: {}, args: [], stdin: '' };
    await expect(runEpisode({
        targetRoot: process.cwd(), tracePath: tmp('e.jsonl'), episode: 'none',
        scenario: SCENARIO, recipe: bare, assignments: { 'env.x': 'x' }, primary: 'env.x',
    })).rejects.toThrow('needs a --run command');
});

test('a matrix runs every cell and stamps each with its own assignment', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acdl-matrix-'));
    const runs = await runMatrix({
        targetRoot: process.cwd(), traceDir: dir, name: 'sweep', scenario: SCENARIO,
        // The driver echoes the turn back, so each cell is distinguishable.
        recipe: driver(`{ model: 'm', max_tokens: 8,
            messages: [{ role: 'user', content: 'turn ' + process.env.ACDL_TIME }] }`),
        axes: { [TIME]: ['1', '2', '3'] },
        fixed: { 'env.tier': 'premium' },
        primary: 'env.tier',
    });

    expect(runs).toHaveLength(3);
    expect(runs.map((r) => r.assignments[TIME])).toEqual(['1', '2', '3']);
    expect(runs.every((r) => r.assignments['env.tier'] === 'premium')).toBe(true);
    expect(runs.map((r) => signature(r.calls[0]).split(/\n/).pop())).toEqual([
        'user[0].content = turn 1', 'user[0].content = turn 2', 'user[0].content = turn 3',
    ]);
});

test('repeats of one cell are what the nondeterminism baseline consumes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acdl-repeat-'));
    const runs = await runMatrix({
        targetRoot: process.cwd(), traceDir: dir, name: 'noise', scenario: SCENARIO,
        // Stands in for a live model: one field is stable, one drifts every run.
        recipe: driver(`{ model: 'm', max_tokens: 8, messages: [
            { role: 'user', content: 'stable' },
            { role: 'user', content: 'drift ' + Math.random() }] }`),
        axes: {}, fixed: { 'env.x': 'x' }, primary: 'env.x', repeats: 3,
    });

    expect(runs).toHaveLength(3);
    const mask = baseline(runs);
    expect([...mask.paths]).toEqual(['user[1].content']);

    // With the drift masked, the two runs compare equal; without it, they do not.
    expect(signature(runs[0].calls[0], mask)).toBe(signature(runs[1].calls[0], mask));
    expect(signature(runs[0].calls[0], EMPTY_MASK))
        .not.toBe(signature(runs[1].calls[0], EMPTY_MASK));
});

// ------------------------------------------------------------ shell quoting

test('both quote styles parse, on either platform', () => {
    expect(tokenize(`node 'C:/a b/x.js' --flag`)).toEqual(['node', 'C:/a b/x.js', '--flag']);
    expect(tokenize(`node "C:/a b/x.js"`)).toEqual(['node', 'C:/a b/x.js']);
    expect(tokenize(`python -m agent --input "hello world"`))
        .toEqual(['python', '-m', 'agent', '--input', 'hello world']);
    expect(tokenize(`a  b   c`)).toEqual(['a', 'b', 'c']);
    expect(tokenize(`--flag=''`)).toEqual(['--flag=']);
});

test('a single-quoted path is re-quoted the way each shell actually expects', () => {
    const argv = tokenize(`node 'C:/a b/x.js'`);
    // cmd.exe treats ' as an ordinary character, which is what used to break this.
    expect(buildCommand(argv, true)).toBe(`node "C:/a b/x.js"`);
    expect(buildCommand(argv, false)).toBe(`node 'C:/a b/x.js'`);
});

test('embedded quotes survive the round trip', () => {
    expect(quoteArg(`say "hi"`, true)).toBe(`"say ""hi"""`);
    // POSIX has no escape inside single quotes: you close, emit \' , and reopen.
    expect(quoteArg("it's", false)).toBe("'it'\\''s'");
    expect(quoteArg('plain', true)).toBe('plain');
    expect(quoteArg('', true)).toBe('""');
});

test('a command wanting real shell semantics is left alone', () => {
    expect(needsShell('cat x | head')).toBe(true);
    expect(needsShell('a && b')).toBe(true);
    expect(needsShell('python -m x > out.txt')).toBe(true);
    expect(needsShell(`node 'a b.js'`)).toBe(false);
    // An operator inside quotes is data, not syntax.
    expect(needsShell(`node x.js --sep '|'`)).toBe(false);
});

test('a run command with spaces in the path actually launches', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acdl has spaces-'));
    const script = path.join(dir, 'probe.mjs');
    fs.writeFileSync(script, `
await fetch(process.env.ANTHROPIC_BASE_URL + '/v1/messages', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'm', max_tokens: 8, messages: [{ role: 'user', content: 'ok' }] }),
});`);

    const r = await runEpisode({
        targetRoot: process.cwd(), tracePath: tmp('e.jsonl'), episode: 'quoted',
        scenario: SCENARIO,
        recipe: { language: 'none', entry: '', program: '', env: {}, args: [], stdin: '' },
        // Single-quoted, POSIX-style: the spelling that used to fail on Windows.
        runCommand: `node '${script}'`,
        assignments: {}, primary: undefined,
    });

    expect(r.exitCode).toBe(0);
    expect(r.calls).toHaveLength(1);
});
