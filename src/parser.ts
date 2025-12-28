import { Scanner } from "./scanner";
import { Token } from "./tokens";
import * as AST from "./types";
import * as Create from "./constructors";


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
   * Strictly collects PromptBlocks (RoleMessages, Global Loops/Conditionals).
   */
  private parsePromptBody(): AST.PromptBody {
    const body: AST.PromptBlock[] = [];
    while (this.peek().type !== "EOF" && (this.peek().value !== "}")) {
      // Check for standalone comments
        if (this.peek().type === "COMMENT") {
            const text = this.consume("COMMENT").value as string;
            body.push(Create.commentBlock({ text }));
            continue;
        }
      body.push(this.parseTopLevelBlock());
    }
    const comment = this.parseOptionalComment();
    return Create.promptBody({ body });
  }

  private parseTopLevelBlock(): AST.PromptBlock {
    const tok = this.peek();
    const val = tok.value;

    // Role Message Prefixes: S:, U:, A:
    if (tok.type === "IDENT" && (val === "S" || val === "U" || val === "A")) {
      console.log("parsing role message")
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
    console.log("got here")

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
    console.log("started role building block")
    
    // Check for standalone comments FIRST
    if (tok.type === "COMMENT") {
        const text = this.consume("COMMENT").value as string;
        return Create.commentBlock({ text });
    }
    
    if (tok.type === "KEYWORD") {
      // 1. Check for Control Flow
      if (val === "If") return this.parseConditionalInside();
      if (val === "ForEach") return this.parseLoopInside();
      if (val === "Switch") return this.parseSwitchInside();
      
      // 2. Check for Context Namespaces
      const namespaces = ["obs", "mem", "act", "resp", "prompt"];
      if (namespaces.includes(val as string)) {
        return this.parseContextVar();
      }
    }

    // 3. Handle Templates/Functions (IDENT)
    if (tok.type === "IDENT") return this.parseTemplateOrFunc();

    throw new Error(`[${tok.line}:${tok.col}] Unexpected ${tok.type} (${val}) inside role.`);
  }

  /* ───────────────── Expressions & Shared Rules ───────────────── */

  private parseContextVar(): AST.ContextVar {
    const baseTok = this.consume("KEYWORD"); 
    const base = baseTok.value as AST.ContextBase; 

    const indices = this.parseOptionalIndices();
    
    let path: AST.PathDesc;
    this.consume("SYMBOL", ".")
    path = this.parsePathDesc();
    
    return Create.contextVar({ base, indices, path });
  }

  private parsePathDesc(): AST.PathDesc {
    const tok = this.peek();

    if (tok.type !== "IDENT" && tok.type !== "KEYWORD") {
        throw new Error(`[${tok.line}:${tok.col}] Expected identifier in path, got ${tok.type}`);
    }

    const base = this.consume().value as string;
    const indices = this.parseOptionalIndices();
    let next: AST.PathDesc | undefined;
    if (this.match("SYMBOL", ".")) {
      next = this.parsePathDesc();
    } 
    return Create.pathDesc({ base, indices, next });
  }

  private parseTemplateOrFunc(): AST.Template | AST.Func {
    const name = this.consume("IDENT").value as string;
    const args: AST.TextArgs[] = [];
    if (this.peek().value === "(") {
      this.consume("SYMBOL", "(");
      const args = this.parseTextArgs();
      this.consume("SYMBOL", ")");
    }
    
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
      // Handles @t
      args.push(Create.timeIndex({ name: this.consume("IDENT").value as string }));
    } 
    else if (tok.type === "KEYWORD" && ["obs", "mem", "act", "resp", "prompt"].includes(tok.value as string)) {
      args.push(this.parseContextVar());
    } 
    else if (tok.type === "IDENT") {
        args.push(this.parseTemplateOrFunc() as AST.Func);
      }
    else {
      throw new Error(`[${tok.line}:${tok.col}] Unexpected token in arguments: ${tok.type} (${tok.value})`);
    }
  } while (this.match("SYMBOL", ","));

  return args;
}

  private parseOptionalIndices(): AST.Index[] {
    const indices: AST.Index[] = [];
    if (this.match("SYMBOL", "[")){
      indices.push(this.parseIndex());
      while (this.match("SYMBOL", ",")) {
        indices.push(this.parseIndex());
      console.log(`indices: ${indices}`)
      }
    }
    if (this.peek().value === "]") this.consume("SYMBOL", "]");
    return indices;
  }

  private parseIndex(): AST.Index {
    let time: boolean = this.match("SYMBOL", "@");
    let idx: string = ""
    while (this.peek().type === "IDENT" || this.peek().type === "ARITH_OP" || this.peek().type === "NUMBER") {
        idx += this.consume().value as string
    }
    // Return the correct AST node based on the 'time' flag
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
    console.log("got here")
    this.consume("SYMBOL", ":");
    
    // Capture iterable (e.g., "t - k ... t - 1")
    let iter = "";
    while (!(this.peek().value === ")" && this.peekNext().value === "{")) {
      if (this.isEOF()) throw new Error("Unterminated If condition");
      iter += this.consume().value;
    }
    this.consume("SYMBOL", ")");
    this.consume("SYMBOL", "{");

    const body: AST.PromptBlock[] = [];
    while (this.peek().value !== "}") {
      body.push(this.parseTopLevelBlock()); // RECURSIVE: Outside loops contain global blocks
    }
    this.consume("SYMBOL", "}");

    return Create.loopBlockOutsideRole({ index, iterable: Create.Iterable({ value: iter.trim() }), body });
  }

  private parseConditionalOutside(): AST.ConditionalBlockOutsideRole {
    this.consume("KEYWORD", "If");

    // 1. Parse the "If" Condition
    let ifCond = "";
    while (this.peek().value !== "{") {
        if (this.isEOF()) throw new Error("Unterminated If condition");
        ifCond += this.consume().value;
        console.log(ifCond)
    }
    console.log(ifCond)
    this.consume("SYMBOL", "{");

    // 2. Parse the "If" Body
    const ifBody: AST.PromptBlock[] = [];
    while (this.peek().value !== "}") {
        ifBody.push(this.parseTopLevelBlock()); //
    }
    this.consume("SYMBOL", "}");

    const elseIfConditions: string[] = [];
    const elseIfBodies: AST.PromptBlock[][] = [];
    let elseBody: AST.PromptBlock[] | undefined = undefined;

    // 3. Handle ElseIf and Else chains
    while (this.peek().type === "KEYWORD" && (this.peek().value === "ElseIf" || this.peek().value === "Else")) {
        const type = this.consume().value;

        if (type === "ElseIf") {
            let eiCond = "";
            while (this.peek().value !== "{"){
                eiCond += this.consume().value;
            }
            this.consume("SYMBOL", "{");

            const eiBody: AST.PromptBlock[] = [];
            while (this.peek().value !== "}") {
                eiBody.push(this.parseTopLevelBlock());
            }
            this.consume("SYMBOL", "}");

            elseIfConditions.push(eiCond.trim());
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
        Ifcondition: ifCond.trim(), 
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
    let iter = "";
    while (!(this.peek().value === ")" && this.peekNext().value === "{")) {
      if (this.isEOF()) throw new Error("Unterminated If condition");
      iter += (this.consume()).value;
    }
    this.consume("SYMBOL", ")");
    this.consume("SYMBOL", "{");

    const body: AST.RoleBuildingBlock[] = [];
    while ((this.peek() as any).value !== "}") body.push(this.parseRoleBuildingBlock()); // RECURSIVE: Inside loops contain role blocks
    this.consume("SYMBOL", "}");

    return Create.loopBlockInsideRole({ index, iterable: Create.Iterable({ value: iter }), body });
  }

  private parseConditionalInside(): AST.ConditionalBlockInsideRole {
      this.consume("KEYWORD", "If");
      
      // 1. Parse the "If" Condition
      let ifCond = "";
      while (this.peek().value !== "{") {
          if (this.isEOF()) throw new Error("Unterminated If condition");
          ifCond += this.consume().value;
          console.log(ifCond)
      }
      this.consume("SYMBOL", "{");

      // 2. Parse the "If" Body
      const ifBody: AST.RoleBuildingBlock[] = [];
      while (this.peek().value !== "}") {
          ifBody.push(this.parseRoleBuildingBlock()); //
      }
      this.consume("SYMBOL", "}");

      const elseIfConditions: string[] = [];
      const elseIfBodies: AST.RoleBuildingBlock[][] = [];
      let elseBody: AST.RoleBuildingBlock[] | undefined = undefined;

      // 3. Handle ElseIf and Else chains
      while (this.peek().type === "KEYWORD" && (this.peek().value === "ElseIf" || this.peek().value === "Else")) {
          const type = this.consume().value;

          if (type === "ElseIf") {
              let eiCond = "";
              while (this.peek().value !== "{") {
                  eiCond += this.consume().value;
              }
              this.consume("SYMBOL", "{");

              const eiBody: AST.RoleBuildingBlock[] = [];
              while (this.peek().value !== "}") {
                  eiBody.push(this.parseRoleBuildingBlock());
              }
              this.consume("SYMBOL", "}");

              elseIfConditions.push(eiCond.trim());
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
          Ifcondition: ifCond.trim(), 
          IfBody: ifBody, 
          elseif: elseIfConditions, 
          elseifBody: elseIfBodies,
          elseBody: elseBody 
      });
  }

  // parseSwitchOutside and parseSwitchInside would follow the same scoping pattern.
  private parseSwitchOutside(): AST.SwitchBlockOutsideRole {
    this.consume("KEYWORD", "Switch");

    // 1. Capture the expression (e.g., obs.user_input[@t])
    let expression = "";
    while (this.peek().value !== "{") {
      if (this.isEOF()) throw new Error("Expected '{' after Switch expression");
      expression += this.consume().value;
    }
    this.consume("SYMBOL", "{");

    const cases: AST.CaseBlockOutsideRole[] = [];
    let defaultCase: AST.DefaultCaseBlockOutsideRole | undefined;

    // 2. Parse Case and Default blocks
    while (this.peek().value !== "}") {
      const kw = this.consume("KEYWORD").value;

      if (kw === "Case") {
        let match : string = ""
        while (this.peek().value !== "{") {
          if (this.isEOF()) throw new Error("Expected '{' after Switch expression");
          match += (this.consume().value as string);
        }
        this.consume("SYMBOL", "{");
        const body: AST.PromptBlock[] = [];
        while (this.peek().value !== "}") {
          body.push(this.parseTopLevelBlock());
        }
        this.consume("SYMBOL", "}");
        cases.push(Create.caseBlockOutsideRole({ match, body }));
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
      expression: expression.trim(), 
      cases, 
      defaultCase 
    });
  }

  private parseSwitchInside(): AST.SwitchBlockInsideRole {
    this.consume("KEYWORD", "Switch");

    // 1. Capture the expression (e.g., obs.user_input[@t])
    let expression = "";
    while (this.peek().value !== "{") {
      if (this.isEOF()) throw new Error("Expected '{' after Switch expression");
      expression += this.consume().value;
    }
    this.consume("SYMBOL", "{");

    const cases: AST.CaseBlockInsideRole[] = [];
    let defaultCase: AST.DefaultCaseBlockInsideRole | undefined;

    // 2. Parse Case and Default blocks
    while (this.peek().value !== "}") {
      const kw = this.consume("KEYWORD").value;

      if (kw === "Case") {
        let match : string = ""
        while (this.peek().value !== "{") {
          if (this.isEOF()) throw new Error("Expected '{' after Switch expression");
          match += (this.consume().value as string);
        }
        this.consume("SYMBOL", "{");
        const body: AST.RoleBuildingBlock[] = [];
        while (this.peek().value !== "}") {
          body.push(this.parseRoleBuildingBlock());
        }
        this.consume("SYMBOL", "}");
        cases.push(Create.caseBlockInsideRole({ match, body }));
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
      expression: expression.trim(), 
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