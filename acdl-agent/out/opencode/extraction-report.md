# Extraction report — opencode

Target: `/home/noga/Documents/BIU/Research/PHD/OpenCode_Analysis/opencode`
(monorepo, `packages/opencode` v1.18.4). Specification: `OpenCode.acdl`.
All paths below are repo-relative.

---

## 1. Agent overview

opencode is a terminal coding agent. A user prompt enters through
`SessionPrompt.prompt` (`packages/opencode/src/session/prompt.ts:1052`), which
persists a user message and its parts to SQLite and then enters `runLoop`
(`prompt.ts:1081-1341`) — a `while (true)` loop that, on **every** iteration,
re-reads the whole message list for the session
(`MessageV2.filterCompactedEffect`, `prompt.ts:1092`), rebuilds the system
string and the model-message array from scratch, and makes exactly one provider
call (`handle.process` → `LLM.stream` → `streamText`,
`prompt.ts:1272` / `session/llm.ts:280`). Each provider call persists one
assistant message; tool calls inside it are executed by the AI SDK and their
results are written back as parts of that same assistant message. The loop exits
when the newest assistant message finished for a non-tool reason and carries no
outstanding tool calls (`prompt.ts:1111-1130`). Sub-agents (the `task` tool)
create a *child session* and re-enter the same path, so they are the same
prompt shape with a different agent. A parallel v2 implementation lives in
`packages/core/src/session/**` and is driven by `packages/server`; it is
specified separately.

---

## 2. Prompts found

| # | Call site | What it is | Disposition |
|---|-----------|------------|-------------|
| 1 | `packages/opencode/src/session/prompt.ts:1272` → `session/processor.ts:640` → `session/llm.ts:280` (`streamText`) | Main agent turn/step | **Specified** — `OpenCode[@T.I]` |
| 2 | `packages/opencode/src/session/compaction.ts:388` (same processor/LLM path) | History summarization ("anchored summary") | **Specified** — `Compaction[@T]` |
| 3 | `packages/opencode/src/session/prompt.ts:225` (`llm.stream`, `small: true`) | Session title generation | **Specified** — `TitleGenerator[@T]` |
| 4 | `packages/core/src/session/runner/llm.ts:205` (`LLM.request` → `llm.stream`) | v2 session runner turn | **Specified** — `RunnerV2[@T.I]` |
| 5 | `packages/core/src/session/compaction.ts:197` | v2 automatic compaction | **Specified** — `CompactionV2[@T]` |
| 6 | `packages/opencode/src/tool/task.ts:200-214` → `prompt.ts:1052` | Sub-agent delegation | **Folded into #1** — creates a child session and re-enters `prompt`/`runLoop`; identical message structure, different `agent` (and therefore different `AGENT_PROMPT`) |
| 7 | `packages/opencode/src/agent/agent.ts:397-435` (`generateObject` / `streamObject`) | `opencode agent create` — writes a new agent config | **Excluded** — one system message (`agent/generate.txt`) + one user message; not a conversation context and not reachable from the agent loop |
| 8 | `packages/opencode/src/server/routes/instance/httpapi/handlers/project-copy.ts:34-51` | Names a copied project | **Excluded** — structurally identical to #3 (one system message from a hidden agent + one user message); only the template text differs |

Not an LLM call despite the name: `session/summary.ts` (`SessionSummary`)
computes a **git diff** summary from snapshots, no model involved
(`summary.ts:102-127`).

---

## 3. Line-by-line evidence

### 3.1 `OpenCode[@T.I]`

