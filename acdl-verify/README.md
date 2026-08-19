# acdl-verify

Takes an ACDL specification and the codebase it claims to describe, **runs that codebase**,
and checks that the message arrays it actually sends match what the spec predicts.

Where [`acdl-agent`](../acdl-agent) reads code and writes a spec, `acdl-verify` reads a spec
and tests it against behaviour. The two compose: extract, verify, correct, repeat.

> **Status.** The proxy, Level A checking, binding discovery, runtime confirmation, sweeps,
> the `resp.*` answer schema and per-condition ablation all work end-to-end. Still design:
> Level B placement verdicts, coverage instrumentation, mutation scoring, the Docker
> sandbox, and the annotated `.verified.acdl` output. See *What runs today*.

## What runs today

Record a trace by driving a target entirely from a scenario file — no API key, no network:

```bash
bun run acdl-verify/proxy.ts \
  --scenario acdl-verify/scenarios/acdl-agent-loop3.json \
  --out      acdl-verify/traces/acdl-agent-loop3.jsonl \
  --var      tier=premium \
  --run      '.venv-linux/bin/python acdl-agent/acdl-agent.py --target acdl-tests/test1-supportbot'
```

The proxy has three modes, differing only in where the reply comes from:

| Mode | Flag | Reply source | Costs money |
|------|------|--------------|-------------|
| scripted | `--scenario s.json` | the scenario file | no |
| live | `--live haiku` | a real model via the Claude Code binary | subscription, no key |
| record | `--base-url https://api.anthropic.com` | the real provider | yes, needs a key |
| replay | `--replay traces/e1.jsonl` | a previous recording | no |

Scripted mode synthesises replies in three wire formats — Anthropic Messages, OpenAI
Chat Completions, Google Gemini — in whichever dialect the target asked in, streamed
(SSE) or not. Record and replay never interpret the payload at all, so they work
against **any** provider, including ones the registry has never heard of.

| Proxy flag | Default | Notes |
|------------|---------|-------|
| `--run` | — | drive one episode; without it the proxy just serves. `{port}` and `{var}` are substituted |
| `--out` | `traces/<episode>.jsonl` | |
| `--episode` | `<scenario>-<timestamp>` | episode id, stamped on every record |
| `--provider` | inferred from `--base-url` | `anthropic` \| `openai` \| `google` |
| `--port` | `8931` | `0` picks a free port, which is what a matrix runner wants |
| `--var k=v` | — | a controlled variable, repeatable; recorded in the manifest |
| `--vars` | — | the same, as a JSON file |
| `--max-calls` | scenario's, else 200 | wallet and runaway-loop guard |
| `--quiet` | off | suppress per-call logging |

Check a spec against that trace:

```bash
bun run acdl-verify/check.ts \
  --spec  acdl-agent/acdl-agent.acdl \
  --trace acdl-verify/traces/acdl-agent-loop3.jsonl
```

```
spec   AcdlAgent[@T]  acdl-agent/acdl-agent.acdl:8
trace  3 recorded call(s)  acdl-verify/traces/acdl-agent-loop3.jsonl
       episode acdl-agent-loop3  [scripted/anthropic]  vars tier=premium

(abridged)
  ✓ CONFIRMED   call 1   message count      2 messages, as predicted
  ✓ CONFIRMED   call 1   role sequence      S U
  ✓ CONFIRMED   call 3   role sequence      S U A T A T
  ✓ CONFIRMED   call 3   prefix preserved   call 3 extends call 2 by 2 message(s)

free choices (taken from the trace, therefore NOT verified):
  - call 3: size of sys.tool_calls[@i] = 1 (collection length is not stated in the spec)
```

| File | What it is |
|------|------------|
| [`proxy.ts`](proxy.ts) | recording proxy: provider registry, JSONL trace with manifest, scripted / record / replay modes, `--run` driver |
| [`evaluate.ts`](evaluate.ts) | ACDL AST → predicted message array; reports what it had to leave free |
| [`check.ts`](check.ts) | Anthropic wire→ACDL normalization, Level A verdicts, prefix monotonicity |
| [`provenance.ts`](provenance.ts) | spec → verification targets, each carrying the source lines the extractor cited |
| [`discover.ts`](discover.ts) | the binding-discovery agent: proposes a control handle per target |
| [`bindings.ts`](bindings.ts) | binding schema, the evidence check, `bindings.json` I/O, the review report |
| [`runner.ts`](runner.ts) | episodes, matrices, the nondeterminism baseline and masking |
| [`responder.ts`](responder.ts) | live replies from a real model, on a subscription rather than an API key |
| [`sweep.ts`](sweep.ts) | run a target many times, varying one axis at a time, and attribute the effects |
| [`answers.ts`](answers.ts) | the `resp.*` schema, and finding how to deliver a chosen answer |
| [`ablate.ts`](ablate.ts) | per-condition verdicts: the spec's predicted delta against the observed one |
| [`verify.ts`](verify.ts) | runtime confirmation: canary and differential proofs, recipe generation |
| [`scenarios/`](scenarios/) | scripted replies, one file per scenario |
| `*.test.ts` | `bun test acdl-verify/` — provider matrix, streaming, trace format, target extraction, the evidence check |

Not yet built: Level A/B/C verdicts driven off the confirmed bindings, the
nondeterminism baseline, coverage instrumentation, mutation scoring as a command, the
Docker sandbox, and the LLM planning layer.

### The trace format

A trace is JSONL, and every line carries a `record` discriminator:

