export type Prompt = {
  kind: "prompt";
  title: PromptTitle;
  body: PromptBody;
}

export type PromptTitle = {
  kind: "title";
  name: string;
  indices: Array<Index>;
}

export type Role = "user" | "assistant" | "system" | "tool";

// Index types:
export type Index = TimeIndex | OtherIndex;

export type TimeIndex = {
  kind: "time-index";
  value: IndexValue;
}

export type OtherIndex = {
  kind: "other-index";
  value: IndexValue;
}

// What can be inside an index - structured values that preserve their type for rendering
export type IndexValue = Identifier | ContextVar | Func | ArithmeticExpr | NameRef;

// Simple identifier for basic names like "t", "i", "T" or numbers like "123"
// Can optionally have a path for dotted identifiers like "foo.bar.baz"
export type Identifier = {
  kind: "identifier";
  name: string;
  path?: PathDesc;
}

// Template text and function types
// might want to add types for all context bases later, if we need tham to behave differently

export type ContextBase = "sys" | "resp" | "env" ;

export type ContextVar = {
    kind: "context-var";
    base: ContextBase;
    path?: PathDesc;
    indices: Array<Index>;
    comment?: string;
}

export type PathDesc = {
    kind: "path-desc";
    base: string;
    next?: PathDesc;
    indices: Array<Index>;
}

export type ArithmeticOperator = "-" | "+" | "%" | "*" | "/";

// Token info for expressions in conditions, iterables, switch expressions
// Preserves token type for syntax highlighting without restricting grammar
export type ExpressionToken = {
  type: "KEYWORD" | "IDENT" | "NUMBER" | "SYMBOL" | "LOGIC_OP" | "ARITH_OP" | "RANGE" | "STRING";
  value: string;
  spaceBefore?: boolean; // true if there was whitespace before this token
};

export type ArithmeticExpr = {
    kind: "arithmetic";
    operator: Array<ArithmeticOperator>;
    left: TextArgs;
    right: TextArgs;
}

// List comprehension: [expr for var in iterable]
export type ListComprehension = {
    kind: "list-comprehension";
    element: ContextVar | Func | StrFragInvocation;   // the expression to collect (e.g., sys.Summary[@t])
    variable: string;              // loop variable name (e.g., "t")
    iterable: Iterable;            // the range/iterable
}

// Named variable definition: name x := expr
export type NameDef = {
    kind: "name-def";
    name: string;           // variable name (e.g., "obs")
    value: ContextVar | Func | ListComprehension | StrFragInvocation;  // the assigned expression
}

// Named variable reference: $x with optional indices and path: $docs[i].content
export type NameRef = {
    kind: "name-ref";
    name: string;           // referenced variable name (without $)
    indices: Array<Index>;  // optional indices like [i] or [@t]
    path?: PathDesc;        // optional path like .content.field
}

export type TextArgs = ContextVar | Index | Func | ArithmeticExpr | NameRef | Identifier | StrFragInvocation;

export type Func = {
    kind: "function";
    name: FuncName;
    arguments: Array<TextArgs>;
    indices?: Array<Index>;
    comment?: string;
}

export type FuncName = string; // Must be CamelCase.

export type Template = {
  kind: "template";
  name: string;
  arguments: Array<TextArgs>;
  comment?: string;
}

// Prompt Body and Building Blocks, Outside Role Blocks

export type PromptBody = ChatPromptBody | CompletionPromptBody;

export type ChatPromptBody = {
  kind: "chat-prompt-body";
  body: Array<PromptBlock>;
}

export type CompletionPromptBody = {
  kind: "completion-prompt-body";
  message: NoneMessage;
}

export type NoneMessage = {
  kind: "none-message";
  body: Array<RoleBuildingBlock>;
}

export type CommentBlock = {
  kind: "comment-block";
  text: string;
}

export type MarkBlock = {
  kind: "mark-block";
  markNumber: number;
  body: Array<PromptBlock>;
}

export type PromptBlock = RoleMessage|MarkBlock|ConditionalBlockOutsideRole|LoopBlockOutsideRole|SwitchBlockOutsideRole|CommentBlock|NameDef|EndBlock|RoleFragInvocation;

export type LoopBlockOutsideRole = {
  kind: "loop-block-outside-role";
  index: Index;
  iterable: Iterable; 
  body: Array<PromptBlock>;
};

