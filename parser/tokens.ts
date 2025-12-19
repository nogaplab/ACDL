export type NamespaceKeyword =
  | "prompt"
  | "mem"
  | "obs"
  | "act"
  | "resp";

export type ControlKeyword =
  | "If"
  | "ElseIf"
  | "Else"
  | "ForEach"
  | "Switch"
  | "Case";

export type Keyword = NamespaceKeyword | ControlKeyword;

export type RangeSymbol = "…" | "...";

export type Operator =
  | "-"
  | "+";

export type Token =
  | { type: "STRING"; value: string; line: number; col: number }
  | { type: "KEYWORD"; value: Keyword; line: number; col: number }
  | { type: "IDENT"; value: string; line: number; col: number }
  | { type: "NUMBER"; value: string; line: number; col: number }
  | { type: "SYMBOL"; value: string; line: number; col: number }
  | { type: "COMMENT"; value: string; line: number; col: number }
  | { type: "EOF"; line: number; col: number }
  | { type: "RANGE"; value: RangeSymbol; line: number; col: number }
  | { type: "OPERATOR"; value: Operator; line: number; col: number };
