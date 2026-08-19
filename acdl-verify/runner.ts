// Run episodes: one target, one assignment of variables, one recorded trace.
//
// This is the unit every empirical claim in acdl-verify is built from. A canary
// check is one episode; a paired ablation is two that differ in a single
// assignment; a time sweep is one per value of @T; the nondeterminism baseline
// is the same assignment run twice.
//
// It contains no model calls and no judgement -- it applies a recipe, starts the
// proxy, runs the target, and hands back what was recorded.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import {
    startProxy, targetEnv, readTrace,
    type CallRecord, type Scenario, type Responder,
} from './proxy';
import type { Recipe } from './bindings';

/**
 * What an episode holds fixed. Keys are ACDL variable names (`env.customer_tier`),
 * plus the reserved `time` axis. A recipe reads them from `{key}` placeholders or
 * from `ACDL_*` environment variables.
 */
export type Assignments = Record<string, string>;

/** The reserved axis for @T: which time index the episode should run at. */
export const TIME = 'time';

/** Back-compatible alias for the episode's primary variable. */
export const VALUE = '{value}';

export function substitute(text: string, assignments: Assignments, primary?: string): string {
    let out = text;
    if (primary !== undefined && assignments[primary] !== undefined) {
        out = out.split(VALUE).join(assignments[primary]);
    }
    for (const [k, v] of Object.entries(assignments)) out = out.split(`{${k}}`).join(v);
    return out;
}

/** `env.customer_tier` -> `ACDL_ENV_CUSTOMER_TIER`, so a recipe can read it. */
export function envName(key: string): string {
    return 'ACDL_' + key.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

/**
 * A value nothing in the target could produce on its own. Deterministic per key
 * so a rerun looks for the same string, and short enough to survive a template
 * that truncates.
 */
export function canary(seed: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
        h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193) >>> 0;
    }
    return `ACDLV${h.toString(16).toUpperCase().padStart(8, '0')}`;
}

export type EpisodeOptions = {
    targetRoot: string;
    tracePath: string;
    episode: string;
    recipe: Recipe;
    /** Every variable this episode fixes, including `time`. */
    assignments: Assignments;
    /** Which assignment `{value}` and `ACDL_VALUE` refer to. */
    primary?: string;
    /**
     * Where replies come from. `scripted` needs no network and is deterministic;
     * `record` forwards to a real provider, which is what a realistic episode
     * needs and what makes a nondeterminism baseline mandatory.
     */
    mode?: 'scripted' | 'record';
    scenario?: Scenario;
    baseUrl?: string;
    /** Answers each call from something other than the scenario -- e.g. a live model. */
    responder?: Responder;
    /**
     * Drive the target's own loop to exactly this many model calls, then end the
     * turn. This is how `@T` is controlled for an agent that cannot be told what
     * turn it is on: we keep answering with a tool call until the turn we want.
     * Costs one call per turn, so seeding the target's state is cheaper when a
     * binding for it exists.
     */
    turns?: number;
    /** Entrypoint for a `language: none` recipe -- the target's own run command. */
    runCommand?: string;
    /** Interpreters, overridable because a repo's venv is not always the one on PATH. */
    python?: string;
    node?: string;
    timeoutMs?: number;
    verbose?: boolean;
};

export type EpisodeResult = {
    tracePath: string;
    calls: CallRecord[];
    assignments: Assignments;
    exitCode: number;
    stdout: string;
    stderr: string;
    /** Command actually executed, for the report and for reproducing by hand. */
    command: string;
};

const DEFAULT_SCENARIO: Scenario = {
    name: 'episode',
    replies: [{ text: 'acdl-verify: acknowledged.', repeat: 8 }],
    maxCalls: 12,
};

/**
 * A recipe with `language: none` drives the target's own entrypoint; anything
 * else writes a generated program into a scratch directory and runs that. The
 * scratch directory is deliberately outside the target: verification must never
 * modify the codebase under test.
 */
