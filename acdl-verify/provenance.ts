// What the spec claims, and where in the code it came from.
//
// `acdl-agent` writes each spec line under a `<- file:line` comment naming the
// source that justifies it. That convention is the whole reason binding
// discovery is tractable: instead of asking a model to search a codebase for
// "whatever controls env.customer_tier", we hand it the six lines the extractor
// already pointed at.
//
// This module is deterministic and does no LLM work. It answers two questions:
// which variables and conditions does the spec depend on, and which source lines
// were cited beside them.
//
// It reads the spec as *text* rather than through `src/parser.ts`, because the
// `<-` convention lives in comments and the AST keeps no line numbers for them.
// The tradeoff is real: this finds occurrences, not scopes.

import * as fs from 'node:fs';
import * as path from 'node:path';

// ------------------------------------------------------------------- types

export type Citation = {
    file: string;
    startLine: number;
    endLine: number;
};

export type Provenance = {
    citations: Citation[];
    /** The comment's prose, minus the citations themselves. */
    note: string;
    /** True when the comment sat immediately above this line. */
    direct: boolean;
};

export type Occurrence = {
    line: number;
    /** The spec line, trimmed. */
    text: string;
    provenance?: Provenance;
};

export type TargetKind = 'context-var' | 'condition' | 'time-index';

export type Target = {
    /** Stable identifier: `env.customer_tier`, or `cond:12` for a condition. */
    key: string;
    kind: TargetKind;
    /** What the discovery agent is being asked about. */
    label: string;
    /**
     * The context variables that must be controllable for this target. For a
     * variable it is itself; for a condition it is whatever the condition reads.
     */
    subjects: string[];
    /**
     * Values the condition compares against. The spec states these outright, so
     * the arm domain of a branch comes free -- no inference, no model.
     */
    literals: string[];
    occurrences: Occurrence[];
};

// --------------------------------------------------------------- scanning

/** `mint/envs/general_env.py:234-241` — extension-anchored so prose cannot match. */
const CITATION =
    /([\w./\\-]+\.(?:py|ts|tsx|js|jsx|mjs|cjs|go|rb|java|rs|kt|kts|php|cs|swift|scala|ex|exs)):(\d+)(?:\s*-\s*(\d+))?/g;

