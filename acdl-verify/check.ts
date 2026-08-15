// Level A checking: compare what a spec predicts against what was recorded.
//
//   bun run acdl-verify/check.ts --spec acdl-agent/acdl-agent.acdl \
//                                --trace acdl-verify/traces/acdl-agent-loop3.jsonl
//
// Level A uses no binding map. It checks message count, role sequence, loop
// bounds, and prefix monotonicity -- the claims that need no knowledge of what
// any particular piece of content says.

import * as fs from 'node:fs';
import { Parser } from '../src/parser';
import type * as AST from '../src/types';
import { evaluate, exprText, Unsupported, type Prediction, type Resolver, type Scope } from './evaluate';

// ------------------------------------------------------- observed messages

export type Observed = {
    role: AST.Role;
    /** Wire block types, for diagnostics: 'text', 'tool_use(read_file)', ... */
    blocks: string[];
};

/**
 * Anthropic wire format -> the message list ACDL describes. Two conventions have
 * to be bridged, and both are provider facts rather than facts about any spec:
 *
 *  - `system` travels in its own top-level field, not in `messages`.
 *  - a tool result is a `tool_result` block inside a *user* message. ACDL models
 *    each such result as its own `T:` message, so one wire message carrying n
 *    results normalizes to n tool messages.
 */
export function normalizeAnthropic(request: any): Observed[] {
    const out: Observed[] = [];

    if (request.system !== undefined) {
        const sys = Array.isArray(request.system) ? request.system : [{ type: 'text' }];
        const tools = (request.tools ?? []).map((t: any) => `tool_schema(${t.name})`);
        out.push({ role: 'system', blocks: [...tools, ...sys.map((b: any) => b.type ?? 'text')] });
    }

    for (const m of request.messages ?? []) {
        const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text' }];
        const results = blocks.filter((b: any) => b.type === 'tool_result');

        if (m.role === 'user' && results.length > 0 && results.length === blocks.length) {
            for (const r of results) out.push({ role: 'tool', blocks: ['tool_result'] });
            continue;
        }
        out.push({
            role: m.role,
            blocks: blocks.map((b: any) => b.type + (b.name ? `(${b.name})` : '')),
        });
    }
    return out;
}

// -------------------------------------------------------------- resolver

/**
 * Answers the spec's open questions from the observation. Every answer is a value
 * the spec did not determine, so `evaluate` records it as free and the report
 * refuses to count it as agreement.
 */
function traceResolver(observed: Observed[], request: any): Resolver {
    const assistants = observed.filter((m) => m.role === 'assistant');

    return {
        collectionSize(label: string, scope: Scope): number {
            // sys.tools -> the tool schemas the SDK serialized into this request
            if (/^sys\.tools\b/.test(label)) return (request.tools ?? []).length;

            // sys.tool_calls[@i] -> tool_use blocks in the i-th assistant message
            if (/tool_calls|tool_requests/.test(label)) {
                const i = scope.i ?? scope.t ?? scope.T;
                const msg = assistants[(i ?? 1) - 1];
                if (!msg) return 0;
                return msg.blocks.filter((b) => b.startsWith('tool_use')).length;
            }
            throw new Unsupported(`no way to size collection '${label}' from the trace`);
        },
        conditionHolds(expr: string): boolean {
            throw new Unsupported(`condition '${expr}' needs a binding map (Level B/C)`);
        },
        indexValue(name: string): number {
            throw new Unsupported(`index '${name}' cannot be read from the trace`);
        },
    };
}

// -------------------------------------------------------------- verdicts

export type Verdict = {
    claim: string;
    status: 'CONFIRMED' | 'REFUTED' | 'UNEXERCISED';
    call?: number;
    detail: string;
};

function roleSeq(ms: { role: AST.Role }[]): string {
    const letter: Record<AST.Role, string> = { system: 'S', user: 'U', assistant: 'A', tool: 'T' };
    return ms.map((m) => letter[m.role]).join(' ');
}

export function checkCall(
    n: number, prediction: Prediction, observed: Observed[],
): Verdict[] {
    const v: Verdict[] = [];
    const p = prediction.messages;

    v.push(p.length === observed.length
        ? { claim: 'message count', status: 'CONFIRMED', call: n,
            detail: `${observed.length} messages, as predicted` }
        : { claim: 'message count', status: 'REFUTED', call: n,
            detail: `spec predicts ${p.length}, trace has ${observed.length}` });

    const pSeq = roleSeq(p), oSeq = roleSeq(observed);
    if (pSeq === oSeq) {
        v.push({ claim: 'role sequence', status: 'CONFIRMED', call: n, detail: oSeq });
    } else {
        const at = [...pSeq.split(' ')].findIndex((r, i) => r !== oSeq.split(' ')[i]);
        v.push({ claim: 'role sequence', status: 'REFUTED', call: n,
            detail: `predicted [${pSeq}], observed [${oSeq}]` +
                    (at >= 0 ? `; first divergence at message ${at}` : '') });
    }
    return v;
}

