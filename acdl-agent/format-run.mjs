#!/usr/bin/env node
/**
 * format-run.mjs — capture a full Claude Code extraction run.
 *
 * Reads the `--output-format stream-json` NDJSON stream on stdin, mirrors it
 * verbatim to run.jsonl as it arrives, and derives two other views of the same
 * run:
 *
 *   run.jsonl        every stream event, one per line, exactly as emitted
 *   run.md           the session in order: explanations, tool calls with their
 *                    arguments, tool responses, and a closing usage summary
 *   transcript.json  assistant messages only, regrouped by message id, in the
 *                    same shape acdl-agent.py writes, so both runners produce
 *                    output that can be consumed the same way
 *
 * run.jsonl is flushed per line, so an interrupted or crashed run still leaves
 * a complete record. Rebuild the derived files from it with:
 *
 *   node format-run.mjs --from <dir>/run.jsonl -o <dir>
 *
 * On reasoning: Claude Code's headless stream carries `thinking` blocks whose
 * text is empty and whose signature is encrypted — the CLI strips reasoning
 * before it reaches stdout, and no flag restores it (--include-partial-messages
 * yields thinking_delta events of zero length). Those blocks are recorded as
 * explicit redaction markers rather than silently dropped, so the gap is
 * visible in the log. Reasoning text requires the SDK runner, acdl-agent.py.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// --------------------------------------------------------------------------
// args
// --------------------------------------------------------------------------

const argv = process.argv.slice(2);
let outDir = ".";
let fromFile = null;
let meta = {};

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "-o" || a === "--out") outDir = argv[++i];
  else if (a === "--from") fromFile = argv[++i];
  else if (a === "--meta") meta = JSON.parse(argv[++i]);
  else if (a === "-h" || a === "--help") {
    console.log("usage: format-run.mjs -o <dir> [--from <run.jsonl>] [--meta <json>]");
    process.exit(0);
  }
}

fs.mkdirSync(outDir, { recursive: true });
const JSONL = path.join(outDir, "run.jsonl");
const MD = path.join(outDir, "run.md");
const TRANSCRIPT = path.join(outDir, "transcript.json");

// --------------------------------------------------------------------------
// event collection
// --------------------------------------------------------------------------

const events = [];
let malformed = 0;
let turn = 0;

function blocksOf(e) {
  const c = e.message?.content;
  if (Array.isArray(c)) return c;
  if (typeof c === "string") return [{ type: "text", text: c }];
  return [];
}

function argHint(input) {
  if (!input || typeof input !== "object") return "";
  for (const k of ["file_path", "pattern", "path", "filename", "command"]) {
    if (typeof input[k] === "string") return k + "=" + input[k].slice(0, 60);
  }
  return "";
}

function progress(e) {
  if (e.type === "assistant") {
    for (const b of blocksOf(e)) {
      const n = String(++turn).padStart(3);
      if (b.type === "tool_use") {
        const hint = argHint(b.input);
        process.stderr.write("  [" + n + "] tool   " + b.name + (hint ? "  " + hint : "") + "\n");
      } else if (b.type === "text" && b.text && b.text.trim()) {
        process.stderr.write("  [" + n + "] text   " + b.text.trim().split("\n")[0].slice(0, 68) + "\n");
      } else if (b.type === "thinking" || b.type === "redacted_thinking") {
        process.stderr.write("  [" + n + "] think  (redacted by Claude Code)\n");
      } else {
        turn--;
      }
    }
  } else if (e.type === "result") {
    process.stderr.write("  [---] done   " + e.subtype + " · " + e.num_turns + " turns\n");
  }
}

function record(line) {
  const trimmed = line.trim();
  if (!trimmed) return;
  let event;
  try {
    event = JSON.parse(trimmed);
  } catch {
    // The raw line is still in run.jsonl — a line we cannot parse is evidence
    // too, and dropping it would make the record incomplete.
    malformed++;
    return;
  }
  events.push(event);
  progress(event);
}

// --------------------------------------------------------------------------
// rendering helpers
// --------------------------------------------------------------------------

/** Tool results arrive either as a string or as an array of content blocks. */
function resultText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (typeof b === "string") return b;
        if (b.type === "text") return b.text ?? "";
        if (b.type === "image") return "[image: " + (b.source?.media_type ?? "unknown") + "]";
        return JSON.stringify(b);
      })
      .join("\n");
  }
  if (content == null) return "";
  return JSON.stringify(content, null, 2);
}

