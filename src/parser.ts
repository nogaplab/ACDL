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
  private lastConsumedLine = 0;

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
   * The next token that is not a comment, without consuming anything.
   * Comments are legal on any line, so structural lookahead (Case/Default/Else)
   * must see past them rather than treating one as the end of a construct.
   */
  private peekSkippingComments(): Token {
    let i = this.pos;
    while (this.tokens[i] && this.tokens[i].type === "COMMENT") i++;
    return this.tokens[i];
  }

  /** Consume any run of comment tokens at the current position. */
  private skipComments(): void {
    while (this.peek() && this.peek().type === "COMMENT") this.consume("COMMENT");
  }

  /** Consume any run of comment tokens at the current position, keeping their text. */
  private collectComments(): string[] {
    const out: string[] = [];
    while (this.peek() && this.peek().type === "COMMENT") out.push(this.consume("COMMENT").value as string);
    return out;
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
    // Every token passes through here, so this is the one place the rule about
    // `#msg` needs enforcing — whether it was reached through an argument list,
    // an index, or a captured condition.
    if (tok.type === "MSG" && this.roleDepth === 0) {
      throw new Error(`[${tok.line}:${tok.col}] #msg is the number of the current message, so it can only appear inside a role message (S:, U:, A:, T:)`);
    }
    this.pos++;
    this.lastConsumedLine = tok.line;
    return tok;
  }

  private match(type: string, value?: string): boolean {
    const tok = this.peek();
    if (tok.type === type && (!value || (tok as any).value === value)) {
      this.pos++;
      this.lastConsumedLine = tok.line;
      return true;
    }
    return false;
  }

  /* ───────────────── Tolerances ─────────────────
   *
   * ACDL source is written by hand and by models, and neither reliably produces
   * the canonical spelling of everything. The parser therefore accepts the
   * obvious variants — punctuation people expect to be optional, separators they
   * reach for out of habit — and normalises them into the canonical AST, so the
   * rendered diagram looks the same however the source was typed.
   */

  /**
   * Role markers, by the spellings people actually write. The AST always stores
   * the canonical role, so rendering is unaffected by which spelling was used.
   */
  private static readonly ROLE_MARKERS = new Map<string, AST.Role>([
    ["s", "system"], ["system", "system"],
    ["u", "user"], ["user", "user"],
    ["a", "assistant"], ["assistant", "assistant"],
    ["t", "tool"], ["tool", "tool"],
  ]);

  /** The completion-format marker, `N:`. */
  private static readonly NONE_MARKERS = new Set<string>(["n", "none"]);

  /** Spellings of the early-termination marker. */
  private static readonly END_MARKERS = new Set<string>([
    "promptendshere", "prompt_ends_here", "promptends",
  ]);

  /** Marks without an explicit number are numbered in source order. */
  private markCounter = 0;

  /**
   * How many message bodies enclose the current position. `#msg` is only
   * meaningful where there is a current message: inside a role message, an
   * `N:` message, or a StrFrag body (which only ever expands inside one).
   */
  private roleDepth = 0;

  /** Run `body` with the current position counted as inside a message. */
  private insideMessage<T>(body: () => T): T {
    this.roleDepth++;
    try {
      return body();
    } finally {
      this.roleDepth--;
    }
  }

  /**
   * The role the token at `offset` introduces, or undefined if it introduces
   * none. A role marker only counts as one when `:` or `{` follows: `a` and `t`
   * are ordinary loop variables, and must not shadow the assistant and tool
   * roles wherever they appear.
   */
  private roleAt(offset = 0): AST.Role | undefined {
    const tok = this.tokens[this.pos + offset];
    const next = this.tokens[this.pos + offset + 1];
    if (!tok || tok.type !== "IDENT") return undefined;
    if (!next || (next.value !== ":" && next.value !== "{")) return undefined;
    return Parser.ROLE_MARKERS.get(String(tok.value).toLowerCase());
  }

  /** Whether this token is the early-termination marker, in any casing. */
  private isEndMarker(tok: Token): boolean {
    return tok.type === "IDENT" && Parser.END_MARKERS.has(String(tok.value).toLowerCase());
  }

  /** `range(...)`, in any casing — the one built-in iterable. */
  private isRangeCall(): boolean {
    const tok = this.peek();
    return tok.type === "IDENT"
      && String(tok.value).toLowerCase() === "range"
      && this.peekNext().value === "(";
  }

  /**
   * Consume the `:` that introduces a block body, if it is there. `S: { ... }`
   * and `S { ... }` mean the same thing, as do `Spec[@T]: {` and `Spec[@T] {`.
   */
  private matchOptionalColon(): void {
    this.match("SYMBOL", ":");
  }

  /** Stray statement separators. ACDL has none, but muscle memory supplies them. */
  private skipSeparators(): void {
    while (this.peek().type === "SYMBOL" && this.peek().value === ";") this.consume();
  }

  /**
   * Drop a trailing `:` from a captured header expression. `Case user: {` and
   * `If (x): {` read naturally and appear in the wild — the language reference's
   * own worked example writes the former — but the colon is punctuation, not
   * part of the expression, and must not reach the renderer.
   */
  private trimTrailingColon(tokens: AST.ExpressionToken[]): AST.ExpressionToken[] {
    while (tokens.length) {
      const last = tokens[tokens.length - 1];
      if (last.type !== "SYMBOL" || last.value !== ":") break;
      tokens.pop();
    }
    return tokens;
  }

  /** True when the current token closes a block, or the file has run out. */
  private atBlockEnd(): boolean {
    return this.isEOF() || this.peek().value === "}";
  }

  /**
   * Consume a block's closing brace, naming the line the block opened on when it
   * is missing — far more useful than "expected }, got EOF" pointing at the last
   * line of the file.
   */
  private consumeBlockClose(openLine: number, what: string): void {
    if (this.isEOF()) {
      const tok = this.peek();
      throw new Error(`[${tok.line}:${tok.col}] Missing closing "}" for ${what} opened at line ${openLine}`);
    }
    this.consume("SYMBOL", "}");
  }

  /* ───────────────── Grammar Rules (Outside Role) ───────────────── */

  /**
   * Entry Point: Prompt[indices]: { ... }
   */
  public parsePrompt(): AST.Prompt {
    const title = this.parseTitle();
    this.matchOptionalColon();
    const openLine = this.peek().line;
    this.consume("SYMBOL", "{");
    const body = this.parsePromptBody();
    this.consumeBlockClose(openLine, `prompt "${title.name}"`);
    console.log("parsed prompt")
    return Create.prompt({ title, body });
  }

  /**
   * Parse a file containing one or more prompts, fragment definitions, and comments.
   * Returns an array of Prompt, StrFragDef, RolesFragDef, and CommentBlock objects.
   */
  public parseFile(): (AST.Prompt | AST.StrFragDef | AST.RolesFragDef | AST.CommentBlock)[] {
    const blocks: (AST.Prompt | AST.StrFragDef | AST.RolesFragDef | AST.CommentBlock)[] = [];

    while (!this.isEOF()) {
      this.skipSeparators();
      if (this.isEOF()) break;
      const tok = this.peek();
      if (tok.type === "COMMENT") {
        const text = this.consume("COMMENT").value as string;
        blocks.push(Create.commentBlock({ text }));
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
  public parseFileWithRanges(): Array<{
    block: AST.Prompt | AST.StrFragDef | AST.RolesFragDef | AST.CommentBlock;
    startLine: number;
    endLine: number;
  }> {
    const ranges: Array<{
      block: AST.Prompt | AST.StrFragDef | AST.RolesFragDef | AST.CommentBlock;
      startLine: number;
      endLine: number;
    }> = [];

    while (!this.isEOF()) {
      this.skipSeparators();
      if (this.isEOF()) break;
      const tok = this.peek();
      const startLine = tok.line;
      let block: AST.Prompt | AST.StrFragDef | AST.RolesFragDef | AST.CommentBlock;
      if (tok.type === "COMMENT") {
        const text = this.consume("COMMENT").value as string;
        block = Create.commentBlock({ text });
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
  private parseStrFragDef(): AST.StrFragDef {
    this.consume("KEYWORD", "StrFrag");
    const name = this.consume("IDENT").value as string;

    // Parse optional parameters in brackets
    let params: AST.TextArgs[] = [];
    if (this.peek().value === "[") {
      this.consume("SYMBOL", "[");
      if (this.peek().value !== "]") {
        params = this.parseTextArgs();
      }
      this.consume("SYMBOL", "]");
    }

    this.matchOptionalColon();
    const openLine = this.peek().line;
    this.consume("SYMBOL", "{");

    const body: AST.RoleBuildingBlock[] = [];
    this.insideMessage(() => {
      while (!this.atBlockEnd()) {
        this.skipSeparators();
        if (this.atBlockEnd()) break;
        body.push(this.parseRoleBuildingBlock());
      }
    });
    this.consumeBlockClose(openLine, `StrFrag "${name}"`);

    console.log("parsed StrFrag definition");
    return Create.strFragDef({ name, params, body });
  }

  /**
   * Parse a RolesFrag definition: RolesFrag Name[params]: { PromptBlock* }
   */
  private parseRolesFragDef(): AST.RolesFragDef {
    this.consume("KEYWORD", "RolesFrag");
    const name = this.consume("IDENT").value as string;

    // Parse optional parameters in brackets
    let params: AST.TextArgs[] = [];
    if (this.peek().value === "[") {
      this.consume("SYMBOL", "[");
      if (this.peek().value !== "]") {
        params = this.parseTextArgs();
      }
      this.consume("SYMBOL", "]");
    }

    this.matchOptionalColon();
    const openLine = this.peek().line;
    this.consume("SYMBOL", "{");

    const body: AST.PromptBlock[] = [];
    while (!this.atBlockEnd()) {
      this.skipSeparators();
      if (this.atBlockEnd()) break;
      if (this.peek().type === "COMMENT") {
        const text = this.consume("COMMENT").value as string;
        body.push(Create.commentBlock({ text }));
        continue;
      }
      body.push(this.parsePromptBodyItem());
    }
    this.consumeBlockClose(openLine, `RolesFrag "${name}"`);

    console.log("parsed RolesFrag definition");
    return Create.rolesFragDef({ name, params, body });
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
    const marker = this.peek();
    const after = this.peekNext();
    const isCompletionPrompt =
      marker.type === "IDENT" &&
      Parser.NONE_MARKERS.has(String(marker.value).toLowerCase()) &&
      !!after && (after.value === ":" || after.value === "{");
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
    while (!this.atBlockEnd()) {
      this.skipSeparators();
      if (this.atBlockEnd()) break;
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
    this.consume("IDENT");
    this.matchOptionalColon();

    const body: AST.RoleBuildingBlock[] = [];

    this.insideMessage(() => {
      if (this.peek().value === "{") {
        const openLine = this.peek().line;
        this.consume("SYMBOL", "{");
        while (!this.atBlockEnd()) {
          this.skipSeparators();
          if (this.atBlockEnd()) break;
          body.push(this.parseRoleBuildingBlock());
        }
        this.consumeBlockClose(openLine, "N message");
      } else {
        // Single-line syntax
        const startLine = this.peek().line;
        body.push(this.parseRoleBuildingBlockSingleLine(startLine));
      }
    });

    return Create.noneMessage({ body });
  }

  /**
   * Parse a PromptBodyItem (either a PromptBlock or a LabelBlock).
   */
  private parsePromptBodyItem(): AST.PromptBlock {
    return this.parseTopLevelBlock();
  }

  private parseTopLevelBlock(): AST.PromptBlock {
    const tok = this.peek();
    const nextTok = this.peekNext();
    const val = tok.value;

    // Role message prefixes: S:, U:, A:, T: — any casing, or spelled out in full.
    if (this.roleAt()) {
      console.log("parsing role message")
      return this.parseRoleMessage();
    }

    if (tok.type === "KEYWORD") {
      switch (val) {
        case "If": return this.parseConditionalOutside();
        case "ForEach": return this.parseLoopOutside();
        // A bare `for` in statement position can only mean a loop: the `for` of
        // a list comprehension is consumed inside parseListComprehension and
        // never reaches here.
        case "for": return this.parseLoopOutside();
        case "Switch": return this.parseSwitchOutside();
        case "Name": return this.parseNameDef();
        case "Mark": return this.parseMarkBlock();
        case "Frag": return this.parseRolesFragInvocation();
      }
    }

    // Check for PromptEndsHere (an IDENT, not a keyword)
    if (this.isEndMarker(tok)) {
      return this.parseEndBlock();
    }

    if (tok.type === "COMMENT") {
        const text = this.consume("COMMENT").value as string;
        return Create.commentBlock({ text });
    }

    throw new Error(`[${tok.line}:${tok.col}] Syntax Error: Unexpected token "${val}" in global scope. Expected a role message (S:, U:, A:, T:), control flow (If, ForEach, Switch), Mark, Name, Frag, or a comment.`);
  }

  /**
   * Parse a MarkBlock: MARK number { PromptBlock+ }
   * Mark blocks are like label blocks but rendered with a bracket on the right.
   */
  private parseMarkBlock(): AST.MarkBlock {
    this.consume("KEYWORD", "Mark");
    const markNumber = this.parseMarkNumber();

    this.matchOptionalColon();
    const openLine = this.peek().line;
    this.consume("SYMBOL", "{");

    // Parse blocks until we hit closing "}"
    const blocks: Array<AST.PromptBlock> = [];

    while (!this.atBlockEnd()) {
      this.skipSeparators();
      if (this.atBlockEnd()) break;

      // Check for standalone comments inside mark blocks
      if (this.peek().type === "COMMENT") {
        const text = this.consume("COMMENT").value as string;
        blocks.push(Create.commentBlock({ text }));
        continue;
      }

      // Parse a block (PromptBlock only)
      const innerBlock = this.parseTopLevelBlock();
      blocks.push(innerBlock);
    }

    this.consumeBlockClose(openLine, `Mark ${markNumber}`);

    return Create.markBlock({ markNumber, body: blocks });
  }

  /**
   * Parse a MarkBlockInsideRole: MARK number { RoleBuildingBlock+ }
   * Mark blocks inside roles contain role building blocks.
   */
  private parseMarkBlockInside(): AST.MarkBlockInsideRole {
    this.consume("KEYWORD", "Mark");
    const markNumber = this.parseMarkNumber();

    this.matchOptionalColon();
    const openLine = this.peek().line;
    this.consume("SYMBOL", "{");

    // Parse blocks until we hit closing "}"
    const blocks: Array<AST.RoleBuildingBlock> = [];

    while (!this.atBlockEnd()) {
      this.skipSeparators();
      if (this.atBlockEnd()) break;

      // Check for standalone comments inside mark blocks
      if (this.peek().type === "COMMENT") {
        const text = this.consume("COMMENT").value as string;
        blocks.push(Create.commentBlock({ text }));
        continue;
      }

      // Parse a role building block
      const innerBlock = this.parseRoleBuildingBlock();
      blocks.push(innerBlock);
    }

    this.consumeBlockClose(openLine, `Mark ${markNumber}`);

    return Create.markBlockInsideRole({ markNumber, body: blocks });
  }

  /**
   * A mark's number is purely presentational, so an omitted one is not worth an
   * error: unnumbered marks are numbered in source order, continuing from the
   * highest number the file has used so far.
   */
  private parseMarkNumber(): number {
    if (this.peek().type === "NUMBER") {
      const explicit = parseInt(this.consume("NUMBER").value as string, 10);
      this.markCounter = Math.max(this.markCounter, explicit);
      return explicit;
    }
    return ++this.markCounter;
  }

  /*
   * RoleMessage = ROLE_ID: { RoleBuildingBlock* } | ROLE_ID: RoleBuildingBlock
   * Supports both multi-line blocks with curly braces and single-line without braces
  */
  private parseRoleMessage(): AST.RoleMessage {
    const role = this.roleAt()!;
    this.consume("IDENT");        // the role marker, in whatever spelling
    this.matchOptionalColon();    // `U: { ... }` and `U { ... }` are the same

    const body: AST.RoleBuildingBlock[] = [];

    this.insideMessage(() => {
      // Check if this is a multi-line block with curly braces or a single-line block
      if (this.peek().value === "{") {
        // Multi-line syntax: U: { ... }
        const openLine = this.peek().line;
        this.consume("SYMBOL", "{");
        while (!this.atBlockEnd()) {
          this.skipSeparators();
          if (this.atBlockEnd()) break;
          body.push(this.parseRoleBuildingBlock());
        }
        this.consumeBlockClose(openLine, `${role} message`);
      } else {
        // Single-line syntax: U: obs.user_query[@i]
        // Only consume content on the same line
        const startLine = this.peek().line;
        body.push(this.parseRoleBuildingBlockSingleLine(startLine));
      }
    });

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

    // Name reference: U: $docs
    if (tok.type === "SYMBOL" && val === "$") {
      return this.parseNameRef();
    }

    if (tok.type === "KEYWORD") {
      // Control flow not allowed in single-line syntax
      if (val === "If" || val === "ForEach" || val === "for" || val === "Switch") {
        throw new Error(`[${tok.line}:${tok.col}] Control flow statements not allowed in single-line role syntax. Use the braced form: ${this.tokens[this.pos - 2]?.value ?? "U"}: { ... }`);
      }

      // Fragment invocation: U: Frag Name[args]
      if (val === "Frag") return this.parseStrFragInvocation();

      // Context namespaces
      const namespaces = ["env", "sys", "resp", "prompt"];
      if (namespaces.includes(val as string)) {
        return this.parseContextVar();
      }
    }

    // Handle Templates/Functions (IDENT)
    if (tok.type === "IDENT") return this.parseTemplateOrFunc();

    if (tok.type === "MSG") throw this.bareMsgError(tok);

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
      if (val === "ForEach" || val === "for") return this.parseLoopInside();
      if (val === "Switch") return this.parseSwitchInside();
      if (val === "Mark") return this.parseMarkBlockInside();

      // 2. Check for Name definition
      if (val === "Name") return this.parseNameDef();

      // 3. Check for fragment invocation
      if (val === "Frag") return this.parseStrFragInvocation();

      // 4. Handle break and continue as template-like keywords
      if (val === "break" || val === "continue") {
        const name = this.consume("KEYWORD").value as string;
        return Create.template({ name, arguments: [], comment: undefined });
      }

      // 5. Check for Context namespaces
      const namespaces = ["env", "sys", "resp", "prompt"];
      if (namespaces.includes(val as string)) {
        return this.parseContextVar();
      }
    }

    // Check for PromptEndsHere (IDENT)
    if (this.isEndMarker(tok)) {
      return this.parseEndBlock();
    }

    // 5. Handle Templates/Functions (IDENT)
    if (tok.type === "IDENT") return this.parseTemplateOrFunc();

    if (tok.type === "MSG") throw this.bareMsgError(tok);

    throw new Error(`[${tok.line}:${tok.col}] Unexpected ${tok.type} (${val}) inside role. Expected a context variable, template, function, control flow, Name, Frag, or a comment.`);
  }

  /**
   * `#msg` is a value, not content: it stands in for a number wherever an
   * argument or index does, and has nothing to say on a line of its own.
   */
  private bareMsgError(tok: Token): Error {
    return new Error(`[${tok.line}:${tok.col}] #msg must be used as an argument or an index, e.g. sys.history[#msg] or SUMMARY(#msg), not on its own`);
  }

  /* ───────────────── Name Definitions ───────────────── */

  /**
   * Parse a name definition: name varname := expr
   * where expr is a ContextVar, Func, ListComprehension, or StrFragInvocation
   */
  private parseNameDef(): AST.NameDef {
    this.consume("KEYWORD", "Name");
    const varName = this.consume("IDENT").value as string;
    this.consumeAssignment(varName);

    // Parse the value - ContextVar, Func, ListComprehension, or StrFragInvocation
    const tok = this.peek();
    let value: AST.ContextVar | AST.Func | AST.ListComprehension | AST.StrFragInvocation;

    // Check for list comprehension: [expr for var in iterable]
    if (tok.type === "SYMBOL" && tok.value === "[") {
      value = this.parseListComprehension();
    } else if (tok.type === "KEYWORD" && ["env", "sys", "resp", "prompt"].includes(tok.value as string)) {
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

    return Create.nameDef({ name: varName, value });
  }

  /**
   * The binding operator of a name definition. Canonically `:=`; a bare `=` or
   * `:` is accepted too, since both are what people reach for first and neither
   * is ambiguous in this position.
   */
  private consumeAssignment(varName: string): void {
    const sawColon = this.match("SYMBOL", ":");
    const sawEquals = this.match("LOGIC_OP", "=");
    if (sawColon || sawEquals) return;

    const tok = this.peek();
    throw new Error(`[${tok.line}:${tok.col}] Expected ":=" after "Name ${varName}", got "${tok.value}"`);
  }

  /**
   * Parse a list comprehension: [expr for var in iterable]
   * Example: [sys.Summary[@t] for t in range(T, T-900, 100)]
   */
  private parseListComprehension(): AST.ListComprehension {
    this.consume("SYMBOL", "[");

    // Parse the element expression (ContextVar, Func, or StrFragInvocation)
    const elemTok = this.peek();
    let element: AST.ContextVar | AST.Func | AST.StrFragInvocation;

    if (elemTok.type === "KEYWORD" && ["env", "sys", "resp", "prompt"].includes(elemTok.value as string)) {
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

    // Parse "for"
    this.consume("KEYWORD", "for");

    // Parse loop variable
    const variable = this.consume("IDENT").value as string;

    // Parse "in"
    this.consume("KEYWORD", "in");

    // Parse iterable (range expression or other)
    let iterable: AST.Iterable;
    if (this.isRangeCall()) {
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
   * Parse a name reference: $varname with optional indices and path: $docs[i].content
   */
  private parseNameRef(): AST.NameRef {
    this.consume("SYMBOL", "$");
    const varName = this.consume("IDENT").value as string;
    const indices = this.parseOptionalIndices();
    let path: AST.PathDesc | undefined;
    if (this.match("SYMBOL", ".")) {
      path = this.parsePathDesc();
    }
    return Create.nameRef({ name: varName, indices, path });
  }

  /* ───────────────── Fragment Invocations ───────────────── */

  /**
   * Parse a StrFrag invocation: Frag FragName[args]
   * Used inside role bodies where StrFragInvocation is valid.
   */
  private parseStrFragInvocation(): AST.StrFragInvocation {
    this.consume("KEYWORD", "Frag");
    const name = this.consume("IDENT").value as string;

    // Parse optional arguments in brackets
    let args: AST.TextArgs[] = [];
    if (this.peek().value === "[") {
      this.consume("SYMBOL", "[");
      if (this.peek().value !== "]") {
        args = this.parseTextArgs();
      }
      this.consume("SYMBOL", "]");
    }

    return Create.strFragInvocation({ name, arguments: args });
  }

  /**
   * Parse a RolesFrag invocation: Frag FragName[args]
   * Used at top level where RolesFragInvocation is valid.
   */
  private parseRolesFragInvocation(): AST.RolesFragInvocation {
    this.consume("KEYWORD", "Frag");
    const name = this.consume("IDENT").value as string;

    // Parse optional arguments in brackets
    let args: AST.TextArgs[] = [];
    if (this.peek().value === "[") {
      this.consume("SYMBOL", "[");
      if (this.peek().value !== "]") {
        args = this.parseTextArgs();
      }
      this.consume("SYMBOL", "]");
    }

    return Create.rolesFragInvocation({ name, arguments: args });
  }

  /* ───────────────── Expressions & Shared Rules ───────────────── */

  private parseContextVar(): AST.ContextVar {
    const baseTok = this.consume("KEYWORD");
    const base = baseTok.value as AST.ContextBase;

    const indices = this.parseOptionalIndices();

    let path: AST.PathDesc | undefined;
    if (this.match("SYMBOL", ".")) {
      path = this.parsePathDesc();
    }

    const nextTok = this.peek();
    const comment = (nextTok.type === "COMMENT" && nextTok.line === this.lastConsumedLine)
      ? (this.consume("COMMENT").value as string)
      : undefined;
    return Create.contextVar({ base, indices, path, comment });
  }

  private parsePathDesc(): AST.PathDesc {
    const tok = this.peek();
    console.log(`parsePathDesc: tok=${tok.type}:${tok.value} at ${tok.line}:${tok.col}`);

    if (tok.type !== "IDENT" && tok.type !== "KEYWORD" && tok.type !== "NUMBER") {
        throw new Error(`[${tok.line}:${tok.col}] Expected identifier or number in path, got ${tok.type}`);
    }

    // Consume base identifier or number (arithmetic is handled by parseIndexValue)
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

  private parseTemplateOrFunc(): AST.Template | AST.Func | AST.OtherIndex {
    const name = this.consume("IDENT").value as string;

    // 1. If all uppercase, parse as template (with optional args)
    if (name === name.toUpperCase()) {
      let args: AST.TextArgs[] = [];
      if (this.peek().value === "(") {
        this.consume("SYMBOL", "(");
        args = this.parseTextArgs();
        this.consume("SYMBOL", ")");
      }
      const nextTok = this.peek();
      const comment = (nextTok.type === "COMMENT" && nextTok.line === this.lastConsumedLine)
        ? (this.consume("COMMENT").value as string)
        : undefined;
      return Create.template({ name, arguments: args, comment });
    }

    // 2. If followed by "(", parse as function
    if (this.peek().value === "(") {
      this.consume("SYMBOL", "(");
      const args = this.parseTextArgs();
      this.consume("SYMBOL", ")");
      const indices = this.parseOptionalIndices() as AST.Index[];
      const nextTok = this.peek();
      const comment = (nextTok.type === "COMMENT" && nextTok.line === this.lastConsumedLine)
        ? (this.consume("COMMENT").value as string)
        : undefined;
      return Create.func({ name, arguments: args, indices, comment });
    }

    // 3. Otherwise, parse as identifier (with optional path)
    let path: AST.PathDesc | undefined;
    if (this.match("SYMBOL", ".")) {
      path = this.parsePathDesc();
    }
    return Create.otherIndex(Create.identifier({ name, path }));
  }

  private parseTextArgs(): AST.TextArgs[] {
  const args: AST.TextArgs[] = [];
  // Check for both ) and ] as terminators (functions use parens, fragments use brackets)
  if (this.peek().value === ")" || this.peek().value === "]") return args;

  while (true) {
    args.push(this.parseSingleTextArg());
    if (!this.match("SYMBOL", ",")) break;
    // A comma right before the closing bracket is a stray separator, not the
    // promise of another argument.
    if (this.peek().value === ")" || this.peek().value === "]") break;
  }

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
      // Time index like @t, @$C, @t+1, etc.
      return Create.timeIndex(this.parseIndexValue());
    }

    // Name reference: $varname
    if (tok.type === "SYMBOL" && tok.value === "$") {
      return this.parseNameRef();
    }

    // Current message number: #msg
    if (tok.type === "MSG") {
      this.consume("MSG");
      return Create.msgRef();
    }

    if (tok.type === "KEYWORD" && ["env", "sys", "resp", "prompt"].includes(tok.value as string)) {
      return this.parseContextVar();
    }

    // Frag invocation inside arguments: Frag FragName[args]
    if (tok.type === "KEYWORD" && tok.value === "Frag") {
      return this.parseStrFragInvocation();
    }

    if (tok.type === "NUMBER") {
      // Number with optional path (e.g., 3.2)
      const name = this.consume("NUMBER").value as string;
      let path: AST.PathDesc | undefined;
      if (this.match("SYMBOL", ".")) {
        path = this.parsePathDesc();
      }
      return Create.identifier({ name, path });
    }

    if (tok.type === "IDENT") {
      // Check if followed by ( - if so, it's a function call; otherwise plain identifier
      if (this.peekNext().value === "(") {
        return this.parseTemplateOrFunc() as AST.Func;
      }
      // Plain identifier with optional member access (e.g., a.name)
      const name = this.consume("IDENT").value as string;
      let path: AST.PathDesc | undefined;
      if (this.match("SYMBOL", ".")) {
        path = this.parsePathDesc();
      }
      return Create.otherIndex(Create.identifier({ name, path }));
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
      // Always consume ] after parsing index (we matched [ so there must be ])
      console.log(`parseOptionalIndices: consuming ], peek=${this.peek().type}:${this.peek().value}`);
      this.consume("SYMBOL", "]");
    }
    console.log(`parseOptionalIndices: returning ${indices.length} indices, peek=${this.peek().type}:${this.peek().value}`);
    return indices;
  }

  private parseIndex(): AST.Index {
    console.log(`parseIndex: starting, peek=${this.peek().type}:${this.peek().value}`);
    const time: boolean = this.match("SYMBOL", "@");
    console.log(`parseIndex: time=${time}, peek after @check=${this.peek().type}:${this.peek().value}`);

    // Parse the index value (ContextVar, Func, Identifier, ArithmeticExpr, NameRef)
    const value = this.parseIndexValue();

    console.log(`parseIndex: returning ${time ? "time" : "other"}-index`);
    if (time) {
      return Create.timeIndex(value);
    } else {
      return Create.otherIndex(value);
    }
  }

  /**
   * Parse the value inside an index bracket.
   * Can be: ContextVar, Func, Identifier, ArithmeticExpr, NameRef
   */
  private parseIndexValue(): AST.IndexValue {
    let left = this.parseIndexAtom();

    // Check for arithmetic operators
    if (this.peek().type === "ARITH_OP") {
      const operators: AST.ArithmeticOperator[] = [];
      while (this.peek().type === "ARITH_OP") {
        operators.push(this.consume("ARITH_OP").value as AST.ArithmeticOperator);
      }
      const right = this.parseIndexValue();
      return Create.arithmeticExpr({ operator: operators, left, right });
    }

    return left;
  }

  /**
   * Parse an atomic value inside an index (without arithmetic).
   */
  private parseIndexAtom(): AST.IndexValue {
    const tok = this.peek();

    // NameRef: $varname
    if (tok.type === "SYMBOL" && tok.value === "$") {
      return this.parseNameRef();
    }

    // Current message number: #msg
    if (tok.type === "MSG") {
      this.consume("MSG");
      return Create.msgRef();
    }

    // ContextVar: sys.foo, env.bar, resp.x, prompt.y
    if (tok.type === "KEYWORD" && ["sys", "env", "resp", "prompt"].includes(tok.value as string)) {
      return this.parseContextVar();
    }

    // Number: numeric value with optional path (e.g., 3.2)
    if (tok.type === "NUMBER") {
      const name = this.consume("NUMBER").value as string;

      // Path: number.something (e.g., 3.2 or T.3)
      let path: AST.PathDesc | undefined;
      if (this.match("SYMBOL", ".")) {
        path = this.parsePathDesc();
      }

      return Create.identifier({ name, path });
    }

    // Identifier: could be simple name, function call, or path
    if (tok.type === "IDENT") {
      const name = this.consume("IDENT").value as string;

      // Function call: name(...)
      if (this.peek().value === "(") {
        this.consume("SYMBOL", "(");
        const args = this.parseTextArgs();
        this.consume("SYMBOL", ")");
        const indices = this.parseOptionalIndices() as AST.Index[];
        return Create.func({ name, arguments: args, indices });
      }

      // Path: name.something (for compound indices like T.I)
      let path: AST.PathDesc | undefined;
      if (this.match("SYMBOL", ".")) {
        path = this.parsePathDesc();
      }

      return Create.identifier({ name, path });
    }

    throw new Error(`[${tok.line}:${tok.col}] Unexpected token in index: ${tok.type} (${tok.value})`);
  }


  /* ───────────────── Control Flow ───────────────── */

  /**
   * Parse an END block: PromptEndsHere when (condition)
   * Conditional early termination that can appear anywhere.
   * Condition is delimited by parentheses, same style as conditionals.
   */
  private parseEndBlock(): AST.EndBlock {
    const marker = this.consume("IDENT");
    // `when` reads well but carries no information the parser needs.
    this.match("KEYWORD", "when");

    const conditionTokens: AST.ExpressionToken[] = [];

    if (this.match("SYMBOL", "(")) {
      // Parenthesised: capture up to the matching close paren.
      let depth = 1;
      while (depth > 0) {
        if (this.isEOF()) {
          throw new Error(`[${marker.line}:${marker.col}] Unterminated PromptEndsHere condition`);
        }
        const tok = this.consume();
        if (tok.value === "(") depth++;
        if (tok.value === ")") depth--;
        if (depth > 0) {
          conditionTokens.push(toExprToken(tok));
        }
      }
    } else {
      // Bare: the condition is the rest of the line.
      const line = this.peek().line;
      while (
        !this.isEOF() &&
        this.peek().line === line &&
        this.peek().type !== "COMMENT" &&
        this.peek().value !== "{" &&
        this.peek().value !== "}"
      ) {
        conditionTokens.push(toExprToken(this.consume()));
      }
      if (conditionTokens.length === 0) {
        throw new Error(`[${marker.line}:${marker.col}] PromptEndsHere needs a condition, e.g. PromptEndsHere when (@t == @T)`);
      }
    }

    return Create.endBlock({ condition: this.trimTrailingColon(conditionTokens) });
  }

  /**
   * The header of a ForEach, shared by both scopes: `ForEach(v: iterable)`,
   * `ForEach v in iterable`, and every combination in between. The parentheses
   * are optional, and the separator may be `:` or `in`.
   */
  private parseLoopHeader(): { index: AST.Index; iterable: AST.Iterable } {
    this.consume("KEYWORD");   // ForEach, or `for` in statement position
    const parenthesised = this.match("SYMBOL", "(");

    const index = this.parseIndex();

    if (!this.match("SYMBOL", ":") && !this.match("KEYWORD", "in")) {
      const tok = this.peek();
      throw new Error(`[${tok.line}:${tok.col}] Expected ":" or "in" between the loop variable and its iterable, got "${tok.value}"`);
    }

    let iterable: AST.Iterable;
    if (this.isRangeCall()) {
      iterable = this.parseRangeExpr();
    } else {
      // Capture the iterable expression, tracking nesting so that a close paren
      // belonging to a call inside it does not end the capture early.
      const iterTokens: AST.ExpressionToken[] = [];
      let depth = 0;
      while (true) {
        if (this.isEOF()) throw new Error("Unterminated ForEach iterable");
        const tok = this.peek();
        if (depth === 0 && (tok.value === "{" || (parenthesised && tok.value === ")"))) break;
        if (tok.value === "(") depth++;
        if (tok.value === ")") depth--;
        iterTokens.push(toExprToken(this.consume()));
      }
      iterable = Create.Iterable({ tokens: this.trimTrailingColon(iterTokens) });
    }

    if (parenthesised) this.consume("SYMBOL", ")");
    this.matchOptionalColon();

    return { index, iterable };
  }

  private parseLoopOutside(): AST.LoopBlockOutsideRole {
    const { index, iterable } = this.parseLoopHeader();

    const openLine = this.peek().line;
    this.consume("SYMBOL", "{");

    const body: AST.PromptBlock[] = [];
    while (!this.atBlockEnd()) {
      this.skipSeparators();
      if (this.atBlockEnd()) break;
      body.push(this.parseTopLevelBlock()); // RECURSIVE: Outside loops contain global blocks
    }
    this.consumeBlockClose(openLine, "ForEach body");

    return Create.loopBlockOutsideRole({ index, iterable, body });
  }

  private parseRangeExpr(): AST.RangeExpr {
    this.consume("IDENT");   // `range`, in whatever casing it was written
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
    const ifTok = this.consume("KEYWORD", "If");

    // 1. Parse the "If" Condition as tokens
    const ifCondTokens = this.parseConditionHeader("If");

    let openLine = this.peek().line;
    this.consume("SYMBOL", "{");

    // 2. Parse the "If" Body
    const ifBody: AST.PromptBlock[] = [];
    while (!this.atBlockEnd()) {
        this.skipSeparators();
        if (this.atBlockEnd()) break;
        ifBody.push(this.parseTopLevelBlock());
    }
    this.consumeBlockClose(openLine, `If body (line ${ifTok.line})`);

    const elseIfConditions: AST.ExpressionToken[][] = [];
    const elseIfBodies: AST.PromptBlock[][] = [];
    const elseIfComments: string[][] = [];
    let elseBody: AST.PromptBlock[] | undefined = undefined;
    let elseComments: string[] | undefined = undefined;

    // 3. Handle ElseIf and Else chains.
    // Look past any comments between the closing brace and the next keyword, but
    // only consume them once an ElseIf/Else is confirmed — otherwise a trailing
    // comment belonging to the following block would be swallowed here.
    while (
      this.peekSkippingComments()?.type === "KEYWORD" &&
      (this.peekSkippingComments().value === "ElseIf" || this.peekSkippingComments().value === "Else")
    ) {
        const branchComments = this.collectComments();
        const branch = this.consume();
        const type = this.resolveElseBranch(branch.value as string);

        if (type === "ElseIf") {
            const eiCondTokens = this.parseConditionHeader("ElseIf");

            openLine = this.peek().line;
            this.consume("SYMBOL", "{");

            const eiBody: AST.PromptBlock[] = [];
            while (!this.atBlockEnd()) {
                this.skipSeparators();
                if (this.atBlockEnd()) break;
                eiBody.push(this.parseTopLevelBlock());
            }
            this.consumeBlockClose(openLine, `ElseIf body (line ${branch.line})`);

            elseIfConditions.push(eiCondTokens);
            elseIfBodies.push(eiBody);
            elseIfComments.push(branchComments);
        }
        else if (type === "Else") {
            this.matchOptionalColon();
            openLine = this.peek().line;
            this.consume("SYMBOL", "{");
            const eBody: AST.PromptBlock[] = [];
            while (!this.atBlockEnd()) {
                this.skipSeparators();
                if (this.atBlockEnd()) break;
                eBody.push(this.parseTopLevelBlock());
            }
            this.consumeBlockClose(openLine, `Else body (line ${branch.line})`);
            elseBody = eBody;
            if (branchComments.length) elseComments = branchComments;
            break; // 'Else' must be the end of the chain
        }
    }

    return Create.conditionalBlockOutsideRole({
        Ifcondition: ifCondTokens,
        IfBody: ifBody,
        elseif: elseIfConditions,
        elseifBody: elseIfBodies,
        elseBody: elseBody,
        ...(elseIfComments.some(c => c.length) ? { elseifComments: elseIfComments } : {}),
        ...(elseComments ? { elseComments } : {}),
    });
  }

  /**
   * Capture a condition, which runs from after the keyword to the `{` that opens
   * the body. Surrounding parentheses are conventional but not required, and a
   * trailing `:` before the brace is punctuation rather than part of the
   * expression.
   */
  private parseConditionHeader(keyword: string): AST.ExpressionToken[] {
    const tokens: AST.ExpressionToken[] = [];
    while (this.peek().value !== "{") {
      if (this.isEOF()) {
        const tok = this.peek();
        throw new Error(`[${tok.line}:${tok.col}] Unterminated ${keyword} condition: expected "{" to open the body`);
      }
      tokens.push(toExprToken(this.consume()));
    }
    if (tokens.length === 0) {
      const tok = this.peek();
      throw new Error(`[${tok.line}:${tok.col}] ${keyword} needs a condition before "{"`);
    }
    return this.trimTrailingColon(tokens);
  }

  /**
   * Which branch an Else-family keyword opens. `Else If` written as two words is
   * the same construct as `ElseIf`, so the `If` is absorbed here.
   */
  private resolveElseBranch(keyword: string): string {
    if (keyword === "Else" && this.peekSkippingComments()?.value === "If") {
      this.skipComments();
      this.consume("KEYWORD", "If");
      return "ElseIf";
    }
    return keyword;
  }

  private parseLoopInside(): AST.LoopBlockInsideRole {
    const header = this.parseLoopHeader();
    const index = header.index as AST.OtherIndex;
    const iterable = header.iterable;

    const openLine = this.peek().line;
    this.consume("SYMBOL", "{");

    const body: AST.RoleBuildingBlock[] = [];
    while (!this.atBlockEnd()) {
      this.skipSeparators();
      if (this.atBlockEnd()) break;
      body.push(this.parseRoleBuildingBlock()); // RECURSIVE: Inside loops contain role blocks
    }
    this.consumeBlockClose(openLine, "ForEach body");

    return Create.loopBlockInsideRole({ index, iterable, body });
  }

  private parseConditionalInside(): AST.ConditionalBlockInsideRole {
      const ifTok = this.consume("KEYWORD", "If");

      // 1. Parse the "If" Condition as tokens
      const ifCondTokens = this.parseConditionHeader("If");

      let openLine = this.peek().line;
      this.consume("SYMBOL", "{");

      // 2. Parse the "If" Body
      const ifBody: AST.RoleBuildingBlock[] = [];
      while (!this.atBlockEnd()) {
          this.skipSeparators();
          if (this.atBlockEnd()) break;
          ifBody.push(this.parseRoleBuildingBlock());
      }
      this.consumeBlockClose(openLine, `If body (line ${ifTok.line})`);

      const elseIfConditions: AST.ExpressionToken[][] = [];
      const elseIfBodies: AST.RoleBuildingBlock[][] = [];
      const elseIfComments: string[][] = [];
      let elseBody: AST.RoleBuildingBlock[] | undefined = undefined;
      let elseComments: string[] | undefined = undefined;

      // 3. Handle ElseIf and Else chains (see parseConditionalOutside: look past
      // comments, but only consume them once the keyword is confirmed).
      while (
        this.peekSkippingComments()?.type === "KEYWORD" &&
        (this.peekSkippingComments().value === "ElseIf" || this.peekSkippingComments().value === "Else")
      ) {
          const branchComments = this.collectComments();
          const branch = this.consume();
          const type = this.resolveElseBranch(branch.value as string);

          if (type === "ElseIf") {
              const eiCondTokens = this.parseConditionHeader("ElseIf");

              openLine = this.peek().line;
              this.consume("SYMBOL", "{");

              const eiBody: AST.RoleBuildingBlock[] = [];
              while (!this.atBlockEnd()) {
                  this.skipSeparators();
                  if (this.atBlockEnd()) break;
                  eiBody.push(this.parseRoleBuildingBlock());
              }
              this.consumeBlockClose(openLine, `ElseIf body (line ${branch.line})`);

              elseIfConditions.push(eiCondTokens);
              elseIfBodies.push(eiBody);
              elseIfComments.push(branchComments);
          }
          else if (type === "Else") {
              this.matchOptionalColon();
              openLine = this.peek().line;
              this.consume("SYMBOL", "{");
              const eBody: AST.RoleBuildingBlock[] = [];
              while (!this.atBlockEnd()) {
                  this.skipSeparators();
                  if (this.atBlockEnd()) break;
                  eBody.push(this.parseRoleBuildingBlock());
              }
              this.consumeBlockClose(openLine, `Else body (line ${branch.line})`);
              elseBody = eBody;
              if (branchComments.length) elseComments = branchComments;
              break; // 'Else' must be the end of the chain
          }
      }

      return Create.conditionalBlockInsideRole({
          Ifcondition: ifCondTokens,
          IfBody: ifBody,
          elseif: elseIfConditions,
          elseifBody: elseIfBodies,
          elseBody: elseBody,
          ...(elseIfComments.some(c => c.length) ? { elseifComments: elseIfComments } : {}),
          ...(elseComments ? { elseComments } : {}),
      });
  }

  // parseSwitchOutside and parseSwitchInside would follow the same scoping pattern.
  private parseSwitchOutside(): AST.SwitchBlockOutsideRole {
    const switchTok = this.consume("KEYWORD", "Switch");

    // 1. Capture the expression tokens (e.g., env.user_input[@t])
    const exprTokens = this.parseConditionHeader("Switch");

    const switchOpenLine = this.peek().line;
    this.consume("SYMBOL", "{");

    const cases: AST.CaseBlockOutsideRole[] = [];
    let defaultCase: AST.DefaultCaseBlockOutsideRole | undefined;

    // 2. Parse Case and Default blocks
    while (true) {
      // Comments above a Case/Default header describe that branch: keep them.
      const branchComments: string[] = [];
      while (this.peek().type === "COMMENT" || (this.peek().type === "SYMBOL" && this.peek().value === ";")) {
        const tok = this.consume();
        if (tok.type === "COMMENT") branchComments.push(tok.value as string);
      }
      if (this.atBlockEnd()) {
        // Comments after the last branch have no header to attach to; keep
        // them at the end of the last branch rather than dropping them.
        const last = defaultCase ?? cases[cases.length - 1];
        if (last) for (const text of branchComments) last.body.push(Create.commentBlock({ text }));
        break;
      }
      const branch = this.peek();
      const kw = this.consume("KEYWORD").value;

      if (kw === "Case") {
        const matchTokens = this.parseConditionHeader("Case");
        const openLine = this.peek().line;
        this.consume("SYMBOL", "{");
        const body: AST.PromptBlock[] = [];
        while (!this.atBlockEnd()) {
          this.skipSeparators();
          if (this.atBlockEnd()) break;
          body.push(this.parseTopLevelBlock());
        }
        this.consumeBlockClose(openLine, `Case body (line ${branch.line})`);
        cases.push(Create.caseBlockOutsideRole({ match: matchTokens, body, ...(branchComments.length ? { comments: branchComments } : {}) }));
      }
      else if (kw === "Default") {
        this.matchOptionalColon();
        const openLine = this.peek().line;
        this.consume("SYMBOL", "{");
        const body: AST.PromptBlock[] = [];
        while (!this.atBlockEnd()) {
          this.skipSeparators();
          if (this.atBlockEnd()) break;
          body.push(this.parseTopLevelBlock());
        }
        this.consumeBlockClose(openLine, `Default body (line ${branch.line})`);
        defaultCase = Create.defaultCaseBlockOutsideRole({ body, ...(branchComments.length ? { comments: branchComments } : {}) });
      }
      else {
        throw new Error(`[${branch.line}:${branch.col}] Unexpected "${kw}" inside Switch: expected Case or Default`);
      }
    }
    this.consumeBlockClose(switchOpenLine, `Switch (line ${switchTok.line})`);

    return Create.switchBlockOutsideRole({
      expression: exprTokens,
      cases,
      defaultCase
    });
  }

  private parseSwitchInside(): AST.SwitchBlockInsideRole {
    const switchTok = this.consume("KEYWORD", "Switch");

    // 1. Capture the expression tokens (e.g., env.user_input[@t])
    const exprTokens = this.parseConditionHeader("Switch");

    const switchOpenLine = this.peek().line;
    this.consume("SYMBOL", "{");

    const cases: AST.CaseBlockInsideRole[] = [];
    let defaultCase: AST.DefaultCaseBlockInsideRole | undefined;

    // 2. Parse Case and Default blocks
    while (true) {
      // Comments above a Case/Default header describe that branch: keep them.
      const branchComments: string[] = [];
      while (this.peek().type === "COMMENT" || (this.peek().type === "SYMBOL" && this.peek().value === ";")) {
        const tok = this.consume();
        if (tok.type === "COMMENT") branchComments.push(tok.value as string);
      }
      if (this.atBlockEnd()) {
        // Comments after the last branch have no header to attach to; keep
        // them at the end of the last branch rather than dropping them.
        const last = defaultCase ?? cases[cases.length - 1];
        if (last) for (const text of branchComments) last.body.push(Create.commentBlock({ text }));
        break;
      }
      const branch = this.peek();
      const kw = this.consume("KEYWORD").value;

      if (kw === "Case") {
        const matchTokens = this.parseConditionHeader("Case");
        const openLine = this.peek().line;
        this.consume("SYMBOL", "{");
        const body: AST.RoleBuildingBlock[] = [];
        while (!this.atBlockEnd()) {
          this.skipSeparators();
          if (this.atBlockEnd()) break;
          body.push(this.parseRoleBuildingBlock());
        }
        this.consumeBlockClose(openLine, `Case body (line ${branch.line})`);
        cases.push(Create.caseBlockInsideRole({ match: matchTokens, body, ...(branchComments.length ? { comments: branchComments } : {}) }));
      }
      else if (kw === "Default") {
        this.matchOptionalColon();
        const openLine = this.peek().line;
        this.consume("SYMBOL", "{");
        const body: AST.RoleBuildingBlock[] = [];
        while (!this.atBlockEnd()) {
          this.skipSeparators();
          if (this.atBlockEnd()) break;
          body.push(this.parseRoleBuildingBlock());
        }
        this.consumeBlockClose(openLine, `Default body (line ${branch.line})`);
        defaultCase = Create.defaultCaseBlockInsideRole({ body, ...(branchComments.length ? { comments: branchComments } : {}) });
      }
      else {
        throw new Error(`[${branch.line}:${branch.col}] Unexpected "${kw}" inside Switch: expected Case or Default`);
      }
    }
    this.consumeBlockClose(switchOpenLine, `Switch (line ${switchTok.line})`);

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