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

**State the turn definition, then enumerate what a turn can contain — from the
code, not from convention.** "`@T` = one call to `run_conversation()`" is a
definition. "A turn is one user message, some tool rounds, and one answer" is an
assumption, and nothing in that definition implies it. Before writing the history
loop, answer each of these by reading the loop body and the persistence path, and
record the answers in the header comment:

- Can a turn contain **more than one user-role row**? (A continuation prompt after
  an output cap; a mid-turn correction; a nudge the loop writes to itself.)
- Can a turn end with **zero assistant rows**? (Interrupted before the first
  reply; failed before any response.)
- Can a turn contain an **assistant row that is neither a tool call nor its final
  answer**? (A provisional answer the loop refused; a truncated fragment.)
- Which rows does **the loop itself append** — not the user, not the model — and
  for each: does it **persist** into later turns, or exist only while the turn is
  live? Persisting rows belong in the history loop; live-only rows belong only
  under `@t == @T`.
- Is the **closing row** always present, and is it always the model's answer, or
  can the system write it (an interruption placeholder, a guardrail notice)?

Then build the history loop from *those* answers. If a turn can hold several
user rows, the sub-step loop needs a case for each kind; if it can end with no
assistant row, the closing row goes under an `If`; if some rows are live-only,
they are guarded. Do not write `U, (A T)*, A` because that is what a turn usually
looks like. Write what a turn looks like in this system.

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
  Historical turns are complete — user input, the model's answer, and any tool
  results all exist. Turn `@T` is not: the code appends the user's message and
  then calls the model, so the turn ends there. Note where in the message list
  that cut-off falls; it is the last thing in the prompt.

## Phase 4 — Abstract into ACDL

Translate what you traced, using these mappings:

| Code | ACDL |
|------|------|
| `{"role": "system", ...}` / `SystemMessage` | `S:` |
| `{"role": "user", ...}` / `HumanMessage` | `U:` |
| `{"role": "assistant", ...}` / `AIMessage` | `A:` |
| `{"role": "tool", ...}` / `ToolMessage` | `T:` |
| a single-string completion prompt (no roles) | `N:` |
| `for t in range(...)` over history | `ForEach(t: range(...)) { ... }` (1-indexed, half-open) |
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

**Conditions must name the inputs of a decision, not its outcome.** A spec line
can be perfectly true and still say nothing. The failure looks like this:

```acdl
Switch sys.summary_role[@$C] {          // true by definition — and empty
    Case user:      { U: sys.conversation_summary[@$C] }
    Case assistant: { A: sys.conversation_summary[@$C] }
}
```

`sys.summary_role` is defined as "whatever role the code chose", so the Switch
merely restates that a choice was made. The structure of the context — which
role the summary gets, and when it gets no row at all — is exactly the thing
the code decides here, and the spec has hidden it behind a name.

The test: **could a reader predict the branch from the variables' values, using
only what the names say?** If a variable's only possible definition is "the
branch the code took", it is an *outcome variable* and the condition is a
tautology. Replace it with the code's actual decision, written on the facts
the code reads:

```acdl
Name lastHeadRole  := sys.role_of_last_protected_head_row[@$C]
Name firstTailRole := sys.role_of_first_surviving_tail_row[@$C]
If $lastHeadRole == assistant | $lastHeadRole == tool | $lastHeadRole == none {
    If $firstTailRole != user { U: sys.conversation_summary[@$C] }     // preferred role, no collision
    ElseIf $lastHeadRole == tool { A: sys.conversation_summary[@$C] }  // flipped; still alternates with the head
    // otherwise no row is emitted: the summary is merged into the first tail row (see Mark 4)
}
Else {
    If $firstTailRole != assistant { A: sys.conversation_summary[@$C] }
}
```

