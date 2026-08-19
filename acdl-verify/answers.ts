// The answer side: making `resp.*` take a chosen value.
//
// `env.*` and `sys.*` are inputs and need a handle in the target's code. `resp.*`
// is the opposite -- it is what the model said on an earlier call, so the proxy
// controls it completely. What is *not* obvious is how a value must be shaped so
// the target extracts it as the variable in question: a text block, a field
// inside a tool call, or text wrapped in whatever tags the target parses.
//
// That question is answered by experiment rather than by reading code. Emit a
// canary each way, run the episode, and see which one comes back in the *next*
// request. The strategy that lands is proven by construction, and where it landed
// is the answer-side placement.
//
// The domain of a `resp.*` variable needs no discovery at all: a spec that
// branches on one states its own comparison values.

import { z } from 'zod';
import { extractTargets, roleAt, type Target } from './provenance';
import { locate, type Placement } from './runner';
import type { CallRecord, Reply, Responder } from './proxy';

// ------------------------------------------------------------------ schema

/** How to shape a value so the target reads it back as one `resp.*` variable. */
export const AnswerVia = z.object({
    mode: z.enum(['text', 'tool']),
    /** Tool to call, when mode is "tool". */
    tool: z.string(),
    /** Field of that tool's input carrying the value. */
    field: z.string(),
    /** Wraps the value; `{value}` alone means "emit it bare". */
    template: z.string(),
});
export type AnswerVia = z.infer<typeof AnswerVia>;

export type AnswerSlot = {
    key: string;
    /**
     * Values the spec compares this against. Taken from the spec's own `If` and
     * `Switch` literals, so the arm domain is stated, never inferred.
     */
    domain: string[];
    /** Conditions that read this variable, for the report. */
    conditions: string[];
    /**
     * Roles the spec puts this variable under. A probe that lands somewhere else
     * has found *a* way to move a value into the context, not necessarily *this*
     * variable, and the difference matters.
     */
    expectRoles?: Array<'system' | 'user' | 'assistant' | 'tool'>;
    /** Line of first appearance in the spec, used to check landing order. */
    specOrder?: number;
    via?: AnswerVia;
    placement?: Placement[];
    status?: 'confirmed' | 'misplaced' | 'ambiguous' | 'unreachable';
    /** Position this slot could only reach by treading on another variable's. */
    collidedWith?: string;
    detail?: string;
};

/**
 * Every `resp.*` the spec mentions, with the domain each condition imposes.
 * Deterministic: no model, no code reading.
 */
export function extractAnswerSchema(specText: string): AnswerSlot[] {
    const targets = extractTargets(specText);
    const conditions = targets.filter((t) => t.kind === 'condition');

    return targets
        .filter((t) => t.kind === 'context-var' && t.key.startsWith('resp.'))
        .map((t) => {
            const mine = conditions.filter((c) => c.subjects.includes(t.key));
            const domain = [...new Set(mine.flatMap((c) => c.literals))];
            const roles = [...new Set(t.occurrences
                .map((o) => roleAt(specText, o.line)).filter(Boolean))] as AnswerSlot['expectRoles'];
            return {
                key: t.key, domain, conditions: mine.map((c) => c.label), expectRoles: roles,
                specOrder: Math.min(...t.occurrences.map((o) => o.line)),
            };
        });
}

/** Slots a scenario must be able to drive, i.e. the ones a branch depends on. */
export function branchingSlots(slots: AnswerSlot[]): AnswerSlot[] {
    return slots.filter((s) => s.domain.length > 0);
}

// -------------------------------------------------------------- candidates

/**
 * The ways a value could plausibly be delivered, given what the target offered.
 * Small enough to try exhaustively, which is why this needs no model: the tool
 * list and its schemas come from the request the target just sent.
 */
export function candidates(request: any, templates: string[] = ['{value}']): AnswerVia[] {
    const out: AnswerVia[] = [];
    for (const template of templates) {
        out.push({ mode: 'text', tool: '', field: '', template });
    }
    for (const t of request?.tools ?? []) {
        const schema = t.input_schema ?? t.parameters ?? {};
        const fields = Object.keys(schema.properties ?? {});
        for (const field of fields.length ? fields : ['input']) {
            out.push({ mode: 'tool', tool: t.name, field, template: '{value}' });
        }
    }
    return out;
}

/**
 * Tag wrappers worth trying when a target parses its own protocol out of the
 * text -- MINT's `<execute>`, a ReAct `Action:` line. Derived from the spec's
 * own literals so we only ever try tags the spec gives a reason to expect.
 */
