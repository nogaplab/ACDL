// bun test acdl-verify/answers.test.ts

import { test, expect } from 'bun:test';
import {
    extractAnswerSchema, branchingSlots, candidates, templatesFor,
    answerResponder, landed, probeVia, describeVia, reconcile,
    type AnswerSlot, type AnswerVia,
} from './answers';
import type { CallRecord } from './proxy';

const call = (request: unknown): CallRecord => ({
    record: 'call', episode: 'e', seq: 1, t: 0, method: 'POST', path: '/v1/messages',
    modelCall: true, headers: {}, request, status: 200,
    contentType: 'application/json', streamed: false,
});

// ------------------------------------------------------------------ schema

test('the domain of a resp variable is read off the spec, never inferred', () => {
    const slots = extractAnswerSchema(`
Agent[@T]: {
    U: env.q[@T]
    A: resp.answer[@t]
    Switch resp.action_type[@T] {
        Case "search": { U: env.results[@T] }
        Case "calc": { U: env.calculation[@T] }
        Default: { U: env.fallback[@T] }
    }
}
`.trim());

    const action = slots.find((s) => s.key === 'resp.action_type')!;
    expect(action.domain).toEqual(['search', 'calc', '<default>']);
    expect(action.conditions[0]).toContain('Switch resp.action_type');

    // A variable no condition compares against has no domain to sweep.
    expect(slots.find((s) => s.key === 'resp.answer')!.domain).toEqual([]);
    expect(branchingSlots(slots).map((s) => s.key)).toEqual(['resp.action_type']);
});

test('the role a spec puts a resp variable under is recorded for later checking', () => {
    const slots = extractAnswerSchema(`
Agent[@T]: {
    A: {
        resp.thinking[@t]
    }
    U: env.q[@T]
}
`.trim());
    expect(slots[0].key).toBe('resp.thinking');
    expect(slots[0].expectRoles).toEqual(['assistant']);
});

test('only resp variables become answer slots', () => {
    const slots = extractAnswerSchema('Agent[@T]: {\n U: env.q[@T]\n A: sys.state[@T]\n}');
    expect(slots).toEqual([]);
});

// -------------------------------------------------------------- candidates

test('candidates come from the tools the target itself offered', () => {
    const cands = candidates({
        tools: [
            { name: 'search', input_schema: { properties: { query: {}, limit: {} } } },
            { name: 'noop' },
        ],
    });
    expect(cands.map(describeVia)).toEqual([
        'text "{value}"',
        'search.query', 'search.limit',
        'noop.input',                   // no schema: one generic field
    ]);
});

test('tag templates are derived from the variable name', () => {
    expect(templatesFor({ key: 'resp.execute_code', domain: [], conditions: [] })).toEqual([
        '{value}', '<execute_code>{value}</execute_code>', 'execute_code: {value}',
    ]);
});

// -------------------------------------------------------------- responders

const slot = (via: AnswerVia): AnswerSlot => ({ key: 'resp.x', domain: [], conditions: [], via });
const TEXT: AnswerVia = { mode: 'text', tool: '', field: '', template: '{value}' };
const TOOL: AnswerVia = { mode: 'tool', tool: 'run', field: 'code', template: '{value}' };

test('a plan emits the chosen value through the chosen delivery', async () => {
    const asText = answerResponder({ slots: [slot(TEXT)], plan: { 'resp.x': 'HELLO' } });
    expect(await asText({}, 0)).toEqual({ text: 'HELLO' });

    const asTool = answerResponder({ slots: [slot(TOOL)], plan: { 'resp.x': 'HELLO' } });
    expect(await asTool({}, 0)).toEqual({ tools: [{ name: 'run', input: { code: 'HELLO' } }] });
});

test('a template wraps the value, for a target that parses its own tags', async () => {
    const tagged = answerResponder({
        slots: [slot({ ...TEXT, template: '<execute>{value}</execute>' })],
        plan: { 'resp.x': 'print(1)' },
    });
    expect(await tagged({}, 0)).toEqual({ text: '<execute>print(1)</execute>' });
});

test('steering keeps the base model turn and appends what the experiment needs', async () => {
    const steered = answerResponder({
        slots: [slot(TEXT)],
        plan: { 'resp.x': 'PLANNED' },
        base: async () => ({ text: 'the model said something' }),
    });
    expect(await steered({}, 0)).toEqual({ text: 'the model said something\nPLANNED' });
});

test('past the end of the plan the episode is allowed to wind down', async () => {
    const r = answerResponder({
        slots: [slot(TEXT)], plan: { 'resp.x': 'A' }, tail: { text: 'done' },
    });
    expect(await r({}, 0)).toEqual({ text: 'A' });
    expect(await r({}, 1)).toEqual({ text: 'done' });
});

// ------------------------------------------------------------ verification