Now the reader sees what the structure depends on (the neighbours' roles), and
the third, message-less outcome is visible instead of living in a comment.

The same rule applies to every conditional that governs shape or content:

- A gated rewrite (pruning, truncation, image stripping) is written on the
  setting that enables it and the position or size test that selects the row —
  `If $summarizeOldToolResults == true & tc.count_of_messages_more_recent_than_this >= $mostRecentMessagesKeptInFull`
  — never on a per-row `kind` / `form` / `state` that merely records that it
  was rewritten.
- A row that exists only under some condition is written under that condition
  (`If (@t == @T)`, `If sys.turn_has_closing_reply[@t]`), not left to a comment.
- When the setting is numeric in the code but functions as a switch, name it
  as the switch and record the numeric reality in a trailing comment.

**A comment of the form "when X, Y happens instead" is an unwritten branch.**
If a comment describes an alternative outcome — a summary that is sometimes
merged into its neighbour rather than emitted as its own row, a tool result that
is sometimes replaced by a one-line summary, a closing message that is sometimes
absent — the spec is missing a branch, and the comment is where it went. Write the
branch: an `If` / `ElseIf` on the condition that selects it, and the content it
produces. If the outcome is that *no* message is emitted, an empty branch holding
only a comment is still a branch, and it is the honest one. Comments explain
branches; they never stand in for them.

Outcome variables are allowed in exactly one situation: referring back to a
decision that is already written out elsewhere in the same spec, when
restating it would be longer than the reference. Bind it by name next to the
decision, and say in its comment that it is the outcome of the block above.

What this rule does **not** forbid: a `Switch` on data that is genuinely data —
`Switch m.role` over stored rows, `Switch pf.role` over a config file's entries.
Those are inputs. The line to draw is: *did the code compute this value from
other state?* If yes, show the computation; if no, it is an input.

**The current turn has no response yet — this is the most common mistake.**
The spec describes the message array *as it is sent*, so nothing indexed `@T`
can be something the model has not written yet:
- `env.*[@T]` and `sys.*[@T]` are fine — the user's input, the timestamp,
  retrieved documents, agent state. They exist before the call.
- `resp.*[@T]` is always wrong. So is a tool response at `@T` for a tool the
  model has not requested, or a trailing `A:` on the current turn.

Treat turns `1..@T-1` and turn `@T` as two different things, because the code
does: the history loop replays complete turns, and then the current turn is
appended as input only. Either write them separately —

```acdl
ForEach(t: range(1, @T)) {
    U: env.user_question[@t]
    A: resp.answer[@t]
}
U: env.user_question[@T]
```

— or, if the source really does share one loop, run it to `range(1, @T + 1)`
and cut it with `PromptEndsHere when (@t == @T)` before the response line.

The exception is sub-steps. If the agent has a tool loop inside a turn, the
sub-steps of the current turn that have already run (`@T.i` for `i < I`) did
produce assistant messages and tool results, and those do belong in the prompt.
Only the current sub-step `@T.I` is unwritten.

**Use fragments only for content that repeats.** `StrFrag` / `RolesFrag` earn
their place when the same block appears in two or more places — across specs in
the file, or in two branches of the same spec. If a chunk of ACDL appears exactly
once, write it inline; a single-use fragment just makes the reader jump around
and clutters the rendered diagram.

**Template vs. context variable:** if the text is fixed at authoring time (it lives
in the source or a prompt file), it is a template. If it is filled from runtime
data, it is a context variable — or a template *taking* that context variable as an
argument, when fixed text wraps a runtime value.

**Prefer collection iteration over index ranges.** If the source loops a list only
to read each element, write `ForEach(doc: $docs)` and reference `doc.source`, not a
`range` over `$docs.len`. Use `range` when the loop variable is genuinely an index
used elsewhere — substep indices like `sys.action[@t.i]` are the usual case.

**Ranges are 1-indexed and half-open**, following the same rule as Python:
`range(a, b)` covers `a` through `b-1`, including `a` and excluding `b`. Only the
starting index differs from Python — ACDL counts from 1, not 0 — so a Python loop
over `range(0, n)` becomes `range(1, n+1)`, and a history loop that must stop before
the current turn is `range(1, @T)`, covering turns 1 through `@T-1`. Get the boundary
right, and say in a comment which turn the loop stops at.

**Naming:** names should describe the *role the content plays in the context*, not
the identifier in the source. `env.user_query`, not `env.msg_str`. Templates should
be named for what the text is for: `TOOL_USE_RULES`, `OUTPUT_FORMAT`,
`SAFETY_CONSTRAINTS`.

**Name settings for what they do, not for their config key.**
`summarizeOldToolResults`, not `proactive_prune_size_threshold_tokens`;
`mostRecentMessagesKeptInFull`, not `protect_last_n`. When a number functions as
a switch — a threshold where `0` means off — name it as the switch, compare it as
one (`== true`), and put the numeric reality in a trailing comment:

```acdl
Name summarizeOldToolResults := sys.summarize_tool_results_older_than_newest_rows   // in config a token size (proactive_prune_tokens); 0 = off
```

The standard for every name in a condition: a reader who knows nothing about the
code must be able to read the condition as a sentence — "summarising old tool
results is on, and at least n messages are more recent than this one" — using
the names alone.

**Granularity:** aim for a spec that fits on one page. Collapse detail that does
not change the structure (three consecutive literal paragraphs concatenated into
the system message can be one template, or three, depending on whether they are
independently toggled — if any of them is conditional, split it out). Do not
collapse anything that is conditional, looped, or reordered at runtime.

Use `Mark n { ... }` to bracket the meaningful regions of the context — setup,
history, compaction, tool loop, current turn — so the rendered diagram reads well.
Use `//` comments to record what each template contains and why a branch exists.

**Cite the source inline, above every line you write.** Each role message, control
flow header, template, and context variable gets a comment on the line *above* it
naming the file and line range it came from:

```acdl
// <- agent/prompt.py:88  system=... assembled from three fragments
S: {
    // <- agent/prompt.py:41-59
    TASK_INSTRUCTIONS
    // <- agent/prompt.py:61, tool list built at agent/tools.py:12-30
    AVAILABLE_TOOLS
}
// <- agent/loop.py:104-118  for turn in state.history[:-1]
ForEach(t: range(1, @T)) {
    // <- agent/loop.py:110
    U: env.user_input[@t]
}
```

Rules for these citations:
- Use `// <-` as the marker so provenance is distinguishable from explanation.
- A line range (`:41-59`) is right when a block comes from contiguous code; list
  several locations when a single ACDL line is assembled from more than one place.
- If a message is supplied by a framework or SDK rather than by the codebase, say
  so in the comment instead of inventing a line number.
- Anything you could not trace to a specific line does not get a citation — it gets
  a `// UNVERIFIED:` comment saying what you assumed and why.

This makes the spec checkable on its own. The evidence table in your report then
carries the quoted text and the reasoning, not just the location.

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
6. **Nothing at `@T` is a model output.** Grep your own spec for `resp.` and for
   any `A:` or `T:` line indexed `@T`; each one must either be a completed
   sub-step (`@T.i`, `i < I`) or be deleted. The prompt must end with input the
   model has not answered.
7. **Every fragment is invoked more than once.** If one is used a single time,
   inline it.
8. **No condition is a tautology.** For every `Switch` and every `If` on a
   `sys.*` variable — especially names ending in `_kind`, `_role`, `_form`,
   `_outcome`, `_state`, `_ending` — find the code that produces that value.
   If it is computed from other state, rewrite the condition on that state.
   If you cannot say what values it takes without reading the branch bodies,
   it is an outcome variable. The only acceptable ones point back at a
   decision already written out in the spec. Cover the branch bodies and ask
   whether the condition alone tells you which branch fires.
9. **No comment describes an alternative outcome.** Read every comment. If one
   says "when …, instead …", "unless …", or "otherwise … is merged / dropped /
   replaced", that is a branch the spec does not have. Write it.
10. **The history loop matches the turn answers from Phase 2.** For each answer
    you recorded — several user rows per turn, a possibly-absent closing row,
    live-only rows, a system-written closer — point at the line of the spec that
    expresses it. An answer with no corresponding line means the loop was written
    from the conventional shape, not from this system.

If the ACDL toolchain is available in the working environment, validate the file:
`npm run cli -- out.html your-spec.acdl` (or `node scripts/diff.mjs` against a
prior version). A parse error means the syntax is wrong; fix it.

---

## Output

Produce three things.

### 1. The specification — a single `.acdl` file

Well-commented, one spec per distinct prompt, marks on the meaningful regions, and a
`// <-` source citation above every line you write.

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

### 3. A reader copy — `<AgentName>.compact.acdl`

Write this last, once the annotated spec is final. It is the same specification
with the audit apparatus taken out, for someone who wants to *read* the spec
rather than check it. Five rules:

- **Drop every `file:line` citation, and the `// <-` marker with it** — there is
  no longer a citation for the marker to distinguish. A comment that was nothing
  but a citation disappears entirely. A comment that mixed a citation with an
  explanation keeps the explanation and loses the location. Keep bare function,
  class, and file names where those are how a reader would find the code
  (`normalizeMessagesForAPI`, `getPartialCompactPrompt`, `SOUL.md`); it is only
  the `:1234` line numbers and the path prefixes that go.
- **One comment, one line.** Do not hand-wrap a comment across several `//`
  lines, and do not continuation-indent it — let the reader's editor wrap. This
  applies to prose only: a deliberate multi-line layout — the time-model block,
  a list of the specs in the file, an aligned table in the header — is structure,
  not wrapping, and stays as it is (minus its line numbers).
- **Change nothing but comments.** Every non-comment line must be byte-identical
  to the annotated file, in the same order. If you find yourself rewording a spec
  line, dropping a `Mark`, or collapsing a branch, stop: that change belongs in
  the annotated file or nowhere. The two files must be the same specification.
- **Say where the provenance went.** One line in the header pointing at the
  annotated `.acdl` and at `extraction-report.md`.
- **Drop comments that inventory behaviour the spec already states.** A list of
  the sanitisation passes, a restatement of what a branch does, a note that a
  fragment is used twice — if the reader can see it from the code lines, the
  comment is noise in the reader copy. Keep a comment only where a name alone
  would not carry the meaning.

The annotated `.acdl` remains the file of record. Both files must parse.

---

## Rules

- Never include the actual prose of prompts in the spec. Templates are opaque by
  design; put a short summary in a `//` comment instead.
- Never invent structure that is not in the code — no "agents usually also do X".
- Never put a decision behind a name. A condition must be on the facts the code
  reads, not on a variable that means "what the code decided". True is not enough;
  the spec must show what the structure depends on.
- Never leave an alternative outcome in a comment. "When X, Y happens instead" is
  a branch; write it.
- Never assume the shape of a turn. State the turn definition, answer what a turn
  can contain from the code, and build the history loop from those answers.
- Never put a model output at `@T`. The current turn is input only; the prompt
  stops where the model starts writing.
- Never define a fragment for a chunk that appears only once.
- Prefer a smaller, correct spec over a larger, speculative one.
- Read the actual source. Do not extract from README files, docs, or blog posts
  describing the agent; they describe intent, and the spec must describe the code.
