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
  name: string;
}

export type OtherIndex = {
  kind: "other-index";
  name: string;
}

// Template text and function types
// might want to add types for all context bases later, if we need tham to behave differently

export type ContextBase = "sys" | "resp" | "env" | "prompt";

export type ContextVar = {
    kind: "context-var";
    base: ContextBase
    path: PathDesc;
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

export type ArithmeticExpr = {
    kind: "arithmetic";
    operator: Array<ArithmeticOperator>;
    left: TextArgs;
    right: TextArgs;
}

export type TextArgs = ContextVar | Index | Func | ArithmeticExpr;

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

export type LabelBlock = {
  kind: "label-block";
  label: string;
  body: Array<PromptBlock>;
}

export type PromptBlock = RoleMessage|LabelBlock|ConditionalBlockOutsideRole|LoopBlockOutsideRole|SwitchBlockOutsideRole|CommentBlock;

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
  Ifcondition: string;
  IfBody: Array<PromptBlock>;
  elseif: Array<string>;
  elseifBody: Array<Array<PromptBlock>>;
  elseBody?: Array<PromptBlock>;
};

export type SwitchBlockOutsideRole = {
  kind: "switch-block-outside-role";
  expression: string; 
  cases: Array<CaseBlockOutsideRole>;
  defaultCase?: DefaultCaseBlockOutsideRole;
};

export type CaseBlockOutsideRole = {
  kind: "case-block-outside-role";
  match: string;
  body: Array<PromptBlock>;
};

export type DefaultCaseBlockOutsideRole = {
  kind: "default-case-block-outside-role";
  body: Array<PromptBlock>;
};


// Inside Role Building Blocks

export type RoleBuildingBlock = ConditionalBlockInsideRole|LoopBlockInsideRole|SwitchBlockInsideRole|Template|ContextVar|Func|CommentBlock;

export type LoopBlockInsideRole = {
  kind: "loop-block-inside-role";
  index: OtherIndex;
  iterable: Iterable; 
  body: Array<RoleBuildingBlock>;
};

export type Iterable = {
  kind: "iterable";
  value: string; // common objects are sets and ranges. constraint: no spaces
}

export type ConditionalBlockInsideRole = {
  kind: "conditional-block-inside-role";
  Ifcondition: string;
  IfBody: Array<RoleBuildingBlock>;
  elseif: Array<string>;
  elseifBody: Array<Array<RoleBuildingBlock>>;
  elseBody?: Array<RoleBuildingBlock>;
};

export type SwitchBlockInsideRole = {
  kind: "switch-block-inside-role";
  expression: string; // what type is this? some variable whose value needs to match one of the cases
  cases: Array<CaseBlockInsideRole>;
  defaultCase?: DefaultCaseBlockInsideRole;
};

export type CaseBlockInsideRole = {
  kind: "case-block-inside-role";
  match: string;
  body: Array<RoleBuildingBlock>;
};

export type DefaultCaseBlockInsideRole = {
  kind: "default-case-block-inside-role";
  body: Array<RoleBuildingBlock>;
};
