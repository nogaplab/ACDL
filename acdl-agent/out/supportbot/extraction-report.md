# Extraction report — SupportBot

## Agent overview

SupportBot is a single-file customer-support chat agent (`supportbot.py`, 134 lines,
no dependencies beyond `dataclasses`/`typing`). It holds an `AgentState` containing a
list of `TurnHistory` records (each a user `message` plus the assistant `reply`) and
two constant customer attributes, `customer_name` and `customer_tier`. On every user
turn, `build_messages(turn, state, current_message)` rebuilds the entire message array
from scratch: a system message, the full prior conversation replayed as alternating
user/assistant pairs, the current user message, and — for premium customers only — a
second system message appended at the very end.

There is no tool loop, no sub-agent, no retrieval, no summarization or truncation, and
no persistent message list mutated in place. The array is a pure function of
`(turn, state, current_message)`.

## Prompts found

| Site | file:line | Disposition |
|---|---|---|
| `build_messages()` — the message array | `supportbot.py:59-95` | **Specified** as `SupportBot[@T]` |
| `client.chat.completions.create(model="gpt-4", messages=messages)` | `supportbot.py:131-133` | Commented-out dead code. It is the only API call reference in the repo and it consumes `build_messages()` output unmodified, so the spec treats that output as the model input. No framework sits between the two: no tool schemas, no SDK-injected preamble, no cache-control blocks. |
| `__main__` demo block | `supportbot.py:102-128` | Excluded — constructs sample data and prints; contributes no structure. |

That is every model-call-adjacent site in the codebase. There is exactly one prompt,
hence one specification.

A file `supportbot.acdl` also exists in the codebase directory. I did not open it: it is
a reference specification, not source, and reading it would make this extraction a copy
rather than a derivation.

## Line-by-line evidence

| Spec line | Evidence | Quote / reasoning |
|---|---|---|
| `SupportBot[@T]` | `supportbot.py:59`, `:82` | `turn: int` is documented "Current turn number (1-indexed)" (`:63`) and is used only as the history bound. The array grows over user turns; nothing accumulates within a turn. |
| `S: { ... }` (single message) | `supportbot.py:74-79` | `system_content = SUPPORT_GUIDELINES + "\n\n" + COMPANY_POLICIES + "\n\n" + CUSTOMER_INFO(...)` then one `messages.append({"role": "system", ...})`. Concatenation, not three messages — hence the braced form. |
| `SUPPORT_GUIDELINES` | `supportbot.py:14-16`, used `:75` | Persona + politeness + escalation instruction. Fixed at authoring time → template. |
| `COMPANY_POLICIES` | `supportbot.py:18-20`, used `:76` | Returns / shipping / support-hours text. Fixed → template. |
| `CUSTOMER_INFO(env.customer_name, env.customer_tier)` | `supportbot.py:31-33`, used `:77` | `def CUSTOMER_INFO(name, tier) -> f"Customer: {name}\nTier: {tier}"` — fixed text wrapping two runtime values, i.e. a parameterized template, not a plain variable and not a computed function. |
| `ForEach(@t: range(1, @T))` | `supportbot.py:82` | `for t in range(1, turn)` — already 1-indexed and half-open, so it maps to `range(1, @T)` unchanged. Covers turns 1..@T-1; **stops before the current turn**. |
| `U: env.message[@t]` | `supportbot.py:84` | `state.history[t-1].message` — the `-1` is Python list indexing against a 1-indexed `t`, not a turn offset. |
| `A: resp.reply[@t]` | `supportbot.py:86` | `state.history[t-1].reply` — prior model output → `resp`. |
| `U: env.message[@T]` | `supportbot.py:89` | The `current_message` parameter, not read from `state.history`. Same role and content shape as historical user turns, so the same variable name with the current index. |
| `If env.customer_tier == "premium"` | `supportbot.py:92` | `if state.customer_tier == "premium":` — literal string comparison. |
| `S: PREMIUM_PRIORITY_NOTICE` | `supportbot.py:22-24`, appended `:93` | A **second system message**, appended *after* the current user message. Order is structural and preserved. |
| No `PromptEndsHere` | `supportbot.py:95` | The only `return` is at the end; no early exit path. |

Bidirectional check: every `messages.append(...)` in the file (lines 79, 84, 86, 89, 93)
appears in the spec, and every spec line traces to one of those five appends or to the
constants/loop that feed them. Nothing was added by convention.

## Abstraction decisions

- **Time model.** `@T` = user turn. There is a single model call per turn and no
  intra-turn loop, so no sub-step index and no `@t.substeps` are needed.
- **Replay vs. append.** `messages = []` is rebuilt on every call (`:71`), so the
  loop-over-history form is literal here, not a normalization. I checked the things a
  persistent list would hide: the system message is not mutated, no message is dropped
  or rewritten, and tool results do not exist.
- **`env` for customer identity.** `customer_name` and `customer_tier` live on
  `AgentState`, which superficially suggests `sys`. I chose `env` because they are facts
  about an external party that the agent observes rather than produces — the dataclass is
  just the carrier. They carry no index because they are constant across the conversation
  (`:51-52`, never reassigned).
- **`resp` for replies.** `TurnHistory.reply` is stored agent state, but its *origin* is a
  prior model output, which the namespace rule keys on.
- **Three templates, not one.** The system message is a fixed concatenation, so collapsing
  it would not lose conditionality. I kept the three parts separate because they are
  independently defined constants with distinct purposes, and `CUSTOMER_INFO` is
  parameterized — merging it into a single opaque template would hide that the customer's
  name and tier enter the context here.
- **No functions.** Nothing in the file computes, retrieves, summarizes, or reformats.
  `CUSTOMER_INFO` is a Python function but semantically an f-string template, so it is
  written `ALL_CAPS`, per the template-vs-function rule.
- **Marks.** Three regions — setup, history, current turn — matching the three structural
  segments of the builder.

## Uncertainties and gaps

Small file, little ambiguity. Three things worth a human's eye:

1. **`TurnHistory.reply` is `Optional[str] = None`** (`supportbot.py:44`), but line 86
   appends it unconditionally. A history entry with no reply would emit an assistant
   message with `content: None`. I specified `A: resp.reply[@t]` unconditionally because
   that is what the code does; if in-flight turns can legitimately have a null reply, the
   real structure has a guard the code is missing. This looks like a latent bug rather
   than unspecified structure.
2. **The premium notice's position** (system message *after* the user message,
   `supportbot.py:93`) is unusual and some providers reorder or reject trailing system
   messages. The spec records the code's order faithfully; whether the model actually
   receives it there depends on the SDK, which cannot be checked because the call is
   commented out.
3. **No live API call exists.** `supportbot.py:131-133` is commented out, so nothing
   verifies that `build_messages()` output reaches a model unaltered, and no framework
   contribution (tool schemas, default preamble) could be observed. If this builder is
   later wired into a real client, re-check for SDK-injected messages.