export function templatesFor(slot: AnswerSlot): string[] {
    const tag = slot.key.split('.').pop() ?? 'value';
    return ['{value}', `<${tag}>{value}</${tag}>`, `${tag}: {value}`];
}

// -------------------------------------------------------------- responders

export type AnswerPlan = Record<string, string>;

function fill(via: AnswerVia, value: string): Reply {
    const text = via.template.split('{value}').join(value);
    if (via.mode === 'tool') {
        return { tools: [{ name: via.tool, input: { [via.field]: text } }] };
    }
    return { text };
}

/**
 * Emit chosen `resp.*` values. Optionally wraps another responder: the live model
 * produces the turn, and only the field under test is overridden -- so the
 * episode stays realistic everywhere the experiment is not looking.
 */
export function answerResponder(opts: {
    slots: AnswerSlot[];
    plan: AnswerPlan;
    /** Consulted first; its reply is overridden only where the plan applies. */
    base?: Responder;
    /** Reply used once the plan is exhausted, to let the episode wind down. */
    tail?: Reply;
}): Responder {
    const byKey = new Map(opts.slots.map((s) => [s.key, s]));

    return async (request, callIndex) => {
        const baseReply = opts.base ? await opts.base(request, callIndex) : undefined;

        // One planned value per call, in the order the plan lists them, so a
        // multi-step episode can walk a different arm at each step.
        const entries = Object.entries(opts.plan);
        const entry = entries[callIndex];
        if (!entry) return baseReply ?? opts.tail ?? { text: 'acdl-verify: plan exhausted.' };

        const [key, value] = entry;
        const via = byKey.get(key)?.via;
        if (!via) return baseReply ?? { text: value };

        const planned = fill(via, value);
        if (!baseReply || via.mode === 'tool') return planned;

        // Steered-live: keep the model's own text, append the planned value, so
        // the reply reads as a real turn that also carries what we need.
        if ('text' in baseReply && 'text' in planned) {
            return { text: `${baseReply.text}\n${planned.text}` };
        }
        return planned;
    };
}

// ------------------------------------------------------------ verification

/**
 * Did a value emitted at call `k` come back in the request at call `k+1`?
 *
 * This is the answer-side canary, and it is the only evidence that matters: a
 * strategy that produces a reply the target discards has not controlled
 * anything, however plausible it looked.
 */
export function landed(calls: CallRecord[], emittedAt: number, value: string): Placement[] {
    const next = calls[emittedAt + 1];
    return next ? locate(next, value) : [];
}

export function describeSlot(s: AnswerSlot): string {
    const dom = s.domain.length ? `domain {${s.domain.join(', ')}}` : 'free-form';
    const via = s.via
        ? s.via.mode === 'tool'
            ? `via ${s.via.tool}.${s.via.field}`
            : `via text${s.via.template === '{value}' ? '' : ` as ${s.via.template}`}`
        : 'no delivery found';
    return `${s.key}  ${dom}  ${via}`;
}

/**
 * Find the delivery strategy by trying them. `run` emits the canary one way and
 * returns the calls that resulted; the first strategy whose value reappears in a
 * later request wins.
 *
 * Search beats asking a model here: the candidate set is small and bounded by
 * the tools the target itself offered, and a candidate that survives has been
 * demonstrated rather than argued for.
 */
export async function probeVia(
    slot: AnswerSlot,
    cands: AnswerVia[],
    value: string,
    run: (via: AnswerVia) => Promise<CallRecord[]>,
    /**
     * Positions already spoken for by an earlier slot. Two variables cannot both
     * live in the same place, so a delivery landing on a claimed position has
     * found *a* route into the context rather than *this* variable's route.
     */
    claimed: Set<string> = new Set(),
): Promise<AnswerSlot> {
    const tried: string[] = [];
    let collided: string | undefined;

    for (const via of cands) {
        const calls = await run(via);
        const placement = landed(calls, 0, value);
        const clash = placement.map(fmt).find((p) => claimed.has(p));
        if (placement.length && clash) {
            // Keep looking: a different delivery may reach a position of its own.
            collided = clash;
            tried.push(`${describeVia(via)} (landed on ${clash}, already claimed)`);
            continue;
        }
        if (placement.length) {
            const where = placement.map(fmt).join(', ');
            // Landing anywhere proves deliverability. Landing where the spec says
            // this variable lives is what makes it *this* variable.
            const expected = slot.expectRoles ?? [];
            const fits = !expected.length || placement.some((p) => expected.includes(p.role as any));
            return fits
                ? { ...slot, via, placement, status: 'confirmed',
                    detail: `emitted ${describeVia(via)} and came back at ${where}` }
                : { ...slot, via, placement, status: 'misplaced',
                    detail: `emitted ${describeVia(via)} and it did come back, at ${where}, but the ` +
                            `spec puts ${slot.key} under ${expected.join('/')}: this delivery moves ` +
                            'a value into the context without being that variable' };
        }
        tried.push(describeVia(via) + (calls.length < 2 ? ' (episode ended after one call)' : ''));
    }

    if (collided) {
        return {
            ...slot, status: 'ambiguous', collidedWith: collided,
            detail: `every delivery that reached the context landed on ${collided}, which ` +
                    'another variable already occupies; these two cannot be told apart by ' +
                    'position, so neither is confirmed',
        };
    }
    return {
        ...slot, status: 'unreachable',
        detail: `no delivery reached the next request; tried ${tried.length}: ${tried.join('; ')}`,
    };
}

