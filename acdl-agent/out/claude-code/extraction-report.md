# Extraction report — Claude Code

Target: `claude-code` (TypeScript/Bun, ~2000 source files under `src/`).
Specification: `ClaudeCode.acdl` (4 specs: `MainAgent`, `SubAgent`, `Compactor`, `AuxQuery`).

---

## 1. Agent overview

Claude Code is a terminal coding agent. A turn begins when the user submits input
(`REPL.tsx:2855 onQuery`, or `QueryEngine.ts:219 ask()` in SDK/print mode); the input is
turned into a user message plus a set of computed *attachment* messages
(`processUserInput.ts:85`), appended to a persistent message array, and handed to
`query()` (`src/query.ts:219`).

`queryLoop` (`src/query.ts:241`) is a `while (true)` loop: each iteration performs context
maintenance (compact-boundary slicing, tool-result budgeting, snip, microcompact, context
collapse, autocompact), makes one API call, executes any tools the model requested, appends
the assistant message and the merged tool-result message, and iterates. The loop exits when
the model returns no `tool_use` block (`query.ts:1062`).

`queryModel` (`src/services/api/claude.ts:1017`) is the single funnel to the API. It performs
the final assembly — normalisation, tool-pairing repair, media trimming, system-prompt
concatenation — and calls `anthropic.beta.messages.create`. Subagents and the compaction
summariser reuse the same funnel.

Two facts shape the whole spec: **no `tool`-role message is ever sent** (tool results are
user-role messages carrying `tool_result` blocks, `claude.ts:588-631`), and **consecutive
user messages are merged into one** (`messages.ts:2187-2199`), so a single API user message
routinely carries attachments, tool results, and the user's text together.

---

## 2. Prompts found

### Specified

| Call site | file:line | Spec |
|---|---|---|
| Main agentic loop (REPL, SDK, print, remote) | `query.ts:659` → `claude.ts:1017` → `claude.ts:1822` | `MainAgent[@T.I]` |
| Subagent / Task / teammate / fork | `tools/AgentTool/runAgent.ts:748` → same `query()` | `SubAgent[@T.I, agent]` |
| Conversation compaction (auto, manual, reactive, partial) | `services/compact/compact.ts:1292` | `Compactor[@T]` |
| ~20 single-shot auxiliary calls | see below | `AuxQuery[task]` |

`SubAgent` re-enters the *same* `queryLoop`, so only its system prompt and seed messages are
specified; its history/current-turn shape is `MainAgent`'s Mark 4–5 verbatim. This is stated
in a comment at the end of the spec rather than duplicated.

### Folded into `AuxQuery`

All share one shape — fixed system prompt + exactly one user message
(`claude.ts:3241-3272`, `utils/sideQuery.ts:140-183`):

`commands/rename/generateSessionName.ts:20`, `utils/sessionTitle.ts:87`,
`services/toolUseSummary/toolUseSummaryGenerator.ts:69`, `tools/WebFetchTool/utils.ts:503`,
`components/Feedback.tsx:449`, `utils/shell/prefix.ts:220`, `utils/mcp/dateTimeParser.ts:68`,
`utils/teleport.tsx:107`, `services/awaySummary.ts:41`, `components/agents/generateAgent.ts:149`,
`utils/hooks/apiQueryHookHelper.ts:85`, `utils/hooks/execPromptHook.ts:62`,
`utils/hooks/skillImprovement.ts:212`, `cli/handlers/autoMode.ts:115`,
`memdir/findRelevantMemories.ts:98`, `utils/agenticSessionSearch.ts:264`,
`utils/claudeInChrome/mcpServer.ts:189`, `utils/permissions/permissionExplainer.ts:178`,
`utils/permissions/yoloClassifier.ts:795/881/1160`, `utils/model/validateModel.ts:57`.

### Excluded (with reason)

| Call site | file:line | Why excluded |
|---|---|---|
| `WebSearchTool` | `tools/WebSearchTool/WebSearchTool.ts:268` | Server-side search tool loop; message array is one user message, structure identical to `AuxQuery` apart from the tool declaration. |
| `commands/insights.ts:883/1026/1577` | — | Analytics command, not part of the agent's own context. |
| `services/tokenEstimation.ts:172/302` | — | `countTokens` probe and a sizing call; not a context the agent reasons in. |
| `services/claudeAiLimits.ts:209` | — | Rate-limit probe. |
| `services/compact/sessionMemoryCompact.ts`, `apiMicrocompact.ts` | — | Variants of the compaction call; same shape as `Compactor` with a different instruction template. Noted, not separately specified. |

---

## 3. Line-by-line evidence