export async function runEpisode(opts: EpisodeOptions): Promise<EpisodeResult> {
    const { recipe, assignments } = opts;
    const sub = (s: string) => substitute(s, assignments, opts.primary);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'acdl-episode-'));

    let argv: string[] | undefined;
    let raw: string | undefined;
    if (recipe.language === 'none') {
        if (!opts.runCommand) throw new Error('a language:none recipe needs a --run command');
        const cmd = sub(opts.runCommand);
        // A command with a pipe or a redirect wants shell semantics, and
        // re-quoting would turn its operators into literal arguments. Anything
        // simpler is parsed and re-quoted so one spelling works on every platform.
        if (needsShell(cmd)) raw = cmd;
        else argv = tokenize(cmd);
    } else {
        const fallback = recipe.language === 'python' ? 'harness.py' : 'harness.mjs';
        const entry = path.join(work, recipe.entry || fallback);
        fs.writeFileSync(entry, recipe.program);
        const exe = recipe.language === 'python' ? (opts.python ?? 'python') : (opts.node ?? 'node');
        argv = [exe, entry];
    }
    const command = argv
        ? buildCommand([...argv, ...recipe.args.map(sub)])
        : raw! + recipe.args.map((a) => ` ${quoteArg(sub(a))}`).join('');

    // How this episode reaches its time index. A generated driver reads
    // ACDL_TIME and builds that many turns in one call; a target we merely
    // launch has never heard of ACDL_TIME, so `@T` is reached by letting its own
    // loop run that many times. Choosing automatically means `--time` means the
    // same thing whichever kind of recipe is in play.
    const wantsTime = assignments[TIME] !== undefined;
    const templated = recipe.language === 'none' && (opts.runCommand ?? '').includes(`{${TIME}}`);
    const turns = opts.turns
        ?? (wantsTime && recipe.language === 'none' && !templated
            ? Number(assignments[TIME]) : undefined);

    // A turn budget has to sit outside whatever else answers, because its job is
    // to override a reply that would end the turn too early.
    let responder = opts.responder;
    if (turns && turns > 0) {
        const { keepAliveResponder } = await import('./responder');
        responder = keepAliveResponder({ turns, base: opts.responder });
    }

    const proxy = await startProxy({
        mode: opts.mode === 'record' ? 'record' : 'scripted',
        scenario: opts.scenario ?? DEFAULT_SCENARIO,
        responder,
        baseUrl: opts.baseUrl,
        tracePath: opts.tracePath,
        port: 0,
        verbose: false,
        episode: {
            episode: opts.episode,
            cwd: path.resolve(opts.targetRoot),
            run: command,
            variables: assignments,
            provider: 'anthropic',
        },
    });

    // Assignments reach the recipe two ways: substituted into env/args/stdin, and
    // exported wholesale, so a generated driver can read an axis the recipe's
    // author did not think to template.
    const env: Record<string, string> = { ...targetEnv(proxy.port) };
    for (const [k, v] of Object.entries(assignments)) env[envName(k)] = v;
    if (opts.primary && assignments[opts.primary] !== undefined) {
        env.ACDL_VALUE = assignments[opts.primary];
    }
    if (assignments[TIME] !== undefined) env.ACDL_TIME = assignments[TIME];
    for (const [k, v] of Object.entries(recipe.env)) env[k] = sub(v);

    const r = await exec(
        command, opts.targetRoot, env,
        recipe.stdin ? sub(recipe.stdin) : undefined,
        opts.timeoutMs ?? 120_000);

    await proxy.close(r.code);
    if (opts.verbose) {
        console.error(`  ${opts.episode}: exit ${r.code}, ${proxy.modelCalls()} model call(s)`);
    }
    fs.rmSync(work, { recursive: true, force: true });

    return {
        tracePath: opts.tracePath,
        calls: readTrace(opts.tracePath).calls,
        assignments,
        exitCode: r.code, stdout: r.out, stderr: r.err, command,
    };
}

/**
 * Split a command line into arguments, honouring both quote styles.
 *
 * The alternative -- handing the raw string to a shell -- is what made `--run`
 * platform-dependent: cmd.exe does not treat `'` as a quote at all, so a POSIX
 * habit like `node 'C:/a b/x.js'` reaches the target with the quotes still in
 * the path, and the file is not found. Parsing here and re-quoting per platform
 * makes one spelling work on both.
 */
export function tokenize(command: string): string[] {
    const out: string[] = [];
    let cur = '';
    let quote: '"' | "'" | undefined;
    let started = false;

    for (let i = 0; i < command.length; i++) {
        const c = command[i];
        if (quote) {
            // Inside single quotes everything is literal, POSIX-style.
            if (c === quote) quote = undefined;
            else if (c === '\\' && quote === '"' && i + 1 < command.length) cur += command[++i];
            else cur += c;
            continue;
        }
        if (c === '"' || c === "'") { quote = c; started = true; continue; }
        if (c === '\\' && i + 1 < command.length && /\s/.test(command[i + 1])) { cur += command[++i]; continue; }
        if (/\s/.test(c)) {
            if (cur || started) { out.push(cur); cur = ''; started = false; }
            continue;
        }
        cur += c;
    }
    if (cur || started) out.push(cur);
    return out;
}

