#!/usr/bin/env bash
#
# acdl-extract.sh — run the ACDL extraction through Claude Code instead of the
# Anthropic SDK, so it bills your Claude subscription rather than API credits.
#
# Uses the same two prompt files as acdl-agent.py (acdl-language.md and
# extraction-prompt.md); only the tool surface differs, since Claude Code
# supplies Read/Grep/Glob/Write itself.
#
# The full run is captured alongside the deliverables — see format-run.mjs for
# what lands in run.jsonl / run.md / transcript.json, and for the one thing
# this path cannot capture (the model's reasoning, which Claude Code strips).
#
#   ./acdl-extract.sh --target ~/src/some-agent
#   ./acdl-extract.sh --target ../MintAgent/mint-bench -o out/mint
#   ./acdl-extract.sh --target ~/src/some-agent --dry-run
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LANGUAGE_REF="$SCRIPT_DIR/acdl-language.md"
TASK="$SCRIPT_DIR/extraction-prompt.md"
FORMATTER="$SCRIPT_DIR/format-run.mjs"

TARGET=""
OUT=""
MODEL="opus"
EFFORT="high"
BUDGET=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)     TARGET="$2"; shift 2 ;;
    -o|--out)     OUT="$2";    shift 2 ;;
    --model)      MODEL="$2";  shift 2 ;;
    --effort)     EFFORT="$2"; shift 2 ;;
    --max-budget-usd) BUDGET="$2"; shift 2 ;;
    --dry-run)    DRY_RUN=1;   shift ;;
    -h|--help)    sed -n '2,18p' "$0"; exit 0 ;;
    *)            TARGET="$1"; shift ;;
  esac
done

[[ -z "$TARGET" ]] && TARGET="$PWD"
TARGET="$(cd "$TARGET" && pwd)" || { echo "error: no such directory" >&2; exit 1; }
[[ -z "$OUT" ]] && OUT="$SCRIPT_DIR/out/$(basename "$TARGET")"
# Absolute, so the prompt and the final listing survive the `cd "$OUT"` below.
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac

# Under Git Bash the CLI is a native Windows binary: it cannot read the
# /c/Users/... form, and the copies embedded in the prompt text are too long
# for MSYS to rewrite on its own. Hand it C:/Users/... instead, which both
# shells accept.
if command -v cygpath >/dev/null 2>&1; then
  TARGET="$(cygpath -m "$TARGET")"
  OUT="$(cygpath -m "$OUT")"
fi

for f in "$LANGUAGE_REF" "$TASK" "$FORMATTER"; do
  [[ -f "$f" ]] || { echo "error: missing file: $f" >&2; exit 1; }
done

# The CLI is not always on PATH — a VS Code install keeps it inside the
# extension directory. Prefer $CLAUDE_BIN, then PATH, then the newest extension.
find_claude() {
  if [[ -n "${CLAUDE_BIN:-}" ]]; then printf '%s' "$CLAUDE_BIN"; return; fi
  if command -v claude >/dev/null 2>&1; then printf '%s' "$(command -v claude)"; return; fi
  local candidate
  candidate="$(ls -d "$HOME"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude* 2>/dev/null | sort -V | tail -1)"
  [[ -n "$candidate" ]] && printf '%s' "$candidate"
}

CLAUDE="$(find_claude)"
[[ -n "$CLAUDE" ]] || { echo "error: claude CLI not found; set CLAUDE_BIN" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "error: node not found (needed to capture the run)" >&2; exit 1; }

# Working instructions differ from acdl-agent.py's only in the tool names:
# Claude Code provides these rather than the script's custom read-only set.
read -r -d '' WORKING <<'EOF' || true
=================== WORKING INSTRUCTIONS ===================

Use Read, Grep, and Glob to explore the target codebase. Read the actual source —
never infer structure from README files or docs. Do not run the code, and do not
modify anything inside the target codebase.

Deliver your results by writing two files into the output directory named below:
  1. The specification, as <AgentName>.acdl
  2. The extraction report, as extraction-report.md

Write only into that output directory. Do not print either deliverable into your
reply instead of writing it — the files are the deliverable. When both files are
written, finish with a short summary: the agent's time model, how many specs you
wrote, and the uncertainties a human should check first.
EOF

