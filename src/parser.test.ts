// bun test src/parser.test.ts
//
// The parser is the first thing anyone new to ACDL meets, and every spelling it
// rejects is a reason not to keep writing. These tests pin the tolerances down:
// what the parser accepts beyond the canonical spelling, that accepting it does
// not change the AST (so the rendered diagram is identical however the source
// was typed), and — just as important — which mistakes are still errors.

import { test, expect } from 'bun:test';
import { Parser } from './parser';
import type * as AST from './types';

// The parser narrates its progress to the console; tests do not need the noise.
console.log = () => {};

const parse = (src: string) => new Parser(src).parseFile();

/** Parse both spellings and assert they produce exactly the same AST. */
function sameAst(canonical: string, relaxed: string) {
    expect(JSON.parse(JSON.stringify(parse(relaxed))))
        .toEqual(JSON.parse(JSON.stringify(parse(canonical))));
}

/** The prompt a single-spec source parses to. */
function onlyPrompt(src: string): AST.Prompt {
    const blocks = parse(src);
    expect(blocks).toHaveLength(1);
    return blocks[0] as AST.Prompt;
}

// ------------------------------------------------------- keyword capitalisation

test('control keywords are case-insensitive and normalise to canonical spelling', () => {
    sameAst(
        `P[@T]: {\n If @T > 1 {\n  U: env.q[@T]\n } Else {\n  U: env.r[@T]\n }\n}`,
        `P[@T]: {\n if @T > 1 {\n  U: env.q[@T]\n } else {\n  U: env.r[@T]\n }\n}`,
    );
    sameAst(
        `P[@T]: {\n ForEach(t: range(1, @T)) {\n  U: env.q[@t]\n }\n}`,
        `P[@T]: {\n foreach(t: RANGE(1, @T)) {\n  U: env.q[@t]\n }\n}`,
    );
    sameAst(
        `P[@T]: {\n Switch env.a[@T] {\n  Case "x" {\n   U: env.q[@T]\n  }\n  Default {\n   U: env.r[@T]\n  }\n }\n}`,
        `P[@T]: {\n SWITCH env.a[@T] {\n  case "x" {\n   U: env.q[@T]\n  }\n  DEFAULT {\n   U: env.r[@T]\n  }\n }\n}`,
    );
});

test('ALL_CAPS keywords are keywords — the paper figures write MARK', () => {
    // Paper/Source/acdl/react2.acdl and the fig1 sources all use `MARK n { ... }`.
    sameAst(
        `P[@T]: {\n Mark 1 {\n  S: INSTRUCTIONS\n }\n}`,
        `P[@T]: {\n MARK 1 {\n  S: INSTRUCTIONS\n }\n}`,
    );
});

test('ElseIf accepts its common misspellings, and Else If as two words', () => {
    const canonical = `P[@T]: {\n If @T > 2 {\n  U: env.a[@T]\n } ElseIf @T > 1 {\n  U: env.b[@T]\n } Else {\n  U: env.c[@T]\n }\n}`;
    for (const variant of ['elseif', 'elsif', 'elif', 'else if']) {
        sameAst(canonical, canonical.replace('ElseIf', variant));
    }
});

test('a spec titled Prompt[@T] is a title, not the prompt namespace', () => {
    // `prompt.field` is a context variable, but `Prompt[@T]: { ... }` is one of
    // the commonest spec titles there is and must keep working.
    expect(onlyPrompt(`Prompt[@T]: {\n S: INSTRUCTIONS\n}`).title.name).toBe('Prompt');
});

test('namespaces are recognised in any casing when a path follows', () => {
    sameAst(
        `P[@T]: {\n U: env.user_question[@T]\n}`,
        `P[@T]: {\n U: Env.user_question[@T]\n}`,
    );
});

// ------------------------------------------------------------- role markers

test('role markers are case-insensitive and may be spelled out', () => {
    const canonical = `P[@T]: {\n S: INSTRUCTIONS\n U: env.q[@T]\n A: resp.a[@T]\n T: sys.tool[@T]\n}`;
    sameAst(canonical, `P[@T]: {\n s: INSTRUCTIONS\n u: env.q[@T]\n a: resp.a[@T]\n t: sys.tool[@T]\n}`);
    sameAst(canonical, `P[@T]: {\n system: INSTRUCTIONS\n user: env.q[@T]\n assistant: resp.a[@T]\n tool: sys.tool[@T]\n}`);
});

