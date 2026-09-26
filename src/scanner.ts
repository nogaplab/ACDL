import { Token, NamespaceKeyword, ControlKeyword, LogicalOperator} from "./tokens.js";
import { ArithmeticOperator } from "./types.js";

/* ───────────────── keywords ───────────────── */

/**
 * ACDL keywords are recognised case-insensitively and normalised to their
 * canonical spelling before they reach the parser, so `if`, `If` and `iF` are
 * the same token and the renderer still prints `If`. Source capitalisation is a
 * matter of taste; the rendered diagram is where the convention is enforced.
 *
 * Common spelling variants (`elif`, `elsif`, `stringfrag`) map onto the same
 * canonical keyword — they are unambiguous, and rejecting them buys nothing.
 *
 * The map is keyed by the lower-cased word.
 */
const CONTROL_KEYWORDS = new Map<string, ControlKeyword>([
  ["if", "If"],
  ["elseif", "ElseIf"],
  ["elsif", "ElseIf"],
  ["elif", "ElseIf"],
  ["else", "Else"],
  ["foreach", "ForEach"],
  ["switch", "Switch"],
  ["case", "Case"],
  ["default", "Default"],
  ["break", "break"],
  ["continue", "continue"],
  ["name", "Name"],
  ["for", "for"],
  ["in", "in"],
  ["mark", "Mark"],
  ["when", "when"],
  ["not", "not"],
  ["and", "and"],
  ["or", "or"],
  ["strfrag", "StrFrag"],
  ["stringfrag", "StrFrag"],
  ["rolesfrag", "RolesFrag"],
  ["rolefrag", "RolesFrag"],
  ["frag", "Frag"],
]);

/**
 * Context-variable namespaces. `sys`, `env` and `resp` in their canonical
 * lower-case spelling are always keywords; any other casing is a namespace only
 * where a path follows, so an ALL_CAPS template named `ENV` keeps working.
 */
const NAMESPACE_KEYWORDS = new Map<string, NamespaceKeyword>([
  ["env", "env"],
  ["sys", "sys"],
  ["resp", "resp"],
  ["prompt", "prompt"],
]);

const UNCONDITIONAL_NAMESPACES = new Set<string>(["env", "sys", "resp"]);

/**
 * `prompt` is the one namespace that is never unconditional and is not settled
 * by an index either: `Prompt[@T]: { ... }` is one of the commonest spec titles
 * there is, so only an explicit `prompt.field` reads as the namespace.
 */
const DOT_ONLY_NAMESPACES = new Set<string>(["prompt"]);

/* ───────────────── operators ───────────────── */
const LOGIC_OP = new Set<LogicalOperator> ([
   "=", "!", "<", ">", "&", "|", "^", "≠", "≤", "≥", "≈"
]);

const ARITH_OP = new Set<ArithmeticOperator> ([
  "-", "+", "%", "*", "/",
])

/**
 * Typographic look-alikes for operators, as produced by word processors, chat
 * clients and anything that "helpfully" prettifies text. They mean exactly what
 * the ASCII original means.
 */
const OPERATOR_ALIASES = new Map<string, string>([
  ["−", "-"], // minus sign
  ["–", "-"], // en dash
  ["—", "-"], // em dash
  ["×", "*"], // multiplication sign
  ["÷", "/"], // division sign
]);

/* ───────────────── symbols ───────────────── */
// Added characters like $, ?, etc., common in logic and templates
const SYMBOLS = new Set<string>([
  ":", ";", ".", ",", "(", ")", "{", "}", "[", "]", "@", "$", "?", "!", "_"
]);

/**
 * Quote characters that open a string literal, mapped to the quote that closes
 * them. Smart quotes arrive whenever a spec is pasted out of a document.
 */
const QUOTE_PAIRS = new Map<string, string>([
  ['"', '"'],
  ["'", "'"],
  ["“", "”"], // “ ”
  ["‘", "’"], // ‘ ’
]);

/* ───────────────── whitespace ───────────────── */

/**
 * Invisible characters that carry no meaning but ride along with copy-pasted
 * source (from a browser, a PDF, or a chat window): zero-width space/joiners,
 * word joiner, BOM, and soft hyphen. JS `\s` misses all of these, so they are
 * listed explicitly.
 */
const INVISIBLE = new Set<string>(
  [
    0x200b, // zero-width space
    0x200c, // zero-width non-joiner
    0x200d, // zero-width joiner
    0x2060, // word joiner
    0xfeff, // BOM / zero-width no-break space
    0x00ad, // soft hyphen
  ].map((code) => String.fromCharCode(code))
);

/**
 * Indentation is not significant in ACDL, and neither is which flavour of space
 * produced it. `\s` already covers tab, newline, NBSP (U+00A0), the U+2000
 * range, and ideographic space — the characters an HTML or PDF copy turns plain
 * spaces into.
 */
