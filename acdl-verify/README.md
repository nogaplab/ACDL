# acdl-verify

Takes an ACDL specification and the codebase it claims to describe, **runs that codebase**,
and checks that the message arrays it actually sends match what the spec predicts.

Where [`acdl-agent`](../acdl-agent) reads code and writes a spec, `acdl-verify` reads a spec
and tests it against behaviour. The two compose: extract, verify, correct, repeat.

> **Status.** The proxy and Level A checking work end-to-end; everything else below is still
> design. See *What runs today*.

## What runs today

Record a trace by driving a target entirely from a scenario file — no API key, no network:

```bash
bun run acdl-verify/proxy.ts \
  --scenario acdl-verify/scenarios/acdl-agent-loop3.json \
  --out      acdl-verify/traces/acdl-agent-loop3.jsonl \
  --run      '.venv-linux/bin/python acdl-agent/acdl-agent.py --target acdl-tests/test1-supportbot'
```

Check a spec against that trace:

```bash
bun run acdl-verify/check.ts \
  --spec  acdl-agent/acdl-agent.acdl \
  --trace acdl-verify/traces/acdl-agent-loop3.jsonl
```

```
spec   AcdlAgent[@T]  acdl-agent/acdl-agent.acdl:8
trace  3 recorded call(s)

  ✓ CONFIRMED   call 1   message count      2 messages, as predicted
  ✓ CONFIRMED   call 1   role sequence      S U
  ✓ CONFIRMED   call 3   role sequence      S U A T A T
  ✓ CONFIRMED   call 3   prefix preserved   call 3 extends call 2 by 2 message(s)

free choices (taken from the trace, therefore NOT verified):
  - call 3: size of sys.tool_calls[@i] = 1 (collection length is not stated in the spec)
```

| File | What it is |
|------|------------|
| [`proxy.ts`](proxy.ts) | recording proxy: HTTP server, JSONL trace, scripted replies, `--run` driver, `--upstream` record mode |
| [`evaluate.ts`](evaluate.ts) | ACDL AST → predicted message array; reports what it had to leave free |
| [`check.ts`](check.ts) | Anthropic wire→ACDL normalization, Level A verdicts, prefix monotonicity |
| [`scenarios/`](scenarios/) | scripted replies, one file per scenario |

Not yet built: the binding map, Levels B and C, coverage instrumentation, mutation scoring as a
command, the Docker sandbox, streaming support, and the LLM planning layer.

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

Level A alone catches the common failure modes of an extracted spec — an off-by-one loop
bound, a block the extractor split into three messages, a role transcribed wrong.

## Requirements

- Docker (default; `--no-sandbox` to run the target directly, at your own risk)
- Python 3.11+ for the runner
- `ANTHROPIC_API_KEY` — for the planning agent, and for `acdl-verify record` if you use it.
  During checking **the target agent never reaches a real model**; its calls are answered
  locally.

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

The target's HTTP calls are answered by a local recording proxy that **never forwards
upstream**:

```
target agent ──▶ localhost:8931 ──▶ [ record exact request bytes ]
                                 ◀── [ scripted reply from the scenario ]
```

The target is launched with `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` / `GOOGLE_API_BASE`
pointed at the proxy, plus a dummy API key. Clients that hardcode their host are caught by
`HTTPS_PROXY` and an injected CA certificate instead; a Python import shim that patches the
SDK client classes is the last fallback.

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
acdl-verify record --scenario deep-game --run '...'   # once: forwards to the real API,
                                                      # saves request AND response
acdl-verify check  --scenario deep-game               # thereafter: answers from the recording,
                                                      # offline and deterministic
```

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
| `--level` | `C` | stop after `A` or `B` to skip binding-map setup |
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
