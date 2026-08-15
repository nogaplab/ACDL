# Extraction report — MINT-bench agent (`mint-bench/mint/`)

Specification: `MintAgent.acdl` (two specs: `MintCustomAgent[@T.I]`, `MintRawHistoryAgent[@T]`).

---

## 1. Agent overview

MINT-bench evaluates an LLM on multi-turn, tool-using problem solving. `mint/main.py:37-124`
runs one *interactive loop* per task: the environment (`GeneralEnv`) seeds a single opening user
message containing the solver protocol, the tool list, one in-context example trajectory and the
task; then, until the episode finishes, it alternates `agent.act(state)` (one LLM call) with
`env.step(action)`. The model answers in a fixed tag protocol — `<thought>` plus either
`<execute>` (Python run in a REPL) or `<solution>` (a final answer) — and the environment appends
the resulting observation to a single persistent `State.history` list as a **user** message
(`mint/envs/general_env.py:127-133`, `:198-269`). An episode ends on task success, on exhausting
`max_steps` / `max_propose_solution`, or on an API error (`:172-196`, `:214-221`).

This fork adds `CustomMINTAgent` (`mint/agents/custom_agent.py`), which does **not** send
`State.history` verbatim. It re-parses the flat history into *turns* (a turn is closed by a
`<solution>`) and *steps* (an `<execute>` / observation pair) and then re-emits the whole array
under one of six configurable context-construction strategies (`opt1`, `opt1A`, `opt2`, `opt3`,
`opt3A`, `opt4`). Comparing those six shapes is the point of the fork; all shipped configs under
`configs/gpt-4-turbo-opt*/` select it.

## 2. Time model

`@T.I` — `@T` is the **turn** (one solve attempt, closed by a `<solution>` message:
`custom_agent.py:134-139`), `I` the **step** inside it (one `<execute>` exchange:
`custom_agent.py:140-150`); `@t.substeps` is the number of completed steps of turn `@t`.
One iteration of `main.py:74-89` = one agent LLM call = one step.

`MintRawHistoryAgent` is written with a flat `@T` = interaction step, because
`openai_lm_agent.py:41` sends `state.history` verbatim and that code has no notion of turns — the
array there is a plain alternation of assistant output and environment message.

**Persistent list vs. replay.** `State.history` is a persistent, append-only list. Two things it
hides, both of which are in the spec: (a) `log_output` is a no-op once `State.finished` is true
(`general_env.py:128-129`), so the terminal observation never enters any context; (b) when
`action.value` is empty — the error path — no assistant message is appended at all
(`general_env.py:204`). `CustomMINTAgent` additionally *rewrites* the list on every call, so its
array is a derived view, not the stored one.

## 3. Prompts found

| # | Call site | Status |
|---|-----------|--------|
| 1 | `mint/agents/custom_agent.py:499` (`call_lm`), context built at `:453-471` from `act` `:502-527` | **Specified** as `MintCustomAgent[@T.I]` |
| 2 | `mint/agents/openai_lm_agent.py:31-37` (`call_lm`), context = `state.history` at `:41` | **Specified** as `MintRawHistoryAgent[@T]` |
| 3 | `mint/envs/general_env.py:109-119` — `self.feedback_agent.act(...)`, the "expert feedback" LLM | **Excluded.** No class in `mint/agents/__init__.py` (`LMAgent`, `OpenAILMAgent`, `CustomMINTAgent`) implements that call signature, and every shipped config sets `pseudo_human_feedback: "None"` and `agent_class: "None"` (e.g. `configs/gpt-4-turbo-opt1/.../gsm8k.json:38-42`), so `feedback_agent` is `None` (`:43-48`) and `get_feedback` returns early (`:102-103`). Its *effect on the main context* is modelled: the `EXPERT_FEEDBACK_HEADER` branch of `Frag EnvObservation`. |
| 4 | `mint/prompt/__init__.py:31-33` `FeedbackPromptTemplate` + `templates/template_feedback_agent.txt` | **Excluded** — never instantiated anywhere in the repo (grep for `FeedbackPromptTemplate` returns only the definition). Would be prompt #3's template. |
| 5 | `mint/agents/base.py:34-45` `add_system_message` — splits the opening user message on `"\n---\n"` into `S:` + `U:` | **Excluded, dead code.** Nothing calls it; the only references to `add_system_message` are commented-out config blocks (`mint/configs/config_variables.py:146+`) and `docs/CONFIG.md`. Had it been live, `S: { SOLVER_PROTOCOL… TOOL_LIST }` + `U: { IN_CONTEXT_EXAMPLE … TASK_HEADER }` would replace the single opening `U:`. |
| 6 | `mock_llm_patch` imported at `mint/main.py:6` (file lives *outside* the analysed root, at `MintAgent/mock_llm_patch.py`) | **Not a prompt.** It monkey-patches `Completions.create` to dump the request and return a canned reply; it does not read or alter `messages`. The `*.jsonl` / `*.md` dumps in the repo root are its output and were used only to cross-check the spec (§6). |

