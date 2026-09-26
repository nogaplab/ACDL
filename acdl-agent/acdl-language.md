# ACDL — Agentic Context Description Language

This document is a self-contained reference for ACDL. Read it in full before
writing or reading any `.acdl` file.

---

## 1. What ACDL is

ACDL is a small domain-specific language for describing **how the context of an
LLM agent is assembled**. An ACDL specification — a `.acdl` file — is a compact,
readable description of the *structure* of a prompt: which messages are sent, in
which roles, in which order, and how that changes as a conversation or tool-use
loop unfolds.

An ACDL spec is **NOT the prompt itself**. It does not contain the English text
of the instructions. It describes the *shape* of the message array the agent
builds before every model call — the scaffolding, not the filling.

The core idea: every agent, at turn `@T`, constructs a list of messages. Some
parts are fixed (system instructions), some come from history (earlier turns),
some are retrieved or computed (documents, tool results), and some depend on
conditions (is the agent mid-tool-call? was the history compacted?). Written as
code, this logic gets buried in string concatenation and loops. ACDL states it
directly:

```acdl
BasicRAG[@T]: {
    S: INSTRUCTIONS
    U: {
        Name docs := k_relevant_docs(env.user_input[@T])
        ForEach(doc: $docs) {
            doc.source
            doc.content
        }
        ANSWER_Q_FROM_DOCS
        env.user_input[@T]
    }
}
```

Read top to bottom: send a system message containing the `INSTRUCTIONS`
template; then send one user message built from the retrieved documents,
followed by an instruction template, followed by the user's current question.

---

## 2. Specification structure

A specification defines a named prompt template parameterized by optional
indices. The body is an ordered sequence of *prompt blocks* — role messages,
mark blocks, control flow — freely interleaved:

```acdl
PromptName[idx1, idx2, ...]: {
    <prompt-blocks>
}
```

One file may contain several specifications (e.g. a main agent, a sub-agent, and
a summarization prompt), plus fragment definitions.

```acdl
MainAgent[@T]: { ... }

SubAgent[@T, task]: { ... }
```

---

## 3. Role messages

Every message carries exactly one role:

| Marker | Purpose |
|--------|---------|
| `S:` | System — instructions, persona, tool descriptions, behavioral constraints |
| `U:` | User — external input, observations, tool results (when passed as user text) |
| `A:` | Assistant — prior model outputs, reasoning traces, chosen actions |
| `T:` | Tool — structured tool call results (a real `tool` role message) |
| `N:` | None — a single unstructured text block (legacy completion format only) |

**Multi-line form** — braces, any combination of content elements and control
flow. All contents are concatenated into *one* message:

```acdl
S: {
    INSTRUCTIONS
    AVAILABLE_TOOLS
    env.datetime[@T]
}
```

**Single-line form** — no braces, exactly one content element:

```acdl
U: env.user_question[@t]
A: resp.answer[@t]
S: INSTRUCTIONS
```

Control flow (`ForEach`, `If`, `Switch`) is **not** permitted in the single-line
form. To use control flow inside a message, use the braced form:

```acdl
U: {
    ForEach(item: env.items) {
        env.item_detail[@t, item]
    }
}
```

**Completion format:** `N:` may appear at most once per spec, and no chat roles
may appear in the same spec.

### Scoping rules

- **Top level** (the prompt body, outside any role block): only role messages,
  mark blocks, control flow, name definitions, and comments.
- **Inside a role block**: context variables, functions, templates, control flow,
  comments, name definitions, mark blocks, and `break` / `continue`.
- Role messages may **not** nest inside other role messages:

```acdl
U: {
    S: { INSTRUCTIONS }   // ERROR: nested role
}
```

---

## 4. Context variables

Context variables reference dynamic runtime data:

```
namespace.path[indices]
```

| Namespace | Use for |
|-----------|---------|
| `env` | Environment — external inputs, observations, user queries, game/world state |
| `sys` | System — agent state, memory, tool configuration and results, action history |
| `resp` | Response — prior LLM outputs, reasoning traces |

Paths nest with dot notation; indices may appear at any level:

```acdl
env.user_question[@T]            // the user question at time T
sys.agent_desc                   // the agent description (constant, no time)
sys.tool[@t].tool_response[@t]   // tool response of tool at time t
env.bomb_location[@T, bomb]      // bomb location of a specific bomb at time T
```

