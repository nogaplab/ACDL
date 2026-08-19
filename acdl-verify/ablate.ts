// Does each condition in the spec do what the spec says it does?
//
//   bun run acdl-verify/ablate.ts --spec S.acdl --bindings b.json --target dir
//
// Everything before this proved that a handle reaches the prompt. That is not
// the claim a spec makes. `If env.tier == "premium" { S: NOTICE }` claims
// something sharper: that flipping that one value adds *one system message* and
// changes nothing else. Checking it needs both halves --
//
//   predicted  evaluate the spec twice, once with the condition forced true and
//              once forced false, and take the difference. Everything else is
//              held identical, so the difference is attributable to the branch
//              no matter what the other free choices were set to.
//   observed   run the target twice, once with the subject at the arm's value and
//              once at a value in no arm, and take the difference the same way.
//
// The two deltas are then compared. Absolute shapes are deliberately *not*
// compared: a spec is allowed to be a partial description, and a harness may add
// framing of its own, but the delta a branch causes must match exactly.
//
// The confirmed binding is what makes a null result meaningful. If the handle is
// known to reach the prompt and flipping it changes nothing, the branch is
// fictional -- rather than "the perturbation never arrived", which is the
// ambiguity that normally needs coverage instrumentation to resolve.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as AST from '../src/types';
import { evaluate, Unsupported, type Resolver } from './evaluate';
import { loadSpec } from './check';
import { extractTargets, type Target } from './provenance';
import { readBindings, type Binding, type BindingMap } from './bindings';
import { runEpisode, shape, signature, baseline, TIME, EMPTY_MASK, type EpisodeResult, type Mask } from './runner';
import type { Scenario } from './proxy';

const SCENARIO: Scenario = {
    name: 'ablate',
    replies: [{ text: 'acdl-verify: acknowledged.', repeat: 10 }],
    maxCalls: 12,
};

/** Values used to probe the Else arm. Nothing a spec would ever name. */
const OFF_ARM = ['ACDLV_OFF_ARM_1', 'ACDLV_OFF_ARM_2', 'ACDLV_OFF_ARM_3'];

// ---------------------------------------------------------------- predicted

const ROLE_LETTER: Record<AST.Role, string> = {
    system: 'S', user: 'U', assistant: 'A', tool: 'T',
};

/**
 * The spec's own message shape with one condition pinned. Other conditions are
 * pinned false in both evaluations, so whatever they contribute cancels out of
 * the difference.
 */
export function predictShape(
    prompt: AST.Prompt, timeVar: string, time: number, condExpr: string, hold: boolean,
    strFrags: any, rolesFrags: any,
): string[] {
    const want = normExpr(condExpr);
    const resolver: Resolver = {
        collectionSize: () => 1,
        conditionHolds: (expr) => (normExpr(expr) === want ? hold : false),
        indexValue: (name) => { throw new Unsupported(`index '${name}' is not predictable here`); },
    };
    const p = evaluate(prompt, { time: { [timeVar]: time }, resolver, strFrags, rolesFrags });
    return p.messages.map((m) => ROLE_LETTER[m.role]);
}

/**
 * `evaluate` reconstructs an expression from tokens, so it writes
 * `env.tier==premium` where the source said `env.tier == "premium"`. Comparing
 * the two needs both stripped of the punctuation that survived neither.
 */