export type RoleMessage = {
  kind: "role-message";
  role: Role;
  body: Array<RoleBuildingBlock>; 
}

export type ConditionalBlockOutsideRole = {
  kind: "conditional-block-outside-role";
  Ifcondition: ExpressionToken[];
  IfBody: Array<PromptBlock>;
  elseif: Array<ExpressionToken[]>;
  elseifBody: Array<Array<PromptBlock>>;
  elseBody?: Array<PromptBlock>;
};

export type SwitchBlockOutsideRole = {
  kind: "switch-block-outside-role";
  expression: ExpressionToken[];
  cases: Array<CaseBlockOutsideRole>;
  defaultCase?: DefaultCaseBlockOutsideRole;
};

export type CaseBlockOutsideRole = {
  kind: "case-block-outside-role";
  match: ExpressionToken[];
  body: Array<PromptBlock>;
};

export type DefaultCaseBlockOutsideRole = {
  kind: "default-case-block-outside-role";
  body: Array<PromptBlock>;
};


// Inside Role Building Blocks

export type RoleBuildingBlock = ConditionalBlockInsideRole|LoopBlockInsideRole|SwitchBlockInsideRole|MarkBlockInsideRole|Template|ContextVar|Func|CommentBlock|NameDef|NameRef|OtherIndex|EndBlock|StrFragInvocation;

export type MarkBlockInsideRole = {
  kind: "mark-block-inside-role";
  markNumber: number;
  body: Array<RoleBuildingBlock>;
}

export type LoopBlockInsideRole = {
  kind: "loop-block-inside-role";
  index: OtherIndex;
  iterable: Iterable; 
  body: Array<RoleBuildingBlock>;
};

export type RangeExpr = {
  kind: "range-expr";
  start: ExpressionToken[];
  end: ExpressionToken[];
  step?: ExpressionToken[];  // optional step/variable
}

export type Iterable = {
  kind: "iterable";
  tokens: ExpressionToken[]; // preserves token info for syntax highlighting
} | RangeExpr;

export type ConditionalBlockInsideRole = {
  kind: "conditional-block-inside-role";
  Ifcondition: ExpressionToken[];
  IfBody: Array<RoleBuildingBlock>;
  elseif: Array<ExpressionToken[]>;
  elseifBody: Array<Array<RoleBuildingBlock>>;
  elseBody?: Array<RoleBuildingBlock>;
};

export type SwitchBlockInsideRole = {
  kind: "switch-block-inside-role";
  expression: ExpressionToken[];
  cases: Array<CaseBlockInsideRole>;
  defaultCase?: DefaultCaseBlockInsideRole;
};

export type CaseBlockInsideRole = {
  kind: "case-block-inside-role";
  match: ExpressionToken[];
  body: Array<RoleBuildingBlock>;
};

export type DefaultCaseBlockInsideRole = {
  kind: "default-case-block-inside-role";
  body: Array<RoleBuildingBlock>;
};

// END if block - conditional early termination (can appear anywhere)
export type EndBlock = {
  kind: "end-block";
  condition: ExpressionToken[];
};

// ──────────────── Fragment Definitions ────────────────

// String Fragment Definition: produces content pieces (no role assigned)
// Body contains RoleBuildingBlock[] - same content as inside a role message
// Syntax: StrFrag Name[params]: { ... }
export type StrFragDef = {
  kind: "str-frag-def";
  name: string;
  params: Array<TextArgs>;
  body: Array<RoleBuildingBlock>;
}

// Role Fragment Definition: produces one or more role messages
// Body contains PromptBlock[] - same as a chat prompt body
// Syntax: RoleFrag Name[params]: { ... }
export type RoleFragDef = {
  kind: "role-frag-def";
  name: string;
  params: Array<TextArgs>;
  body: Array<PromptBlock>;
}

// ──────────────── Fragment Invocations ────────────────

// String Fragment Invocation: valid anywhere ContextVar/Func/Template are valid
// Expands to content pieces that inherit the enclosing role
// Syntax: Frag FragName[args]
export type StrFragInvocation = {
  kind: "str-frag-invocation";
  name: string;
  arguments: Array<TextArgs>;
}

// Role Fragment Invocation: valid anywhere RoleMessage is valid
// Expands to one or more role messages
// Syntax: Frag FragName[args]
export type RoleFragInvocation = {
  kind: "role-frag-invocation";
  name: string;
  arguments: Array<TextArgs>;
}