/**
 * Cross-check probed slots against each other.
 *
 * Landing somewhere proves a value can be delivered. Being *this* variable needs
 * two further things the spec states and a single probe cannot see: no two
 * variables occupy one position, and their positions run in the order the spec
 * lists them. Without these, a probe that finds any route into the context
 * reports success for whichever variable happened to be asked about first.
 */
export function reconcile(slots: AnswerSlot[]): AnswerSlot[] {
    const out = slots.map((s) => ({ ...s }));

    // A slot that could only reach a position another variable already holds
    // implicates that variable too: whoever was asked first is not thereby
    // right, so the incumbent loses its confirmation as well.
    const contested = new Set(out.map((s) => s.collidedWith).filter(Boolean) as string[]);
    for (const s of out) {
        if (s.status !== 'confirmed') continue;
        const hit = (s.placement ?? []).map(fmt).find((p) => contested.has(p));
        if (!hit) continue;
        s.status = 'ambiguous';
        s.detail = `another resp.* variable could only reach ${hit} as well; being asked ` +
                   'about first is not evidence, so this is not confirmed either';
    }

    // Distinctness: a shared position means at most one of them is right, and
    // nothing here says which, so neither is confirmed.
    const byPos = new Map<string, AnswerSlot[]>();
    for (const s of out) {
        if (s.status !== 'confirmed') continue;
        for (const p of s.placement ?? []) {
            const k = fmt(p);
            byPos.set(k, [...(byPos.get(k) ?? []), s]);
        }
    }
    for (const [pos, group] of byPos) {
        if (group.length < 2) continue;
        for (const s of group) {
            s.status = 'ambiguous';
            s.detail = `${group.map((g) => g.key).join(' and ')} both landed at ${pos}; ` +
                       'position cannot tell them apart, so neither is confirmed';
        }
    }

    // Ordering: inside one message, spec order must be wire order.
    const ranked = out
        .filter((s) => s.status === 'confirmed' && s.placement?.length)
        .map((s) => ({ s, p: s.placement![0] }))
        .filter((x) => x.p.message >= 0)
        .sort((a, b) => (a.s.specOrder ?? 0) - (b.s.specOrder ?? 0));

    for (let i = 1; i < ranked.length; i++) {
        const prev = ranked[i - 1], cur = ranked[i];
        if (prev.p.message !== cur.p.message) continue;
        if (fieldOrder(prev.p.field) <= fieldOrder(cur.p.field)) continue;
        cur.s.status = 'misplaced';
        cur.s.detail =
            `the spec lists ${prev.s.key} before ${cur.s.key}, but they landed at ` +
            `${fmt(prev.p)} and ${fmt(cur.p)}: the wire order contradicts the spec`;
    }
    return out;
}

/** Sort key for a content path, so `content[0]` precedes `content[1]`. */
function fieldOrder(field: string): number {
    const m = /\[(\d+)\]/.exec(field);
    return m ? Number(m[1]) : 0;
}

export function describeVia(v: AnswerVia): string {
    return v.mode === 'tool' ? `${v.tool}.${v.field}` : `text ${JSON.stringify(v.template)}`;
}

const fmt = (p: Placement) =>
    `${p.role}${p.message >= 0 ? `[${p.message}]` : ''}.${p.field}`;

// ---------------------------------------------------------------------- CLI

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runEpisode, canary } from './runner';
import { readBindings } from './bindings';
import type { Recipe } from './bindings';

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PASSTHRU: Recipe = {
    language: 'none', entry: '', program: '', env: {}, args: [], stdin: '',
};