/** A fence long enough to survive backticks inside the payload. */
function fence(body) {
  let longest = 0;
  for (const m of String(body).matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return "`".repeat(Math.max(3, longest + 1));
}

function block(body, lang) {
  const f = fence(body);
  return f + (lang ?? "") + "\n" + body + "\n" + f;
}

/** Long payloads stay complete, but collapse so the log remains navigable. */
function collapsible(summary, body, lang) {
  const lines = String(body).split("\n").length;
  if (lines <= 40) return block(body, lang);
  return (
    "<details>\n<summary>" + summary + " — " + lines + " lines</summary>\n\n" +
    block(body, lang) + "\n\n</details>"
  );
}

function fmtInt(n) {
  return (n ?? 0).toLocaleString("en-US");
}

// --------------------------------------------------------------------------
// derived outputs
// --------------------------------------------------------------------------

function buildTranscript() {
  // The stream emits one event per content block; several share a message id
  // and belong to the same API message. Regroup them so transcript.json holds
  // whole assistant messages, matching acdl-agent.py's shape.
  const byId = new Map();
  const order = [];
  for (const e of events) {
    if (e.type !== "assistant" || !e.message) continue;
    const id = e.message.id ?? "anon-" + order.length;
    if (!byId.has(id)) {
      byId.set(id, { ...e.message, content: [] });
      order.push(id);
    }
    byId.get(id).content.push(...blocksOf(e));
  }
  return order.map((id) => byId.get(id));
}

function buildMarkdown() {
  const init = events.find((e) => e.type === "system" && e.subtype === "init");
  const result = events.find((e) => e.type === "result");
  const toolNames = new Map();

  const out = [];
  out.push("# ACDL extraction run", "");

  const facts = [
    ["target", meta.target],
    ["output", meta.out],
    ["model", init?.model ?? meta.model],
    ["effort", meta.effort],
    ["runner", "acdl-extract.sh (Claude Code CLI)"],
    ["session", init?.session_id],
    ["cwd", init?.cwd],
    ["permission mode", init?.permissionMode],
    ["tools", Array.isArray(init?.tools) ? init.tools.join(", ") : undefined],
    ["claude code", init?.claude_code_version],
  ].filter(([, v]) => v != null && v !== "");

  out.push("| | |", "|---|---|");
  for (const [k, v] of facts) out.push("| " + k + " | " + String(v).replace(/\|/g, "\\|") + " |");
  out.push("");
  out.push(
    "> **Reasoning is not in this log.** Claude Code's headless stream emits `thinking`",
    "> blocks with empty text and an encrypted signature — the CLI strips reasoning before",
    "> it reaches stdout, and no flag restores it. Each stripped block is marked below.",
    "> Everything else the model produced — explanations, tool calls with their arguments,",
    "> and every tool response — is recorded here in full.",
    "",
    "---",
    "",
  );

  let step = 0;
  for (const e of events) {
    const sub = e.parent_tool_use_id ? " _(subagent " + e.parent_tool_use_id + ")_" : "";

    if (e.type === "assistant") {
      for (const b of blocksOf(e)) {
        if (b.type === "thinking" || b.type === "redacted_thinking") {
          out.push("### " + ++step + ". Reasoning" + sub, "");
          out.push(
            "_[redacted by Claude Code — " +
              (b.signature ? "signature present, text stripped" : "no text emitted") +
              "]_",
            "",
          );
        } else if (b.type === "text") {
          if (!b.text || !b.text.trim()) continue;
          out.push("### " + ++step + ". Assistant" + sub, "");
          out.push(b.text.trimEnd(), "");
        } else if (b.type === "tool_use") {
          toolNames.set(b.id, b.name);
          out.push("### " + ++step + ". Tool call — `" + b.name + "`" + sub, "");
          out.push(collapsible(b.name + " arguments", JSON.stringify(b.input, null, 2), "json"), "");
        }
      }
    } else if (e.type === "user") {
      for (const b of blocksOf(e)) {
        if (b.type !== "tool_result") continue;
        const name = toolNames.get(b.tool_use_id) ?? "tool";
        const flag = b.is_error ? " — ERROR" : "";
        out.push("### " + ++step + ". Tool response — `" + name + "`" + flag + sub, "");
        out.push(collapsible(name + " response", resultText(b.content)), "");
      }
    } else if (e.type === "result") {
      out.push("---", "", "## Run summary", "");
      const u = e.usage ?? {};
      const rows = [
        ["outcome", e.subtype + (e.is_error ? " (error)" : "")],
        ["stop reason", e.stop_reason],
        ["turns", e.num_turns],
        ["duration", e.duration_ms != null ? (e.duration_ms / 1000).toFixed(1) + "s" : undefined],
        ["cost (usd)", e.total_cost_usd != null ? e.total_cost_usd.toFixed(4) : undefined],
        ["input tokens", fmtInt(u.input_tokens)],
        ["output tokens", fmtInt(u.output_tokens)],
        [
          "thinking tokens",
          u.output_tokens_details?.thinking_tokens != null
            ? fmtInt(u.output_tokens_details.thinking_tokens)
            : undefined,
        ],
        ["cache read", fmtInt(u.cache_read_input_tokens)],
        ["cache write", fmtInt(u.cache_creation_input_tokens)],
      ].filter(([, v]) => v != null && v !== "");
      out.push("| | |", "|---|---|");
      for (const [k, v] of rows) out.push("| " + k + " | " + v + " |");
      out.push("");
      if (e.api_error_status) out.push("**API error status:** " + e.api_error_status, "");
      if (Array.isArray(e.permission_denials) && e.permission_denials.length) {
        out.push("**Permission denials:** " + e.permission_denials.length, "");
        out.push(block(JSON.stringify(e.permission_denials, null, 2), "json"), "");
      }
    }
  }

  if (!result) {
    out.push("---", "", "## Run summary", "");
    out.push("_No `result` event — the run was interrupted or the process died before finishing._", "");
  }
  if (malformed) {
    out.push("_" + malformed + " stream line(s) could not be parsed as JSON; see run.jsonl._", "");
  }

  return out.join("\n");
}

function writeDerived() {
  const transcript = buildTranscript();
  fs.writeFileSync(TRANSCRIPT, JSON.stringify(transcript, null, 2), "utf8");
  fs.writeFileSync(MD, buildMarkdown(), "utf8");

  const toolCalls = events.reduce(
    (n, e) =>
      n + (e.type === "assistant" ? blocksOf(e).filter((b) => b.type === "tool_use").length : 0),
    0,
  );
  process.stderr.write(
    "\n  captured: " + events.length + " events · " + transcript.length +
      " assistant messages · " + toolCalls + " tool calls\n" +
      "  wrote   : run.jsonl, run.md, transcript.json\n",
  );
}

// --------------------------------------------------------------------------
// main
// --------------------------------------------------------------------------

if (fromFile) {
  for (const line of fs.readFileSync(fromFile, "utf8").split(/\r?\n/)) record(line);
  writeDerived();
} else {
  // Mirror the stream to disk line by line, so an interrupted run is still
  // fully recorded, then derive the other two views once stdin closes.
  const sink = fs.openSync(JSONL, "w");
  let buf = "";

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.trim()) fs.writeSync(sink, line.replace(/\r$/, "") + "\n");
      record(line);
    }
  });
  process.stdin.on("end", () => {
    if (buf.trim()) {
      fs.writeSync(sink, buf.replace(/\r$/, "") + "\n");
      record(buf);
    }
    fs.closeSync(sink);
    writeDerived();
  });
}
