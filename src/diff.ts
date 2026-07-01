// src/diff.ts
//
// Structural (AST-level) diff between two ACDL descriptions.
//
// Both files are parsed into the typed AST (see types.ts) and compared
// structurally, so reindentation / canonical whitespace / reordering don't show
// up as noise. The diff is reported at the granularity a human reads ACDL at —
// whole content lines (env.user_input[@1]) and block headers (ForEach(t: …),
// Mark 1, U:) — grouped and folded like a code diff, NOT as per-field scalar
// edits. Unchanged container headers are shown dimmed for context; only lines
// that actually changed get a +/-/~ marker.
//
// Usage (see main-diff.ts):
//   diffFiles(srcA, srcB) -> DiffLine[]
//   formatDiff(lines)     -> string   (folded, source-like report)

import * as AST from "./types";
import { Parser } from "./parser";

export type LineOp = "context" | "add" | "remove" | "change";

export interface DiffLine {
  op: LineOp;
  /** Indentation depth (structural nesting). */
  depth: number;
  /** For add / remove / context. */
  text?: string;
  /** For change (~): old and new rendering of the same line. */
  before?: string;
  after?: string;
}

type TopBlock = AST.Prompt | AST.CommentBlock | AST.StrFragDef | AST.RolesFragDef;

/* ───────────────────────── Public API ───────────────────────── */

export function diffFiles(srcA: string, srcB: string): DiffLine[] {
  // The parser is chatty on console.log; keep the diff output clean.
  const [a, b] = muteConsole(() => [
    new Parser(srcA).parseFile() as TopBlock[],
    new Parser(srcB).parseFile() as TopBlock[],
  ]);
  const out: DiffLine[] = [];
  // Common case: each file is a single prompt — diff directly regardless of a
  // rename, rather than remove+add.
  if (a.length === 1 && b.length === 1) {
    diffPair(a[0], b[0], 0, out);
  } else {
    diffList(a, b, 0, out);
  }
  return out;
}

/* ───────────────────── Block-list diff (LCS align) ───────────────────── */

/**
 * Diff two arrays of AST nodes. They're aligned by an LCS over per-node
 * signatures so an insertion reports one added block, not a cascade. Matched
 * pairs recurse; unmatched nodes are emitted whole (header + children).
 */
function diffList(a: any[], b: any[], depth: number, out: DiffLine[]): void {
  const keep = lcs(a.map(sig), b.map(sig));
  let i = 0;
  let j = 0;
  for (const [mi, mj] of keep) {
    while (i < mi) emitSubtree(a[i++], "remove", depth, out);
    while (j < mj) emitSubtree(b[j++], "add", depth, out);
    diffPair(a[i++], b[j++], depth, out);
  }
  while (i < a.length) emitSubtree(a[i++], "remove", depth, out);
  while (j < b.length) emitSubtree(b[j++], "add", depth, out);
}

/* ───────────────────── Matched-pair diff (by kind) ───────────────────── */

