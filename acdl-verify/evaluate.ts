// Evaluate an ACDL spec into the message array it predicts.
//
// A spec is a small program whose output is a list of messages. This is its
// interpreter: given values for the things the spec leaves open -- the current
// time index, how many elements a collection has, which way a condition went --
// it walks the AST and emits the predicted messages in order.
//
// Anything it cannot determine from the spec alone it asks the Resolver for, and
// records as a `free` choice. Free choices are NOT verified: they are values the
// checker had to take from the observation, and the report must say so rather
// than counting them as agreement.

import type * as AST from '../src/types';

// ------------------------------------------------------------------ output

export type Slot = {
    /** What the spec says occupies this position. */
    label: string;
    kind: 'template' | 'context-var' | 'function' | 'name-ref' | 'index' | 'frag';
};

export type PredMessage = {
    role: AST.Role;
    slots: Slot[];
};

/** A value the spec did not determine, taken from elsewhere. */
export type FreeChoice = {
    what: string;
    value: string | number | boolean;
    why: string;
};

export type Prediction = {
    messages: PredMessage[];
    free: FreeChoice[];
    /** True if a PromptEndsHere fired, so the array is deliberately truncated. */
    endedEarly: boolean;
};

// ---------------------------------------------------------------- resolver

/**
 * Supplies what the spec leaves open. `fixedResolver` answers from a table;
 * the checker's trace-backed resolver answers by reading the observation, which
 * is legitimate -- these are free variables -- but must be reported as free.
 */
export interface Resolver {
    /** Size of a collection-valued iterable, e.g. `sys.tool_calls[@i]`. */
    collectionSize(label: string, scope: Scope): number;
    /** Truth of a condition the evaluator could not compute arithmetically. */
    conditionHolds(expr: string, scope: Scope): boolean;
    /** Value of a symbolic index the evaluator does not know, e.g. `@t.substeps`. */
    indexValue(name: string, scope: Scope): number;
}

export type Scope = Record<string, number>;

export function fixedResolver(table: {
    sizes?: Record<string, number>;
    conditions?: Record<string, boolean>;
    indices?: Record<string, number>;
}): Resolver {
    return {
        collectionSize(label, scope) {
            const keyed = table.sizes?.[`${label}@${scope.__iter ?? ''}`];
            const plain = table.sizes?.[label];
            if (keyed !== undefined) return keyed;
            if (plain !== undefined) return plain;
            throw new Unsupported(`no size given for collection '${label}'`);
        },
        conditionHolds(expr) {
            const v = table.conditions?.[expr];
            if (v === undefined) throw new Unsupported(`no truth value given for condition '${expr}'`);
            return v;
        },
        indexValue(name) {
            const v = table.indices?.[name];
            if (v === undefined) throw new Unsupported(`no value given for index '${name}'`);
            return v;
        },
    };
}

export class Unsupported extends Error {}

// -------------------------------------------------------- expression eval

/** Render an expression token list back to source-ish text, for labels and lookups. */
export function exprText(tokens: AST.ExpressionToken[] | undefined): string {
    if (!tokens) return '';
    return tokens.map((t, i) => (i > 0 && t.spaceBefore ? ' ' : '') + t.value).join('').trim();
}

/**
 * Evaluate an arithmetic expression over the current scope. Handles the forms
 * ACDL actually uses in loop bounds: numbers, index variables, `@t.substeps`,
 * and + - * / % between them.
 */
function evalArith(text: string, scope: Scope, r: Resolver): number {
    const src = text.replace(/\s+/g, '');
    let pos = 0;

    const peek = () => src[pos];
    // NB: ''.includes('') is true, so an explicit undefined check is required.
    const at = (chars: string) => pos < src.length && chars.includes(src[pos]);
    const expect = (c: string) => {
        if (src[pos] !== c) throw new Unsupported(`expected '${c}' in '${text}'`);
        pos++;
    };

    function primary(): number {
        if (peek() === '(') { pos++; const v = sum(); expect(')'); return v; }
        const m = /^@?[A-Za-z_][A-Za-z0-9_.]*|^\d+/.exec(src.slice(pos));
        if (!m) throw new Unsupported(`cannot parse '${text}' at offset ${pos}`);
        pos += m[0].length;
        const tok = m[0];
        if (/^\d+$/.test(tok)) return Number(tok);
        return lookup(tok, scope, r);
    }
    function product(): number {
        let v = primary();
        while (at('*/%')) {
            const op = src[pos++];
            const rhs = primary();
            v = op === '*' ? v * rhs : op === '/' ? Math.floor(v / rhs) : v % rhs;
        }
        return v;
    }
    function sum(): number {
        let v = product();
        while (at('+-')) {
            const op = src[pos++];
            const rhs = product();
            v = op === '+' ? v + rhs : v - rhs;
        }
        return v;
    }

    const out = sum();
    if (pos !== src.length) throw new Unsupported(`trailing input in '${text}'`);
    return out;
}

