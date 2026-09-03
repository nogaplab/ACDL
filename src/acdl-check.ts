// acdl-check — does this file parse, and if not, exactly where does it go wrong?
//
//   bun run check <file.acdl> [more.acdl ...]
//   bun run check ACDL_examples/**/*.acdl --quiet
//
// The parser is the authority: a file is valid when `parseFile()` returns. What
// this adds is the reporting a fixer needs — the failing line with a caret under
// the column, a brace-balance summary when the error is a missing `}` (where the
// reported position is the symptom and the cause is somewhere above it), and the
// two name-resolution checks the grammar cannot make: a `$name` that is never
// bound, and a `Frag` that is never defined.
//
// Exit status is 0 when every file is clean and 1 when any file has an error, so
// this drives a fix loop and a CI step equally well.

import * as fs from "fs";
import * as path from "path";
import { Parser } from "./parser";
import { Scanner } from "./scanner";
import * as AST from "./types";

export type Diagnostic = {
    severity: "error" | "warning";
    line: number;
    col: number;
    message: string;
    /** Extra context that explains the position rather than restating it. */
    hint?: string;
};

/* ───────────────── brace balance ───────────────── */

/**
 * Where the braces stop matching, ignoring braces inside comments and strings.
 *
 * A missing `}` is reported by the parser at the point it ran out of input,
 * which is the end of the file — useless on its own for finding the block that
 * was left open. Re-scanning for unclosed `{`, or for a `}` with nothing to
 * close, points at the actual edit.
 */
export function braceBalance(source: string): Diagnostic[] {
    const open: Array<{ line: number; col: number }> = [];
    const scanner = new Scanner(source);
    const diagnostics: Diagnostic[] = [];

    try {
        for (;;) {
            const tok = scanner.nextToken();
            if (tok.type === "EOF") break;
            if (tok.type !== "SYMBOL") continue;
            if (tok.value === "{") open.push({ line: tok.line, col: tok.col });
            else if (tok.value === "}") {
                if (open.length === 0) {
                    diagnostics.push({
                        severity: "error",
                        line: tok.line,
                        col: tok.col,
                        message: `Closing "}" with no matching "{"`,
                    });
                } else {
                    open.pop();
                }
            }
        }
    } catch {
        // A lexical error is the parser's to report; balance is unknowable past it.
        return diagnostics;
    }

    // Innermost first: with one `}` missing, the brace left on the stack is
    // always the outermost open block, which is rarely where the edit belongs.
    // Listing them inside-out puts the most specific candidate first.
    for (const brace of open.reverse()) {
        diagnostics.push({
            severity: "error",
            line: brace.line,
            col: brace.col,
            message: `Unclosed "{" — no matching "}" was found for this block`,
            hint:
                "The missing \"}\" may belong to any block nested inside this one; " +
                "a later \"}\" will have closed the inner block instead. Check the " +
                "indentation, and remember that a role marker (S:, U:, A:, T:) inside " +
                "an open role block means that block should have closed before it.",
        });
    }

    return diagnostics;
}

/* ───────────────── name resolution ───────────────── */

/**
 * Walk every node of a parsed file, calling `visit` on each. The AST is a plain
 * discriminated-union tree, so a structural walk over object values reaches
 * every node without a per-kind visitor that would need updating whenever the
 * grammar grows.
 */
function walk(node: unknown, visit: (node: any) => void): void {
    if (Array.isArray(node)) {
        for (const child of node) walk(child, visit);
        return;
    }
    if (!node || typeof node !== "object") return;
    if (typeof (node as any).kind === "string") visit(node);
    for (const value of Object.values(node as object)) walk(value, visit);
}

/**
 * `$name` references with no `Name` binding, and `Frag` invocations with no
 * fragment definition. Both are resolved file-wide rather than per-scope: ACDL's
 * scoping is not formally lexical, and a false "undefined" on a name that is
 * bound in a sibling spec would be worse than a missed one.
 */
export function unresolvedNames(
    blocks: Array<AST.Prompt | AST.StrFragDef | AST.RolesFragDef | AST.CommentBlock>,
): Diagnostic[] {
    const boundNames = new Set<string>();
    const definedFrags = new Set<string>();
    const referencedNames = new Set<string>();
    const invokedFrags = new Set<string>();

    for (const block of blocks) {
        if (block.kind === "str-frag-def" || block.kind === "roles-frag-def") {
            definedFrags.add(block.name);
            // A fragment's parameters are bound inside its body.
            for (const param of block.params) {
                walk(param, (n) => {
                    if (n.kind === "identifier") boundNames.add(n.name);
                });
            }
        }
    }

    walk(blocks, (node) => {
        switch (node.kind) {
            case "name-def":
                boundNames.add(node.name);
                break;
            case "name-ref":
                referencedNames.add(node.name);
                break;
            case "str-frag-invocation":
            case "roles-frag-invocation":
                invokedFrags.add(node.name);
                break;
            case "loop-block-outside-role":
            case "loop-block-inside-role":
                // The loop variable is a binding occurrence.
                walk(node.index, (n) => {
                    if (n.kind === "identifier") boundNames.add(n.name);
                });
                break;
            case "list-comprehension":
                boundNames.add(node.variable);
                break;
        }
    });

    const diagnostics: Diagnostic[] = [];

    for (const name of referencedNames) {
        if (!boundNames.has(name)) {
            diagnostics.push({
                severity: "error",
                line: 0,
                col: 0,
                message: `$${name} is never bound`,
                hint: `If this is a typo, correct it to match an existing "Name ..." in the file. `
                    + `If the binding is genuinely missing, only the spec's author can say what `
                    + `"Name ${name} := ..." should be bound to.`,
            });
        }
    }

    for (const name of invokedFrags) {
        if (!definedFrags.has(name)) {
            diagnostics.push({
                severity: "error",
                line: 0,
                col: 0,
                message: `Frag ${name} is invoked but never defined`,
                hint: `If this is a typo, correct it to match a fragment defined in the file. `
                    + `If the definition is genuinely missing, only the spec's author can say what `
                    + `this fragment contains — as a StrFrag (content) or a RolesFrag (whole messages).`,
            });
        }
    }

    return diagnostics;
}

