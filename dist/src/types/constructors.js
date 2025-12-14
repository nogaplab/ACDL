// "Constructors"
// This is very boiler-platy, but is convenient when we want to
// construct prompts in code. Can probably be done by an LLM or even with a deterministic script.
export function prompt(params) {
    return { ...params, kind: "prompt" };
}
export function promptTitle(params) {
    return { ...params, kind: "title" };
}
export function index(kind, name) {
    return { kind, name };
}
export function timeIndex(params) {
    return { ...params, kind: "time-index" };
}
export function otherIndex(params) {
    return { ...params, kind: "other-index" };
}
export function promptBody(params) {
    return { ...params, kind: "prompt-body" };
}
export function roleMessage(params) {
    return { ...params, kind: "role-message" };
}
export function contextVar(params) {
    return { ...params, kind: "context-var" };
}
export function pathDesc(params) {
    return { ...params, kind: "path-desc" };
}
export function func(params) {
    return { ...params, kind: "function" };
}
export function template(params) {
    return { ...params, kind: "template" };
}
export function loopBlockOutsideRole(params) {
    return { ...params, kind: "loop-block-outside-role" };
}
export function conditionalBlockOutsideRole(params) {
    return { ...params, kind: "conditional-block-outside-role" };
}
export function switchBlockOutsideRole(params) {
    return { ...params, kind: "switch-block-outside-role" };
}
export function caseBlockOutsideRole(params) {
    return { ...params, kind: "case-block-outside-role" };
}
export function defaultCaseBlockOutsideRole(params) {
    return { ...params, kind: "default-case-block-outside-role" };
}
export function loopBlockInsideRole(params) {
    return { ...params, kind: "loop-block-inside-role" };
}
export function conditionalBlockInsideRole(params) {
    return { ...params, kind: "conditional-block-inside-role" };
}
export function switchBlockInsideRole(params) {
    return { ...params, kind: "switch-block-inside-role" };
}
export function caseBlockInsideRole(params) {
    return { ...params, kind: "case-block-inside-role" };
}
export function defaultCaseBlockInsideRole(params) {
    return { ...params, kind: "default-case-block-inside-role" };
}
export function Iterable(params) {
    return { ...params, kind: "iterable" };
}
