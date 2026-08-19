// bun test acdl-verify/ablate.test.ts
//
// The integration tests here run real episodes against hand-written drivers, so
// no model is involved. What they pin down is the judgement: a branch the code
// really has must come back CONFIRMED, and one it does not must come back
// REFUTED rather than quietly passing.

import { test, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ablate, seqDelta, normExpr, predictShape, armsFor } from './ablate';
import { loadSpec } from './check';
import type { BindingMap, Binding, Recipe } from './bindings';

// ------------------------------------------------------------------ deltas

test('a branch that appends one message reads as an addition at the end', () => {
    expect(seqDelta(['S', 'U'], ['S', 'U', 'S'])).toBe('+[S] at 2');
});

test('a branch that inserts in the middle is located, not just counted', () => {
    expect(seqDelta(['S', 'U', 'U'], ['S', 'U', 'A', 'U'])).toBe('+[A] at 2');
});

test('a removal and a no-op are distinguishable', () => {
    expect(seqDelta(['S', 'U', 'A', 'T'], ['S', 'U'])).toBe('-[A T] at 2');
    expect(seqDelta(['S', 'U'], ['S', 'U'])).toBe('none');
});

test('expressions are compared modulo the punctuation the AST drops', () => {
    expect(normExpr('env.tier == "premium"')).toBe(normExpr('env.tier==premium'));
    expect(normExpr('a == b')).not.toBe(normExpr('a != b'));
});

// --------------------------------------------------------------- predicted

const SPEC = `
Demo[@T]: {
    S: { SYSTEM_PROMPT }
    U: env.message[@T]
    If env.tier == "premium" {
        S: NOTICE
    }
}
`.trim();

function specFile(text: string): string {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'acdl-spec-')), 'Demo.acdl');
    fs.writeFileSync(f, text);
    return f;
}

test('forcing a condition true and false gives the shape the branch is claimed to cause', () => {
    const f = specFile(SPEC);
    const { prompt, strFrags, rolesFrags } = loadSpec(f);
    const expr = 'env.tier == "premium"';

    const off = predictShape(prompt, 'T', 1, expr, false, strFrags, rolesFrags);
    const on = predictShape(prompt, 'T', 1, expr, true, strFrags, rolesFrags);
    expect(off).toEqual(['S', 'U']);
    expect(on).toEqual(['S', 'U', 'S']);
    expect(seqDelta(off, on)).toBe('+[S] at 2');
});

// -------------------------------------------------------------- integration

/** A driver whose message array is built by the body it is given. */
const driver = (body: string): Recipe => ({
    language: 'node', entry: 'h.mjs',
    program: `
const tier = process.env.ACDL_VALUE ?? '';
await fetch(process.env.ANTHROPIC_BASE_URL + '/v1/messages', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'm', max_tokens: 8, system: 'sys', messages: ${body} }),
});
`,
    env: {}, args: [], stdin: '',
});

function bindings(recipe: Recipe, verification: Binding['verification'] = 'confirmed'): BindingMap {
    return {
        version: 1, spec: 'Demo.acdl', target: '.', generatedAt: '', model: 'test',
        bindings: [{
            key: 'env.tier', kind: 'harness', handle: 'h', setter: 's',
            evidence: { file: 'x', line: 1, snippet: 'x' },
            confidence: 'high', reasoning: 'r', status: 'grounded',
            recipe, verification,
        } as Binding],
    };
}

const run = (map: BindingMap, spec = SPEC) => ablate({
    specFile: specFile(spec),
    map,
    targetRoot: process.cwd(),
    traceDir: fs.mkdtempSync(path.join(os.tmpdir(), 'acdl-abl-')),
    time: 1,
    verbose: false,
});

test('a branch the code really has is CONFIRMED, predicted delta matching observed', async () => {
    const honest = driver(`tier === 'premium'
        ? [{ role: 'user', content: 'q' }, { role: 'system', content: 'NOTICE' }]
        : [{ role: 'user', content: 'q' }]`);

    const [v] = await run(bindings(honest));
    expect(v.status).toBe('CONFIRMED');
    expect(v.predicted).toBe('+[S] at 2');
    expect(v.observed).toBe('+[S] at 2');
    expect(v.arm).toBe('== premium');
});

test('a branch the code does not have is REFUTED, and the message says why that is safe to claim', async () => {
    // The driver ignores the tier entirely. Because the binding is confirmed,
    // "nothing happened" cannot be explained away as the value never arriving.
    const deaf = driver(`[{ role: 'user', content: 'q' }]`);

    const [v] = await run(bindings(deaf));
    expect(v.status).toBe('REFUTED');
    expect(v.predicted).toBe('+[S] at 2');
    expect(v.observed).toBe('none');
    expect(v.detail).toContain('already proven to reach the prompt');
});