```jsonc
{"record":"manifest","traceVersion":2,"episode":"loop3-20260818T113000Z","mode":"scripted",
 "provider":"anthropic","variables":{"tier":"premium"},"run":"...","git":{...},
 "scenario":{"name":"acdl-agent-loop3","sha256":"..."},"targetEnv":{...}}
{"record":"call","seq":1,"provider":"anthropic","modelCall":true,
 "headers":{"anthropic-beta":"...","x-api-key":"<redacted:26>"},"request":{...},"response":{...}}
{"record":"summary","calls":3,"modelCalls":3,"exitCode":0,"durationMs":412}
```

The manifest is what makes a trace evidence rather than a log. `variables` in particular
is the independent variable of the experiment: a paired ablation is two traces that differ
there and nowhere else, and without it the pairing lives only in whoever ran the commands.

Credentials never enter a trace — auth headers are replaced with `<redacted:N>`, and
Gemini's `?key=` query parameter is scrubbed from the recorded URL. Everything else,
including beta flags and SDK version headers, is kept: those are exactly the additions an
extracted spec tends to miss.

`readTrace()` also accepts v1 traces, which had no manifest and no discriminator.

## What it claims, and what it does not

`acdl-verify` looks for **counterexamples**. It never reports that a spec is correct — only
that a specific claim survived a specific set of experiments, or that it did not.

It tests **soundness**, not completeness: every structure the spec asserts must appear in the
traces. Structure that appears in the traces but not the spec is reported separately, as
*unspecified*, since a spec is allowed to be a partial description.

Three levels of checking, each needing more setup than the last:

| Level | What it checks | Setup required |
|-------|----------------|----------------|
| **A — shape** | message count, role sequence, loop bounds, one-block-vs-many-messages, prefix monotonicity across a tool loop | none beyond a recorded trace |
| **B — placement** | which content lands in which message, and in what order within it | a binding map |
| **C — causal** | that each `If` / `Switch` actually gates what the spec says it gates | a binding map + controllable inputs |

The binding map is *discovered*, not written by hand — see **Binding discovery** below.

Level A alone catches the common failure modes of an extracted spec — an off-by-one loop
bound, a block the extractor split into three messages, a role transcribed wrong.

## Binding discovery

Levels B and C need to know how to *set* the things a spec names: how to make
`env.customer_tier` be `"premium"` in a real run. That map from context variable to
control handle is the one artefact no static analysis supplies, because the answer lives
in the target's input surface rather than in the spec.

Writing one by hand per target defeats the point — anyone who already knows every
variable's handle does not need this tool. So the map is **discovered**, and the thing
that makes discovery cheap is that `acdl-agent` already did the hard part:

```acdl
// <- supportbot.py:92  if state.customer_tier == "premium"
If env.customer_tier == "premium" {
    S: PREMIUM_PRIORITY_NOTICE
}
```

[`provenance.ts`](provenance.ts) turns those `<-` comments into a target list, each entry
carrying the exact source window the extractor cited. The agent is never asked to search a
codebase; it is handed the six lines the answer is in and asked to trace backwards from
where the value is *used* to where it *enters the process*. On the two real specs in
`acdl-agent/out/`, every one of 31 and 53 targets carries citations.

```bash
bun run acdl-verify/discover.ts   --spec   acdl-agent/out/supportbot/SupportBot.acdl   --target acdl-tests/test1-supportbot   --report acdl-agent/out/supportbot/extraction-report.md

bun run acdl-verify/discover.ts --spec … --target … --dry-run   # targets only, no model call
```

### Two transports

`--transport` chooses where proposals come from, and the choice is not only about billing:

| Transport | Auth | Schema | Tools |
|-----------|------|--------|-------|
| `api` | `ANTHROPIC_API_KEY` | enforced server-side via `output_config.format` | none — the prompt is all it sees |
| `claude-cli` | the Claude Code binary at `CLAUDE_CODE_EXECPATH`, i.e. **a subscription, no API key** | asked for, then parsed and validated locally | read-only `Read` / `Grep` / `Glob` |

`auto` (the default) picks `claude-cli` when no API key is set. The CLI transport is the
more capable of the two in one respect: because the agent keeps read-only tools, a citation
that lands *near* the handle rather than *on* it can still be chased down. It is weaker in
another: nothing enforces the output schema, so a malformed reply is simply a failed
attempt. The evidence check gates both identically.

The branch *domain* is not discovered at all — it is read off the spec. `If x == "premium"`
states its own comparison value, and a `Switch` states one per `Case`. Those literals become
the values an ablation will try.

### The model proposes; the checker disposes

A proposed binding is a hypothesis, and a model describing a `--tier` flag that does not
exist is the failure mode that would quietly poison every downstream verdict. So each
proposal must cite a file, a line, and the **verbatim source text** at that line, and every
one is checked against the file before it is written down:

| Rejection | What it caught |
|-----------|----------------|
| snippet does not appear in the file | an invented flag or environment variable |
| snippet exists but not within 6 lines of the citation | a real handle attributed to the wrong place |
| file does not exist / line out of range | a hallucinated path |

Rejections go back to the agent with the specific reason and it re-answers only those keys.
What survives is stamped `grounded`; what does not is kept as `rejected` with its reason
rather than dropped, because a target nobody can control is a real finding about the
codebase. Nothing downstream may read an ungrounded binding.

Grounding is the cheap half. It proves the cited line exists and says what was claimed — it
does **not** prove that setting the handle moves the prompt. That is `verification:
"confirmed"`, and it costs an episode:

- a **content** variable can be set to a unique sentinel and looked for in the recorded
  request; where it lands also gives Level B its placement for free
- a **condition** variable cannot, since its value has to be one of the branch literals —
  it is proved differentially instead, by running both arms and requiring the requests to
  differ