function diffPair(a: any, b: any, depth: number, out: DiffLine[]): void {
  if (!isNode(a) || !isNode(b) || a.kind !== b.kind) {
    changeIfDiff(ser(a), ser(b), depth, out);
    return;
  }

  switch (a.kind as string) {
    case "prompt": {
      // Title as the top header; changed titles show old → new.
      changeIfDiff(ser(a.title), ser(b.title), depth, out, /*asHeader*/ true);
      diffBody(a.body, b.body, depth, out);
      return;
    }

    case "role-message": {
      const kids: DiffLine[] = [];
      diffList(a.body, b.body, depth + 1, kids);
      const roleChanged = a.role !== b.role;
      if (kids.length === 0) {
        // Body identical: only report if the role marker itself changed.
        if (roleChanged) change(ser(a), ser(b), depth, out);
        return;
      }
      out.push(header(roleChanged ? `${a.role}: → ${b.role}:` : `${a.role}:`, depth, roleChanged));
      out.push(...kids);
      return;
    }

    case "loop-block-outside-role":
    case "loop-block-inside-role":
      diffContainer(
        `ForEach(${ser(a.index)}: ${ser(a.iterable)})`,
        `ForEach(${ser(b.index)}: ${ser(b.iterable)})`,
        a.body, b.body, depth, out
      );
      return;

    case "mark-block":
    case "mark-block-inside-role":
      diffContainer(`Mark ${a.markNumber}`, `Mark ${b.markNumber}`, a.body, b.body, depth, out);
      return;

    case "conditional-block-outside-role":
    case "conditional-block-inside-role":
      diffContainer(
        `If(${serFlat(a.Ifcondition)})`,
        `If(${serFlat(b.Ifcondition)})`,
        a.IfBody, b.IfBody, depth, out
      );
      // else / elseif shifts are rare; fall back to a whole-line change on those.
      changeIfDiff(serElse(a), serElse(b), depth + 1, out);
      return;

    case "switch-block-outside-role":
    case "switch-block-inside-role":
      diffContainer(
        `Switch(${serFlat(a.expression)})`,
        `Switch(${serFlat(b.expression)})`,
        a.cases, b.cases, depth, out
      );
      return;

    case "case-block-outside-role":
    case "case-block-inside-role":
      diffContainer(`case ${serFlat(a.match)}`, `case ${serFlat(b.match)}`, a.body, b.body, depth, out);
      return;

    case "str-frag-def":
    case "roles-frag-def":
      diffContainer(
        `${a.kind === "str-frag-def" ? "StrFrag" : "RolesFrag"} ${a.name}`,
        `${b.kind === "str-frag-def" ? "StrFrag" : "RolesFrag"} ${b.name}`,
        a.body, b.body, depth, out
      );
      return;

    default:
      // Atomic content line (context-var, function, template, name-ref,
      // name-def, comment, identifier, arithmetic, invocation, …).
      changeIfDiff(ser(a), ser(b), depth, out);
      return;
  }
}

/** A container = a header line + a recursively-diffed child body. */
function diffContainer(headA: string, headB: string, aBody: any[], bBody: any[], depth: number, out: DiffLine[]): void {
  const kids: DiffLine[] = [];
  diffList(aBody ?? [], bBody ?? [], depth + 1, kids);
  const headChanged = headA !== headB;
  if (headChanged) change(headA, headB, depth, out);
  else if (kids.length) out.push(header(headA, depth, false));
  out.push(...kids);
}

function diffBody(a: AST.PromptBody, b: AST.PromptBody, depth: number, out: DiffLine[]): void {
  const aBlocks = a?.kind === "chat-prompt-body" ? a.body : a?.message?.body ?? [];
  const bBlocks = b?.kind === "chat-prompt-body" ? b.body : b?.message?.body ?? [];
  diffList(aBlocks, bBlocks, depth, out);
}

/* ───────────────────── Emit whole added/removed subtree ───────────────────── */

/** Emit a node (and, for containers, its children) all under one op. */
function emitSubtree(node: any, op: "add" | "remove", depth: number, out: DiffLine[]): void {
  const kids = childBlocks(node);
  if (kids && kids.length) {
    out.push({ op, depth, text: containerHeader(node) });
    for (const k of kids) emitSubtree(k, op, depth + 1, out);
  } else {
    out.push({ op, depth, text: ser(node) });
  }
}

/** Child block array for container kinds, else null (leaf / atomic). */
function childBlocks(node: any): any[] | null {
  if (!isNode(node)) return null;
  switch (node.kind as string) {
    case "role-message":
      // Inline a single atomic child (U: env.user_input[@1]) instead of splitting.
      return node.body.length === 1 && isAtomic(node.body[0]) ? null : node.body;
    case "loop-block-outside-role":
    case "loop-block-inside-role":
    case "mark-block":
    case "mark-block-inside-role":
    case "str-frag-def":
    case "roles-frag-def":
      return node.body;
    case "prompt":
      return node.body?.kind === "chat-prompt-body" ? node.body.body : node.body?.message?.body ?? null;
    default:
      return null;
  }
}

function containerHeader(node: any): string {
  switch (node.kind as string) {
    case "role-message":
      return `${node.role}:`;
    case "loop-block-outside-role":
    case "loop-block-inside-role":
      return `ForEach(${ser(node.index)}: ${ser(node.iterable)})`;
    case "mark-block":
    case "mark-block-inside-role":
      return `Mark ${node.markNumber}`;
    case "str-frag-def":
      return `StrFrag ${node.name}`;
    case "roles-frag-def":
      return `RolesFrag ${node.name}`;
    case "prompt":
      return ser(node.title);
    default:
      return ser(node);
  }
}

