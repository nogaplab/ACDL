// The binding map: how to control the things a spec talks about.
//
// A binding answers one question -- "how do I make `env.customer_tier` be
// `premium` in a real run of this codebase?" -- and it is the one artefact no
// static analysis can supply, because the answer lives in the target's input
// surface rather than in the spec.
//
// A binding is proposed by a model (see discover.ts) and is therefore a
// *hypothesis*. This file owns the schema and the checks that turn hypotheses
// into evidence, in two stages of increasing strength:
//
//   grounded   the cited line really exists and really says what was claimed.
//              Deterministic, free, catches an invented flag immediately.
//   confirmed  a run with the handle set actually moved the recorded request.
//              Costs an episode; that pass is the ablation runner's job.
//
// Nothing downstream may read a binding that has not at least been grounded.

import * as fs from 'node:fs';
import { z } from 'zod';
import { resolveCited } from './provenance';

// ------------------------------------------------------------------ schema

/**
 * How a value gets into the target. The list is deliberately closed: an agent
 * that cannot fit its answer into one of these is telling us something true
 * about the codebase, and `harness` / `unreachable` are real answers rather
 * than failures.
 */
export const HandleKind = z.enum([
    'env',          // an environment variable the process reads
    'flag',         // a command-line argument
    'file',         // a config/data file read at startup
    'stdin',        // a line fed to the process
    'response',     // a resp.* value: the recording proxy's scripted reply sets it
    'harness',      // no input surface: call the builder directly with synthetic state
    'constant',     // hardcoded in this codebase; only a source edit changes it
    'unreachable',  // nothing in this codebase sets it
]);
export type HandleKind = z.infer<typeof HandleKind>;

export const Evidence = z.object({
    file: z.string().describe('Path, as cited in the spec or relative to the target root'),
    line: z.number().int().describe('1-indexed line where the claim is visible'),
    snippet: z.string().describe(
        'The exact source text at that line, copied verbatim, no paraphrase. ' +
        'This is checked against the file; a paraphrase will be rejected.'),
});
export type Evidence = z.infer<typeof Evidence>;

export const Proposal = z.object({
    key: z.string().describe('The target key being answered, copied exactly'),
    kind: HandleKind,
    handle: z.string().describe(
        'The concrete handle: variable name, flag spelling, file path, or ' +
        'the function to call for a harness. Empty for constant/unreachable.'),
    setter: z.string().describe(
        'One imperative sentence: exactly what to do to give this variable a value. ' +
        'For a harness, name the function and the argument that carries the value.'),
    evidence: Evidence,
    confidence: z.enum(['high', 'medium', 'low']),
    reasoning: z.string().describe('Two sentences at most: how the value reaches the prompt.'),
});
export type Proposal = z.infer<typeof Proposal>;

export const ProposalBatch = z.object({ bindings: z.array(Proposal) });

/**
 * An executable form of a binding: everything the runner needs to put a chosen
 * value into one episode. `{value}` is substituted wherever it appears.
 *
 * Where a Proposal is prose a human reads, a Recipe is a program a machine runs,
 * and that difference is the point -- a recipe is checked by being executed,
 * which is a far stronger claim than a citation surviving a text match.
 */
export const Recipe = z.object({
    language: z.enum(['none', 'python', 'node']).describe(
        "none = drive the target's own entrypoint; otherwise the language of the program"),
    program: z.string().describe(
        'Source for a standalone driver, or "" when the target has its own entrypoint. ' +
        'It must build the message array and POST it to the recording proxy.'),
    entry: z.string().describe('Filename to write `program` to, e.g. harness.py'),
    env: z.record(z.string(), z.string()).describe('Environment variables; values may contain {value}'),
    args: z.array(z.string()).describe('Arguments appended to the run command; may contain {value}'),
    stdin: z.string().describe('Text fed to the process on stdin; may contain {value}'),
});
export type Recipe = z.infer<typeof Recipe>;

export type BindingStatus = 'grounded' | 'rejected';

export type Binding = Proposal & {
    status: BindingStatus;
    /** Why a rejected binding was rejected; fed back to the agent on retry. */
    rejection?: string;
    /** Values worth trying, from the spec's own comparison literals. */
    domain?: string[];
    /** How to actually set this variable in one episode. */
    recipe?: Recipe;
    /**
     * Runtime proof.
     *   unverified    no episode has been run
     *   confirmed     setting the handle demonstrably moved the recorded request
     *   refuted       it ran, and the request did not move -- the handle is wrong
     *   uncontrollable  no episode could be produced at all
     */
    verification?: 'unverified' | 'confirmed' | 'refuted' | 'uncontrollable';
    /** What the confirming or refuting episode actually showed. */
    evidenceRuntime?: {
        method: 'canary' | 'differential';
        detail: string;
        /** Where the value landed: message index and role. Level B, for free. */
        placement?: Array<{ message: number; role: string; field: string }>;
        traces: string[];
    };
};

