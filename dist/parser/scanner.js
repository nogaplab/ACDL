/* ───────────────── keywords ───────────────── */
const NAMESPACE_KEYWORDS = new Set([
    "obs",
    "mem",
    "act",
    "resp",
    "prompt",
]);
const CONTROL_KEYWORDS = new Set([
    "If",
    "ElseIf",
    "Else",
    "ForEach",
    "Switch",
    "Case",
]);
/* ───────────────── operators ───────────────── */
const OPERATORS = new Set([
    "-",
    "+",
]);
/* ───────────────── symbols ───────────────── */
const SYMBOLS = new Set([
    ":", ";", ".", ",", "(", ")", "{", "}", "*", "[", "]", "@",
]);
/* ───────────────── scanner ───────────────── */
export class Scanner {
    constructor(input) {
        this.pos = 0;
        this.line = 1;
        this.col = 1;
        this.input = input;
    }
    nextToken() {
        this.skipWhitespace();
        if (this.isEOF()) {
            return { type: "EOF", line: this.line, col: this.col };
        }
        const ch = this.peek();
        // COMMENT
        if (ch === "/" && this.peekNext() === "/") {
            return this.readComment();
        }
        // RANGE operator
        if (ch === "…") {
            const col = this.col;
            this.advance();
            return { type: "RANGE", value: "…", line: this.line, col };
        }
        if (ch === ".") {
            if (this.peekNext() === "." &&
                this.input[this.pos + 2] === ".") {
                const col = this.col;
                this.advance();
                this.advance();
                this.advance();
                return { type: "RANGE", value: "...", line: this.line, col };
            }
        }
        // OPERATOR
        if (OPERATORS.has(ch)) {
            const col = this.col;
            const value = this.advance();
            return {
                type: "OPERATOR",
                value,
                line: this.line,
                col,
            };
        }
        // STRING
        if (ch === '"') {
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
        throw this.error(`Unexpected character '${ch}'`);
    }
    /* ───────────── token readers ───────────── */
    readComment() {
        const startCol = this.col;
        // consume //
        this.advance();
        this.advance();
        let value = "";
        while (!this.isEOF() &&
            this.peek() !== "\n" &&
            this.peek() !== "}") {
            value += this.advance();
        }
        return {
            type: "COMMENT",
            value: value.trim(),
            line: this.line,
            col: startCol,
        };
    }
    readString() {
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
                    case '"':
                        value += '"';
                        break;
                    case "\\":
                        value += "\\";
                        break;
                    case "n":
                        value += "\n";
                        break;
                    case "t":
                        value += "\t";
                        break;
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
    readSymbol() {
        const startCol = this.col;
        const value = this.advance();
        return {
            type: "SYMBOL",
            value,
            line: this.line,
            col: startCol,
        };
    }
    readIdentifier() {
        const startCol = this.col;
        let value = "";
        // maximal munch: read the entire identifier
        while (!this.isEOF() && this.isIdentPart(this.peek())) {
            value += this.advance();
        }
        // ── Control keywords (standalone)
        if (CONTROL_KEYWORDS.has(value)) {
            return {
                type: "KEYWORD",
                value: value,
                line: this.line,
                col: startCol,
            };
        }
        // ── Namespace keywords (must be followed by '.')
        if (NAMESPACE_KEYWORDS.has(value) &&
            this.peek() === ".") {
            return {
                type: "KEYWORD",
                value: value,
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
    readNumber() {
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
    skipWhitespace() {
        while (!this.isEOF()) {
            const ch = this.peek();
            if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
                this.advance();
            }
            else {
                break;
            }
        }
    }
    advance() {
        const ch = this.input[this.pos++];
        if (ch === "\n") {
            this.line++;
            this.col = 1;
        }
        else {
            this.col++;
        }
        return ch;
    }
    peek() {
        return this.input[this.pos];
    }
    peekNext() {
        return this.input[this.pos + 1];
    }
    isEOF() {
        return this.pos >= this.input.length;
    }
    isDigit(ch) {
        return ch >= "0" && ch <= "9";
    }
    isIdentStart(ch) {
        return /[a-zA-Z_]/.test(ch);
    }
    isIdentPart(ch) {
        return /[a-zA-Z0-9_]/.test(ch);
    }
    error(msg) {
        return new Error(`[${this.line}:${this.col}] ${msg}`);
    }
}
