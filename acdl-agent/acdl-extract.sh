#!/usr/bin/env bash
#
# acdl-extract.sh — run the ACDL extraction through Claude Code instead of the
# Anthropic SDK, so it bills your Claude subscription rather than API credits.
#
# Uses the same two prompt files as acdl-agent.py (acdl-language.md and
# extraction-prompt.md); only the tool surface differs, since Claude Code
# supplies Read/Grep/Glob/Write itself.
#
#   ./acdl-extract.sh --target ~/src/some-agent
#   ./acdl-extract.sh --target ../MintAgent/mint-bench -o out/mint
#   ./acdl-extract.sh --target ~/src/some-agent --dry-run
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LANGUAGE_REF="$SCRIPT_DIR/acdl-language.md"
TASK="$SCRIPT_DIR/extraction-prompt.md"

TARGET=""
OUT=""
MODEL="opus"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)  TARGET="$2"; shift 2 ;;
    -o|--out)  OUT="$2";    shift 2 ;;
    --model)   MODEL="$2";  shift 2 ;;
    --dry-run) DRY_RUN=1;   shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *)         TARGET="$1"; shift ;;
  esac
done

[[ -z "$TARGET" ]] && TARGET="$PWD"
TARGET="$(cd "$TARGET" && pwd)" || { echo "error: no such directory" >&2; exit 1; }
[[ -z "$OUT" ]] && OUT="$SCRIPT_DIR/out/$(basename "$TARGET")"
# Absolute, so the prompt and the final listing survive the `cd "$OUT"` below.
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac

for f in "$LANGUAGE_REF" "$TASK"; do
  [[ -f "$f" ]] || { echo "error: missing prompt file: $f" >&2; exit 1; }
done

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
  printf 'target : %s\noutput : %s\nmodel  : %s\n' "$TARGET" "$OUT" "$MODEL"
  printf '\n'
  printf 'system prompt: %s chars\n\n' "$(printf '%s' "$SYSTEM" | wc -c)"
  printf 'would run:\n  cd %q\n  claude -p <prompt> \\\n    --append-system-prompt <system> \\\n    --add-dir %q \\\n    --model %s \\\n    --allowedTools Read Grep Glob Write \\\n    --permission-mode acceptEdits\n\n' "$OUT" "$TARGET" "$MODEL"
  printf -- '--- first user message ---\n%s\n' "$PROMPT"
  exit 0
fi

mkdir -p "$OUT"
cd "$OUT"   # cwd is the output dir; the target is read-only via --add-dir

CLAUDE_ARGS=(-p "$PROMPT"
  --append-system-prompt "$SYSTEM"
  --add-dir "$TARGET"
  --model "$MODEL"
  --allowedTools Read Grep Glob Write
  --permission-mode acceptEdits)

claude "${CLAUDE_ARGS[@]}"

echo
echo "output dir: $OUT"
ls -1 "$OUT" 2>/dev/null | sed 's/^/  /'