/** Resolve one identifier. `@T` and `T` are the same variable; `.substeps` defers. */
function lookup(tok: string, scope: Scope, r: Resolver): number {
    const bare = tok.replace(/^@/, '');
    if (bare in scope) return scope[bare];
    if (tok in scope) return scope[tok];
    if (bare.includes('.')) return r.indexValue(bare, scope);   // e.g. t.substeps
    return r.indexValue(bare, scope);
}

// ------------------------------------------------------------- evaluation

type Emit = { messages: PredMessage[]; free: FreeChoice[]; ended: boolean };

export type EvalOptions = {
    /** Values for the spec's own header indices, e.g. { T: 3 }. */
    time: Scope;
    resolver: Resolver;
    /** Definitions for `Frag` invocations, keyed by name. */
    strFrags?: Record<string, AST.StrFragDef>;
    rolesFrags?: Record<string, AST.RolesFragDef>;
};

export function evaluate(prompt: AST.Prompt, opts: EvalOptions): Prediction {
    if (prompt.body.kind === 'completion-prompt-body') {
        throw new Unsupported('completion-format specs (N:) are not supported yet');
    }
    const out: Emit = { messages: [], free: [], ended: false };
    runBlocks(prompt.body.body, { ...opts.time }, opts, out);
    return { messages: out.messages, free: out.free, endedEarly: out.ended };
}

// ---- top level: blocks that produce whole messages -----------------------

function runBlocks(blocks: AST.PromptBlock[], scope: Scope, o: EvalOptions, out: Emit): void {
    for (const b of blocks) {
        if (out.ended) return;
        runBlock(b, scope, o, out);
    }
}

function runBlock(b: AST.PromptBlock, scope: Scope, o: EvalOptions, out: Emit): void {
    switch (b.kind) {
        case 'comment-block':
            return;

        case 'role-message': {
            const slots: Slot[] = [];
            runRoleBody(b.body, scope, o, out, slots);
            out.messages.push({ role: b.role, slots });
            return;
        }

        case 'mark-block':                       // presentational only
            return runBlocks(b.body, scope, o, out);

        case 'name-def':                          // no effect on message shape
            return;

        case 'loop-block-outside-role': {
            for (const s of iterate(b.index, b.iterable, scope, o, out)) {
                runBlocks(b.body, s, o, out);
                if (out.ended) return;
            }
            return;
        }

        case 'conditional-block-outside-role': {
            const branch = pickBranch(
                b.Ifcondition, b.elseif, scope, o, out,
                b.IfBody, b.elseifBody, b.elseBody);
            if (branch) runBlocks(branch as AST.PromptBlock[], scope, o, out);
            return;
        }

        case 'switch-block-outside-role': {
            const body = pickCase(b.expression, b.cases, b.defaultCase, scope, o, out);
            if (body) runBlocks(body as AST.PromptBlock[], scope, o, out);
            return;
        }

        case 'end-block': {
            const expr = exprText(b.condition);
            if (truth(expr, scope, o, out)) out.ended = true;
            return;
        }

        case 'roles-frag-invocation': {
            const def = o.rolesFrags?.[b.name];
            if (!def) throw new Unsupported(`unknown role fragment 'Frag ${b.name}'`);
            return runBlocks(def.body, scope, o, out);
        }

        default:
            throw new Unsupported(`block kind '${(b as any).kind}' not supported`);
    }
}

// ---- inside a role: blocks that produce content slots --------------------

function runRoleBody(
    body: AST.RoleBuildingBlock[], scope: Scope, o: EvalOptions, out: Emit, slots: Slot[],
): void {
    for (const b of body) {
        if (out.ended) return;
        switch (b.kind) {
            case 'comment-block':
            case 'name-def':
                break;

            case 'template':
                slots.push({ kind: 'template', label: b.name });
                break;

            case 'context-var':
                slots.push({ kind: 'context-var', label: contextVarLabel(b) });
                break;

            case 'function':
                slots.push({ kind: 'function', label: `${b.name}()` });
                break;

            case 'name-ref':
                slots.push({ kind: 'name-ref', label: `$${b.name}` });
                break;

            case 'other-index':
                slots.push({ kind: 'index', label: indexLabel(b) });
                break;

            case 'mark-block-inside-role':
                runRoleBody(b.body, scope, o, out, slots);
                break;

            case 'loop-block-inside-role':
                for (const s of iterate(b.index, b.iterable, scope, o, out)) {
                    runRoleBody(b.body, s, o, out, slots);
                }
                break;

            case 'conditional-block-inside-role': {
                const branch = pickBranch(
                    b.Ifcondition, b.elseif, scope, o, out,
                    b.IfBody, b.elseifBody, b.elseBody);
                if (branch) runRoleBody(branch as AST.RoleBuildingBlock[], scope, o, out, slots);
                break;
            }

            case 'switch-block-inside-role': {
                const chosen = pickCase(b.expression, b.cases, b.defaultCase, scope, o, out);
                if (chosen) runRoleBody(chosen as AST.RoleBuildingBlock[], scope, o, out, slots);
                break;
            }

            case 'end-block':
                if (truth(exprText(b.condition), scope, o, out)) out.ended = true;
                break;

            case 'str-frag-invocation': {
                const def = o.strFrags?.[b.name];
                if (!def) throw new Unsupported(`unknown string fragment 'Frag ${b.name}'`);
                runRoleBody(def.body, scope, o, out, slots);
                break;
            }

            default:
                throw new Unsupported(`content kind '${(b as any).kind}' not supported`);
        }
    }
}

