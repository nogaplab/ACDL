# How acdl-agent works

`acdl-agent` reverse-engineers the **context-creation process** of an LLM agent from its
source code, and writes that structure out as an ACDL specification.

You point it at a codebase. It reads the source — never the README — finds every place the
codebase calls a model, traces what goes into each call, and produces a `.acdl` file
describing the shape of the message array, plus a report tying each line of that spec back
to the `file:line` that justifies it.

It is itself an agent, so it has a context-creation process of its own. That process is
specified in ACDL at the bottom of this document.

---

## 1. What runs

Three files travel together. The Python script resolves the two Markdown files relative to
its own location, so the directory can be copied or cloned into any codebase.

| File | Role at runtime |
|------|-----------------|
| [`acdl-agent.py`](acdl-agent.py) | Assembles the prompt, defines the tools, drives the loop |
| [`acdl-language.md`](acdl-language.md) | Loaded verbatim into the system prompt — teaches the model ACDL |
| [`extraction-prompt.md`](extraction-prompt.md) | Loaded verbatim into the system prompt — the task the model performs |

Neither Markdown file is interpreted by the script. They are concatenated into the system
prompt as opaque text, which means you can edit the task or the language reference without
touching any Python.

## 2. What happens on a run

**Resolve the target.** With no argument the target is the current directory, or its parent
when invoked from inside `acdl-agent/`. The script's own directory is added to an exclusion
list whenever it sits inside the target, so an agent cloned into the repo it is analyzing
never reads its own prompts back in as if they were part of the codebase under study.

**Build the system prompt.** A short framing preamble, then the ACDL language reference,
then the extraction task, then the working instructions that bind the two together and name
the tools. About 25,000 characters — roughly 7,000 tokens — and byte-identical across every
run, so it carries a `cache_control` breakpoint and is read from cache at ~10% of input
price on repeat runs.

**Build the first user message.** The absolute target root, a two-level directory listing
computed host-side by calling the `list_dir` tool directly, and an instruction to begin.
The listing is a free head start: without it the model's first two or three turns would be
spent asking for exactly this.

**Run the loop.** The Anthropic SDK's tool runner calls the model, executes whichever tool
the model asks for, appends the result, and calls again — until the model stops calling
tools. The script iterates that loop to print progress, accumulate token usage, and record
every assistant turn into `transcript.json`. `--max-iterations` (default 120) bounds it.

**Collect the deliverables.** The model does not return its results as text. It writes them
through the `write_output` tool, and the script reports which files landed, warning if no
`.acdl` was produced.

## 3. The tools

Five tools, four of them strictly read-only. Every path is resolved and confined to the
target root; anything that escapes is refused rather than clamped.

| Tool | What the model uses it for |
|------|----------------------------|
| `list_dir(path, max_depth)` | Orientation — an indented tree, skipping vendored and build directories |
| `glob_files(pattern, max_results)` | Locating candidates by name: `**/prompt*`, `**/*.jinja` |
| `grep(pattern, glob, max_results, ignore_case, context)` | The main discovery tool — regex over source, returning `file:line` |
| `read_file(path, offset, limit)` | Reading with 1-based line numbers, so the report can cite evidence |
| `write_output(filename, content)` | Delivering results — plain filenames only, directly into the output directory |

There is no shell, no write access to the target, and no network. The extraction task is
purely read-only, and the tool surface is built to match, because this is aimed at
third-party codebases you did not write.

## 4. What it produces

| File | Contents |
|------|----------|
| `<AgentName>.acdl` | The specification — one spec per structurally distinct prompt in the codebase |
| `extraction-report.md` | Every model call site found; a line-by-line evidence table; the abstraction decisions made; an explicit list of uncertainties |
| `transcript.json` | Every assistant turn, for auditing how a conclusion was reached |

The report is not a courtesy. Because the extraction is a judgment call in places, the
evidence table is what makes the spec checkable: each line is traceable to a `file:line`,
and anything the model had to guess is marked `// UNVERIFIED:` in the spec itself.

---

## 5. Its own context, in ACDL

The specification below describes the message array `acdl-agent.py` assembles before every
model call. It parses cleanly under this repo's own toolchain:

```bash
node scripts/diff.mjs acdl-agent/acdl-agent.acdl acdl-agent/acdl-agent.acdl
```

The same source is shipped as a standalone [`acdl-agent.acdl`](acdl-agent.acdl) so it can be
rendered and diffed like any other spec.