No other model call exists: grepping the non-`venv` tree for `chat.completions` / `Completion.create`
returns only rows 1 and 2; `scripts/` and `compare_*.py` are analysis-only.

## 4. Line-by-line evidence

| Spec line | Source | What justifies it |
|-----------|--------|-------------------|
| `StrFrag InitialTaskPrompt` is **one** `U:` message | `general_env.py:281-292` | `user_prompt = ToolPromptTemplate(...)(...)`; `self.state.history = [{"role": "user", "content": user_prompt}]` — a single rendered template, one message |
| `If sys.use_tools == true` / `Else` | `prompt/__init__.py:22-28`, `general_env.py:272,281` | `ToolPromptTemplate.__init__` picks `TEMPLATE_WITH_TOOL` or `TEMPLATE_WITHOUT_TOOL` from `env_config["use_tools"]` |
| `SOLVER_PROTOCOL_WITH_TOOL(sys.max_steps, sys.max_propose_solution)` | `templates/template_with_tool.txt:1-10`, `general_env.py:282-283` | fixed text with `{max_total_steps}` / `{max_propose_solution}` holes |
| `TOOL_LIST_HEADER` + `ForEach(tool: sys.tool_set)` | `tools/__init__.py:8-17` | `""` when the toolset is empty, else a header plus `signature`/`description` per tool |
| `IN_CONTEXT_EXAMPLE_WITH_FEEDBACK` vs `IN_CONTEXT_EXAMPLE` | `tasks/base.py:43-52`, `general_env.py:285-288` | file choice keyed on `with_feedback = feedback_type != NO_FEEDBACK` |
| `SECTION_SEPARATOR` (twice) | `templates/template_with_tool.txt:14,18` | literal `---` lines; also the split key used by the dead `add_system_message` |
| `TASK_HEADER(env.task_prompt)` | `general_env.py:289` | `"Task:\n" + self.task.prompt` |
| `Frag EnvObservation` = one `StepOutput.to_str()` | `datatypes.py:81-106`, `general_env.py:127-133,260-268` | every environment message is exactly this rendering |
| `OBSERVATION_HEADER` | `datatypes.py:82` | literal `"Observation:\n"` |
| `If sys.observation != none … Else ANSWER_IS_WRONG` | `datatypes.py:83-87`, `general_env.py:151-165` | `handle_propose_solution` returns `None` on a clean parse, so `to_str` falls back to `"Your answer is wrong."` |
| `sys.observation[step]` content | `general_env.py:135-149`, `:18-23` | REPL stdout, a `traceback.format_exc()`, or `INVALID_INPUT_MESSAGE` |
| `If sys.count_down == true { STEPS_AND_PROPOSALS_LEFT … }` | `datatypes.py:89-96`, `general_env.py:234-241` | budget line gated on `env_config["count_down"]` |
| `If sys.steps_left < 2 { TAKE_LAST_STEP_TO_PROPOSE }` | `datatypes.py:94-95` | `if n_steps_left <= 1` |
| `If sys.feedback_type != no_feedback { EXPERT_FEEDBACK_HEADER … }` | `datatypes.py:97-104` | appended only when feedback is enabled and non-empty |
| `RolesFrag TurnOpening[@t]` with `If @t > 1` | `custom_agent.py:156-169` | a user message becomes `turn.user_input` only after a turn was closed; turn 1's opening message is `initial_task`, held out at `:120` |
| `A: EXECUTE_BLOCK(...)`, thought discarded | `custom_agent.py:258, 303, 335, 368, 399, 433` | every builder rebuilds the assistant content as `f"<execute>{step['execute']}</execute>"`; `_extract_thought` output is stored (`:143`) but only re-used inside `answer["raw"]` |
| `If resp.execute_code[step] != none` guard | `custom_agent.py:256, 300, 334, 366, 398, 432` | `if step["execute"]:` — steps with no `<execute>` are dropped from the context entirely |
| `T: { Frag EnvObservation }` for opt1/opt3 | `custom_agent.py:213-219, 261-262, 371-372` | `{"role": "tool", "tool_call_id": …}`, emitted even when the observation is `""` |
| tool-call id / `arguments: "{}"` (comment only) | `custom_agent.py:194-211` | synthetic uuid id, empty argument object — the code is never in the request |
| `ToolStepAsAssistant` folds code + observation into one `A:` | `custom_agent.py:300-309, 397-406` | `content += f"\n<observation>{...}</observation>"`, one `messages.append` |
| `ToolStepSplitUser` emits `A:` then `U:` | `custom_agent.py:431-444` | two separate appends, the second with `"role": "user"` |
| `PromptEndsHere when (@T == 1 & @T.substeps == 0)` | `custom_agent.py:117-118, 233-235` | empty parse → `{"turns": []}` → `if not turns: return messages`; opt2/3/3A/4 reach the same array via an empty loop |
| opt1/opt1A: `ForEach(t: range(1, @T))` then current turn | `custom_agent.py:238` (`for turn in turns[:-1]`), `:248` (`turns[-1]`) | history loop stops **before** the current turn; the current turn is emitted separately and expanded |
| opt2/3/3A/4: `ForEach(t: range(1, @T + 1))` | `custom_agent.py:324, 359, 391, 425` | `for turn in parsed["turns"]` — **includes** the in-progress turn |
| `If @t < @T { A: resp.answer_message[@t] }` | `custom_agent.py:343-344, 375-376, 409-410, 447-448` | `if turn["answer"]`; only a `<solution>` closes a turn (`:134-139`), so the last turn never has one at call time |
| `Switch sys.context_strategy` / `Default` → opt1 | `custom_agent.py:453-471` | explicit six-way dispatch with an opt1 fallback and a warning |
| execute-tool schema attached only for opt1/opt3 (comment) | `custom_agent.py:51-67, 486, 496-497` | `tools` kwarg added only when some message carries `tool_calls` |
| `MintRawHistoryAgent`: `U:` init then `A:`/`U:` pairs | `openai_lm_agent.py:41`, `general_env.py:204-212, 260-268` | `messages = state.history`, appended one assistant + one user per step |
| `prefixAssistantLabel(resp.raw_output[@t])` | `general_env.py:205-209` | `"Assistant:\n" + action.value` unless it already starts with `Assistant:` |