| Spec line | Evidence |
|---|---|
| Header `[@T.I]` | `prompt.ts:1088` `while (true)`; `:1132` `step++`; `:1186-1201` one persisted assistant message per iteration; `:1057` one persisted user message per prompt |
| History rebuilt each step (not appended) | `prompt.ts:1092-1094` `MessageV2.filterCompactedEffect(sessionID)` re-read every iteration |
| Single `S:` message | `session/llm/request.ts:58-66` — the whole system array is `.join("\n")` into `system[0]`; `:101-112` `system.map(x => ({role:"system", content:x}))` prepended to `input.messages` |
| System text sent out-of-band for OpenAI-oauth / GitLab workflow | `request.ts:57`, `:99` `options.instructions = system.join("\n")`, `:101-103` |
| `AGENT_PROMPT` / `MODEL_FAMILY_PROMPT` | `request.ts:60` `input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)`; family dispatch at `session/system.ts:27-42` over `prompt/*.txt` |
| Order of the remaining system fragments | `prompt.ts:1257-1269` — `[...env, ...instructions, ...mcp, ...skills]`, then `:1270-1271` structured-output, then `request.ts:62` `user.system` |
| `ENVIRONMENT(...)` | `system.ts:65-76` — model id, working directory, worktree, git-ness, platform, date, in one `<env>` block |
| `AVAILABLE_REFERENCES` | `system.ts:77-94`; `undefined` when no reference has a description, sorted by name at `:83` |
| `INSTRUCTIONS_FROM(f.path)` + `f.content` | `session/instruction.ts:155-169`; discovery of AGENTS.md/CLAUDE.md/CONTEXT.md and config globs at `:110-153`; http(s) entries fetched at `:158-163` |
| `MCP_INSTRUCTIONS` | `system.ts:112-128` — returns `undefined` when no server has an enabled tool |
| `SKILL_INSTRUCTIONS` | `system.ts:98-110` — returns `undefined` when the `skill` permission is disabled |
| `STRUCTURED_OUTPUT_INSTRUCTION` | `prompt.ts:1270-1271`; text at `prompt.ts:82`; also adds a `StructuredOutput` tool and `toolChoice: "required"` at `:1243-1250`, `:1285` |
| `env.request_system` | `request.ts:62` (`input.user.system`), populated from `PromptInput.system` at `prompt.ts:668` |
| Second `S:` from a plugin | `request.ts:68-78` — after `experimental.chat.system.transform`, if the array grew past 2 entries and entry 0 is unchanged, entries 1..n are joined into a second element, which `:105-110` turns into a second system message |
| `Name C` / `Name K`, compaction reorder | `message-v2.ts:521-572` `filterCompacted`: walk newest→oldest, stop at the newest *completed* compaction (`:531-543`), then reorder to `[compaction, summary, tail, rest]` at `:545-570` |
| `U: WHAT_DID_WE_DO_SO_FAR` | `message-v2.ts:228-233` — a `compaction` part renders as the literal `"What did we do so far?"` |
| `A: resp.summary[@$C]` | the summary assistant message written by `compaction.ts:356-402` (`summary: true`) |
| `ForEach(t: range(@$C + 1, @T))` | history is one flat chronological pass (`message-v2.ts:195`); `@T` excluded because the current turn is written out separately |
| Current-turn reminders | `session/reminders.ts:15-90`, applied at `prompt.ts:1180-1184`; pushed onto `findLast(role === "user")` (`reminders.ts:23`), i.e. the end of the current user message |
| `ForEach(i: range(1, @T.I))` | `msgs` is read at `prompt.ts:1092`, *before* the step-I assistant message is created at `:1186-1201`, and empty-part messages are skipped anyway (`message-v2.ts:196`) |
| `A: MAX_STEPS_PROMPT` last | `prompt.ts:1178-1179` `isLastStep = step >= agent.steps`; appended after the history at `:1279-1282`; text at `packages/core/src/session/runner/max-steps.ts:1` |
| Tools not in messages | `request.ts:148` `resolveTools`, `:184` sorted and returned in the `tools` field; `session/tools.ts:40` |

### 3.2 Shared fragments (v1 rendering)