test('a branch that fires differently than claimed is REFUTED with both deltas', async () => {
    // Adds a user message where the spec claims a system one.
    const wrong = driver(`tier === 'premium'
        ? [{ role: 'user', content: 'q' }, { role: 'user', content: 'NOTICE' }]
        : [{ role: 'user', content: 'q' }]`);

    const [v] = await run(bindings(wrong));
    expect(v.status).toBe('REFUTED');
    expect(v.predicted).toBe('+[S] at 2');
    expect(v.observed).toBe('+[U] at 2');
});

test('an unconfirmed binding yields UNCONTROLLABLE, never a refutation', async () => {
    const deaf = driver(`[{ role: 'user', content: 'q' }]`);

    const [v] = await run(bindings(deaf, 'unverified'));
    expect(v.status).toBe('UNCONTROLLABLE');
    expect(v.detail).toContain('never arriving');
});

test('values outside every arm must agree, or a Case is missing', async () => {
    // This target treats one off-arm probe specially, so the else arm is not one
    // arm and the spec cannot be describing the real partition.
    const split = driver(`tier === 'premium'
        ? [{ role: 'user', content: 'q' }, { role: 'system', content: 'N' }]
        : tier === 'ACDLV_OFF_ARM_2'
          ? [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'special' }]
          : [{ role: 'user', content: 'q' }]`);

    const [v] = await run(bindings(split));
    expect(v.status).toBe('REFUTED');
    expect(v.detail).toContain('missing a Case');
});

test('a branch with no structural effect is UNEXERCISED, not a pass', async () => {
    // The spec's branch swaps text inside a message rather than adding one, so a
    // shape-level pass cannot settle it either way.
    const inline = `
Demo[@T]: {
    S: { SYSTEM_PROMPT }
    U: {
        If env.tier == "premium" {
            PREMIUM_LINE
        }
        env.message[@T]
    }
}
`.trim();
    const textual = driver(`[{ role: 'user', content: tier === 'premium' ? 'q PREMIUM' : 'q' }]`);

    const [v] = await run(bindings(textual), inline);
    expect(v.status).toBe('UNEXERCISED');
    expect(v.detail).toContain('placement claim');
});

// ------------------------------------------------------------- arm polarity

test('the literal a spec names is not always the value that makes it true', () => {
    const eq = armsFor('env.t == "premium"', ['premium'])!;
    expect(eq[0]).toMatchObject({ whenTrue: 'premium', sentinelIsTrue: false });

    // The case that inverts every delta if assumed: `!= none` is FALSE at none.
    const ne = armsFor('resp.x != none', ['none'])!;
    expect(ne[0]).toMatchObject({ whenFalse: 'none', sentinelIsTrue: true });
    expect(ne[0].whenTrue).not.toBe('none');
});

test('a numeric threshold is straddled, not set to the threshold itself', () => {
    expect(armsFor('sys.steps_left < 2', ['2'])![0])
        .toMatchObject({ whenTrue: '1', whenFalse: '2' });
    expect(armsFor('sys.n >= 5', ['5'])![0])
        .toMatchObject({ whenTrue: '5', whenFalse: '4' });
});

test('a Switch yields one arm per Case', () => {
    const arms = armsFor('sys.mode == x', ['a', 'b', 'c'])!;
    expect(arms.map((a) => a.whenTrue)).toEqual(['a', 'b', 'c']);
});

test('a condition with nothing to set is not silently treated as testable', () => {
    expect(armsFor('sys.flag == x', [])).toBeUndefined();
    expect(armsFor('sys.n < notanumber', ['notanumber'])).toBeUndefined();
});

test('a != branch the code really has is CONFIRMED, not inverted into a refutation', async () => {
    const spec = `
Demo[@T]: {
    S: { SYSTEM_PROMPT }
    U: env.message[@T]
    If env.tier != none {
        S: NOTICE
    }
}
`.trim();
    // Faithful to that spec: the notice appears for everything EXCEPT "none".
    const honest = driver(`tier !== 'none'
        ? [{ role: 'user', content: 'q' }, { role: 'system', content: 'NOTICE' }]
        : [{ role: 'user', content: 'q' }]`);

    const [v] = await run(bindings(honest), spec);
    expect(v.status).toBe('CONFIRMED');
    expect(v.predicted).toBe('+[S] at 2');
    expect(v.observed).toBe('+[S] at 2');
    expect(v.arm).toBe('!= none');
});

test('a compound condition is declined rather than tested one subject at a time', async () => {
    const spec = `
Demo[@T]: {
    S: { SYSTEM_PROMPT }
    U: env.message[@T]
    If env.tier == "premium" & env.region == "eu" {
        S: NOTICE
    }
}
`.trim();
    const any = driver(`[{ role: 'user', content: 'q' }]`);

    const [v] = await run(bindings(any), spec);
    expect(v.status).toBe('UNEXERCISED');
    expect(v.detail).toContain('compound condition over 2 subjects');
});
