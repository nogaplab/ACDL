# Task: extract the ACDL specification of an agent's context-creation process

You are given (a) a codebase that implements an LLM agent, and (b) `acdl-language.md`,
a complete reference for the Agentic Context Description Language. **Read the
language reference in full before you start.**

Your job: reverse-engineer, from the code, exactly how this agent assembles the
message array it sends to the model, and express that structure as an ACDL
specification.

You are describing **the shape of the context**, not what the agent does, not the
wording of its prompts, and not its control loop beyond what affects the message
array. If a fact about the codebase does not change which messages are sent, in
what role, in what order, or under what condition — it does not belong in the spec.

---

## Phase 1 — Locate every model call

Find every place where the codebase calls an LLM API, and work backwards from each
one to the code that builds its input.

Search for: `messages`, `system`, `chat.completions.create`, `client.messages.create`,
`invoke`, `generate`, `prompt`, `.append(`, `role=`, `"role":`, `ChatPromptTemplate`,
`SystemMessage` / `HumanMessage` / `AIMessage` / `ToolMessage`, `add_message`,
`build_context`, template files (`.jinja`, `.j2`, `.txt`, `.md`, `.yaml` prompt banks).

Enumerate what you find. A codebase usually has **more than one** prompt:
- the main agent loop,
- sub-agents / delegated tasks,
- auxiliary calls (summarization/compaction, title generation, routing, reranking,
  guardrails, tool-argument repair).

Decide which of these are in scope. The main agent always is. Each additional
prompt with a materially different structure becomes its **own specification** in
the same `.acdl` file (`MainAgent[@T]`, `Summarizer[@T]`, `SubAgent[@T, task]`).
Note explicitly, in a comment, any prompt you found but chose not to specify.

## Phase 2 — Determine the time model

This is the single most important decision, and it determines the header.

Ask: **what does the agent's message list accumulate over?**

- Accumulates over user turns, one model call per turn, no tool loop → `Agent[@T]`
- Accumulates over steps of a single tool-using episode (ReAct-style), where the
  loop is the top-level structure → `Agent[@T]`, with `@T` = the current step
- Both: an outer conversation and an inner tool loop within each turn → `Agent[@T.I]`,
  with `@T` the turn and `I` the sub-step. Previous turns' sub-step counts are
  `@t.substeps`.
- Additional parameters the prompt is instantiated per (agent identity, mode,
  sub-task) become extra header parameters: `Agent[@T, agent]`, `Agent[@T, mode]`.

Then answer, from the code: **on the current turn, is the whole history replayed
from scratch, or is there a persistent message list that is appended to?** Both
produce the same array; ACDL describes the resulting array, so write it as the
loop-over-history form either way — but check for the differences that a
persistent list hides (e.g. a system message mutated in place, messages dropped
or rewritten after the fact, tool results trimmed).

## Phase 3 — Trace one call, message by message

Pick a representative call and enumerate, in order, every message that reaches the
API. For each one record:

| # | role | where the content comes from | condition | file:line |

Be exhaustive about the parts that are easy to miss:
- Content that is **concatenated into one message** vs. content that becomes
  **separate messages**. This distinction is the whole point of `S: { a b c }`
  versus three `S:` lines. Look carefully at every `"\n".join(...)`, `+=`, f-string,
  and list-append.
- Anything injected by a framework rather than by this code (tool schemas, a
  default system preamble, cache-control blocks, structured-output instructions).
  Include them; note in a comment that the framework supplies them.
- Ordering that depends on runtime state (retrieved documents, sorted memories).
- Messages appended *after* the tool call returns (tool results, retries, errors).
- Truncation, pruning, and compaction logic — these are structural and must appear.
- The current turn's input, which is often built differently from historical turns.

## Phase 4 — Abstract into ACDL

Translate what you traced, using these mappings:

| Code | ACDL |
|------|------|
| `{"role": "system", ...}` / `SystemMessage` | `S:` |
| `{"role": "user", ...}` / `HumanMessage` | `U:` |
| `{"role": "assistant", ...}` / `AIMessage` | `A:` |
| `{"role": "tool", ...}` / `ToolMessage` | `T:` |
| a single-string completion prompt (no roles) | `N:` |
| `for t in range(...)` over history | `ForEach(t: range(...)) { ... }` (1-indexed, inclusive) |
| `for x in collection` | `ForEach(x: sys.collection) { ... }` |
| `if` / `elif` / `else` | `If` / `ElseIf` / `Else` |
| dispatch on a string/enum value | `Switch ... { Case ... Default ... }` |
| a literal prompt string, or a file of prompt text | a template, `ALL_CAPS` |
| an f-string template with holes | `TEMPLATE(arg1, arg2)` |
| a computed/derived value (retrieval, summarization, formatting) | a `camelCase` function |
| runtime data read from state | a context variable in `env` / `sys` / `resp` |
| a local variable holding a reused expression | `Name x := ...`, referenced `$x` |
| an early `return messages` | `PromptEndsHere when (...)` |

