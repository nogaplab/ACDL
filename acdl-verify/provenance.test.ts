// bun test acdl-verify/provenance.test.ts

import { test, expect } from 'bun:test';
import * as fs from 'node:fs';
import { extractTargets, readWindows, resolveCited, stripComment, timeTarget } from './provenance';

const spec = (s: string) => extractTargets(s.replace(/^\n/, ''));
const find = (ts: ReturnType<typeof spec>, k: string) => ts.find((t) => t.key === k)!;

test('a citation attaches to the line below it', () => {
    const ts = spec(`
// <- bot.py:92  if state.customer_tier == "premium"
If env.customer_tier == "premium" {
    S: NOTICE
}
`);
    const cond = ts.find((t) => t.kind === 'condition')!;
    expect(cond.occurrences[0].provenance!.citations).toEqual([
        { file: 'bot.py', startLine: 92, endLine: 92 },
    ]);
    expect(cond.occurrences[0].provenance!.direct).toBe(true);
    expect(cond.occurrences[0].provenance!.note).toContain('state.customer_tier');
});

test('a multi-line comment block is one citation set, and ranges parse', () => {
    const ts = spec(`
// <- mint/datatypes.py:89-96, budget computed at
//    mint/envs/general_env.py:234-241
If sys.count_down == true {
    STEPS_LEFT
}
`);
    expect(find(ts, 'sys.count_down').occurrences[0].provenance!.citations).toEqual([
        { file: 'mint/datatypes.py', startLine: 89, endLine: 96 },
        { file: 'mint/envs/general_env.py', startLine: 234, endLine: 241 },
    ]);
});

test('lines under a citation inherit it, flagged as weaker evidence', () => {
    const ts = spec(`
// <- bot.py:74-79  one system message
S: {
    SUPPORT_GUIDELINES
    CUSTOMER_INFO(env.customer_name, env.customer_tier)
}
`);
    const p = find(ts, 'env.customer_name').occurrences[0].provenance!;
    expect(p.direct).toBe(false);
    expect(p.citations[0].file).toBe('bot.py');
});

test('a one-line If does not swallow its body', () => {
    const ts = spec(`
If sys.agent.prompt != none { AGENT_PROMPT(sys.agent.name) }
`);
    const cond = ts.find((t) => t.kind === 'condition')!;
    expect(cond.label).toBe('If sys.agent.prompt != none');
    expect(cond.subjects).toEqual(['sys.agent.prompt']);   // not sys.agent.name
});

test('a Switch takes its domain from the Case arms', () => {
    const ts = spec(`
Switch sys.context_strategy {
    Case "opt1": { A }
    Case "opt2": { B }
    Default: { C }
}
`);
    const sw = ts.find((t) => t.kind === 'condition')!;
    expect(sw.literals).toEqual(['opt1', 'opt2', '<default>']);
});

test('a branch on a pure time index needs no binding and is not a target', () => {
    const ts = spec(`
If @t > 1 {
    U: env.user_input[@t]
}
`);
    expect(ts.filter((t) => t.kind === 'condition')).toHaveLength(0);
    expect(ts.map((t) => t.key)).toEqual(['env.user_input']);
});

test('variables mentioned only in comments are not targets', () => {
    const ts = spec(`
// discussion of resp.thinking and env.ghost, neither of which is emitted
U: env.real[@T]
`);
    expect(ts.map((t) => t.key)).toEqual(['env.real']);
});

test('a // inside a string is not a comment', () => {
    expect(stripComment('URL("http://x/y") // trailing').code.trim())
        .toBe('URL("http://x/y")');
});

test('one variable used twice keeps both occurrences and merges literals', () => {
    const ts = spec(`
// <- bot.py:31-33
CUSTOMER_INFO(env.customer_tier)
// <- bot.py:92
If env.customer_tier == "premium" {
    S: NOTICE
}
`);
    const v = find(ts, 'env.customer_tier');
    expect(v.occurrences.map((o) => o.line)).toEqual([2, 4]);
    expect(v.occurrences[1].provenance!.citations[0].startLine).toBe(92);
});

// ------------------------------------------------------------ code windows

test('a window is padded, numbered, and merged across overlapping citations', () => {
    const ws = readWindows('acdl-tests/test1-supportbot', [
        { file: 'supportbot.py', startLine: 92, endLine: 92 },
        { file: 'supportbot.py', startLine: 95, endLine: 95 },
    ], 4);
    expect(ws).toHaveLength(1);                       // merged, not two windows
    expect(ws[0].startLine).toBe(88);                 // padded backwards
    expect(ws[0].text).toContain('92| ');
    expect(ws[0].text).toContain('customer_tier == "premium"');
});

test('a citation to a file that is gone is reported, not thrown', () => {
    const ws = readWindows('acdl-tests/test1-supportbot', [
        { file: 'deleted.py', startLine: 1, endLine: 2 },
    ]);
    expect(ws[0].missing).toBeTruthy();
    expect(ws[0].text).toBe('');
});

test('a path prefix from the extractor root is stripped to resolve', () => {
    expect(resolveCited('acdl-tests/test1-supportbot', 'test1-supportbot/supportbot.py'))
        .toContain('supportbot.py');
    expect(resolveCited('acdl-tests/test1-supportbot', 'nothing/at/all.py')).toBeUndefined();
});

test('real generated specs come out fully cited', () => {
    for (const f of ['acdl-agent/out/mint/MintAgent.acdl', 'acdl-agent/out/opencode/OpenCode.acdl']) {
        const ts = extractTargets(fs.readFileSync(f, 'utf8'));
        expect(ts.length).toBeGreaterThan(20);
        // Every target must carry source lines, or discovery has nothing to go on.
        expect(ts.every((t) => t.occurrences.some((o) => o.provenance))).toBe(true);
    }
});

test('the time index becomes a target of its own, carrying the header citation', () => {
    const t = timeTarget(`
// <- agent.py:100-120  the loop that drives one episode
Agent[@T]: {
    U: env.q[@T]
}
`.trim())!;
    expect(t.key).toBe('time');
    expect(t.kind).toBe('time-index');
    expect(t.label).toContain('@T');
    expect(t.occurrences[0].provenance!.citations[0].file).toBe('agent.py');
});

test('a spec with no time index yields no time target', () => {
    expect(timeTarget('Frag Thing: {\n  A\n}')).toBeUndefined();
});
