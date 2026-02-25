import { Scanner } from "./scanner";
import { Token } from "./tokens";
import * as AST from "./types";
import * as Create from "./constructors";

// Helper to convert Token to ExpressionToken (strips line/col info)
function toExprToken(tok: Token): AST.ExpressionToken {
  return {
    type: tok.type as AST.ExpressionToken["type"],
    value: tok.value as string
  };
}


/**
 * Recursive Descent Parser for the ACDL (Agentic Context Description Language) Prompt DSL.
 * * This parser distinguishes between "Top-Level" scope (Global blocks and Role Messages)
 * and "Inside-Role" scope (Context variables and role-specific logic).
 */
export class Parser {
  private tokens: Token[] = [];
  private pos = 0;

  constructor(input: string) {
    const scanner = new Scanner(input);
    let token: Token;
    do {
      token = scanner.nextToken();
      this.tokens.push(token);
    } while (token.type !== "EOF");
  }

  /* ───────────────── Core Navigation ───────────────── */

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private peekNext(): Token {
    return this.tokens[this.pos+1]
  }

  /**
   * Consumes a token of a specific type and/or value.
   * Since Token.value is (string | null), we use type assertions for IDENT values.
   */
  private consume(type?: string, value?: string): Token {
    const tok = this.peek();
    if (type && tok.type !== type) {
      throw new Error(`[${tok.line}:${tok.col}] Expected token type ${type}, got ${tok.type} with value ${tok.value}`);
    }
    if (value && (tok as any).value !== value) {
      throw new Error(`[${tok.line}:${tok.col}] Expected value "${value}", got "${(tok as any).value}"`);
    }
    this.pos++;
    return tok;
  }

  private match(type: string, value?: string): boolean {
    const tok = this.peek();
    if (tok.type === type && (!value || (tok as any).value === value)) {
      this.pos++;
      return true;
    }
    return false;
  }

  /* ───────────────── Grammar Rules (Outside Role) ───────────────── */

  /**
   * Entry Point: Prompt[indices]: { ... }
   */
  public parsePrompt(): AST.Prompt {
    const title = this.parseTitle();
    this.consume("SYMBOL", ":");
    this.consume("SYMBOL", "{");
    const body = this.parsePromptBody();
    this.consume("SYMBOL", "}");
    console.log("parsed prompt")
    return Create.prompt({ title, body });
  }

  private parseTitle(): AST.PromptTitle {
    const name = this.consume("IDENT").value as string; // Assert string for constructor
    const indices = this.parseOptionalIndices();
    console.log("parsed title")
    return Create.promptTitle({ name, indices });
  }