function isWhitespace(ch: string): boolean {
  return /\s/.test(ch) || INVISIBLE.has(ch);
}

/* ───────────────── scanner ───────────────── */

export class Scanner {
  private pos = 0;
  private line = 1;
  private col = 1;
  private input: string;
  constructor(input: string) {
    this.input = input;
  }

  nextToken(): Token {
    this.skipWhitespace();

    if (this.isEOF()) {
        return { type: "EOF", value: null, line: this.line, col: this.col};
    }

    const ch = this.peek();

    // COMMENT — `//` and `#` run to end of line, block comments span lines.
    // `#msg` is the one `#` that is not a comment: it names the current message.
    if (ch === "/" && this.peekNext() === "/") {
        return this.readLineComment(2);
    }
    if (ch === "#") {
        if (this.atMsgRef()) return this.readMsgRef();
        return this.readLineComment(1);
    }
    if (ch === "/" && this.peekNext() === "*") {
        return this.readBlockComment();
    }

    // RANGE operator: … ‥ ... ..
    if (ch === "…" || ch === "‥") {
        const col = this.col;
        this.advance();
        return { type: "RANGE", value: "…", line: this.line, col};
        }
    if (ch === "." && this.peekNext() === ".") {
        const col = this.col;
        this.advance(); this.advance();
        // A third dot is part of the same range operator, not a new token.
        if (this.peek() === ".") this.advance();
        return { type: "RANGE", value: "...", line: this.line, col};
    }

    // OPERATOR — typographic variants normalise to their ASCII meaning.
    const normalized = OPERATOR_ALIASES.get(ch) ?? ch;

    if (LOGIC_OP.has(normalized as LogicalOperator)) {
        const col = this.col;
        this.advance();
        return {
            type: "LOGIC_OP",
            value: normalized as LogicalOperator,
            line: this.line,
            col
        };
    }

    if (ARITH_OP.has(normalized as ArithmeticOperator)) {
        const col = this.col;
        this.advance();
        return {
            type: "ARITH_OP",
            value: normalized as ArithmeticOperator,
            line: this.line,
            col,
        };
    }

    // STRING
    if (QUOTE_PAIRS.has(ch)) {
        return this.readString();
    }


    // SYMBOL
    if (SYMBOLS.has(ch)) {
        return this.readSymbol();
    }

    // NUMBER
    if (this.isDigit(ch)) {
        return this.readNumber();
    }

    // IDENTIFIER
    if (this.isIdentStart(ch)) {
        return this.readIdentifier();
    }

    // Any other punctuation or symbol becomes a plain SYMBOL token rather than a
    // hard lexical error. Whether it belongs where it sits is the parser's call,
    // and the parser can say so with far more context than the scanner can.
    if (/[\p{P}\p{S}]/u.test(ch)) {
        return this.readSymbol();
    }

    throw this.error(`Unexpected character '${ch}' (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`);
    }

 /* ───────────── token readers ───────────── */

  /**
   * Whether the `#` at the current position starts `#msg` rather than a
   * comment: the word `msg` in any casing, followed by something that cannot
   * continue an identifier. `#msgs` and `# msg` are still comments.
   */
  private atMsgRef(): boolean {
    const word = this.input.slice(this.pos + 1, this.pos + 4);
    if (word.toLowerCase() !== "msg") return false;
    const after = this.input[this.pos + 4];
    return after === undefined || !this.isIdentPart(after);
  }

  /** The `#msg` token, normalised to lower case. */
  private readMsgRef(): Token {
    const startCol = this.col;
    for (let i = 0; i < 4; i++) this.advance();
    return { type: "MSG", value: "#msg", line: this.line, col: startCol };
  }

  /**
   * A `//` or `#` comment, running to end of line. `openerLength` is how many
   * characters introduce it.
   *
   * Braces are ordinary comment text: stopping at "}" would make any comment
   * quoting a code literal terminate early, leaving the remainder to be
   * tokenized as source.
   */
  private readLineComment(openerLength: number): Token {
  const startCol = this.col;

  for (let i = 0; i < openerLength; i++) this.advance();

  let value = "";

  while (!this.isEOF() && this.peek() !== "\n") {
    value += this.advance();
  }

  return {
    type: "COMMENT",
    value: value.trim(),
    line: this.line,
    col: startCol
  };
}

  /** A slash-star comment, which may span lines. */
  private readBlockComment(): Token {
    const startCol = this.col;
    const startLine = this.line;

    this.advance(); // /
    this.advance(); // *

    let value = "";
    while (!this.isEOF()) {
      if (this.peek() === "*" && this.peekNext() === "/") {
        this.advance();
        this.advance();
        return { type: "COMMENT", value: value.trim(), line: startLine, col: startCol };
      }
      value += this.advance();
    }

    throw this.error(`Unterminated block comment (opened at line ${startLine})`);
  }