export type BindingMap = {
    version: 1;
    spec: string;
    target: string;
    generatedAt: string;
    model: string;
    bindings: Binding[];
};

// ---------------------------------------------------------------- grounding

/** How far from the cited line the snippet may actually sit. */
const SLACK = 6;

function normalize(s: string): string {
    return s.replace(/\s+/g, ' ').trim();
}

/**
 * Check a proposal against the source it cites. This is the cheap half of
 * verification and it kills the failure mode that matters most: a confidently
 * described flag that does not exist.
 *
 * Being generous about *where* the snippet sits is deliberate -- an off-by-three
 * line number is a transcription slip, whereas text that appears nowhere in the
 * file is an invention. Only the second is disqualifying.
 */
export function ground(p: Proposal, targetRoot: string): Binding {
    const reject = (rejection: string): Binding => ({ ...p, status: 'rejected', rejection });

    // These two kinds assert the *absence* of a handle, so there is no flag to
    // find -- but the cited line must still exist, or the claim is unfounded.
    const abs = resolveCited(targetRoot, p.evidence.file);
    if (!abs) return reject(`cited file '${p.evidence.file}' does not exist under the target root`);

    let lines: string[];
    try {
        lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
    } catch (e) {
        return reject(`cited file '${p.evidence.file}' could not be read: ${(e as Error).message}`);
    }
    if (p.evidence.line < 1 || p.evidence.line > lines.length) {
        return reject(
            `cited line ${p.evidence.line} is out of range for '${p.evidence.file}' ` +
            `(${lines.length} lines)`);
    }

    const want = normalize(p.evidence.snippet);
    if (!want) return reject('evidence snippet is empty');

    const lo = Math.max(0, p.evidence.line - 1 - SLACK);
    const hi = Math.min(lines.length, p.evidence.line + SLACK);
    const near = normalize(lines.slice(lo, hi).join(' '));
    if (near.includes(want)) return { ...p, status: 'grounded', verification: 'unverified' };

    // Present in the file but far from the citation: still an invention as far
    // as the evidence table is concerned, and the agent should say where it is.
    const whole = normalize(lines.join(' '));
    if (whole.includes(want)) {
        return reject(
            `snippet exists in '${p.evidence.file}' but not within ${SLACK} lines of ` +
            `the cited line ${p.evidence.line}; cite the line it is actually on`);
    }
    return reject(
        `snippet ${JSON.stringify(p.evidence.snippet)} does not appear in '${p.evidence.file}'`);
}

// ---------------------------------------------------------------------- io

export function writeBindings(file: string, map: BindingMap): void {
    fs.writeFileSync(file, JSON.stringify(map, null, 2) + '\n');
}

export function readBindings(file: string): BindingMap {
    const map = JSON.parse(fs.readFileSync(file, 'utf8')) as BindingMap;
    if (map.version !== 1) throw new Error(`unsupported binding map version ${map.version}`);
    return map;
}

/** Bindings a runner may act on: grounded, and with a handle it can drive. */
export function usable(map: BindingMap): Binding[] {
    return map.bindings.filter(
        (b) => b.status === 'grounded' && !['constant', 'unreachable'].includes(b.kind));
}

// -------------------------------------------------------------------- report

/**
 * A human-readable account of the binding map.
 *
 * This is the one artefact in acdl-verify with model-authored content in it: a
 * binding is a hypothesis about someone else's codebase, and the evidence for
 * it is a file, a line, and a claim. Everything downstream is mechanical, so
 * this is the point where a person's judgement is worth spending, and the
 * report exists to make that review possible without reading the JSON.
 */
