import { StreamLanguage, StringStream } from "@codemirror/language";

// Keyword recognition mirrors the scanner, which matches case-insensitively and
// accepts a few spelling variants. Sets are keyed by the lower-cased word.
const NAMESPACE_KEYWORDS = new Set(["env", "sys", "resp", "prompt"]);
const CONTROL_KEYWORDS = new Set([
  "if", "elseif", "elsif", "elif", "else", "foreach", "switch", "case", "default",
  "break", "continue", "name", "for", "in", "mark", "when", "and", "or", "not",
  "strfrag", "stringfrag", "rolesfrag", "rolefrag", "frag",
]);
const ROLE_MARKERS = new Set([
  "s", "u", "a", "t", "n", "system", "user", "assistant", "tool", "none",
]);

interface AcdlState {
  /* Track if we just saw a '.' to treat the next identifier as a path segment */
  afterDot: boolean;
}

function tokenize(stream: StringStream, state: AcdlState): string | null {
  // Whitespace
  if (stream.eatSpace()) return null;

  // #msg: the current message number. The one `#` that is not a comment.
  if (stream.match(/^#msg(?![\p{L}\p{N}_])/iu)) {
    state.afterDot = false;
    return "atom";
  }

  // Comment: // or # to end-of-line, braces included (matches the scanner)
  if (stream.match("//") || stream.match("#")) {
    stream.skipToEnd();
    state.afterDot = false;
    return "comment";
  }

  // String: "..." with escape sequences
  if (stream.peek() === '"') {
    stream.next(); // opening "
    while (!stream.eol()) {
      const ch = stream.next();
      if (ch === "\\") {
        stream.next(); // skip escaped char
      } else if (ch === '"') {
        state.afterDot = false;
        return "string";
      }
    }
    state.afterDot = false;
    return "string"; // unterminated, still color it
  }

  // Range: ... or …
  if (stream.match("...") || stream.match("\u2026")) {
    state.afterDot = false;
    return "meta";
  }

  // Number
  if (stream.match(/^[0-9]+/)) {
    state.afterDot = false;
    return "number";
  }

  // Identifier / Keyword
  if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) {
    const word = stream.current();
    const wasAfterDot = state.afterDot;
    state.afterDot = false;

    // If we're after a dot, this is a path segment - treat as variable
    if (wasAfterDot) {
      return "variable";
    }

    const lower = word.toLowerCase();

    // Role marker: S/U/A/T/N or the role spelled out, followed by :
    if (ROLE_MARKERS.has(lower) && stream.peek() === ":") {
      return "tag";
    }

    // Namespace keywords. `prompt` only counts before a dot, since `Prompt[@T]:`
    // is a spec title rather than the namespace.
    if (NAMESPACE_KEYWORDS.has(lower) && (lower !== "prompt" || stream.peek() === ".")) {
      return "keyword";
    }

    // Control keywords
    if (CONTROL_KEYWORDS.has(lower)) return "builtin";

    // Template: ALL_CAPS (at least 2 chars to not match role letters)
    if (/^[A-Z][A-Z0-9_]+$/.test(word)) return "def";

    // Prompt keyword (appears as Prompt[@t]: { ... })
    if (word === "Prompt") return "keyword";

    // Generic identifier (context var paths, function names, etc.)
    return "variable";
  }

  // Operators
  const ch = stream.peek()!;
  if ("=!<>&|^".includes(ch)) {
    stream.next();
    state.afterDot = false;
    return "operator";
  }
  if ("-+%*/".includes(ch)) {
    stream.next();
    state.afterDot = false;
    return "operator";
  }

  // Symbols / brackets
  if ("{}[]()".includes(ch)) {
    stream.next();
    state.afterDot = false;
    return "bracket";
  }
  if (":;.,@#$?!_".includes(ch)) {
    stream.next();
    // Track if we just saw a dot for path segment detection
    state.afterDot = (ch === ".");
    return "punctuation";
  }

  // Fallback: consume one character
  stream.next();
  state.afterDot = false;
  return null;
}

export const acdlStreamLanguage = StreamLanguage.define<AcdlState>({
  token: tokenize,
  startState(): AcdlState {
    return { afterDot: false };
  },
});