```acdl
// The context that acdl-agent.py assembles before every model call.
// @T is the tool-use step within a single run: there is exactly one user turn,
// and the agent then loops read -> reason -> write until it stops calling tools.
//
// Every `<-` comment cites the acdl-agent.py line(s) that produce the line below it.

// <- acdl-agent.py:512-521  client.beta.messages.tool_runner(...)
AcdlAgent[@T]: {

    // ---- Cached prefix: byte-identical on every step of every run -----------
    // <- acdl-agent.py:518  system=[{... "cache_control": {"type": "ephemeral"}}]
    Mark 1 {
    // <- acdl-agent.py:354-378  build_system_prompt(), returned as one string
    S: {
        // Tool schemas ride in the API's separate `tools` field, which renders
        // ahead of the system prompt and so shares the same cache breakpoint.
        // <- acdl-agent.py:347 TOOLS, :519 tools=TOOLS
        // <- tool definitions at :143 :199 :222 :283 :324
        ForEach(tool: sys.tools) {
            tool.name_description_and_schema
        }
        // <- acdl-agent.py:359-362
        ROLE_AND_DOCUMENT_FRAMING   // who you are; two documents follow
        // <- acdl-agent.py:363-364
        ACDL_LANGUAGE_REFERENCE     // acdl-language.md, verbatim
        // <- acdl-agent.py:365-366
        EXTRACTION_TASK             // extraction-prompt.md, verbatim
        // <- acdl-agent.py:367-377
        WORKING_INSTRUCTIONS        // read-only tools; deliver via write_output
    }
    }

    // ---- The one and only user turn ----------------------------------------
    // <- acdl-agent.py:520  messages=[{"role": "user", "content": first_message}]
    Mark 2 {
    // <- acdl-agent.py:381-390  build_first_message(), returned as one string
    U: {
        // <- acdl-agent.py:384-385
        TARGET_ROOT(env.target_root)    // where every tool path resolves
        // <- acdl-agent.py:382 computed host-side, :386-387 embedded in the message
        sys.directory_listing[@1]       // list_dir(".", max_depth=2)
        // <- acdl-agent.py:388-389
        BEGIN_EXTRACTION
    }
    }

    // ---- Tool-use history: steps 1 .. @T-1 ---------------------------------
    // Appended by the SDK tool runner, not by this file: the script only drives
    // the loop and observes it.
    // <- acdl-agent.py:512 tool_runner, :529 for message in runner
    Mark 3 {
    // half-open, so steps 1 .. @T-1. Step count is capped at :521 max_iterations.
    ForEach(i: range(1, @T)) {
        A: {
            // <- acdl-agent.py:515  thinking={"type": "adaptive"}
            resp.thinking[@i]           // display omitted; block echoed back
            resp.reasoning[@i]          // optional user-facing text
            // <- acdl-agent.py:519  tools=TOOLS
            ForEach(tool: sys.tool_calls[@i]) {
                tool.id_name_and_input
            }
        }
        // One tool message per call; on the wire these are tool_result blocks
        // collected into a single user message.
        // <- return values of the @beta_tool functions at :143 :199 :222 :283 :324
        ForEach(tool: sys.tool_calls[@i]) {
            T: {
                tool.id
                tool.result
            }
        }
    }
    }
}
```

### Reading it

**Every `// <-` comment is a citation.** It names the `acdl-agent.py` line or line range that
produces the ACDL line directly beneath it, so any claim in the spec can be checked against
the source without leaving the file. Lines with no citation are structural (`Mark` regions,
block delimiters) or are supplied by the SDK rather than by this codebase, which the
surrounding comment says explicitly.

**`AcdlAgent[@T]`, not `[@T.I]`.** There is no outer conversation. The script sends exactly
one user message and the agent never receives another, so the substep dimension has nothing
to index. `@T` is the tool-use step directly. This is the ReAct-loop-as-top-level-structure
case described in the language reference.

**`Mark 1` is the cache boundary.** Everything inside it is identical on every step of every
run against any codebase. That is what makes the `cache_control` breakpoint pay off, and why
the tool schemas are drawn inside the same mark — the API renders `tools` before `system`,
so they sit in the same cached prefix.

**`Mark 2` appears once, not per step.** It is outside the loop because the target root, the
directory listing, and the begin instruction are sent once and then simply persist in history.

**`Mark 3` stops before `@T`.** `range` is half-open, like Python's, so `range(1, @T)` covers
steps 1 through `@T-1` — the history — while step `@T` is what the model is about to produce.
At `@T = 1` the range is empty and the prompt is just the system message and the user turn.

### Abstraction decisions

The same judgment calls the extraction prompt asks its agent to document:

- **`T:` for tool results, though the wire form is a user message.** Anthropic returns tool
  results as `tool_result` blocks inside a `role: "user"` message, not a distinct tool role.
  ACDL's `T:` means "structured tool call results", which is what these are semantically, and
  it matches how the reconstructions in [`ACDL_examples/`](../ACDL_examples/) already spec
  Claude-based agents. The wire form is recorded in a comment rather than in the structure.
- **`sys.tool_calls`, not `resp.tool_calls`.** Tool calls are model output, so `resp` is
  arguably more accurate — but `OpenClaw.acdl` uses `sys.tool_requests` and `react2.acdl` uses
  `sys.tool_used`, and consistency with the existing corpus is worth more here than a purely
  literal reading of the namespace rule.
- **`resp.thinking[@i]` is included even though its text is empty.** Adaptive thinking is on,
  `display` defaults to `"omitted"`, and the blocks are echoed back to the API unchanged on
  every subsequent call. They occupy a real position in the message array, so they belong in
  the spec; the comment records why they are empty.
- **The four system templates are separate, not one.** They come from four separate sources —
  two Markdown files and two string literals in the script — and are independently editable.
  Collapsing them to a single `SYSTEM_PROMPT` would hide the only structure the system message
  has. Writing the provenance comments is what caught the framing preamble at lines 359–362,
  which an earlier draft of this spec had missed entirely.
- **`--max-iterations` is not in the spec.** It bounds the loop host-side; it never truncates
  the prompt, so it is not `PromptEndsHere`. It has no effect on context structure.