### System message (`MainAgent` Mark 1)

| Spec line | Evidence |
|---|---|
| single `S:` block, ≤3 cached text blocks | `claude.ts:1376` `buildSystemPromptBlocks` → `api.ts:427-434`: attribution header, CLI prefix, and `rest.join('\n\n')` — everything else is one block. |
| `ATTRIBUTION_HEADER` | `claude.ts:1360`; body at `constants/system.ts:73-93`. Returns `''` when disabled (`:74-76`). |
| `CLI_SYSPROMPT_PREFIX` | `claude.ts:1361-1364`; `constants/system.ts:30-46` picks one of three fixed strings by interactive / SDK / SDK-with-append. |
| `Switch sys.system_prompt_source` | `utils/systemPrompt.ts:41-123` — four mutually exclusive bodies: override (:56), coordinator (:62-75), main-thread agent (:77-83, :116), custom (:118-119), default (:120). |
| default-build section order | `constants/prompts.ts:560-576` (static) and `:491-555` (dynamic). Order is preserved: `systemPromptSections.ts:48` is `Promise.all(sections.map(...))`. |
| `DOING_TASKS_SECTION` guarded | `prompts.ts:564-567` — dropped when `outputStyleConfig.keepCodingInstructions !== true`. |
| `DYNAMIC_BOUNDARY_MARKER` guarded | `prompts.ts:573` `shouldUseGlobalCacheScope()`. |
| `MCP_SERVER_INSTRUCTIONS` guarded | `prompts.ts:513-520` — skipped when the delta attachment carries them instead. Body at `:579-604`. |
| `ENV_INFO_SECTION` | `prompts.ts:499-501` → `computeEnvInfo` `:606-639`: cwd, platform, OS, model id, knowledge cutoff, additional dirs. |
| `sys.append_system_prompt` | `utils/systemPrompt.ts:121`, `QueryEngine.ts:324`. `main.tsx:1364-2208` folds chrome hints, custom-agent instructions and the proactive prompt into this same string. |
| `sys.system_context` last | `query.ts:449-451` → `api.ts:437-447` appends `"key: value"` lines *after* everything above. Content: `context.ts:110-146` (git branch/main/user/status/commits, status truncated at 2000 chars, `:85-89`). |
| `ADVISOR_TOOL_INSTRUCTIONS` | `claude.ts:1366`, gated by `claude.ts:1081-1116`. |
| `CHROME_TOOL_SEARCH_INSTRUCTIONS` | `claude.ts:1354-1355`, `:1367`. |

### Request preamble (Mark 2)

| Spec line | Evidence |
|---|---|
| `AVAILABLE_DEFERRED_TOOLS` first | `claude.ts:1330-1345` — prepended to `messagesForAPI`, i.e. ahead of everything else. Guarded on `useToolSearch && !isDeferredToolsDeltaEnabled()`. |
| `USER_CONTEXT_REMINDER` second | `query.ts:660` `prependUserContext(messagesForQuery, userContext)` → `api.ts:449-474`: one `isMeta` user message wrapping `<system-reminder>`. Returns unchanged when the context map is empty (`:457`). Contents: `context.ts:180` (CLAUDE.md/memory files), `:181` (date), `QueryEngine.ts:302-308` (coordinator/scratchpad). |

### Compaction (Mark 3)

| Spec line | Evidence |
|---|---|
| history sliced at boundary | `query.ts:365` `getMessagesAfterCompactBoundary(messages)` → `messages.ts:4643-4656`, `slice(boundaryIndex)`. |
| boundary marker not sent | It is a `system` message; `messages.ts:2066-2072` filters non-`local_command` system messages out. |
| summary as a user message | `compact.ts:614-624` `createUserMessage({ content: getCompactUserSummaryMessage(summary, …, transcriptPath) })`. |
| post-compact attachments | `compact.ts:925-948` (re-read files, async-agent notes, plan, plan-mode) and `:330-337` ordering: boundary, summary, messagesToKeep, attachments, hookResults. |
| `messagesToKeep` noted not modelled | `compact.ts:334`; which end is preserved varies by direction (`:345-348`). |

### Turn structure (Mark 4–5, `UserTurnInput`, `ToolStep`)

