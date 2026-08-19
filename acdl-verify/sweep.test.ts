// bun test acdl-verify/sweep.test.ts
//
// Sweeps run real episodes against a hand-written driver, so no model is
// involved. What is under test is the reasoning around the episodes: the
// baseline mask, and whether an axis is credited with an effect it had.

import { test, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { sweep, pickRecipe } from './sweep';
import { TIME } from './runner';
import type { BindingMap, Binding, Recipe } from './bindings';

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'acdl-sweep-'));

const recipe = (body: string): Recipe => ({
    language: 'node',
    entry: 'h.mjs',
    program: `
const time = process.env.ACDL_TIME ?? '1';
const value = process.env.ACDL_VALUE ?? '';
await fetch(process.env.ANTHROPIC_BASE_URL + '/v1/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(${body}),
});
`,
    env: {}, args: [], stdin: '',
});

function mapWith(r: Recipe | undefined, key = 'env.tier'): BindingMap {
    const b = {
        key, kind: 'harness', handle: 'h', setter: 's',
        evidence: { file: 'x', line: 1, snippet: 'x' },
        confidence: 'high', reasoning: 'r', status: 'grounded', recipe: r,
    } as unknown as Binding;
    return {
        version: 1, spec: 'S.acdl', target: '.', generatedAt: '', model: 'test', bindings: [b],
    };
}

const base = (m: BindingMap) => ({
    map: m, targetRoot: process.cwd(), traceDir: dir(), verbose: false as const,
});

// ------------------------------------------------------------ recipe choice

test('a map with no recipes cannot drive a sweep, and says why', () => {
    expect(() => pickRecipe(mapWith(undefined))).toThrow('run verify.ts first');
});

test('a named recipe that does not exist lists the ones that do', () => {
    expect(() => pickRecipe(mapWith(recipe('{}')), 'env.absent')).toThrow('env.tier');
});

// ------------------------------------------------------------------ effects

test('an axis that changes the message shape is credited with the effect', async () => {
    // Stands in for a history loop: @T turns produce @T-1 prior exchanges.
    const r = recipe(`{ model: 'm', max_tokens: 8, messages: [
        ...Array.from({ length: Number(time) - 1 }).flatMap(() => ([
            { role: 'user', content: 'past' }, { role: 'assistant', content: 'reply' }])),
        { role: 'user', content: 'now' }] }`);

    const out = await sweep({ ...base(mapWith(r)), axes: { [TIME]: ['1', '2', '3'] } });

    expect(out.runs.map((x) => x.calls.map((c) => c.request.messages.length)[0])).toEqual([1, 3, 5]);
    expect(out.effects).toHaveLength(1);
    expect(out.effects[0].moved).toBe(true);
    expect(out.effects[0].detail).toContain('[U]');
    expect(out.effects[0].detail).toContain('[U A U A U]');
});

test('an axis the driver ignores is reported as no effect, not as a pass', async () => {
    // The interesting failure: ACDL_TIME is set but the driver never reads it.
    const deaf = recipe(`{ model: 'm', max_tokens: 8, messages: [{ role: 'user', content: 'fixed' }] }`);

    const out = await sweep({ ...base(mapWith(deaf)), axes: { [TIME]: ['1', '2', '3'] } });

    expect(out.effects[0].moved).toBe(false);
    expect(out.effects[0].detail).toContain('may not read ACDL_TIME');
});

test('an axis that changes only content is distinguished from one that changes shape', async () => {
    const textual = recipe(`{ model: 'm', max_tokens: 8,
        messages: [{ role: 'user', content: 'tier is ' + value }] }`);

    const out = await sweep({
        ...base(mapWith(textual)),
        axes: { 'env.tier': ['basic', 'premium'] },
    });

    expect(out.effects[0].moved).toBe(true);
    expect(out.effects[0].detail).toContain('same shape, content varies');
    expect(out.effects[0].detail).toContain('premium');
});

test('two axes are attributed independently', async () => {
    const both = recipe(`{ model: 'm', max_tokens: 8, messages: [
        ...Array.from({ length: Number(time) - 1 }).map(() => ({ role: 'user', content: 'past' })),
        { role: 'user', content: 'tier ' + value }] }`);

    const out = await sweep({
        ...base(mapWith(both)),
        axes: { [TIME]: ['1', '2'], 'env.tier': ['basic', 'premium'] },
    });

    expect(out.runs).toHaveLength(4);
    const byAxis = Object.fromEntries(out.effects.map((e) => [e.axis, e]));
    expect(byAxis[TIME].moved).toBe(true);
    expect(byAxis[TIME].detail).toContain('message shape varies');
    expect(byAxis['env.tier'].moved).toBe(true);
    expect(byAxis['env.tier'].detail).toContain('content varies');
});

// ----------------------------------------------------------------- baseline

test('run-to-run drift is masked, so it is not mistaken for an axis effect', async () => {
    // The driver ignores every axis but stamps a fresh number each run. Without
    // the baseline this reads as "the axis moved something"; with it, nothing did.
    const noisy = recipe(`{ model: 'm', max_tokens: 8, messages: [
        { role: 'user', content: 'stable' },
        { role: 'user', content: 'nonce ' + Math.random() }] }`);

    const out = await sweep({ ...base(mapWith(noisy)), axes: { [TIME]: ['1', '2'] }, repeats: 3 });

    expect([...out.mask.paths]).toEqual(['user[1].content']);
    expect(out.mask.sources).toBe(3);
    expect(out.effects[0].moved).toBe(false);
});

test('a driver that sends nothing fails the sweep loudly rather than reporting no effect', async () => {
    const silent: Recipe = { language: 'node', entry: 'h.mjs', program: 'process.exit(0);', env: {}, args: [], stdin: '' };
    await expect(sweep({ ...base(mapWith(silent)), axes: { [TIME]: ['1'] } }))
        .rejects.toThrow('sent no model request');
});
