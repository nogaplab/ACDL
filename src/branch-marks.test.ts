// bun test src/branch-marks.test.ts
//
// A Mark between the branches of an If chain (`Mark 1 { If … } ElseIf …`) lives
// in the conditional's branchMarks, not in its bodies, so every consumer of the
// AST has to look for it there. These tests cover the ones besides the parser.

import { test, expect } from 'bun:test';
import { Parser } from './parser';
import { renderPrompts } from './renderPrompt';
import { diffFiles, formatDiff } from './diff';

// The parser narrates its progress to the console; tests do not need the noise.
console.log = () => {};

const plain = `P[@T]: { S: {\n If a { x }\n ElseIf b { y }\n Else { z }\n} }`;
const marked = `P[@T]: { S: {\n Mark 1 { If a { x } }\n Mark 2 { ElseIf b { y } Else { z } }\n} }`;

/** The HTML with markup reduced to the branch headers and Mark brackets, in order. */
function outline(src: string): string {
    const html = renderPrompts(new Parser(src).parseFile() as any);
    return html
        .replace(/<div class="mark-block">/g, ' [ ')
        .replace(/<span class="mark-bracket-number">(\d+)<\/span>/g, ' ]$1 ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^.*Role: system /, '')
        .trim();
}

test('the HTML renderer brackets the branches each Mark covers', () => {
    expect(outline(marked)).toBe('[ If a : x ]1 [ ElseIf b : y Else : z ]2');
    expect(outline(plain)).toBe('If a : x ElseIf b : y Else : z');
});

test('the HTML renderer keeps and/or/not out of a context variable path', () => {
    const html = renderPrompts(new Parser(`P[@T]: { S: { If sys.a and not sys.b { x } } }`).parseFile() as any);
    expect(html).not.toContain('aand');
    expect(html).toMatch(/sys\.<wbr>a<\/span>/);
});

test('the diff reports Marks added around, or moved between, branches', () => {
    expect(formatDiff(diffFiles(plain, marked)))
        .toContain('branch marks: none  →  branch marks: Mark 1 {If} Mark 2 {ElseIf(b) Else}');
    const moved = `P[@T]: { S: {\n Mark 1 { If a { x } }\n ElseIf b { y }\n Mark 3 { Else { z } }\n} }`;
    expect(formatDiff(diffFiles(marked, moved)))
        .toContain('Mark 1 {If} Mark 2 {ElseIf(b) Else}  →  branch marks: Mark 1 {If} Mark 3 {Else}');
    expect(formatDiff(diffFiles(marked, marked))).toBe('No structural differences.');
});
