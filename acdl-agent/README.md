# acdl-agent

Points Claude at a codebase that implements an LLM agent and has it produce the **ACDL
specification of that agent's context-creation process** — the structure of the message
array the agent builds before every model call.

| File | What it is |
|------|------------|
| [`acdl-agent.py`](acdl-agent.py) | The runner: read-only file tools + the agent loop |
| [`acdl-language.md`](acdl-language.md) | Complete ACDL reference, loaded into the system prompt |
| [`extraction-prompt.md`](extraction-prompt.md) | The task definition the agent follows |
| [`how-it-works.md`](how-it-works.md) | Full explanation of the pipeline, plus this agent's own context in ACDL |
| [`acdl-agent.acdl`](acdl-agent.acdl) | That spec, standalone — renderable and diffable |

## Install

```bash
python3 -m venv .venv
./.venv/bin/pip install anthropic
export ANTHROPIC_API_KEY=sk-ant-...
```

## Run

The three files above travel together — the prompts are resolved relative to
`acdl-agent.py`, so the directory can be copied or cloned anywhere.

```bash
# Cloned into the target repo as <repo>/acdl-agent/ — analyzes the repo,
# and excludes its own directory so it never reads its own prompts back in.
cd <repo> && python acdl-agent/acdl-agent.py

# Target another checkout from anywhere
python acdl-agent.py --target ~/src/some-agent -o ~/out/some-agent

# Assemble and print the prompt without spending tokens
python acdl-agent.py --target ~/src/some-agent --dry-run
```

With no argument the target is the current directory (or the parent, if you run it from
inside `acdl-agent/` itself).

## Output

Written to `out/<target-name>/` by default, or wherever `-o` points:

| File | Contents |
|------|----------|
| `<AgentName>.acdl` | The specification — one spec per structurally distinct prompt |
| `extraction-report.md` | Evidence table (`file:line` per spec line), abstraction decisions, uncertainties |
| `transcript.json` | Every assistant turn, for auditing how a conclusion was reached |

Render or diff the result with the main ACDL toolchain:

```bash
npm run cli -- out.html out/<target-name>/<AgentName>.acdl
node scripts/diff.mjs a.acdl b.acdl
```

## Options

| Flag | Default | Notes |
|------|---------|-------|
| `--target` | current directory | Codebase to analyze |
| `-o, --out` | `out/<target-name>/` | Where deliverables land |
| `--model` | `claude-opus-5` | |
| `--effort` | `high` | `low` / `medium` / `high` / `xhigh` / `max` |
| `--max-iterations` | `120` | Cap on agent turns |
| `--include-self` | off | Don't exclude this directory from analysis |
| `--dry-run` | off | Print the assembled prompt, make no API call |

## Design notes

**Read-only by construction.** The agent gets `list_dir`, `glob_files`, `grep`, and
`read_file`, all confined to the target root — no shell, no writes, no network. It
delivers results through `write_output`, which can only write plain filenames directly
into the output directory. This matters because the tool is aimed at third-party
codebases you did not write.

**Why not the Claude Agent SDK.** The Agent SDK would supply these tools for free, but
it also brings Bash and Write, requires the Claude Code CLI on the host, and gives less
direct control over the model, effort, and token accounting. The extraction task is
purely read-only, so the narrower surface is the better fit. Nothing here depends on that
choice — swapping in the Agent SDK would mean replacing the tool definitions and the
runner, keeping both prompt files as they are.

**Prompt caching.** The language reference plus task definition is a large, byte-identical
prefix on every run, marked with `cache_control`. Repeat runs read it from cache at ~10%
of input price. Check `cache_read` in the run summary to confirm it is working.
