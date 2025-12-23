import { Scanner } from "./scanner";
import { Token } from "./tokens";
import * as AST from "../types";
import * as Create from "../constructors";

/**
 * Recursive Descent Parser for the PDDL-style Prompt DSL.
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

  /**
   * Consumes a token of a specific type and/or value.
   * Since Token.value is (string | null), we use type assertions for IDENT values.
   */
  private consume(type?: string, value?: string): Token {
    const tok = this.peek();
    if (type && tok.type !== type) {
      throw new Error(`[${tok.line}:${tok.col}] Expected token type ${type}, got ${tok.type}`);
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
    return Create.prompt({ title, body });
  }

  private parseTitle(): AST.PromptTitle {
    const name = this.consume("IDENT").value as string; // Assert string for constructor
    const indices = this.parseOptionalIndices();
    return Create.promptTitle({ name, indices });
  }

  /**
   * Gatekeeper for Top-Level Scope.
   * Strictly collects PromptBlocks (RoleMessages, Global Loops/Conditionals).
   */
  private parsePromptBody(): AST.PromptBody {
    const body: AST.PromptBlock[] = [];
    while (this.peek().type !== "EOF" && (this.peek().value !== "}")) {
      body.push(this.parseTopLevelBlock());
    }
    return Create.promptBody({ body });
  }

  private parseTopLevelBlock(): AST.PromptBlock {
    const tok = this.peek();
    const val = tok.value;

    // Role Message Prefixes: S:, U:, A:
    if (tok.type === "IDENT" && (val === "S" || val === "U" || val === "A")) {
      return this.parseRoleMessage();
    }

    if (tok.type === "KEYWORD") {
      switch (val) {
        case "If": return this.parseConditionalOutside();
        case "ForEach": return this.parseLoopOutside();
        case "Switch": return this.parseSwitchOutside();
      }
    }

    throw new Error(`[${tok.line}:${tok.col}] Syntax Error: Unexpected token "${val}" in global scope.`);
  }

  /**
   * RoleMessage = ROLE_ID: { RoleBuildingBlock* }
   */
  private parseRoleMessage(): AST.RoleMessage {
    const roleId = this.consume("IDENT").value as string;
    this.consume("SYMBOL", ":");
    this.consume("SYMBOL", "{");

    const roleMap: Record<string, AST.Role> = { "S": "system", "U": "user", "A": "assistant" };
    const role = roleMap[roleId];

    const body: AST.RoleBuildingBlock[] = [];
    while (this.peek().type !== "EOF" && this.peek().value !== "}") {
      body.push(this.parseRoleBuildingBlock());
    }
    this.consume("SYMBOL", "}");

    return Create.roleMessage({ role, body });
  }

  /* ───────────────── Grammar Rules (Inside Role) ───────────────── */

  /**
   * Gatekeeper for Inside-Role Scope.
   * Strictly collects RoleBuildingBlocks (ContextVars, Templates, Logic).
   */
  private parseRoleBuildingBlock(): AST.RoleBuildingBlock {
    const tok = this.peek();
    const val = tok.value;

    if (tok.type === "KEYWORD") {
      if (val === "If") return this.parseConditionalInside();
      if (val === "ForEach") return this.parseLoopInside();
      if (val === "Switch") return this.parseSwitchInside();
      
      const namespaces = ["obs", "mem", "act", "resp", "prompt"];
      if (namespaces.includes(val as string)) return this.parseContextVar();
    }

    // Role Message prefixes are disallowed here by the lack of an IDENT check
    if (tok.type === "IDENT") return this.parseTemplateOrFunc();

    throw new Error(`[${tok.line}:${tok.col}] Syntax Error: "${val}" is not allowed inside a Role Message.`);
  }

  /* ───────────────── Expressions & Shared Rules ───────────────── */

  private parseContextVar(): AST.ContextVar {
    const base = this.consume("KEYWORD").value as AST.ContextBase;
    const indices = this.parseOptionalIndices();
    let path: AST.PathDesc | undefined;
    if (this.match("SYMBOL", ".")) path = this.parsePathDesc();
    return Create.contextVar({ base, indices, path: path! });
  }

  private parsePathDesc(): AST.PathDesc {
    const base = this.consume("IDENT").value as string;
    const indices = this.parseOptionalIndices();
    let next: AST.PathDesc | undefined;
    if (this.match("SYMBOL", ".")) next = this.parsePathDesc();
    return Create.pathDesc({ base, indices, next });
  }

  private parseTemplateOrFunc(): AST.Template | AST.Func {
    const name = this.consume("IDENT").value as string;
    this.consume("SYMBOL", "(");
    const args = this.parseTextArgs();
    this.consume("SYMBOL", ")");

    // Template logic: All caps or specifically handled
    if (name === name.toUpperCase()) {
      let comment = this.peek().type === "COMMENT" ? (this.consume("COMMENT").value as string) : undefined;
      return Create.template({ name, arguments: args, comment });
    }
    return Create.func({ name, arguments: args, indices: this.parseOptionalIndices() as AST.OtherIndex[] });
  }

  private parseTextArgs(): AST.TextArgs[] {
    const args: AST.TextArgs[] = [];
    if (this.peek().value === ")") return args;
    do {
      const tok = this.peek();
      if (this.match("SYMBOL", "@")) {
        args.push(Create.timeIndex({ name: this.consume("IDENT").value as string }));
      } else if (tok.type === "KEYWORD") {
        args.push(this.parseContextVar());
      } else {
        args.push(this.parseTemplateOrFunc() as AST.Func);
      }
    } while (this.match("SYMBOL", ","));
    return args;
  }

  private parseOptionalIndices(): AST.Index[] {
    const indices: AST.Index[] = [];
    while (this.match("SYMBOL", "[")) {
      indices.push(this.parseIndex());
      this.consume("SYMBOL", "]");
    }
    return indices;
  }

  private parseIndex(): AST.Index {
    if (this.match("SYMBOL", "@")) {
      return Create.index("time-index", this.consume("IDENT").value as string);
    }
    return Create.index("other-index", this.consume("IDENT").value as string);
  }

  /* ───────────────── Control Flow ───────────────── */

  private parseLoopOutside(): AST.LoopBlockOutsideRole {
    this.consume("KEYWORD", "ForEach");
    this.consume("SYMBOL", "(");
    const index = Create.otherIndex({ name: this.consume("IDENT").value as string });
    this.consume("SYMBOL", ":");
    
    // Capture iterable (e.g., "t - k ... t - 1")
    let iter = "";
    while ((this.peek() as any).value !== ")") iter += (this.consume() as any).value + " ";
    this.consume("SYMBOL", ")");
    this.consume("SYMBOL", ":");
    this.consume("SYMBOL", "{");

    const body: AST.PromptBlock[] = [];
    while ((this.peek() as any).value !== "}") {
      body.push(this.parseTopLevelBlock()); // RECURSIVE: Outside loops contain global blocks
    }
    this.consume("SYMBOL", "}");

    return Create.loopBlockOutsideRole({ index, iterable: Create.Iterable({ value: iter.trim() }), body });
  }

  private parseConditionalOutside(): AST.ConditionalBlockOutsideRole {
    this.consume("KEYWORD", "If");
    this.consume("SYMBOL", "(");
    let cond = "";
    while ((this.peek() as any).value !== ")") cond += (this.consume() as any).value;
    this.consume("SYMBOL", ")");
    this.consume("SYMBOL", ":");
    this.consume("SYMBOL", "{");

    const body: AST.PromptBlock[] = [];
    while ((this.peek() as any).value !== "}") body.push(this.parseTopLevelBlock());
    this.consume("SYMBOL", "}");

    return Create.conditionalBlockOutsideRole({ Ifcondition: cond, IfBody: body, elseif: [], elseifBody: [] });
  }

  private parseLoopInside(): AST.LoopBlockInsideRole {
    this.consume("KEYWORD", "ForEach");
    this.consume("SYMBOL", "(");
    const index = Create.otherIndex({ name: this.consume("IDENT").value as string });
    this.consume("SYMBOL", ":");
    let iter = "";
    while ((this.peek() as any).value !== ")") iter += (this.consume() as any).value;
    this.consume("SYMBOL", ")");
    this.consume("SYMBOL", ":");
    this.consume("SYMBOL", "{");

    const body: AST.RoleBuildingBlock[] = [];
    while ((this.peek() as any).value !== "}") body.push(this.parseRoleBuildingBlock()); // RECURSIVE: Inside loops contain role blocks
    this.consume("SYMBOL", "}");

    return Create.loopBlockInsideRole({ index, iterable: Create.Iterable({ value: iter }), body });
  }

  private parseConditionalInside(): AST.ConditionalBlockInsideRole {
    this.consume("KEYWORD", "If");
    this.consume("SYMBOL", "(");
    let cond = "";
    while ((this.peek() as any).value !== ")") cond += (this.consume() as any).value;
    this.consume("SYMBOL", ")");
    this.consume("SYMBOL", ":");
    this.consume("SYMBOL", "{");

    const body: AST.RoleBuildingBlock[] = [];
    while ((this.peek() as any).value !== "}") body.push(this.parseRoleBuildingBlock());
    this.consume("SYMBOL", "}");

    return Create.conditionalBlockInsideRole({ Ifcondition: cond, IfBody: body, elseif: [], elseifBody: [] });
  }

  // parseSwitchOutside and parseSwitchInside would follow the same scoping pattern.
  private parseSwitchOutside(): AST.SwitchBlockOutsideRole {
    this.consume("KEYWORD", "Switch");
    // ... logic would call parseTopLevelBlock for cases
    return Create.switchBlockOutsideRole({ expression: "", cases: [] });
  }

  private parseSwitchInside(): AST.SwitchBlockInsideRole {
    this.consume("KEYWORD", "Switch");
    // ... logic would call parseRoleBuildingBlock for cases
    return Create.switchBlockInsideRole({ expression: "", cases: [] });
  }
}