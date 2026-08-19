// Turn proposed bindings into proven ones, by running them.
//
//   bun run acdl-verify/verify.ts --bindings bindings.json --target acdl-tests/test1-supportbot
//
// `discover.ts` says how it believes each variable is controlled, and `ground()`
// checks that the line it cited exists. Neither shows that setting the handle
// actually moves the prompt. This does, by two methods:
//
//   canary        give the variable a value nothing else could produce, run one
//                 episode, and look for it in the recorded request. Finding it
//                 proves control; *where* it was found is Level B placement.
//   differential  for a variable a condition compares against, a canary would
//                 break the branch. Run both arms instead and require the two
//                 recorded requests to differ.
//
// The recipe that makes an episode possible is itself model-written, and it is
// checked the only way a program can be: it is executed. A recipe that does not
// produce a request carrying the canary has failed, whatever it looks like.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import {
    Recipe, readBindings, writeBindings, renderReport,
    type Binding, type BindingMap,
} from './bindings';
export { canary } from './runner';

import {
    runEpisode, locate, signature, shape, firstDifference,
    EMPTY_MASK, TIME, canary, type EpisodeResult, type Mask,
} from './runner';
import { autoTransport, type Transport } from './discover';
import type { Scenario } from './proxy';


/** Three plain replies: enough to let a tool loop turn over, never to hang. */
const SCENARIO: Scenario = {
    name: 'verify',
    replies: [{ text: 'acdl-verify: acknowledged.', repeat: 6 }],
    maxCalls: 8,
};

const RecipeReply = z.object({ recipe: Recipe });

const SYSTEM = `You write a *recipe*: the smallest runnable thing that puts a chosen value
into one run of a codebase, so that the value shows up in the request the code sends to its
model provider.

You are given one variable, how it was classified, the source lines that establish its
handle, and the value placeholder {value}. Produce a recipe with these fields:

  language  "none" if the target has its own entrypoint that we can drive with env
            vars, arguments, or stdin. Otherwise "python" or "node" for a driver
            program you write.
  program   source for that driver, or "" when language is "none".
  entry     filename for the program, e.g. harness.py
  env       environment variables to set. Values may contain {value}.
  args      arguments appended to the run command. May contain {value}.
  stdin     text piped to the process. May contain {value}.

THE DRIVER CONTRACT -- when you write a program, it MUST:

1. Read the value from the environment variable ACDL_VALUE.
1b. Read ACDL_TIME if it is set, and use it as the time index the specification
   iterates over -- the turn number, or the step of a loop. Fall back to a sensible
   default when it is absent. This is what lets one recipe produce @T=1, @T=2 and
   @T=3, so never hardcode a turn count that ACDL_TIME could supply.
2. Import the target module and call its real message-building function. Do NOT
   reimplement the prompt: the entire point is to observe what the target's own code
   produces. Import it; never copy its logic.
3. Pass the value in so that it becomes the variable named below.
4. POST the resulting message array to the recording proxy:

     base = os.environ["ANTHROPIC_BASE_URL"]
     POST base + "/v1/messages"
     content-type: application/json
     body: {"model": "claude-haiku-4-5", "max_tokens": 64,
            "system": <system text, if the builder produced a system message>,
            "messages": [<the remaining messages, each {"role","content"}>]}

   Hoist ONLY a leading run of system-role entries into the top-level "system" field.
   A system-role entry that appears *after* a user or assistant message must stay where it
   is, in "messages", at its original index. Its position is exactly what the specification
   claims and joining it onto the front would destroy the evidence. Preserve order
   everywhere; never sort, merge, or deduplicate what the builder returned.

   Use only the standard library (urllib on Python, fetch on Node). The proxy answers
   locally; no API key is involved and no network call leaves the machine.
5. Exit 0. Print nothing that matters.

The program runs with the target root as its working directory, so a plain
\`import supportbot\` works. It is written to a scratch directory, so use
sys.path.insert(0, os.getcwd()) if your language needs it.

Return only the recipe.`;