function isAtomic(node: any): boolean {
  return isNode(node) && childBlocks(node) === null;
}

/* ───────────────────────── Line helpers ───────────────────────── */

function header(text: string, depth: number, changed: boolean): DiffLine {
  return changed ? { op: "change", depth, before: text.split(" → ")[0], after: text.split(" → ")[1] ?? text } : { op: "context", depth, text };
}

function change(before: string, after: string, depth: number, out: DiffLine[]): void {
  out.push({ op: "change", depth, before, after });
}

function changeIfDiff(before: string, after: string, depth: number, out: DiffLine[], asHeader = false): void {
  if (before === after) {
    if (asHeader) out.push({ op: "context", depth, text: before });
    return;
  }
  out.push({ op: "change", depth, before, after });
}

function serElse(cond: any): string {
  // Compact rendering of elseif/else bodies so structural shifts still surface.
  const parts: string[] = [];
  (cond.elseif ?? []).forEach((c: any[], i: number) => {
    parts.push(`elseif(${serFlat(c)}){${(cond.elseifBody?.[i] ?? []).map(ser).join("; ")}}`);
  });
  if (cond.elseBody) parts.push(`else{${cond.elseBody.map(ser).join("; ")}}`);
  return parts.join(" ");
}

/* ───────────────────────── Reporting ───────────────────────── */

export function formatDiff(lines: DiffLine[], useColor = false): string {
  const real = lines.filter((l) => l.op !== "context");
  if (real.length === 0) return "No structural differences.";

  const dim = (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s);
  const col = (op: LineOp, s: string) => {
    if (!useColor) return s;
    const c = op === "add" ? 32 : op === "remove" ? 31 : 33; // green / red / yellow
    return `\x1b[${c}m${s}\x1b[0m`;
  };

  const rendered = lines.map((l) => {
    const indent = "  ".repeat(l.depth);
    switch (l.op) {
      case "context":
        return `${indent}  ${dim(l.text!)}`;
      case "add":
        return col("add", `${indent}+ ${l.text}`);
      case "remove":
        return col("remove", `${indent}- ${l.text}`);
      case "change":
        return col("change", `${indent}~ ${l.before}`) + dim("  →  ") + col("change", `${l.after}`);
    }
  });

  const n = (op: LineOp) => real.filter((l) => l.op === op).length;
  const summary = `\n${real.length} change(s): ` +
    `+${n("add")} added, -${n("remove")} removed, ~${n("change")} modified`;
  return rendered.join("\n") + "\n" + summary;
}

/* ───────────────────────── HTML reporting ───────────────────────── */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the diff as an HTML fragment (`<div class="acdl-diff">…</div>`) for the
 * VS Code webview and the website. Pair with DIFF_CSS for styling.
 */
export function formatDiffHtml(lines: DiffLine[]): string {
  const real = lines.filter((l) => l.op !== "context");
  if (real.length === 0) {
    return `<div class="acdl-diff acdl-diff-empty">No structural differences.</div>`;
  }

  const rows = lines
    .map((l) => {
      const pad = `style="padding-left:${l.depth * 1.5 + 0.5}em"`;
      switch (l.op) {
        case "context":
          return `<div class="dl dl-context" ${pad}><span class="mk"> </span><span class="tx">${escapeHtml(l.text!)}</span></div>`;
        case "add":
          return `<div class="dl dl-add" ${pad}><span class="mk">+</span><span class="tx">${escapeHtml(l.text!)}</span></div>`;
        case "remove":
          return `<div class="dl dl-remove" ${pad}><span class="mk">-</span><span class="tx">${escapeHtml(l.text!)}</span></div>`;
        case "change":
          return `<div class="dl dl-change" ${pad}><span class="mk">~</span><span class="tx"><span class="old">${escapeHtml(
            l.before ?? ""
          )}</span><span class="arw">→</span><span class="new">${escapeHtml(l.after ?? "")}</span></span></div>`;
      }
    })
    .join("\n");

  const n = (op: LineOp) => real.filter((l) => l.op === op).length;
  const summary =
    `<div class="dl-summary">${real.length} change(s): ` +
    `<span class="s-add">+${n("add")} added</span>, ` +
    `<span class="s-remove">−${n("remove")} removed</span>, ` +
    `<span class="s-change">~${n("change")} modified</span></div>`;

  return `<div class="acdl-diff">\n${rows}\n${summary}\n</div>`;
}