const CONTEXT_VAR = /\b(env|sys|resp)\.([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)/g;

/** Split a spec line into code and trailing `//` comment, respecting strings. */
export function stripComment(line: string): { code: string; comment: string } {
    let inStr = false;
    for (let i = 0; i < line.length - 1; i++) {
        const c = line[i];
        if (c === '"') inStr = !inStr;
        else if (!inStr && c === '/' && line[i + 1] === '/') {
            return { code: line.slice(0, i), comment: line.slice(i + 2) };
        }
    }
    return { code: line, comment: '' };
}

function parseCitations(text: string): { citations: Citation[]; note: string } {
    const citations: Citation[] = [];
    let note = text;
    for (const m of text.matchAll(CITATION)) {
        const start = Number(m[2]);
        citations.push({
            file: m[1].replace(/\\/g, '/'),
            startLine: start,
            endLine: m[3] ? Number(m[3]) : start,
        });
        note = note.replace(m[0], '');
    }
    return { citations, note: note.replace(/\s+/g, ' ').trim() };
}

/** String and bare literals a condition compares against. */
function parseLiterals(expr: string): string[] {
    const out: string[] = [];
    for (const m of expr.matchAll(/"([^"]*)"/g)) out.push(m[1]);
    for (const m of expr.matchAll(/(?:==|!=|<=|>=|<|>)\s*([A-Za-z_][A-Za-z0-9_]*|\d+)\b/g)) {
        out.push(m[1]);
    }
    return [...new Set(out)];
}

function subjectsOf(expr: string): string[] {
    return [...new Set([...expr.matchAll(CONTEXT_VAR)].map((m) => `${m[1]}.${m[2]}`))];
}

/**
 * Every context variable and every branch in a spec, each carrying the source
 * lines cited beside it.
 */
export function extractTargets(specText: string): Target[] {
    const lines = specText.split(/\r?\n/);
    const byKey = new Map<string, Target>();

    // A `<-` comment attaches to the next code line. Later lines in the same
    // block inherit it, flagged indirect, since that is weaker evidence.
    let pending: Provenance | undefined;
    let inherited: Provenance | undefined;
    let commentBuf: string[] = [];
    let inCommentBlock = false;

    const flushComment = () => {
        if (!commentBuf.length) return;
        const { citations, note } = parseCitations(commentBuf.join(' '));
        if (citations.length) {
            pending = { citations, note, direct: true };
            inherited = { citations, note, direct: false };
        }
        commentBuf = [];
        inCommentBlock = false;
    };

    const add = (key: string, t: Omit<Target, 'occurrences' | 'key'>, occ: Occurrence) => {
        const existing = byKey.get(key);
        if (existing) {
            existing.occurrences.push(occ);
            for (const l of t.literals) if (!existing.literals.includes(l)) existing.literals.push(l);
            return;
        }
        byKey.set(key, { key, ...t, occurrences: [occ] });
    };

    lines.forEach((raw, i) => {
        const lineNo = i + 1;
        const { code, comment } = stripComment(raw);

        if (comment) {
            if (/^\s*<-/.test(comment)) {
                flushComment();
                commentBuf = [comment.replace(/^\s*<-\s*/, '')];
                inCommentBlock = true;
            } else if (inCommentBlock && !code.trim()) {
                commentBuf.push(comment);        // continuation of a `<-` block
            }
        }
        if (!code.trim()) return;                // blank or comment-only line
        flushComment();

        const prov = pending ?? inherited;
        const occ: Occurrence = { line: lineNo, text: code.trim(), provenance: prov };

        const cond = /^\s*(If|ElseIf|Switch)\s+(.+?)\s*\{?\s*$/.exec(code);
        if (cond) {
            // A one-line `If x { BODY }` must not drag its body into the
            // condition: the body's variables are effects, not subjects.
            const brace = cond[2].indexOf('{');
            const expr = (brace === -1 ? cond[2] : cond[2].slice(0, brace)).trim();
            const subjects = subjectsOf(expr);
            // A branch on a pure time index (`@t > 1`) needs no binding: the
            // runner controls that by choosing how many calls to drive.
            if (subjects.length) {
                add(`cond:${lineNo}`, {
                    kind: 'condition',
                    label: `${cond[1]} ${expr}`,
                    subjects,
                    literals: cond[1] === 'Switch' ? switchArms(lines, i) : parseLiterals(expr),
                }, occ);
            }
        }

        for (const m of code.matchAll(CONTEXT_VAR)) {
            const key = `${m[1]}.${m[2]}`;
            add(key, { kind: 'context-var', label: key, subjects: [key], literals: [] }, { ...occ });
        }

        pending = undefined;                     // one direct attachment per comment
    });

    return [...byKey.values()];
}

/** The `Case` literals belonging to the Switch that starts at `lines[at]`. */
function switchArms(lines: string[], at: number): string[] {
    const base = lines[at].search(/\S/);
    const out: string[] = [];
    for (let i = at + 1; i < lines.length; i++) {
        const { code } = stripComment(lines[i]);
        if (!code.trim()) continue;
        const indent = code.search(/\S/);
        if (indent <= base && /^\s*\}/.test(code)) break;
        const m = /^\s*Case\s+(.+?)\s*:/.exec(code);
        if (m) out.push(m[1].replace(/^"|"$/g, '').trim());
        if (/^\s*Default\s*:/.test(code)) out.push('<default>');
    }
    return out;
}

// ------------------------------------------------------------ code windows

export type CodeWindow = {
    file: string;
    startLine: number;
    endLine: number;
    /** The lines themselves, numbered, ready to paste into a prompt. */
    text: string;
    missing?: string;
};

/**
 * Read the cited source, padded and merged. Padding matters: a citation points at
 * the line that *uses* a value, and the assignment that produced it is usually a
 * few lines above.
 */
export function readWindows(
    targetRoot: string, citations: Citation[], pad = 12, maxPerFile = 400,
): CodeWindow[] {
    const byFile = new Map<string, Array<{ a: number; b: number }>>();
    for (const c of citations) {
        const list = byFile.get(c.file) ?? [];
        list.push({ a: Math.max(1, c.startLine - pad), b: c.endLine + pad });
        byFile.set(c.file, list);
    }

    const out: CodeWindow[] = [];
    for (const [file, ranges] of byFile) {
        const abs = resolveCited(targetRoot, file);
        if (!abs) {
            out.push({ file, startLine: 0, endLine: 0, text: '', missing: 'not found under target root' });
            continue;
        }
        const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);

        ranges.sort((x, y) => x.a - y.a);
        const merged: Array<{ a: number; b: number }> = [];
        for (const r of ranges) {
            const last = merged[merged.length - 1];
            if (last && r.a <= last.b + 1) last.b = Math.max(last.b, r.b);
            else merged.push({ ...r });
        }

        let budget = maxPerFile;
        for (const r of merged) {
            if (budget <= 0 || r.a > lines.length) break;
            const a = r.a;
            const b = Math.min(lines.length, r.b, a + budget - 1);
            budget -= b - a + 1;
            out.push({
                file, startLine: a, endLine: b,
                text: lines.slice(a - 1, b).map((l, k) => `${a + k}| ${l}`).join('\n'),
            });
        }
    }
    return out;
}

