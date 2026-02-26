import {
  Prompt,
  PromptTitle,
  Index,
  TimeIndex,
  OtherIndex,
  Identifier,
  IndexValue,
  ChatPromptBody,
  CompletionPromptBody,
  NoneMessage,
  RoleMessage,
  ContextVar,
  PathDesc,
  Func,
  Template,
  LoopBlockOutsideRole,
  ConditionalBlockOutsideRole,
  SwitchBlockOutsideRole,
  CaseBlockOutsideRole,
  DefaultCaseBlockOutsideRole,
  LoopBlockInsideRole,
  ConditionalBlockInsideRole,
  SwitchBlockInsideRole,
  CaseBlockInsideRole,
  DefaultCaseBlockInsideRole,
  CommentBlock,
  LabelBlock,
  MarkBlock,
  MarkBlockInsideRole,
  ArithmeticExpr,
  RangeExpr,
  ExpressionToken,
  NameDef,
  NameRef,
  ListComprehension
} from "./types";




// "Constructors"

// This is very boiler-platy, but is convenient when we want to
// construct prompts in code. Can probably be done by an LLM or even with a deterministic script.

export function prompt(params: Omit<Prompt, "kind">): Prompt {
  return { ...params, kind: "prompt" };
}

export function promptTitle(params: Omit<PromptTitle, "kind">): PromptTitle {
  return { ...params, kind: "title" };
}

export function identifier(params: Omit<Identifier, "kind">): Identifier {
  return { ...params, kind: "identifier" };
}

export function timeIndex(value: IndexValue): TimeIndex {
  return { kind: "time-index", value };
}

export function otherIndex(value: IndexValue): OtherIndex {
  return { kind: "other-index", value };
}

export function chatPromptBody(params: Omit<ChatPromptBody, "kind">): ChatPromptBody {
  return { ...params, kind: "chat-prompt-body" };
}

export function completionPromptBody(params: Omit<CompletionPromptBody, "kind">): CompletionPromptBody {
  return { ...params, kind: "completion-prompt-body" };
}

export function noneMessage(params: Omit<NoneMessage, "kind">): NoneMessage {
  return { ...params, kind: "none-message" };
}

export function roleMessage(params: Omit<RoleMessage, "kind">): RoleMessage {
  return { ...params, kind: "role-message" };
}

export function contextVar(params: Omit<ContextVar, "kind">): ContextVar {
  return { ...params, kind: "context-var" };
}   

export function pathDesc(params: Omit<PathDesc, "kind">): PathDesc {
  return { ...params, kind: "path-desc" };
}

export function func(params: Omit<Func, "kind">): Func {
  return { ...params, kind: "function" };
}

export function template(params: Omit<Template, "kind">): Template {
  return { ...params, kind: "template" };
}   

export function loopBlockOutsideRole(params: Omit<LoopBlockOutsideRole, "kind">): LoopBlockOutsideRole {
  return { ...params, kind: "loop-block-outside-role" };
}   

export function conditionalBlockOutsideRole(params: Omit<ConditionalBlockOutsideRole, "kind">): ConditionalBlockOutsideRole {
  return { ...params, kind: "conditional-block-outside-role" };
}   

export function switchBlockOutsideRole(params: Omit<SwitchBlockOutsideRole, "kind">): SwitchBlockOutsideRole {
  return { ...params, kind: "switch-block-outside-role" };
}   

export function caseBlockOutsideRole(params: Omit<CaseBlockOutsideRole, "kind">): CaseBlockOutsideRole {
  return { ...params, kind: "case-block-outside-role" };
}   

export function defaultCaseBlockOutsideRole(params: Omit<DefaultCaseBlockOutsideRole, "kind">): DefaultCaseBlockOutsideRole {           
    return { ...params, kind: "default-case-block-outside-role" };
}

export function loopBlockInsideRole(params: Omit<LoopBlockInsideRole, "kind">): LoopBlockInsideRole {
  return { ...params, kind: "loop-block-inside-role" };
}       

export function conditionalBlockInsideRole(params: Omit<ConditionalBlockInsideRole, "kind">): ConditionalBlockInsideRole {          
    return { ...params, kind: "conditional-block-inside-role" };    
}       

export function switchBlockInsideRole(params: Omit<SwitchBlockInsideRole, "kind">): SwitchBlockInsideRole {          
    return { ...params, kind: "switch-block-inside-role" };    
}   

export function caseBlockInsideRole(params: Omit<CaseBlockInsideRole, "kind">): CaseBlockInsideRole {          
    return { ...params, kind: "case-block-inside-role" };    
}

export function defaultCaseBlockInsideRole(params: Omit<DefaultCaseBlockInsideRole, "kind">): DefaultCaseBlockInsideRole {  
    return { ...params, kind: "default-case-block-inside-role" };
}

export function Iterable(params: { tokens: ExpressionToken[] }): { kind: "iterable"; tokens: ExpressionToken[] } {
  return { ...params, kind: "iterable" };
}

export function rangeExpr(params: Omit<RangeExpr, "kind">): RangeExpr {
  return { ...params, kind: "range-expr" };
}

export function commentBlock(params: Omit<CommentBlock, "kind">): CommentBlock {
  return { ...params, kind: "comment-block" };
}

export function labelBlock(params: Omit<LabelBlock, "kind">): LabelBlock {
  return { ...params, kind: "label-block" };
}

export function markBlock(params: Omit<MarkBlock, "kind">): MarkBlock {
  return { ...params, kind: "mark-block" };
}

export function markBlockInsideRole(params: Omit<MarkBlockInsideRole, "kind">): MarkBlockInsideRole {
  return { ...params, kind: "mark-block-inside-role" };
}

export function arithmeticExpr(params: Omit<ArithmeticExpr, "kind">): ArithmeticExpr {
  return { ...params, kind: "arithmetic" };
}

export function nameDef(params: Omit<NameDef, "kind">): NameDef {
  return { ...params, kind: "name-def" };
}

export function nameRef(params: Omit<NameRef, "kind">): NameRef {
  return { ...params, kind: "name-ref" };
}

export function listComprehension(params: Omit<ListComprehension, "kind">): ListComprehension {
  return { ...params, kind: "list-comprehension" };
}