/** Standalone CSS for formatDiffHtml output. Themeable via the CSS vars below. */
export const DIFF_CSS = `
.acdl-diff {
  font-family: "JetBrains Mono", "Fira Code", ui-monospace, monospace;
  font-size: 13px;
  line-height: 1.7;
  --diff-add: #1a7f37;
  --diff-add-bg: rgba(26,127,55,0.08);
  --diff-remove: #cf222e;
  --diff-remove-bg: rgba(207,34,46,0.08);
  --diff-change: #9a6700;
  --diff-change-bg: rgba(154,103,0,0.08);
  --diff-context: #6e7781;
}
.acdl-diff .dl { white-space: pre-wrap; word-break: break-word; border-radius: 3px; }
.acdl-diff .mk { display: inline-block; width: 1.2em; font-weight: 700; opacity: 0.85; }
.acdl-diff .dl-context { color: var(--diff-context); }
.acdl-diff .dl-add { color: var(--diff-add); background: var(--diff-add-bg); }
.acdl-diff .dl-remove { color: var(--diff-remove); background: var(--diff-remove-bg); }
.acdl-diff .dl-change { color: var(--diff-change); background: var(--diff-change-bg); }
.acdl-diff .dl-change .old { text-decoration: line-through; opacity: 0.7; }
.acdl-diff .dl-change .arw { margin: 0 0.5em; opacity: 0.6; }
.acdl-diff .dl-change .new { font-weight: 600; }
.acdl-diff .dl-summary { margin-top: 1em; padding-top: 0.6em; border-top: 1px solid rgba(128,128,128,0.25); font-size: 12px; color: var(--diff-context); }
.acdl-diff .s-add { color: var(--diff-add); }
.acdl-diff .s-remove { color: var(--diff-remove); }
.acdl-diff .s-change { color: var(--diff-change); }
.acdl-diff-empty { color: var(--diff-context); font-style: italic; }
`;

/* ─────────────── Signatures & LCS (array alignment) ─────────────── */

/**
 * Coarse key identifying "the same slot" across files. Equal signatures are
 * candidates to be matched (then diffed internally); a loop whose range changed
 * still matches its counterpart instead of showing add+remove.
 */
function sig(node: any): string {
  if (!isNode(node)) return `raw:${serFlat(node)}`;
  switch (node.kind) {
    case "prompt":
      return `prompt:${node.title?.name ?? ""}`;
    case "role-message":
      return `role:${node.role}`;
    case "mark-block":
    case "mark-block-inside-role":
      return `mark:${node.markNumber}`;
    case "name-def":
      return `namedef:${node.name}`;
    case "str-frag-def":
    case "roles-frag-def":
    case "str-frag-invocation":
    case "roles-frag-invocation":
      return `frag:${node.name}`;
    default:
      // Loops/conditionals/switches/content: match by kind (positional LCS
      // handles multiples), then recurse/compare for the details.
      return node.kind;
  }
}

/** Longest common subsequence over signature strings -> matched index pairs. */
function lcs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

/* ───────────────────────── Type guards / utils ───────────────────────── */

function isNode(x: any): x is { kind: string } & Record<string, any> {
  return x !== null && typeof x === "object" && !Array.isArray(x) && typeof x.kind === "string";
}

function muteConsole<T>(fn: () => T): T {
  const orig = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = orig;
  }
}

/* ─────────────── Canonical plain-text serialization ─────────────── */