export function normExpr(expr: string): string {
    return expr.replace(/\s+/g, '').replace(/["']/g, '');
}

/**
 * The difference between two role sequences, as a contiguous edit. Branches add
 * or remove a run of messages, so a common prefix/suffix trim describes them
 * exactly and is stable against unrelated content either side.
 */
export function seqDelta(before: string[], after: string[]): string {
    let head = 0;
    while (head < before.length && head < after.length && before[head] === after[head]) head++;

    let tail = 0;
    while (tail < before.length - head && tail < after.length - head &&
           before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;

    const removed = before.slice(head, before.length - tail);
    const added = after.slice(head, after.length - tail);

    if (!removed.length && !added.length) return 'none';
    const parts: string[] = [];
    if (added.length) parts.push(`+[${added.join(' ')}]`);
    if (removed.length) parts.push(`-[${removed.join(' ')}]`);
    return `${parts.join(' ')} at ${head}`;
}

// ----------------------------------------------------------------- verdicts

export type ConditionVerdict = {
    key: string;
    label: string;
    line: number;
    subject: string;
    arm: string;
    status: 'CONFIRMED' | 'REFUTED' | 'UNEXERCISED' | 'UNCONTROLLABLE';
    predicted: string;
    observed: string;
    detail: string;
    traces: string[];
};

export type AblateOptions = {
    specFile: string;
    map: BindingMap;
    targetRoot: string;
    traceDir: string;
    time?: number;
    specName?: string;
    runCommand?: string;
    python?: string;
    /** How many values outside every arm to probe, for the partition test. */
    probes?: number;
    only?: string[];
    verbose?: boolean;
};

export async function ablate(opts: AblateOptions): Promise<ConditionVerdict[]> {
    const log = (m: string) => { if (opts.verbose !== false) console.error(m); };
    const { prompt, strFrags, rolesFrags } = loadSpec(opts.specFile, opts.specName);
    const timeVar = prompt.title.indices.length ? indexName(prompt.title.indices[0]) : 'T';
    const time = opts.time ?? 3;

    const specText = fs.readFileSync(opts.specFile, 'utf8');
    const conditions = extractTargets(specText).filter((t) => t.kind === 'condition');
    fs.mkdirSync(opts.traceDir, { recursive: true });

    log(`spec       ${opts.specFile}  (${prompt.title.name}[@${timeVar}] at @${timeVar}=${time})`);
    log(`conditions ${conditions.length}`);

    const out: ConditionVerdict[] = [];
    for (const cond of conditions) {
        if (opts.only && !opts.only.includes(cond.key)) continue;
        out.push(...await ablateOne(cond, { prompt, timeVar, time, strFrags, rolesFrags }, opts, log));
    }
    return out;
}

async function ablateOne(
    cond: Target,
    spec: { prompt: AST.Prompt; timeVar: string; time: number; strFrags: any; rolesFrags: any },
    opts: AblateOptions,
    log: (m: string) => void,
): Promise<ConditionVerdict[]> {
    const line = cond.occurrences[0].line;
    const subject = cond.subjects[0];
    const expr = cond.label.replace(/^(If|ElseIf|Switch)\s+/, '');
    const base = {
        key: cond.key, label: cond.label, line, subject,
        traces: [] as string[],
    };

    log(`\n${cond.label}   (line ${line})`);

    // ---- can we even drive it? -------------------------------------------
    const binding = opts.map.bindings.find((b) => b.key === subject);
    if (!binding?.recipe || binding.status !== 'grounded') {
        log('  ✗ UNCONTROLLABLE: no grounded binding with a recipe for this subject');
        return [{ ...base, arm: '', status: 'UNCONTROLLABLE',
            predicted: '', observed: '',
            detail: `no runnable binding for '${subject}'; run discover.ts and verify.ts first` }];
    }
    if (binding.verification !== 'confirmed') {
        // Without the positive control a null result is ambiguous, and reporting
        // it as a refutation would be a lie.
        log(`  ✗ UNCONTROLLABLE: '${subject}' is ${binding.verification ?? 'unverified'}, not confirmed`);
        return [{ ...base, arm: '', status: 'UNCONTROLLABLE',
            predicted: '', observed: '',
            detail: `binding for '${subject}' is ${binding.verification ?? 'unverified'}; a null ` +
                    'result could not be distinguished from the value never arriving' }];
    }

    // `a == x & b == y` has two subjects and two literals, and pairing the second
    // literal with the first subject would test something the spec never said.
    // The README's design calls for one scenario per sub-condition; until that
    // exists, saying so beats quietly testing the wrong thing.
    if (/[&|]/.test(expr) && cond.subjects.length > 1) {
        log(`  ? UNEXERCISED: compound condition over ${cond.subjects.join(', ')}`);
        return [{ ...base, arm: '', status: 'UNEXERCISED', predicted: '', observed: '',
            detail: `compound condition over ${cond.subjects.length} subjects ` +
                    `(${cond.subjects.join(', ')}); each sub-condition needs its own ` +
                    'scenario, which this pass does not yet generate' }];
    }

    const arms = armsFor(expr, cond.literals.filter((l) => l !== '<default>'));
    if (!arms) {
        return [{ ...base, arm: '', status: 'UNEXERCISED', predicted: '', observed: '',
            detail: `no pair of values would make '${expr}' true and false; the condition ` +
                    'names no literal, or compares in a way this pass cannot invert' }];
    }

    const run = (value: string, tag: string) => runEpisode({
        targetRoot: opts.targetRoot,
        tracePath: path.join(opts.traceDir, `${safe(cond.key)}-${safe(tag)}.jsonl`),
        episode: `${cond.key}-${tag}`,
        scenario: SCENARIO,
        recipe: binding.recipe!,
        assignments: { [subject]: value, [TIME]: String(spec.time) },
        primary: subject,
        runCommand: opts.runCommand,
        python: opts.python,
    });

    const verdicts: ConditionVerdict[] = [];
    for (const arm of arms) {
        // Both episodes are named by the truth they produce, not by which value
        // is "the literal". For `x != none` the literal is what makes the
        // condition FALSE, and comparing the deltas in the wrong direction would
        // refute every correct spec of that shape.
        const falseRun = await run(arm.whenFalse, `${arm.label}-false`);
        const trueRun = await run(arm.whenTrue, `${arm.label}-true`);
        const traces = [falseRun.tracePath, trueRun.tracePath];

        if (!falseRun.calls.length || !trueRun.calls.length) {
            const dead = falseRun.calls.length ? trueRun : falseRun;
            verdicts.push({ ...base, arm: arm.label, status: 'UNCONTROLLABLE',
                predicted: '', observed: '', traces,
                detail: `an episode sent no model request (exit ${dead.exitCode})` });
            continue;
        }

        // Extra values on the same side of the condition. They must all behave
        // alike, or the arm is not one arm and the spec is missing a Case.
        const probes: EpisodeResult[] = [];
        const extra = OFF_ARM.filter((p) => p !== arm.whenTrue && p !== arm.whenFalse);
        for (const [i, p] of extra.slice(0, Math.max(1, (opts.probes ?? 2) - 1)).entries()) {
            probes.push(await run(p, `${safe(arm.label)}-probe${i + 1}`));
        }
        const sameSide = arm.sentinelIsTrue ? trueRun : falseRun;
        const partitioned = probes.every((p) => shapeOf(p) === shapeOf(sameSide));
        const mask = baseline([sameSide, ...probes]);

        const observed = seqDelta(seq(falseRun), seq(trueRun));

        let predicted: string;
        try {
            predicted = seqDelta(
                predictShape(spec.prompt, spec.timeVar, spec.time, expr, false, spec.strFrags, spec.rolesFrags),
                predictShape(spec.prompt, spec.timeVar, spec.time, expr, true, spec.strFrags, spec.rolesFrags));
        } catch (e) {
            log(`  ? UNEXERCISED: the spec could not be evaluated (${(e as Error).message})`);
            verdicts.push({ ...base, arm: arm.label, status: 'UNEXERCISED', predicted: '', observed, traces,
                detail: `the spec could not be evaluated at @${spec.timeVar}=${spec.time}: ${(e as Error).message}` });
            continue;
        }

        const shapes = [shapeOf(sameSide), ...probes.map(shapeOf)];
        const v = judge(predicted, observed, partitioned, shapes, trueRun, falseRun, mask, spec.time, spec.timeVar);
        log(`  ${mark(v.status)} ${v.status}  ${arm.label}  ` +
            `(${arm.whenFalse} → ${arm.whenTrue})  predicted ${predicted}, observed ${observed}`);
        if (v.detail) log(`      ${v.detail}`);
        verdicts.push({ ...base, arm: arm.label, traces, predicted, observed, ...v });
    }
    return verdicts;
}

/** One thing to test: a value that makes the condition true, and one that does not. */
export type Arm = {
    label: string;
    whenTrue: string;
    whenFalse: string;
    /** Which side the throwaway sentinel is on, i.e. which side "everything else" lands. */
    sentinelIsTrue: boolean;
};

/**
 * Turn a condition and its literals into value pairs that straddle it.
 *
 * The literal a spec names is not always the value that makes the condition
 * hold: in `x != none` it is precisely the value that makes it fail. Getting
 * this backwards inverts every delta, so the operator is read rather than
 * assumed.
 */
export function armsFor(expr: string, literals: string[]): Arm[] | undefined {
    const sentinel = OFF_ARM[0];
    const m = /(==|!=|<=|>=|<|>)\s*([^\s{]+)\s*$/.exec(normExpr(expr).replace(/([=!<>]=?)/, ' $1 '));
    const op = m?.[1];

    if (op === '<' || op === '>' || op === '<=' || op === '>=') {
        const n = Number(m![2]);
        if (!Number.isFinite(n)) return undefined;
        // A threshold, not a membership test: straddle it numerically.
        const pairs: Record<string, [string, string]> = {
            '<': [String(n - 1), String(n)],
            '<=': [String(n), String(n + 1)],
            '>': [String(n + 1), String(n)],
            '>=': [String(n), String(n - 1)],
        };
        const [t, f] = pairs[op];
        return [{ label: `${op} ${n}`, whenTrue: t, whenFalse: f, sentinelIsTrue: false }];
    }

    if (!literals.length) return undefined;

    if (op === '!=') {
        // Everything except the literal satisfies it, so the sentinel is the
        // true side and the partition probe belongs there too.
        return literals.map((l) => ({
            label: `!= ${l}`, whenTrue: sentinel, whenFalse: l, sentinelIsTrue: true,
        }));
    }
    return literals.map((l) => ({
        label: `== ${l}`, whenTrue: l, whenFalse: sentinel, sentinelIsTrue: false,
    }));
}

const seq = (r: EpisodeResult) => shapeOf(r).split(' ').filter(Boolean);

function judge(
    predicted: string, observed: string, partitioned: boolean, offShapes: string[],
    armRun: EpisodeResult, offRun: EpisodeResult, mask: Mask, time: number, timeVar: string,
): { status: ConditionVerdict['status']; detail: string } {
    if (!partitioned) {
        return {
            status: 'REFUTED',
            detail: `values in no arm did not agree with each other (${offShapes.join(' vs ')}); ` +
                    'the else arm is not a single arm, so the spec is missing a Case',
        };
    }

    if (predicted === 'none' && observed === 'none') {
        // The branch changes no message boundary at this time index. It may still
        // change content, which is a Level B claim this pass cannot settle.
        const armSig = armRun.calls.map((c) => signature(c, mask)).join('\n');
        const offSig = offRun.calls.map((c) => signature(c, mask)).join('\n');
        return armSig === offSig
            ? { status: 'REFUTED',
                detail: `the arm changed nothing at all at @${timeVar}=${time}, not even content` }
            : { status: 'UNEXERCISED',
                detail: `the branch adds no message at @${timeVar}=${time}; content did change, ` +
                        'which is a placement claim this pass cannot settle' };
    }

    if (predicted === observed) {
        return { status: 'CONFIRMED', detail: '' };
    }

    if (observed === 'none') {
        return {
            status: 'REFUTED',
            detail: `the spec predicts ${predicted}, but flipping a handle already proven to ` +
                    'reach the prompt changed nothing: the branch does not exist in the code',
        };
    }
    return {
        status: 'REFUTED',
        detail: `the spec predicts ${predicted}, the target did ${observed}`,
    };
}

const shapeOf = (r: EpisodeResult) => r.calls.map(shape).join(' | ');
/** Filename-safe, and readable: `== premium` becomes `eq-premium`. */
const safe = (s: string) => s
    .replace(/==/g, 'eq').replace(/!=/g, 'ne')
    .replace(/<=/g, 'le').replace(/>=/g, 'ge')
    .replace(/</g, 'lt').replace(/>/g, 'gt')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
const mark = (s: string) => ({ CONFIRMED: '✓', REFUTED: '✗', UNEXERCISED: '?', UNCONTROLLABLE: '—' }[s] ?? '?');

function indexName(i: AST.Index): string {
    const v: any = i.value;
    return v.kind === 'identifier' ? v.name : 'T';
}

// ---------------------------------------------------------------------- CLI

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const USAGE = `Usage: bun run acdl-verify/ablate.ts --spec <file.acdl> --bindings <bindings.json>

  --spec <file>      the specification whose conditions are under test
  --bindings <file>  bindings with confirmed runtime verification (verify.ts)
  --target <dir>     the codebase (default: the target recorded in the bindings)
  --name <Spec>      which prompt block, when the file holds more than one
  --time <n>         time index to evaluate and run at (default 3)
  --probes <n>       values outside every arm, for the partition test (default 2)
  --only <key>       one condition, e.g. cond:44 (repeatable)
  --traces <dir>     default acdl-verify/traces/ablate
  --run <command>    entrypoint, for a language:none recipe
  --python <exe>     interpreter for generated Python drivers`;

async function main() {
    const specFile = arg('spec'), bindingsFile = arg('bindings');
    if (!specFile || !bindingsFile) { console.error(USAGE); process.exit(2); }

    const map = readBindings(bindingsFile);
    const only = process.argv.reduce<string[]>(
        (acc, a, i) => (a === '--only' && process.argv[i + 1] ? [...acc, process.argv[i + 1]] : acc), []);

    const verdicts = await ablate({
        specFile, map,
        targetRoot: arg('target', map.target)!,
        traceDir: arg('traces', 'acdl-verify/traces/ablate')!,
        specName: arg('name'),
        time: Number(arg('time', '3')),
        probes: Number(arg('probes', '2')),
        runCommand: arg('run'),
        python: arg('python'),
        only: only.length ? only : undefined,
    });

    console.log('\n' + '-'.repeat(78));
    for (const v of verdicts) {
        console.log(`${mark(v.status)} ${v.status.padEnd(15)} ${v.label}${v.arm ? `  arm "${v.arm}"` : ''}`);
        console.log(`  line ${v.line}   predicted ${v.predicted || '-'}   observed ${v.observed || '-'}`);
        if (v.detail) console.log(`  ${v.detail}`);
    }

    const tally = new Map<string, number>();
    for (const v of verdicts) tally.set(v.status, (tally.get(v.status) ?? 0) + 1);
    console.log('-'.repeat(78));
    console.log([...tally].sort().map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ') || 'no conditions');

    process.exit(verdicts.some((v) => v.status === 'REFUTED') ? 1 : 0);
}

if (import.meta.main) await main();