/* ───────────────── one file ───────────────── */

export function checkSource(source: string): Diagnostic[] {
    try {
        const blocks = new Parser(source).parseFile();
        return unresolvedNames(blocks);
    } catch (err: any) {
        const message = String(err?.message ?? err);
        const at = message.match(/^\[(\d+):(\d+)\]\s*([\s\S]*)$/);

        const diagnostic: Diagnostic = at
            ? { severity: "error", line: Number(at[1]), col: Number(at[2]), message: at[3] }
            : { severity: "error", line: 0, col: 0, message };

        const unbalanced = braceBalance(source);
        if (unbalanced.length === 0) return [diagnostic];

        // Which of the two is the better lead depends on where the parser gave
        // up. If it read to the end of the file, its position is the symptom of
        // an unclosed block and the brace is the cause. If it failed at a
        // specific construct partway through — a role marker inside a role
        // block, say — that position *is* the cause, and the unbalanced brace is
        // the downstream consequence.
        const lastLine = source.split(/\r?\n/).length;
        const ranOutOfInput = diagnostic.line >= lastLine - 1
            || /Missing closing|Unterminated/.test(diagnostic.message);

        // "Missing closing "}" for X opened at line N" already names the brace;
        // reporting the same block again from the other end reads as two
        // problems where there is one.
        const named = diagnostic.message.match(/opened at line (\d+)/);
        const distinct = named
            ? unbalanced.filter((d) => d.line !== Number(named[1]))
            : unbalanced;

        if (distinct.length === 0) return [diagnostic];

        return ranOutOfInput
            ? [...distinct, diagnostic]
            : [diagnostic, ...distinct];
    }
}

/* ───────────────── reporting ───────────────── */

function excerpt(source: string, line: number, col: number): string {
    const lines = source.split(/\r?\n/);
    if (line < 1 || line > lines.length) return "";
    const text = lines[line - 1].replace(/\t/g, " ");
    const gutter = String(line).padStart(5);
    const caret = " ".repeat(gutter.length + 3 + Math.max(0, col - 1)) + "^";
    return `${gutter} | ${text}\n${caret}`;
}

export function report(file: string, source: string, diagnostics: Diagnostic[]): string {
    const out: string[] = [];
    for (const d of diagnostics) {
        const where = d.line ? `${file}:${d.line}:${d.col}` : file;
        out.push(`${where}: ${d.severity}: ${d.message}`);
        if (d.line) {
            const context = excerpt(source, d.line, d.col);
            if (context) out.push(context);
        }
        if (d.hint) out.push(`      hint: ${d.hint}`);
        out.push("");
    }
    return out.join("\n");
}

/* ───────────────── cli ───────────────── */

// The parser narrates its progress to console.log, so this writes to the streams
// directly rather than fighting it for the channel.
const say = (text: string) => process.stdout.write(text + "\n");
const complain = (text: string) => process.stderr.write(text + "\n");

/**
 * A path short enough to read at a glance. Relative to the working directory
 * when the file is under it, absolute otherwise — a file in a temp directory
 * relativises to a ladder of `../..` that is worse than the full path.
 */
function displayPath(file: string): string {
    const relative = path.relative(process.cwd(), file).replace(/\\/g, "/");
    if (!relative || relative.startsWith("..")) return file.replace(/\\/g, "/");
    return relative;
}

function main(argv: string[]): number {
    const quiet = argv.includes("--quiet");
    const files = argv.filter((a) => !a.startsWith("--"));

    if (files.length === 0) {
        complain("Usage: bun run check <file.acdl> [more.acdl ...] [--quiet]");
        return 2;
    }

    let failed = 0;

    for (const file of files) {
        const name = displayPath(file);

        if (!fs.existsSync(file)) {
            complain(`${name}: error: no such file`);
            failed++;
            continue;
        }

        const source = fs.readFileSync(file, "utf-8");
        const diagnostics = checkSource(source);

        if (diagnostics.length === 0) {
            if (!quiet) say(`${name}: ok`);
            continue;
        }

        failed++;
        process.stdout.write(report(name, source, diagnostics));
    }

    if (failed === 0) {
        if (!quiet) say(`${files.length} file(s) checked, all valid.`);
    } else {
        complain(`${failed} of ${files.length} file(s) have errors.`);
    }

    return failed > 0 ? 1 : 0;
}

if (import.meta.main) {
    console.log = () => {};
    process.exit(main(process.argv.slice(2)));
}