That pass is [`verify.ts`](verify.ts), below.

### Handle kinds

The taxonomy is closed, and three of the eight kinds are admissions rather than answers:

| Kind | Meaning |
|------|---------|
| `env` `flag` `file` `stdin` | a real input surface the runner can drive |
| `response` | a `resp.*` value: not controlled by the codebase at all — the proxy's scripted reply says the words |
| `harness` | no input surface: the value is only reachable by importing the module and calling the builder with synthetic state |
| `constant` | hardcoded here; only a source edit changes it |
| `unreachable` | nothing in this codebase sets it |

`harness` is not an edge case. `acdl-tests/test1-supportbot/supportbot.py` — this project's
own first test target — has no CLI, no environment reads, and builds its state from literals
in a `__main__` block. A flag-only binding map would have failed on the very first example,
which is why the agent is told in as many words that "there is no handle" is a correct
answer and inventing one is not.

`response` exists because `env.*`/`sys.*` and `resp.*` are asymmetric. The first two are
*inputs* to the process and need a handle in the code; `resp.*` is an *output* of the model,
so there is nothing in the codebase to find — the recording proxy controls it by scripting
the reply. Without that kind in the taxonomy the agent has to answer the question anyway,
and it answers it wrongly: on `acdl-agent` it classified `resp.thinking` as `constant`
citing `thinking={"type": "adaptive"}`, which is the line that turns thinking *on*, not the
line that decides what the model said.

Actual output on this repo's own two targets:

| Target | Result |
|--------|--------|
| `acdl-tests/test1-supportbot` | 5/5 grounded, all `harness` — no CLI was invented |
| `acdl-agent` | 6/6 grounded: 1 `flag` (`--target`), 1 `file`, 1 `constant` (`TOOLS`), 3 `response` |

`sys.tool_calls` landing on `response` is the call worth noticing: the `sys.` prefix suggests
agent state, but which tools get called is decided by the model's reply, so the proxy — not
the codebase — is what controls it.

### Reviewing the binding map

`discover.ts` and `verify.ts` both write `<bindings>-report.md` beside the JSON. The binding
map is the one artefact in acdl-verify carrying model-authored content — a hypothesis about
someone else's codebase, backed by a file, a line, and a claim — so it is the one place a
person's review is worth spending. Everything downstream is mechanical.

The report carries, per variable: how to set it, how it reaches the prompt, the cited
snippet that was checked against the file, the runtime verdict and where the canary landed,
and the generated driver in a collapsed block. It closes with two lists worth reading
before trusting anything: **not controllable** (findings about the codebase, not failures)
and **grounded but not yet confirmed**.

## Runtime confirmation

Grounding checks a *claim*. A recipe is checked by **execution**: it either produces a
request carrying the canary or it does not, and no amount of plausible-looking code
substitutes for that.

```bash
bun run acdl-verify/verify.ts   --bindings acdl-verify/bindings-supportbot.json   --target   acdl-tests/test1-supportbot
```

Each grounded binding gets a **recipe** — env vars, arguments, stdin, or a generated
driver program — written by the same agent and then run. `constant`, `unreachable` and
`response` bindings are skipped: the first two have no handle, and the proxy already owns
the third.

### Two proofs

**Canary**, for a content variable. Set it to a value nothing else could produce, run one
episode, and look for it in the recorded request. Finding it proves control; *where* it was
found is Level B placement, obtained for free:

```
env.customer_tier → system.system
env.message       → user[0].content, user[2].content, user[4].content
resp.reply        → assistant[1].content
```

Three user slots at turn 3 is the history loop plus the current turn, exactly as
`ForEach(@t: range(1, @T)) { U: env.message[@t] }` followed by `U: env.message[@T]` predicts.

**Differential**, for a variable a condition compares against. A canary is useless there —
it would fall into the `Else` arm and prove nothing about the named one — so both arms are
run and the requests compared. The report separates two kinds of difference, because only
one of them is a branch firing:

```
cond:44  ✓ confirmed: message shape changed: arm "premium" gave [S U A U A U S],
         the off-arm value gave [S U A U A U].
         Incidental text delta at line 10, "Tier: premium" vs "Tier: ACDLV…_NOT_premium"
```

`env.customer_tier` feeds both the `CUSTOMER_INFO(...)` template and the `If`, so the two
arms differ in *two* ways. Reporting only "the requests differ" would overstate what was
shown; the message-shape line is the branch, the text delta is the template. When the shape
does *not* change, the verdict says so in as many words — the handle reached the prompt, but
no branch was demonstrated.

### The driver contract

For a `harness` target there is no process to launch, so the agent writes one. The contract
is deliberately narrow, and the second rule is the one that matters:

1. read the value from `ACDL_VALUE`
2. **import the target module and call its real builder** — never reimplement the prompt,
   since observing the target's own output is the entire point
3. pass the value in so it becomes the named variable
4. POST the result to `$ANTHROPIC_BASE_URL/v1/messages`
5. exit 0

Hoisting is constrained for the same reason: only a *leading* run of system messages moves
into the top-level `system` field. A system message appearing *after* a user turn stays at
its index, because its position is precisely what the spec claims. Getting this wrong is
silent — the canary still shows up, and the `S` at the end of `[S U A U A U S]` quietly
disappears.

The generated driver runs from a scratch directory with the target root as its working
directory, so the codebase under test is never modified.

### Status on this repo's own target

`acdl-tests/test1-supportbot`, all five bindings, all `harness` (it has no CLI):

