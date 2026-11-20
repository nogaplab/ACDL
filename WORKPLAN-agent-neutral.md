The project is already conceptually agent-neutral; the agent-specific parts are mostly documentation, filenames, and workflows. I’d separate the repository into:

1. A canonical, vendor-neutral maintenance contract.
2. Thin adapters for Claude Code, Codex, and other agents.
3. Provider-specific extraction runners kept clearly optional.

Recommended structure:

```text
AGENTS.md                         # canonical instructions for coding agents
CONTRIBUTING.md                   # human + agent contribution workflow
docs/
  architecture.md
  maintenance.md
  acdl-language.md
  agent-guides/
    acdl-to-code.md               # generic implementation guide
    acdl-syntax-repair.md         # generic syntax-repair procedure
  adapters/
    claude-code.md
    codex.md
.claude/
  agents/
    acdl-syntax.md                # thin Claude adapter
acdl-agent/
  runners/
    anthropic-sdk/
    claude-code-cli/
    openai-api/
```

### 1. Create `AGENTS.md` as the canonical entry point

Codex commonly discovers `AGENTS.md`; other coding agents can also read it explicitly. Put stable project rules there:

```md
# Repository instructions

## Project purpose

ACDL describes the structure of prompts and agent contexts. It does not contain
the actual natural-language prompt text.

## Before changing code

- Read the relevant source and tests.
- Preserve the meaning of `.acdl` specifications.
- Run the smallest relevant test or checker.
- Do not edit generated files directly.

## Validation

```bash
npm install
npm test
npm run check -- ACDL_examples/**/*.acdl
```

For a single specification:

```bash
npm run check -- path/to/file.acdl
```

## Website changes

Edit `website/content/` or `website/templates/`, never generated files under
`website/src/`.

## ACDL syntax repairs

Syntax repair may change punctuation, braces, or spelling, but must not add,
remove, reorder, or reinterpret the specification’s semantic content.

Always run the checker after editing.
```

You can add more detailed guidance under `docs/maintenance.md`, keeping `AGENTS.md` short enough to be reliably loaded into context.

### 2. Rename the generic skill

`acdl-tests/acdl-skill.md` is useful, but its current identity is tied to Claude Code. Rename or copy it as:

```text
docs/agent-guides/acdl-to-code.md
```

Change:

```md
# ACDL to Code Implementation Skill
```

to something like:

```md
# ACDL-to-Code Implementation Guide

This guide is written for coding agents. It is compatible with Claude Code,
Codex, OpenCode, Cursor, and agents using an API directly.
```

Replace instructions such as:

```md
Open a fresh Claude Code session
Attach @acdl-skill.md
```

with:

```md
Give the agent this guide and the relevant `.acdl` specification, either by
opening the file, attaching it, or referencing it in the agent’s context.
```

The actual mapping tables and implementation patterns are already largely generic.

### 3. Keep Claude and Codex files as adapters

Do not delete `.claude/agents/acdl-syntax.md`; Claude-specific agent metadata is useful. Make it a small wrapper that points to the generic procedure:

```md
---
name: acdl-syntax
description: Repair ACDL syntax without changing its meaning.
tools: Read, Edit, Bash, Grep, Glob
---

Follow `docs/agent-guides/acdl-syntax-repair.md`.

Use the repository checker:

```bash
npm run check -- path/to/file.acdl
```

Apply the smallest syntax-only edits, rerun the checker, and report the result.
```

The detailed rules should live in `docs/agent-guides/acdl-syntax-repair.md`, not only in the Claude agent definition.

For Codex, the normal entry point should be `AGENTS.md`. If you want a Codex-specific helper, add:

```text
docs/adapters/codex.md
```

but avoid making `.codex/` the source of truth.

### 4. Generalize the README

The README currently contains several direct Claude references:

- `.claude/agents/acdl-syntax.md`
- “Ask Claude Code…”
- `acdl-tests` described as Claude Code tests
- the website page called “Claude Code Skill”

Change the main README to say:

```md
To repair syntax automatically, give the agent
`docs/agent-guides/acdl-syntax-repair.md` and ask it to fix a specific `.acdl`
file. Claude Code, Codex, and other coding agents can use the same procedure.
```

Move Claude-specific usage into a separate section or document:

```text
docs/adapters/claude-code.md
```

Likewise, rename the public resource from:

```text
claude-code-skill.md
```

to:

```text
acdl-to-code.md
```

The Claude page can remain as a compatibility redirect or provider-specific page.

### 5. Separate the language from the extraction implementation

`acdl-agent/` currently mixes generic ACDL concepts with Anthropic/Claude implementation details:

- `acdl-agent.py` uses the Anthropic SDK.
- `acdl-extract.sh` requires the Claude CLI.
- The default model is `claude-opus-5`.
- Several files describe Claude-specific tool behavior.

A cleaner arrangement would be:

```text
acdl-agent/
  core/
    acdl-language.md
    extraction-prompt.md
    output-schema.md
  runners/
    anthropic-sdk/
      run.py
    claude-code-cli/
      run.sh
    openai-api/
      run.py
```

Then describe the runner contract generically:

```md
Every runner must provide:

- read-only access to the target repository;
- the same extraction prompt;
- the same ACDL language reference;
- the same output files;
- provider/model metadata in the extraction report.
```

This lets Claude, Codex, OpenAI API, and local-model runners produce comparable output.

### 6. Make the test suite agent-neutral

Change `acdl-tests/README.md` from:

```md
A comprehensive test suite for evaluating Claude Code's ability...
```

to:

```md
A conformance suite for evaluating an agent’s ability to translate ACDL into
working Python message-building code.
```

Add a standard test protocol:

```md
Each implementation must receive:

1. `docs/agent-guides/acdl-to-code.md`
2. One test specification from `test-cases.md`
3. The standard generation request

The evaluator may use any coding agent or API provider.
```

You can then add provider-specific result directories:

```text
acdl-tests/results/
  claude/
  codex/
  openai-api/
```

### 7. Use provider-neutral terminology

Some useful replacements:

| Current | More generic |
|---|---|
| Claude Code skill | ACDL implementation guide |
| Claude agent | coding agent |
| attach the skill | provide the guide in context |
| Claude CLI | provider-specific CLI runner |
| Claude model | configured model |
| `.claude/agents` | agent adapter |
| `acdl-extract.sh` | Claude Code extraction runner |

Keep the provider name when it describes a real implementation detail. The goal is not to erase Claude; it is to stop Claude from being the implicit default everywhere.

### 8. Fix onboarding inconsistencies while doing this

I noticed a few things that can confuse any coding agent:

- The README says the project uses Bun, but several commands are presented as `npm run`.
- `package.json` references `acdl-verify/pipeline.ts`, but that file does not appear to exist.
- The README references `.claude/agents/acdl-syntax.md` as if it were the only supported maintenance path.
- The website navigation and page are still explicitly named `claude-code-skill`.
- Generated files under `website/src/` and `acdl-agent/out/` should be clearly labeled as generated or excluded from ordinary maintenance.

Agents work much better when the documented commands are tested literally. I would add a short CI or smoke-test section that verifies:

```bash
npm test
npm run check -- ACDL_examples/**/*.acdl
npm run build:content
```

The highest-value change is therefore:

```text
AGENTS.md
docs/agent-guides/acdl-to-code.md
docs/agent-guides/acdl-syntax-repair.md
docs/adapters/claude-code.md
docs/adapters/codex.md
```

Then make `.claude/agents/acdl-syntax.md`, the website page, and any future provider integrations thin wrappers around those canonical documents.