A variable without indices refers to data that does not vary over time.

---

## 5. Indices

### Time indices

`@` denotes the primary time dimension the prompt iterates over. What it means
depends on the agent: for a ReAct agent looping within one turn, `@` is the
current step; for a multi-turn conversational agent, `@` is the current turn and
sub-steps within a turn get their own index.

- Current time: capital — `@T` for the main step, `I`, `J` for sub-steps.
- Iterated time: lower-case — `@t`, `i`, `j`.
- Sub-steps use dot notation: `@t.i` = sub-step `i` of turn `t`; `@T.I` = the
  current sub-step of the current turn.
- `@t.substeps` = the number of sub-steps in turn `t`.
- Time indices start at **1**, not 0. The first turn is `@1`.

```acdl
@T            // current time step
@T-1          // previous time step
@T.I          // current substep of current turn
@t.i          // substep i of turn t (in loops)
```

Iteration:

```acdl
// all previous turns
ForEach(t: range(1, @T)) {
    env.observation[@t]
}

// substeps in the current turn
ForEach(i: range(1, I)) {
    sys.action[@T.i]
}

// nested: substeps within each previous turn
ForEach(@t: range(1, @T)) {
    ForEach(i: range(1, @t.substeps + 1)) {
        sys.action[@t.i]
    }
}
```

### The current time step is incomplete

`@T` is the turn being assembled *right now* — the model has not answered it
yet. Everything indexed `@T` must therefore be data that already exists at the
moment of the call:

- `env.*[@T]` and `sys.*[@T]` are fine — the user's input, the current time,
  retrieved documents, agent state. They are inputs to this call.
- **`resp.*[@T]` is never valid.** `resp` holds what the model produced, and the
  response for turn `@T` is exactly what this call is about to produce. The same
  goes for anything derived from it: a tool result for a tool the model has not
  requested yet, a `sys.tool[@T].tool_response` at the very end of the prompt.

So a history loop and the current turn are *not* symmetric, and cannot be
collapsed into one loop that ends at `@T`:

```acdl
// completed turns: question and answer both exist
ForEach(t: range(1, @T)) {
    U: env.user_question[@t]
    A: resp.answer[@t]
}
// current turn: the question only — the answer is what the model will write
U: env.user_question[@T]
```

Sub-steps are the one place the current turn carries model output: within
`@T`, sub-steps `@T.i` for `i < I` have already completed, so their assistant
messages and tool responses are real and belong in the prompt. Only the
*current* sub-step `@T.I` is unwritten.

```acdl
U: env.user_question[@T]
// tool calls already made this turn, and their results
ForEach(i: range(1, I)) {
    A: sys.tool_used[@T.i].name_and_args
    T: sys.tool_used[@T.i].tool_response
}
// nothing after this — the model writes the next A: itself
```

When a spec does share one loop between history and the current turn, the
current turn must be cut short before the response, with `PromptEndsHere`
(see §8):

```acdl
ForEach(t: range(1, @T + 1)) {
    U: env.user_question[@t]
    PromptEndsHere when (@t == @T)
    A: resp.answer[@t]
}
```

### Non-time indices

No prefix; they address other dimensions — named entities or context-variable
keys: `[bomb]`, `[sys.agent_name]`. Multiple indices are comma-separated.
Arithmetic (`+ - * / %`) is allowed in any index position: `@t-1`, `@t % 25`.

### The current message number

`#msg` is the position of the message being assembled in the message array:
1 for the first message the model will see, 2 for the second, and so on. It is
a value, not content, so it goes wherever a number would — as an argument of a
function or template, or as an index of a context variable, alone or in
arithmetic:

```acdl
U: {
    sys.history[#msg]                   // the entry for this message
    sys.history[#msg-1].text            // the entry before it
    summarize(env.notes[@T], #msg)      // as a function argument
    MESSAGE_HEADER(#msg)                // as a template argument
}
```

Because it counts messages, `#msg` only means something inside one: it may
appear inside a role message (`S:`, `U:`, `A:`, `T:`), inside an `N:` message,
or in a `StrFrag` body (which only ever expands inside a message). Anywhere
else — a top-level `ForEach` bound, a top-level `Name`, a `RolesFrag` argument,
the spec title — it is an error. It is also not content on its own: a bare
`#msg` line inside a message is rejected.