| Spec line | Evidence |
|---|---|
| attachments precede the user's text | `processTextPrompt.ts:97` returns `[userMessage, ...attachmentMessages]`; `messages.ts:1481-1527` bubbles attachments *backwards* past the plain user message to the previous assistant/tool_result; `messages.ts:2187-2199` then merges them with the prompt. Confirmed by the code comment at `processTextPrompt.ts:43-46`. |
| three attachment groups, in order | `attachments.ts:998-1002` returns `[...userAttachmentResults, ...threadAttachmentResults, ...mainThreadAttachmentResults]`. Groups defined at `:773-815`, `:824-941`, `:944-987`. |
| main-thread group gated | `attachments.ts:944` `isMainThread ? [...] : []`, where `isMainThread = !toolUseContext.agentId` (`:770`). |
| UserPromptSubmit hook context | `processUserInput.ts:231-262`; truncation at `:274-279` (10K chars). |
| images after the text | `processTextPrompt.ts:76` `[...textContent, ...imageContentBlocks]`. |
| one assistant message per response | `query.ts:1716` `[...messagesForQuery, ...assistantMessages, ...toolResults]`; same-id assistant messages merged at `messages.ts:2246-2264`. |
| all parallel tool calls in one assistant message | `messages.ts:2211-2240` maps over `message.message.content` blocks. |
| all tool results merged into one user message | `query.ts:1384-1400` pushes one user message per result; `messages.ts:2187-2199` merges consecutive user messages. |
| cleared tool results | `compact/microCompact.ts:479-490` replaces content with `TIME_BASED_MC_CLEARED_MESSAGE` (`:36`); `toolResultStorage.ts:924-936` replaces oversized results. Both rewrite in place — message count unchanged. |
| mid-turn attachments after tool results | `query.ts:1580-1590` (queued commands / task notifications), `:1599-1614` (memory prefetch), `:1620-1628` (skill discovery). All pushed onto `toolResults` after the results themselves. |
| recovery sub-steps | `query.ts:1223-1236` (max output tokens), `:1267-1306` (stop-hook blocking), `:1308-1341` (token budget). Each re-enters the loop with `[...messagesForQuery, ...assistantMessages, <one synthetic user message>]`. |
| history loop stops before `@T` | `range(@$C + 1, @T)` — turn `@T`'s response is what the call produces. |
| current-turn sub-step loop stops at `I-1` | `range(1, I)`; sub-step `I` is the request being assembled. |

### `SubAgent`

| Spec line | Evidence |
|---|---|
| same loop | `runAgent.ts:748` `query({ messages: initialMessages, systemPrompt: agentSystemPrompt, … })`. |
| fork inherits parent system prompt | `AgentTool.tsx:623` / `runAgent.ts:508-509`. |
| agent prompt + notes + env | `runAgent.ts:906-932` → `prompts.ts:760-791`: `[agentPrompt, notes, discoverSkillsGuidance?, envInfo]`. Note it does **not** call `getSystemPrompt()`. |
| CLAUDE.md dropped for read-only agents | `runAgent.ts:390-398` (`omitClaudeMd`). |
| gitStatus dropped for Explore/Plan | `runAgent.ts:404-410`. |
| seed messages | `runAgent.ts:373` `[...contextMessages, ...promptMessages]`; prompt at `AgentTool.tsx:538-540`; fork context at `runAgent.ts:370-372`; worktree notice at `AgentTool.tsx:599-601`; SubagentStart hook at `runAgent.ts:546-555`; preloaded skills at `runAgent.ts:628-644`. |

### `Compactor`

| Spec line | Evidence |
|---|---|
| one-line system prompt | `compact.ts:1301-1303` — literally `asSystemPrompt(['You are a helpful AI assistant tasked with summarizing conversations.'])`. The main system prompt is not reused. |
| history, images stripped | `compact.ts:1293-1300` `normalizeMessagesForAPI(stripImagesFromMessages(stripReinjectedAttachments([...getMessagesAfterCompactBoundary(messages), summaryRequest])))`. |
| instruction as final user message | `compact.ts:840-843` (partial) / `:441-451` (full); custom instructions merged at `:826-834`. |
| newest turn may be unanswered | `query.ts:454` — autocompact runs inside `queryLoop`, after the turn's input is appended and before its response exists. Manual `/compact` (`compact.ts:790`) runs between turns. |
| PTL retry drops the head | `compact.ts:874-898`. |

---

## 4. Abstraction decisions

**Time model.** `@T.I`. The array accumulates over both user turns and loop iterations, and
both are visible in the prompt, so the two-level form is required. `I` maps to one iteration
of `queryLoop`'s `while (true)` — i.e. one API call — which is also what `@t.substeps`
counts for a completed turn.

**`T:` was rejected.** `userMessageToMessageParam` (`claude.ts:588-631`) always emits
`role: 'user'`, and only `user`/`assistant` reach the API. Writing `T:` would have implied a
`tool`-role message that this agent never sends. Tool results are `U:` throughout, with a
header comment explaining why.