test('landed looks at the NEXT request, not the one that carried the reply', () => {
    const calls = [call({ messages: [{ role: 'user', content: 'hi' }] }),
                   call({ messages: [{ role: 'assistant', content: 'X CANARY X' }] })];
    expect(landed(calls, 0, 'CANARY')).toEqual([
        { message: 0, role: 'assistant', field: 'content' },
    ]);
    expect(landed(calls, 1, 'CANARY')).toEqual([]);   // no call after it
});

test('probing stops at the first delivery that comes back', async () => {
    const tried: string[] = [];
    const out = await probeVia(
        { key: 'resp.x', domain: [], conditions: [] },
        [TEXT, TOOL],
        'CANARY',
        async (via) => {
            tried.push(describeVia(via));
            // Text is discarded by this target; the tool call is echoed back.
            return via.mode === 'tool'
                ? [call({}), call({ messages: [{ role: 'assistant', content: 'CANARY' }] })]
                : [call({})];
        });

    expect(tried).toEqual(['text "{value}"', 'run.code']);
    expect(out.status).toBe('confirmed');
    expect(out.via).toEqual(TOOL);
});

test('a delivery that lands in the wrong role is misplaced, not confirmed', async () => {
    // The value did reach the context — but the spec puts resp.x under A:, and
    // this landed in a user message, so it is not that variable.
    const out = await probeVia(
        { key: 'resp.x', domain: [], conditions: [], expectRoles: ['assistant'] },
        [TEXT],
        'CANARY',
        async () => [call({}), call({ messages: [{ role: 'user', content: 'CANARY' }] })]);

    expect(out.status).toBe('misplaced');
    expect(out.detail).toContain('without being that variable');
});

test('when nothing lands, the report says what was tried', async () => {
    const out = await probeVia(
        { key: 'resp.x', domain: [], conditions: [] },
        [TEXT, TOOL], 'CANARY',
        async () => [call({})]);

    expect(out.status).toBe('unreachable');
    expect(out.detail).toContain('episode ended after one call');
    expect(out.detail).toContain('run.code');
});

// ------------------------------------------------------------- reconciling

const at = (key: string, message: number, field: string, specOrder = 0): AnswerSlot => ({
    key, domain: [], conditions: [], specOrder, status: 'confirmed',
    placement: [{ message, role: 'assistant', field }],
});

test('two variables landing in one position confirm neither', () => {
    const out = reconcile([at('resp.a', 1, 'content[0].text'), at('resp.b', 1, 'content[0].text')]);
    expect(out.map((s) => s.status)).toEqual(['ambiguous', 'ambiguous']);
    expect(out[0].detail).toContain('resp.a and resp.b');
});

test('distinct positions are left confirmed', () => {
    const out = reconcile([at('resp.a', 1, 'content[0].text'), at('resp.b', 1, 'content[1].text')]);
    expect(out.map((s) => s.status)).toEqual(['confirmed', 'confirmed']);
});

test('a collision recorded during probing also unseats the incumbent', () => {
    // resp.b could only reach a position resp.a already holds. Being asked
    // about first is not evidence, so resp.a loses its confirmation too.
    const out = reconcile([
        at('resp.a', 1, 'content[0].input.x'),
        { key: 'resp.b', domain: [], conditions: [], status: 'ambiguous',
          collidedWith: 'assistant[1].content[0].input.x' },
    ]);
    expect(out[0].status).toBe('ambiguous');
    expect(out[0].detail).toContain('being asked about first is not evidence');
});

test('wire order contradicting spec order is misplaced', () => {
    // The spec lists resp.first (line 10) before resp.second (line 20), but the
    // canaries came back the other way round inside the same message.
    const out = reconcile([
        at('resp.first', 1, 'content[3].text', 10),
        at('resp.second', 1, 'content[0].text', 20),
    ]);
    const second = out.find((s) => s.key === 'resp.second')!;
    expect(second.status).toBe('misplaced');
    expect(second.detail).toContain('wire order contradicts the spec');
});

test('order is only compared within one message', () => {
    const out = reconcile([
        at('resp.first', 2, 'content[0].text', 10),
        at('resp.second', 1, 'content[0].text', 20),
    ]);
    expect(out.every((s) => s.status === 'confirmed')).toBe(true);
});

test('probing skips a delivery whose landing spot is already claimed', async () => {
    const tried: string[] = [];
    const out = await probeVia(
        { key: 'resp.x', domain: [], conditions: [] },
        [TEXT, TOOL], 'CANARY',
        async (via) => {
            tried.push(describeVia(via));
            // Both routes land in the same place; the first is already taken.
            return [call({}), call({ messages: [{ role: 'assistant', content: 'CANARY' }] })];
        },
        new Set(['assistant[0].content']));

    expect(tried).toHaveLength(2);           // it kept looking rather than accepting
    expect(out.status).toBe('ambiguous');
    expect(out.collidedWith).toBe('assistant[0].content');
});