| Spec line | Evidence |
|---|---|
| `UserContent` text parts | `message-v2.ts:206-210` — `part.type === "text" && !part.ignored && part.text !== ""` |
| … includes synthetic expansions | `prompt.ts:699-993` `resolvePart`: `file:` + `text/plain` → "Called the Read tool with…" + file content + the file part (`:855-889`); directory (`:909-947`); MCP resource (`:703-784`); `agent` part → the part plus a "call the task tool with subagent: X" hint (`:974-990`) |
| `Case "file" { part.media }` | `message-v2.ts:212-226` — `text/plain` and `application/x-directory` are skipped (already text); everything else becomes a file part |
| `Case "compaction"` / `Case "subtask"` | `message-v2.ts:228-233`, `:234-239` |
| `Step` drops errored assistants | `message-v2.ts:248-256` |
| assistant part order text / reasoning / tool | `message-v2.ts:277-377` — a single pass over parts in stored order |
| one `T:` message per step | `message-v2.ts:406-414` `convertToModelMessages`; tool parts carry `state: "output-available"` / `"output-error"` (`:315-360`) |
| pending/running tool → error result | `message-v2.ts:349-360` `"[Tool execution was interrupted]"` |
| pruned tool output | `message-v2.ts:293-295` `"[Old tool result content cleared]"`, set by `compaction.ts:243-287` |
| extracted media user message | `message-v2.ts:296-305` (which providers can hold media in a tool result) and `:382-399` (re-sent as a user message); prompt text at `message-v2.ts:46` |
| `Turn` = user message + following steps | `message-v2.ts:195` single ordered pass; assistant messages always follow their parent user message |

### 3.3 `Compaction[@T]`

| Spec line | Evidence |
|---|---|
| `S: COMPACTION_AGENT_PROMPT` | `compaction.ts:391-393` passes `system: []` and `agent` = the hidden `compaction` agent, whose `prompt` is `agent/prompt/compaction.txt` (`agent/agent.ts:219-233`); `request.ts:60` supplies it |
| head selection `range(@$H, @$K)` | `compaction.ts:333` drops the trailing compaction message, `:334-336` hides earlier compaction request/summary pairs, `:188-239` `select` computes the tail split (`tail_turns`, default 2; `preserve_recent_tokens` budget at `:80-85`), `head = messages.slice(0, keep.start)` at `:236` |
| media stripped / tool output capped | `compaction.ts:351-354` `{ stripMedia: true, toolOutputMaxChars: 2000 }`; behaviour at `message-v2.ts:213-217`, `:49-53` |
| final `U:` instruction | `compaction.ts:394-400`; built by `buildPrompt` at `packages/core/src/session/compaction.ts:161-169` |
| update-vs-create branch | `core/session/compaction.ts:163-165` (`<previous-summary>` wrapper) vs `:165` |
| `SUMMARY_TEMPLATE` | `core/session/compaction.ts:16-77` |
| plugin context | `compaction.ts:343-348` `experimental.session.compacting` may also replace the whole prompt |
| no tools | `compaction.ts:392` `tools: {}` |

### 3.4 `TitleGenerator[@T]`

| Spec line | Evidence |
|---|---|
| fires once, on step 1 | `prompt.ts:1133-1139`; guarded by `:199-206` (no parent session, still the default title, exactly one non-synthetic user message) |
| `S: TITLE_AGENT_PROMPT` | `prompt.ts:229` `system: []` + hidden `title` agent (`agent/agent.ts:234-249`, `agent/prompt/title.txt`) via `request.ts:60` |
| `U: GENERATE_A_TITLE…` | `prompt.ts:235` — prepended before the converted history |
| subtask-only first message | `prompt.ts:213-214`, `:222-223` |
| otherwise history up to the first real user message | `prompt.ts:208` `history.slice(0, idx + 1)`, `:224` |

### 3.5 `RunnerV2[@T.I]`