/** Each call's message array must extend the previous one, unchanged. */
export function checkPrefixMonotonicity(calls: Observed[][]): Verdict[] {
    const v: Verdict[] = [];
    for (let i = 1; i < calls.length; i++) {
        const prev = calls[i - 1], cur = calls[i];
        const keep = JSON.stringify(cur.slice(0, prev.length)) === JSON.stringify(prev);
        v.push(keep
            ? { claim: 'prefix preserved', status: 'CONFIRMED', call: i + 1,
                detail: `call ${i + 1} extends call ${i} by ${cur.length - prev.length} message(s)` }
            : { claim: 'prefix preserved', status: 'REFUTED', call: i + 1,
                detail: `call ${i + 1} rewrote earlier messages: ` +
                        `[${roleSeq(prev)}] became [${roleSeq(cur.slice(0, prev.length))}]` });
    }
    return v;
}

// ------------------------------------------------------------------- main

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function loadSpec(file: string, wanted?: string) {
    // src/parser.ts logs its progress to stdout; keep it out of the report.
    const log = console.log;
    console.log = () => {};
    let blocks;
    try {
        blocks = new Parser(fs.readFileSync(file, 'utf8')).parseFileWithRanges();
    } finally {
        console.log = log;
    }
    const prompts = blocks.filter((b) => b.block.kind === 'prompt') as Array<{
        block: AST.Prompt; startLine: number; endLine: number;
    }>;
    if (!prompts.length) throw new Error(`no specification found in ${file}`);
    const chosen = wanted
        ? prompts.find((p) => p.block.title.name === wanted)
        : prompts[0];
    if (!chosen) throw new Error(`no spec named '${wanted}' in ${file}`);

    const strFrags: Record<string, AST.StrFragDef> = {};
    const rolesFrags: Record<string, AST.RolesFragDef> = {};
    for (const b of blocks) {
        if (b.block.kind === 'str-frag-def') strFrags[b.block.name] = b.block;
        if (b.block.kind === 'roles-frag-def') rolesFrags[b.block.name] = b.block;
    }
    return { prompt: chosen.block, line: chosen.startLine, strFrags, rolesFrags };
}

function main() {
    const specFile = arg('spec'), traceFile = arg('trace');
    if (!specFile || !traceFile) {
        console.error('Usage: bun run acdl-verify/check.ts --spec <file.acdl> --trace <file.jsonl> [--name Spec]');
        process.exit(2);
    }

    const { prompt, line, strFrags, rolesFrags } = loadSpec(specFile, arg('name'));
    const records = fs.readFileSync(traceFile, 'utf8').trim().split('\n')
        .map((l) => JSON.parse(l)).filter((r) => !r.unexpected);

    const timeVar = prompt.title.indices
        .map((i) => exprText([{ type: 'IDENT', value: '' }]) || '')
        .length ? indexName(prompt.title.indices[0]) : 'T';

    console.log(`spec   ${prompt.title.name}[@${timeVar}]  ${specFile}:${line}`);
    console.log(`trace  ${records.length} recorded call(s)  ${traceFile}\n`);

    const verdicts: Verdict[] = [];
    const allObserved: Observed[][] = [];
    const frees: string[] = [];

    for (const rec of records) {
        const observed = normalizeAnthropic(rec.request);
        allObserved.push(observed);

        // The k-th recorded call is the spec at time index k.
        let prediction: Prediction;
        try {
            prediction = evaluate(prompt, {
                time: { [timeVar]: rec.seq },
                resolver: traceResolver(observed, rec.request),
                strFrags, rolesFrags,
            });
        } catch (e) {
            verdicts.push({ claim: 'evaluate', status: 'UNEXERCISED', call: rec.seq,
                detail: `${(e as Error).message}` });
            continue;
        }
        verdicts.push(...checkCall(rec.seq, prediction, observed));
        for (const f of prediction.free) frees.push(`call ${rec.seq}: ${f.what} = ${f.value} (${f.why})`);
    }

    verdicts.push(...checkPrefixMonotonicity(allObserved));

    const mark = { CONFIRMED: '✓', REFUTED: '✗', UNEXERCISED: '?' };
    for (const v of verdicts) {
        console.log(`  ${mark[v.status]} ${String(v.status).padEnd(11)} ` +
                    `${(v.call ? `call ${v.call}` : '').padEnd(8)} ${v.claim.padEnd(18)} ${v.detail}`);
    }

    if (frees.length) {
        console.log('\nfree choices (taken from the trace, therefore NOT verified):');
        for (const f of [...new Set(frees)]) console.log(`  - ${f}`);
    }

    const refuted = verdicts.filter((v) => v.status === 'REFUTED').length;
    const confirmed = verdicts.filter((v) => v.status === 'CONFIRMED').length;
    console.log(`\n${confirmed} confirmed, ${refuted} refuted, ` +
                `${verdicts.length - confirmed - refuted} unexercised`);
    process.exit(refuted > 0 ? 1 : 0);
}

function indexName(i: AST.Index): string {
    const v: any = i.value;
    return v.kind === 'identifier' ? v.name : 'T';
}

if (import.meta.main) main();
