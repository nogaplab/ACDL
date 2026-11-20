# Workplan: make ACDL maintainable with Codex and OpenCode

## Objective

Make both the ACDL repository and its extraction tool usable from Codex and
OpenCode, while retaining the existing Claude-based workflows where useful.

The target is not merely provider-neutral wording. The repository should have
one authoritative maintenance contract, one authoritative extraction contract,
and small adapters for each supported agent. A Codex or OpenCode session must
be able to discover the rules, inspect the codebase, make a scoped change, run
the right checks, and leave an auditable result without relying on Claude-only
metadata or commands.

## Success criteria

- A fresh Codex session and a fresh OpenCode session can discover project
  instructions from the repository itself.
- The same maintenance task has the same safety rules, validation commands,
  and expected report regardless of the agent used.
- Extraction is runner-independent: the ACDL language, extraction task,
  evidence requirements, output schema, and validation are shared.
- Claude, Codex, and OpenCode integrations are adapters, not competing sources
  of truth.
- A provider or model can be changed without changing the ACDL contract or
  report format.
- Documentation and tests distinguish source files from generated artifacts.

## Known gaps to fix in this branch

The initial inventory found these concrete gaps. They are the implementation
backlog for this branch:

- No root `AGENTS.md` existed. A unified file must now be the canonical
  maintenance entry point for Codex and OpenCode, with Claude-specific files
  acting only as adapters.
- There is no shared maintenance guide or generic ACDL-to-code guide. The
  useful rules currently live in Claude-oriented README, skill, and agent
  files and must be consolidated without changing their meaning.
- The syntax-repair procedure exists only as `.claude/agents/acdl-syntax.md`.
  Codex and OpenCode need equivalent discoverable entry points that delegate to
  the same rules and checker.
- `acdl-agent/acdl-agent.py`, `acdl-agent/acdl-extract.sh`, and
  `acdl-agent/format-run.mjs` are coupled to Anthropic or Claude Code. There is
  no runner contract, shared metadata schema, or Codex/OpenCode adapter.
- The current extraction outputs are not standardized: existing runs use
  target-specific filenames, and there is no required `metadata.json` or
  provider-independent completion/error contract.
- The Claude stream formatter has no Codex/OpenCode event fixtures or
  deterministic cross-runner tests. Path safety, output validation, and
  malformed-result handling are not covered by a shared test suite.
- The extraction documentation and examples describe Claude as the default,
  while checked-in OpenCode artifacts already exist. Documentation must reflect
  the actual multi-runner target.
- `acdl-tests/README.md` and `test-cases.md` describe Claude Code rather than a
  general coding-agent conformance workflow.
- The command documentation mixes npm and Bun even though the root scripts use
  Bun for the CLI, checker, and tests. Commands must be verified against
  `package.json` and documented consistently.
- Generated and fixture boundaries are not consistently documented for
  `extension/out/`, `acdl-agent/out/`, and generated conformance results. The
  maintenance contract must identify what may be regenerated and what must not
  be overwritten casually.

These gaps do not authorize unrelated cleanup. Preserve existing behavior and
record any compatibility decision in the implementation or handoff.

## Explicitly out of scope

Website generation, website navigation, website content renaming, and website
build/deploy changes are not goals of this branch. Do not add website work to
the implementation sequence or regenerate `website/src/`. Only update website
files if a later, separately scoped task explicitly requests it.

## 1. Establish the repository contract

Keep the new root `AGENTS.md` as the canonical entry point for coding agents
and revise it as the shared contract becomes more precise. It should cover:

- what ACDL represents and what it must not contain;
- the source/generated-file boundary;
- required read-before-edit behavior;
- syntax-preserving rules for `.acdl` changes;
- supported validation commands;
- how to report changed files, tests, assumptions, and unresolved questions;
- how to work safely when an agent has different tool names or permissions.

Keep this file short enough for automatic discovery. Put detailed procedures in
`docs/maintenance.md`, not in provider-specific configuration.

Add a clear OpenCode entry point if the repository needs one beyond
`AGENTS.md` (for example, a checked-in OpenCode adapter or configuration
snippet). It must point back to the same canonical instructions. Do not make
`.codex/`, `.opencode/`, or `.claude/` the source of truth.

## 2. Define the maintenance workflow for all agents

Create `docs/maintenance.md` with repeatable procedures for:

1. locating the source of truth before editing;
2. inspecting relevant TypeScript, Python, shell, Markdown, and generated files;
3. changing ACDL syntax without changing semantics;
4. changing parser, renderer, extension, or extraction code;
5. running focused checks before the full suite;
6. reviewing the diff for accidental provider coupling; and
7. recording validation and evidence in the final handoff.

State which commands are optional when Bun, Node, Python, a provider CLI, or an
API credential is unavailable.

Add `docs/agent-guides/acdl-syntax-repair.md` for the narrow syntax-repair
task. Claude, Codex, and OpenCode entry points should all delegate to this
guide.

## 3. Separate generic ACDL knowledge from agent adapters

Move or copy the useful material in `acdl-tests/acdl-skill.md` into a generic
guide such as `docs/agent-guides/acdl-to-code.md`. It should explain how an
agent translates an ACDL specification into working code, including mapping
tables, implementation patterns, and validation expectations.

