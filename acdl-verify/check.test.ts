// bun test acdl-verify/check.test.ts
//
// `decide` is the join between the binding map and the checker: it is what lets
// a condition be resolved from what the episode actually held its subject at,
// instead of being thrown out. It had no test, which for a function whose wrong
// answer silently flips a branch is not good enough.

import { test, expect } from 'bun:test';
import { decide, normalizeAnthropic, checkPrefixMonotonicity, type Observed } from './check';

// ---------------------------------------------------------------- decide

test('an equality holds exactly when the episode held the subject at that value', () => {
    expect(decide('env.tier == "premium"', { 'env.tier': 'premium' })).toBe(true);
    expect(decide('env.tier == "premium"', { 'env.tier': 'basic' })).toBe(false);
});

test('the quoting the AST drops does not change the answer', () => {
    // `evaluate` reconstructs this as `env.tier==premium`, with neither spaces
    // nor quotes; both spellings must decide the same way.
    expect(decide('env.tier==premium', { 'env.tier': 'premium' })).toBe(true);
    expect(decide('env.tier  ==  "premium"', { 'env.tier': 'premium' })).toBe(true);
});

test('inequality is not equality — the case that inverts a whole spec', () => {
    expect(decide('resp.x != none', { 'resp.x': 'none' })).toBe(false);
    expect(decide('resp.x != none', { 'resp.x': 'anything else' })).toBe(true);
});

test('an index on the subject is ignored, since the episode fixes one', () => {
    expect(decide('env.tier[@T] == "premium"', { 'env.tier': 'premium' })).toBe(true);
    expect(decide('sys.step[@t.i].mode == fast', { 'sys.step': 'fast' })).toBe(true);
});

test('a subject the episode never set is undecidable, not false', () => {
    // The difference matters: undecidable becomes a reported assumption,
    // whereas false would silently select the Else arm.
    expect(decide('env.tier == "premium"', {})).toBeUndefined();
    expect(decide('env.tier == "premium"', { 'env.other': 'premium' })).toBeUndefined();
});

test('comparisons this pass cannot evaluate are left undecided', () => {
    expect(decide('sys.steps_left < 2', { 'sys.steps_left': '1' })).toBeUndefined();
    expect(decide('@t > 1', { time: '3' })).toBeUndefined();
    expect(decide('not a comparison at all', { 'env.x': 'y' })).toBeUndefined();
});

// --------------------------------------------------------- normalization

test('the system field becomes a message, carrying the serialized tool schemas', () => {
    const out = normalizeAnthropic({
        system: [{ type: 'text', text: 'sys' }],
        tools: [{ name: 'read_file' }, { name: 'grep' }],
        messages: [{ role: 'user', content: [{ type: 'text' }] }],
    });
    expect(out[0].role).toBe('system');
    expect(out[0].blocks).toEqual(['tool_schema(read_file)', 'tool_schema(grep)', 'text']);
    expect(out[1].role).toBe('user');
});

test('one user message of tool results normalizes to one tool message each', () => {
    // ACDL models each result as its own `T:`; the wire collects them into one
    // user message, and conflating the two would misreport every loop.
    const out = normalizeAnthropic({
        messages: [
            { role: 'assistant', content: [{ type: 'tool_use', name: 'f' }] },
            { role: 'user', content: [{ type: 'tool_result' }, { type: 'tool_result' }] },
        ],
    });
    expect(out.map((m) => m.role)).toEqual(['assistant', 'tool', 'tool']);
    expect(out[0].blocks).toEqual(['tool_use(f)']);
});

test('a user message mixing results with text stays one user message', () => {
    const out = normalizeAnthropic({
        messages: [{ role: 'user', content: [{ type: 'tool_result' }, { type: 'text' }] }],
    });
    expect(out.map((m) => m.role)).toEqual(['user']);
});

// ------------------------------------------------------ prefix monotonicity

const msgs = (...roles: Array<Observed['role']>): Observed[] =>
    roles.map((role) => ({ role, blocks: ['text'] }));

test('a call that extends the previous one is confirmed', () => {
    const v = checkPrefixMonotonicity([msgs('system', 'user'), msgs('system', 'user', 'assistant', 'tool')]);
    expect(v[0].status).toBe('CONFIRMED');
    expect(v[0].detail).toContain('by 2 message(s)');
});

test('a call that rewrote its history is refuted', () => {
    const v = checkPrefixMonotonicity([msgs('system', 'user'), msgs('system', 'assistant', 'user')]);
    expect(v[0].status).toBe('REFUTED');
    expect(v[0].detail).toContain('rewrote earlier messages');
});

test('a leaf-named subject also resolves, with indices dropped', () => {
    // Two spellings of the same thing: provenance keys the container, but a
    // hand-written assignment may name the leaf.
    expect(decide('sys.step[@t.i].mode == fast', { 'sys.step.mode': 'fast' })).toBe(true);
    expect(decide('sys.step[@t.i].mode == fast', { 'sys.step.mode': 'slow' })).toBe(false);
});