test('a loop variable named a or t is not mistaken for a role', () => {
    // `a` and `t` are the conventional loop variables; only a following `:` or
    // `{` makes one a role marker.
    const spec = onlyPrompt(`P[@T]: {\n ForEach(a: env.actors[@T]) {\n  U: a.name\n }\n}`);
    const body = (spec.body as AST.ChatPromptBody).body;
    expect(body[0].kind).toBe('loop-block-outside-role');
});

// --------------------------------------------------------- optional punctuation

test('the colon before a block body is optional', () => {
    sameAst(`P[@T]: {\n S: { INSTRUCTIONS }\n}`, `P[@T] {\n S { INSTRUCTIONS }\n}`);
});

test('Case and Default accept the trailing colon the language reference writes', () => {
    // §15 of acdl-language.md writes `Case user: {`; the colon is punctuation and
    // must not end up inside the match expression.
    sameAst(
        `P[@T]: {\n Switch env.src[@T] {\n  Case user {\n   U: env.q[@T]\n  }\n  Default {\n   U: env.r[@T]\n  }\n }\n}`,
        `P[@T]: {\n Switch env.src[@T] {\n  Case user: {\n   U: env.q[@T]\n  }\n  Default: {\n   U: env.r[@T]\n  }\n }\n}`,
    );
});

test('stray semicolons are ignored', () => {
    sameAst(`P[@T]: {\n S: INSTRUCTIONS\n U: env.q[@T]\n}`, `P[@T]: {\n S: INSTRUCTIONS;\n U: env.q[@T];\n}`);
});

test('a trailing comma in an argument list is not a missing argument', () => {
    sameAst(`P[@T]: {\n U: summarize(env.a[@T], env.b[@T])\n}`, `P[@T]: {\n U: summarize(env.a[@T], env.b[@T],)\n}`);
});

// ------------------------------------------------------------------ ForEach

test('a ForEach header may drop its parentheses or use in', () => {
    const canonical = `P[@T]: {\n ForEach(doc: env.docs[@T]) {\n  U: doc.content\n }\n}`;
    sameAst(canonical, `P[@T]: {\n ForEach doc: env.docs[@T] {\n  U: doc.content\n }\n}`);
    sameAst(canonical, `P[@T]: {\n ForEach(doc in env.docs[@T]) {\n  U: doc.content\n }\n}`);
    sameAst(canonical, `P[@T]: {\n for doc in env.docs[@T] {\n  U: doc.content\n }\n}`);
});

test('a call inside an unparenthesised iterable does not end the header early', () => {
    const spec = onlyPrompt(`P[@T]: {\n ForEach(d: topK(env.docs[@T], 5)) {\n  U: d.content\n }\n}`);
    const loop = (spec.body as AST.ChatPromptBody).body[0] as AST.LoopBlockOutsideRole;
    expect(loop.kind).toBe('loop-block-outside-role');
    expect(loop.body).toHaveLength(1);
});

test('for still introduces a list comprehension, not a loop, inside brackets', () => {
    const spec = onlyPrompt(`P[@T]: {\n Name s := [sys.summary[@t] for t in range(1, @T)]\n U: $s\n}`);
    const def = (spec.body as AST.ChatPromptBody).body[0] as AST.NameDef;
    expect(def.value.kind).toBe('list-comprehension');
});

// ------------------------------------------------- name definitions and PromptEndsHere

test('a name definition binds with :=, = or a bare :', () => {
    const canonical = `P[@T]: {\n Name docs := kRelevant(env.q[@T])\n U: $docs\n}`;
    sameAst(canonical, `P[@T]: {\n Name docs = kRelevant(env.q[@T])\n U: $docs\n}`);
    sameAst(canonical, `P[@T]: {\n name docs : kRelevant(env.q[@T])\n U: $docs\n}`);
});

test('PromptEndsHere takes its condition with or without when and parentheses', () => {
    const canonical = `P[@T]: {\n U: env.q[@T]\n PromptEndsHere when (@T == 1)\n A: resp.a[@T]\n}`;
    sameAst(canonical, `P[@T]: {\n U: env.q[@T]\n PromptEndsHere when @T == 1\n A: resp.a[@T]\n}`);
    sameAst(canonical, `P[@T]: {\n U: env.q[@T]\n PromptEndsHere (@T == 1)\n A: resp.a[@T]\n}`);
});

