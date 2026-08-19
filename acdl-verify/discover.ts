// Binding discovery: ask a model how each thing the spec names is controlled.
//
//   bun run acdl-verify/discover.ts --spec acdl-agent/out/supportbot/SupportBot.acdl \
//                                   --target acdl-tests/test1-supportbot
//
// The agent is not asked to search a codebase. `provenance.ts` has already
// turned the spec's `<- file:line` comments into a list of targets with the
// exact source windows the extractor cited, so each question arrives with its
// answer's neighbourhood attached. That is what keeps this one cheap call
// rather than an exploration.
//
// Every answer is then checked against the source it cites, and a rejected
// answer goes back with the reason. The model proposes; the checker disposes --
// the same division of labour the rest of acdl-verify uses.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
    extractTargets, timeTarget, readWindows, fileTree,
    type Citation, type Target,
} from './provenance';
import {
    ProposalBatch, ground, writeBindings, renderReport,
    type Binding, type BindingMap, type Proposal,
} from './bindings';

const MODEL = 'claude-opus-5';
const BATCH = 12;

// ------------------------------------------------------------------ prompt

const SYSTEM = `You are analysing a codebase to find its *control surface*.

An ACDL specification describes the message array an agent sends to a model. It
refers to runtime values through context variables:

  env.*   external inputs -- user queries, observations, world state
  sys.*   agent state -- memory, tool configuration, action history
  resp.*  what the model itself said on an earlier call

Someone is going to verify that specification empirically: run this codebase
repeatedly, vary one variable at a time, and check that the recorded requests
change the way the specification predicts. For that they need to know, for each
variable, HOW TO MAKE IT TAKE A CHOSEN VALUE in a real run.

That is the only question you are answering. You are not judging whether the
specification is correct, and you are not being asked what the variable means.

Each target comes with the source lines the specification itself cited. Those
lines are where the value is *used*. Trace backwards from there to where it
*enters the process*, and report that entry point.

Classify each one:

  env    an environment variable read by the process
  flag   a command-line argument
  file   a config or data file read at startup
  stdin  a line fed to the process on standard input
  response  a resp.* value. These are NOT controlled by this codebase at all --
            they are whatever the model replied on an earlier call, and the
            verifier controls them directly by scripting the reply its recording
            proxy returns. Use this for every resp.* target unless the codebase
            post-processes the reply before it re-enters the prompt, in which
            case say so in "reasoning" and cite that transform. Cite the call
            site where the reply is received.
  harness   there is NO input surface -- the value is hardcoded at a call site,
            or only reachable by importing the module and calling the builder
            directly with synthetic state. Name the function and the parameter.
  constant  hardcoded in this codebase and read from nowhere else; only editing
            the source changes it
  unreachable  nothing in this codebase sets it at all

One target is not a context variable: the TIME INDEX, keyed "time". @T is how
far into the episode the agent is -- a conversation turn, or a step of a loop.
There are always two ways to reach a chosen value of it, and the useful answer
is the second:

  * let the agent's own loop run that many times. This always works and costs one
    model call per turn, so it needs no answer from you.
  * make the agent BELIEVE it is already at turn N, by seeding whatever it counts
    from -- a history list, a saved session file, a --resume argument, a turn
    counter passed to the builder. One call instead of N.

So for "time", answer with the SEEDING route if one exists: what does this
codebase count turns from, and how would a caller preload it? If nothing can be
preloaded, say "unreachable" and the runner will fall back to replaying the loop.

Note the asymmetry: env.* and sys.* are inputs to the process and need a handle
in the code; resp.* is an output of the model and needs no handle, because the
proxy simply says the words. Do not go looking for code that "sets" a resp.*.

"harness", "constant" and "unreachable" are correct answers, not failures. Many
research codebases have no CLI at all and hardcode their state in a __main__
block. Say so plainly rather than inventing a flag.

EVIDENCE RULES -- these are checked mechanically and a failure is returned to you:

- \`evidence.snippet\` must be text COPIED VERBATIM from the file, not a
  paraphrase, not reformatted, not a summary. Copy the characters.
- \`evidence.line\` must be the line that snippet is actually on. The check
  allows a few lines of slack, no more.
- Cite the line that establishes the HANDLE (the argparse call, the os.environ
  read, the hardcoded assignment), not the line that consumes the value.
- If you are not confident, say confidence "low" and cite what you did find.
  A low-confidence honest answer is useful; a confident invention is not.`;