  /**
   * Gatekeeper for Top-Level Scope.
   * Detects whether this is a chat prompt (multiple roles) or completion prompt (single N: message).
   */
  private parsePromptBody(): AST.PromptBody {
    // Check if first non-comment token is N: (completion/none prompt)
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
  private parseChatPromptBody(): AST.ChatPromptBody {
    const body: AST.PromptBlock[] = [];
    while (this.peek().type !== "EOF" && (this.peek().value !== "}")) {
      // Check for standalone comments
        if (this.peek().type === "COMMENT") {
            const text = this.consume("COMMENT").value as string;
            body.push(Create.commentBlock({ text }));
            continue;
        }
      body.push(this.parsePromptBodyItem());
    }
    const comment = this.parseOptionalComment();
    return Create.chatPromptBody({ body });
  }

  /**
   * Parse a completion prompt body (single N: message, no other roles allowed).
   */
  private parseCompletionPromptBody(): AST.CompletionPromptBody {
    // Skip any leading comments
    while (this.peek().type === "COMMENT") {
      this.consume("COMMENT");
    }

    // Parse the none message
    const message = this.parseNoneMessage();

    // Verify nothing else follows (except comments and closing brace)
    while (this.peek().type === "COMMENT") {
      this.consume("COMMENT");
    }

    if (this.peek().type !== "EOF" && this.peek().value !== "}") {
      const tok = this.peek();
      throw new Error(`[${tok.line}:${tok.col}] Completion prompts (N:) can only have a single message. Found unexpected token "${tok.value}"`);
    }

    return Create.completionPromptBody({ message });
  }

  /**
   * Parse a NoneMessage: N: { RoleBuildingBlock* }
   */
  private parseNoneMessage(): AST.NoneMessage {
    this.consume("IDENT", "N");
    this.consume("SYMBOL", ":");

    const body: AST.RoleBuildingBlock[] = [];

    if (this.peek().value === "{") {
      this.consume("SYMBOL", "{");
      while (this.peek().type !== "EOF" && this.peek().value !== "}") {
        body.push(this.parseRoleBuildingBlock());
      }
      this.consume("SYMBOL", "}");
    } else {
      // Single-line syntax
      const startLine = this.peek().line;
      body.push(this.parseRoleBuildingBlockSingleLine(startLine));
    }

    return Create.noneMessage({ body });
  }

  /**
   * Parse a PromptBodyItem (either a PromptBlock or a LabelBlock).
   */
  private parsePromptBodyItem(): AST.PromptBlock {
    const tok = this.peek();

    // Check for Label syntax: IDENT followed by "{"
    if (tok.type === "IDENT") {
      const nextTok = this.peekNext();

      // Label: Any IDENT followed by "{"
      if (nextTok.value === "{") {
        return this.parseLabelBlock();
      }
    }

    // Otherwise parse as a regular PromptBlock
    return this.parseTopLevelBlock();
  }

  private parseTopLevelBlock(): AST.PromptBlock {
    const tok = this.peek();
    const nextTok = this.peekNext();
    const val = tok.value;

    // Role Message Prefixes: S:, U:, A:
    if (tok.type === "IDENT" && (val === "S" || val === "U" || val === "A" || val === "T")) {
      console.log("parsing role message")
      return this.parseRoleMessage();
    }

    if (tok.type === "KEYWORD") {
      switch (val) {
        case "If": return this.parseConditionalOutside();
        case "ForEach": return this.parseLoopOutside();
        case "Switch": return this.parseSwitchOutside();
        case "name": return this.parseNameDef();
      }
    }

    if (tok.type === "COMMENT") {
        const text = this.consume("COMMENT").value as string;
        return Create.commentBlock({ text });
    }

    if (tok.type === "IDENT" && nextTok.value === "{") {
      return this.parseLabelBlock();
    }

    throw new Error(`[${tok.line}:${tok.col}] Syntax Error: Unexpected token "${val}" in global scope.`);
  }

  /**
   * Parse a LabelBlock: Labelname { PromptBlock+ }
   * Labels can contain one or more PromptBlocks (but not other LabelBlocks).
   */
  private parseLabelBlock(): AST.LabelBlock {
    const labelTok = this.consume("IDENT");
    const label = labelTok.value as string;

    this.consume("SYMBOL", "{");

    // Parse blocks until we hit closing "}"
    const blocks: Array<AST.PromptBlock> = [];

    do {
      // Check for standalone comments inside label blocks
      if (this.peek().type === "COMMENT") {
        const text = this.consume("COMMENT").value as string;
        blocks.push(Create.commentBlock({ text }));
        continue;
      }

      // Parse a block (PromptBlock only, not LabelBlock)
      const innerBlock = this.parseTopLevelBlock();
      blocks.push(innerBlock);
    } while (this.peek().value !== "}");

    this.consume("SYMBOL", "}");

    return Create.labelBlock({ label, body: blocks });
  }

  /*
   * RoleMessage = ROLE_ID: { RoleBuildingBlock* } | ROLE_ID: RoleBuildingBlock
   * Supports both multi-line blocks with curly braces and single-line without braces
  */
  private parseRoleMessage(): AST.RoleMessage {
    const roleId = this.consume("IDENT").value as string;
    this.consume("SYMBOL", ":");

    const roleMap: Record<string, AST.Role> = { "S": "system", "U": "user", "A": "assistant", "T": "tool" };
    const role = roleMap[roleId];

    const body: AST.RoleBuildingBlock[] = [];

    // Check if this is a multi-line block with curly braces or a single-line block
    if (this.peek().value === "{") {
      // Multi-line syntax: U: { ... }
      this.consume("SYMBOL", "{");
      while (this.peek().type !== "EOF" && this.peek().value !== "}") {
        body.push(this.parseRoleBuildingBlock());
      }
      this.consume("SYMBOL", "}");
    } else {
      // Single-line syntax: U: obs.user_query[@i]
      // Only consume content on the same line
      const startLine = this.peek().line;
      body.push(this.parseRoleBuildingBlockSingleLine(startLine));
    }

    return Create.roleMessage({ role, body });
  }

  /* ───────────────── Grammar Rules (Inside Role) ───────────────── */

    /**
   * Parse a single RoleBuildingBlock that must stay on the same line.
   * Used for single-line role syntax (e.g., U: obs.user_query[@i])
   */
  private parseRoleBuildingBlockSingleLine(startLine: number): AST.RoleBuildingBlock {
    const tok = this.peek();

    // Check if we've moved to a new line - if so, error
    if (tok.line !== startLine) {
      throw new Error(`[${tok.line}:${tok.col}] Single-line role syntax cannot span multiple lines`);
    }

    const val = tok.value;

    if (tok.type === "KEYWORD") {
      // Control flow not allowed in single-line syntax
      if (val === "If" || val === "ForEach" || val === "Switch") {
        throw new Error(`[${tok.line}:${tok.col}] Control flow statements not allowed in single-line role syntax`);
      }

      // Context namespaces
      const namespaces = ["env", "sys", "resp", "prompt"];
      if (namespaces.includes(val as string)) {
        return this.parseContextVar();
      }
    }

    // Handle Templates/Functions (IDENT)
    if (tok.type === "IDENT") return this.parseTemplateOrFunc();

    throw new Error(`[${tok.line}:${tok.col}] Unexpected ${tok.type} (${val}) in single-line role syntax`);
  }




  /**
   * Gatekeeper for Inside-Role Scope.
   * Strictly collects RoleBuildingBlocks (ContextVars, Templates, Logic).
   */
  private parseRoleBuildingBlock(): AST.RoleBuildingBlock {
    const tok = this.peek();
    const val = tok.value;
    console.log("started role building block")

    // Check for standalone comments FIRST
    if (tok.type === "COMMENT") {
        const text = this.consume("COMMENT").value as string;
        return Create.commentBlock({ text });
    }

    // Check for name reference: $varname
    if (tok.type === "SYMBOL" && val === "$") {
      return this.parseNameRef();
    }

    if (tok.type === "KEYWORD") {
      // 1. Check for Control Flow
      if (val === "If") return this.parseConditionalInside();
      if (val === "ForEach") return this.parseLoopInside();
      if (val === "Switch") return this.parseSwitchInside();

      // 2. Check for name definition
      if (val === "name") return this.parseNameDef();

      // 3. Handle break and continue as template-like keywords
      if (val === "break" || val === "continue") {
        const name = this.consume("KEYWORD").value as string;
        return Create.template({ name, arguments: [], comment: undefined });
      }

      // 4. Check for Context namespaces
      const namespaces = ["env", "sys", "resp", "prompt"];
      if (namespaces.includes(val as string)) {
        return this.parseContextVar();
      }
    }

    // 5. Handle Templates/Functions (IDENT)
    if (tok.type === "IDENT") return this.parseTemplateOrFunc();

    throw new Error(`[${tok.line}:${tok.col}] Unexpected ${tok.type} (${val}) inside role.`);
  }

  /* ───────────────── Name Definitions ───────────────── */

  /**
   * Parse a name definition: name varname := expr
   * where expr is a ContextVar, Func, or ListComprehension
   */
  private parseNameDef(): AST.NameDef {
    this.consume("KEYWORD", "name");
    const varName = this.consume("IDENT").value as string;
    this.consume("SYMBOL", ":");
    this.consume("LOGIC_OP", "=");

    // Parse the value - ContextVar, Func, or ListComprehension
    const tok = this.peek();
    let value: AST.ContextVar | AST.Func | AST.ListComprehension;

    // Check for list comprehension: [expr for var in iterable]
    if (tok.type === "SYMBOL" && tok.value === "[") {
      value = this.parseListComprehension();
    } else if (tok.type === "KEYWORD" && ["env", "sys", "resp", "prompt"].includes(tok.value as string)) {
      value = this.parseContextVar();
    } else if (tok.type === "IDENT") {
      const parsed = this.parseTemplateOrFunc();
      if (parsed.kind !== "function") {
        throw new Error(`[${tok.line}:${tok.col}] name definitions require a ContextVar, Func, or list comprehension, got template "${parsed.name}"`);
      }
      value = parsed;
    } else {
      throw new Error(`[${tok.line}:${tok.col}] Expected ContextVar, Func, or list comprehension after :=, got ${tok.type}`);
    }

    return Create.nameDef({ name: varName, value });
  }

  /**
   * Parse a list comprehension: [expr for var in iterable]
   * Example: [sys.Summary[@t] for t in range(T, T-900, 100)]
   */
  private parseListComprehension(): AST.ListComprehension {
    this.consume("SYMBOL", "[");

    // Parse the element expression (ContextVar or Func)
    const elemTok = this.peek();
    let element: AST.ContextVar | AST.Func;

    if (elemTok.type === "KEYWORD" && ["env", "sys", "resp", "prompt"].includes(elemTok.value as string)) {
      element = this.parseContextVar();
    } else if (elemTok.type === "IDENT") {
      const parsed = this.parseTemplateOrFunc();
      if (parsed.kind !== "function") {
        throw new Error(`[${elemTok.line}:${elemTok.col}] List comprehension element must be ContextVar or Func, got template "${parsed.name}"`);
      }
      element = parsed;
    } else {
      throw new Error(`[${elemTok.line}:${elemTok.col}] Expected ContextVar or Func in list comprehension, got ${elemTok.type}`);
    }

    // Parse "for"
    this.consume("KEYWORD", "for");

    // Parse loop variable
    const variable = this.consume("IDENT").value as string;

    // Parse "in"
    this.consume("KEYWORD", "in");

    // Parse iterable (range expression or other)
    let iterable: AST.Iterable;
    if (this.peek().value === "range" && this.peekNext().value === "(") {
      iterable = this.parseRangeExpr();
    } else {
      // Capture iterable tokens until ]
      const iterTokens: AST.ExpressionToken[] = [];
      while (this.peek().value !== "]") {
        if (this.isEOF()) throw new Error("Unterminated list comprehension");
        iterTokens.push(toExprToken(this.consume()));
      }
      iterable = Create.Iterable({ tokens: iterTokens });
    }

    this.consume("SYMBOL", "]");

    return Create.listComprehension({ element, variable, iterable });
  }

  /**
   * Parse a name reference: $varname
   */
  private parseNameRef(): AST.NameRef {
    this.consume("SYMBOL", "$");
    const varName = this.consume("IDENT").value as string;
    return Create.nameRef({ name: varName });
  }

  /* ───────────────── Expressions & Shared Rules ───────────────── */

  private parseContextVar(): AST.ContextVar {
    const baseTok = this.consume("KEYWORD");
    const base = baseTok.value as AST.ContextBase;

    const indices = this.parseOptionalIndices();

    let path: AST.PathDesc;
    this.consume("SYMBOL", ".")
    path = this.parsePathDesc();

    const comment = this.peek().type === "COMMENT" ? (this.consume("COMMENT").value as string) : undefined;
    return Create.contextVar({ base, indices, path, comment });
  }

  private parsePathDesc(): AST.PathDesc {
    const tok = this.peek();
    console.log(`parsePathDesc: tok=${tok.type}:${tok.value} at ${tok.line}:${tok.col}`);

    if (tok.type !== "IDENT" && tok.type !== "KEYWORD") {
        throw new Error(`[${tok.line}:${tok.col}] Expected identifier in path, got ${tok.type}`);
    }

    const base = this.consume().value as string;
    console.log(`parsePathDesc: base=${base}, about to parse indices`);
    const indices = this.parseOptionalIndices();
    console.log(`parsePathDesc: after indices, peek=${this.peek().type}:${this.peek().value}`);
    let next: AST.PathDesc | undefined;
    if (this.match("SYMBOL", ".")) {
      console.log(`parsePathDesc: matched dot, recursing`);
      next = this.parsePathDesc();
    }
    return Create.pathDesc({ base, indices, next });
  }

  private parseTemplateOrFunc(): AST.Template | AST.Func {
    const name = this.consume("IDENT").value as string;
    let args: AST.TextArgs[] = [];
    if (this.peek().value === "(") {
      this.consume("SYMBOL", "(");
      args = this.parseTextArgs();
      this.consume("SYMBOL", ")");
    }

    // Template logic: All caps or specifically handled
    if (name === name.toUpperCase()) {
      const comment = this.peek().type === "COMMENT" ? (this.consume("COMMENT").value as string) : undefined;
      return Create.template({ name, arguments: args, comment });
    }
    const indices = this.parseOptionalIndices() as AST.Index[];
    const comment = this.peek().type === "COMMENT" ? (this.consume("COMMENT").value as string) : undefined;
    return Create.func({ name, arguments: args, indices, comment });
  }

  private parseTextArgs(): AST.TextArgs[] {
  const args: AST.TextArgs[] = [];
  if (this.peek().value === ")") return args;

  do {
    const arg = this.parseSingleTextArg();
    args.push(arg);
  } while (this.match("SYMBOL", ","));

  return args;
}

  /** Parse a single argument, which may be an arithmetic expression */
  private parseSingleTextArg(): AST.TextArgs {
    let left = this.parseAtom();

    // Check if followed by arithmetic operator(s)
    if (this.peek().type === "ARITH_OP") {
      // Collect consecutive operators (e.g., ** for exponentiation)
      const operators: AST.ArithmeticOperator[] = [];
      while (this.peek().type === "ARITH_OP") {
        operators.push(this.consume("ARITH_OP").value as AST.ArithmeticOperator);
      }

      // Parse the right side
      const right = this.parseSingleTextArg();

      return Create.arithmeticExpr({ operator: operators, left, right });
    }

    return left;
  }

  /** Parse an atomic value: number, time index, context var, name ref, or function/identifier */
  private parseAtom(): AST.TextArgs {
    const tok = this.peek();

    if (this.match("SYMBOL", "@")) {
      // Time index like @t
      return Create.timeIndex({ name: this.consume("IDENT").value as string });
    }

    // Name reference: $varname
    if (tok.type === "SYMBOL" && tok.value === "$") {
      return this.parseNameRef();
    }

    if (tok.type === "KEYWORD" && ["env", "sys", "resp", "prompt"].includes(tok.value as string)) {
      return this.parseContextVar();
    }

    if (tok.type === "NUMBER") {
      // Plain number - treat as OtherIndex
      return Create.otherIndex({ name: this.consume("NUMBER").value as string });
    }

    if (tok.type === "IDENT") {
      // Check if followed by ( - if so, it's a function call; otherwise plain identifier
      if (this.peekNext().value === "(") {
        return this.parseTemplateOrFunc() as AST.Func;
      }
      // Plain identifier - treat as OtherIndex
      return Create.otherIndex({ name: this.consume("IDENT").value as string });
    }
    throw new Error(`[${tok.line}:${tok.col}] Unexpected token in arguments: ${tok.type} (${tok.value})`);
  }

  private parseOptionalIndices(): AST.Index[] {
    const indices: AST.Index[] = [];
    console.log(`parseOptionalIndices: peek=${this.peek().type}:${this.peek().value}`);
    // Loop to handle multiple consecutive bracket sets like [@t][i]
    while (this.match("SYMBOL", "[")) {
      console.log(`parseOptionalIndices: found [, parsing index`);
      indices.push(this.parseIndex());
      console.log(`parseOptionalIndices: after parseIndex, peek=${this.peek().type}:${this.peek().value}`);
      while (this.match("SYMBOL", ",")) {
        indices.push(this.parseIndex());
      }
      if (this.peek().value === "]") {
        console.log(`parseOptionalIndices: consuming ]`);
        this.consume("SYMBOL", "]");
      }
    }
    console.log(`parseOptionalIndices: returning ${indices.length} indices, peek=${this.peek().type}:${this.peek().value}`);
    return indices;
  }

  private parseIndex(): AST.Index {
    console.log(`parseIndex: starting, peek=${this.peek().type}:${this.peek().value}`);
    let time: boolean = this.match("SYMBOL", "@");
    console.log(`parseIndex: time=${time}, peek after @check=${this.peek().type}:${this.peek().value}`);
    let idx: string = ""
    while (true) {
      const tok = this.peek();
      const tokType = tok.type;
      const tokValue = tok.value;
      console.log(`parseIndex loop: tok=${tokType}:${tokValue}, idx so far="${idx}"`);

      // Simple token types
      if (tokType === "IDENT" || tokType === "ARITH_OP" || tokType === "NUMBER") {
        idx += this.consume().value as string;
        continue;
      }

      // Check for dot followed by IDENT or @
      if (tokType === "SYMBOL" && tokValue === ".") {
        const next = this.peekNext();
        console.log(`parseIndex: at dot, next=${next?.type}:${next?.value}`);
        if (next && (next.type === "IDENT" || next.value === "@")) {
          idx += this.consume().value as string;
          continue;
        }
      }

      // Check for @ (for compound time indices like @t.@i)
      if (tokType === "SYMBOL" && tokValue === "@") {
        idx += this.consume().value as string;
        continue;
      }

      // No match, exit loop
      console.log(`parseIndex: breaking, final idx="${idx}"`);
      break;
    }
    // Return the correct AST node based on the 'time' flag
    console.log(`parseIndex: returning ${time ? "time" : "other"}-index with name="${idx}"`);
    if (time) {
      return Create.index("time-index", idx);
    } else {
      return Create.index("other-index", idx);
    }
  }


  /* ───────────────── Control Flow ───────────────── */

  private parseLoopOutside(): AST.LoopBlockOutsideRole {
    this.consume("KEYWORD", "ForEach");
    this.consume("SYMBOL", "(");
    let idx: string = this.peek().value === "@" ? "@" : "";
    const index = Create.index( "other-index", idx + this.parseIndex().name)
    this.consume("SYMBOL", ":");

    // Check if iterable is a range expression: range(start, end, optionalStep)
    let iterable: AST.Iterable;
    if (this.peek().value === "range" && this.peekNext().value === "(") {
      iterable = this.parseRangeExpr();
    } else {
      // Capture iterable tokens (e.g., "t - k ... t - 1")
      const iterTokens: AST.ExpressionToken[] = [];
      while (!(this.peek().value === ")" && this.peekNext().value === "{")) {
        if (this.isEOF()) throw new Error("Unterminated ForEach iterable");
        iterTokens.push(toExprToken(this.consume()));
      }
      iterable = Create.Iterable({ tokens: iterTokens });
    }
    this.consume("SYMBOL", ")");
    this.consume("SYMBOL", "{");

    const body: AST.PromptBlock[] = [];
    while (this.peek().value !== "}") {
      body.push(this.parseTopLevelBlock()); // RECURSIVE: Outside loops contain global blocks
    }
    this.consume("SYMBOL", "}");

    return Create.loopBlockOutsideRole({ index, iterable, body });
  }

  private parseRangeExpr(): AST.RangeExpr {
    this.consume("IDENT", "range");
    this.consume("SYMBOL", "(");

    // Parse start expression (tokens until comma at depth 0)
    const start: AST.ExpressionToken[] = [];
    let depth = 0;
    while (!(this.peek().value === "," && depth === 0)) {
      if (this.isEOF()) throw new Error("Unterminated range expression");
      const tok = this.consume();
      if (tok.value === "(") depth++;
      if (tok.value === ")") depth--;
      start.push(toExprToken(tok));
    }
    this.consume("SYMBOL", ",");

    // Parse end expression (tokens until comma or closing paren at depth 0)
    const end: AST.ExpressionToken[] = [];
    depth = 0;
    while (!((this.peek().value === "," || this.peek().value === ")") && depth === 0)) {
      if (this.isEOF()) throw new Error("Unterminated range expression");
      const tok = this.consume();
      if (tok.value === "(") depth++;
      if (tok.value === ")") depth--;
      end.push(toExprToken(tok));
    }

    // Check for optional step
    let step: AST.ExpressionToken[] | undefined;
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

    return Create.rangeExpr({ start, end, step });
  }

  private parseConditionalOutside(): AST.ConditionalBlockOutsideRole {
    this.consume("KEYWORD", "If");

    // 1. Parse the "If" Condition as tokens
    const ifCondTokens: AST.ExpressionToken[] = [];
    while (this.peek().value !== "{") {
        if (this.isEOF()) throw new Error("Unterminated If condition");
        ifCondTokens.push(toExprToken(this.consume()));
    }
    this.consume("SYMBOL", "{");

    // 2. Parse the "If" Body
    const ifBody: AST.PromptBlock[] = [];
    while (this.peek().value !== "}") {
        ifBody.push(this.parseTopLevelBlock());
    }
    this.consume("SYMBOL", "}");

    const elseIfConditions: AST.ExpressionToken[][] = [];
    const elseIfBodies: AST.PromptBlock[][] = [];
    let elseBody: AST.PromptBlock[] | undefined = undefined;

    // 3. Handle ElseIf and Else chains
    while (this.peek().type === "KEYWORD" && (this.peek().value === "ElseIf" || this.peek().value === "Else")) {
        const type = this.consume().value;

        if (type === "ElseIf") {
            const eiCondTokens: AST.ExpressionToken[] = [];
            while (this.peek().value !== "{"){
                eiCondTokens.push(toExprToken(this.consume()));
            }
            this.consume("SYMBOL", "{");

            const eiBody: AST.PromptBlock[] = [];
            while (this.peek().value !== "}") {
                eiBody.push(this.parseTopLevelBlock());
            }
            this.consume("SYMBOL", "}");

            elseIfConditions.push(eiCondTokens);
            elseIfBodies.push(eiBody);
        }
        else if (type === "Else") {
            this.consume("SYMBOL", "{");
            const eBody: AST.PromptBlock[] = [];
            while (this.peek().value !== "}") {
                eBody.push(this.parseTopLevelBlock());
            }
            this.consume("SYMBOL", "}");
            elseBody = eBody;
            break; // 'Else' must be the end of the chain
        }
    }

    return Create.conditionalBlockOutsideRole({
        Ifcondition: ifCondTokens,
        IfBody: ifBody,
        elseif: elseIfConditions,
        elseifBody: elseIfBodies,
        elseBody: elseBody
    });
  }

  private parseLoopInside(): AST.LoopBlockInsideRole {
    this.consume("KEYWORD", "ForEach");
    this.consume("SYMBOL", "(");
    let idx: string = this.peek().value === "@" ? "@" : "";
    const index = Create.index( "other-index", idx + this.parseIndex().name)
    this.consume("SYMBOL", ":");

    // Check if iterable is a range expression: range(start, end, optionalStep)
    let iterable: AST.Iterable;
    if (this.peek().value === "range" && this.peekNext().value === "(") {
      iterable = this.parseRangeExpr();
    } else {
      // Capture iterable tokens
      const iterTokens: AST.ExpressionToken[] = [];
      while (!(this.peek().value === ")" && this.peekNext().value === "{")) {
        if (this.isEOF()) throw new Error("Unterminated ForEach iterable");
        iterTokens.push(toExprToken(this.consume()));
      }
      iterable = Create.Iterable({ tokens: iterTokens });
    }
    this.consume("SYMBOL", ")");
    this.consume("SYMBOL", "{");

    const body: AST.RoleBuildingBlock[] = [];
    while ((this.peek() as any).value !== "}") body.push(this.parseRoleBuildingBlock()); // RECURSIVE: Inside loops contain role blocks
    this.consume("SYMBOL", "}");

    return Create.loopBlockInsideRole({ index, iterable, body });
  }

  private parseConditionalInside(): AST.ConditionalBlockInsideRole {
      this.consume("KEYWORD", "If");

      // 1. Parse the "If" Condition as tokens
      const ifCondTokens: AST.ExpressionToken[] = [];
      while (this.peek().value !== "{") {
          if (this.isEOF()) throw new Error("Unterminated If condition");
          ifCondTokens.push(toExprToken(this.consume()));
      }
      this.consume("SYMBOL", "{");

      // 2. Parse the "If" Body
      const ifBody: AST.RoleBuildingBlock[] = [];
      while (this.peek().value !== "}") {
          ifBody.push(this.parseRoleBuildingBlock());
      }
      this.consume("SYMBOL", "}");

      const elseIfConditions: AST.ExpressionToken[][] = [];
      const elseIfBodies: AST.RoleBuildingBlock[][] = [];
      let elseBody: AST.RoleBuildingBlock[] | undefined = undefined;

      // 3. Handle ElseIf and Else chains
      while (this.peek().type === "KEYWORD" && (this.peek().value === "ElseIf" || this.peek().value === "Else")) {
          const type = this.consume().value;

          if (type === "ElseIf") {
              const eiCondTokens: AST.ExpressionToken[] = [];
              while (this.peek().value !== "{") {
                  eiCondTokens.push(toExprToken(this.consume()));
              }
              this.consume("SYMBOL", "{");

              const eiBody: AST.RoleBuildingBlock[] = [];
              while (this.peek().value !== "}") {
                  eiBody.push(this.parseRoleBuildingBlock());
              }
              this.consume("SYMBOL", "}");

              elseIfConditions.push(eiCondTokens);
              elseIfBodies.push(eiBody);
          }
          else if (type === "Else") {
              this.consume("SYMBOL", "{");
              const eBody: AST.RoleBuildingBlock[] = [];
              while (this.peek().value !== "}") {
                  eBody.push(this.parseRoleBuildingBlock());
              }
              this.consume("SYMBOL", "}");
              elseBody = eBody;
              break; // 'Else' must be the end of the chain
          }
      }

      return Create.conditionalBlockInsideRole({
          Ifcondition: ifCondTokens,
          IfBody: ifBody,
          elseif: elseIfConditions,
          elseifBody: elseIfBodies,
          elseBody: elseBody
      });
  }

  // parseSwitchOutside and parseSwitchInside would follow the same scoping pattern.
  private parseSwitchOutside(): AST.SwitchBlockOutsideRole {
    this.consume("KEYWORD", "Switch");

    // 1. Capture the expression tokens (e.g., env.user_input[@t])
    const exprTokens: AST.ExpressionToken[] = [];
    while (this.peek().value !== "{") {
      if (this.isEOF()) throw new Error("Expected '{' after Switch expression");
      exprTokens.push(toExprToken(this.consume()));
    }
    this.consume("SYMBOL", "{");

    const cases: AST.CaseBlockOutsideRole[] = [];
    let defaultCase: AST.DefaultCaseBlockOutsideRole | undefined;

    // 2. Parse Case and Default blocks
    while (this.peek().value !== "}") {
      const kw = this.consume("KEYWORD").value;

      if (kw === "Case") {
        const matchTokens: AST.ExpressionToken[] = [];
        while (this.peek().value !== "{") {
          if (this.isEOF()) throw new Error("Expected '{' after Case match");
          matchTokens.push(toExprToken(this.consume()));
        }
        this.consume("SYMBOL", "{");
        const body: AST.PromptBlock[] = [];
        while (this.peek().value !== "}") {
          body.push(this.parseTopLevelBlock());
        }
        this.consume("SYMBOL", "}");
        cases.push(Create.caseBlockOutsideRole({ match: matchTokens, body }));
      }
      else if (kw === "Default") {
        this.consume("SYMBOL", "{");
        const body: AST.PromptBlock[] = [];
        while (this.peek().value !== "}") {
          body.push(this.parseTopLevelBlock());
        }
        this.consume("SYMBOL", "}");
        defaultCase = Create.defaultCaseBlockOutsideRole({ body });
      }
    }
    this.consume("SYMBOL", "}");

    return Create.switchBlockOutsideRole({
      expression: exprTokens,
      cases,
      defaultCase
    });
  }

  private parseSwitchInside(): AST.SwitchBlockInsideRole {
    this.consume("KEYWORD", "Switch");

    // 1. Capture the expression tokens (e.g., env.user_input[@t])
    const exprTokens: AST.ExpressionToken[] = [];
    while (this.peek().value !== "{") {
      if (this.isEOF()) throw new Error("Expected '{' after Switch expression");
      exprTokens.push(toExprToken(this.consume()));
    }
    this.consume("SYMBOL", "{");

    const cases: AST.CaseBlockInsideRole[] = [];
    let defaultCase: AST.DefaultCaseBlockInsideRole | undefined;

    // 2. Parse Case and Default blocks
    while (this.peek().value !== "}") {
      const kw = this.consume("KEYWORD").value;

      if (kw === "Case") {
        const matchTokens: AST.ExpressionToken[] = [];
        while (this.peek().value !== "{") {
          if (this.isEOF()) throw new Error("Expected '{' after Case match");
          matchTokens.push(toExprToken(this.consume()));
        }
        this.consume("SYMBOL", "{");
        const body: AST.RoleBuildingBlock[] = [];
        while (this.peek().value !== "}") {
          body.push(this.parseRoleBuildingBlock());
        }
        this.consume("SYMBOL", "}");
        cases.push(Create.caseBlockInsideRole({ match: matchTokens, body }));
      }
      else if (kw === "Default") {
        this.consume("SYMBOL", "{");
        const body: AST.RoleBuildingBlock[] = [];
        while (this.peek().value !== "}") {
          body.push(this.parseRoleBuildingBlock());
        }
        this.consume("SYMBOL", "}");
        defaultCase = Create.defaultCaseBlockInsideRole({ body });
      }
    }
    this.consume("SYMBOL", "}");

    return Create.switchBlockInsideRole({
      expression: exprTokens,
      cases,
      defaultCase
    });
  }


  private parseOptionalComment(): string | undefined {
      if (this.peek().type === "COMMENT") {
          return this.consume("COMMENT").value as string;
      }
      return undefined;
  }


  private isEOF(): boolean {
    return this.peek().type === "EOF"
  }


}