**Choosing the namespace** — this trips people up, so decide deliberately:
- `env.*` — came from outside the system: user input, observations, world state.
- `sys.*` — came from the agent's own machinery: state, memory, tool definitions,
  tool results, timestamps, retrieved documents, summaries.
- `resp.*` — was produced by the model itself on an earlier call.

**Template vs. context variable:** if the text is fixed at authoring time (it lives
in the source or a prompt file), it is a template. If it is filled from runtime
data, it is a context variable — or a template *taking* that context variable as an
argument, when fixed text wraps a runtime value. `1-indexed and inclusive`: ACDL
`range(1, @T-1)` covers turns 1 through `@T-1`; Python `range(0, n)` in the source
usually maps to `range(1, @T-1)` or `range(1, @T)` — get the boundary right and
say in a comment which turn the loop stops at.

**Naming:** names should describe the *role the content plays in the context*, not
the identifier in the source. `env.user_query`, not `env.msg_str`. Templates should
be named for what the text is for: `TOOL_USE_RULES`, `OUTPUT_FORMAT`,
`SAFETY_CONSTRAINTS`.

**Granularity:** aim for a spec that fits on one page. Collapse detail that does
not change the structure (three consecutive literal paragraphs concatenated into
the system message can be one template, or three, depending on whether they are
independently toggled — if any of them is conditional, split it out). Do not
collapse anything that is conditional, looped, or reordered at runtime.

Use `Mark n { ... }` to bracket the meaningful regions of the context — setup,
history, compaction, tool loop, current turn — so the rendered diagram reads well.
Use `//` comments to record what each template contains and why a branch exists.

## Phase 5 — Verify against the code

Go back through the source and check, in both directions:

1. **Every message the code can emit appears in the spec.** Walk each branch of
   the message-building code, including error paths, retry paths, and the
   first-turn special case.
2. **Every line of the spec is backed by code.** Delete anything you inferred from
   convention rather than read in the source. It is much worse to invent structure
   than to omit detail.
3. **Order is right**, including within concatenated messages.
4. **Conditions are right** — especially first-turn (`@T == 1`), empty-history,
   and mid-tool-call cases.
5. **Loop bounds are right** — does the history loop include the current turn or
   stop before it?

If the ACDL toolchain is available in the working environment, validate the file:
`npm run cli -- out.html your-spec.acdl` (or `node scripts/diff.mjs` against a
prior version). A parse error means the syntax is wrong; fix it.

---

## Output

Produce two things.

### 1. The specification — a single `.acdl` file

Well-commented, one spec per distinct prompt, marks on the meaningful regions.

### 2. An extraction report — markdown

- **Agent overview**: 3–5 sentences on what the agent is and how its loop runs.
- **Prompts found**: every model call site in the codebase, with file:line, and
  whether it is specified, folded into another spec, or excluded (say why).
- **Line-by-line evidence table**: each significant line of the spec mapped to the
  `file:line` that justifies it.
- **Abstraction decisions**: the judgment calls you made — what you collapsed into
  a single template, why you chose `sys` over `env` in ambiguous cases, how you
  named the time dimension, what you treated as a function.
- **Uncertainties and gaps**: anything you could not determine from the code
  (behavior hidden in a framework, config-dependent branches, dead code you were
  unsure about). List these explicitly rather than guessing silently; where you had
  to guess in the spec itself, mark it with a `// UNVERIFIED:` comment.

---

## Rules

- Never include the actual prose of prompts in the spec. Templates are opaque by
  design; put a short summary in a `//` comment instead.
- Never invent structure that is not in the code — no "agents usually also do X".
- Prefer a smaller, correct spec over a larger, speculative one.
- If the code's structure genuinely does not fit ACDL, say so in the report rather
  than distorting either one.
- Read the actual source. Do not extract from README files, docs, or blog posts
  describing the agent; they describe intent, and the spec must describe the code.