SYSTEM="You are an expert at reverse-engineering how LLM agents assemble their context, and at expressing that structure in ACDL.

Below are two documents. The first is the complete ACDL language reference. The second is your task definition. Follow the task definition exactly.

=================== DOCUMENT 1: ACDL LANGUAGE REFERENCE ===================

$(cat "$LANGUAGE_REF")

=================== DOCUMENT 2: YOUR TASK ===================

$(cat "$TASK")

$WORKING"

PROMPT="The target codebase is rooted at $TARGET — treat that directory as the codebase under analysis, and nothing outside it.
Write your two deliverables into $OUT.

Begin the extraction. Work through the phases in your task definition in order, and read the source before drawing conclusions."

if [[ $DRY_RUN -eq 1 ]]; then
  printf 'target : %s\noutput : %s\nmodel  : %s (effort=%s)\nclaude : %s\n' \
    "$TARGET" "$OUT" "$MODEL" "$EFFORT" "$CLAUDE"
  printf '\n'
  printf 'system prompt: %s chars\n\n' "$(printf '%s' "$SYSTEM" | wc -c)"
  printf 'would run:\n  cd %q\n  claude -p <prompt> \\\n    --append-system-prompt-file <tmpfile> \\\n    --add-dir %q \\\n    --model %s --effort %s \\\n    --allowedTools Read Grep Glob Write \\\n    --permission-mode acceptEdits \\\n    --output-format stream-json --verbose \\\n  | node %q -o %q\n\n' \
    "$OUT" "$TARGET" "$MODEL" "$EFFORT" "$FORMATTER" "$OUT"
  printf -- '--- first user message ---\n%s\n' "$PROMPT"
  exit 0
fi

mkdir -p "$OUT"
cd "$OUT"   # cwd is the output dir; the target is read-only via --add-dir

# The assembled system prompt is ~32KB, which overflows the Windows command
# line (CreateProcess caps the whole thing at 32767 chars), so it goes via
# --append-system-prompt-file. The file lives outside both the target and the
# output directory: cwd is the output directory, and the agent has no business
# reading its own prompt back in as if it were evidence. A copy is saved to the
# output directory after the run, for provenance.
SYS_FILE="$(mktemp)"
trap 'rm -f "$SYS_FILE"' EXIT
printf '%s' "$SYSTEM" > "$SYS_FILE"
SYS_FILE_ARG="$SYS_FILE"
command -v cygpath >/dev/null 2>&1 && SYS_FILE_ARG="$(cygpath -m "$SYS_FILE")"

CLAUDE_ARGS=(-p "$PROMPT"
  --append-system-prompt-file "$SYS_FILE_ARG"
  --add-dir "$TARGET"
  --model "$MODEL"
  --effort "$EFFORT"
  --allowedTools Read Grep Glob Write
  --permission-mode acceptEdits
  --output-format stream-json
  --verbose)
[[ -n "$BUDGET" ]] && CLAUDE_ARGS+=(--max-budget-usd "$BUDGET")

META="$(printf '{"target":"%s","out":"%s","model":"%s","effort":"%s"}' \
  "${TARGET//\\/\\\\}" "${OUT//\\/\\\\}" "$MODEL" "$EFFORT")"

echo "target : $TARGET"
echo "output : $OUT"
echo "model  : $MODEL (effort=$EFFORT)"
echo

# The formatter mirrors the stream to run.jsonl line by line, so an interrupt
# still leaves a complete record. Keep the pipeline out of errexit's reach so
# the summary below runs even when the CLI exits non-zero.
set +e
"$CLAUDE" "${CLAUDE_ARGS[@]}" | node "$FORMATTER" -o "$OUT" --meta "$META"
STATUS=${PIPESTATUS[0]}
set -e

# Written only now that the run is over, so it cannot be read back mid-run.
printf '%s' "$SYSTEM" > "$OUT/system-prompt.txt"

echo
if [[ $STATUS -ne 0 ]]; then
  echo "warning: claude exited with status $STATUS — the capture in run.md is still complete"
fi
echo "output dir: $OUT"
ls -1 "$OUT" 2>/dev/null | sed 's/^/  /'
exit "$STATUS"