function renderTarget(t: Target): string {
    const occ = t.occurrences.slice(0, 4).map((o) => {
        const p = o.provenance;
        const cites = p
            ? p.citations.map((c) => `${c.file}:${c.startLine}-${c.endLine}`).join(', ') +
              (p.direct ? '' : ' [inherited from an enclosing line]') +
              (p.note ? `  note: ${p.note}` : '')
            : 'no citation';
        return `    spec line ${o.line}: ${o.text}\n      cited: ${cites}`;
    }).join('\n');

    return [
        `- key: ${t.key}`,
        `  kind: ${t.kind}`,
        `  ${t.kind === 'condition' ? 'condition' : 'variable'}: ${t.label}`,
        t.kind === 'condition' ? `  must control: ${t.subjects.join(', ')}` : '',
        t.literals.length ? `  values the spec compares against: ${t.literals.join(', ')}` : '',
        `  occurrences:\n${occ}`,
    ].filter(Boolean).join('\n');
}

function buildUserMessage(
    specName: string, specText: string, targetRoot: string,
    all: Target[], batch: Target[], windows: string, tree: string[],
    report?: string,
): string {
    return [
        `# Specification: ${specName}`,
        '',
        '```acdl',
        specText,
        '```',
        '',
        report ? `# Extraction report (excerpt)\n\n${report}\n` : '',
        `# Target codebase: ${targetRoot}`,
        '',
        'Files:',
        tree.map((f) => `  ${f}`).join('\n'),
        '',
        '# Cited source',
        '',
        windows,
        '',
        '# All targets in this specification (context)',
        '',
        all.map((t) => `  ${t.key}  (${t.kind})`).join('\n'),
        '',
        `# Answer for these ${batch.length} targets`,
        '',
        batch.map(renderTarget).join('\n\n'),
        '',
        'Return one binding per target key listed above. Use the exact key strings.',
    ].filter((s) => s !== '').join('\n');
}

// ------------------------------------------------------------- transports

export type Msg = { role: 'user' | 'assistant'; content: string };

/**
 * Where the proposals come from. Two are supported and they differ in more than
 * billing: the API enforces the output schema, while the CLI can only be asked
 * for JSON and checked afterwards -- but the CLI can also read files the
 * citations did not point at.
 */
export interface Transport {
    name: string;
    model: string;
    /** The schema is per call: this transport answers recipe questions too. */
    propose<T>(system: string, messages: Msg[], schema: z.ZodType<T>): Promise<T | undefined>;
}

/** Anthropic API, with the output schema enforced server-side. */
export function apiTransport(client = new Anthropic(), model = MODEL): Transport {
    return {
        name: 'api', model,
        async propose(system, messages, schema) {
            const response = await client.messages.parse({
                model,
                max_tokens: 16000,
                thinking: { type: 'adaptive' },
                output_config: { effort: 'high', format: zodOutputFormat(schema as any) },
                system,
                messages: messages as Anthropic.MessageParam[],
            });
            return (response.parsed_output ?? undefined) as any;
        },
    };
}

function jsonRule(schema: z.ZodType<unknown>): string {
    return `
OUTPUT FORMAT

Respond with a single JSON object and nothing else -- no prose before or after,
no markdown code fence. It must match this JSON Schema exactly:

${JSON.stringify(z.toJSONSchema(schema as any), null, 1)}`;
}

/**
 * The Claude Code binary in print mode. Runs on the user's subscription rather
 * than an API key, and -- unlike the API transport -- the agent keeps read-only
 * tools, so a citation that lands near but not on the handle can still be
 * chased down. There is no server-side schema enforcement here, so the JSON is
 * parsed and validated locally and a malformed reply is simply a failed attempt.
 */