The renderer prints `#msg` as `#current_message`, in orange, wherever it
appears.

---

## 6. Templates

Templates are `ALL_CAPS` placeholders standing for blocks of literal text whose
wording is deliberately out of scope. They name the *semantic purpose* of a text
section, not its content. Words separated by underscores.

```acdl
INSTRUCTIONS          // task explanation
AVAILABLE_TOOLS       // tool list
QUERY(sys.agent_name) // parameterized template
```

An inline `//` comment is the conventional place to document what the template
text actually says.

---

## 7. Functions

Functions represent computed content — summarization, retrieval, formatting, any
transformation that is not a plain variable lookup. Declared by name and intent,
never implemented. Syntax: `functionName(arg1, arg2, ...)[indices]`, in
`camelCase` (to distinguish from `ALL_CAPS` templates).

```acdl
summarize(prompt.History[@t])
get_dialog_history(sys.agent_name)
range(1, @T-1, 2)
```

**Built-in:** `range(start, stop, step)` — `step` optional (default 1); the range
is **half-open**, following the same rule as Python: it includes `start` and excludes
`stop`, so `range(1, 3)` yields 1 and 2. Only the starting index differs from Python —
ACDL counts from 1, not 0 — so a history loop that stops before the current turn is
`range(1, @T)`, and iterating a collection of `n` elements is `range(1, n + 1)`.

---

## 8. Control flow

All three constructs work both at the top level (gating whole messages) and
inside a role block (gating content within one message).

### ForEach

```acdl
ForEach(variable: iterable) {
    <body>
}
```

The iterable is a `range(...)` call or a collection-valued context variable. When
the body only needs each element, iterate the collection directly — `ForEach(doc:
$docs)` rather than a `range` over its length. It reads better and there is no
bound to get wrong. Reach for `range` when the loop variable is genuinely an
*index* used elsewhere, as substep indices are: `sys.action[@t.i]`.

```acdl
// top level — produces multiple messages per iteration
ForEach(@t: range(1, @T)) {
    U: env.user_question[@t]
    A: resp.answer[@t]
}

// inside a role — produces repeated content in one message
U: {
    ForEach(bomb: env.bombs) {
        env.bomb_location[@t, bomb]
        env.bomb_details[@t, bomb]
    }
}
```

### If / ElseIf / Else

Comparison operators `==`, `!=`, `<`, `>`; logical connectives `&`, `|`.

```acdl
If sys.tool[@t] == clarify {
    U: env.user_input[@t]
}
ElseIf sys.tool[@t] == search {
    U: env.search_results[@t]
}
Else {
    A: sys.tool[@t].tool_response
}
```

Conditionals may guard whole sections, including loops:

```acdl
If @T > 1 {
    ForEach(t: range(1, @T)) {
        U: env.user_input[@t]
        A: resp.answer[@t]
    }
}
```

### Switch / Case / Default

```acdl
Switch sys.action_type[@t] {
    Case "search" {
        U: env.search_results[@t]
    }
    Case "calculate" {
        U: env.calculation[@t]
    }
    Default {
        U: env.fallback[@t]
    }
}
```

`break` and `continue` are available inside loops with standard semantics.

### What a condition is for

A condition exists to show what the structure depends on. Write it on the
inputs the agent reads — a setting, a role, a count, a size — not on a
variable that records the result. `Switch sys.summary_role` says only that a
role was chosen; `If $lastHeadRole == user & $firstTailRole != assistant`
says why. If a reader could not predict the branch from the variables' names,
the condition is hiding the decision it was supposed to reveal. A `Switch` on
genuine data — the role stored on a history row, the entries of a config
file — is fine; the test is whether the code *computed* the value from other
state. If it did, write that computation.

### Early termination

`PromptEndsHere when <condition>` says: if the condition holds, the prompt ends
at this point — nothing further is appended for that turn.

```acdl
Prompt[@T]: {
    S: INSTRUCTIONS
    U: env.user_input[@T]
    PromptEndsHere when (@T == 1)
    ForEach(@t: range(1, @T)) {
        A: resp.answer[@t]
    }
}
```

---

## 9. Name definitions

`Name x := expr` binds a symbolic name to an expression; reference it later with
a `$` prefix. Useful for retrieval results, compaction turns, and any long or
repeated expression.

```acdl
Name docs := k_relevant_docs(env.query[@T])
ForEach(doc: $docs) {
    doc.source
    doc.content
}
```

