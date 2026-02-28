import { Token, NamespaceKeyword, ControlKeyword, LogicalOperator} from "./tokens.js";
import { ArithmeticOperator } from "./types.js";

/* ───────────────── keywords ───────────────── */

// change the name to context var keywords
const NAMESPACE_KEYWORDS = new Set<NamespaceKeyword>([
  "env",
  "sys",
  "resp",
  "prompt",
]);

const CONTROL_KEYWORDS = new Set<ControlKeyword>([
  "If",
  "ElseIf",
  "Else",
  "ForEach",
  "Switch",
  "Case",
  "Default",
  "break",
  "continue",
  "Name",
  "for",
  "in",
  "MARK",
  "when"
]);

/* ───────────────── operators ───────────────── */
const LOGIC_OP = new Set<LogicalOperator> ([ 
   "=", "!", "<", ">", "&", "|", "^"
]);

const ARITH_OP = new Set<ArithmeticOperator> ([
  "-", "+", "%", "*", "/",
])
/* ───────────────── symbols ───────────────── */
// Added characters like #, $, ?, etc., common in logic and templates
const SYMBOLS = new Set<string>([
  ":", ";", ".", ",", "(", ")", "{", "}", "[", "]", "@", "#", "$", "?", "!", "_"
]);

/* ───────────────── scanner ───────────────── */

export class Scanner {
  private pos = 0;
  private line = 1;
  private col = 1;
  private input: string;
  private hadWhitespace = false; // tracks if whitespace was skipped before current token

  constructor(input: string) {
    this.input = input;
  }

  nextToken(): Token {
    const spaceBefore = this.skipWhitespace();
    if (this.isEOF()) {
        return { type: "EOF", value: null, line: this.line, col: this.col, spaceBefore };
    }

    const ch = this.peek();

    // COMMENT
    if (ch === "/" && this.peekNext() === "/") {
        return this.readComment(spaceBefore);
    }

    // RANGE operator
    if (ch === "…" ) {
        const col = this.col;
        this.advance();
        return { type: "RANGE", value: "…", line: this.line, col, spaceBefore };
        }
    if (ch === ".") {
        if (this.peekNext() === "." &&
        this.input[this.pos + 2] === "."
        ) {
        const col = this.col;
        this.advance(); this.advance(); this.advance();
        return { type: "RANGE", value: "...", line: this.line, col, spaceBefore };
        }
    }

    // OPERATOR
    if (LOGIC_OP.has(ch as LogicalOperator)) {
        const col = this.col;
        const value = this.advance() as LogicalOperator;
        return {
            type: "LOGIC_OP",
            value,
            line: this.line,
            col,
            spaceBefore,
        };
    }

    if (ARITH_OP.has(ch as ArithmeticOperator)) {
        const col = this.col;
        const value = this.advance() as ArithmeticOperator;
        return {
            type: "ARITH_OP",
            value,
            line: this.line,
            col,
            spaceBefore,
        };
    }

    // STRING
    if (ch === '"') {
        return this.readString(spaceBefore);
    }


    // SYMBOL
    if (SYMBOLS.has(ch)) {
        return this.readSymbol(spaceBefore);
    }

    // NUMBER
    if (this.isDigit(ch)) {
        return this.readNumber(spaceBefore);
    }

    // IDENTIFIER
    if (this.isIdentStart(ch)) {
        return this.readIdentifier(spaceBefore);
    }

    throw this.error(`Unexpected character '${ch}'`);
    }

 /* ───────────── token readers ───────────── */

  private readComment(spaceBefore: boolean): Token {
  const startCol = this.col;

  // consume //
  this.advance();
  this.advance();

  let value = "";

  while (
    !this.isEOF() &&
    this.peek() !== "\n" &&
    this.peek() !== "}"
  ) {
    value += this.advance();
  }

  return {
    type: "COMMENT",
    value: value.trim(),
    line: this.line,
    col: startCol,
    spaceBefore,
  };
}


  private readString(): Token {
    const startCol = this.col;

    this.advance(); // consume opening "

    let value = "";

    while (!this.isEOF()) {
        const ch = this.peek();

        // end of string
        if (ch === '"') {
            this.advance(); // consume closing "
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
            throw this.error("Unterminated string literal");
        }

        const esc = this.advance();
        switch (esc) {
            case '"': value += '"'; break;
            case "\\": value += "\\"; break;
            case "n": value += "\n"; break;
            case "t": value += "\t"; break;
            default:
            throw this.error(`Invalid escape sequence \\${esc}`);
        }
        continue;
        }

        // newline not allowed inside strings
        if (ch === "\n") {
        throw this.error("Unterminated string literal");
        }

        value += this.advance();
    }

    throw this.error("Unterminated string literal");
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

    // ── Control keywords (standalone)
    if (CONTROL_KEYWORDS.has(value as ControlKeyword)) {
        return {
        type: "KEYWORD",
        value: value as ControlKeyword,
        line: this.line,
        col: startCol,
        };
    }

    // ── Namespace keywords (must be followed by '.')
    if (NAMESPACE_KEYWORDS.has(value as NamespaceKeyword)) {
        return {
        type: "KEYWORD",
        value: value as NamespaceKeyword,
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
    while (!this.isEOF()) {
        const ch = this.peek();
        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        this.advance();
        skipped = true;
        } else {
        break;
        }
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

  private isIdentStart(ch: string): boolean {
    return /[a-zA-Z_]/.test(ch);
  }

  private isIdentPart(ch: string): boolean {
    return /[a-zA-Z0-9_]/.test(ch);
  }

  private error(msg: string): Error {
    return new Error(`[${this.line}:${this.col}] ${msg}`);
  }
}
