import { 
  Prompt, 
  PromptTitle, 
  Index, 
  TimeIndex, 
  OtherIndex, 
  PromptBody, 
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
  Iterable
} from "./types.js";




// "Constructors"

// This is very boiler-platy, but is convenient when we want to
// construct prompts in code. Can probably be done by an LLM or even with a deterministic script.

export function prompt(params: Omit<Prompt, "kind">): Prompt {
  return { ...params, kind: "prompt" };
}

export function promptTitle(params: Omit<PromptTitle, "kind">): PromptTitle {
  return { ...params, kind: "title" };
}

export function index(kind: "time-index", name: string): TimeIndex;
export function index(kind: "other-index", name: string): OtherIndex;

export function index(kind: any, name: string): Index {
  return { kind, name };
}

export function timeIndex(params: Omit<TimeIndex, "kind">): TimeIndex {
  return { ...params, kind: "time-index" };
}

export function otherIndex(params: Omit<OtherIndex, "kind">): OtherIndex {
  return { ...params, kind: "other-index" };
}

export function promptBody(params: Omit<PromptBody, "kind">): PromptBody {
  return { ...params, kind: "prompt-body" };
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

export function Iterable(params: Omit<Iterable, "kind">): Iterable {
  return {... params, kind: "iterable" };
}