The bound expression may be a context variable, function call, arithmetic
expression, or string literal; fields are reached with dot notation on the
reference. When a bound name is used as an *index value*, it is written `@$C`:

```acdl
Name C := sys.last_compaction_turn[@T]
If (@$C > 1) {
    U: {
        THIS_IS_A_SUMMARY
        sys.conversation_summary[@$C]
    }
}
ForEach(t: range(@$C + 1, @T + 1)) { ... }
```

**List comprehensions:**

```acdl
Name relevant_summaries :=
    [sys.summary[@t] for t in range(@T, @T-900, 100)]
compress_summaries($relevant_summaries)
```

---

## 10. Mark blocks

`Mark <n> { ... }` annotates a section for visual emphasis in the rendered
diagram (a bracket labelled `]n` beside the marked content). Purely
presentational — no effect on semantics or scoping. Use it to call out the
distinct regions of a context (setup / history / current turn / tool loop).

```acdl
Mark 1 {
    S: {
        INSTRUCTIONS
        AVAILABLE_TOOLS
    }
}
Mark 2 {
    U: env.user_question[@T]
}
```

---

## 11. Fragments

Reusable building blocks, defined at the top level of a file and invoked with
`Frag Name[args]`.

**String fragments** (`StrFrag`) produce role-less content that inherits the role
of the enclosing message; they may contain anything valid inside a role block:

```acdl
StrFrag DocumentContext[doc]: {
    env.doc_title[doc]
    env.doc_content[doc]
    summarize(env.doc_metadata[doc])
}

U: {
    TASK_INSTRUCTIONS
    ForEach(doc: env.documents) {
        Frag DocumentContext[doc]
    }
    env.user_question[@T]
}
```

**Role fragments** (`RolesFrag`) produce one or more complete role messages and
are invoked at the top level:

```acdl
RolesFrag ConversationTurn[@t]: {
    U: env.user_input[@t]
    A: resp.answer[@t]
    If sys.tool[@t] != none {
        T: sys.tool[@t].tool_response
    }
}

ChatAgent[@T]: {
    S: INSTRUCTIONS
    ForEach(@t: range(1, @T)) {
        Frag ConversationTurn[@t]
    }
    U: env.user_input[@T]
}
```

The same `Frag Name[args]` syntax invokes both; the parser resolves by position
(inside a role block → string fragment; top level → role fragment).

**Define a fragment only for a chunk that actually repeats** — the same block of
content used in two or more places, or in two or more specs in the file. A
fragment invoked exactly once is not an abstraction, it is an indirection: it
splits the context into two places the reader has to hold at once, and the
rendered diagram reads worse for it. If the block appears once, write it inline.

---

## 12. Comments

`//` to end of line. A comment on its own line renders at the current nesting
level; a comment after a content element renders beside it. Use inline comments
generously to say what a template contains or why a branch exists.

`#` also opens a comment, with one exception: `#msg` on its own (§5) is the
current message number, not a comment. `#msgs`, `# msg` and any other `#` text
are comments.

---

## 13. What the parser will forgive

Everything above is the **canonical** spelling, and it is what the renderer
prints and what you should write. The parser, however, is deliberately more
relaxed than the reference, so that a spec is never rejected over
capitalisation or a stray comma. All of the following parse to exactly the same
AST as their canonical form, and render identically:

| Written as | Read as |
|-----------|---------|
| `if`, `IF`, `iF` | `If` — every keyword is case-insensitive |
| `elif`, `elsif`, `elseif`, `Else If` | `ElseIf` |
| `foreach`, `FOREACH` | `ForEach` |
| `stringfrag`, `rolefrag` | `StrFrag`, `RolesFrag` |
| `s:`, `user:`, `ASSISTANT:` | `S:`, `U:`, `A:` — role markers in any casing, or spelled out |
| `Env.q[@T]`, `SYS.memory` | `env.q[@T]`, `sys.memory` |
| `S { ... }`, `Spec[@T] { ... }` | the `:` before a block body is optional |
| `Case user: {`, `Default: {`, `If (x): {` | a trailing `:` before `{` is punctuation, and is dropped |
| `ForEach doc in env.docs { ... }` | `ForEach(doc: env.docs) { ... }` — parentheses optional, `in` for `:` |
| `for doc in env.docs { ... }` | `ForEach` — a bare `for` in statement position is a loop |
| `Name x = e`, `Name x : e` | `Name x := e` |
| `PromptEndsHere @t == @T` | `PromptEndsHere when (@t == @T)` — both `when` and the parentheses are optional |
| `Mark { ... }` | an unnumbered mark is numbered in source order |
| `# note`, `/* note */` | `// note` |
| `'x'`, `“x”` | `"x"` |
| `..` | `...` |
| `–`, `—`, `×`, `÷` | `-`, `-`, `*`, `/` — typographic operators |
| `≠`, `≤`, `≥` | kept as written, and rendered as written |
| trailing `;` after a statement, trailing `,` in an argument list | ignored |