## 5. Abstraction decisions

- **Two specs, one Switch.** The six strategies are six materially different arrays, but they are
  selected by one config key inside one function. Modelling them as six top-level specs would
  duplicate the opening message, the turn skeleton and the observation rendering six times; a
  `Switch sys.context_strategy` mirrors `_apply_context_strategy` exactly and keeps the shared
  skeleton visible. The step-level differences are factored into three `RolesFrag`s
  (`ToolStepAsToolCall`, `ToolStepAsAssistant`, `ToolStepSplitUser`), which is precisely where the
  six builders actually differ.
- **`sys.context_strategy` as a context variable, not a header parameter.** It is read once from
  config (`custom_agent.py:77`); switching on a context variable keeps the header to the time
  dimension and matches the `Switch` idiom in the language reference.
- **Namespaces.** `env.task_prompt` is the only `env.*` variable — it is the one thing that comes
  from outside the system (a dataset row). Observations are `sys.*`: despite the class being called
  `GeneralEnv`, they are produced by the harness's own `PythonREPL` and formatting code
  (`tools/python_tool.py`, `datatypes.py:81-106`), i.e. tool results, not world state. Model
  outputs are `resp.*` — `resp.raw_output`, `resp.answer_message` (the untouched assistant string
  including `<thought>`), `resp.execute_code` (the code the parser re-extracted from it).
  `sys.expert_feedback` is `sys` rather than `resp` because it would come from a *different* model.
- **`sys.observation[step]` vs `sys.env_message[step]`.** Two distinct code checks that would
  otherwise collide: the first is `StepOutput.observation is None` inside `to_str`
  (`datatypes.py:83`), the second is `if step["observation"]` in the builders
  (`custom_agent.py:304, 336, 400, 439`) — a test on whether the parser attached any environment
  text to that step at all.