/** Quote one argument for the platform's shell. */
export function quoteArg(s: string, win = process.platform === 'win32'): string {
    if (s === '') return win ? '""' : "''";
    if (!/[\s"'|&;<>$`(){}\[\]*?~^%!]/.test(s)) return s;
    if (win) {
        // cmd.exe: double quotes delimit, and "" is a literal quote inside them.
        return `"${s.replace(/"/g, '""')}"`;
    }
    return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * An argv rendered back into something the platform's shell re-splits the same
 * way. `shell: true` is kept because it is what resolves `python` to
 * `python.exe` and `npm` to `npm.cmd` on Windows; what changes is that the
 * string handed to it is quoted for *that* shell rather than for whichever one
 * the caller had in mind.
 */
export function buildCommand(argv: string[], win = process.platform === 'win32'): string {
    return argv.map((a) => quoteArg(a, win)).join(' ');
}

/**
 * Shell metacharacters that mean the caller wants more than word splitting.
 * Quotes are deliberately not in this set: they are how arguments are
 * delimited, and re-quoting them is the whole point.
 */
const SHELL_META = /[|&;<>$`(){}*]/;

/** True when a command needs a shell for more than word splitting. */
export function needsShell(command: string): boolean {
    const bare = command.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');
    return SHELL_META.test(bare);
}

function exec(
    command: string, cwd: string, env: Record<string, string>,
    stdin: string | undefined, timeoutMs: number,
): Promise<{ code: number; out: string; err: string }> {
    return new Promise((resolve) => {
        const child = spawn(command, {
            shell: true, cwd,
            env: { ...process.env, ...env },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let out = '', err = '';
        const timer = setTimeout(() => {
            child.kill();
            err += '\nacdl-verify: episode timed out';
        }, timeoutMs);
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { err += d; });
        child.on('error', (e) => {
            clearTimeout(timer);
            resolve({ code: -1, out, err: err + String(e) });
        });
        child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 0, out, err }); });
        child.stdin.end(stdin ?? '');
    });
}

// ------------------------------------------------------------------ matrix

export type MatrixOptions = Omit<EpisodeOptions, 'assignments' | 'episode' | 'tracePath'> & {
    /** One list of values per variable. The episodes are the cartesian product. */
    axes: Record<string, string[]>;
    /** Held at the same value in every episode. */
    fixed?: Assignments;
    traceDir: string;
    name: string;
    /** Repeats of each cell, for the nondeterminism baseline. */
    repeats?: number;
};

export function cells(axes: Record<string, string[]>, fixed: Assignments = {}): Assignments[] {
    let out: Assignments[] = [{ ...fixed }];
    for (const [k, values] of Object.entries(axes)) {
        out = out.flatMap((base) => values.map((v) => ({ ...base, [k]: v })));
    }
    return out;
}

/**
 * Run every combination of the axes. Episodes run in sequence rather than in
 * parallel: each one owns a port and a child process, and a target that writes
 * to its own working directory would race itself.
 */
export async function runMatrix(opts: MatrixOptions): Promise<EpisodeResult[]> {
    const grid = cells(opts.axes, opts.fixed);
    const repeats = opts.repeats ?? 1;
    const out: EpisodeResult[] = [];

    fs.mkdirSync(opts.traceDir, { recursive: true });
    for (const [i, assignments] of grid.entries()) {
        for (let r = 0; r < repeats; r++) {
            const suffix = repeats > 1 ? `-r${r + 1}` : '';
            const episode = `${opts.name}-${i + 1}${suffix}`;
            out.push(await runEpisode({
                ...opts,
                assignments,
                episode,
                tracePath: path.join(opts.traceDir, `${episode}.jsonl`),
            }));
        }
    }
    return out;
}

// ------------------------------------------------------------- observation

export type Placement = { message: number; role: string; field: string };

/** Every string in a recorded request, keyed by where it sits. */
export function collectStrings(call: CallRecord): Map<string, string> {
    const out = new Map<string, string>();
    const req = call.request;
    if (!req) return out;

    const walk = (node: unknown, prefix: string) => {
        if (typeof node === 'string') out.set(prefix, node);
        else if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${prefix}[${i}]`));
        else if (node && typeof node === 'object') {
            for (const [k, v] of Object.entries(node)) walk(v, `${prefix}.${k}`);
        }
    };

    if (req.system !== undefined) walk(req.system, 'system');
    (req.messages ?? []).forEach((m: any, i: number) => walk(m.content, `${m.role}[${i}].content`));
    return out;
}