export function claudeCliTransport(opts: {
    exe: string;
    model?: string;
    /** Read-only by construction: discovery must never modify the target. */
    allowedTools?: string[];
    cwd?: string;
    timeoutMs?: number;
}): Transport {
    const model = opts.model ?? 'opus';
    const tools = opts.allowedTools ?? ['Read', 'Grep', 'Glob'];

    return {
        name: 'claude-cli', model,
        async propose(system, messages, schema) {
            // The CLI is stateless per invocation, so a multi-turn exchange is
            // flattened into one prompt rather than resumed.
            const prompt = messages.map((m) =>
                m.role === 'user' ? m.content : `[your previous answer]\n${m.content}`).join('\n\n');

            const args = [
                '-p',
                '--output-format', 'json',
                '--model', model,
                '--system-prompt', system + jsonRule(schema as z.ZodType<unknown>),
            ];
            // The flag takes a variadic argument, so an empty list must omit it
            // entirely rather than pass nothing after it.
            if (tools.length) args.push('--allowed-tools', ...tools);
            else args.push('--disallowed-tools', 'Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit');
            const raw = await run(opts.exe, args, prompt, opts.cwd, opts.timeoutMs ?? 600_000);

            let envelope: any;
            try { envelope = JSON.parse(raw); } catch { return undefined; }
            if (envelope.is_error) throw new Error(`claude cli: ${envelope.result ?? 'failed'}`);

            const parsed = extractJson(String(envelope.result ?? ''));
            if (!parsed) return undefined;
            const check = schema.safeParse(parsed);
            return check.success ? check.data : undefined;
        },
    };
}

/** Pull a JSON object out of a reply that may still be wrapped in prose or a fence. */
export function extractJson(text: string): unknown {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
    const candidates = [fenced?.[1], text].filter(Boolean) as string[];
    for (const c of candidates) {
        const a = c.indexOf('{'), b = c.lastIndexOf('}');
        if (a === -1 || b <= a) continue;
        try { return JSON.parse(c.slice(a, b + 1)); } catch { /* try the next */ }
    }
    return undefined;
}

function run(
    exe: string, args: string[], stdin: string, cwd: string | undefined, timeoutMs: number,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(exe, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
        let out = '', err = '';
        const timer = setTimeout(() => { child.kill(); reject(new Error('claude cli timed out')); }, timeoutMs);
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { err += d; });
        child.on('error', (e) => { clearTimeout(timer); reject(e); });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0) reject(new Error(`claude cli exited ${code}: ${err.slice(0, 500)}`));
            else resolve(out);
        });
        child.stdin.end(stdin);
    });
}

/**
 * Prefer whatever the environment actually has. A subscription-backed CLI needs
 * no key, so it is the better default when no key is set.
 */
export function autoTransport(model?: string): Transport {
    const exe = process.env.CLAUDE_CODE_EXECPATH;
    const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
    if (!hasKey && exe && fs.existsSync(exe)) return claudeCliTransport({ exe, model });
    return apiTransport(new Anthropic(), model ?? MODEL);
}

// --------------------------------------------------------------- discovery

export type DiscoverOptions = {
    specFile: string;
    targetRoot: string;
    reportFile?: string;
    /** Retries for rejected proposals; each costs one more model call. */
    retries?: number;
    /** Where proposals come from. Defaults to whatever the environment has. */
    transport?: Transport;
    /** Shorthand for `transport: apiTransport(client)`, used by the tests. */
    client?: Anthropic;
    verbose?: boolean;
};

