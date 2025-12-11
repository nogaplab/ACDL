import { ContextItem } from "./context_types";
import { ElseBranch, ElseIfBranch, IfBranch } from "./types_old";


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

type Role = "user" | "assistant" | "system";

export type MyString = { 
    value: string 
};

// Index types:
// I currently prefer this option because I sometimes need to only allow a time index (in funcitons)
 
export type Index = TimeIndex | OtherIndex;

export type TimeIndex = {
  kind: "time-index";
  name: string;
}

export type OtherIndex = {
  kind: "non-time-index";
  name: string;
}

// Template text and function types

export type TextArgs = ContextItem | TimeIndex | func; // what about mystring?

export type func = {
    kind: "function";
    name: string;
    arguments: Array<func|ContextItem|TimeIndex>; // fill this later
}

export type Template = {
  name: string;
  arguments: Array<func|ContextItem|TimeIndex>;
  comment?: string;
}

// Prompt Body and Building Blocks, Outside Role Blocks

export type PromptBody = {
  kind: "prompt-body";
  body: Array<PromptBlock>; 
}


export type PromptBlock = RoleMessage|ConditionalBlockOutsideRole|LoopBlockOutsideRole|SwitchBlockOutsideRole;


export type LoopBlockOutsideRole = {
  kind: "loop-block-outside-role";
  variable: string;
  iterable: Expression; // what type is this?
  body: Array<PromptBlock>;
};

export type RoleMessage = {
  kind: "role-message";
  role: Role;
  body: Array<RoleBuildingBlock>; 
}

export type ConditionalBlockOutsideRole = {
  kind: "conditional-block-outside-role";
  Ifcondition: Condition;
  IfBody: Array<PromptBlock>;
  elseif: Array<Condition>;
  elseifBody: Array<Array<PromptBlock>>;
  elseBody?: Array<PromptBlock>;
};

// Inside Role Building Blocks

export type RoleBuildingBlock = ConditionalBlockInsideRole|LoopBlockInsideRole|SwitchBlockInsideRole|Template;

export type LoopBlockInsideRole = {
  kind: "loop-block-inside-role";
  variable: string;
  iterable: Expression; // what type is this?
  body: Array<RoleBuildingBlock>;
};

export type ConditionalBlockInsideRole = {
  kind: "conditional-block-outside-role";
  Ifcondition: Condition;
  IfBody: Array<RoleBuildingBlock>;
  elseif: Array<Condition>;
  elseifBody: Array<Array<RoleBuildingBlock>>;
  elseBody?: Array<RoleBuildingBlock>;
};

export type SwitchBlockInsideRole = {
  kind: "switch-block";
  expression: Expression; // what type is this? some variable whose value needs to match one of the cases
  cases: Array<CaseBlockInsideRole>;
  defaultCase?: DefaultCaseBlockInsideRole;
};

export type CaseBlockInsideRole = {
  kind: "case";
  match: Expression;
  body: Array<RoleBuildingBlock>;
};

export type DefaultCaseBlockInsideRole = {
  kind: "default";
  body: Array<RoleBuildingBlock>;
};
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