/**
 * Where a string landed in a recorded request. Finding the canary is what proves
 * a binding; *where* it was found is Level B placement, obtained for free.
 */
export function locate(call: CallRecord, needle: string): Placement[] {
    const out: Placement[] = [];
    if (!needle) return out;
    for (const [p, v] of collectStrings(call)) {
        if (!v.includes(needle)) continue;
        const m = /^(\w+)\[(\d+)\]\.content(.*)$/.exec(p);
        if (m) out.push({ message: Number(m[2]), role: m[1], field: `content${m[3]}` });
        else out.push({ message: -1, role: 'system', field: p });
    }
    return out;
}

/**
 * The role sequence of a request, in check.ts's notation. A branch that adds or
 * removes a message shows up here and nowhere else, which is why a differential
 * reports this separately from any incidental text change.
 */
export function shape(call: CallRecord): string {
    const req = call.request ?? {};
    const letters: string[] = [];
    if (req.system !== undefined) letters.push('S');
    for (const m of req.messages ?? []) {
        const blocks = Array.isArray(m.content) ? m.content : [];
        const allResults = blocks.length > 0 && blocks.every((b: any) => b.type === 'tool_result');
        if (m.role === 'user' && allResults) letters.push(...blocks.map(() => 'T'));
        else letters.push(String(m.role)[0].toUpperCase());
    }
    return letters.join(' ');
}

// ------------------------------------------------------- masking the noise

/**
 * Shapes that are volatile by construction. Masking these unconditionally is
 * safe -- no ACDL claim is ever about the value of a uuid -- and it keeps the
 * empirical baseline from having to rediscover them on every target.
 */
const VOLATILE: Array<[RegExp, string]> = [
    [/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, '<uuid>'],
    [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<timestamp>'],
    [/\b(?:msg|toolu|call|chatcmpl|resp)[-_][A-Za-z0-9]{6,}\b/g, '<id>'],
    [/\b[0-9a-f]{32,}\b/g, '<hex>'],
    [/\b1[6-9]\d{11}\b/g, '<epoch-ms>'],
];

export function scrub(text: string): string {
    let out = text;
    for (const [re, to] of VOLATILE) out = out.replace(re, to);
    return out;
}

/** Paths whose content is not stable, and must not be compared. */
export type Mask = { paths: Set<string>; sources: number };

export const EMPTY_MASK: Mask = { paths: new Set(), sources: 0 };

/**
 * Everything that moved between runs that should have been identical.
 *
 * The README calls this out as mandatory and it is: against a live model, a
 * causal diff that has not subtracted the run-to-run noise is measuring the
 * model's mood as much as the perturbation. Skip it and every Level C result is
 * untrustworthy.
 */
export function baseline(runs: EpisodeResult[]): Mask {
    const paths = new Set<string>();
    if (runs.length < 2) return { paths, sources: runs.length };

    const depth = Math.min(...runs.map((r) => r.calls.length));
    for (let c = 0; c < depth; c++) {
        const maps = runs.map((r) => collectStrings(r.calls[c]));
        const keys = new Set(maps.flatMap((m) => [...m.keys()]));
        for (const k of keys) {
            const values = maps.map((m) => scrub(m.get(k) ?? '<absent>'));
            if (values.some((v) => v !== values[0])) paths.add(k);
        }
    }
    return { paths, sources: runs.length };
}

export function mergeMasks(...masks: Mask[]): Mask {
    const paths = new Set<string>();
    for (const m of masks) for (const p of m.paths) paths.add(p);
    return { paths, sources: Math.max(0, ...masks.map((m) => m.sources)) };
}

/**
 * A request reduced to what is worth comparing: volatile shapes scrubbed, unstable
 * paths dropped. Two episodes differing only in an injected value must differ
 * here too, or the value never reached the prompt.
 */
export function signature(call: CallRecord, mask: Mask = EMPTY_MASK): string {
    const lines: string[] = [];
    for (const [p, v] of collectStrings(call)) {
        if (mask.paths.has(p)) continue;
        lines.push(`${p} = ${scrub(v)}`);
    }
    return lines.join('\n');
}

/** First path at which two signatures disagree, for a readable report. */
export function firstDifference(a: string, b: string): string {
    const la = a.split('\n'), lb = b.split('\n');
    for (let i = 0; i < Math.max(la.length, lb.length); i++) {
        if (la[i] === lb[i]) continue;
        const trim = (s?: string) => JSON.stringify((s ?? '<absent>').slice(0, 90));
        return `${trim(la[i])} vs ${trim(lb[i])}`;
    }
    return 'the signatures are equal';
}