export async function discover(opts: DiscoverOptions): Promise<BindingMap> {
    const transport = opts.transport
        ?? (opts.client ? apiTransport(opts.client) : autoTransport());
    const specText = fs.readFileSync(opts.specFile, 'utf8');
    const targets = extractTargets(specText);
    // @T is not a context variable, but reaching a chosen value of it is still a
    // question about this codebase's control surface -- and the cheap answer
    // (seed the state) only exists if someone asks.
    const time = timeTarget(specText);
    if (time) targets.push(time);
    if (!targets.length) throw new Error(`no context variables or conditions in ${opts.specFile}`);

    const tree = fileTree(opts.targetRoot);
    const report = opts.reportFile
        ? fs.readFileSync(opts.reportFile, 'utf8').slice(0, 20000)
        : undefined;
    const byKey = new Map(targets.map((t) => [t.key, t]));

    const log = (m: string) => { if (opts.verbose !== false) console.error(m); };
    log(`spec     ${opts.specFile}`);
    log(`target   ${opts.targetRoot}`);
    log(`model    ${transport.model} via ${transport.name}`);
    log(`targets  ${targets.length} (${targets.filter((t) => t.kind === 'condition').length} conditions)`);

    const batches: Target[][] = [];
    for (let i = 0; i < targets.length; i += BATCH) batches.push(targets.slice(i, i + BATCH));

    const results = await Promise.all(batches.map(async (batch, i) => {
        const cites: Citation[] = batch.flatMap(
            (t) => t.occurrences.flatMap((o) => o.provenance?.citations ?? []));
        const windows = readWindows(opts.targetRoot, cites)
            .map((w) => w.missing
                ? `## ${w.file}  (${w.missing})`
                : `## ${w.file}:${w.startLine}-${w.endLine}\n\`\`\`\n${w.text}\n\`\`\``)
            .join('\n\n');

        const user = buildUserMessage(
            path.basename(opts.specFile), specText, opts.targetRoot,
            targets, batch, windows, tree, report);

        log(`  batch ${i + 1}/${batches.length}: ${batch.length} targets, ` +
            `${Math.round(user.length / 1000)}kB of context`);

        return runBatch(transport, user, batch, opts, log);
    }));

    const bindings = results.flat();
    for (const b of bindings) {
        const t = byKey.get(b.key);
        if (t?.literals.length) b.domain = t.literals;
    }

    // Anything the agent silently dropped is reported rather than lost.
    const answered = new Set(bindings.map((b) => b.key));
    for (const t of targets) {
        if (answered.has(t.key)) continue;
        bindings.push({
            key: t.key, kind: 'unreachable', handle: '', setter: '',
            evidence: { file: '', line: 0, snippet: '' },
            confidence: 'low', reasoning: 'the discovery agent returned no binding for this target',
            status: 'rejected', rejection: 'no proposal returned',
            domain: t.literals.length ? t.literals : undefined,
        });
    }

    return {
        version: 1,
        spec: opts.specFile,
        target: opts.targetRoot,
        generatedAt: new Date().toISOString(),
        model: `${transport.model} (${transport.name})`,
        bindings: bindings.sort((a, b) => a.key.localeCompare(b.key)),
    };
}

/** One batch: propose, ground, and re-ask about whatever failed. */
async function runBatch(
    transport: Transport, user: string, batch: Target[],
    opts: DiscoverOptions, log: (m: string) => void,
): Promise<Binding[]> {
    const valid = new Set(batch.map((t) => t.key));
    const messages: Msg[] = [{ role: 'user', content: user }];
    const accepted = new Map<string, Binding>();
    const retries = opts.retries ?? 1;

    for (let attempt = 0; attempt <= retries; attempt++) {
        const parsed = await transport.propose(SYSTEM, messages, ProposalBatch);
        if (!parsed) {
            log('    model returned no parseable batch; giving up on this batch');
            break;
        }

        const rejected: Binding[] = [];
        for (const p of parsed.bindings as Proposal[]) {
            if (!valid.has(p.key)) continue;              // not ours to answer
            if (accepted.has(p.key)) continue;
            const b = ground(p, opts.targetRoot);
            if (b.status === 'grounded') accepted.set(p.key, b);
            else rejected.push(b);
        }

        log(`    attempt ${attempt + 1}: ${accepted.size} grounded, ${rejected.length} rejected`);
        if (!rejected.length || attempt === retries) {
            for (const b of rejected) if (!accepted.has(b.key)) accepted.set(b.key, b);
            break;
        }

        messages.push(
            { role: 'assistant', content: JSON.stringify({ bindings: parsed.bindings }) },
            {
                role: 'user',
                content:
                    'These bindings failed the evidence check. The snippet you cited was ' +
                    'compared against the file and did not match near the line you gave.\n\n' +
                    rejected.map((b) => `- ${b.key}: ${b.rejection}`).join('\n') +
                    '\n\nRe-answer ONLY these keys. Open the cited file, copy the exact ' +
                    'characters of the line you mean, and give that line number. If no ' +
                    'handle exists, answer "constant" or "unreachable" and cite the ' +
                    'hardcoded assignment instead.',
            });
    }

    return [...accepted.values()];
}