Replace instructions that assume a fresh Claude session or an attachment with
portable language: the agent must receive the guide, the relevant `.acdl`
file, and repository instructions through whatever context mechanism it
supports.

Keep provider adapters only where they add real value:

```text
docs/adapters/claude-code.md
docs/adapters/codex.md
docs/adapters/opencode.md
.claude/agents/acdl-syntax.md       # Claude metadata, delegates to the guide
```

Each adapter should document discovery, tool/permission differences, the
equivalent command to run checks, and limitations. It must not duplicate the
language rules or maintenance policy.

## 4. Refactor extraction around a stable runner contract

The current `acdl-agent/` implementation is centered on Anthropic and the
Claude CLI. Preserve its behavior, but split shared contract material from
runners:

```text
acdl-agent/
  core/
    acdl-language.md
    extraction-prompt.md
    output-schema.md
    runner-contract.md
  runners/
    anthropic-sdk/
    claude-code-cli/
    codex-cli-or-session/
    opencode-cli-or-session/
  format-run.mjs
  validate-extraction.mjs
```

The exact filenames may follow the existing layout, but the boundaries must be
explicit. Shared extraction inputs must include the ACDL language reference,
task and phase order, read-only/evidence policy, output schema, uncertainty
rules, and validation procedure.

Every runner must accept the same conceptual inputs: target repository, output
directory, model/provider metadata, and dry-run options. Every runner must
produce the same minimum artifacts:

```text
<output>/extracted.acdl
<output>/extraction-report.md
<output>/run.md
<output>/metadata.json
```

`metadata.json` should record runner, provider, model, versions, timestamp,
target revision when available, and exit status. Provider-specific stream
details may be additional data, but must not change the canonical ACDL or
report format.

Extraction must remain read-only against the target repository. Writes belong
in the explicit output directory. This must hold for the Python runner and for
Codex/OpenCode session runners.

## 5. Add Codex and OpenCode extraction paths

Implement the smallest reliable integration for each agent. Prefer a shared
launcher and formatter over duplicating the extraction prompt.

For each runner, document:

- how the target repository is exposed read-only;
- how the shared prompt and language reference are supplied;
- how the output location is enforced;
- how completion and failure are detected;
- how streamed output is captured;
- what reasoning/tool events are unavailable or redacted; and
- how a human can reproduce the run.

Do not assume Codex and OpenCode expose identical CLI flags, tool names,
session formats, or permission controls. Keep those differences inside their
adapters. If an agent cannot safely support direct file writes, use a captured
response plus a deterministic host-side artifact writer.

Add dry-run mode and a provider-independent local validation mode so the
workflow can be tested without credentials or a live agent.

## 6. Make extraction correctness testable

Add tests for the shared contract:

- prompt assembly includes the same language reference and task;
- runner arguments resolve target and output paths safely;
- writes cannot escape the output directory;
- metadata is complete and provider-neutral;
- malformed or incomplete output fails validation clearly;
- the formatter accepts representative Codex and OpenCode event fixtures;
- equivalent fixtures yield equivalent canonical artifacts; and
- extracted `.acdl` passes the normal ACDL checker.

Extend `acdl-tests` into an agent-agnostic conformance suite. Rename its
description and instructions so they refer to a coding agent, not Claude Code.
Keep result directories separated by runner:

```text
acdl-tests/results/
  anthropic-sdk/
  claude-code/
  codex/
  opencode/
```

Live-provider tests should be explicitly opt-in; deterministic tests should run
in ordinary CI.

## 7. Repair documentation and generated-content boundaries

Update the README, `acdl-agent/README.md`,
`acdl-agent/how-it-works.md`, `acdl-tests/README.md`, and
`acdl-tests/test-cases.md` to describe the shared workflow and link to the
canonical guides.

Document `extension/out/`, extraction output, and generated conformance results
where applicable. Do not edit or regenerate website files in this branch.

Resolve onboarding inconsistencies while touching the docs, especially the
actual package manager (`bun` versus `npm`), the existence of referenced
check scripts, and commands that work in a clean checkout.

## 8. Verification and rollout order

Implement in this order:

1. inventory commands, generated files, and Claude-only assumptions;
2. validate and extend `AGENTS.md`, then write the maintenance guide and generic
   implementation guide;
3. define and test the extraction contract and metadata schema;
4. refactor the Python and Claude runners without changing canonical outputs;
5. add Codex and OpenCode adapters and fixture-based formatter tests;
6. update maintenance adapters and repository documentation, excluding the
   website;
7. inspect the final diff without regenerating website output; and
8. run the complete documented verification suite.

The final verification report should include the repository's actual commands,
after checking `package.json`, plus:

- a no-credential dry run for each runner;
- deterministic extraction validation;
- one live Codex smoke test when Codex is available; and
- one live OpenCode smoke test when OpenCode is available.

Do not leave invented commands in the documentation. Existing validation
commands must be tested literally.

## Definition of done

A new contributor can choose Codex or OpenCode, discover the same repository
instructions, perform a normal ACDL maintenance change, and validate it without
Claude-specific knowledge. The same two agents can run extraction and produce
comparable, machine-checkable ACDL, report, run, and metadata artifacts.
Claude support may remain, but it is one adapter among several rather than the
implicit architecture of the project.
