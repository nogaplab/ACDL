"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);

// src/diagnostics.ts
var vscode = __toESM(require("vscode"));

// ../src/scanner.ts
var NAMESPACE_KEYWORDS = /* @__PURE__ */ new Set([
  "env",
  "sys",
  "resp"
]);
var CONTROL_KEYWORDS = /* @__PURE__ */ new Set([
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
  "Mark",
  "when",
  "not",
  "and",
  "or",
  "StrFrag",
  "RolesFrag",
  "Frag"
]);
var LOGIC_OP = /* @__PURE__ */ new Set([
  "=",
  "!",
  "<",
  ">",
  "&",
  "|",
  "^"
]);
var ARITH_OP = /* @__PURE__ */ new Set([
  "-",
  "+",
  "%",
  "*",
  "/"
]);
var SYMBOLS = /* @__PURE__ */ new Set([
  ":",
  ";",
  ".",
  ",",
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  "@",
  "#",
  "$",
  "?",
  "!",
  "_"
]);
var Scanner = class {
  pos = 0;
  line = 1;
  col = 1;
  input;
  constructor(input) {
    this.input = input;
  }
  nextToken() {
    this.skipWhitespace();
    if (this.isEOF()) {
      return { type: "EOF", value: null, line: this.line, col: this.col };
    }
    const ch = this.peek();
    if (ch === "/" && this.peekNext() === "/") {
      return this.readComment();
    }
    if (ch === "\u2026") {
      const col = this.col;
      this.advance();
      return { type: "RANGE", value: "\u2026", line: this.line, col };
    }
    if (ch === ".") {
      if (this.peekNext() === "." && this.input[this.pos + 2] === ".") {
        const col = this.col;
        this.advance();
        this.advance();
        this.advance();
        return { type: "RANGE", value: "...", line: this.line, col };
      }
    }
    if (LOGIC_OP.has(ch)) {
      const col = this.col;
      const value = this.advance();
      return {
        type: "LOGIC_OP",
        value,
        line: this.line,
        col
      };
    }
    if (ARITH_OP.has(ch)) {
      const col = this.col;
      const value = this.advance();
      return {
        type: "ARITH_OP",
        value,
        line: this.line,
        col
      };
    }
    if (ch === '"') {
      return this.readString();
    }
    if (SYMBOLS.has(ch)) {
      return this.readSymbol();
    }
    if (this.isDigit(ch)) {
      return this.readNumber();
    }
    if (this.isIdentStart(ch)) {
      return this.readIdentifier();
    }
    throw this.error(`Unexpected character '${ch}'`);
  }
  /* ───────────── token readers ───────────── */
  readComment() {
    const startCol = this.col;
    this.advance();
    this.advance();
    let value = "";
    while (!this.isEOF() && this.peek() !== "\n" && this.peek() !== "}") {
      value += this.advance();
    }
    return {
      type: "COMMENT",
      value: value.trim(),
      line: this.line,
      col: startCol
    };
  }
  readString() {
    const startCol = this.col;
    this.advance();
    let value = "";
    while (!this.isEOF()) {
      const ch = this.peek();
      if (ch === '"') {
        this.advance();
        return {
          type: "STRING",
          value,
          line: this.line,
          col: startCol
        };
      }
      if (ch === "\\") {
        this.advance();
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
            value += "	";
            break;
          default:
            throw this.error(`Invalid escape sequence \\${esc}`);
        }
        continue;
      }
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
      col: startCol
    };
  }
  readIdentifier() {
    const startCol = this.col;
    let value = "";
    while (!this.isEOF() && this.isIdentPart(this.peek())) {
      value += this.advance();
    }
    if (CONTROL_KEYWORDS.has(value)) {
      return {
        type: "KEYWORD",
        value,
        line: this.line,
        col: startCol
      };
    }
    if (NAMESPACE_KEYWORDS.has(value)) {
      return {
        type: "KEYWORD",
        value,
        line: this.line,
        col: startCol
      };
    }
    return {
      type: "IDENT",
      value,
      line: this.line,
      col: startCol
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
      col: startCol
    };
  }
  skipWhitespace() {
    let skipped = false;
    while (!this.isEOF()) {
      const ch = this.peek();
      if (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        this.advance();
        skipped = true;
      } else {
        break;
      }
    }
    return skipped;
  }
  advance() {
    const ch = this.input[this.pos++];
    if (ch === "\n") {
      this.line++;
      this.col = 1;
    } else {
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
};

// ../src/constructors.ts
function prompt(params) {
  return { ...params, kind: "prompt" };
}
function promptTitle(params) {
  return { ...params, kind: "title" };
}
function identifier(params) {
  return { ...params, kind: "identifier" };
}
function timeIndex(value) {
  return { kind: "time-index", value };
}
function otherIndex(value) {
  return { kind: "other-index", value };
}
function chatPromptBody(params) {
  return { ...params, kind: "chat-prompt-body" };
}
function completionPromptBody(params) {
  return { ...params, kind: "completion-prompt-body" };
}
function noneMessage(params) {
  return { ...params, kind: "none-message" };
}
function roleMessage(params) {
  return { ...params, kind: "role-message" };
}
function contextVar(params) {
  return { ...params, kind: "context-var" };
}
function pathDesc(params) {
  return { ...params, kind: "path-desc" };
}
function func(params) {
  return { ...params, kind: "function" };
}
function template(params) {
  return { ...params, kind: "template" };
}
function loopBlockOutsideRole(params) {
  return { ...params, kind: "loop-block-outside-role" };
}
function conditionalBlockOutsideRole(params) {
  return { ...params, kind: "conditional-block-outside-role" };
}
function switchBlockOutsideRole(params) {
  return { ...params, kind: "switch-block-outside-role" };
}
function caseBlockOutsideRole(params) {
  return { ...params, kind: "case-block-outside-role" };
}
function defaultCaseBlockOutsideRole(params) {
  return { ...params, kind: "default-case-block-outside-role" };
}
function loopBlockInsideRole(params) {
  return { ...params, kind: "loop-block-inside-role" };
}
function conditionalBlockInsideRole(params) {
  return { ...params, kind: "conditional-block-inside-role" };
}
function switchBlockInsideRole(params) {
  return { ...params, kind: "switch-block-inside-role" };
}
function caseBlockInsideRole(params) {
  return { ...params, kind: "case-block-inside-role" };
}
function defaultCaseBlockInsideRole(params) {
  return { ...params, kind: "default-case-block-inside-role" };
}
function Iterable(params) {
  return { ...params, kind: "iterable" };
}
function rangeExpr(params) {
  return { ...params, kind: "range-expr" };
}
function commentBlock(params) {
  return { ...params, kind: "comment-block" };
}
function markBlock(params) {
  return { ...params, kind: "mark-block" };
}
function markBlockInsideRole(params) {
  return { ...params, kind: "mark-block-inside-role" };
}
function arithmeticExpr(params) {
  return { ...params, kind: "arithmetic" };
}
function nameDef(params) {
  return { ...params, kind: "name-def" };
}
function nameRef(params) {
  return { ...params, kind: "name-ref" };
}
function listComprehension(params) {
  return { ...params, kind: "list-comprehension" };
}
function endBlock(params) {
  return { ...params, kind: "end-block" };
}
function strFragDef(params) {
  return { ...params, kind: "str-frag-def" };
}
function rolesFragDef(params) {
  return { ...params, kind: "roles-frag-def" };
}
function strFragInvocation(params) {
  return { ...params, kind: "str-frag-invocation" };
}
function rolesFragInvocation(params) {
  return { ...params, kind: "roles-frag-invocation" };
}

// ../src/parser.ts
function toExprToken(tok) {
  return {
    type: tok.type,
    value: tok.value
  };
}
var Parser = class {
  tokens = [];
  pos = 0;
  lastConsumedLine = 0;
  constructor(input) {
    const scanner = new Scanner(input);
    let token;
    do {
      token = scanner.nextToken();
      this.tokens.push(token);
    } while (token.type !== "EOF");
  }
  /* ───────────────── Core Navigation ───────────────── */
  peek() {
    return this.tokens[this.pos];
  }
  peekNext() {
    return this.tokens[this.pos + 1];
  }
  /**
   * Consumes a token of a specific type and/or value.
   * Since Token.value is (string | null), we use type assertions for IDENT values.
   */
  consume(type, value) {
    const tok = this.peek();
    if (type && tok.type !== type) {
      throw new Error(`[${tok.line}:${tok.col}] Expected token type ${type}, got ${tok.type} with value ${tok.value}`);
    }
    if (value && tok.value !== value) {
      throw new Error(`[${tok.line}:${tok.col}] Expected value "${value}", got "${tok.value}"`);
    }
    this.pos++;
    this.lastConsumedLine = tok.line;
    return tok;
  }
  match(type, value) {
    const tok = this.peek();
    if (tok.type === type && (!value || tok.value === value)) {
      this.pos++;
      this.lastConsumedLine = tok.line;
      return true;
    }
    return false;
  }
  /* ───────────────── Grammar Rules (Outside Role) ───────────────── */
  /**
   * Entry Point: Prompt[indices]: { ... }
   */
  parsePrompt() {
    const title = this.parseTitle();
    this.consume("SYMBOL", ":");
    this.consume("SYMBOL", "{");
    const body = this.parsePromptBody();
    this.consume("SYMBOL", "}");
    console.log("parsed prompt");
    return prompt({ title, body });
  }
  /**
   * Parse a file containing one or more prompts, fragment definitions, and comments.
   * Returns an array of Prompt, StrFragDef, RolesFragDef, and CommentBlock objects.
   */
  parseFile() {
    const blocks = [];
    while (!this.isEOF()) {
      const tok = this.peek();
      if (tok.type === "COMMENT") {
        const text = this.consume("COMMENT").value;
        blocks.push(commentBlock({ text }));
      } else if (tok.type === "KEYWORD" && tok.value === "StrFrag") {
        blocks.push(this.parseStrFragDef());
      } else if (tok.type === "KEYWORD" && tok.value === "RolesFrag") {
        blocks.push(this.parseRolesFragDef());
      } else {
        blocks.push(this.parsePrompt());
      }
    }
    return blocks;
  }
  /**
   * Like parseFile() but also records the 1-based start and end line of each
   * top-level block in the source. Useful for cursor-aware tooling that needs
   * to map editor positions to AST blocks.
   */
  parseFileWithRanges() {
    const ranges = [];
    while (!this.isEOF()) {
      const tok = this.peek();
      const startLine = tok.line;
      let block;
      if (tok.type === "COMMENT") {
        const text = this.consume("COMMENT").value;
        block = commentBlock({ text });
      } else if (tok.type === "KEYWORD" && tok.value === "StrFrag") {
        block = this.parseStrFragDef();
      } else if (tok.type === "KEYWORD" && tok.value === "RolesFrag") {
        block = this.parseRolesFragDef();
      } else {
        block = this.parsePrompt();
      }
      ranges.push({ block, startLine, endLine: this.lastConsumedLine });
    }
    return ranges;
  }
  /**
   * Parse a StrFrag definition: StrFrag Name[params]: { RoleBuildingBlock* }
   */
  parseStrFragDef() {
    this.consume("KEYWORD", "StrFrag");
    const name = this.consume("IDENT").value;
    let params = [];
    if (this.peek().value === "[") {
      this.consume("SYMBOL", "[");
      if (this.peek().value !== "]") {
        params = this.parseTextArgs();
      }
      this.consume("SYMBOL", "]");
    }
    this.consume("SYMBOL", ":");
    this.consume("SYMBOL", "{");
    const body = [];
    while (this.peek().type !== "EOF" && this.peek().value !== "}") {
      body.push(this.parseRoleBuildingBlock());
    }
    this.consume("SYMBOL", "}");
    console.log("parsed StrFrag definition");
    return strFragDef({ name, params, body });
  }
  /**
   * Parse a RolesFrag definition: RolesFrag Name[params]: { PromptBlock* }
   */
  parseRolesFragDef() {
    this.consume("KEYWORD", "RolesFrag");
    const name = this.consume("IDENT").value;
    let params = [];
    if (this.peek().value === "[") {
      this.consume("SYMBOL", "[");
      if (this.peek().value !== "]") {
        params = this.parseTextArgs();
      }
      this.consume("SYMBOL", "]");
    }
    this.consume("SYMBOL", ":");
    this.consume("SYMBOL", "{");
    const body = [];
    while (this.peek().type !== "EOF" && this.peek().value !== "}") {
      if (this.peek().type === "COMMENT") {
        const text = this.consume("COMMENT").value;
        body.push(commentBlock({ text }));
        continue;
      }
      body.push(this.parsePromptBodyItem());
    }
    this.consume("SYMBOL", "}");
    console.log("parsed RolesFrag definition");
    return rolesFragDef({ name, params, body });
  }
  parseTitle() {
    const name = this.consume("IDENT").value;
    const indices = this.parseOptionalIndices();
    console.log("parsed title");
    return promptTitle({ name, indices });
  }
  /**
   * Gatekeeper for Top-Level Scope.
   * Detects whether this is a chat prompt (multiple roles) or completion prompt (single N: message).
   */
  parsePromptBody() {
    const savedPos = this.pos;
    while (this.peek().type === "COMMENT") {
      this.pos++;
    }
    const isCompletionPrompt = this.peek().type === "IDENT" && this.peek().value === "N";
    this.pos = savedPos;
    if (isCompletionPrompt) {
      return this.parseCompletionPromptBody();
    }
    return this.parseChatPromptBody();
  }
  /**
   * Parse a chat prompt body (standard multi-role format).
   */
  parseChatPromptBody() {
    const body = [];
    while (this.peek().type !== "EOF" && this.peek().value !== "}") {
      if (this.peek().type === "COMMENT") {
        const text = this.consume("COMMENT").value;
        body.push(commentBlock({ text }));
        continue;
      }
      body.push(this.parsePromptBodyItem());
    }
    const comment = this.parseOptionalComment();
    return chatPromptBody({ body });
  }
  /**
   * Parse a completion prompt body (single N: message, no other roles allowed).
   */
  parseCompletionPromptBody() {
    while (this.peek().type === "COMMENT") {
      this.consume("COMMENT");
    }
    const message = this.parseNoneMessage();
    while (this.peek().type === "COMMENT") {
      this.consume("COMMENT");
    }
    if (this.peek().type !== "EOF" && this.peek().value !== "}") {
      const tok = this.peek();
      throw new Error(`[${tok.line}:${tok.col}] Completion prompts (N:) can only have a single message. Found unexpected token "${tok.value}"`);
    }
    return completionPromptBody({ message });
  }
  /**
   * Parse a NoneMessage: N: { RoleBuildingBlock* }
   */
  parseNoneMessage() {
    this.consume("IDENT", "N");
    this.consume("SYMBOL", ":");
    const body = [];
    if (this.peek().value === "{") {
      this.consume("SYMBOL", "{");
      while (this.peek().type !== "EOF" && this.peek().value !== "}") {
        body.push(this.parseRoleBuildingBlock());
      }
      this.consume("SYMBOL", "}");
    } else {
      const startLine = this.peek().line;
      body.push(this.parseRoleBuildingBlockSingleLine(startLine));
    }
    return noneMessage({ body });
  }
  /**
   * Parse a PromptBodyItem (either a PromptBlock or a LabelBlock).
   */
  parsePromptBodyItem() {
    return this.parseTopLevelBlock();
  }
  parseTopLevelBlock() {
    const tok = this.peek();
    const nextTok = this.peekNext();
    const val = tok.value;
    if (tok.type === "IDENT" && (val === "S" || val === "U" || val === "A" || val === "T")) {
      console.log("parsing role message");
      return this.parseRoleMessage();
    }
    if (tok.type === "KEYWORD") {
      switch (val) {
        case "If":
          return this.parseConditionalOutside();
        case "ForEach":
          return this.parseLoopOutside();
        case "Switch":
          return this.parseSwitchOutside();
        case "Name":
          return this.parseNameDef();
        case "Mark":
          return this.parseMarkBlock();
        case "Frag":
          return this.parseRolesFragInvocation();
      }
    }
    if (tok.type === "IDENT" && val === "PromptEndsHere") {
      return this.parseEndBlock();
    }
    if (tok.type === "COMMENT") {
      const text = this.consume("COMMENT").value;
      return commentBlock({ text });
    }
    throw new Error(`[${tok.line}:${tok.col}] Syntax Error: Unexpected token "${val}" in global scope.`);
  }
  /**
   * Parse a MarkBlock: MARK number { PromptBlock+ }
   * Mark blocks are like label blocks but rendered with a bracket on the right.
   */
  parseMarkBlock() {
    this.consume("KEYWORD", "Mark");
    const numberTok = this.consume("NUMBER");
    const markNumber = parseInt(numberTok.value, 10);
    this.consume("SYMBOL", "{");
    const blocks = [];
    do {
      if (this.peek().type === "COMMENT") {
        const text = this.consume("COMMENT").value;
        blocks.push(commentBlock({ text }));
        continue;
      }
      const innerBlock = this.parseTopLevelBlock();
      blocks.push(innerBlock);
    } while (this.peek().value !== "}");
    this.consume("SYMBOL", "}");
    return markBlock({ markNumber, body: blocks });
  }
  /**
   * Parse a MarkBlockInsideRole: MARK number { RoleBuildingBlock+ }
   * Mark blocks inside roles contain role building blocks.
   */
  parseMarkBlockInside() {
    this.consume("KEYWORD", "Mark");
    const numberTok = this.consume("NUMBER");
    const markNumber = parseInt(numberTok.value, 10);
    this.consume("SYMBOL", "{");
    const blocks = [];
    do {
      if (this.peek().type === "COMMENT") {
        const text = this.consume("COMMENT").value;
        blocks.push(commentBlock({ text }));
        continue;
      }
      const innerBlock = this.parseRoleBuildingBlock();
      blocks.push(innerBlock);
    } while (this.peek().value !== "}");
    this.consume("SYMBOL", "}");
    return markBlockInsideRole({ markNumber, body: blocks });
  }
  /*
   * RoleMessage = ROLE_ID: { RoleBuildingBlock* } | ROLE_ID: RoleBuildingBlock
   * Supports both multi-line blocks with curly braces and single-line without braces
  */
  parseRoleMessage() {
    const roleId = this.consume("IDENT").value;
    this.consume("SYMBOL", ":");
    const roleMap = { "S": "system", "U": "user", "A": "assistant", "T": "tool" };
    const role = roleMap[roleId];
    const body = [];
    if (this.peek().value === "{") {
      this.consume("SYMBOL", "{");
      while (this.peek().type !== "EOF" && this.peek().value !== "}") {
        body.push(this.parseRoleBuildingBlock());
      }
      this.consume("SYMBOL", "}");
    } else {
      const startLine = this.peek().line;
      body.push(this.parseRoleBuildingBlockSingleLine(startLine));
    }
    return roleMessage({ role, body });
  }
  /* ───────────────── Grammar Rules (Inside Role) ───────────────── */
  /**
  * Parse a single RoleBuildingBlock that must stay on the same line.
  * Used for single-line role syntax (e.g., U: obs.user_query[@i])
  */
  parseRoleBuildingBlockSingleLine(startLine) {
    const tok = this.peek();
    if (tok.line !== startLine) {
      throw new Error(`[${tok.line}:${tok.col}] Single-line role syntax cannot span multiple lines`);
    }
    const val = tok.value;
    if (tok.type === "KEYWORD") {
      if (val === "If" || val === "ForEach" || val === "Switch") {
        throw new Error(`[${tok.line}:${tok.col}] Control flow statements not allowed in single-line role syntax`);
      }
      const namespaces = ["env", "sys", "resp", "prompt"];
      if (namespaces.includes(val)) {
        return this.parseContextVar();
      }
    }
    if (tok.type === "IDENT") return this.parseTemplateOrFunc();
    throw new Error(`[${tok.line}:${tok.col}] Unexpected ${tok.type} (${val}) in single-line role syntax`);
  }
  /**
   * Gatekeeper for Inside-Role Scope.
   * Strictly collects RoleBuildingBlocks (ContextVars, Templates, Logic).
   */
  parseRoleBuildingBlock() {
    const tok = this.peek();
    const val = tok.value;
    console.log("started role building block");
    if (tok.type === "COMMENT") {
      const text = this.consume("COMMENT").value;
      return commentBlock({ text });
    }
    if (tok.type === "SYMBOL" && val === "$") {
      return this.parseNameRef();
    }
    if (tok.type === "KEYWORD") {
      if (val === "If") return this.parseConditionalInside();
      if (val === "ForEach") return this.parseLoopInside();
      if (val === "Switch") return this.parseSwitchInside();
      if (val === "Mark") return this.parseMarkBlockInside();
      if (val === "Name") return this.parseNameDef();
      if (val === "Frag") return this.parseStrFragInvocation();
      if (val === "break" || val === "continue") {
        const name = this.consume("KEYWORD").value;
        return template({ name, arguments: [], comment: void 0 });
      }
      const namespaces = ["env", "sys", "resp", "prompt"];
      if (namespaces.includes(val)) {
        return this.parseContextVar();
      }
    }
    if (tok.type === "IDENT" && val === "PromptEndsHere") {
      return this.parseEndBlock();
    }
    if (tok.type === "IDENT") return this.parseTemplateOrFunc();
    throw new Error(`[${tok.line}:${tok.col}] Unexpected ${tok.type} (${val}) inside role.`);
  }
  /* ───────────────── Name Definitions ───────────────── */
  /**
   * Parse a name definition: name varname := expr
   * where expr is a ContextVar, Func, ListComprehension, or StrFragInvocation
   */
  parseNameDef() {
    this.consume("KEYWORD", "Name");
    const varName = this.consume("IDENT").value;
    this.consume("SYMBOL", ":");
    this.consume("LOGIC_OP", "=");
    const tok = this.peek();
    let value;
    if (tok.type === "SYMBOL" && tok.value === "[") {
      value = this.parseListComprehension();
    } else if (tok.type === "KEYWORD" && ["env", "sys", "resp", "prompt"].includes(tok.value)) {
      value = this.parseContextVar();
    } else if (tok.type === "KEYWORD" && tok.value === "Frag") {
      value = this.parseStrFragInvocation();
    } else if (tok.type === "IDENT") {
      const parsed = this.parseTemplateOrFunc();
      if (parsed.kind !== "function") {
        const parsedName = parsed.kind === "template" ? parsed.name : "identifier";
        throw new Error(`[${tok.line}:${tok.col}] name definitions require a ContextVar, Func, list comprehension, or Frag invocation, got ${parsed.kind} "${parsedName}"`);
      }
      value = parsed;
    } else {
      throw new Error(`[${tok.line}:${tok.col}] Expected ContextVar, Func, list comprehension, or Frag invocation after :=, got ${tok.type}`);
    }
    return nameDef({ name: varName, value });
  }
  /**
   * Parse a list comprehension: [expr for var in iterable]
   * Example: [sys.Summary[@t] for t in range(T, T-900, 100)]
   */
  parseListComprehension() {
    this.consume("SYMBOL", "[");
    const elemTok = this.peek();
    let element;
    if (elemTok.type === "KEYWORD" && ["env", "sys", "resp", "prompt"].includes(elemTok.value)) {
      element = this.parseContextVar();
    } else if (elemTok.type === "KEYWORD" && elemTok.value === "Frag") {
      element = this.parseStrFragInvocation();
    } else if (elemTok.type === "IDENT") {
      const parsed = this.parseTemplateOrFunc();
      if (parsed.kind !== "function") {
        const parsedName = parsed.kind === "template" ? parsed.name : "identifier";
        throw new Error(`[${elemTok.line}:${elemTok.col}] List comprehension element must be ContextVar, Func, or Frag invocation, got ${parsed.kind} "${parsedName}"`);
      }
      element = parsed;
    } else {
      throw new Error(`[${elemTok.line}:${elemTok.col}] Expected ContextVar, Func, or Frag invocation in list comprehension, got ${elemTok.type}`);
    }
    this.consume("KEYWORD", "for");
    const variable = this.consume("IDENT").value;
    this.consume("KEYWORD", "in");
    let iterable;
    if (this.peek().value === "range" && this.peekNext().value === "(") {
      iterable = this.parseRangeExpr();
    } else {
      const iterTokens = [];
      while (this.peek().value !== "]") {
        if (this.isEOF()) throw new Error("Unterminated list comprehension");
        iterTokens.push(toExprToken(this.consume()));
      }
      iterable = Iterable({ tokens: iterTokens });
    }
    this.consume("SYMBOL", "]");
    return listComprehension({ element, variable, iterable });
  }
  /**
   * Parse a name reference: $varname with optional indices and path: $docs[i].content
   */
  parseNameRef() {
    this.consume("SYMBOL", "$");
    const varName = this.consume("IDENT").value;
    const indices = this.parseOptionalIndices();
    let path2;
    if (this.match("SYMBOL", ".")) {
      path2 = this.parsePathDesc();
    }
    return nameRef({ name: varName, indices, path: path2 });
  }
  /* ───────────────── Fragment Invocations ───────────────── */
  /**
   * Parse a StrFrag invocation: Frag FragName[args]
   * Used inside role bodies where StrFragInvocation is valid.
   */
  parseStrFragInvocation() {
    this.consume("KEYWORD", "Frag");
    const name = this.consume("IDENT").value;
    let args = [];
    if (this.peek().value === "[") {
      this.consume("SYMBOL", "[");
      if (this.peek().value !== "]") {
        args = this.parseTextArgs();
      }
      this.consume("SYMBOL", "]");
    }
    return strFragInvocation({ name, arguments: args });
  }
  /**
   * Parse a RolesFrag invocation: Frag FragName[args]
   * Used at top level where RolesFragInvocation is valid.
   */
  parseRolesFragInvocation() {
    this.consume("KEYWORD", "Frag");
    const name = this.consume("IDENT").value;
    let args = [];
    if (this.peek().value === "[") {
      this.consume("SYMBOL", "[");
      if (this.peek().value !== "]") {
        args = this.parseTextArgs();
      }
      this.consume("SYMBOL", "]");
    }
    return rolesFragInvocation({ name, arguments: args });
  }
  /* ───────────────── Expressions & Shared Rules ───────────────── */
  parseContextVar() {
    const baseTok = this.consume("KEYWORD");
    const base = baseTok.value;
    const indices = this.parseOptionalIndices();
    let path2;
    if (this.match("SYMBOL", ".")) {
      path2 = this.parsePathDesc();
    }
    const nextTok = this.peek();
    const comment = nextTok.type === "COMMENT" && nextTok.line === this.lastConsumedLine ? this.consume("COMMENT").value : void 0;
    return contextVar({ base, indices, path: path2, comment });
  }
  parsePathDesc() {
    const tok = this.peek();
    console.log(`parsePathDesc: tok=${tok.type}:${tok.value} at ${tok.line}:${tok.col}`);
    if (tok.type !== "IDENT" && tok.type !== "KEYWORD" && tok.type !== "NUMBER") {
      throw new Error(`[${tok.line}:${tok.col}] Expected identifier or number in path, got ${tok.type}`);
    }
    const base = this.consume().value;
    console.log(`parsePathDesc: base=${base}, about to parse indices`);
    const indices = this.parseOptionalIndices();
    console.log(`parsePathDesc: after indices, peek=${this.peek().type}:${this.peek().value}`);
    let next;
    if (this.match("SYMBOL", ".")) {
      console.log(`parsePathDesc: matched dot, recursing`);
      next = this.parsePathDesc();
    }
    return pathDesc({ base, indices, next });
  }
  parseTemplateOrFunc() {
    const name = this.consume("IDENT").value;
    if (name === name.toUpperCase()) {
      let args = [];
      if (this.peek().value === "(") {
        this.consume("SYMBOL", "(");
        args = this.parseTextArgs();
        this.consume("SYMBOL", ")");
      }
      const nextTok = this.peek();
      const comment = nextTok.type === "COMMENT" && nextTok.line === this.lastConsumedLine ? this.consume("COMMENT").value : void 0;
      return template({ name, arguments: args, comment });
    }
    if (this.peek().value === "(") {
      this.consume("SYMBOL", "(");
      const args = this.parseTextArgs();
      this.consume("SYMBOL", ")");
      const indices = this.parseOptionalIndices();
      const nextTok = this.peek();
      const comment = nextTok.type === "COMMENT" && nextTok.line === this.lastConsumedLine ? this.consume("COMMENT").value : void 0;
      return func({ name, arguments: args, indices, comment });
    }
    let path2;
    if (this.match("SYMBOL", ".")) {
      path2 = this.parsePathDesc();
    }
    return otherIndex(identifier({ name, path: path2 }));
  }
  parseTextArgs() {
    const args = [];
    if (this.peek().value === ")" || this.peek().value === "]") return args;
    do {
      const arg = this.parseSingleTextArg();
      args.push(arg);
    } while (this.match("SYMBOL", ","));
    return args;
  }
  /** Parse a single argument, which may be an arithmetic expression */
  parseSingleTextArg() {
    let left = this.parseAtom();
    if (this.peek().type === "ARITH_OP") {
      const operators = [];
      while (this.peek().type === "ARITH_OP") {
        operators.push(this.consume("ARITH_OP").value);
      }
      const right = this.parseSingleTextArg();
      return arithmeticExpr({ operator: operators, left, right });
    }
    return left;
  }
  /** Parse an atomic value: number, time index, context var, name ref, or function/identifier */
  parseAtom() {
    const tok = this.peek();
    if (this.match("SYMBOL", "@")) {
      return timeIndex(this.parseIndexValue());
    }
    if (tok.type === "SYMBOL" && tok.value === "$") {
      return this.parseNameRef();
    }
    if (tok.type === "KEYWORD" && ["env", "sys", "resp", "prompt"].includes(tok.value)) {
      return this.parseContextVar();
    }
    if (tok.type === "KEYWORD" && tok.value === "Frag") {
      return this.parseStrFragInvocation();
    }
    if (tok.type === "NUMBER") {
      const name = this.consume("NUMBER").value;
      let path2;
      if (this.match("SYMBOL", ".")) {
        path2 = this.parsePathDesc();
      }
      return identifier({ name, path: path2 });
    }
    if (tok.type === "IDENT") {
      if (this.peekNext().value === "(") {
        return this.parseTemplateOrFunc();
      }
      const name = this.consume("IDENT").value;
      let path2;
      if (this.match("SYMBOL", ".")) {
        path2 = this.parsePathDesc();
      }
      return otherIndex(identifier({ name, path: path2 }));
    }
    throw new Error(`[${tok.line}:${tok.col}] Unexpected token in arguments: ${tok.type} (${tok.value})`);
  }
  parseOptionalIndices() {
    const indices = [];
    console.log(`parseOptionalIndices: peek=${this.peek().type}:${this.peek().value}`);
    while (this.match("SYMBOL", "[")) {
      console.log(`parseOptionalIndices: found [, parsing index`);
      indices.push(this.parseIndex());
      console.log(`parseOptionalIndices: after parseIndex, peek=${this.peek().type}:${this.peek().value}`);
      while (this.match("SYMBOL", ",")) {
        indices.push(this.parseIndex());
      }
      console.log(`parseOptionalIndices: consuming ], peek=${this.peek().type}:${this.peek().value}`);
      this.consume("SYMBOL", "]");
    }
    console.log(`parseOptionalIndices: returning ${indices.length} indices, peek=${this.peek().type}:${this.peek().value}`);
    return indices;
  }
  parseIndex() {
    console.log(`parseIndex: starting, peek=${this.peek().type}:${this.peek().value}`);
    const time = this.match("SYMBOL", "@");
    console.log(`parseIndex: time=${time}, peek after @check=${this.peek().type}:${this.peek().value}`);
    const value = this.parseIndexValue();
    console.log(`parseIndex: returning ${time ? "time" : "other"}-index`);
    if (time) {
      return timeIndex(value);
    } else {
      return otherIndex(value);
    }
  }
  /**
   * Parse the value inside an index bracket.
   * Can be: ContextVar, Func, Identifier, ArithmeticExpr, NameRef
   */
  parseIndexValue() {
    let left = this.parseIndexAtom();
    if (this.peek().type === "ARITH_OP") {
      const operators = [];
      while (this.peek().type === "ARITH_OP") {
        operators.push(this.consume("ARITH_OP").value);
      }
      const right = this.parseIndexValue();
      return arithmeticExpr({ operator: operators, left, right });
    }
    return left;
  }
  /**
   * Parse an atomic value inside an index (without arithmetic).
   */
  parseIndexAtom() {
    const tok = this.peek();
    if (tok.type === "SYMBOL" && tok.value === "$") {
      return this.parseNameRef();
    }
    if (tok.type === "KEYWORD" && ["sys", "env", "resp", "prompt"].includes(tok.value)) {
      return this.parseContextVar();
    }
    if (tok.type === "NUMBER") {
      const name = this.consume("NUMBER").value;
      let path2;
      if (this.match("SYMBOL", ".")) {
        path2 = this.parsePathDesc();
      }
      return identifier({ name, path: path2 });
    }
    if (tok.type === "IDENT") {
      const name = this.consume("IDENT").value;
      if (this.peek().value === "(") {
        this.consume("SYMBOL", "(");
        const args = this.parseTextArgs();
        this.consume("SYMBOL", ")");
        const indices = this.parseOptionalIndices();
        return func({ name, arguments: args, indices });
      }
      let path2;
      if (this.match("SYMBOL", ".")) {
        path2 = this.parsePathDesc();
      }
      return identifier({ name, path: path2 });
    }
    throw new Error(`[${tok.line}:${tok.col}] Unexpected token in index: ${tok.type} (${tok.value})`);
  }
  /* ───────────────── Control Flow ───────────────── */
  /**
   * Parse an END block: PromptEndsHere when (condition)
   * Conditional early termination that can appear anywhere.
   * Condition is delimited by parentheses, same style as conditionals.
   */
  parseEndBlock() {
    this.consume("IDENT", "PromptEndsHere");
    this.consume("KEYWORD", "when");
    this.consume("SYMBOL", "(");
    const conditionTokens = [];
    let depth = 1;
    while (depth > 0) {
      if (this.isEOF()) throw new Error("Unterminated PromptEndsHere when condition");
      const tok = this.consume();
      if (tok.value === "(") depth++;
      if (tok.value === ")") depth--;
      if (depth > 0) {
        conditionTokens.push(toExprToken(tok));
      }
    }
    return endBlock({ condition: conditionTokens });
  }
  parseLoopOutside() {
    this.consume("KEYWORD", "ForEach");
    this.consume("SYMBOL", "(");
    const index = this.parseIndex();
    this.consume("SYMBOL", ":");
    let iterable;
    if (this.peek().value === "range" && this.peekNext().value === "(") {
      iterable = this.parseRangeExpr();
    } else {
      const iterTokens = [];
      while (!(this.peek().value === ")" && this.peekNext().value === "{")) {
        if (this.isEOF()) throw new Error("Unterminated ForEach iterable");
        iterTokens.push(toExprToken(this.consume()));
      }
      iterable = Iterable({ tokens: iterTokens });
    }
    this.consume("SYMBOL", ")");
    this.consume("SYMBOL", "{");
    const body = [];
    while (this.peek().value !== "}") {
      body.push(this.parseTopLevelBlock());
    }
    this.consume("SYMBOL", "}");
    return loopBlockOutsideRole({ index, iterable, body });
  }
  parseRangeExpr() {
    this.consume("IDENT", "range");
    this.consume("SYMBOL", "(");
    const start = [];
    let depth = 0;
    while (!(this.peek().value === "," && depth === 0)) {
      if (this.isEOF()) throw new Error("Unterminated range expression");
      const tok = this.consume();
      if (tok.value === "(") depth++;
      if (tok.value === ")") depth--;
      start.push(toExprToken(tok));
    }
    this.consume("SYMBOL", ",");
    const end = [];
    depth = 0;
    while (!((this.peek().value === "," || this.peek().value === ")") && depth === 0)) {
      if (this.isEOF()) throw new Error("Unterminated range expression");
      const tok = this.consume();
      if (tok.value === "(") depth++;
      if (tok.value === ")") depth--;
      end.push(toExprToken(tok));
    }
    let step;
    if (this.peek().value === ",") {
      this.consume("SYMBOL", ",");
      step = [];
      depth = 0;
      while (!(this.peek().value === ")" && depth === 0)) {
        if (this.isEOF()) throw new Error("Unterminated range expression");
        const tok = this.consume();
        if (tok.value === "(") depth++;
        if (tok.value === ")") depth--;
        step.push(toExprToken(tok));
      }
    }
    this.consume("SYMBOL", ")");
    return rangeExpr({ start, end, step });
  }
  parseConditionalOutside() {
    this.consume("KEYWORD", "If");
    const ifCondTokens = [];
    while (this.peek().value !== "{") {
      if (this.isEOF()) throw new Error("Unterminated If condition");
      ifCondTokens.push(toExprToken(this.consume()));
    }
    this.consume("SYMBOL", "{");
    const ifBody = [];
    while (this.peek().value !== "}") {
      ifBody.push(this.parseTopLevelBlock());
    }
    this.consume("SYMBOL", "}");
    const elseIfConditions = [];
    const elseIfBodies = [];
    let elseBody = void 0;
    while (this.peek().type === "KEYWORD" && (this.peek().value === "ElseIf" || this.peek().value === "Else")) {
      const type = this.consume().value;
      if (type === "ElseIf") {
        const eiCondTokens = [];
        while (this.peek().value !== "{") {
          eiCondTokens.push(toExprToken(this.consume()));
        }
        this.consume("SYMBOL", "{");
        const eiBody = [];
        while (this.peek().value !== "}") {
          eiBody.push(this.parseTopLevelBlock());
        }
        this.consume("SYMBOL", "}");
        elseIfConditions.push(eiCondTokens);
        elseIfBodies.push(eiBody);
      } else if (type === "Else") {
        this.consume("SYMBOL", "{");
        const eBody = [];
        while (this.peek().value !== "}") {
          eBody.push(this.parseTopLevelBlock());
        }
        this.consume("SYMBOL", "}");
        elseBody = eBody;
        break;
      }
    }
    return conditionalBlockOutsideRole({
      Ifcondition: ifCondTokens,
      IfBody: ifBody,
      elseif: elseIfConditions,
      elseifBody: elseIfBodies,
      elseBody
    });
  }
  parseLoopInside() {
    this.consume("KEYWORD", "ForEach");
    this.consume("SYMBOL", "(");
    const index = this.parseIndex();
    this.consume("SYMBOL", ":");
    let iterable;
    if (this.peek().value === "range" && this.peekNext().value === "(") {
      iterable = this.parseRangeExpr();
    } else {
      const iterTokens = [];
      while (!(this.peek().value === ")" && this.peekNext().value === "{")) {
        if (this.isEOF()) throw new Error("Unterminated ForEach iterable");
        iterTokens.push(toExprToken(this.consume()));
      }
      iterable = Iterable({ tokens: iterTokens });
    }
    this.consume("SYMBOL", ")");
    this.consume("SYMBOL", "{");
    const body = [];
    while (this.peek().value !== "}") body.push(this.parseRoleBuildingBlock());
    this.consume("SYMBOL", "}");
    return loopBlockInsideRole({ index, iterable, body });
  }
  parseConditionalInside() {
    this.consume("KEYWORD", "If");
    const ifCondTokens = [];
    while (this.peek().value !== "{") {
      if (this.isEOF()) throw new Error("Unterminated If condition");
      ifCondTokens.push(toExprToken(this.consume()));
    }
    this.consume("SYMBOL", "{");
    const ifBody = [];
    while (this.peek().value !== "}") {
      ifBody.push(this.parseRoleBuildingBlock());
    }
    this.consume("SYMBOL", "}");
    const elseIfConditions = [];
    const elseIfBodies = [];
    let elseBody = void 0;
    while (this.peek().type === "KEYWORD" && (this.peek().value === "ElseIf" || this.peek().value === "Else")) {
      const type = this.consume().value;
      if (type === "ElseIf") {
        const eiCondTokens = [];
        while (this.peek().value !== "{") {
          eiCondTokens.push(toExprToken(this.consume()));
        }
        this.consume("SYMBOL", "{");
        const eiBody = [];
        while (this.peek().value !== "}") {
          eiBody.push(this.parseRoleBuildingBlock());
        }
        this.consume("SYMBOL", "}");
        elseIfConditions.push(eiCondTokens);
        elseIfBodies.push(eiBody);
      } else if (type === "Else") {
        this.consume("SYMBOL", "{");
        const eBody = [];
        while (this.peek().value !== "}") {
          eBody.push(this.parseRoleBuildingBlock());
        }
        this.consume("SYMBOL", "}");
        elseBody = eBody;
        break;
      }
    }
    return conditionalBlockInsideRole({
      Ifcondition: ifCondTokens,
      IfBody: ifBody,
      elseif: elseIfConditions,
      elseifBody: elseIfBodies,
      elseBody
    });
  }
  // parseSwitchOutside and parseSwitchInside would follow the same scoping pattern.
  parseSwitchOutside() {
    this.consume("KEYWORD", "Switch");
    const exprTokens = [];
    while (this.peek().value !== "{") {
      if (this.isEOF()) throw new Error("Expected '{' after Switch expression");
      exprTokens.push(toExprToken(this.consume()));
    }
    this.consume("SYMBOL", "{");
    const cases = [];
    let defaultCase;
    while (this.peek().value !== "}") {
      const kw = this.consume("KEYWORD").value;
      if (kw === "Case") {
        const matchTokens = [];
        while (this.peek().value !== "{") {
          if (this.isEOF()) throw new Error("Expected '{' after Case match");
          matchTokens.push(toExprToken(this.consume()));
        }
        this.consume("SYMBOL", "{");
        const body = [];
        while (this.peek().value !== "}") {
          body.push(this.parseTopLevelBlock());
        }
        this.consume("SYMBOL", "}");
        cases.push(caseBlockOutsideRole({ match: matchTokens, body }));
      } else if (kw === "Default") {
        this.consume("SYMBOL", "{");
        const body = [];
        while (this.peek().value !== "}") {
          body.push(this.parseTopLevelBlock());
        }
        this.consume("SYMBOL", "}");
        defaultCase = defaultCaseBlockOutsideRole({ body });
      }
    }
    this.consume("SYMBOL", "}");
    return switchBlockOutsideRole({
      expression: exprTokens,
      cases,
      defaultCase
    });
  }
  parseSwitchInside() {
    this.consume("KEYWORD", "Switch");
    const exprTokens = [];
    while (this.peek().value !== "{") {
      if (this.isEOF()) throw new Error("Expected '{' after Switch expression");
      exprTokens.push(toExprToken(this.consume()));
    }
    this.consume("SYMBOL", "{");
    const cases = [];
    let defaultCase;
    while (this.peek().value !== "}") {
      const kw = this.consume("KEYWORD").value;
      if (kw === "Case") {
        const matchTokens = [];
        while (this.peek().value !== "{") {
          if (this.isEOF()) throw new Error("Expected '{' after Case match");
          matchTokens.push(toExprToken(this.consume()));
        }
        this.consume("SYMBOL", "{");
        const body = [];
        while (this.peek().value !== "}") {
          body.push(this.parseRoleBuildingBlock());
        }
        this.consume("SYMBOL", "}");
        cases.push(caseBlockInsideRole({ match: matchTokens, body }));
      } else if (kw === "Default") {
        this.consume("SYMBOL", "{");
        const body = [];
        while (this.peek().value !== "}") {
          body.push(this.parseRoleBuildingBlock());
        }
        this.consume("SYMBOL", "}");
        defaultCase = defaultCaseBlockInsideRole({ body });
      }
    }
    this.consume("SYMBOL", "}");
    return switchBlockInsideRole({
      expression: exprTokens,
      cases,
      defaultCase
    });
  }
  parseOptionalComment() {
    if (this.peek().type === "COMMENT") {
      return this.consume("COMMENT").value;
    }
    return void 0;
  }
  isEOF() {
    return this.peek().type === "EOF";
  }
};

// src/diagnostics.ts
function registerDiagnostics(context) {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection("acdl");
  context.subscriptions.push(diagnosticCollection);
  const diagnose = (document) => {
    console.log("ACDL diagnose called for:", document.uri.toString());
    if (document.languageId !== "acdl") return;
    const diagnostics = [];
    try {
      new Parser(document.getText()).parseFile();
    } catch (err) {
      console.log("ACDL Parse Error:", err.message);
      const match = err.message.match(/\[(\d+):(\d+)\]\s*(.*)/s);
      if (match) {
        const line = Math.max(0, parseInt(match[1]) - 1);
        const col = Math.max(0, parseInt(match[2]) - 1);
        const endCol = col + 10;
        const docLine = document.lineAt(Math.min(line, document.lineCount - 1));
        const range = new vscode.Range(
          docLine.lineNumber,
          Math.min(col, docLine.text.length),
          docLine.lineNumber,
          Math.min(endCol, docLine.text.length)
        );
        diagnostics.push(
          new vscode.Diagnostic(range, match[3], vscode.DiagnosticSeverity.Error)
        );
      } else {
        diagnostics.push(
          new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 1),
            err.message,
            vscode.DiagnosticSeverity.Error
          )
        );
      }
    }
    console.log("ACDL setting diagnostics:", diagnostics.length, "errors");
    diagnosticCollection.set(document.uri, diagnostics);
  };
  let timeout;
  vscode.workspace.onDidChangeTextDocument(
    (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => diagnose(e.document), 300);
    },
    null,
    context.subscriptions
  );
  vscode.workspace.onDidOpenTextDocument(diagnose, null, context.subscriptions);
  vscode.workspace.textDocuments.forEach(diagnose);
}