export function renderReport(map: BindingMap): string {
    const L: string[] = [];
    const by = (p: (b: Binding) => boolean) => map.bindings.filter(p);

    const grounded = by((b) => b.status === 'grounded');
    const confirmed = by((b) => b.verification === 'confirmed');
    const refuted = by((b) => b.verification === 'refuted');
    const rejected = by((b) => b.status === 'rejected');

    L.push(`# Binding map — ${map.spec}`, '');
    L.push(`Target: \`${map.target}\`  ·  proposed by ${map.model}  ·  ${map.generatedAt}`, '');
    L.push('A binding says how to make one variable take a chosen value in a real run.',
        'It is proposed by a model, so each is checked twice: the cited line must exist and',
        'say what was claimed (*grounded*), and setting the handle must actually move the',
        'recorded request (*confirmed*). Only confirmed bindings may carry a causal claim.', '');

    L.push('| | count |', '|---|---|');
    L.push(`| bindings | ${map.bindings.length} |`);
    L.push(`| grounded | ${grounded.length} |`);
    L.push(`| confirmed at runtime | ${confirmed.length} |`);
    if (refuted.length) L.push(`| refuted at runtime | ${refuted.length} |`);
    if (rejected.length) L.push(`| rejected | ${rejected.length} |`);
    L.push('');

    const kinds = new Map<string, number>();
    for (const b of grounded) kinds.set(b.kind, (kinds.get(b.kind) ?? 0) + 1);
    if (kinds.size) {
        L.push('## How each variable is reached', '');
        L.push('| kind | count | meaning |', '|---|---|---|');
        for (const [k, n] of [...kinds].sort()) L.push(`| \`${k}\` | ${n} | ${KIND_MEANING[k] ?? ''} |`);
        L.push('');
    }

    L.push('## Bindings', '');
    L.push('| variable | kind | grounded | runtime | confidence | handle |');
    L.push('|---|---|---|---|---|---|');
    for (const b of map.bindings) {
        L.push(`| \`${b.key}\` | ${b.kind} | ${b.status === 'grounded' ? '✓' : '✗'} | ` +
            `${VERIFICATION_MARK[b.verification ?? 'unverified']} | ${b.confidence} | ` +
            `${b.handle ? `\`${trunc(b.handle, 46)}\`` : '—'} |`);
    }
    L.push('');

    L.push('## Evidence', '');
    L.push('Each snippet below was compared against the file before the binding was accepted.', '');
    for (const b of map.bindings) {
        L.push(`### \`${b.key}\` — ${b.kind}`, '');
        if (b.setter) L.push(`**To set it:** ${b.setter}`, '');
        if (b.reasoning) L.push(`**How it reaches the prompt:** ${b.reasoning}`, '');
        if (b.domain?.length) L.push(`**Values the spec compares it against:** ${b.domain.map((d) => `\`${d}\``).join(', ')}`, '');

        if (b.evidence?.file) {
            L.push(`**Cited at** \`${b.evidence.file}:${b.evidence.line}\``, '',
                '```', b.evidence.snippet, '```', '');
        }
        if (b.status === 'rejected') {
            L.push(`> **Rejected.** ${b.rejection}`, '');
        }
        const rt = b.evidenceRuntime;
        if (rt) {
            L.push(`**Runtime (${rt.method}):** ${rt.detail}`, '');
            if (rt.placement?.length) {
                L.push('Landed at: ' + rt.placement
                    .map((p) => `\`${p.role}${p.message >= 0 ? `[${p.message}]` : ''}.${p.field}\``)
                    .join(', '), '');
            }
        }
        if (b.recipe && b.recipe.language !== 'none') {
            L.push('<details><summary>Generated driver</summary>', '',
                '```' + b.recipe.language, b.recipe.program.trim(), '```', '', '</details>', '');
        }
    }

    const unusable = by((b) => ['constant', 'unreachable'].includes(b.kind) || b.status === 'rejected');
    if (unusable.length) {
        L.push('## Not controllable', '',
            'These are findings about the codebase, not failures of the tool. A variable with',
            'no input surface cannot be varied, so no causal claim about it can be tested.', '');
        for (const b of unusable) {
            L.push(`- \`${b.key}\` (${b.kind})${b.rejection ? ` — ${b.rejection}` : ''}`);
        }
        L.push('');
    }

    const unverified = grounded.filter((b) => b.verification !== 'confirmed' &&
        !['constant', 'unreachable', 'response'].includes(b.kind));
    if (unverified.length) {
        L.push('## Grounded but not yet confirmed', '',
            'The cited line exists and says what was claimed, but no episode has shown that',
            'setting the handle moves the prompt. Run `verify.ts` before relying on these.', '');
        for (const b of unverified) L.push(`- \`${b.key}\``);
        L.push('');
    }
    return L.join('\n') + '\n';
}

const KIND_MEANING: Record<string, string> = {
    env: 'an environment variable the process reads',
    flag: 'a command-line argument',
    file: 'a config or data file read at startup',
    stdin: 'a line fed to the process',
    response: 'a `resp.*` value; the proxy scripts the reply',
    harness: 'no input surface — the builder is called directly with synthetic state',
    constant: 'hardcoded; only a source edit changes it',
    unreachable: 'nothing in this codebase sets it',
};

const VERIFICATION_MARK: Record<string, string> = {
    confirmed: '✓ confirmed', refuted: '✗ refuted',
    uncontrollable: '— uncontrollable', unverified: '· unverified',
};

const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