function recipePrompt(b: Binding, targetRoot: string, windows: string, variable: string): string {
    return [
        `# Target codebase: ${targetRoot}`,
        '',
        `# Variable to control: ${variable}`,
        `  classified as: ${b.kind}`,
        `  handle: ${b.handle}`,
        `  how the discovery pass described setting it: ${b.setter}`,
        `  reasoning: ${b.reasoning}`,
        b.domain?.length ? `  values the spec compares against: ${b.domain.join(', ')}` : '',
        '',
        '# Source that establishes the handle',
        '',
        windows,
        '',
        `Write the recipe that sets ${variable} to {value}.`,
    ].filter((s) => s !== '').join('\n');
}

// ------------------------------------------------------------ verification

export type VerifyOptions = {
    map: BindingMap;
    targetRoot: string;
    traceDir: string;
    runCommand?: string;
    python?: string;
    /** Time index every verification episode runs at. */
    time?: string;
    /** Paths known to move on their own; excluded from every comparison. */
    mask?: Mask;
    transport?: Transport;
    /** Regenerate a recipe this many times if the episode produces nothing. */
    retries?: number;
    only?: string[];
    verbose?: boolean;
};

export async function verify(opts: VerifyOptions): Promise<BindingMap> {
    const transport = opts.transport ?? autoTransport();
    const log = (m: string) => { if (opts.verbose !== false) console.error(m); };
    fs.mkdirSync(opts.traceDir, { recursive: true });

    const todo = opts.map.bindings.filter((b) =>
        b.status === 'grounded' &&
        !['constant', 'unreachable', 'response'].includes(b.kind) &&
        (!opts.only || opts.only.includes(b.key)));

    log(`verifying ${todo.length} of ${opts.map.bindings.length} binding(s)`);
    log(`  skipped: constant / unreachable (no handle) and response (the proxy already owns those)\n`);

    for (const b of todo) {
        const variable = b.key.startsWith('cond:') ? (b.handle || b.key) : b.key;
        log(`${b.key}  [${b.kind}]`);
        try {
            await verifyOne(b, variable, opts, transport, log);
        } catch (e) {
            b.verification = 'uncontrollable';
            b.evidenceRuntime = {
                method: b.domain?.length ? 'differential' : 'canary',
                detail: `could not run an episode: ${(e as Error).message}`,
                traces: [],
            };
            log(`  ✗ uncontrollable: ${(e as Error).message}`);
        }
        log('');
    }
    return opts.map;
}

async function verifyOne(
    b: Binding, variable: string, opts: VerifyOptions, transport: Transport,
    log: (m: string) => void,
): Promise<void> {
    // A variable a condition compares against cannot take a canary: the canary
    // would fall into the Else arm and prove nothing about the named arm.
    const differential = (b.domain?.length ?? 0) > 0;
    const retries = opts.retries ?? 1;

    for (let attempt = 0; attempt <= retries; attempt++) {
        if (!b.recipe || attempt > 0) {
            log(`  ${attempt === 0 ? 'writing' : 'rewriting'} recipe…`);
            b.recipe = await makeRecipe(b, variable, opts, transport, attempt > 0 ? b.evidenceRuntime?.detail : undefined);
            if (!b.recipe) {
                b.verification = 'uncontrollable';
                b.evidenceRuntime = { method: differential ? 'differential' : 'canary',
                    detail: 'the model produced no usable recipe', traces: [] };
                continue;
            }
        }

        const outcome = differential
            ? await runDifferential(b, variable, opts, log)
            : await runCanary(b, variable, opts, log);

        b.verification = outcome.verification;
        b.evidenceRuntime = outcome.evidence;
        if (outcome.verification === 'confirmed') {
            log(`  ✓ confirmed: ${outcome.evidence.detail}`);
            return;
        }
        log(`  ${outcome.verification === 'refuted' ? '✗ refuted' : '· retry'}: ${outcome.evidence.detail}`);
    }
}