const USAGE = `Usage: bun run acdl-verify/answers.ts --spec <file.acdl> [options]

  --spec <file>       the specification whose resp.* variables to schematise
  --target <dir>      the codebase, when probing
  --run <command>     entrypoint to drive while probing
  --bindings <file>   reuse a generated recipe instead of --run
  --recipe <key>      which binding's recipe to drive with
  --python <exe>      interpreter for a generated Python driver
  --traces <dir>      default acdl-verify/traces/answers

With no --run and no --bindings, the schema is derived from the spec alone and
no episode is run.`;

async function main() {
    const specFile = arg('spec');
    if (!specFile) { console.error(USAGE); process.exit(2); }

    const slots = extractAnswerSchema(fs.readFileSync(specFile, 'utf8'));
    console.log(`spec   ${specFile}`);
    console.log(`resp.* variables: ${slots.length}, of which ${branchingSlots(slots).length} gate a branch\n`);
    for (const s of slots) {
        console.log(`  ${s.key}`);
        console.log(`    domain: ${s.domain.length ? s.domain.join(', ') : '(free-form: no condition compares it)'}`);
        for (const c of s.conditions) console.log(`    gates:  ${c}`);
    }

    const runCommand = arg('run');
    const bindingsFile = arg('bindings');
    if (!runCommand && !bindingsFile) {
        console.log('\nno --run or --bindings, so delivery was not probed');
        return;
    }

    let recipe = PASSTHRU;
    if (bindingsFile) {
        const map = readBindings(bindingsFile);
        const key = arg('recipe');
        const b = map.bindings.find((x) => x.recipe && (!key || x.key === key));
        if (!b?.recipe) { console.error('no usable recipe in that bindings file'); process.exit(2); }
        recipe = b.recipe;
    }

    const targetRoot = arg('target', '.')!;
    const traceDir = arg('traces', 'acdl-verify/traces/answers')!;
    fs.mkdirSync(traceDir, { recursive: true });

    const episode = (tag: string, responder?: any) => runEpisode({
        targetRoot, recipe, runCommand, python: arg('python'),
        tracePath: path.join(traceDir, `${tag}.jsonl`),
        episode: tag, assignments: {}, responder,
    });

    // A pilot run answers the only question the candidate set depends on: what
    // tools did the target offer, and does it come back for a second call at all.
    console.log('\npilot episode…');
    const pilot = await episode('pilot');
    if (!pilot.calls.length) {
        console.error(`the target sent no model request (exit ${pilot.exitCode}); nothing to probe`);
        process.exit(1);
    }
    console.log(`  ${pilot.calls.length} call(s); tools offered: ` +
        `${(pilot.calls[0].request?.tools ?? []).map((t: any) => t.name).join(', ') || '(none)'}`);
    if (pilot.calls.length < 2) {
        console.log('  only one call: a resp.* value can never be observed re-entering the context here');
    }

    console.log('\nprobing delivery…');
    const probed: AnswerSlot[] = [];
    // Positions already taken. Without this, every slot finds the same route and
    // the first question asked wins, which is not evidence about the others.
    const claimed = new Set<string>();

    for (const slot of slots) {
        const value = canary(slot.key);
        const cands = candidates(pilot.calls[0].request, templatesFor(slot));
        let n = 0;
        const result = await probeVia(slot, cands, value, async (via) => {
            const tag = `${slot.key.replace(/\W/g, '_')}-${++n}`;
            const r = await episode(tag, answerResponder({
                slots: [{ ...slot, via }], plan: { [slot.key]: value },
            }));
            return r.calls;
        }, claimed);

        for (const p of result.placement ?? []) {
            claimed.add(`${p.role}${p.message >= 0 ? `[${p.message}]` : ''}.${p.field}`);
        }
        probed.push(result);
    }

    const final = reconcile(probed);
    for (const s of final) {
        console.log(`  ${s.status === 'confirmed' ? '✓' : s.status === 'unreachable' ? '✗' : '?'} ` +
                    `${s.key}: ${s.detail}`);
    }

    const ok = final.filter((s) => s.status === 'confirmed');
    console.log(`\n${ok.length}/${final.length} resp.* variables can be driven`);
    for (const s of ok) console.log(`  ${describeSlot(s)}`);

    const unsure = final.filter((s) => s.status === 'ambiguous' || s.status === 'misplaced');
    if (unsure.length) {
        console.log(`\n${unsure.length} could not be told apart by position alone:`);
        for (const s of unsure) console.log(`  ${s.key} (${s.status})`);
    }
}

if (import.meta.main) await main();