test('a Mark without a number is numbered in source order', () => {
    const spec = onlyPrompt(`P[@T]: {\n Mark { S: INSTRUCTIONS }\n Mark { U: env.q[@T] }\n}`);
    const body = (spec.body as AST.ChatPromptBody).body as AST.MarkBlock[];
    expect(body.map((m) => m.markNumber)).toEqual([1, 2]);
});

// --------------------------------------------------------------- lexical noise

test('quotes may be single or smart', () => {
    const canonical = `P[@T]: {\n Switch env.a[@T] {\n  Case "x" {\n   U: env.q[@T]\n  }\n }\n}`;
    sameAst(canonical, canonical.replace(/"x"/, `'x'`));
    sameAst(canonical, canonical.replace(/"x"/, `“x”`));
});

test('# and block comments are comments', () => {
    const canonical = `P[@T]: {\n // a note\n S: INSTRUCTIONS\n}`;
    sameAst(canonical, `P[@T]: {\n # a note\n S: INSTRUCTIONS\n}`);
    sameAst(canonical, `P[@T]: {\n /* a note */\n S: INSTRUCTIONS\n}`);
});

test('comments above Case, Default, ElseIf and Else headers stay on their branch', () => {
    const spec = onlyPrompt(`P[@T]: {
 Switch env.a[@T] {
  // first case
  Case "x" {
   U: env.q[@T]
  }
  // the fallback
  // (two lines)
  Default {
   U: env.r[@T]
  }
 }
 If env.b[@T] {
  U: env.s[@T]
 }
 // before elseif
 ElseIf env.c[@T] {
  U: env.t[@T]
 }
 // before else
 Else {
  U: env.u[@T]
 }
}`);
    const [sw, cond] = (spec.body as AST.ChatPromptBody).body as [AST.SwitchBlockOutsideRole, AST.ConditionalBlockOutsideRole];
    expect(sw.kind).toBe('switch-block-outside-role');
    expect(sw.cases[0].comments).toEqual(['first case']);
    expect(sw.defaultCase?.comments).toEqual(['the fallback', '(two lines)']);
    expect(cond.kind).toBe('conditional-block-outside-role');
    expect(cond.elseifComments).toEqual([['before elseif']]);
    expect(cond.elseComments).toEqual(['before else']);
});

test('a comment after the last Case is kept inside the Switch', () => {
    const spec = onlyPrompt(`P[@T]: {
 Switch env.a[@T] {
  Case "x" {
   U: env.q[@T]
  }
  // trailing note
 }
}`);
    const sw = (spec.body as AST.ChatPromptBody).body[0] as AST.SwitchBlockOutsideRole;
    const tail = sw.cases[0].body[sw.cases[0].body.length - 1] as AST.CommentBlock;
    expect(tail).toEqual({ kind: 'comment-block', text: 'trailing note' });
});

test('typographic operators mean what their ASCII originals mean', () => {
    sameAst(`P[@T]: {\n ForEach(t: range(1, @T-1)) {\n  U: env.q[@t]\n }\n}`,
            `P[@T]: {\n ForEach(t: range(1, @T–1)) {\n  U: env.q[@t]\n }\n}`);
});

test('identifiers may use any Unicode letter', () => {
    expect(() => parse(`P[@T]: {\n U: env.café[@T]\n}`)).not.toThrow();
});

test('an unfamiliar symbol is a parse problem, not a lexical crash', () => {
    // The scanner hands `~` to the parser as a symbol; the error that comes back
    // names a position in the grammar rather than a codepoint.
    expect(() => parse(`P[@T]: {\n ~\n}`)).toThrow(/global scope/);
});

// ------------------------------------------------------------------ #msg

/** The single-message body of a one-role spec. */
function roleBody(src: string): AST.RoleBuildingBlock[] {
    const spec = onlyPrompt(src);
    const msg = (spec.body as AST.ChatPromptBody).body[0] as AST.RoleMessage;
    expect(msg.kind).toBe('role-message');
    return msg.body;
}

