// bun test src/acdl-check.test.ts
//
// The checker is what the acdl-syntax agent trusts to tell it whether a file is
// fixed. Two properties matter more than anything else it does: it must not call
// a valid file broken, and when a file is broken it must point at the edit
// rather than at the symptom.

import { test, expect } from 'bun:test';
import { checkSource, braceBalance, report } from './acdl-check';

console.log = () => {};

const VALID = `P[@T]: {
  S: INSTRUCTIONS
  Name docs := kRelevant(env.q[@T])
  ForEach(doc: $docs) {
    U: doc.content
  }
  U: env.q[@T]
}
`;

test('a valid spec produces no diagnostics', () => {
    expect(checkSource(VALID)).toEqual([]);
});

test('the relaxed spellings are valid too — the checker is not a style critic', () => {
    const relaxed = `p[@T] {
  system: INSTRUCTIONS
  name docs = kRelevant(env.q[@T]);
  for doc in $docs {
    user: doc.content
  }
}
`;
    expect(checkSource(relaxed)).toEqual([]);
});

test('an unclosed block names the line it opened on, once', () => {
    // The parser hits the end of the file and reports which block it was still
    // inside. The brace scan finds the same block, so it is not repeated.
    const source = `P[@T]: {
  S: {
    INSTRUCTIONS
}
`;
    const diagnostics = checkSource(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toMatch(/Missing closing "}" for prompt "P" opened at line 1/);
});

test('a block the parser did not name is still reported by the brace scan', () => {
    const source = `P[@T]: {
  S: {
    INSTRUCTIONS
`;
    const messages = checkSource(source).map((d) => d.message);
    // Two blocks are open; the parser can only name the one it was parsing.
    expect(messages.some((m) => /Unclosed/.test(m))).toBe(true);
});

test('when the parser fails partway through, its position leads, not the brace', () => {
    // A role marker inside an open role block: the parser's position (line 4) is
    // the cause, and the unbalanced brace is the consequence. Leading with the
    // brace would send a fixer to add a `}` at the end of the file.
    const source = `Broken[@T]: {
  S: {
    INSTRUCTIONS
  U: env.q[@T]
}
`;
    const diagnostics = checkSource(source);
    expect(diagnostics[0].line).toBe(4);
    expect(diagnostics[0].message).toMatch(/inside role/);
    expect(diagnostics[1].message).toMatch(/Unclosed/);
});

test('a surplus closing brace is reported where it appears', () => {
    const diagnostics = braceBalance(`P[@T]: {\n  S: INSTRUCTIONS\n}\n}\n`);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toMatch(/no matching/);
    expect(diagnostics[0].line).toBe(4);
});

test('braces inside comments and strings do not count', () => {
    expect(braceBalance(`P[@T]: {\n  // a } in a comment\n  S: INSTRUCTIONS\n}\n`)).toEqual([]);
    expect(braceBalance(`P[@T]: {\n  Switch env.a[@T] {\n   Case "}" { S: X }\n  }\n}\n`)).toEqual([]);
});

test('an unbound $name is caught, with the binding to add', () => {
    const diagnostics = checkSource(`P[@T]: {\n  U: $typo\n}\n`);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toBe('$typo is never bound');
    expect(diagnostics[0].hint).toMatch(/Name typo :=/);
});

test('loop variables and fragment parameters count as bindings', () => {
    // Neither is a `Name` definition, and reporting them would be a false alarm
    // on nearly every real spec.
    expect(checkSource(`P[@T]: {\n  ForEach(doc: env.docs) {\n   U: $doc\n  }\n}\n`)).toEqual([]);
    expect(checkSource(`StrFrag D[doc]: {\n env.title[doc]\n}\nP[@T]: {\n U: { Frag D[env.d] }\n}\n`)).toEqual([]);
});

test('an undefined fragment is caught, with both definition forms offered', () => {
    const diagnostics = checkSource(`P[@T]: {\n  U: { Frag Missing[1] }\n}\n`);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toMatch(/Frag Missing is invoked but never defined/);
    expect(diagnostics[0].hint).toMatch(/StrFrag.*RolesFrag/);
});

test('a report puts a caret under the failing column', () => {
    const source = `P[@T]: {\n  U: env.q[@T]\n}\n`;
    const text = report('x.acdl', source, [
        { severity: 'error', line: 2, col: 6, message: 'nope' },
    ]);
    expect(text).toContain('x.acdl:2:6: error: nope');
    const caretLine = text.split('\n').find((l) => l.trim().startsWith('^'))!;
    const sourceLine = text.split('\n').find((l) => l.includes('U: env.q'))!;
    expect(caretLine.indexOf('^')).toBe(sourceLine.indexOf('env.q'));
});
