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
  "resp",
  "prompt"
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
  "continue"
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
    while (!this.isEOF()) {
      const ch = this.peek();
      if (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        this.advance();
      } else {
        break;
      }
    }
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
function index(kind, name) {
  return { kind, name };
}
function timeIndex(params) {
  return { ...params, kind: "time-index" };
}
function otherIndex(params) {
  return { ...params, kind: "other-index" };
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
function commentBlock(params) {
  return { ...params, kind: "comment-block" };
}
function labelBlock(params) {
  return { ...params, kind: "label-block" };
}
function arithmeticExpr(params) {
  return { ...params, kind: "arithmetic" };
}

// ../src/parser.ts
var Parser = class {
  tokens = [];
  pos = 0;
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
    return tok;
  }
  match(type, value) {
    const tok = this.peek();
    if (tok.type === type && (!value || tok.value === value)) {
      this.pos++;
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
    const tok = this.peek();
    if (tok.type === "IDENT") {
      const nextTok = this.peekNext();
      if (nextTok.value === "{") {
        return this.parseLabelBlock();
      }
    }
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
      }
    }
    if (tok.type === "COMMENT") {
      const text = this.consume("COMMENT").value;
      return commentBlock({ text });
    }
    if (tok.type === "IDENT" && nextTok.value === "{") {
      return this.parseLabelBlock();
    }
    throw new Error(`[${tok.line}:${tok.col}] Syntax Error: Unexpected token "${val}" in global scope.`);
  }
  /**
   * Parse a LabelBlock: LabelName { PromptBlock+ }
   * Labels can contain one or more PromptBlocks (but not other LabelBlocks).
   */
  parseLabelBlock() {
    const labelTok = this.consume("IDENT");
    const label = labelTok.value;
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
    return labelBlock({ label, body: blocks });
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
    if (tok.type === "IDENT")
      return this.parseTemplateOrFunc();
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
    if (tok.type === "KEYWORD") {
      if (val === "If")
        return this.parseConditionalInside();
      if (val === "ForEach")
        return this.parseLoopInside();
      if (val === "Switch")
        return this.parseSwitchInside();
      if (val === "break" || val === "continue") {
        const name = this.consume("KEYWORD").value;
        return template({ name, arguments: [], comment: void 0 });
      }
      const namespaces = ["env", "sys", "resp", "prompt"];
      if (namespaces.includes(val)) {
        return this.parseContextVar();
      }
    }
    if (tok.type === "IDENT")
      return this.parseTemplateOrFunc();
    throw new Error(`[${tok.line}:${tok.col}] Unexpected ${tok.type} (${val}) inside role.`);
  }
  /* ───────────────── Expressions & Shared Rules ───────────────── */
  parseContextVar() {
    const baseTok = this.consume("KEYWORD");
    const base = baseTok.value;
    const indices = this.parseOptionalIndices();
    let path2;
    this.consume("SYMBOL", ".");
    path2 = this.parsePathDesc();
    const comment = this.peek().type === "COMMENT" ? this.consume("COMMENT").value : void 0;
    return contextVar({ base, indices, path: path2, comment });
  }
  parsePathDesc() {
    const tok = this.peek();
    if (tok.type !== "IDENT" && tok.type !== "KEYWORD") {
      throw new Error(`[${tok.line}:${tok.col}] Expected identifier in path, got ${tok.type}`);
    }
    const base = this.consume().value;
    const indices = this.parseOptionalIndices();
    let next;
    if (this.match("SYMBOL", ".")) {
      next = this.parsePathDesc();
    }
    return pathDesc({ base, indices, next });
  }
  parseTemplateOrFunc() {
    const name = this.consume("IDENT").value;
    let args = [];
    if (this.peek().value === "(") {
      this.consume("SYMBOL", "(");
      args = this.parseTextArgs();
      this.consume("SYMBOL", ")");
    }
    if (name === name.toUpperCase()) {
      const comment2 = this.peek().type === "COMMENT" ? this.consume("COMMENT").value : void 0;
      return template({ name, arguments: args, comment: comment2 });
    }
    const indices = this.parseOptionalIndices();
    const comment = this.peek().type === "COMMENT" ? this.consume("COMMENT").value : void 0;
    return func({ name, arguments: args, indices, comment });
  }
  parseTextArgs() {
    const args = [];
    if (this.peek().value === ")")
      return args;
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
  /** Parse an atomic value: number, time index, context var, or function/identifier */
  parseAtom() {
    const tok = this.peek();
    if (this.match("SYMBOL", "@")) {
      return timeIndex({ name: this.consume("IDENT").value });
    }
    if (tok.type === "KEYWORD" && ["env", "sys", "resp", "prompt"].includes(tok.value)) {
      return this.parseContextVar();
    }
    if (tok.type === "NUMBER") {
      return otherIndex({ name: this.consume("NUMBER").value });
    }
    if (tok.type === "IDENT") {
      if (this.peekNext().value === "(") {
        return this.parseTemplateOrFunc();
      }
      return otherIndex({ name: this.consume("IDENT").value });
    }
    throw new Error(`[${tok.line}:${tok.col}] Unexpected token in arguments: ${tok.type} (${tok.value})`);
  }
  parseOptionalIndices() {
    const indices = [];
    if (this.match("SYMBOL", "[")) {
      indices.push(this.parseIndex());
      while (this.match("SYMBOL", ",")) {
        indices.push(this.parseIndex());
        console.log(`indices: ${indices}`);
      }
    }
    if (this.peek().value === "]")
      this.consume("SYMBOL", "]");
    return indices;
  }
  parseIndex() {
    let time = this.match("SYMBOL", "@");
    let idx = "";
    while (this.peek().type === "IDENT" || this.peek().type === "ARITH_OP" || this.peek().type === "NUMBER" || this.peek().type === "SYMBOL" && this.peek().value === "." && this.peekNext()?.type === "IDENT") {
      idx += this.consume().value;
    }
    if (time) {
      return index("time-index", idx);
    } else {
      return index("other-index", idx);
    }
  }
  /* ───────────────── Control Flow ───────────────── */
  parseLoopOutside() {
    this.consume("KEYWORD", "ForEach");
    this.consume("SYMBOL", "(");
    let idx = this.peek().value === "@" ? "@" : "";
    const index2 = index("other-index", idx + this.parseIndex().name);
    console.log("got here");
    this.consume("SYMBOL", ":");
    let iter = "";
    while (!(this.peek().value === ")" && this.peekNext().value === "{")) {
      if (this.isEOF())
        throw new Error("Unterminated If condition");
      iter += this.consume().value;
    }
    this.consume("SYMBOL", ")");
    this.consume("SYMBOL", "{");
    const body = [];
    while (this.peek().value !== "}") {
      body.push(this.parseTopLevelBlock());
    }
    this.consume("SYMBOL", "}");
    return loopBlockOutsideRole({ index: index2, iterable: Iterable({ value: iter.trim() }), body });
  }
  parseConditionalOutside() {
    this.consume("KEYWORD", "If");
    let ifCond = "";
    while (this.peek().value !== "{") {
      if (this.isEOF())
        throw new Error("Unterminated If condition");
      ifCond += this.consume().value;
      console.log(ifCond);
    }
    console.log(ifCond);
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
        let eiCond = "";
        while (this.peek().value !== "{") {
          eiCond += this.consume().value;
        }
        this.consume("SYMBOL", "{");
        const eiBody = [];
        while (this.peek().value !== "}") {
          eiBody.push(this.parseTopLevelBlock());
        }
        this.consume("SYMBOL", "}");
        elseIfConditions.push(eiCond.trim());
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
      Ifcondition: ifCond.trim(),
      IfBody: ifBody,
      elseif: elseIfConditions,
      elseifBody: elseIfBodies,
      elseBody
    });
  }
  parseLoopInside() {
    this.consume("KEYWORD", "ForEach");
    this.consume("SYMBOL", "(");
    let idx = this.peek().value === "@" ? "@" : "";
    const index2 = index("other-index", idx + this.parseIndex().name);
    this.consume("SYMBOL", ":");
    let iter = "";
    while (!(this.peek().value === ")" && this.peekNext().value === "{")) {
      if (this.isEOF())
        throw new Error("Unterminated If condition");
      iter += this.consume().value;
    }
    this.consume("SYMBOL", ")");
    this.consume("SYMBOL", "{");
    const body = [];
    while (this.peek().value !== "}")
      body.push(this.parseRoleBuildingBlock());
    this.consume("SYMBOL", "}");
    return loopBlockInsideRole({ index: index2, iterable: Iterable({ value: iter }), body });
  }
  parseConditionalInside() {
    this.consume("KEYWORD", "If");
    let ifCond = "";
    while (this.peek().value !== "{") {
      if (this.isEOF())
        throw new Error("Unterminated If condition");
      ifCond += this.consume().value;
      console.log(ifCond);
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
        let eiCond = "";
        while (this.peek().value !== "{") {
          eiCond += this.consume().value;
        }
        this.consume("SYMBOL", "{");
        const eiBody = [];
        while (this.peek().value !== "}") {
          eiBody.push(this.parseRoleBuildingBlock());
        }
        this.consume("SYMBOL", "}");
        elseIfConditions.push(eiCond.trim());
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
      Ifcondition: ifCond.trim(),
      IfBody: ifBody,
      elseif: elseIfConditions,
      elseifBody: elseIfBodies,
      elseBody
    });
  }
  // parseSwitchOutside and parseSwitchInside would follow the same scoping pattern.
  parseSwitchOutside() {
    this.consume("KEYWORD", "Switch");
    let expression = "";
    while (this.peek().value !== "{") {
      if (this.isEOF())
        throw new Error("Expected '{' after Switch expression");
      expression += this.consume().value;
    }
    this.consume("SYMBOL", "{");
    const cases = [];
    let defaultCase;
    while (this.peek().value !== "}") {
      const kw = this.consume("KEYWORD").value;
      if (kw === "Case") {
        let match = "";
        while (this.peek().value !== "{") {
          if (this.isEOF())
            throw new Error("Expected '{' after Switch expression");
          match += this.consume().value;
        }
        this.consume("SYMBOL", "{");
        const body = [];
        while (this.peek().value !== "}") {
          body.push(this.parseTopLevelBlock());
        }
        this.consume("SYMBOL", "}");
        cases.push(caseBlockOutsideRole({ match, body }));
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
      expression: expression.trim(),
      cases,
      defaultCase
    });
  }
  parseSwitchInside() {
    this.consume("KEYWORD", "Switch");
    let expression = "";
    while (this.peek().value !== "{") {
      if (this.isEOF())
        throw new Error("Expected '{' after Switch expression");
      expression += this.consume().value;
    }
    this.consume("SYMBOL", "{");
    const cases = [];
    let defaultCase;
    while (this.peek().value !== "}") {
      const kw = this.consume("KEYWORD").value;
      if (kw === "Case") {
        let match = "";
        while (this.peek().value !== "{") {
          if (this.isEOF())
            throw new Error("Expected '{' after Switch expression");
          match += this.consume().value;
        }
        this.consume("SYMBOL", "{");
        const body = [];
        while (this.peek().value !== "}") {
          body.push(this.parseRoleBuildingBlock());
        }
        this.consume("SYMBOL", "}");
        cases.push(caseBlockInsideRole({ match, body }));
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
      expression: expression.trim(),
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
  const diagnosticCollection = vscode.languages.createDiagnosticCollection("csdl");
  context.subscriptions.push(diagnosticCollection);
  const diagnose = (document) => {
    if (document.languageId !== "csdl")
      return;
    const diagnostics = [];
    try {
      new Parser(document.getText()).parsePrompt();
    } catch (err) {
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
  return `
<div class="prompt-container prompt-style-${style}">
  ${titleHtml}
  ${bodyHtml}
</div>`;
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function renderPromptTitle(title) {
  const indices = title.indices;
  const indexSuffix = renderIndexList(title.indices);
  return `
<div class="prompt-title">
  <h1>${escapeHtml(title.name)}${indexSuffix}</h1>
</div>`;
}
function renderIndexValue(index2) {
  return index2.kind === "time-index" ? `@${escapeHtml(index2.name)}` : escapeHtml(index2.name);
}
function renderIndexList(indices) {
  if (indices.length === 0)
    return "";
  return `[${indices.map(renderIndexValue).join(", ")}]`;
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
  if (item.kind === "label-block") {
    return renderLabelBlock(item);
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
    case "label-block":
      return renderLabelBlock(block);
  }
}
function renderCommentBlock(block) {
  return `<div class="comment-block">// ${escapeHtml(block.text)}</div>`;
}
function renderLabelBlock(block) {
  const labelName = escapeHtml(block.label);
  const labelStart = `<div class="label-start">\u2554\u2550\u2550 ${labelName} \u2550\u2550\u2557</div>`;
  const labelEnd = `<div class="label-end">\u255A\u2550\u2550 End ${labelName} \u2550\u2550\u255D</div>`;
  const bodyHtml = block.body.map((b) => renderTopLevelBlock(b)).join("\n");
  return `
<div class="label-block">
  ${labelStart}
  <div class="label-block-body">
    ${bodyHtml}
  </div>
  ${labelEnd}
</div>`;
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
    case "comment-block":
      return renderCommentBlock(block);
  }
}
function renderFuncBlock(block) {
  const argsText = block.arguments.map(renderTextArgs).join(", ");
  const resultIndices = block.indices && block.indices.length > 0 ? renderIndexList(block.indices) : "";
  const commentHtml = block.comment ? `<span class="inline-comment"> // ${escapeHtml(block.comment)}</span>` : "";
  return `<span class="func-block"><span class="func-name">${escapeHtml(block.name)}</span><span class="func-parens">(</span>${argsText}<span class="func-parens">)</span>${resultIndices}</span>${commentHtml}`;
}
function renderTextArgs(arg) {
  switch (arg.kind) {
    case "context-var":
      return renderContextVarBlock(arg);
    case "function":
      return renderFuncBlock(arg);
    case "time-index":
      return `<span class="time-index">@${escapeHtml(arg.name)}</span>`;
    case "other-index":
      return `<span class="other-index">${escapeHtml(arg.name)}</span>`;
    case "arithmetic":
      const left = renderTextArgs(arg.left);
      const ops = arg.operator.join("");
      const right = renderTextArgs(arg.right);
      return `<span class="arithmetic-expr">${left}${escapeHtml(ops)}${right}</span>`;
  }
}
function renderTemplateBlock(block) {
  const argsText = block.arguments.length > 0 ? `(${block.arguments.map(renderTextArgs).join(", ")})` : "";
  const core = `<span class="template-block">${escapeHtml(
    block.name
  )}${argsText}</span>`;
  if (block.comment) {
    return `${core}<span class="comment"> // ${escapeHtml(block.comment)}</span>`;
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
      `<span class="segment">${escapeHtml(current.base)}${segIndexText}</span>`
    );
    current = current.next;
  }
  const joined = segments.join(".");
  const commentHtml = block.comment ? `<span class="inline-comment"> // ${escapeHtml(block.comment)}</span>` : "";
  return `<span class="context-var">${joined}</span>${commentHtml}`;
}
function renderLoopOutsideRole(block) {
  const header = `ForEach(${escapeHtml(block.index.name)}: ${escapeHtml(block.iterable.value)}):`;
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
  const indexText = block.index.name;
  const iterableText = block.iterable.value;
  const header = `ForEach(${escapeHtml(indexText)}: ${escapeHtml(iterableText)}):`;
  const bodyHtml = block.body.map(
    (child) => `<div class="role-loop-child">${renderRoleBuildingBlock(child)}</div>`
  ).join("\n");
  return wrapBlock("loop-block-inside-role", header, bodyHtml);
}
function renderSwitchOutsideRole(block) {
  const header = `Switch(${escapeHtml(block.expression)}):`;
  const casesHtml = block.cases.map((c) => {
    const bodyHtml = c.body.map(
      (child) => `<div class="switch-child">${renderTopLevelBlock(child)}</div>`
    ).join("\n");
    return wrapBlock(
      "switch-case",
      `Case "${escapeHtml(c.match)}":`,
      bodyHtml
    );
  }).join("\n");
  const defaultHtml = block.defaultCase ? (() => {
    const bodyHtml = block.defaultCase.body.map(
      (child) => `<div class="switch-child">${renderTopLevelBlock(child)}</div>`
    ).join("\n");
    return wrapBlock(
      "switch-default",
      "Default:",
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
  const header = `Switch(${escapeHtml(block.expression)}):`;
  const casesHtml = block.cases.map((c) => {
    const bodyHtml = c.body.map(
      (child) => `<div class="role-switch-child">${renderRoleBuildingBlock(child)}</div>`
    ).join("\n");
    return wrapBlock(
      "switch-case",
      `Case "${escapeHtml(c.match)}":`,
      bodyHtml
    );
  }).join("\n");
  const defaultHtml = block.defaultCase ? (() => {
    const bodyHtml = block.defaultCase.body.map(
      (child) => `<div class="role-switch-child">${renderRoleBuildingBlock(child)}</div>`
    ).join("\n");
    return wrapBlock(
      "switch-default",
      "Default:",
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
  const parts = [];
  parts.push(
    wrapBlock(
      "conditional-section",
      `If (${escapeHtml(block.Ifcondition)}):`,
      renderBody(block.IfBody)
    )
  );
  for (let i = 0; i < block.elseif.length; i++) {
    parts.push(
      wrapBlock(
        "conditional-section",
        `ElseIf (${escapeHtml(block.elseif[i])}):`,
        renderBody(block.elseifBody[i])
      )
    );
  }
  if (block.elseBody && block.elseBody.length > 0) {
    parts.push(
      wrapBlock(
        "conditional-section",
        "Else:",
        renderBody(block.elseBody)
      )
    );
  }
  return `
<div class="conditional-block-inside-role">
  ${parts.join("\n")}
</div>`;
}
function renderConditionalOutsideRole(block) {
  const renderBody = (body) => body.map(
    (child) => `<div class="role-condition-child">${renderTopLevelBlock(child)}</div>`
  ).join("\n");
  const parts = [];
  parts.push(
    wrapBlock(
      "conditional-section",
      `If (${escapeHtml(block.Ifcondition)}):`,
      renderBody(block.IfBody)
    )
  );
  for (let i = 0; i < block.elseif.length; i++) {
    parts.push(
      wrapBlock(
        "conditional-section",
        `ElseIf (${escapeHtml(block.elseif[i])}):`,
        renderBody(block.elseifBody[i])
      )
    );
  }
  if (block.elseBody && block.elseBody.length > 0) {
    parts.push(
      wrapBlock(
        "conditional-section",
        "Else:",
        renderBody(block.elseBody)
      )
    );
  }
  return `
<div class="conditional-block-inside-role">
  ${parts.join("\n")}
</div>`;
}

// src/preview.ts
function registerPreviewCommand(context) {
  let panel;
  context.subscriptions.push(
    vscode2.commands.registerCommand("csdl.showPreview", () => {
      const editor = vscode2.window.activeTextEditor;
      if (!editor)
        return;
      if (panel) {
        panel.reveal(vscode2.ViewColumn.Beside);
      } else {
        panel = vscode2.window.createWebviewPanel(
          "csdlPreview",
          "CSDL Preview",
          vscode2.ViewColumn.Beside,
          { enableScripts: false }
        );
        panel.onDidDispose(() => {
          panel = void 0;
        });
      }
      updatePreview(panel, editor.document, context);
    })
  );
  let timeout;
  vscode2.workspace.onDidChangeTextDocument(
    (e) => {
      if (panel && e.document.languageId === "csdl") {
        clearTimeout(timeout);
        timeout = setTimeout(
          () => updatePreview(panel, e.document, context),
          500
        );
      }
    },
    null,
    context.subscriptions
  );
}
function updatePreview(panel, doc, context) {
  const text = doc.getText();
  let bodyHtml;
  try {
    const ast = new Parser(text).parsePrompt();
    bodyHtml = renderPrompt(ast);
  } catch (err) {
    bodyHtml = `<div style="color: #cf222e; padding: 20px; font-family: monospace; white-space: pre-wrap;">${escapeHtml2(err.message)}</div>`;
  }
  const cssContent = loadPreviewCss(context);
  panel.webview.html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${cssContent}</style>
<style>
  body { padding: 20px; background: #ffffff; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
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
    vscode3.languages.registerDefinitionProvider("csdl", {
      provideDefinition(document, position) {
        const wordRange = document.getWordRangeAtPosition(
          position,
          /[a-zA-Z_][a-zA-Z0-9_]*/
        );
        if (!wordRange)
          return;
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