/**
 * A citation is written relative to whatever root the extractor was pointed at,
 * which is not always the root we are given. Try the obvious candidates rather
 * than failing on a path prefix.
 */
export function resolveCited(targetRoot: string, cited: string): string | undefined {
    const direct = path.resolve(targetRoot, cited);
    if (fs.existsSync(direct)) return direct;

    // Drop leading segments one at a time: `mint/envs/general_env.py` cited
    // under a root that already *is* `mint/`.
    const parts = cited.split('/');
    for (let i = 1; i < parts.length; i++) {
        const p = path.resolve(targetRoot, parts.slice(i).join('/'));
        if (fs.existsSync(p)) return p;
    }
    // Last resort: the basename, anywhere shallow in the tree.
    const base = parts[parts.length - 1];
    for (const dir of shallowDirs(targetRoot, 3)) {
        const p = path.join(dir, base);
        if (fs.existsSync(p)) return p;
    }
    return undefined;
}

const SKIP_DIR = /^(\.|node_modules|__pycache__|venv|dist|build|out|target)$/;

function shallowDirs(root: string, depth: number): string[] {
    const out: string[] = [root];
    if (depth === 0) return out;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        if (!e.isDirectory() || SKIP_DIR.test(e.name)) continue;
        out.push(...shallowDirs(path.join(root, e.name), depth - 1));
    }
    return out;
}

/**
 * The spec's time index as a target in its own right.
 *
 * `@T` is not a context variable -- nothing in the codebase is named it -- but
 * reaching a chosen value of it is still a question about the target's control
 * surface, and one with two very different answers. Either the agent's own loop
 * is allowed to run that many times (costing a model call per turn), or its
 * state is seeded so it believes it is already there (costing one). Asking is
 * what makes the second possible.
 */
export function timeTarget(specText: string): Target | undefined {
    const lines = specText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const { code } = stripComment(lines[i]);
        const m = /^([A-Za-z][A-Za-z0-9_]*)\s*\[\s*@([A-Za-z][A-Za-z0-9_.]*)/.exec(code.trim());
        if (!m) continue;

        // Reuse whatever the extractor cited beside the header: it names the
        // call site, which is where a turn counter is most likely to live.
        const all = extractTargets(specText);
        const near = all.flatMap((t) => t.occurrences)
            .filter((o) => o.line >= i + 1 && o.provenance)
            .sort((a, b) => a.line - b.line)[0];

        return {
            key: 'time',
            kind: 'time-index',
            label: `@${m[2]} (the time index of ${m[1]})`,
            subjects: ['time'],
            literals: [],
            occurrences: [{ line: i + 1, text: code.trim(), provenance: near?.provenance }],
        };
    }
    return undefined;
}

/**
 * Which role's message a spec line sits inside: the nearest `S:` / `U:` / `A:` /
 * `T:` at or above it. Text-level, like the rest of this module, and wrong for a
 * variable used outside any role -- which is why callers treat it as a check on
 * an observation rather than as a claim of its own.
 */
export function roleAt(specText: string, line: number): 'system' | 'user' | 'assistant' | 'tool' | undefined {
    const lines = specText.split(/\r?\n/);
    const ROLE: Record<string, 'system' | 'user' | 'assistant' | 'tool'> = {
        S: 'system', U: 'user', A: 'assistant', T: 'tool',
    };
    for (let i = Math.min(line, lines.length) - 1; i >= 0; i--) {
        const { code } = stripComment(lines[i]);
        const m = /^\s*([SUAT])\s*:/.exec(code);
        if (m) return ROLE[m[1]];
        // A closing brace at column 0 ends the enclosing role block.
        if (/^\}/.test(code)) return undefined;
    }
    return undefined;
}

/** A shallow file listing, so the agent can see what else the target contains. */
export function fileTree(root: string, limit = 200): string[] {
    const out: string[] = [];
    const walk = (dir: string, depth: number) => {
        if (out.length >= limit || depth > 3) return;
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (SKIP_DIR.test(e.name)) continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p, depth + 1);
            else if (out.length < limit) out.push(path.relative(root, p).replace(/\\/g, '/'));
        }
    };
    walk(root, 0);
    return out.sort();
}