async function makeRecipe(
    b: Binding, variable: string, opts: VerifyOptions, transport: Transport, failure?: string,
): Promise<Recipe | undefined> {
    const { readWindows } = await import('./provenance');
    const windows = readWindows(opts.targetRoot, [{
        file: b.evidence.file,
        startLine: Math.max(1, b.evidence.line - 30),
        endLine: b.evidence.line + 30,
    }], 0, 400).map((w) => w.missing ? `(${w.file}: ${w.missing})` : `\`\`\`\n${w.text}\n\`\`\``).join('\n');

    let prompt = recipePrompt(b, opts.targetRoot, windows, variable);
    if (failure) {
        prompt += `\n\n# The previous recipe failed\n\n${failure}\n\n` +
            'Fix it. The most common causes are: not importing the target module, ' +
            'reimplementing the prompt instead of calling the builder, posting to the ' +
            'wrong URL, or never putting ACDL_VALUE into the variable at all.';
    }

    const reply = await transport.propose(SYSTEM, [{ role: 'user', content: prompt }], RecipeReply);
    return reply?.recipe;
}

// -------------------------------------------------------------- the proofs

type Outcome = { verification: Binding['verification']; evidence: NonNullable<Binding['evidenceRuntime']> };

async function runCanary(
    b: Binding, variable: string, opts: VerifyOptions, log: (m: string) => void,
): Promise<Outcome> {
    const value = canary(b.key);
    const trace = path.join(opts.traceDir, `${safe(b.key)}-canary.jsonl`);
    const r = await runEpisode({
        targetRoot: opts.targetRoot, tracePath: trace, episode: `${safe(b.key)}-canary`,
        scenario: SCENARIO, recipe: b.recipe!,
        assignments: { [variable]: value, ...(opts.time ? { [TIME]: opts.time } : {}) },
        primary: variable,
        runCommand: opts.runCommand, python: opts.python,
    });

    if (!r.calls.length) return fail(r, 'canary', [trace], 'the episode sent no model request');

    const placement = r.calls.flatMap((c) => locate(c, value));
    if (!placement.length) {
        return {
            verification: 'refuted',
            evidence: {
                method: 'canary', traces: [trace],
                detail: `${r.calls.length} request(s) recorded, but none contained the canary ` +
                        `${value}; setting this handle does not reach the prompt`,
            },
        };
    }
    return {
        verification: 'confirmed',
        evidence: {
            method: 'canary', traces: [trace], placement,
            detail: `canary ${value} appeared in ${placement.length} position(s): ` +
                    placement.slice(0, 4).map((p) =>
                        `${p.role}${p.message >= 0 ? `[${p.message}]` : ''}.${p.field}`).join(', '),
        },
    };
}

