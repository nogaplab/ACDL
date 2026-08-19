// Run a target many times, varying one thing at a time.
//
//   bun run acdl-verify/sweep.ts --bindings b.json --time 1,2,3
//   bun run acdl-verify/sweep.ts --bindings b.json --var env.customer_tier=basic,premium
//
// Two axes matter to a spec and they are controlled differently. `sys.*` and
// `env.*` are set through a binding's recipe; `@T` is not a variable the target
// has at all -- it is how far into the episode we are -- so it is passed as
// ACDL_TIME and the recipe decides what that means for this codebase.
//
// Every sweep begins by running one cell twice and diffing the results. Whatever
// moved is nondeterminism, and it is masked out of every later comparison. The
// README has always said this is mandatory; against a live model it obviously is,
// but a target that stamps a timestamp into its prompt is just as fatal.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { readBindings, type Binding, type BindingMap } from './bindings';
import {
    runMatrix, runEpisode, baseline, signature, shape, firstDifference,
    cells, TIME, EMPTY_MASK, type Assignments, type EpisodeResult, type Mask,
} from './runner';
import type { Responder, Scenario } from './proxy';

const SCENARIO: Scenario = {
    name: 'sweep',
    replies: [{ text: 'acdl-verify: acknowledged.', repeat: 10 }],
    maxCalls: 12,
};

export type SweepOptions = {
    map: BindingMap;
    targetRoot: string;
    traceDir: string;
    /** Which binding's recipe drives the episodes. */
    recipeKey?: string;
    axes: Record<string, string[]>;
    fixed?: Assignments;
    repeats?: number;
    runCommand?: string;
    python?: string;
    responder?: Responder;
    verbose?: boolean;
};

export type SweepResult = {
    mask: Mask;
    runs: EpisodeResult[];
    /** Per axis: did changing it change anything the mask did not already excuse? */
    effects: Array<{ axis: string; moved: boolean; detail: string }>;
};

/** The binding whose recipe can actually produce an episode. */
export function pickRecipe(map: BindingMap, wanted?: string): Binding {
    const usable = map.bindings.filter((b) => b.recipe && b.status === 'grounded');
    if (!usable.length) {
        throw new Error(
            'no binding in this map has a recipe yet; run verify.ts first so an episode can be produced');
    }
    if (!wanted) return usable[0];
    const found = usable.find((b) => b.key === wanted);
    if (!found) {
        throw new Error(
            `binding '${wanted}' has no recipe; available: ${usable.map((b) => b.key).join(', ')}`);
    }
    return found;
}

export async function sweep(opts: SweepOptions): Promise<SweepResult> {
    const log = (m: string) => { if (opts.verbose !== false) console.error(m); };
    const driver = pickRecipe(opts.map, opts.recipeKey);
    const grid = cells(opts.axes, opts.fixed);

    log(`driver   ${driver.key} (${driver.kind}, ${driver.recipe!.language})`);
    log(`axes     ${Object.entries(opts.axes).map(([k, v]) => `${k}=${v.join(',')}`).join('  ') || '(none)'}`);
    log(`episodes ${grid.length} cell(s)`);

    const common = {
        targetRoot: opts.targetRoot,
        recipe: driver.recipe!,
        primary: driver.key,
        scenario: SCENARIO,
        responder: opts.responder,
        runCommand: opts.runCommand,
        python: opts.python,
    };

    // ---- baseline: the same cell, twice, before anything is varied ----------
    const repeats = Math.max(2, opts.repeats ?? 2);
    log(`\nbaseline: cell 1 run ${repeats}x to find what moves on its own`);
    const baseRuns: EpisodeResult[] = [];
    for (let i = 0; i < repeats; i++) {
        const episode = `baseline-r${i + 1}`;
        baseRuns.push(await runEpisode({
            ...common, assignments: grid[0], episode,
            tracePath: path.join(opts.traceDir, `${episode}.jsonl`),
        }));
    }
    const mask = baseline(baseRuns);
    if (!baseRuns[0].calls.length) {
        throw new Error(
            `the baseline episode sent no model request (exit ${baseRuns[0].exitCode}). ` +
            `${(baseRuns[0].stderr || baseRuns[0].stdout).trim().split('\n').slice(-2).join(' / ').slice(0, 300)}`);
    }
    log(mask.paths.size
        ? `  masked ${mask.paths.size} unstable path(s): ${[...mask.paths].slice(0, 4).join(', ')}`
        : '  nothing moved: this target is deterministic under these settings');

    // ---- the sweep proper --------------------------------------------------
    log(`\nsweeping…`);
    const runs = await runMatrix({ ...common, axes: opts.axes, fixed: opts.fixed, traceDir: opts.traceDir, name: 'cell' });

    for (const r of runs) {
        const label = Object.entries(r.assignments).map(([k, v]) => `${k}=${clip(v)}`).join(' ');
        log(`  ${label.padEnd(46)} ${r.calls.length} call(s)  [${r.calls.map(shape).join(' | ') || '-'}]`);
    }

    // ---- did each axis do anything? ----------------------------------------
    const effects = Object.keys(opts.axes).map((axis) => attribute(axis, runs, mask));
    return { mask, runs, effects };
}