// ---------------------------------------------------------------------- CLI

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const USAGE = `Usage: bun run acdl-verify/discover.ts --spec <file.acdl> --target <dir>

  --spec     the specification whose variables need binding
  --target   the codebase it describes
  --report   extraction-report.md, if you have one (extra evidence)
  --out      default <spec-dir>/bindings.json
  --retries  re-ask count for rejected proposals (default 1)
  --transport  api | claude-cli | auto (default auto: claude-cli when no API key)
  --model    model id, or a claude-cli alias like opus / sonnet / haiku
  --dry-run  print the targets and their citations, call no model`;

function pickTransport(which: string, model?: string): Transport {
    if (which === 'api') return apiTransport(new Anthropic(), model ?? MODEL);
    if (which === 'claude-cli') {
        const exe = process.env.CLAUDE_CODE_EXECPATH;
        if (!exe) throw new Error('--transport claude-cli needs CLAUDE_CODE_EXECPATH set');
        return claudeCliTransport({ exe, model });
    }
    return autoTransport(model);
}

async function main() {
    const specFile = arg('spec'), targetRoot = arg('target');
    if (!specFile || !targetRoot) { console.error(USAGE); process.exit(2); }

    if (process.argv.includes('--dry-run')) {
        const specText = fs.readFileSync(specFile, 'utf8');
        const targets = extractTargets(specText);
        const t = timeTarget(specText);
        if (t) targets.push(t);
        for (const t of targets) {
            console.log(`${t.kind.padEnd(12)} ${t.key}`);
            for (const o of t.occurrences) {
                const c = o.provenance?.citations
                    .map((x) => `${x.file}:${x.startLine}-${x.endLine}`).join(', ');
                console.log(`  line ${String(o.line).padEnd(4)} ${c ?? 'no citation'}` +
                            `${o.provenance && !o.provenance.direct ? ' (inherited)' : ''}`);
            }
            if (t.literals.length) console.log(`  domain: ${t.literals.join(', ')}`);
        }
        console.log(`\n${targets.length} target(s); no model was called`);
        return;
    }

    const map = await discover({
        specFile, targetRoot,
        reportFile: arg('report'),
        retries: Number(arg('retries', '1')),
        transport: pickTransport(arg('transport', 'auto')!, arg('model')),
    });

    const out = arg('out', path.join(path.dirname(specFile), 'bindings.json'))!;
    writeBindings(out, map);

    // The binding map is the one artefact carrying model-authored content, so it
    // gets a report a person can review without reading JSON.
    const report = arg('report-out', out.replace(/\.json$/, '') + '-report.md')!;
    fs.writeFileSync(report, renderReport(map));

    const grounded = map.bindings.filter((b) => b.status === 'grounded');
    const byKind = new Map<string, number>();
    for (const b of grounded) byKind.set(b.kind, (byKind.get(b.kind) ?? 0) + 1);

    console.log(`\n${grounded.length}/${map.bindings.length} bindings grounded -> ${out}`);
    console.log(`report -> ${report}`);
    for (const [k, n] of [...byKind].sort()) console.log(`  ${String(n).padStart(3)}  ${k}`);
    for (const b of map.bindings.filter((x) => x.status === 'rejected')) {
        console.log(`  ✗ ${b.key}: ${b.rejection}`);
    }
    console.log('\nNo binding is verified yet: grounding proves the cited line exists,');
    console.log('not that setting the handle moves the prompt. That needs an episode.');
}

if (import.meta.main) await main();