// src/preview.ts
var vscode2 = __toESM(require("vscode"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));

// ../src/renderPrompt.ts
function wrapBlock(cls, headerHtml, bodyHtml) {
  return `
<div class="${cls}">
  <div class="${cls}-header">${headerHtml}</div>
  <div class="block-children">
    ${bodyHtml}
  </div>
</div>`;
}
function renderPrompt(prompt2, style = "default") {
  const titleHtml = renderPromptTitle(prompt2.title);
  const bodyHtml = renderPromptBody(prompt2.body);
  return `<div class="prompt-container prompt-style-${style}">${titleHtml}${bodyHtml}</div>`;
}
function renderPrompts(blocks, style = "default") {
  const parts = [];
  let lastWasDefinition = false;
  for (const block of blocks) {
    if (block.kind === "prompt") {
      if (lastWasDefinition) {
        parts.push('<div class="prompt-divider"></div>');
      }
      parts.push(renderPrompt(block, style));
      lastWasDefinition = true;
    } else if (block.kind === "str-frag-def") {
      if (lastWasDefinition) {
        parts.push('<div class="prompt-divider"></div>');
      }
      parts.push(renderStrFragDef(block, style));
      lastWasDefinition = true;
    } else if (block.kind === "roles-frag-def") {
      if (lastWasDefinition) {
        parts.push('<div class="prompt-divider"></div>');
      }
      parts.push(renderRolesFragDef(block, style));
      lastWasDefinition = true;
    } else if (block.kind === "comment-block") {
      parts.push(`<div class="file-comment">// ${escapeHtml(block.text)}</div>`);
      lastWasDefinition = false;
    }
  }
  return parts.join("");
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function renderExpressionTokens(tokens) {
  const result = [];
  let i = 0;
  const pushContent = (html) => {
    result.push(html);
  };
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.type === "KEYWORD" && ["env", "sys", "resp", "prompt"].includes(tok.value) && i + 1 < tokens.length && tokens[i + 1].type === "SYMBOL" && tokens[i + 1].value === ".") {
      const contextVarTokens = [tok.value];
      i++;
      let parenDepth = 0;
      let bracketDepth = 0;
      while (i < tokens.length) {
        const t = tokens[i];
        if (t.value === "[") {
          if (bracketDepth === 0) {
            contextVarTokens.push('<span class="index-bracket">[');
          } else {
            contextVarTokens.push("[");
          }
          bracketDepth++;
          i++;
          continue;
        }
        if (t.value === "]") {
          bracketDepth--;
          if (bracketDepth === 0) {
            contextVarTokens.push("]</span>");
          } else {
            contextVarTokens.push("]");
          }
          i++;
          if (bracketDepth === 0 && parenDepth === 0) {
            if (i < tokens.length && tokens[i].value === ".") {
              continue;
            }
            break;
          }
          continue;
        }
        if (t.value === "(") {
          if (parenDepth === 0) {
            contextVarTokens.push('<span class="paren-content">(');
          } else {
            contextVarTokens.push("(");
          }
          parenDepth++;
          i++;
          continue;
        }
        if (t.value === ")") {
          parenDepth--;
          if (parenDepth === 0) {
            contextVarTokens.push(")</span>");
          } else {
            contextVarTokens.push(")");
          }
          i++;
          if (bracketDepth === 0 && parenDepth === 0) {
            if (i < tokens.length && tokens[i].value === ".") {
              continue;
            }
            break;
          }
          continue;
        }
        if (t.value === "@" && i + 1 < tokens.length) {
          const nextTok = tokens[i + 1];
          if (nextTok.type === "SYMBOL" && nextTok.value === "$" && i + 2 < tokens.length) {
            const varNameTok = tokens[i + 2];
            if (varNameTok.type === "IDENT") {
              const varName = escapeHtml(varNameTok.value);
              contextVarTokens.push(`<span class="time-index"><span class="at-symbol">@</span><span class="name-ref">${varName}</span></span>`);
              i += 3;
              continue;
            }
          }
          if (nextTok.type === "IDENT" || nextTok.type === "NUMBER") {
            let timeIndexName = escapeHtml(nextTok.value);
            i += 2;
            while (i < tokens.length && tokens[i].value === "." && i + 1 < tokens.length && (tokens[i + 1].type === "IDENT" || tokens[i + 1].type === "NUMBER" || tokens[i + 1].value === "@")) {
              timeIndexName += ".";
              i++;
              if (tokens[i].value === "@") {
                timeIndexName += "@";
                i++;
              }
              if (i < tokens.length && (tokens[i].type === "IDENT" || tokens[i].type === "NUMBER")) {
                timeIndexName += escapeHtml(tokens[i].value);
                i++;
              }
            }
            contextVarTokens.push(`<span class="time-index"><span class="at-symbol">@</span>${timeIndexName}</span>`);
            continue;
          }
        }
        if (t.value === "$" && i + 1 < tokens.length) {
          const nextTok = tokens[i + 1];
          if (nextTok.type === "IDENT") {
            const varName = escapeHtml(nextTok.value);
            contextVarTokens.push(`<span class="name-ref">${varName}</span>`);
            i += 2;
            continue;
          }
        }
        if (parenDepth > 0 || bracketDepth > 0) {
          contextVarTokens.push(escapeHtml(t.value));
          i++;
          continue;
        }
        if (t.value === "." || t.type === "IDENT" || t.type === "KEYWORD" || t.value === "@" || t.type === "NUMBER") {
          if (t.value === "." && parenDepth === 0 && bracketDepth === 0) {
            contextVarTokens.push(".<wbr>");
          } else {
            contextVarTokens.push(escapeHtml(t.value));
          }
          i++;
          continue;
        }
        break;
      }
      pushContent(`<span class="expr-context-var">${contextVarTokens.join("")}</span>`);
      continue;
    }
    if (tok.type === "IDENT" && tok.value === "range" && i + 1 < tokens.length && tokens[i + 1].value === "(") {
      i++;
      i++;
      const startTokens = [];
      let depth = 0;
      while (i < tokens.length && !(tokens[i].value === "," && depth === 0)) {
        const t = tokens[i];
        if (t.value === "(") depth++;
        if (t.value === ")") depth--;
        startTokens.push(t);
        i++;
      }
      i++;
      const endTokens = [];
      depth = 0;
      while (i < tokens.length && !((tokens[i].value === "," || tokens[i].value === ")") && depth === 0)) {
        const t = tokens[i];
        if (t.value === "(") depth++;
        if (t.value === ")") depth--;
        endTokens.push(t);
        i++;
      }
      let stepTokens;
      if (i < tokens.length && tokens[i].value === ",") {
        i++;
        stepTokens = [];
        depth = 0;
        while (i < tokens.length && !(tokens[i].value === ")" && depth === 0)) {
          const t = tokens[i];
          if (t.value === "(") depth++;
          if (t.value === ")") depth--;
          stepTokens.push(t);
          i++;
        }
      }
      i++;
      const startHtml = renderExpressionTokens(startTokens);
      const endHtml = renderExpressionTokens(endTokens);
      const stepHtml = stepTokens ? `<span class="range-step"><span class="range-keyword">every</span><span class="range-step-value">${renderExpressionTokens(stepTokens)}</span></span>` : "";
      pushContent(`<span class="range-expr"><span class="range-start">${startHtml}</span><span class="range-dots">...</span><span class="range-end">${endHtml}</span>${stepHtml}</span><wbr>`);
      continue;
    }
    if (tok.type === "IDENT" && i + 1 < tokens.length && tokens[i + 1].value === "(") {
      const funcName = escapeHtml(tok.value);
      i++;
      i++;
      const argTokens = [];
      let depth = 1;
      while (i < tokens.length && depth > 0) {
        const t = tokens[i];
        if (t.value === "(") depth++;
        if (t.value === ")") depth--;
        if (depth > 0) {
          argTokens.push(t);
        }
        i++;
      }
      const argsHtml = renderExpressionTokens(argTokens);
      const isBuiltinMath = tok.value === "min" || tok.value === "max";
      if (isBuiltinMath) {
        pushContent(`<span class="builtin-func">${funcName}(${argsHtml})</span><wbr>`);
      } else {
        pushContent(`<span class="func-block"><span class="func-name">${funcName}</span><span class="func-parens">(</span>${argsHtml}<span class="func-parens">)</span></span><wbr>`);
      }
      continue;
    }
    if (tok.type === "LOGIC_OP") {
      let combined = tok.value;
      i++;
      while (i < tokens.length && tokens[i].type === "LOGIC_OP") {
        combined += tokens[i].value;
        i++;
      }
      const isConnective = combined === "&&" || combined === "||" || combined === "&" || combined === "|";
      const className = isConnective ? "expr-connective" : "expr-logic-op";
      pushContent(`<span class="${className}">${escapeHtml(combined)}</span>`);
      continue;
    }
    if (tok.type === "SYMBOL" && tok.value === "@" && i + 1 < tokens.length) {
      const nextTok = tokens[i + 1];
      if (nextTok.type === "SYMBOL" && nextTok.value === "$" && i + 2 < tokens.length) {
        const varNameTok = tokens[i + 2];
        if (varNameTok.type === "IDENT") {
          const varName = escapeHtml(varNameTok.value);
          pushContent(`<span class="time-index"><span class="at-symbol">@</span><span class="name-ref">${varName}</span></span>`);
          i += 3;
          continue;
        }
      }
      if (nextTok.type === "IDENT" || nextTok.type === "NUMBER") {
        let timeIndexName = escapeHtml(nextTok.value);
        i += 2;
        while (i < tokens.length && tokens[i].value === "." && i + 1 < tokens.length && (tokens[i + 1].type === "IDENT" || tokens[i + 1].type === "NUMBER" || tokens[i + 1].value === "@")) {
          timeIndexName += ".";
          i++;
          if (tokens[i].value === "@") {
            timeIndexName += "@";
            i++;
          }
          if (i < tokens.length && (tokens[i].type === "IDENT" || tokens[i].type === "NUMBER")) {
            timeIndexName += escapeHtml(tokens[i].value);
            i++;
          }
        }
        pushContent(`<span class="time-index"><span class="at-symbol">@</span>${timeIndexName}</span>`);
        continue;
      }
    }
    if (tok.type === "SYMBOL" && tok.value === "$" && i + 1 < tokens.length) {
      const nextTok = tokens[i + 1];
      if (nextTok.type === "IDENT") {
        const varName = escapeHtml(nextTok.value);
        pushContent(`<span class="name-ref">${varName}</span>`);
        i += 2;
        continue;
      }
    }
    const escaped = escapeHtml(tok.value);
    switch (tok.type) {
      case "KEYWORD":
        if (tok.value === "and" || tok.value === "or") {
          pushContent(`<span class="expr-keyword">${escaped}</span>`);
        } else {
          pushContent(`<span class="keyword">${escaped}</span>`);
        }
        break;
      case "IDENT":
        pushContent(`<span class="expr-ident">${escaped}</span>`);
        break;
      case "NUMBER":
        pushContent(`<span class="expr-number">${escaped}</span>`);
        break;
      case "SYMBOL":
        if (tok.value === "@") {
          pushContent(`<span class="expr-at">@</span>`);
        } else if (tok.value === ".") {
          pushContent(`<span class="expr-dot">.</span>`);
        } else if (tok.value === ",") {
          pushContent(`<wbr><span class="expr-symbol">,</span>`);
        } else {
          pushContent(`<span class="expr-symbol">${escaped}</span>`);
        }
        break;
      case "ARITH_OP":
        pushContent(`<span class="expr-arith-op">${escaped}</span>`);
        break;
      case "RANGE":
        pushContent(`<span class="expr-range">${escaped}</span>`);
        break;
      case "STRING":
        pushContent(`<span class="expr-string">"${escaped}"</span>`);
        break;
      default:
        pushContent(escaped);
    }
    i++;
  }
  return result.join("");
}
function renderPromptTitle(title) {
  const indexSuffix = renderIndexList(title.indices);
  return `<div class="prompt-title"><h1>${escapeHtml(title.name)}${indexSuffix}</h1></div>`;
}
function renderPathDesc(path2) {
  const segments = [];
  let current = path2;
  while (current) {
    const segIndexText = current.indices.length > 0 ? renderIndexList(current.indices) : "";
    segments.push(`${escapeHtml(current.base)}${segIndexText}`);
    current = current.next;
  }
  return segments.join(".");
}
function renderIndexContent(value) {
  switch (value.kind) {
    case "identifier":
      let result = escapeHtml(value.name);
      if (value.path) {
        result += "." + renderPathDesc(value.path);
      }
      const isNumber = /^\d+$/.test(value.name);
      const className = isNumber ? "index-number" : "index-identifier";
      return `<span class="${className}">${result}</span>`;
    case "context-var":
      return renderContextVarBlock(value);
    case "function":
      return renderFuncBlock(value);
    case "arithmetic":
      const left = renderIndexContent(value.left);
      const ops = value.operator.join("");
      const right = renderIndexContent(value.right);
      return `<span class="arithmetic-expr">${left}<span class="arith-op">${escapeHtml(ops)}</span>${right}</span>`;
    case "name-ref":
      return `<span class="name-ref">${escapeHtml(value.name)}</span>`;
  }
}
function renderIndexValue(index) {
  const content = renderIndexContent(index.value);
  return index.kind === "time-index" ? `<span class="time-index"><span class="at-symbol">@</span>${content}</span>` : `<span class="other-index">${content}</span>`;
}
function renderIndexList(indices) {
  if (indices.length === 0) return "";
  return `[${indices.map((idx) => renderIndexValue(idx)).join(",")}]`;
}
function renderPromptBody(body) {
  if (body.kind === "chat-prompt-body") {
    return body.body.map(renderPromptBodyItem).join("\n");
  } else {
    return renderNoneMessage(body.message);
  }
}
function renderNoneMessage(msg) {
  const bodyHtml = msg.body.map((b) => {
    return `<div class="role-body-block">${renderRoleBuildingBlock(b)}</div>`;
  }).join("\n");
  return `
<div class="none-message completion-prompt">
  <div class="none-message-header">Completion Prompt (no role)</div>
  ${bodyHtml}
</div>`;
}
function renderPromptBodyItem(item) {
  if (item.kind === "mark-block") {
    return renderMarkBlock(item);
  }
  return renderTopLevelBlock(item);
}
function renderTopLevelBlock(block) {
  switch (block.kind) {
    case "role-message":
      return renderRoleMessage(block);
    case "conditional-block-outside-role":
      return renderConditionalOutsideRole(block);
    case "loop-block-outside-role":
      return renderLoopOutsideRole(block);
    case "switch-block-outside-role":
      return renderSwitchOutsideRole(block);
    case "comment-block":
      return renderCommentBlock(block);
    case "mark-block":
      return renderMarkBlock(block);
    case "name-def":
      return renderNameDef(block);
    case "end-block":
      return renderEndBlock(block);
    case "roles-frag-invocation":
      return renderRolesFragInvocation(block);
    default:
      return "";
  }
}
function renderCommentBlock(block) {
  return `<div class="comment-block">// ${escapeHtml(block.text)}</div>`;
}
function renderNameDef(block) {
  const varName = escapeHtml(block.name);
  let valueHtml;
  if (block.value.kind === "context-var") {
    valueHtml = renderContextVarBlock(block.value);
  } else if (block.value.kind === "function") {
    valueHtml = renderFuncBlock(block.value);
  } else if (block.value.kind === "list-comprehension") {
    valueHtml = renderListComprehension(block.value);
  } else {
    valueHtml = renderStrFragInvocation(block.value);
  }
  return `<div class="name-def"><span class="keyword">Name</span> <span class="name-ref"><span class="segment">${varName}</span></span> <span class="name-assign">:=</span> ${valueHtml}</div>`;
}
function renderListComprehension(block) {
  let elementHtml;
  if (block.element.kind === "context-var") {
    elementHtml = renderContextVarBlock(block.element);
  } else if (block.element.kind === "function") {
    elementHtml = renderFuncBlock(block.element);
  } else {
    elementHtml = renderStrFragInvocation(block.element);
  }
  const iterableHtml = renderIterable(block.iterable);
  return `<span class="list-comp-wrapper"><span class="list-comprehension">[</span> ${elementHtml} <span class="list-comp-separator">|</span> <span class="list-comp-var">${escapeHtml(block.variable)}</span> <span class="list-comp-in">\u2208</span> ${iterableHtml} <span class="list-comprehension">]</span></span>`;
}
function renderNameRef(block) {
  const segments = [];
  const rootIndices = block.indices;
  const rootIndexText = rootIndices.length > 0 ? renderIndexList(block.indices) : "";
  segments.push(
    `<span class="segment">${escapeHtml(block.name)}${rootIndexText}</span>`
  );
  let current = block.path;
  while (current) {
    const segIndices = current.indices;
    const segIndexText = segIndices.length > 0 ? renderIndexList(current.indices) : "";
    segments.push(
      `<span class="segment">.${escapeHtml(current.base)}${segIndexText}</span>`
    );
    current = current.next;
  }
  const joined = segments.join("");
  return `<span class="name-ref">${joined}</span>`;
}
function renderMarkBlock(block) {
  const bodyHtml = block.body.map((b) => renderTopLevelBlock(b)).join("\n");
  const markNum = block.markNumber !== void 0 && !isNaN(block.markNumber) ? block.markNumber : 0;
  return `
<div class="mark-block">
  <div class="mark-block-content">
    ${bodyHtml}
  </div>
  <div class="mark-block-bracket">
    <span class="mark-bracket-line"></span>
    <span class="mark-bracket-number">${markNum}</span>
  </div>
</div>`;
}
function renderMarkBlockInsideRole(block) {
  const bodyHtml = block.body.map((b) => renderRoleBuildingBlock(b)).join("\n");
  const markNum = block.markNumber !== void 0 && !isNaN(block.markNumber) ? block.markNumber : 0;
  return `
<div class="mark-block">
  <div class="mark-block-content">
    ${bodyHtml}
  </div>
  <div class="mark-block-bracket">
    <span class="mark-bracket-line"></span>
    <span class="mark-bracket-number">${markNum}</span>
  </div>
</div>`;
}
function renderEndBlock(block) {
  const conditionHtml = renderExpressionTokens(block.condition);
  return `<div class="end-block"><span class="end-dashed-line"></span><span class="end-text"><span class="end-keyword">PromptEndsHere</span> <span class="keyword">when</span> <span class="condition-expr">${conditionHtml}</span></span></div>`;
}
function renderRoleMessage(msg) {
  const roleClass = escapeHtml(msg.role);
  const bodyHtml = msg.body.map((b) => {
    return `<div class="role-body-block">${renderRoleBuildingBlock(b)}</div>`;
  }).join("\n");
  return `
<div class="role-message ${roleClass}">
  <div class="role-message-header">Role: ${escapeHtml(msg.role)}</div>
  ${bodyHtml}
</div>`;
}
function renderRoleBuildingBlock(block) {
  switch (block.kind) {
    case "template":
      return renderTemplateBlock(block);
    case "context-var":
      return renderContextVarBlock(block);
    case "function":
      return renderFuncBlock(block);
    case "conditional-block-inside-role":
      return renderConditionalInsideRole(block);
    case "loop-block-inside-role":
      return renderLoopInsideRole(block);
    case "switch-block-inside-role":
      return renderSwitchInsideRole(block);
    case "mark-block-inside-role":
      return renderMarkBlockInsideRole(block);
    case "comment-block":
      return renderCommentBlock(block);
    case "name-def":
      return renderNameDef(block);
    case "name-ref":
      return renderNameRef(block);
    case "other-index":
      return renderIndexValue(block);
    case "end-block":
      return renderEndBlock(block);
    case "str-frag-invocation":
      return renderStrFragInvocation(block);
    default:
      return "";
  }
}
function renderFuncBlock(block) {
  if (block.name === "range" && block.arguments.length >= 2) {
    const startHtml = renderTextArgs(block.arguments[0]);
    const endHtml = renderTextArgs(block.arguments[1]);
    const stepHtml = block.arguments.length >= 3 ? `<span class="range-step"><span class="range-keyword">every</span><span class="range-step-value">${renderTextArgs(block.arguments[2])}</span></span>` : "";
    const rangeCore = `<span class="range-expr"><span class="range-start">${startHtml}</span><span class="range-dots">...</span><span class="range-end">${endHtml}</span>${stepHtml}</span>`;
    if (block.comment) {
      return `<span class="block-with-comment">${rangeCore}<span class="inline-comment"> // ${escapeHtml(block.comment)}</span></span>`;
    }
    return rangeCore;
  }
  const argsText = block.arguments.map(renderTextArgs).join(", ");
  const resultIndices = block.indices && block.indices.length > 0 ? renderIndexList(block.indices) : "";
  const isBuiltinMath = block.name === "min" || block.name === "max";
  const funcCore = isBuiltinMath ? `<span class="builtin-func">${escapeHtml(block.name)}(${argsText})${resultIndices}</span>` : `<span class="func-block"><span class="func-name">${escapeHtml(block.name)}</span><span class="func-args-wrapper">(${argsText})${resultIndices}</span></span>`;
  if (block.comment) {
    return `<span class="block-with-comment">${funcCore}<span class="inline-comment"> // ${escapeHtml(block.comment)}</span></span>`;
  }
  return funcCore;
}
function renderTextArgs(arg) {
  switch (arg.kind) {
    case "context-var":
      return renderContextVarBlock(arg);
    case "function":
      return renderFuncBlock(arg);
    case "time-index":
    case "other-index":
      return renderIndexValue(arg);
    case "identifier":
      let result = escapeHtml(arg.name);
      if (arg.path) {
        result += "." + renderPathDesc(arg.path);
      }
      return `<span class="identifier">${result}</span>`;
    case "arithmetic":
      const left = renderTextArgs(arg.left);
      const ops = arg.operator.join("");
      const right = renderTextArgs(arg.right);
      return `<span class="arithmetic-expr">${left}${escapeHtml(ops)}${right}</span>`;
    case "name-ref":
      return renderNameRef(arg);
    case "str-frag-invocation":
      return renderStrFragInvocation(arg);
  }
}
function renderTemplateBlock(block) {
  const argsText = block.arguments.length > 0 ? `(${block.arguments.map(renderTextArgs).join(", ")})` : "";
  const core = `<span class="template-block"><span class="template-name-and-args">${escapeHtml(
    block.name
  )}${argsText}</span></span>`;
  if (block.comment) {
    return `<span class="block-with-comment">${core}<span class="comment"> // ${escapeHtml(block.comment)}</span></span>`;
  }
  return core;
}
function renderContextVarBlock(block) {
  const segments = [];
  const rootIndices = block.indices;
  const rootIndexText = rootIndices.length > 0 ? renderIndexList(block.indices) : "";
  segments.push(
    `<span class="segment base">${escapeHtml(block.base)}${rootIndexText}</span>`
  );
  let current = block.path;
  while (current) {
    const segIndices = current.indices;
    const segIndexText = segIndices.length > 0 ? renderIndexList(current.indices) : "";
    segments.push(
      `<span class="segment">.${escapeHtml(current.base)}${segIndexText}</span>`
    );
    current = current.next;
  }
  const joined = segments.join("");
  const namespaceClass = `context-var-${block.base.toLowerCase()}`;
  if (block.comment) {
    return `<span class="block-with-comment"><span class="context-var ${namespaceClass}">${joined}</span><span class="inline-comment"> // ${escapeHtml(block.comment)}</span></span>`;
  }
  return `<span class="context-var ${namespaceClass}">${joined}</span>`;
}
function renderIterable(iterable) {
  if (iterable.kind === "range-expr") {
    return renderRangeExpr(iterable);
  } else {
    return renderExpressionTokens(iterable.tokens);
  }
}
function renderRangeExpr(range) {
  const startHtml = renderExpressionTokens(range.start);
  const endHtml = renderExpressionTokens(range.end);
  const stepHtml = range.step ? `<span class="range-step"><span class="range-keyword">every</span><span class="range-step-value">${renderExpressionTokens(range.step)}</span></span>` : "";
  return `<span class="range-expr"><span class="range-start">${startHtml}</span><span class="range-dots">...</span><span class="range-end">${endHtml}</span>${stepHtml}</span>`;
}
function renderLoopOutsideRole(block) {
  const indexHtml = `<span class="loop-var">${renderIndexContent(block.index.value)}</span>`;
  const iterableHtml = `<span class="loop-iterable">${renderIterable(block.iterable)}</span>`;
  const header = `<span class="keyword">ForEach</span> ${indexHtml}: ${iterableHtml}`;
  const bodyHtml = block.body.map(
    (child) => `<div class="loop-child">${renderTopLevelBlock(child)}</div>`
  ).join("\n");
  return wrapBlock(
    "loop-block-outside-role",
    header,
    bodyHtml
  );
}
function renderLoopInsideRole(block) {
  const indexHtml = `<span class="loop-var">${renderIndexContent(block.index.value)}</span>`;
  const iterableHtml = `<span class="loop-iterable">${renderIterable(block.iterable)}</span>`;
  const header = `<span class="keyword">ForEach</span> ${indexHtml}: ${iterableHtml}`;
  const bodyHtml = block.body.map(
    (child) => `<div class="role-loop-child">${renderRoleBuildingBlock(child)}</div>`
  ).join("\n");
  return wrapBlock("loop-block-inside-role", header, bodyHtml);
}
function renderSwitchOutsideRole(block) {
  const exprHtml = `<span class="switch-expr">${renderExpressionTokens(block.expression)}</span>`;
  const header = `<span class="keyword">Switch</span>(${exprHtml}):`;
  const casesHtml = block.cases.map((c) => {
    const bodyHtml = c.body.map(
      (child) => `<div class="switch-child">${renderTopLevelBlock(child)}</div>`
    ).join("\n");
    return wrapBlock(
      "switch-case",
      `<span class="keyword">Case</span> <span class="case-match">${renderExpressionTokens(c.match)}</span>:`,
      bodyHtml
    );
  }).join("\n");
  const defaultHtml = block.defaultCase ? (() => {
    const bodyHtml = block.defaultCase.body.map(
      (child) => `<div class="switch-child">${renderTopLevelBlock(child)}</div>`
    ).join("\n");
    return wrapBlock(
      "switch-default",
      `<span class="keyword">Default</span>:`,
      bodyHtml
    );
  })() : "";
  return wrapBlock(
    "switch-block-outside-role",
    header,
    `${casesHtml}${defaultHtml}`
  );
}
function renderSwitchInsideRole(block) {
  const exprHtml = `<span class="switch-expr">${renderExpressionTokens(block.expression)}</span>`;
  const header = `<span class="keyword">Switch</span>(${exprHtml}):`;
  const casesHtml = block.cases.map((c) => {
    const bodyHtml = c.body.map(
      (child) => `<div class="role-switch-child">${renderRoleBuildingBlock(child)}</div>`
    ).join("\n");
    return wrapBlock(
      "switch-case",
      `<span class="keyword">Case</span> <span class="case-match">${renderExpressionTokens(c.match)}</span>:`,
      bodyHtml
    );
  }).join("\n");
  const defaultHtml = block.defaultCase ? (() => {
    const bodyHtml = block.defaultCase.body.map(
      (child) => `<div class="role-switch-child">${renderRoleBuildingBlock(child)}</div>`
    ).join("\n");
    return wrapBlock(
      "switch-default",
      `<span class="keyword">Default</span>:`,
      bodyHtml
    );
  })() : "";
  return wrapBlock(
    "switch-block-inside-role",
    header,
    `${casesHtml}${defaultHtml}`
  );
}
function renderConditionalInsideRole(block) {
  const renderBody = (body) => body.map(
    (child) => `<div class="role-condition-child">${renderRoleBuildingBlock(child)}</div>`
  ).join("\n");
  const ifHeader = `<span class="keyword">If</span> <span class="condition-expr">${renderExpressionTokens(block.Ifcondition)}</span>:`;
  let result = wrapBlock("conditional-block-inside-role", ifHeader, renderBody(block.IfBody));
  for (let i = 0; i < block.elseif.length; i++) {
    const elseifHeader = `<span class="keyword">ElseIf</span> <span class="condition-expr">${renderExpressionTokens(block.elseif[i])}</span>:`;
    result += wrapBlock("conditional-block-inside-role", elseifHeader, renderBody(block.elseifBody[i]));
  }
  if (block.elseBody && block.elseBody.length > 0) {
    const elseHeader = `<span class="keyword">Else</span>:`;
    result += wrapBlock("conditional-block-inside-role", elseHeader, renderBody(block.elseBody));
  }
  return result;
}
function renderConditionalOutsideRole(block) {
  const renderBody = (body) => body.map(
    (child) => `<div class="conditional-child">${renderTopLevelBlock(child)}</div>`
  ).join("\n");
  const ifHeader = `<span class="keyword">If</span> <span class="condition-expr">${renderExpressionTokens(block.Ifcondition)}</span>:`;
  let result = wrapBlock("conditional-block-outside-role", ifHeader, renderBody(block.IfBody));
  for (let i = 0; i < block.elseif.length; i++) {
    const elseifHeader = `<span class="keyword">ElseIf</span> <span class="condition-expr">${renderExpressionTokens(block.elseif[i])}</span>:`;
    result += wrapBlock("conditional-block-outside-role", elseifHeader, renderBody(block.elseifBody[i]));
  }
  if (block.elseBody && block.elseBody.length > 0) {
    const elseHeader = `<span class="keyword">Else</span>:`;
    result += wrapBlock("conditional-block-outside-role", elseHeader, renderBody(block.elseBody));
  }
  return result;
}
function renderStrFragDef(frag, style = "default") {
  const paramsHtml = frag.params.length > 0 ? `[${frag.params.map(renderTextArgs).join(", ")}]` : "";
  const titleHtml = `<div class="frag-def-title"><h1>${escapeHtml(frag.name)}${paramsHtml}</h1><span class="frag-badge">SF</span></div>`;
  const bodyHtml = frag.body.map((b) => {
    return `<div class="role-body-block">${renderRoleBuildingBlock(b)}</div>`;
  }).join("\n");
  return `<div class="frag-def-container frag-style-${style}">${titleHtml}<div class="frag-body">${bodyHtml}</div></div>`;
}
function renderRolesFragDef(frag, style = "default") {
  const paramsHtml = frag.params.length > 0 ? `[${frag.params.map(renderTextArgs).join(", ")}]` : "";
  const titleHtml = `<div class="frag-def-title"><h1>${escapeHtml(frag.name)}${paramsHtml}</h1><span class="frag-badge">RF</span></div>`;
  const bodyHtml = frag.body.map(renderPromptBodyItem).join("\n");
  return `<div class="frag-def-container frag-style-${style}">${titleHtml}<div class="frag-body">${bodyHtml}</div></div>`;
}
function renderStrFragInvocation(block) {
  const argsText = block.arguments.length > 0 ? `[${block.arguments.map(renderTextArgs).join(", ")}]` : "";
  return `<span class="frag-invocation-wrapper"><span class="frag-keyword">Frag</span> <span class="frag-invocation"><span class="frag-name">${escapeHtml(block.name)}</span><span class="frag-args-wrapper">${argsText}</span></span></span>`;
}
function renderRolesFragInvocation(block) {
  const argsText = block.arguments.length > 0 ? `[${block.arguments.map(renderTextArgs).join(", ")}]` : "";
  return `<span class="frag-invocation-wrapper"><span class="frag-keyword">Frag</span> <span class="frag-invocation"><span class="frag-name">${escapeHtml(block.name)}</span><span class="frag-args-wrapper">${argsText}</span></span></span>`;
}