| Binding | Method | Result |
|---------|--------|--------|
| `env.customer_name` | canary | ✓ confirmed → `system` |
| `env.customer_tier` | canary | ✓ confirmed → `system` |
| `env.message` | canary | ✓ confirmed → `user[0]`, `user[2]`, `user[4]` |
| `resp.reply` | canary | ✓ confirmed → `assistant[1]` |
| `cond:44` | differential | ✓ confirmed → branch adds a trailing `S` |

Every recipe is cached in `bindings.json`, so re-running verifies without paying for
generation again.

## Sweeps: many runs, one axis at a time

A single episode proves a binding. Checking a *spec* needs a family of them, because the
claims are about how the array changes as things vary.

```bash
bun run acdl-verify/sweep.ts --bindings bindings-supportbot.json   --time 1,2,3 --var env.customer_tier=basic,premium
```

```
baseline: cell 1 run 2x to find what moves on its own
  nothing moved: this target is deterministic under these settings

  time=1 env.customer_tier=basic      1 call(s)  [S U]
  time=1 env.customer_tier=premium    1 call(s)  [S U S]
  time=2 env.customer_tier=basic      1 call(s)  [S U A U]
  time=2 env.customer_tier=premium    1 call(s)  [S U A U S]
  time=3 env.customer_tier=basic      1 call(s)  [S U A U A U]
  time=3 env.customer_tier=premium    1 call(s)  [S U A U A U S]

axis effects:
  ✓ moved   message shape varies with time: 1 → [S U], 2 → [S U A U], 3 → [S U A U A U]
  ✓ moved   message shape varies with env.customer_tier: basic → [S U], premium → [S U S]
```

That table is `SupportBot[@T]` verified empirically. `ForEach(@t: range(1, @T))` is
half-open, so `@T=1` must contribute no history at all, `@T=2` one exchange, `@T=3` two —
which is exactly the `0 → 1 → 2` progression above, measured at the 0/1 boundary where
`range(1, @T)` and `range(1, @T+1)` diverge. The premium arm adds its trailing `S` at every
index, so the branch does not interact with the loop.

### Time is not a variable, and there are two ways to reach it

`sys.*` and `env.*` are inputs, set through a binding's recipe. `@T` is not an input at
all — it is how far into the episode we are, and what that *means* is target-specific: a
turn for a conversational agent, a step for a ReAct loop. Two routes reach a chosen value,
and `--time` means the same thing either way because the runner picks between them:

| Route | Cost | When it is used |
|-------|------|-----------------|
| **seed the state** — make the agent believe it is already at turn N | one call | a generated driver (reads `ACDL_TIME`), or a run command containing `{time}` |
| **replay the loop** — keep answering until turn N, then end the turn | N calls | anything else: a target we merely launch, which has never heard of `ACDL_TIME` |

Seeding is what you want, and it is a question worth asking the target's code, so `time` is
a discovery target in its own right. On SupportBot the agent answered:

> `build_messages(turn=N, ...)` with `state.history` preloaded with N−1 `TurnHistory`
> entries — the turn counter is a plain integer argument, so any N is reachable in a
> single call.

Where no seeding route exists, the runner falls back to replaying: it answers each call
with a tool call drawn from the tools the target itself offered, until the requested turn,
then ends the turn. The agent's own loop does the counting, so nothing needs to be told
anything. On a ReAct target that produces exactly what the spec predicts:

```bash
bun run acdl-verify/sweep.ts --bindings b.json --run 'node agent.js' --time 1,2,3
```
```
  time=1   1 call(s)  [S U]
  time=2   2 call(s)  [S U | S U A T]
  time=3   3 call(s)  [S U | S U A T | S U A T A T]
```

Set `turns` explicitly on an episode to cap calls regardless of `@T` — the same mechanism,
used as a budget. If the target offers no tools, the loop cannot be extended and the
episode says so rather than silently coming out shorter than asked for.

### The baseline is not optional

Every sweep runs one cell twice before varying anything, diffs the results, and masks
whatever moved. Two layers:

- **built-in scrubbing** of shapes that are volatile by construction — uuids, ISO
  timestamps, `msg_…`/`toolu_…` ids, long hex runs. No ACDL claim is ever about the value
  of a uuid.
- **empirical masking** of any path that differed between runs that should have been
  identical.

Skip this and a target that stamps a timestamp into its prompt makes every causal diff
untrustworthy — and against a live model it is worse, because you are measuring the model's
mood alongside the perturbation.

### "No effect" is a finding

An axis that changes nothing is reported as such, never as a pass:

```
· no effect  changing time changed nothing outside the mask — either the recipe
             ignores it (the driver may not read ACDL_TIME) or the target genuinely
             does not depend on it
```

Those two causes need different fixes and the tool cannot yet tell them apart; saying so is
better than a green tick. Distinguishing them is what coverage instrumentation is for.

## Live episodes without an API key

Scripted replies make an episode reproducible. They do not make it *realistic* — a loop
that only deepens when a model genuinely calls tools is never reached by a script that
does not know to call them.

`--live haiku` answers each call with a real model through the Claude Code binary, so it
runs on a subscription and needs no API key:

```bash
bun run acdl-verify/proxy.ts --live haiku --max-turns 4 --run 'python -m someagent'
```

The target still never reaches the network: the proxy composes the reply, so the trace has
exactly the shape a scripted run produces and everything downstream is unchanged. The
responder is shown the request — system prompt, conversation, tool schemas — and returns
the next assistant turn, constrained to the tools the target actually offered. A tool name
that was not offered degrades to text rather than erroring the target out on a detail that
has nothing to do with the spec.

Two things it deliberately does not get: the ACDL spec, and any instruction about which
branch to take. An episode whose trajectory was chosen by the checker would prove nothing.

