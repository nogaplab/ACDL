#!/usr/bin/env python3
"""
acdl-agent — extract the ACDL specification of an agent's context-creation process.

Points Claude at a codebase that implements an LLM agent, gives it a read-only view
of the source, and has it produce:

    <out>/<name>.acdl              the specification
    <out>/extraction-report.md     evidence table, decisions, uncertainties
    <out>/transcript.json          full run transcript (for auditing)

The two prompt files live next to this script and are resolved relative to it, so the
whole `acdl-agent/` directory can be copied or cloned into any codebase you want to
analyze:

    # cloned into the target repo as <repo>/acdl-agent/
    cd <repo> && python acdl-agent/acdl-agent.py

    # or from anywhere
    python acdl-agent.py --target /path/to/some-agent-repo

The script's own directory is always excluded from analysis, so it never reads its
own prompts back in as if they were part of the target codebase.

Requires:  pip install anthropic       and   export ANTHROPIC_API_KEY=...
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

try:
    import anthropic
    from anthropic import Anthropic, beta_tool
except ImportError:
    sys.exit("Missing dependency. Run:  pip install anthropic")


SCRIPT_DIR = Path(__file__).resolve().parent
LANGUAGE_REF = SCRIPT_DIR / "acdl-language.md"
EXTRACTION_PROMPT = SCRIPT_DIR / "extraction-prompt.md"

DEFAULT_MODEL = "claude-opus-5"
DEFAULT_EFFORT = "high"
DEFAULT_MAX_ITERATIONS = 120
MAX_TOKENS = 16000

# Directories never worth reading when reverse-engineering prompt construction.
SKIP_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "__pycache__", ".mypy_cache",
    ".pytest_cache", ".ruff_cache", ".tox", ".venv", "venv", "env",
    "site-packages", "dist", "build", ".next", ".nuxt", "target", "vendor",
    ".idea", ".vscode", ".gradle", ".terraform", "coverage", ".cache",
}
MAX_READ_BYTES = 400_000       # per read_file call, before line slicing
MAX_GREP_FILE_BYTES = 2_000_000
GREP_LINE_CLIP = 300


# --------------------------------------------------------------------------------------
# Sandbox: every path a tool touches is resolved and confined to a root.
# --------------------------------------------------------------------------------------

@dataclass
class Sandbox:
    """Read-only view of the target codebase, plus a write-only output directory."""

    root: Path
    out_dir: Path
    exclude: list[Path] = field(default_factory=list)
    files_read: set[str] = field(default_factory=set)

    def resolve_in_root(self, rel: str) -> Path:
        """Resolve `rel` against the target root, refusing anything that escapes it."""
        candidate = (self.root / rel).resolve()
        if candidate != self.root and self.root not in candidate.parents:
            raise ValueError(f"path escapes the target codebase: {rel}")
        return candidate

    def resolve_in_out(self, name: str) -> Path:
        """Resolve an output filename, refusing subdirectories and traversal."""
        if "/" in name or "\\" in name or name in ("", ".", ".."):
            raise ValueError("filename must be a plain name with no path separators")
        candidate = (self.out_dir / name).resolve()
        if candidate.parent != self.out_dir:
            raise ValueError("filename must resolve directly inside the output directory")
        return candidate

    def is_excluded(self, path: Path) -> bool:
        if any(part in SKIP_DIRS for part in path.parts):
            return True
        return any(path == ex or ex in path.parents for ex in self.exclude)

    def rel(self, path: Path) -> str:
        return path.relative_to(self.root).as_posix()

    def walk(self):
        """Yield every non-excluded file under the root, as absolute paths."""
        for dirpath, dirnames, filenames in os.walk(self.root):
            here = Path(dirpath)
            dirnames[:] = sorted(
                d for d in dirnames
                if d not in SKIP_DIRS and not self.is_excluded(here / d)
            )
            for name in sorted(filenames):
                path = here / name
                if not self.is_excluded(path):
                    yield path


SANDBOX: Sandbox | None = None


def _sb() -> Sandbox:
    assert SANDBOX is not None, "sandbox not initialized"
    return SANDBOX


def _looks_binary(path: Path) -> bool:
    try:
        with path.open("rb") as fh:
            return b"\0" in fh.read(8192)
    except OSError:
        return True


def _read_text(path: Path, limit: int = MAX_READ_BYTES) -> str:
    with path.open("r", encoding="utf-8", errors="replace") as fh:
        return fh.read(limit)


# --------------------------------------------------------------------------------------
# Tools handed to the model. All read-only except write_output.
# --------------------------------------------------------------------------------------

@beta_tool
def list_dir(path: str = ".", max_depth: int = 2) -> str:
    """List files and directories in the target codebase, as an indented tree.

    Use this first to get oriented. Vendored, build, and VCS directories are omitted.

    Args:
        path: Directory relative to the codebase root. Defaults to the root itself.
        max_depth: How many levels to descend. 1 lists only the immediate contents.
    """
    sb = _sb()
    try:
        base = sb.resolve_in_root(path)
    except ValueError as exc:
        return f"error: {exc}"
    if not base.is_dir():
        return f"error: not a directory: {path}"

    lines: list[str] = []
    truncated = False

    def descend(directory: Path, depth: int, indent: str) -> None:
        nonlocal truncated
        if depth > max_depth or len(lines) >= 1000:
            truncated = truncated or len(lines) >= 1000
            return
        try:
            entries = sorted(
                (e for e in directory.iterdir() if not sb.is_excluded(e)),
                key=lambda e: (e.is_file(), e.name.lower()),
            )
        except OSError as exc:
            lines.append(f"{indent}<unreadable: {exc.strerror}>")
            return
        for entry in entries:
            if len(lines) >= 1000:
                truncated = True
                return
            if entry.is_dir():
                lines.append(f"{indent}{entry.name}/")
                descend(entry, depth + 1, indent + "  ")
            else:
                try:
                    size = entry.stat().st_size
                except OSError:
                    size = 0
                lines.append(f"{indent}{entry.name}  ({size:,}b)")

    descend(base, 1, "")
    if not lines:
        return f"(empty: {path})"
    if truncated:
        lines.append("... listing truncated at 1000 entries; narrow `path` or lower `max_depth`")
    return "\n".join(lines)


@beta_tool
def glob_files(pattern: str, max_results: int = 200) -> str:
    """Find files in the target codebase whose path matches a glob pattern.

    Matching is against each file's path relative to the codebase root, so
    "**/*.py" finds Python files at any depth and "src/*.ts" only at that level.

    Args:
        pattern: Glob pattern, e.g. "**/*.py", "**/prompt*", "**/*.jinja".
        max_results: Maximum number of paths to return.
    """
    sb = _sb()
    hits: list[str] = []
    for path in sb.walk():
        rel = sb.rel(path)
        if fnmatch.fnmatch(rel, pattern) or fnmatch.fnmatch(path.name, pattern):
            hits.append(rel)
            if len(hits) >= max_results:
                hits.append(f"... truncated at {max_results} matches")
                break
    return "\n".join(hits) if hits else f"(no files match {pattern!r})"


@beta_tool
def grep(
    pattern: str,
    glob: str = "**/*",
    max_results: int = 100,
    ignore_case: bool = False,
    context: int = 0,
) -> str:
    """Search the target codebase for a regular expression, returning file:line matches.

    This is the main discovery tool: search for things like "messages", "role=",
    "client.messages.create", "SystemMessage", "append", or a template filename.

    Args:
        pattern: Python regular expression.
        glob: Restrict the search to files whose relative path matches this glob.
        max_results: Maximum number of matching lines to return.
        ignore_case: Case-insensitive matching.
        context: Number of lines of context to include before and after each match.
    """
    sb = _sb()
    try:
        rx = re.compile(pattern, re.IGNORECASE if ignore_case else 0)
    except re.error as exc:
        return f"error: bad regex: {exc}"

    out: list[str] = []
    scanned = 0
    for path in sb.walk():
        rel = sb.rel(path)
        if not (fnmatch.fnmatch(rel, glob) or fnmatch.fnmatch(path.name, glob)):
            continue
        try:
            if path.stat().st_size > MAX_GREP_FILE_BYTES or _looks_binary(path):
                continue
        except OSError:
            continue
        scanned += 1
        try:
            lines = _read_text(path).splitlines()
        except OSError:
            continue
        for i, line in enumerate(lines):
            if not rx.search(line):
                continue
            if context > 0:
                lo, hi = max(0, i - context), min(len(lines), i + context + 1)
                out.append(f"{rel}:{i + 1}:")
                for j in range(lo, hi):
                    marker = ">" if j == i else " "
                    out.append(f"  {marker} {j + 1}\t{lines[j][:GREP_LINE_CLIP]}")
            else:
                out.append(f"{rel}:{i + 1}:\t{line[:GREP_LINE_CLIP]}")
            if len(out) >= max_results:
                out.append(f"... truncated at {max_results} matches; narrow the pattern or glob")
                return "\n".join(out)
    if not out:
        return f"(no matches for {pattern!r} in {scanned} files matching {glob!r})"
    return "\n".join(out)


@beta_tool
def read_file(path: str, offset: int = 1, limit: int = 400) -> str:
    """Read a file from the target codebase, with 1-based line numbers.

    Cite evidence in your report using the `path:line` numbers this returns.

    Args:
        path: File path relative to the codebase root.
        offset: 1-based line number to start reading from.
        limit: Maximum number of lines to return.
    """
    sb = _sb()
    try:
        target = sb.resolve_in_root(path)
    except ValueError as exc:
        return f"error: {exc}"
    if not target.is_file():
        return f"error: not a file: {path}"
    if sb.is_excluded(target):
        return f"error: path is excluded from analysis: {path}"
    if _looks_binary(target):
        return f"error: binary file, not readable as text: {path}"

    try:
        lines = _read_text(target).splitlines()
    except OSError as exc:
        return f"error: {exc}"

    sb.files_read.add(sb.rel(target))
    start = max(1, offset)
    chunk = lines[start - 1: start - 1 + max(1, limit)]
    if not chunk:
        return f"(no lines at offset {offset}; file has {len(lines)} lines)"

    body = "\n".join(f"{start + i}\t{ln}" for i, ln in enumerate(chunk))
    end = start + len(chunk) - 1
    if end < len(lines):
        body += f"\n... {len(lines) - end} more lines (continue with offset={end + 1})"
    return body


@beta_tool
def write_output(filename: str, content: str) -> str:
    """Write a deliverable to the output directory. This is how you deliver your results.

    Call this for the `.acdl` specification and again for the extraction report.
    Writing the same filename twice overwrites it, so you can revise.

    Args:
        filename: Plain filename, no directories, e.g. "MyAgent.acdl" or "extraction-report.md".
        content: Full file contents.
    """
    sb = _sb()
    try:
        target = sb.resolve_in_out(filename)
    except ValueError as exc:
        return f"error: {exc}"
    try:
        target.write_text(content, encoding="utf-8")
    except OSError as exc:
        return f"error: {exc}"
    return f"wrote {filename} ({len(content):,} bytes, {content.count(chr(10)) + 1} lines)"


TOOLS = [list_dir, glob_files, grep, read_file, write_output]


# --------------------------------------------------------------------------------------
# Prompt assembly
# --------------------------------------------------------------------------------------

def build_system_prompt(language_ref: Path, extraction_prompt: Path) -> str:
    for path in (language_ref, extraction_prompt):
        if not path.is_file():
            sys.exit(f"Missing prompt file: {path}")
    return (
        "You are an expert at reverse-engineering how LLM agents assemble their context, "
        "and at expressing that structure in ACDL.\n\n"
        "Below are two documents. The first is the complete ACDL language reference. "
        "The second is your task definition. Follow the task definition exactly.\n\n"
        "=================== DOCUMENT 1: ACDL LANGUAGE REFERENCE ===================\n\n"
        f"{language_ref.read_text(encoding='utf-8')}\n\n"
        "=================== DOCUMENT 2: YOUR TASK ===================\n\n"
        f"{extraction_prompt.read_text(encoding='utf-8')}\n\n"
        "=================== WORKING INSTRUCTIONS ===================\n\n"
        "You have read-only tools over the target codebase: `list_dir`, `glob_files`, "
        "`grep`, and `read_file`. You cannot run the code, and you cannot modify it. "
        "Read the actual source — never infer structure from README files or docs.\n\n"
        "Deliver your results by calling `write_output` twice:\n"
        "  1. The specification, as `<AgentName>.acdl`.\n"
        "  2. The extraction report, as `extraction-report.md`.\n\n"
        "Do not print either deliverable into your reply instead of writing it — the "
        "files are the deliverable. After both files are written, end your turn with a "
        "short summary: the agent's time model, how many specs you wrote, and the "
        "uncertainties a human should check first."
    )


def build_first_message(sb: Sandbox) -> str:
    listing = list_dir.func(path=".", max_depth=2)
    return (
        f"The target codebase is rooted at `{sb.root}`. All tool paths are relative to "
        "that root.\n\n"
        "Top two levels:\n\n"
        f"```\n{listing}\n```\n\n"
        "Begin the extraction. Work through the phases in your task definition in order, "
        "and read the source before drawing conclusions."
    )


# --------------------------------------------------------------------------------------
# Run
# --------------------------------------------------------------------------------------

def default_target() -> Path:
    """Analyze the CWD; if invoked from inside the agent's own directory, its parent."""
    cwd = Path.cwd().resolve()
    if cwd == SCRIPT_DIR:
        return SCRIPT_DIR.parent
    return cwd