Identifiers may use any Unicode letter, and invisible characters that ride
along with a copy-paste (zero-width spaces, BOM, soft hyphens) are skipped.

The one thing this costs: **a template must not be named exactly like a
keyword.** `MARK`, `IF` and `CASE` read as keywords in any casing, so a template
standing for the text of a mark should be `MARK_SECTION`, not `MARK`. Templates
are conventionally multi-word, so this rarely comes up.

None of this is licence to write sloppy ACDL — a spec is read far more often
than it is written, and the canonical spelling is the one every reader expects.
It is there so that a first draft, or a spec a model produced, compiles and
renders instead of failing on a capital letter. Run `npm run check <file>` to see
what a file gets wrong, or the `acdl-syntax` agent
(`.claude/agents/acdl-syntax.md`) to have it fixed.

---

## 14. Naming conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Templates | `ALL_CAPS` | `TASK_DESCRIPTION` |
| Functions | `camelCase` | `summarize`, `k_relevant_docs` |
| Context variables | `dot.separated` | `env.user_input` |
| Time indices | `@` prefix | `@T`, `@t` |
| Name references | `$` prefix | `$docs` |

---

## 15. Worked example — ReAct agent with tool loop

```acdl
React2[@T.I]: {
    S: INSTRUCTIONS_AND_TOOLS
    // History
    Mark 1 {
    // Chat loop (main loop)
    ForEach(t: range(1, @T)) {
        U: env.user_question[@t]
        Mark 2 {
        // ReAct loop (internal loop)
        ForEach(i: range(1, @t.substeps + 1)) {
            A: sys.tool_used[@t.i].name_and_args
            T: sys.tool_used[@t.i].tool_response
        }}
        A: resp.response // final response after the ReAct loop
    }
    }
    // Last turn
    U: env.user_question[@T]
    ForEach(i: range(1, @T.substeps + 1)) {
        A: sys.tool_used[@T.i].name_and_args
        T: sys.tool_used[@T.i].tool_response
    }
}
```

## 16. Worked example — coding agent with compaction

```acdl
OpenClaw[@T.I]: {
    S: {
        // Very long system prompt detailing skills, tools, sub-agents, memory files.
        SystemPrompt()
    }
    // summarized early conversation (if it exists)
    Mark 2 {
    Name C := sys.last_compaction_time[@T]
    If (@$C > 1) {
        U: {
            THIS_IS_A_SUMMARY
            sys.conversation_summary[@$C]
        }
        A: resp.response[@$C]
    }
    }
    // conversation history
    ForEach(t: range(@$C + 1, @T + 1)) {
        U: {
            Mark 6 {
            // the pending_messages list is often empty
            ForEach(m: sys.pending_messages[@t]) {
                m.date_time
                m.message
            }
            }
            Mark 5 {
            Switch env.input_source[@t] {
                Case user: {
                    Mark 4 { sys.date_time[@t] }
                    env.user_query[@t]
                }
                Case heartbeat_timer: {
                    HEARTBEAT_INSTRUCTIONS
                }
            }
            }
        }
        PromptEndsHere when (@t == @T && @T.0)
        // tool-using loop history
        ForEach(i: range(1, @t.substeps + 1)) {
            Mark 1 {
            // multiple requests in one assistant message
            A: {
                ForEach(tool: sys.tool_requests[@t.i]) {
                    tool.id_name_and_arg
                }
            }
            // one tool message per response
            ForEach(tool: sys.tool_requests[@t.i]) {
                T: { tool.id_and_response }
            }
            }
            PromptEndsHere when (@t == @T && @T.I)
        }
        A: resp.response[@t]
    }
}
```
