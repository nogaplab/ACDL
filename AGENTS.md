# ACDL repository instructions

## Purpose

ACDL describes the structure and assembly of LLM agent context: message roles,
prompt blocks, variables, templates, fragments, loops, and conditions. An ACDL
specification is a claim about context construction; do not silently change its
meaning while fixing syntax or implementation details.

The repository contains:

- src/: the TypeScript parser, checker, renderers, editor, and CLI;
- ACDL_examples/: example specifications;
- acdl-agent/: extraction prompts, runners, language reference, and recorded extraction artifacts;
- acdl-verify/: behavioral verification of a specification against a target;
- acdl-tests/: agent-to-code conformance scenarios and generated examples;
- website/content/ and website/templates/: website sources;
- website/src/: generated website pages;
- extension/: the VS Code extension, with source in extension/src/;
- scripts/: website, standalone bundle, blog, and diff tooling.

## Before changing files

1. Read the relevant source, tests, and documentation before editing.
2. Locate the source of truth. Do not edit generated output directly.
3. Preserve existing behavior unless the request explicitly changes it.
4. Keep provider-specific behavior in an adapter or runner; do not make Claude,
   Codex, or OpenCode assumptions part of the ACDL language or shared contract.
5. Keep extraction read-only against the target repository. Extraction output must
   go to an explicit output directory.
6. Make the smallest scoped change, then inspect git diff and git status.
7. Do not add credentials, local checkout paths, transcripts containing secrets,
   or unrelated generated artifacts.

## ACDL syntax changes

For a .acdl syntax repair:

- Use src/acdl-check.ts as the authority.
- Read the relevant section of acdl-agent/acdl-language.md first.
- Make syntax-only edits: do not add, remove, reorder, rename, or reinterpret
  roles, variables, templates, fragments, loops, conditions, or marks.
- Fix the first checker error, rerun the checker, and repeat.
- Do not invent an unbound variable or undefined fragment. Report it as needing
  author input.
- Do not rewrite the whole file for a local syntax problem.

Validate a repaired file with:

    bun run check -- path/to/file.acdl

The existing Claude syntax agent at .claude/agents/acdl-syntax.md is an adapter
for this procedure. Codex and OpenCode should follow the same rules.

## Commands

The repository package scripts are defined in package.json. Bun is the native
runtime for the TypeScript CLI and tests; npm-compatible script invocation exists
in the current documentation, but use Bun for the commands below when available.

Install dependencies:

    bun install

Run the main tests:

    bun test
    bun test src/parser.test.ts
    bun test src/acdl-check.test.ts
    bun test acdl-verify/

Check specifications:

    bun run check -- path/to/file.acdl
    bun run check -- ACDL_examples/**/*.acdl --quiet

Run the CLI and structural diff:

    bun run cli -- output.html path/to/file.acdl
    bun run diff -- a.acdl b.acdl
    node scripts/diff.mjs a.acdl b.acdl --json

Build generated website content and other artifacts:

    bun run build:content
    bun run build:website
    bun run build:standalone
    bun run build:blog
    bun run build:extension

The extension build enters extension/ and currently uses npm scripts there.
Do not assume every script works without its optional toolchain.

Run verification when working on acdl-verify/:

    bun run verify -- --spec path/to/spec.acdl --target path/to/target --run '...'
    bun run verify:test

The verification pipeline may be unavailable in a checkout where acdl-verify/
is ignored or not present; check the path before documenting or invoking it.

## Generated and derived files

Edit these sources, then regenerate:

- Edit website/content/*.md and website/templates/*.html, not generated pages
  under website/src/.
- Edit src/styles.css, then run the CSS sync/build for
  extension/media/preview.css.
- Edit extension source under extension/src/, then build the extension; do not
  hand-edit extension/out/.
- Treat dist/ as build output.
- Treat new acdl-agent/out/<run>/ directories as extraction output. Existing
  checked-in examples are evidence fixtures; do not overwrite them casually.
- Treat acdl-tests/*/ generated Python implementations and
  acdl-tests/minimal-test-results.md as fixtures/results unless the task
  explicitly updates the conformance corpus.

After generation, inspect the diff. Generated files should only change as a
consequence of the source change.

## Extraction code

The current extraction implementation has two distinct provider-specific paths:

- acdl-agent/acdl-agent.py uses the Anthropic SDK and requires an Anthropic credential.
- acdl-agent/acdl-extract.sh uses the Claude Code CLI and
  acdl-agent/format-run.mjs captures its stream.

The shared extraction inputs are acdl-agent/acdl-language.md and
acdl-agent/extraction-prompt.md. Keep their semantics stable while adding
Codex or OpenCode adapters. Do not duplicate or fork the extraction task for a
provider.

For extraction work:

- preserve the evidence table and uncertainty reporting;
- preserve the annotated .acdl as the auditable specification;
- keep provider, model, runner, and version metadata explicit;
- ensure target-repository access is read-only;
- write artifacts only under the requested output directory; and
- provide a dry-run or deterministic fixture path when live credentials are
  not available.

Provider event formats and tool names belong in runner adapters and formatter
fixtures, not in the canonical ACDL contract.

## Documentation and handoff

When changing behavior or workflows, update the relevant README or source
documentation. Use provider-neutral language for shared procedures and name
Claude, Codex, or OpenCode only when describing a real adapter limitation.

Before handing off:

- report the files changed and why;
- report the focused checks and their results;
- mention any full-suite or live-provider checks that were not run;
- call out assumptions, generated artifacts, and unresolved author decisions.

Never claim a check passed unless it was actually run.