  private readString(): Token {
    const startCol = this.col;
    const startLine = this.line;

    const closer = QUOTE_PAIRS.get(this.peek())!;
    this.advance(); // consume opening quote

    let value = "";

    while (!this.isEOF()) {
        const ch = this.peek();

        // end of string
        if (ch === closer) {
            this.advance(); // consume closing quote
            return {
                type: "STRING",
                value,
                line: this.line,
                col: startCol,
            };
        }

        // escape sequence
        if (ch === "\\") {
            this.advance(); // consume '\'

        if (this.isEOF()) {
            throw this.error(`Unterminated string literal (opened at line ${startLine})`);
        }

        const esc = this.advance();
        switch (esc) {
            case '"': value += '"'; break;
            case "'": value += "'"; break;
            case "\\": value += "\\"; break;
            case "n": value += "\n"; break;
            case "t": value += "\t"; break;
            // An unrecognised escape is far more likely to be a Windows path or
            // a stray backslash than a typo worth rejecting the file over, so it
            // survives verbatim.
            default: value += "\\" + esc; break;
        }
        continue;
        }

        // newline not allowed inside strings
        if (ch === "\n") {
        throw this.error(`Unterminated string literal (opened at line ${startLine})`);
        }

        value += this.advance();
    }

    throw this.error(`Unterminated string literal (opened at line ${startLine})`);
}

  private readSymbol(): Token {
    const startCol = this.col;
    const value = this.advance();
    return {
      type: "SYMBOL",
      value,
      line: this.line,
      col: startCol,
    };
  }

  private readIdentifier(): Token {
    const startCol = this.col;
    let value = "";

    // maximal munch: read the entire identifier
    while (!this.isEOF() && this.isIdentPart(this.peek())) {
        value += this.advance();
    }

    const lower = value.toLowerCase();

    // ── Namespace keywords, checked before control keywords so that no other
    //    spelling rule can shadow one.
    const namespace = NAMESPACE_KEYWORDS.get(lower);
    if (namespace) {
      const dotOnly = DOT_ONLY_NAMESPACES.has(lower);
      if (UNCONDITIONAL_NAMESPACES.has(value) || this.nextSignificantIsPathStart(dotOnly)) {
        return {
          type: "KEYWORD",
          value: namespace,
          line: this.line,
          col: startCol,
        };
      }
    }

    // ── Control keywords (standalone), in any casing. ALL_CAPS included: the
    //    corpus writes `MARK 1 { ... }`, and a template is conventionally a
    //    multi-word name (`AVAILABLE_TOOLS`), so the two do not collide in
    //    practice. A template must simply not be named exactly like a keyword.
    const control = CONTROL_KEYWORDS.get(lower);
    if (control) {
        return {
        type: "KEYWORD",
        value: control,
        line: this.line,
        col: startCol,
        };
    }

    // ── Otherwise: normal identifier
    return {
        type: "IDENT",
        value,
        line: this.line,
        col: startCol,
    };
    }

  /**
   * Whether the next non-whitespace character starts a context-variable path —
   * `.` for a field or `[` for an index. Used to decide whether a non-canonical
   * casing such as `Env` is a namespace or an ordinary identifier.
   */
  private nextSignificantIsPathStart(dotOnly: boolean): boolean {
    let i = this.pos;
    while (i < this.input.length && isWhitespace(this.input[i])) i++;
    const ch = this.input[i];
    // `..` is the range operator, not a field access.
    if (ch === "." && this.input[i + 1] !== ".") return true;
    return !dotOnly && ch === "[";
  }

  private readNumber(): Token {
    const startCol = this.col;
    let value = "";

    while (!this.isEOF() && this.isDigit(this.peek())) {
      value += this.advance();
    }

    return {
      type: "NUMBER",
      value,
      line: this.line,
      col: startCol,
    };
  }

  private skipWhitespace(): boolean {
    let skipped = false;
    while (!this.isEOF() && isWhitespace(this.peek())) {
      this.advance();
      skipped = true;
    }
    return skipped;
  }


  private advance(): string {
    const ch = this.input[this.pos++];
    if (ch === "\n") {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  }

  private peek(): string {
    return this.input[this.pos];
  }

  private peekNext(): string {
    return this.input[this.pos + 1];
  }

  private isEOF(): boolean {
    return this.pos >= this.input.length;
  }

  private isDigit(ch: string): boolean {
    return ch >= "0" && ch <= "9";
  }

  /**
   * Identifiers accept any Unicode letter, so a spec may name things in the
   * language its authors actually work in.
   */
  private isIdentStart(ch: string): boolean {
    return /[\p{L}_]/u.test(ch);
  }

  private isIdentPart(ch: string): boolean {
    return /[\p{L}\p{N}_]/u.test(ch);
  }

  private error(msg: string): Error {
    return new Error(`[${this.line}:${this.col}] ${msg}`);
  }
}