/**
 * Whether varying one axis changed the recorded requests, holding the others.
 * An axis with no effect is the interesting result: either the recipe ignores it
 * -- an ACDL_TIME the driver never read -- or the spec claims a dependency the
 * code does not have. Reporting "no effect" as a *finding* rather than a pass is
 * the whole point of running the sweep.
 */
function attribute(axis: string, runs: EpisodeResult[], mask: Mask): { axis: string; moved: boolean; detail: string } {
    const groups = new Map<string, EpisodeResult[]>();
    for (const r of runs) {
        const others = Object.entries(r.assignments)
            .filter(([k]) => k !== axis).map(([k, v]) => `${k}=${v}`).sort().join('|');
        groups.set(others, [...(groups.get(others) ?? []), r]);
    }

    for (const [, group] of groups) {
        if (group.length < 2) continue;
        const sigs = group.map((r) => r.calls.map((c) => signature(c, mask)).join('\n--\n'));
        const shapes = group.map((r) => r.calls.map(shape).join(' | '));
        if (shapes.some((s) => s !== shapes[0])) {
            return {
                axis, moved: true,
                detail: `message shape varies with ${axis}: ` +
                        group.map((r, i) => `${r.assignments[axis]} → [${shapes[i]}]`).join(', '),
            };
        }
        if (sigs.some((s) => s !== sigs[0])) {
            return {
                axis, moved: true,
                detail: `same shape, content varies with ${axis}: ${firstDifference(sigs[0], sigs[1])}`,
            };
        }
    }
    return {
        axis, moved: false,
        detail: `changing ${axis} changed nothing outside the mask — either the recipe ` +
                `ignores it (${axis === TIME ? 'the driver may not read ACDL_TIME' : 'check the recipe'}) ` +
                'or the target genuinely does not depend on it',
    };
}

const clip = (s: string) => (s.length > 18 ? `${s.slice(0, 15)}…` : s);

// ---------------------------------------------------------------------- CLI

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function args(name: string): string[] {
    const out: string[] = [];
    process.argv.forEach((a, i) => { if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]); });
    return out;
}

const USAGE = `Usage: bun run acdl-verify/sweep.ts --bindings <bindings.json> [options]

  --bindings <file>   a map whose bindings already have recipes (run verify.ts first)
  --target <dir>      the codebase (default: the target recorded in the file)
  --time 1,2,3        sweep the time index; the recipe reads it from ACDL_TIME
  --var k=a,b         sweep a variable over those values (repeatable)
  --recipe <key>      which binding's recipe drives the episodes
  --repeats <n>       baseline runs before the sweep (default 2, minimum 2)
  --live <model>      answer with a real model instead of a script, on a subscription
  --run <command>     entrypoint, for a language:none recipe
  --python <exe>      interpreter for generated Python drivers
  --traces <dir>      default acdl-verify/traces/sweep`;

async function main() {
    const file = arg('bindings');
    if (!file) { console.error(USAGE); process.exit(2); }

    const map = readBindings(file);
    const axes: Record<string, string[]> = {};
    const time = arg('time');
    if (time) axes[TIME] = time.split(',').map((s) => s.trim());
    for (const v of args('var')) {
        const i = v.indexOf('=');
        if (i === -1) { console.error(`--var expects key=a,b — got '${v}'`); process.exit(2); }
        axes[v.slice(0, i)] = v.slice(i + 1).split(',').map((s) => s.trim());
    }
    if (!Object.keys(axes).length) { console.error('nothing to sweep: pass --time or --var\n'); console.error(USAGE); process.exit(2); }

    let responder;
    const live = arg('live');
    if (live) {
        const exe = process.env.CLAUDE_CODE_EXECPATH;
        if (!exe) { console.error('--live needs CLAUDE_CODE_EXECPATH set'); process.exit(2); }
        const { liveResponder } = await import('./responder');
        const { claudeCliTransport } = await import('./discover');
        responder = liveResponder({ transport: claudeCliTransport({ exe, model: live, allowedTools: [] }) });
    }

    const traceDir = arg('traces', 'acdl-verify/traces/sweep')!;
    fs.mkdirSync(traceDir, { recursive: true });

    const result = await sweep({
        map,
        targetRoot: arg('target', map.target)!,
        traceDir,
        recipeKey: arg('recipe'),
        axes,
        repeats: Number(arg('repeats', '2')),
        runCommand: arg('run'),
        python: arg('python'),
        responder,
    });

    console.log('\naxis effects:');
    for (const e of result.effects) {
        console.log(`  ${e.moved ? '✓ moved  ' : '· no effect'} ${e.detail}`);
    }
    console.log(`\n${result.runs.length} trace(s) in ${traceDir}`);
    if (result.mask.paths.size) {
        console.log(`mask (${result.mask.sources} baseline runs): ${[...result.mask.paths].join(', ')}`);
    }
}

if (import.meta.main) await main();
