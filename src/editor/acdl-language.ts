import { StreamLanguage, StringStream } from "@codemirror/language";

const NAMESPACE_KEYWORDS = new Set(["env", "sys", "resp", "prompt"]);
const CONTROL_KEYWORDS = new Set([
  "If", "ElseIf", "Else", "ForEach", "Switch", "Case", "Default", "break", "continue",
]);
const ROLE_LETTERS = new Set(["S", "U", "A", "T", "N"]);

interface AcdlState {
  /* no multi-line state needed — strings and comments are single-line */
}

function tokenize(stream: StringStream, _state: AcdlState): string | null {
  // Whitespace
  if (stream.eatSpace()) return null;

  // Comment: // to end-of-line (scanner also stops at })
  if (stream.match("//")) {
    // Consume until EOL or } (to match scanner behavior)
    while (!stream.eol()) {
      if (stream.peek() === "}") break;
      stream.next();
    }
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
        return "string";
      }
    }
    return "string"; // unterminated, still color it
  }

  // Range: ... or …
  if (stream.match("...") || stream.match("\u2026")) {
    return "meta";
  }

  // Number
  if (stream.match(/^[0-9]+/)) {
    return "number";
  }

  // Identifier / Keyword
  if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) {
    const word = stream.current();

    // Role identifier: single letter S/U/A/T/N followed by :
    if (ROLE_LETTERS.has(word) && stream.peek() === ":") {
      return "tag";
    }

    // Namespace keywords
    if (NAMESPACE_KEYWORDS.has(word)) return "keyword";

    // Control keywords
    if (CONTROL_KEYWORDS.has(word)) return "builtin";

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
    return "operator";
  }
  if ("-+%*/".includes(ch)) {
    stream.next();
    return "operator";
  }

  // Symbols / brackets
  if ("{}[]()".includes(ch)) {
    stream.next();
    return "bracket";
  }
  if (":;.,@#$?!_".includes(ch)) {
    stream.next();
    return "punctuation";
  }

  // Fallback: consume one character
  stream.next();
  return null;
}

export const acdlStreamLanguage = StreamLanguage.define<AcdlState>({
  token: tokenize,
  startState(): AcdlState {
    return {};
  },
});