/** One-line canonical ACDL text for a node. */
function ser(n: any): string {
  if (n == null) return "";
  if (Array.isArray(n)) return serFlat(n);
  if (!isNode(n)) return String(n);

  switch (n.kind as string) {
    case "prompt":
      return `${ser(n.title)}: {…}`;
    case "title":
      return `${n.name}${serIndices(n.indices)}`;
    case "identifier":
      return `${n.name}${n.path ? "." + serPath(n.path) : ""}`;
    case "context-var":
      return `${n.base}${serIndices(n.indices)}${serPathChain(n.path)}${serComment(n.comment)}`;
    case "path-desc":
      return serPath(n as AST.PathDesc);
    case "time-index":
      return `@${ser(n.value)}`;
    case "other-index":
      return ser(n.value);
    case "arithmetic":
      return `${ser(n.left)}${n.operator.join("")}${ser(n.right)}`;
    case "name-ref":
      return `$${n.name}${serIndices(n.indices)}${serPathChain(n.path)}`;
    case "name-def":
      return `name ${n.name} := ${ser(n.value)}`;
    case "function":
      return `${n.name}(${(n.arguments ?? []).map(ser).join(", ")})${serIndices(n.indices)}`;
    case "template":
      return n.arguments?.length ? `${n.name}[${n.arguments.map(ser).join(", ")}]` : n.name;
    case "list-comprehension":
      return `[${ser(n.element)} for ${n.variable} in ${ser(n.iterable)}]`;
    case "str-frag-invocation":
    case "roles-frag-invocation":
      return `Frag ${n.name}[${(n.arguments ?? []).map(ser).join(", ")}]`;
    case "str-frag-def":
      return `StrFrag ${n.name}[${(n.params ?? []).map(ser).join(", ")}]: {…}`;
    case "roles-frag-def":
      return `RolesFrag ${n.name}[${(n.params ?? []).map(ser).join(", ")}]: {…}`;
    case "role-message":
      return `${n.role}: ${serBodyPreview(n.body)}`;
    case "comment-block":
      return `// ${n.text}`;
    case "mark-block":
    case "mark-block-inside-role":
      return `Mark ${n.markNumber} {…}`;
    case "loop-block-outside-role":
    case "loop-block-inside-role":
      return `ForEach(${ser(n.index)}: ${ser(n.iterable)}) {…}`;
    case "conditional-block-outside-role":
    case "conditional-block-inside-role":
      return `If(${serFlat(n.Ifcondition)}) {…}`;
    case "switch-block-outside-role":
    case "switch-block-inside-role":
      return `Switch(${serFlat(n.expression)}) {…}`;
    case "case-block-outside-role":
    case "case-block-inside-role":
      return `case ${serFlat(n.match)}: {…}`;
    case "default-case-block-outside-role":
    case "default-case-block-inside-role":
      return `default: {…}`;
    case "end-block":
      return `END if ${serFlat(n.condition)}`;
    case "range-expr":
      return `${serFlat(n.start)}...${serFlat(n.end)}${n.step ? ` every ${serFlat(n.step)}` : ""}`;
    case "iterable":
      return serFlat(n.tokens);
    case "chat-prompt-body":
    case "completion-prompt-body":
      return "{…}";
    default:
      return n.kind;
  }
}

function serIndices(indices?: AST.Index[]): string {
  if (!indices || indices.length === 0) return "";
  return `[${indices.map(ser).join(",")}]`;
}

function serPath(path?: AST.PathDesc): string {
  const segs: string[] = [];
  let cur: AST.PathDesc | undefined = path;
  while (cur) {
    segs.push(`${cur.base}${serIndices(cur.indices)}`);
    cur = cur.next;
  }
  return segs.join(".");
}

function serPathChain(path?: AST.PathDesc): string {
  return path ? "." + serPath(path) : "";
}

function serComment(c?: string): string {
  return c ? ` // ${c}` : "";
}

/** Join ExpressionToken[] / string[] / nested arrays into canonical text. */
function serFlat(x: any): string {
  if (x == null) return "";
  if (!Array.isArray(x)) return isNode(x) ? ser(x) : String(x);
  if (x.length > 0 && x.every((el) => el && typeof el === "object" && "value" in el && !("kind" in el))) {
    return joinExprTokens(x as AST.ExpressionToken[]);
  }
  return x
    .map((el) => (Array.isArray(el) ? serFlat(el) : isNode(el) ? ser(el) : String(el)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

const NO_SPACE_BEFORE = new Set([".", ",", "]", ")", "[", "("]);
const NO_SPACE_AFTER = new Set([".", "@", "[", "("]);

function joinExprTokens(tokens: AST.ExpressionToken[]): string {
  let out = "";
  let prev = "";
  for (const tok of tokens) {
    const v = String(tok.value);
    const glue = out === "" || NO_SPACE_BEFORE.has(v) || NO_SPACE_AFTER.has(prev);
    out += (glue ? "" : " ") + v;
    prev = v;
  }
  return out;
}

/** Short preview of a role body: first item, plus a count if there are more. */
function serBodyPreview(body: any[]): string {
  if (!body || body.length === 0) return "(empty)";
  const first = ser(body[0]);
  return body.length === 1 ? first : `${first} … (+${body.length - 1})`;
}