| Spec line | Evidence |
|---|---|
| Header `[@T.I]` | `runner/llm.ts:393-405` — outer loop over queued input, inner `while (needsContinuation)` over provider steps |
| two system parts | `runner/llm.ts:208-210` `[agent.info?.system, system.baseline].filter(...).map(SystemPart.make)` |
| joined vs. separate per protocol | `packages/llm/src/protocols/openai-chat.ts:294-295` (joined into one system message) vs `anthropic-messages.ts:525-530` (array of blocks on the top-level `system` field) |
| baseline composition and order | `runner/llm.ts:168-171` `combine([registry.load(), skillGuidance.load(agent), referenceGuidance.load()])`; registry sorts by key (`system-context/registry.ts:38-45`); sources joined with a blank line (`system-context/index.ts`, `render`) |
| baseline frozen per epoch | `session/context-epoch.ts:40-89` — persisted with a `baseline_seq`; changes are emitted as `SessionEvent.ContextUpdated` (`:72-77`), not folded back into the system message |
| individual sources | `system-context/builtins.ts:16-32` (environment), `:33-39` (date), `instruction-context.ts:29-37` + `:39-73` (AGENTS.md), `skill/guidance.ts:57-62`, `reference/guidance.ts:50-55` |
| history window | `runner/llm.ts:200-201`; `session/history.ts:90-99` → `:24-53`: everything from the newest `compaction` row onward, plus `system` rows newer than the baseline seq, ordered by `seq` |
| per-type rendering | `runner/to-llm-message.ts:115-167` |
| assistant split into A + T messages | `to-llm-message.ts:70-113` — content parts in one assistant message, one `Message.tool` per locally executed call (`:101-107`) |
| `A: MAX_STEPS_PROMPT` + no tools | `runner/llm.ts:202-203` (`toolMaterialization` skipped), `:211` (message appended), `:213` (`toolChoice: "none"`) |

### 3.6 `CompactionV2[@T]`

| Spec line | Evidence |
|---|---|
| single user message, no system, no tools | `core/session/compaction.ts:196-203` `LLM.request({ model, messages: [Message.user(summaryPrompt)], tools: [] })` |
| prompt composition | `:179-182` (`buildPrompt` with `previousSummary` and `context = [previous.recent, selected.head]`), `:161-169` |
| flattened transcript | `:86-126` `serialize` (`[User]:` / `[Assistant]:` / `[Assistant tool call]:` / `[Tool result]:`), `:128-159` `select` (head/recent split at ~8k tokens, `DEFAULT_KEEP_TOKENS` at `:13`) |

---

## 4. Abstraction decisions

- **Time model.** `@T.I` for both agent loops. The message array grows along two
  axes: one persisted *user* message per turn, and one persisted *assistant*
  message per provider call inside that turn. `@t.substeps` therefore maps
  exactly onto "assistant messages belonging to turn *t*".
- **One system message, not several.** The largest single judgement call.
  `request.ts:58-66` joins everything with `"\n"` into `system[0]`, so all the
  system fragments are written as elements of one `S: { … }` block, not as
  separate `S:` lines. The only way a second system message appears is the
  plugin-transform collapse at `request.ts:68-78`, which is spelled out as its
  own conditional top-level `S:`.
- **What became a template vs. a context variable.** Everything living in a
  `.txt` prompt file or a source string literal is a template
  (`AGENT_PROMPT`, `MAX_STEPS_PROMPT`, `SUMMARY_TEMPLATE`,
  `WHAT_DID_WE_DO_SO_FAR`). Fixed text wrapping runtime values became
  parameterised templates (`ENVIRONMENT(...)`, `INSTRUCTIONS_FROM(f.path)`,
  `CONVERSATION_CHECKPOINT(m.summary, m.recent)`). Pure runtime text
  (`f.content`, `m.text`, `sys.previous_recent`) stayed a context variable.
- **Namespaces.** `env.*` only for what the API caller supplied on the request:
  `env.request_system`, `env.output_format`, `env.subtask_prompts`. Everything
  read back out of the session store — user parts, tool results, instruction
  files, skills, MCP text — is `sys.*`, because by the time it reaches the
  prompt builder it is agent machinery reading its own database, not fresh
  external input. `resp.*` is used only for the compaction summary, which is
  literally a previous model output replayed as context.