async function runDifferential(
    b: Binding, variable: string, opts: VerifyOptions, log: (m: string) => void,
): Promise<Outcome> {
    // The named arm against a value that cannot be any other arm.
    const a = b.domain![0];
    const bValue = `${canary(b.key)}_NOT_${a}`;
    const traces: string[] = [];
    const runs: EpisodeResult[] = [];

    for (const [i, value] of [a, bValue].entries()) {
        const trace = path.join(opts.traceDir, `${safe(b.key)}-arm${i}.jsonl`);
        traces.push(trace);
        runs.push(await runEpisode({
            targetRoot: opts.targetRoot, tracePath: trace, episode: `${safe(b.key)}-arm${i}`,
            scenario: SCENARIO, recipe: b.recipe!,
            assignments: { [variable]: value, ...(opts.time ? { [TIME]: opts.time } : {}) },
            primary: variable,
            runCommand: opts.runCommand, python: opts.python,
        }));
    }

    if (runs.some((r) => !r.calls.length)) {
        return fail(runs.find((r) => !r.calls.length)!, 'differential', traces,
            'one arm sent no model request');
    }

    const [f0, f1] = runs.map((r) => r.calls.map((c) => signature(c, opts.mask ?? EMPTY_MASK)).join('\n--\n'));
    if (f0 === f1) {
        return {
            verification: 'refuted',
            evidence: {
                method: 'differential', traces,
                detail: `both arms (${a} vs a value in no arm) produced byte-identical requests; ` +
                        'either the handle does not control this condition, or the branch is fictional',
            },
        };
    }

    // Two kinds of difference, and only the first is a branch firing. A variable
    // that also feeds a template changes the text in *both* arms, so reporting
    // "the requests differ" without saying how would overstate what was shown.
    const [s0, s1] = runs.map((r) => r.calls.map(shape).join(' | '));
    const structural = s0 !== s1
        ? `message shape changed: arm "${a}" gave [${s0}], the off-arm value gave [${s1}]`
        : undefined;
    const textual = firstDifference(f0, f1);

    return {
        verification: 'confirmed',
        evidence: {
            method: 'differential', traces,
            detail: structural
                ? `${structural}. Incidental text delta at ${textual}`
                : `same message shape [${s0}] in both arms, text differs at ${textual} ` +
                  '-- the handle reaches the prompt, but no branch was shown to fire',
        },
    };
}

function fail(r: EpisodeResult, method: 'canary' | 'differential', traces: string[], why: string): Outcome {
    const tail = (r.stderr || r.stdout).trim().split('\n').slice(-4).join(' / ');
    return {
        verification: 'uncontrollable',
        evidence: {
            method, traces,
            detail: `${why} (exit ${r.exitCode})${tail ? `: ${tail.slice(0, 400)}` : ''}`,
        },
    };
}

const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

// ---------------------------------------------------------------------- CLI

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const USAGE = `Usage: bun run acdl-verify/verify.ts --bindings <bindings.json> [options]

  --bindings <file>  output of discover.ts; updated in place
  --target <dir>     the codebase (default: the target recorded in the file)
  --run <command>    entrypoint, for bindings whose recipe drives the target itself
  --traces <dir>     where episode traces land (default acdl-verify/traces/verify)
  --python <exe>     interpreter for generated Python drivers (default: python)
  --only <key>       verify one binding (repeatable)
  --retries <n>      recipe rewrites after a failed episode (default 1)`;

async function main() {
    const file = arg('bindings');
    if (!file) { console.error(USAGE); process.exit(2); }

    const map = readBindings(file);
    const only = process.argv.reduce<string[]>(
        (acc, a, i) => a === '--only' && process.argv[i + 1] ? [...acc, process.argv[i + 1]] : acc, []);

    const updated = await verify({
        map,
        targetRoot: arg('target', map.target)!,
        traceDir: arg('traces', 'acdl-verify/traces/verify')!,
        runCommand: arg('run'),
        python: arg('python'),
        retries: Number(arg('retries', '1')),
        only: only.length ? only : undefined,
    });

    writeBindings(file, updated);
    const report = arg('report-out', file.replace(/[.]json$/, '') + '-report.md')!;
    fs.writeFileSync(report, renderReport(updated));

    const tally = new Map<string, number>();
    for (const b of updated.bindings) {
        const v = b.verification ?? 'unverified';
        tally.set(v, (tally.get(v) ?? 0) + 1);
    }
    console.log(`\n${file} updated`);
    for (const [k, n] of [...tally].sort()) console.log(`  ${String(n).padStart(3)}  ${k}`);

    const confirmed = updated.bindings.filter((b) => b.verification === 'confirmed');
    if (confirmed.length) {
        console.log('\nplacement observed (Level B, free):');
        for (const b of confirmed) {
            for (const p of b.evidenceRuntime?.placement ?? []) {
                console.log(`  ${b.key} → ${p.role}${p.message >= 0 ? `[${p.message}]` : ''}.${p.field}`);
            }
        }
    }
}

if (import.meta.main) await main();