Live episodes are nondeterministic by nature, which is what makes the baseline above load-bearing.

## The answer side: driving `resp.*`

`env.*` and `sys.*` are inputs and need a handle in the target's code. `resp.*` is the
opposite — it is what the model said, so the proxy owns it completely. What is *not*
obvious is the shape a value must take for the target to read it back as that variable:
a text block, a field inside a tool call, or text wrapped in tags the target parses.

The **domain** needs no discovery — a spec that branches on a `resp.*` states its own
comparison values:

```bash
bun run acdl-verify/answers.ts --spec acdl-agent/out/mint/MintAgent.acdl
```
```
resp.* variables: 3, of which 1 gate a branch

  resp.execute_code
    domain: none
    gates:  If resp.execute_code[step] != none
```

The **delivery** is found by experiment rather than by asking a model. The candidate set is
small and bounded by the tools the target itself offered, so each one is simply tried:

```bash
bun run acdl-verify/answers.ts --spec S.acdl --target . --run 'node agent.js'
```
```
pilot episode…
  1 call(s); tools offered: list_dir, read_file
  only one call: a resp.* value can never be observed re-entering the context here

probing delivery…
  ✓ resp.thinking: emitted list_dir.input and came back at assistant[1].content[0].input.input
```

Emit a canary one way, run the episode, and see whether it reappears in the **next**
request. A strategy that produces a reply the target discards has controlled nothing,
however plausible it looked — and a text reply that ends the turn is exactly that case,
which is why the first candidate failed above.

**Landing somewhere is not being that variable.** A probe that finds *a* route into the
context has not shown it found *this* variable's route. Three checks separate the two, and
all three come from the spec rather than from a model:

- **Role.** The observed landing role must match the nearest enclosing `S:`/`U:`/`A:`/`T:`.
  A mismatch is `misplaced`.
- **Distinctness.** Two variables cannot occupy one position. A slot is probed against the
  positions earlier slots already claimed, and keeps searching for a route of its own; if
  every route it can reach is taken, it is `ambiguous` — and so is the incumbent, because
  being asked about first is not evidence.
- **Order.** Inside one message, spec order must be wire order, or the later slot is
  `misplaced`.

On a target whose assistant turns carry only tool calls, `resp.thinking` and
`resp.reasoning` both reach the same position and the honest answer is `0/2 can be driven`.
An earlier version confirmed whichever was asked about first.

## Ablation: does each condition do what the spec says?

Everything before this proves a handle reaches the prompt. That is not the claim a spec
makes. `If env.tier == "premium" { S: NOTICE }` claims something sharper — that flipping
that one value adds *one system message*.

```bash
bun run acdl-verify/ablate.ts --spec SupportBot.acdl   --bindings bindings-supportbot.json --target acdl-tests/test1-supportbot --time 3
```
```
If env.customer_tier == "premium"   (line 44)
  ✓ CONFIRMED  arm "premium"  predicted +[S] at 6, observed +[S] at 6
```

Both halves are computed the same way and then compared:

| | how |
|---|---|
| predicted | `evaluate` the spec twice, condition forced true then false, and take the difference |
| observed | run the target twice, subject at the arm's value then at a value in no arm |

Absolute shapes are deliberately **not** compared — a spec may be a partial description and
a harness may add framing of its own — but the delta a branch causes must match exactly.
Other conditions are pinned false in both evaluations, so whatever they contribute cancels
out of the difference.

### The confirmed binding is the positive control

The README used to say that a null result is ambiguous without coverage instrumentation:
did the spec invent a branch, or did the perturbation never arrive? Runtime confirmation
answers that. If the handle is *already proven* to reach the prompt and flipping it changes
nothing, the branch is fictional:

```
✗ REFUTED   predicted +[S] at 2, observed none
  the spec predicts +[S] at 2, but flipping a handle already proven to reach the
  prompt changed nothing: the branch does not exist in the code
```

A binding that is not confirmed yields `UNCONTROLLABLE` instead — never a refutation.

### The partition test

Every value outside every named arm must land in the same place, or the `Else` is not one
arm and the spec is missing a `Case`. Off-arm probes double as the nondeterminism baseline,
since they run the same assignment more than once.

| Verdict | Meaning here |
|---------|--------------|
| `CONFIRMED` | predicted delta equals observed delta |
| `REFUTED` | deltas differ, or the off-arm probes disagreed with each other |
| `UNEXERCISED` | the branch adds no message at this `@T`; or the condition is compound; or no pair of values would straddle it |
| `UNCONTROLLABLE` | no confirmed binding for the subject; a null result would be unattributable |

### The literal is not always the true value

Which value makes a condition hold depends on its operator, and assuming otherwise inverts
every delta:

| Condition | true at | false at |
|-----------|---------|----------|
| `x == "premium"` | `premium` | a sentinel in no arm |
| `x != none` | a sentinel in no arm | `none` |
| `x < 2` | `1` | `2` |
| `x >= 5` | `5` | `4` |

`!= ` is the one that bites: the literal a spec names is precisely the value that makes the
condition **fail**. A pass that assumed "the literal makes it true" would refute every
correct spec written that way — and `!=` is the most common form in the corpus.

Compound conditions (`a == x & b == y`) are declined with `UNEXERCISED` rather than tested,
because pairing the second literal with the first subject would test something the spec
never claimed. One scenario per sub-condition is the design; it is not built yet.

## Checking a controlled episode

`check.ts` now reads the manifest, so the two halves of the tool finally meet:

```
trace  1 recorded call(s)
       episode cond:44-arm-premium  [scripted/anthropic]  vars env.customer_tier=premium time=3

  ✓ CONFIRMED   call 3   message count      7 messages, as predicted
  ✓ CONFIRMED   call 3   role sequence      S U A U A U S

controlled by the episode (set deliberately, so the branch IS under test):
  - env.customer_tier==premium = true (the episode held env.customer_tier at "premium")
```

Three things changed to make that work:

- **Conditions resolve from the episode's assignment.** They used to throw, and because the
  throw escaped the whole `evaluate` call, a single unresolvable `If` discarded every shape
  verdict for that request. An undecidable condition now defaults to false and says so.
- **`@T` comes from the manifest**, not from the call ordinal. A harness episode driven at
  `@T=3` used to be checked against the spec's `@T=1`.
- **Controlled conditions are listed apart from free ones.** A branch we chose must not be
  able to look like a branch we assumed.

## Requirements

- Docker (default; `--no-sandbox` to run the target directly, at your own risk)
- Python 3.11+ for the runner
- `ANTHROPIC_API_KEY` — for the planning agent, and for `acdl-verify record` if you use it.
  Binding discovery can instead run on a Claude subscription with
  `--transport claude-cli`, which needs no key. During checking **the target agent never
  reaches a real model**; its calls are answered locally.

## Quickstart

```bash
acdl-verify \
  --target ~/src/some-agent \
  --spec   ~/out/some-agent/SomeAgent.acdl \
  --run    'python -m someagent --input {input}'
```

Discovery, scenario planning, recording, checking, and reporting run in that order. Results
land in `out/<target-name>/`.

To check a plan before spending anything:

```bash
acdl-verify --target ~/src/some-agent --spec SomeAgent.acdl --plan-only
```

## The drive command

The one thing no tool can infer about an arbitrary agent is **how to run one episode of it**.
`--run` supplies that. It is a shell command, executed with the target as the working
directory, with placeholders substituted:

| Placeholder | Replaced with |
|-------------|---------------|
| `{input}` | the scenario's user input, shell-quoted |
| `{input_file}` | path to a file containing that input |
| `{workdir}` | a scratch directory, fresh per scenario |

```bash
--run 'python -m someagent --input {input}'
--run 'node dist/cli.js --prompt-file {input_file} --cwd {workdir}'
--run 'pytest tests/test_agent.py::test_full_loop -q'      # drive through its own tests
```

Multi-turn agents that read stdin instead take `--turns-stdin`, and each scenario's inputs are
fed one per line.

Discovery proposes a `--run` value by reading the target's entrypoints and README; it is
printed for confirmation before anything executes. If discovery cannot find one, `acdl-verify`
stops and asks rather than guessing.

## How recording works

The target's HTTP calls are answered by a local recording proxy. In the default scripted
mode it **never forwards upstream**:

```
target agent ──▶ localhost:8931 ──▶ [ record request + manifest ]
                                 ◀── [ scripted reply, in the target's own dialect ]
```

The target is launched with `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` /
`GOOGLE_GEMINI_BASE_URL` pointed at the proxy, plus a dummy API key. **All** of them are
redirected even when only one provider is in play, so a stray call to a second provider
lands in the trace instead of escaping to the network. Clients that hardcode their host are
caught by `HTTPS_PROXY` and an injected CA certificate instead; a Python import shim that
patches the SDK client classes is the last fallback. *(Neither fallback is built yet.)*

Only record mode holds a real credential, and the target never sees it: the request arrives
carrying the dummy key, and the proxy substitutes the real one on the way out. The provider
a request speaks is detected from its path and body, and forwarding a request to an origin
belonging to a *different* provider is refused rather than attempted.

Three consequences worth noting:

- **Language-agnostic.** A Node, Go, or Rust agent records the same way a Python one does.
- **No source edits to the target**, so a spec can be verified against an unmodified checkout.
- **The wire bytes are what get checked**, including everything the SDK added that the source
  never mentions — serialized tool schemas, `cache_control` markers, default preambles. These
  are exactly the things an extracted spec tends to miss.

### Scripted replies are a driver, not a stub

Because the proxy composes the replies, it decides where the agent's loop goes:

```yaml
# scenarios/S4-tool-loop-depth-2.yaml
input: "summarize the auth module"
replies:
  - {stop_reason: tool_use, tool: read_file, input: {path: "auth.py"}}
  - {stop_reason: tool_use, tool: grep,      input: {pattern: "login"}}
  - {stop_reason: end_turn, text: "done"}
```

Three replies drive three iterations, so one run records `@T=1,2,3` of the tool loop. This is
how substep bounds, retry paths, malformed-tool-argument handling, and compaction thresholds
get reached — none of which you can reliably provoke by asking a real model nicely.

It also enables a check that needs no configuration at all: **prefix monotonicity**. Within
one episode, call *k*'s message array must equal call *k−1*'s plus exactly the delta the spec
predicts. Silent history rewriting — truncation, tool-result trimming, a system message
mutated in place — shows up immediately.

### Responders

A reply has to clear two bars: it must **parse**, and it must **keep the episode alive**. It
does not have to be a good answer. Nothing in ACDL depends on whether the agent plays well —
message count at step `@T` is a function of how many steps ran and how many tool calls each
emitted, not of what any of them said.

The exception is a spec that branches on the model's own output (`Switch resp.action_type[@t]`).
There the value is exactly what is under test, and each arm must be emitted deliberately —
an argument for scripting rather than against it, since a live model supplies whichever arm it
feels like.

Each scenario names a `responder`. In rough order of effort:

| Responder | How it answers | Good for |
|-----------|----------------|----------|
| `constant` | one fixed reply, repeated | agents where a legal no-op (`look`, `wait`) advances the loop forever |
| `script` | a hand-written list of replies | short, known trajectories; deliberate branch selection |
| `replay` | replays a previously recorded real episode | agents whose loop only goes deep if the model plays competently |
| `policy` | a small function that reads the incoming request and returns a legal action | large action spaces, long episodes, robustness to divergence |
| `live` | a real model at `temperature: 0` | last resort; not reproducible, so the nondeterminism baseline must be run |

### Conditions on the model's own output

A spec may branch on what the model said:

```acdl
If resp.action[@T] == "move up" { INSTRUCTION1  env.var1[@T] }
ElseIf resp.action[@T] == "jump" { INSTRUCTION2  env.var2[@T] }
Else { INSTRUCTION3  env.var3[@T] }
```

These are the *cheapest* conditions to verify, not the most expensive. A condition on `env.*`
requires discovering how to push a value through the target's input surface; a condition on
`resp.*` reads the string the proxy just emitted, so the control is direct and needs no
binding map on the input side.

The effect appears in the following request, and prefix monotonicity isolates it: request
*k+1* begins with request *k*, so the appended **delta** is exactly what the branch produced.
One episode covers every arm by cycling replies:

```yaml
replies:
  - {action: "move up"}   # → delta of request 2 should be branch 1
  - {action: "jump"}      # → delta of request 3 should be branch 2
  - {action: "crouch"}    # → delta of request 4 should be branch 3
```

The claim under test is that the action space **partitions** the way the spec says. Four
properties, all checkable from the deltas alone at Level A:

- the arms' deltas differ from one another (otherwise the branch is fictional)
- each arm's delta is stable when its action is repeated at different steps
- **every unlisted action collapses to the `Else` delta** — probe with several ("crouch",
  "wave", "xyzzy"); one that instead matches a named arm's delta means the real condition is
  broader than the spec says and a `Case` is missing
- polarity is right: an arm's content appears when its action was emitted, not otherwise

Cycling within one episode is only sound when taking a branch has no lasting effect on later
context. Where it might, the arms are run as separate episodes from a common recorded state.

**The `Else` trap.** An unrecognized action may never reach `Else` — it may raise, and be
caught by an error path whose context looks plausible. Coverage instrumentation is what
separates "reached the else branch" from "reached an exception handler"; without it this test
yields confident false `CONFIRMED` verdicts.

### Record and replay

For agents where the model's choices genuinely drive the episode — a game player, a planner
whose next observation depends on the action taken — the proxy runs in two modes:

```bash
# once: forwards to the real API, saves request AND response
bun run acdl-verify/proxy.ts --base-url https://api.anthropic.com \
    --out traces/deep-game.jsonl --run '...'

# thereafter: answers from the recording, offline and deterministic
bun run acdl-verify/proxy.ts --replay traces/deep-game.jsonl --run '...'
```

Replay serves the recorded bytes back untouched — including an SSE stream, which is kept
raw for exactly this reason — so it needs no knowledge of the provider's format.

Record mode is the only mode that contacts a provider, uses your API key, or costs money, and
it is opt-in per scenario. What it captures is a genuine model-quality episode — reaching
whatever turn depth, compaction threshold, or tool nesting a real run reaches — which is then
replayable byte-for-byte as often as the checker needs.

**Where replay strains.** Level C perturbs an input by design, so the agent's requests diverge
from the recording and saved reply *k* may answer a question no longer being asked. Three
things keep this workable:

- most Level C perturbations are structural context variables (tier, compaction state, a
  memory file's presence) and do not change what a legal next action is
- divergence is **detected**, not papered over: the proxy compares each incoming request
  against the recorded one and reports any difference beyond the deliberately injected variable
- on divergence the scenario can fall back to a `policy` responder, or be re-recorded

A branch reachable only when the model plays *well* and that survives none of the above is
reported `UNCONTROLLABLE`. Where the target supports loading a saved state, starting the
episode near the branch is usually cheaper than playing to it.

## Scenarios

Scenarios are derived from the spec's own structure, so coverage is defined by the spec rather
than guessed:

- **Index coverage** — `@T ∈ {1, 2, 3}` at minimum, to separate the first-turn special case
  from steady state; `@T.I ∈ {0, 1, 2}` where substeps exist.
- **Loop boundaries** — 0, 1, and many iterations. The 0/1 boundary is precisely where
  `range(1, @T)` and `range(1, @T+1)` diverge.
- **Branch coverage** — both polarities of every `If`; every `Case` plus `Default`. Compound
  conditions joined by `&` / `|` get one scenario per sub-condition, so each is shown to
  independently determine the outcome.
- **`PromptEndsHere`** — condition true and false.

Every scenario runs **twice unchanged first**. Anything that differs between those two runs is
nondeterminism — timestamps, uuids, set ordering — and is masked out of every later
comparison. Skip this and every causal diff is untrustworthy.

Level C then runs **paired ablations**: two runs identical except for one controlled variable,
with the predicted delta computed from the spec. Coverage instrumentation (`coverage.py`, or
the proxy's own call fingerprints for non-Python targets) acts as the positive control — when
a trace does *not* change, it distinguishes "the spec invented a branch" from "the
perturbation never reached the branch." Without it, that ambiguity produces false refutations.

## Verdicts

Per claim, one of:

| Verdict | Meaning |
|---------|---------|
| `CONFIRMED` | predicted and observed agree, and the relevant code path was shown to execute |
| `REFUTED` | a counterexample exists; the report carries the minimal reproducing scenario and a message-level diff |
| `UNEXERCISED` | no scenario distinguished this claim from its negation — not evidence either way |
| `UNCONTROLLABLE` | no input could be constructed to reach it (a config-gated branch, an unreachable error path) |

Each verdict is stamped with the **tier** at which it was reached:

| Tier | How |
|------|-----|
| `static` | no execution — the spec was independently re-derived from the code and structurally diffed |
| `harnessed` | the target's message-building function called directly with synthetic state |
| `stubbed` | the full agent loop, real control flow, scripted model replies |

A `CONFIRMED@static` claim and a `CONFIRMED@stubbed` claim are not the same evidence, and the
report never conflates them.

### Are the scenarios any good?

A scenario set that passes everything may simply be too weak to fail. After checking,
`acdl-verify` mutates the **spec** — flips a condition, shifts a loop bound by one, changes a
role, splits a braced block into separate messages — and re-checks each mutant against the
traces already recorded. A mutant that still passes marks a region the scenarios cannot
discriminate, and every claim in that region is downgraded to `UNEXERCISED`.

The report carries the resulting score (`19/24 mutants killed`) and lists the survivors. This
costs no additional execution; it is a re-check of recorded JSONL.

## Outputs

Written to `out/<target-name>/`:

| File | Contents |
|------|----------|
| `<Agent>.verified.acdl` | the input spec, annotated per line: `// ✓ CONFIRMED@stubbed (S2,S7)`, `// ✗ REFUTED: …`, `// ? UNEXERCISED`. Still valid ACDL, so it renders and diffs with the main toolchain |
| `verification-report.md` | claim table, refutations with minimal repros, mutation score, unspecified-structure list, uncontrollable claims |
| `traces/*.jsonl` | every recorded request, verbatim — the evidence, re-checkable without re-running |
| `scenarios/*.yaml` | the generated scenarios, editable and re-runnable by hand |
| `harness/` | the proxy config and launch scripts, so a human can reproduce any single run |

Render the annotated spec:

```bash
npm run cli -- verified.html out/<target-name>/<Agent>.verified.acdl
```

## Sandboxing

`acdl-verify` executes code you may not have written. This is the one hard difference from
`acdl-agent`, which is read-only by construction.

Default posture:

- the target runs in a container, with the checkout mounted read-only and a writable scratch
  overlay
- **no network egress** — which also guarantees no model call escapes to a real provider, and
  no API key of yours is exercised by the target. `acdl-verify record` is the sole exception,
  and it allows exactly one destination: the model provider's host
- CPU, memory, and wall-clock caps per scenario
- the planning agent stays outside the container and never has shell access to the target

`--no-sandbox` exists for targets that will not containerize. It prints a warning naming the
commands about to run.

## What it cannot verify

Stated up front, because these are the honest limits:

- **Text content of templates.** `INSTRUCTIONS` is opaque by design. `acdl-verify` checks that
  a fixed string is present in the right position and does not vary across runs — it has no
  opinion on whether the string is the right one.
- **Anything requiring a real model's judgment.** Scripted replies mean model-dependent
  control flow is explored where you point it, not where a real model would go. A branch a
  real model never takes still gets verified; that is a feature for coverage and a caveat for
  realism. The `replay` responder narrows the gap — the episode really was played by a model —
  at the cost of one paid run per recorded scenario.
- **Non-HTTP model access** — an in-process local model, or an SDK using a custom transport.
  The Python import shim covers some of these; a fully embedded runtime is out of scope.
- **Statistical claims.** Nothing here is a proof. A `CONFIRMED` claim is one that resisted the
  experiments that were run.

## Options

| Flag | Default | Notes |
|------|---------|-------|
| `--target` | current directory | codebase to verify against |
| `--spec` | *required* | the `.acdl` file under test |
| `--run` | inferred, then confirmed | drive command for one episode |
| `--report` | — | `extraction-report.md` from `acdl-agent`; its `file:line` evidence table tells the planner where to intervene |
| `--level` | `C` | stop after `A` or `B` to skip binding discovery |
| `--scenarios` | generated | path to hand-written scenarios, used instead of generated ones |
| `--responder` | `script` | default responder for generated scenarios: `constant`, `script`, `replay`, `policy`, `live` |
| `--recordings` | `recordings/` | where `acdl-verify record` writes, and `replay` reads |
| `--mutate` / `--no-mutate` | on | spec mutation scoring |
| `--sandbox` / `--no-sandbox` | on | container isolation |
| `--timeout` | `120s` | per scenario |
| `-o, --out` | `out/<target-name>/` | |
| `--plan-only` | off | print discovery results and the scenario plan, execute nothing |

## Design notes

**The checker is deterministic; the model only sets up experiments.** Conformance is decided
by evaluating the parsed spec into a predicted message array and comparing it to the recorded
one — reusing [`src/parser.ts`](../src/parser.ts) and [`src/diff.ts`](../src/diff.ts). A model
that judged conformance directly would be plausibly wrong in exactly the cases that matter,
and would defeat the point of having a formal spec at all.

**Checking is a satisfiability question, not a match.** Where a scenario fixes every branch,
the predicted array is compared directly. Where it does not — a passively recorded trace, an
uncontrollable variable — the checker instead asks whether *any* assignment of the free
branch variables yields the observed array. No satisfying assignment refutes the spec
regardless of bindings; several satisfying assignments mean the trace does not discriminate
those branches, which is `UNEXERCISED` rather than `CONFIRMED`.

**Refutations are corrections.** Each `REFUTED` claim carries the observed structure alongside
the predicted one, in ACDL. Feeding the report back to `acdl-agent` closes the loop, and
iterating to a fixpoint is the intended workflow rather than a one-shot audit.