- **File expansion collapsed.** `resolvePart` (`prompt.ts:699-993`) turns an
  attached file into three parts at *message creation* time. Since ACDL
  describes the resulting array, the spec renders those uniformly as text/media
  parts of the user message and records the expansion in a comment, rather than
  duplicating a `Switch` that no longer exists at call time.
- **Sub-agents folded in.** The `task` tool starts a child session and calls
  `prompt` again, so it produces `OpenCode[@T.I]` with a different agent. Adding
  an `agent` header parameter would suggest a structural difference that does
  not exist; a comment carries the fact instead.
- **`serializeHistory` as a function.** v2 compaction does not replay messages —
  it flattens them into one string. That is a computation, so it is a
  `camelCase` function, not a loop over messages.
- **Left out deliberately.** Tool schemas, headers, temperature/topP/topK,
  provider options, cache-control breakpoints, retry policy, and the doom-loop
  detector: none of them change which messages are sent, in what role or order.
  The tools field gets one comment in `OpenCode[@T.I]` because a reader will
  look for it.

---

## 5. Uncertainties and gaps

1. **`sys.run_step` vs. the turn's step index.** `isLastStep` compares
   `agent.steps` against a counter that is per-`runLoop` invocation
   (`prompt.ts:1132`), not per turn. If a queued prompt is admitted into a
   running loop, the counter keeps climbing across turns, so `@T.I` and
   `sys.run_step[@T.I]` can diverge. The spec uses a distinct variable name for
   this rather than pretending they are the same.
2. **`Name C := sys.compaction_turn[@T]` = 0 when never compacted.** ACDL indices
   start at 1; 0 is used here as a sentinel so `range(@$C + 1, @T)` degenerates
   to `range(1, @T)`. That is a spec-writing convention, not something the code
   states.
3. **Steps per assistant message.** The spec assumes one provider step per
   persisted assistant message. `streamText` is called without `stopWhen`
   (`session/llm.ts:280-353`), so the AI SDK should emit a single step; but
   `processor.ts:424-433` handles repeated `step-start` events, which would make
   `convertToModelMessages` split one assistant message into several
   assistant/tool pairs. I could not rule that path out from the source alone.
4. **Anthropic empty-text separator.** `message-v2.ts:262-284` replaces an empty
   text part with a single space when signed reasoning is present. That is a
   content-level detail, not a message-level one, so it is not in the spec.
5. **Plugins.** Three hooks can change the array in ways the spec can only
   gesture at: `experimental.chat.system.transform` (modelled),
   `experimental.chat.messages.transform` (`prompt.ts:1255`, mutates the message
   list in place — *not* modelled, since any plugin can do anything), and
   `experimental.session.compacting`, which can replace the compaction prompt
   entirely (`compaction.ts:343-348`, noted in a comment).
6. **The `summary` agent is dead config.** `agent/agent.ts:250-264` defines a
   hidden `summary` agent with `agent/prompt/summary.txt`, but nothing in
   `packages/opencode/src` calls it — `SessionSummary` is the git-diff service.
   No spec was written for it.
7. **Two live implementations.** Both `packages/opencode/src/session` (v1, the
   CLI binary) and `packages/core/src/session` (v2, reached through
   `packages/server` → `SessionV2.prompt` → `execution.wake` → `SessionRunner`)
   build model requests. The v2 runner's own header comment
   (`runner/llm.ts:43-91`) marks several context-assembly items as unfinished,
   so `RunnerV2[@T.I]` describes work in progress; the v1 spec is the one that
   describes what a user of the shipped binary gets. Worth confirming with a
   maintainer which path a given deployment exercises.
8. **Not validated with the ACDL toolchain.** The CLI lives outside the
   directories this session may access, so `OpenCode.acdl` was written against
   the language reference but never parsed. Syntax worth a second look:
   `RolesFrag Step[@t.i]` (substep-indexed fragment parameter) and
   `Frag AssistantV2[m]` (a role fragment invoked with a loop variable from an
   enclosing `Switch`).