**Two fragments, both used ≥3 times.** `UserTurnInput` (history, current turn, both
Compactor branches) and `ToolStep` (history, current turn, Compactor). Nothing single-use
was made a fragment.

**Recovery paths folded into `ToolStep`.** The three retry paths (max-output-tokens,
stop-hook blocking, token budget) each produce *assistant message + one synthetic user
message*, structurally identical to a tool sub-step. Modelling them as a `Switch` on the
sub-step outcome keeps the current turn free of any `resp.*[@T]`, which an earlier draft had
wrong.

**Attachments as three ordered loops, not 30 templates.** `getAttachments` computes ~30
attachment types, each independently conditional. Enumerating them would have blown past one
page without adding structure — the structure is *three ordered groups, the third gated on
main-thread*. The group members are listed in comments with their line ranges.

**`sys` vs `env`.** `env` is reserved for what came from outside: `env.user_input`,
`env.pasted_images`, `env.task_prompt`. Everything the harness computes is `sys` — including
attachments, retrieved memories, git status, tool results, and summaries. Retrieved
documents and tool output are agent machinery, not observations from the user, so
`sys.relevant_memories` rather than `env.*`.

**One `S:` block.** The API receives up to three `system` text blocks, but the split is
purely for `cache_control` placement (`api.ts:427-434`) and does not change what the model
reads. Modelled as one `S:` with a comment; splitting it into three would have implied a
semantic boundary that is not there.

**Content maintenance collapsed to an in-place `If`.** `snipCompactIfNeeded`,
`microcompactMessages`, `applyToolResultBudget`, `applyCollapsesIfNeeded` and
`stripExcessMediaItems` all rewrite or blank content without changing the message sequence.
Only microcompact/budget replacement is shown (as the `TOOL_RESULT_CLEARED_PLACEHOLDER`
branch); the rest are noted but not given structure they do not have.

---

## 5. Uncertainties and gaps

1. **The spec was not machine-validated.** The ACDL toolchain lives outside this session's
   allowed directories, so `npm run check` / `npm run cli` could not be run. The file was
   hand-checked against the language reference (fragment arity, loop bounds, `resp.*[@T]`
   absence, single-line role form), but a parse error is possible.

2. **`messagesToKeep` after a partial compact.** `compact.ts:334` splices a preserved run of
   raw messages into the post-compact array, but whether it is a prefix or a suffix depends
   on the compact direction (`compact.ts:345-348`), and the direction is chosen by callers
   this extraction did not fully trace. The spec records this in a comment instead of
   modelling it.

3. **Feature-gated regions.** Large parts of the loop are behind `feature()` build flags and
   Statsig gates: `HISTORY_SNIP`, `CONTEXT_COLLAPSE`, `CACHED_MICROCOMPACT`, `TOKEN_BUDGET`,
   `TRANSCRIPT_CLASSIFIER`, `KAIROS`, `PROACTIVE`, `BUDDY`, `COMPACTION_REMINDERS`,
   `EXPERIMENTAL_SKILL_SEARCH`. The spec reflects the shape when a gate is on where that
   shape is visible in the array (e.g. token-budget nudges); it does not enumerate which
   builds enable which.

4. **Sub-step numbering across recoveries.** Each `continue` in `queryLoop` increments the
   iteration, but `turnCount` is only bumped on the tool path (`query.ts:1679`) and reset on
   others. The spec treats every iteration as a sub-step, which matches the message array;
   whether the codebase's own `turnCount` agrees is not load-bearing for the array and was
   not chased down.

5. **`assistantMessages` plurality.** `query.ts:1716` spreads an array, and a streaming
   fallback can clear and refill it (`query.ts:716-741`). Same-id messages merge
   (`messages.ts:2246-2264`), so one API response yields one message — but a fallback that
   produces a *different* message id after tombstoning could in principle leave two. Not
   observed in the code path; the spec assumes one assistant message per sub-step.

6. **Ordering within `sys.thread_attachments`.** Taken from the literal source order of the
   `allThreadAttachments` array (`attachments.ts:824-941`), which is resolved with
   `Promise.all` and therefore order-preserving. Individual getters may internally return
   several attachments whose relative order was not traced.

7. **`normalizeMessagesForAPI` post-passes.** Six normalisation passes run after the main
   fold (`messages.ts:2295-2367`): orphaned-thinking filtering, trailing-thinking stripping,
   whitespace-only filtering, tool-reference sibling relocation, error-content sanitising,
   `[id:]` tagging. These can *drop* an assistant message in edge cases (orphaned thinking
   after a compaction slice). Not represented — they are repair paths, not intended
   structure — but a resumed or compacted session can in principle send fewer messages than
   the spec shows.