test('#msg is an argument of functions and templates', () => {
    const [fn] = roleBody(`P[@T]: {\n U: summarize(env.history[@T], #msg)\n}`) as AST.Func[];
    expect(fn.kind).toBe('function');
    expect(fn.arguments[1]).toEqual({ kind: 'msg-ref' });

    const [tpl] = roleBody(`P[@T]: {\n S: HEADER(#msg)\n}`) as AST.Template[];
    expect(tpl.kind).toBe('template');
    expect(tpl.arguments).toEqual([{ kind: 'msg-ref' }]);
});

test('#msg is an index of a context variable, alone or in arithmetic', () => {
    const [cv] = roleBody(`P[@T]: {\n U: sys.history[#msg]\n}`) as AST.ContextVar[];
    expect(cv.kind).toBe('context-var');
    expect(cv.path!.indices[0].value).toEqual({ kind: 'msg-ref' });

    const [prev] = roleBody(`P[@T]: {\n U: sys.history[@T][#msg-1].text\n}`) as AST.ContextVar[];
    const arith = prev.path!.indices[1].value as AST.ArithmeticExpr;
    expect(arith.kind).toBe('arithmetic');
    expect(arith.left).toEqual({ kind: 'msg-ref' });
});

test('#msg is spelled case-insensitively, but #msgs is still a comment', () => {
    sameAst(`P[@T]: {\n U: sys.history[#msg]\n}`, `P[@T]: {\n U: sys.history[#MSG]\n}`);
    // A trailing comment attaches to the element before it, so compare against `//`.
    sameAst(`P[@T]: {\n U: env.q[@T] // msgs are counted\n}`, `P[@T]: {\n U: env.q[@T] #msgs are counted\n}`);
    sameAst(`P[@T]: {\n U: env.q[@T] // msg\n}`, `P[@T]: {\n U: env.q[@T] # msg\n}`);
});

test('#msg is allowed in a StrFrag body and in a completion prompt', () => {
    expect(() => parse(`StrFrag Turn[]: {\n sys.history[#msg]\n}`)).not.toThrow();
    expect(() => parse(`P[@T]: {\n N: PREAMBLE(#msg)\n}`)).not.toThrow();
});

test('#msg outside a role message is an error', () => {
    // As a top-level loop bound, a top-level Name, a RolesFrag argument, and a title index.
    expect(() => parse(`P[@T]: {\n ForEach(t: range(1, #msg)) {\n  U: env.q[@t]\n }\n}`))
        .toThrow(/#msg .*only appear inside a role message/);
    expect(() => parse(`P[@T]: {\n Name h := pick(#msg)\n U: $h\n}`))
        .toThrow(/#msg .*only appear inside a role message/);
    expect(() => parse(`P[@T]: {\n Frag Turn[#msg]\n}`))
        .toThrow(/#msg .*only appear inside a role message/);
    expect(() => parse(`P[#msg]: {\n S: INSTRUCTIONS\n}`))
        .toThrow(/#msg .*only appear inside a role message/);
});

test('#msg on its own is not content', () => {
    expect(() => parse(`P[@T]: {\n U: {\n  #msg\n }\n}`)).toThrow(/argument or an index/);
});

// ------------------------------------------------------------- still errors

test('a missing closing brace names the line the block opened on', () => {
    expect(() => parse(`P[@T]: {\n S: INSTRUCTIONS\n`)).toThrow(/Missing closing "}".*line 1/s);
});

test('an If with no condition is still an error', () => {
    expect(() => parse(`P[@T]: {\n If {\n  S: INSTRUCTIONS\n }\n}`)).toThrow(/needs a condition/);
});

test('a name definition with no binding operator is still an error', () => {
    expect(() => parse(`P[@T]: {\n Name docs kRelevant(env.q[@T])\n}`)).toThrow(/Expected ":="/);
});

test('control flow is still rejected in the single-line role form', () => {
    expect(() => parse(`P[@T]: {\n U: ForEach(d: env.docs) { d.content }\n}`))
        .toThrow(/not allowed in single-line role syntax/);
});

test('a stray keyword inside a Switch is reported, not silently skipped', () => {
    expect(() => parse(`P[@T]: {\n Switch env.a[@T] {\n  Mark 1 { S: INSTRUCTIONS }\n }\n}`))
        .toThrow(/expected Case or Default/);
});