def render_blocks(message) -> None:
    """Print assistant text and tool calls as the run progresses."""
    for block in message.content:
        if block.type == "text" and block.text.strip():
            print(f"\n{block.text.strip()}\n", flush=True)
        elif block.type == "tool_use":
            args = block.input if isinstance(block.input, dict) else {}
            if block.name == "write_output":
                detail = args.get("filename", "?")
            else:
                detail = ", ".join(
                    f"{k}={v!r}" for k, v in args.items() if k != "content"
                )
            print(f"  → {block.name}({detail[:160]})", flush=True)


def main() -> int:
    global SANDBOX

    ap = argparse.ArgumentParser(
        description="Extract the ACDL spec of an agent's context-creation process.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  # cloned into the target repo as <repo>/acdl-agent/\n"
            "  cd <repo> && python acdl-agent/acdl-agent.py\n\n"
            "  # target another checkout explicitly\n"
            "  python acdl-agent.py --target ~/src/some-agent -o ~/out/some-agent\n\n"
            "  # inspect the assembled prompt without spending tokens\n"
            "  python acdl-agent.py --target ~/src/some-agent --dry-run\n"
        ),
    )
    ap.add_argument(
        "target", nargs="?", default=None,
        help="Path to the agent codebase (default: current directory).",
    )
    ap.add_argument("--target", dest="target_opt", default=None, help=argparse.SUPPRESS)
    ap.add_argument(
        "-o", "--out", default=None,
        help="Output directory (default: <script dir>/out/<target name>).",
    )
    ap.add_argument("--model", default=DEFAULT_MODEL, help=f"Model ID (default: {DEFAULT_MODEL}).")
    ap.add_argument(
        "--effort", default=DEFAULT_EFFORT,
        choices=["low", "medium", "high", "xhigh", "max"],
        help=f"Reasoning effort (default: {DEFAULT_EFFORT}).",
    )
    ap.add_argument(
        "--max-iterations", type=int, default=DEFAULT_MAX_ITERATIONS,
        help=f"Cap on agent turns (default: {DEFAULT_MAX_ITERATIONS}).",
    )
    ap.add_argument(
        "--include-self", action="store_true",
        help="Do not exclude this script's directory from the analysis.",
    )
    ap.add_argument(
        "--dry-run", action="store_true",
        help="Assemble and print the prompt, then exit without calling the API.",
    )
    args = ap.parse_args()

    target = Path(args.target_opt or args.target or default_target()).expanduser().resolve()
    if not target.is_dir():
        return _fail(f"Target is not a directory: {target}")

    out_dir = (
        Path(args.out).expanduser().resolve()
        if args.out else SCRIPT_DIR / "out" / target.name
    )
    if not args.dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)

    exclude: list[Path] = []
    if not args.include_self:
        # Skip our own directory when we're cloned inside the codebase under analysis.
        if SCRIPT_DIR == target or target in SCRIPT_DIR.parents:
            exclude.append(SCRIPT_DIR)
    if out_dir == target or target in out_dir.parents:
        exclude.append(out_dir)

    SANDBOX = Sandbox(root=target, out_dir=out_dir, exclude=exclude)

    system_prompt = build_system_prompt(LANGUAGE_REF, EXTRACTION_PROMPT)
    first_message = build_first_message(SANDBOX)

    print(f"target : {target}")
    print(f"output : {out_dir}")
    if exclude:
        print(f"exclude: {', '.join(str(p) for p in exclude)}")
    print(f"model  : {args.model} (effort={args.effort})\n")

    if args.dry_run:
        print("=" * 78)
        print(system_prompt)
        print("=" * 78)
        print(first_message)
        print("=" * 78)
        print(f"\n[dry run] system prompt: {len(system_prompt):,} chars. No API call made.")
        return 0

    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        return _fail(
            "No credentials found. Set ANTHROPIC_API_KEY, or run `ant auth login` "
            "and let the SDK pick up the profile."
        )

    client = Anthropic()
    runner = client.beta.messages.tool_runner(
        model=args.model,
        max_tokens=MAX_TOKENS,
        thinking={"type": "adaptive"},
        output_config={"effort": args.effort},
        # The reference + task prompt are identical across runs; cache the prefix.
        system=[{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}],
        tools=TOOLS,
        messages=[{"role": "user", "content": first_message}],
        max_iterations=args.max_iterations,
    )

    transcript: list[dict] = []
    totals = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0}
    last = None

    try:
        for message in runner:
            last = message
            render_blocks(message)
            usage = message.usage
            totals["input"] += usage.input_tokens or 0
            totals["output"] += usage.output_tokens or 0
            totals["cache_read"] += getattr(usage, "cache_read_input_tokens", 0) or 0
            totals["cache_write"] += getattr(usage, "cache_creation_input_tokens", 0) or 0
            transcript.append(message.model_dump(mode="json"))
    except anthropic.APIStatusError as exc:
        _save_transcript(out_dir, transcript)
        return _fail(f"API error {exc.status_code}: {exc.message}")
    except anthropic.APIConnectionError as exc:
        _save_transcript(out_dir, transcript)
        return _fail(f"Connection error: {exc}")
    except KeyboardInterrupt:
        _save_transcript(out_dir, transcript)
        return _fail("Interrupted.")

    _save_transcript(out_dir, transcript)

    if last is not None and last.stop_reason == "refusal":
        detail = getattr(last, "stop_details", None)
        return _fail(f"Model declined the request (category={getattr(detail, 'category', None)}).")

    produced = sorted(
        p.name for p in out_dir.iterdir()
        if p.is_file() and p.name != "transcript.json"
    )
    print("\n" + "-" * 60)
    print(f"files read : {len(SANDBOX.files_read)}")
    print(f"turns      : {len(transcript)}")
    print(
        "tokens     : in={input:,} out={output:,} "
        "cache_read={cache_read:,} cache_write={cache_write:,}".format(**totals)
    )
    print(f"written    : {', '.join(produced) if produced else '(nothing)'}")
    print(f"output dir : {out_dir}")

    if not any(f.endswith(".acdl") for f in produced):
        print("\nWARNING: no .acdl file was produced. Check transcript.json.")
        return 1
    return 0


def _save_transcript(out_dir: Path, transcript: list[dict]) -> None:
    if transcript:
        (out_dir / "transcript.json").write_text(
            json.dumps(transcript, indent=2), encoding="utf-8"
        )


def _fail(msg: str) -> int:
    print(f"error: {msg}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