// ---- shared helpers ------------------------------------------------------

/**
 * Yield one scope per loop iteration. A `range` is computed from the spec and so
 * is verified; a collection's length is not in the spec and is therefore free.
 */
function* iterate(
    index: AST.Index, iterable: AST.Iterable, scope: Scope, o: EvalOptions, out: Emit,
): Generator<Scope> {
    const varName = indexLabel(index).replace(/^@/, '');

    if (iterable.kind === 'range-expr') {
        const start = evalArith(exprText(iterable.start), scope, o.resolver);
        const stop = evalArith(exprText(iterable.end), scope, o.resolver);
        const step = iterable.step ? evalArith(exprText(iterable.step), scope, o.resolver) : 1;
        // Half-open, 1-indexed: range(1, @T) covers 1 .. @T-1.
        for (let v = start; step > 0 ? v < stop : v > stop; v += step) {
            yield { ...scope, [varName]: v };
        }
        return;
    }

    const label = exprText(iterable.tokens);
    const n = o.resolver.collectionSize(label, scope);
    out.free.push({
        what: `size of ${label}`,
        value: n,
        why: 'collection length is not stated in the spec',
    });
    for (let v = 1; v <= n; v++) yield { ...scope, [varName]: v };
}

function pickBranch<T>(
    ifCond: AST.ExpressionToken[], elseifs: AST.ExpressionToken[][],
    scope: Scope, o: EvalOptions, out: Emit,
    ifBody: T, elseifBodies: T[], elseBody: T | undefined,
): T | undefined {
    if (truth(exprText(ifCond), scope, o, out)) return ifBody;
    for (let i = 0; i < elseifs.length; i++) {
        if (truth(exprText(elseifs[i]), scope, o, out)) return elseifBodies[i];
    }
    return elseBody;
}

function pickCase<C extends { match: AST.ExpressionToken[]; body: B }, B, D extends { body: B }>(
    expr: AST.ExpressionToken[], cases: C[], def: D | undefined,
    scope: Scope, o: EvalOptions, out: Emit,
): B | undefined {
    const subject = exprText(expr);
    for (const c of cases) {
        if (truth(`${subject} == ${exprText(c.match)}`, scope, o, out)) return c.body;
    }
    return def?.body;
}

/** Compute a condition if it is pure arithmetic; otherwise it is a free choice. */
function truth(expr: string, scope: Scope, o: EvalOptions, out: Emit): boolean {
    const m = /^(.+?)(==|!=|<=|>=|<|>)(.+)$/.exec(expr);
    if (m) {
        try {
            const l = evalArith(m[1], scope, o.resolver);
            const r = evalArith(m[3], scope, o.resolver);
            switch (m[2]) {
                case '==': return l === r;
                case '!=': return l !== r;
                case '<': return l < r;
                case '>': return l > r;
                case '<=': return l <= r;
                case '>=': return l >= r;
            }
        } catch {
            // not numeric -- fall through to the resolver
        }
    }
    const v = o.resolver.conditionHolds(expr, scope);
    out.free.push({ what: `condition ${expr}`, value: v, why: 'not computable from the spec alone' });
    return v;
}

function indexLabel(i: AST.Index): string {
    const prefix = i.kind === 'time-index' ? '@' : '';
    return prefix + indexValueLabel(i.value);
}

function indexValueLabel(v: AST.IndexValue): string {
    switch (v.kind) {
        case 'identifier': return v.name + (v.path ? '.' + pathLabel(v.path) : '');
        case 'context-var': return contextVarLabel(v);
        case 'function': return `${v.name}()`;
        case 'name-ref': return `$${v.name}`;
        case 'arithmetic': return 'expr';
    }
}

function pathLabel(p: AST.PathDesc): string {
    return p.base + (p.next ? '.' + pathLabel(p.next) : '');
}

export function contextVarLabel(v: AST.ContextVar): string {
    const path = v.path ? '.' + pathLabel(v.path) : '';
    const idx = v.indices.length ? `[${v.indices.map(indexLabel).join(', ')}]` : '';
    return `${v.base}${path}${idx}`;
}
