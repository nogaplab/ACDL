export type Prompt = {
  kind: "prompt";
  title: PromptTitle;
  body: PromptBody;
}

export type PromptTitle = {
  kind: "title";
  name: string;
  // could be also Array<string> if we didn't want to include the time-vs-other distinction in the types.
  indices: Array<Index>;
}

/* option 1 for indices. see option 2 below. */

export type Index = {
  kind: "index";
  name: string;
  isTime: boolean;
}

/* option 2 for indices:
 
export type Index = TimeIndex | OtherIndex;

export type TimeIndex = {
  kind: "time-index";
  name: string;
}

export type OtherIndex = {
  kind: "non-time-index";
  name: string;
}

*/

export type PromptBody = {
  kind: "prompt-body";
  body: Array<RoleMessage|ConditionalBlock>; 
}

export type RoleMessage = {
  kind: "role-message";
  role: Role;
  body: string; // TODO!! this is incorrect / incomplete.
}


// conditionals - includes if, else-if, else, switch, case

export type ComparisonOperator =
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">=";


export type ConditionVariable = {
  kind: "variable";
  name: string;
};


export interface ConditionComparison {
  kind: "comparison";
  operator: ComparisonOperator;
  left: Condition;
  right: Condition;
}

export type ConditionLogical = {
  kind: "logical";
  operator: "and" | "or";
  left: Condition;
  right: Condition;
};

export type ConditionNot = {
  kind: "not";
  operand: Condition;
};

export type ConditionBoolean = {
  kind: "boolean";
  value: boolean;
};


export type Condition =
  | ConditionBoolean
  | ConditionVariable
  | ConditionComparison
  | ConditionLogical
  | ConditionNot;



// Conditional Blocks

export type ConditionalBlock = {
  kind: "conditional-block";
  if: IfBranch;
  elseIfs: ElseIfBranch[];
  else?: ElseBranch;
};


export type IfBranch = {
  kind: "if";
  condition: Condition;
  body: BuildingBlock[];
};

export type ElseIfBranch = {
  kind: "else-if";
  condition: Condition;
  body: BuildingBlock[];
};

export type ElseBranch = {
  kind: "else";
  body: BuildingBlock[];
};

// switch/case types

export type SwitchBlock = {
  kind: "switch-block";
  expression: Expression;
  cases: CaseBlock[];
  defaultCase?: DefaultCaseBlock;
};

export type CaseBlock = {
  kind: "case";
  match: Condition | Expression;
  body: BuildingBlock[];
};

export type DefaultCaseBlock = {
  kind: "default";
  body: BuildingBlock[];
};


type Role = "user" | "assistant" | "system";


// "Constructors"

// This is very boiler-platy, but is convenient when we want to
// construct prompts in code. Can probably be done by an LLM or even with a deterministic script.

export function prompt(params: Omit<Prompt, "kind">): Prompt {
  return { ...params, kind: "prompt" };
}

export function promptTitle(params: Omit<PromptTitle, "kind">): PromptTitle {
  return { ...params, kind: "title" };
}

export function index(params: Omit<Index, "kind">): Index {
  return { ...params, kind: "index" };
}

export function promptBody(params: Omit<PromptBody, "kind">): PromptBody {
  return { ...params, kind: "prompt-body" };
}

export function roleMessage(params: Omit<RoleMessage, "kind">): RoleMessage {
  return { ...params, kind: "role-message" };
}