// src/preview.ts
function registerPreviewCommand(context) {
  let state;
  const setPreviewVisible = (visible) => {
    vscode2.commands.executeCommand(
      "setContext",
      "acdl.previewVisible",
      visible
    );
  };
  const getSourceEditor = () => {
    if (!state) return void 0;
    return vscode2.window.visibleTextEditors.find(
      (e) => e.document.uri.toString() === state.sourceUri.toString()
    );
  };
  const refresh = () => {
    if (!state) return;
    const editor = getSourceEditor();
    if (!editor) return;
    state.sourceCursorLine = editor.selection.active.line + 1;
    updatePreview(state.panel, editor.document, state.sourceCursorLine, context);
  };
  context.subscriptions.push(
    vscode2.commands.registerCommand("acdl.showPreview", () => {
      const editor = vscode2.window.activeTextEditor;
      if (!editor) return;
      if (state) {
        state.sourceUri = editor.document.uri;
        state.panel.reveal(vscode2.ViewColumn.Beside, true);
      } else {
        const panel = vscode2.window.createWebviewPanel(
          "acdlPreview",
          "ACDL Preview",
          { viewColumn: vscode2.ViewColumn.Beside, preserveFocus: true },
          {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
              vscode2.Uri.file(path.join(context.extensionPath, "media"))
            ]
          }
        );
        state = {
          panel,
          sourceUri: editor.document.uri,
          sourceCursorLine: editor.selection.active.line + 1
        };
        panel.onDidDispose(() => {
          state = void 0;
          setPreviewVisible(false);
        });
        panel.onDidChangeViewState(() => {
          setPreviewVisible(panel.visible);
        });
        panel.webview.onDidReceiveMessage(async (msg) => {
          if (msg?.type === "saveImage") {
            await handleSaveImage(msg.dataUrl, state?.sourceUri);
          } else if (msg?.type === "copyImageFallback") {
            await handleCopyImageFallback(msg.dataUrl);
          } else if (msg?.type === "info") {
            vscode2.window.setStatusBarMessage(`ACDL: ${msg.text}`, 2e3);
          } else if (msg?.type === "error") {
            vscode2.window.showErrorMessage(`ACDL preview: ${msg.text}`);
          }
        });
      }
      setPreviewVisible(true);
      refresh();
    })
  );
  context.subscriptions.push(
    vscode2.commands.registerCommand("acdl.copyPreviewImage", () => {
      state?.panel.webview.postMessage({ type: "copyImage" });
    }),
    vscode2.commands.registerCommand("acdl.savePreviewImage", () => {
      state?.panel.webview.postMessage({ type: "saveImage" });
    }),
    vscode2.commands.registerCommand("acdl.zoomInPreview", () => {
      state?.panel.webview.postMessage({ type: "zoomIn" });
    }),
    vscode2.commands.registerCommand("acdl.zoomOutPreview", () => {
      state?.panel.webview.postMessage({ type: "zoomOut" });
    }),
    vscode2.commands.registerCommand("acdl.resetZoomPreview", () => {
      state?.panel.webview.postMessage({ type: "resetZoom" });
    })
  );
  let timeout;
  context.subscriptions.push(
    vscode2.workspace.onDidChangeTextDocument((e) => {
      if (!state) return;
      if (e.document.uri.toString() !== state.sourceUri.toString()) return;
      clearTimeout(timeout);
      timeout = setTimeout(refresh, 300);
    }),
    vscode2.window.onDidChangeTextEditorSelection((e) => {
      if (!state) return;
      if (e.textEditor.document.uri.toString() !== state.sourceUri.toString())
        return;
      const newLine = e.textEditor.selection.active.line + 1;
      if (newLine === state.sourceCursorLine) return;
      state.sourceCursorLine = newLine;
      refresh();
    }),
    vscode2.window.onDidChangeActiveTextEditor((editor) => {
      if (!state || !editor) return;
      if (editor.document.languageId !== "acdl") return;
      state.sourceUri = editor.document.uri;
      refresh();
    })
  );
}
async function handleSaveImage(dataUrl, sourceUri) {
  if (!dataUrl) return;
  const defaultDir = sourceUri ? path.dirname(sourceUri.fsPath) : process.cwd();
  const defaultBase = sourceUri ? path.basename(sourceUri.fsPath, path.extname(sourceUri.fsPath)) : "acdl-preview";
  const target = await vscode2.window.showSaveDialog({
    defaultUri: vscode2.Uri.file(path.join(defaultDir, `${defaultBase}.png`)),
    filters: { Images: ["png"] }
  });
  if (!target) return;
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  await vscode2.workspace.fs.writeFile(target, Buffer.from(base64, "base64"));
  vscode2.window.showInformationMessage(`Saved preview to ${target.fsPath}`);
}
async function handleCopyImageFallback(dataUrl) {
  if (!dataUrl) return;
  const tmp = path.join(
    require("os").tmpdir(),
    `acdl-preview-${Date.now()}.png`
  );
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(tmp, Buffer.from(base64, "base64"));
  await vscode2.env.clipboard.writeText(tmp);
  vscode2.window.showInformationMessage(
    `Image saved to ${tmp} and path copied to clipboard.`
  );
}
function updatePreview(panel, doc, cursorLine, context) {
  const text = doc.getText();
  let bodyHtml;
  let statusHtml = "";
  try {
    const ranges = new Parser(text).parseFileWithRanges();
    if (ranges.length === 0) {
      throw new Error("No prompts or fragments found in file");
    }
    const renderable = ranges.filter((r) => r.block.kind !== "comment-block");
    if (renderable.length === 0) {
      throw new Error("No prompts or fragments found in file");
    }
    let selected = renderable.find(
      (r) => cursorLine >= r.startLine && cursorLine <= r.endLine
    );
    if (!selected) {
      selected = renderable.reduce((best, r) => {
        const dist = cursorLine < r.startLine ? r.startLine - cursorLine : cursorLine - r.endLine;
        const bestDist = cursorLine < best.startLine ? best.startLine - cursorLine : cursorLine - best.endLine;
        return dist < bestDist ? r : best;
      });
    }
    bodyHtml = renderPrompts([selected.block]);
    if (renderable.length > 1) {
      const idx = renderable.indexOf(selected) + 1;
      statusHtml = `<div class="acdl-preview-status">Showing ${idx} of ${renderable.length} (lines ${selected.startLine}\u2013${selected.endLine}). Move cursor to switch.</div>`;
    }
  } catch (err) {
    bodyHtml = `<div style="color: #cf222e; padding: 20px; font-family: monospace; white-space: pre-wrap;">${escapeHtml2(err.message)}</div>`;
  }
  const cssContent = loadPreviewCss(context);
  const html2canvasUri = panel.webview.asWebviewUri(
    vscode2.Uri.file(
      path.join(context.extensionPath, "media", "html2canvas.min.js")
    )
  );
  const cspSource = panel.webview.cspSource;
  const nonce = makeNonce();
  panel.webview.html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data: blob:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${cssContent}</style>
<style>
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body { display: flex; flex-direction: column; min-height: 100vh;
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }

  .acdl-preview-toolbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px;
    background: #f6f8fa; border-bottom: 1px solid #d0d7de;
  }
  .acdl-action {
    display: inline-flex; align-items: center; gap: 8px;
    background: #ffffff; color: #1f2328;
    border: 1px solid #d0d7de; border-radius: 6px;
    padding: 7px 12px; cursor: pointer;
    font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    transition: background 0.1s ease, border-color 0.1s ease;
  }
  .acdl-action:hover { background: #f3f4f6; border-color: #9aa4af; }
  .acdl-action:active { background: #e6e8eb; }
  .acdl-action.primary {
    background: #1f6feb; color: #ffffff; border-color: #1f6feb;
  }
  .acdl-action.primary:hover { background: #1158c7; border-color: #1158c7; }
  .acdl-action svg { width: 16px; height: 16px; flex: 0 0 16px; }
  .acdl-action .kbd {
    font: 500 11px/1 "JetBrains Mono", "SF Mono", monospace;
    padding: 3px 6px; border-radius: 4px;
    background: rgba(0,0,0,0.08); color: inherit; opacity: 0.85;
  }
  .acdl-action.primary .kbd { background: rgba(255,255,255,0.2); }

  .acdl-zoom {
    display: inline-flex; align-items: center; gap: 2px;
    background: #ffffff; border: 1px solid #d0d7de; border-radius: 6px;
    padding: 2px;
  }
  .acdl-zoom button {
    background: transparent; border: none; cursor: pointer;
    padding: 5px 9px; font: 600 14px/1 inherit; color: #1f2328;
    border-radius: 4px;
  }
  .acdl-zoom button:hover { background: #f3f4f6; }
  .acdl-zoom .zoom-label {
    min-width: 44px; text-align: center;
    font: 500 12px/1 "JetBrains Mono", "SF Mono", monospace;
    color: #57606a;
  }
  .acdl-toolbar-spacer { flex: 1; }

  .acdl-preview-status {
    padding: 6px 14px; background: #fff8c5; border-bottom: 1px solid #e6c200;
    font: 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #57534e;
  }
  .acdl-preview-scroll {
    flex: 1; overflow: auto; padding: 20px;
  }
  .acdl-preview-zoom-host {
    transform-origin: 0 0;
    display: inline-block;
    min-width: 100%;
  }

  .acdl-toast {
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: #1f2328; color: #ffffff;
    padding: 10px 16px; border-radius: 8px;
    font: 500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    opacity: 0; pointer-events: none;
    transition: opacity 0.2s ease;
    z-index: 100;
  }
  .acdl-toast.show { opacity: 1; }
  .acdl-toast.error { background: #cf222e; }
</style>
</head>
<body>
  <div class="acdl-preview-toolbar">
    <button id="acdl-copy" class="acdl-action primary" title="Copy preview as PNG to clipboard">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 1.75A.75.75 0 0 1 5.75 1h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 5 1.75Zm-1.5 0c0-.13.01-.26.04-.39A2.25 2.25 0 0 0 1.5 3.5v10A2.5 2.5 0 0 0 4 16h8a2.5 2.5 0 0 0 2.5-2.5v-10a2.25 2.25 0 0 0-2.04-2.14c.03.13.04.26.04.39A2.25 2.25 0 0 1 10.25 4h-4.5A2.25 2.25 0 0 1 3.5 1.75Z"/></svg>
      Copy image
      <span class="kbd" id="acdl-copy-kbd">Ctrl+Alt+C</span>
    </button>
    <button id="acdl-save" class="acdl-action" title="Save preview as PNG file">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 12a.75.75 0 0 0 .75-.75V4.56l1.97 1.97a.75.75 0 1 0 1.06-1.06l-3.25-3.25a.75.75 0 0 0-1.06 0L4.22 5.47a.75.75 0 0 0 1.06 1.06L7.25 4.56v6.69c0 .41.34.75.75.75ZM2.75 9.5a.75.75 0 0 1 .75.75v3a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-3a.75.75 0 0 1 1.5 0v3A2 2 0 0 1 12 15.25H4A2 2 0 0 1 2 13.25v-3a.75.75 0 0 1 .75-.75Z"/></svg>
      Save image\u2026
      <span class="kbd" id="acdl-save-kbd">Ctrl+Alt+S</span>
    </button>
    <span class="acdl-toolbar-spacer"></span>
    <div class="acdl-zoom" role="group" aria-label="Zoom">
      <button id="acdl-zoom-out" title="Zoom out">\u2212</button>
      <span class="zoom-label" id="acdl-zoom-label">100%</span>
      <button id="acdl-zoom-in" title="Zoom in">+</button>
      <button id="acdl-zoom-reset" title="Reset zoom to 100%" style="padding-left:8px;padding-right:8px;font-size:11px;font-weight:500;">Reset</button>
    </div>
  </div>
  <div id="acdl-toast" class="acdl-toast" role="status" aria-live="polite"></div>
  ${statusHtml}
  <div class="acdl-preview-scroll" id="acdl-scroll">
    <div class="acdl-preview-zoom-host" id="acdl-zoom-host">
      <div id="acdl-capture" class="compact">${bodyHtml}</div>
    </div>
  </div>
  <script nonce="${nonce}" src="${html2canvasUri}"></script>
  <script nonce="${nonce}">
${getWebviewScript()}
  </script>
</body>
</html>`;
}
function getWebviewScript() {
  return `
    const vscode = acquireVsCodeApi();
    const prev = vscode.getState() || { zoom: 1 };
    const host = document.getElementById('acdl-zoom-host');
    const label = document.getElementById('acdl-zoom-label');
    const capture = document.getElementById('acdl-capture');
    const toastEl = document.getElementById('acdl-toast');

    // Show OS-appropriate shortcut hints on the action buttons.
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');
    const mod = isMac ? '\u2318' : 'Ctrl';
    const alt = isMac ? '\u2325' : 'Alt';
    document.getElementById('acdl-copy-kbd').textContent = mod + '+' + alt + '+C';
    document.getElementById('acdl-save-kbd').textContent = mod + '+' + alt + '+S';

    let toastTimer;
    function showToast(text, kind) {
      toastEl.textContent = text;
      toastEl.classList.toggle('error', kind === 'error');
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
    }

    let zoom = prev.zoom || 1;
    const MIN_ZOOM = 0.25, MAX_ZOOM = 4;

    function applyZoom() {
      host.style.transform = 'scale(' + zoom + ')';
      label.textContent = Math.round(zoom * 100) + '%';
      vscode.setState({ zoom });
    }
    function setZoom(z) {
      zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
      applyZoom();
    }
    function zoomIn()  { setZoom(zoom + 0.1); }
    function zoomOut() { setZoom(zoom - 0.1); }
    function resetZoom() { setZoom(1); }

    document.getElementById('acdl-zoom-in').addEventListener('click', zoomIn);
    document.getElementById('acdl-zoom-out').addEventListener('click', zoomOut);
    document.getElementById('acdl-zoom-reset').addEventListener('click', resetZoom);
    document.getElementById('acdl-copy').addEventListener('click', copyImage);
    document.getElementById('acdl-save').addEventListener('click', saveImage);

    window.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || !e.altKey) return;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn(); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomOut(); }
      else if (e.key === '0') { e.preventDefault(); resetZoom(); }
      else if (e.key === 'c' || e.key === 'C') { e.preventDefault(); copyImage(); }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); saveImage(); }
    });

    // Mouse wheel zoom with Ctrl/Cmd
    document.getElementById('acdl-scroll').addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn(); else zoomOut();
    }, { passive: false });

    async function renderCanvas() {
      // Render at zoom = 1 regardless of current preview zoom.
      const prevTransform = host.style.transform;
      host.style.transform = 'scale(1)';
      try {
        // eslint-disable-next-line no-undef
        const canvas = await html2canvas(capture, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
          logging: false,
        });
        return canvas;
      } finally {
        host.style.transform = prevTransform;
      }
    }

    async function copyImage() {
      showToast('Rendering image\u2026');
      try {
        const canvas = await renderCanvas();
        const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
        if (!blob) throw new Error('Failed to render canvas to blob.');
        if (navigator.clipboard && window.ClipboardItem) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob }),
            ]);
            showToast('Image copied to clipboard');
            vscode.postMessage({ type: 'info', text: 'Image copied to clipboard.' });
            return;
          } catch (err) {
            // fall through to fallback
          }
        }
        // Fallback: send dataURL to extension host to write file + put path on clipboard.
        const dataUrl = canvas.toDataURL('image/png');
        vscode.postMessage({ type: 'copyImageFallback', dataUrl });
        showToast('Copied PNG path (clipboard blocked image data)');
      } catch (err) {
        showToast('Copy failed: ' + (err && err.message || err), 'error');
        vscode.postMessage({ type: 'error', text: 'Copy failed: ' + (err && err.message || err) });
      }
    }

    async function saveImage() {
      showToast('Rendering image\u2026');
      try {
        const canvas = await renderCanvas();
        const dataUrl = canvas.toDataURL('image/png');
        vscode.postMessage({ type: 'saveImage', dataUrl });
        showToast('Choose a location to save\u2026');
      } catch (err) {
        showToast('Save failed: ' + (err && err.message || err), 'error');
        vscode.postMessage({ type: 'error', text: 'Save failed: ' + (err && err.message || err) });
      }
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg) return;
      switch (msg.type) {
        case 'zoomIn': zoomIn(); break;
        case 'zoomOut': zoomOut(); break;
        case 'resetZoom': resetZoom(); break;
        case 'copyImage': copyImage(); break;
        case 'saveImage': saveImage(); break;
      }
    });

    applyZoom();
  `;
}
function makeNonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
function loadPreviewCss(context) {
  const cssPath = path.join(context.extensionPath, "media", "preview.css");
  try {
    return fs.readFileSync(cssPath, "utf-8");
  } catch {
    return "/* preview.css not found */";
  }
}
function escapeHtml2(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// src/definition.ts
var vscode3 = __toESM(require("vscode"));
function registerDefinitionProvider(context) {
  context.subscriptions.push(
    vscode3.languages.registerDefinitionProvider("acdl", {
      provideDefinition(document, position) {
        const wordRange = document.getWordRangeAtPosition(
          position,
          /[a-zA-Z_][a-zA-Z0-9_]*/
        );
        if (!wordRange) return;
        const word = document.getText(wordRange);
        const lineText = document.lineAt(position.line).text;
        const before = lineText.substring(0, wordRange.start.character);
        if (/\bprompt\.\s*$/.test(before)) {
          return findLabelDefinition(document, word);
        }
        if (/^[A-Z][A-Z0-9_]+$/.test(word)) {
          return findFirstOccurrence(document, word, position);
        }
        return void 0;
      }
    })
  );
}
function findLabelDefinition(document, label) {
  const regex = new RegExp(`\\b${label}\\s*\\{`);
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const match = regex.exec(line.text);
    if (match) {
      return new vscode3.Location(
        document.uri,
        new vscode3.Position(i, match.index)
      );
    }
  }
  return void 0;
}
function findFirstOccurrence(document, word, currentPosition) {
  const regex = new RegExp(`\\b${word}\\b`);
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const match = regex.exec(line.text);
    if (match) {
      const pos = new vscode3.Position(i, match.index);
      if (i !== currentPosition.line || match.index !== currentPosition.character) {
        return new vscode3.Location(document.uri, pos);
      }
    }
  }
  return void 0;
}

// src/extension.ts
function activate(context) {
  registerDiagnostics(context);
  registerPreviewCommand(context);
  registerDefinitionProvider(context);
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