- **What was collapsed.** The whole opening protocol text is one template per branch rather than
  one per paragraph: nothing inside it is independently toggled. The `<execute>` / `<observation>`
  tag wrapping is recorded in comments instead of open/close-tag templates, since the tags never
  vary. Task-class differences (`MBPPTask.prompt`, `HumanEvalTask.prompt`, `AlfWorldTask`) change
  only the *text* behind `env.task_prompt`, never the message structure, so they are absent.
  `AlfworldEnv` (`envs/alfworld_env.py`) overrides success-checking and the toolset, not message
  building, so it needs no separate spec.
- **Functions.** Only `prefixAssistantLabel` — a conditional formatting step. Everything else is
  either a fixed template or a plain state read.
- **Loop bounds.** `range(1, @T)` for opt1/opt1A history (`turns[:-1]` — stops *before* the current
  turn), `range(1, @T + 1)` for opt2/3/3A/4 (`for turn in turns` — *includes* it),
  `range(1, @t.substeps + 1)` for steps (a Python `for step in turn["steps"]`, 1-indexed here).

## 6. Verification

Walked both directions: all 29 `messages.append` calls in `custom_agent.py` (lines 231, 241, 245,
252, 259, 262, 276, 286, 290, 297, 306, 322, 327, 340, 344, 357, 362, 369, 372, 376, 389, 394, 403,
410, 423, 428, 435, 441, 448) map to a role message in the spec, and every role message in the spec
maps back to one of them.

Cross-checked against the request dumps the repo already contains
(`wrong_then_continue.md`, produced by `mock_llm_patch` under the `opt1` config). The recorded role
sequences match the `opt1` branch exactly, including the two edge cases:
`#1 user` (the `PromptEndsHere` early return), `#2 user → assistant → tool` (turn 1 has no opening
user message), and `#4 user → assistant → user` (turn 2 opens: collapsed turn-1 answer, then the
new turn's environment message, no steps yet).

## 7. Uncertainties and gaps

1. **The spec was not run through the ACDL toolchain.** The sandbox in this session refused to
   execute `bun`/`npm`, so `npm run cli -- out.html MintAgent.acdl` could not be run. The file was
   instead hand-checked against `src/parser.ts` (optional `StrFrag` params `:153-161`, token-slurped
   conditions `:1072-1076`, `Case` matches `:1244-1248`, `Frag` invocations `:647-683`,
   single-line role rule `:447-453`). Worth re-running the renderer before relying on it.
2. **`use_tools: false` is marked `// UNVERIFIED:` in the spec.** The `TEMPLATE_WITHOUT_TOOL` branch
   exists in `prompt/__init__.py:26-27`, but `Task.in_context_example` raises `NotImplementedError`
   for `use_tool=False` (`tasks/base.py:47-52`), so `reset()` would crash before any LLM call. The
   branch is kept because the code is there; treat it as unreachable.
3. **The feedback path is specified from its consumer, not its producer.** The expert-feedback text
   and the `with_tool_and_feedback` in-context example are structurally correct
   (`datatypes.py:97-104`, `tasks/base.py:47-48`), but no runnable feedback agent exists in this
   fork, so that branch of the spec has never executed. If a `FeedbackAgent` class is restored, its
   own prompt (`templates/template_feedback_agent.txt`: in-context example, tool description,
   trajectory, correct solution) needs a third spec.
4. **`opt3A`'s docstring is copy-pasted onto `opt4`** (`custom_agent.py:414-418` repeats the opt3A
   text). The spec follows the *code* — `opt4` splits the observation into its own user message
   (`:439-444`) — not the docstring.
5. **`@t.substeps` for previous turns is a reconstruction.** The parser derives turn/step structure
   from tag matching on raw text (`custom_agent.py:127-171`), so a model reply containing neither
   `<execute>` nor `<solution>` produces a step that every builder silently drops (`:151-154` then
   the `if step["execute"]` guards). The spec records the drop but does not model how such a step's
   observation is re-attached to the *previous* step (`:162-163`) — an edge case I judged too
   incidental for the structure.
6. **`AlfworldEnv` was read but not exercised.** `mint/main.py:10-15` catches its import failure and
   the shipped configs never select it; I confirmed by reading `envs/alfworld_env.py` that it
   inherits all message building from `GeneralEnv`, but no dump exists to check it against.
