import { ArithmeticOperator } from "./types";

export type NamespaceKeyword =
  | "prompt"
  | "sys"
  | "env"
  | "resp";

export type ControlKeyword =
  | "If"
  | "ElseIf"
  | "Else"
  | "ForEach"
  | "Switch"
  | "Case"
  | "Default"
  | "break"
  | "continue"
  | "name"
  | "for"
  | "in";

export type Keyword = NamespaceKeyword | ControlKeyword;

export type RangeSymbol = "…" | "...";

export type LogicalOperator = 
  | "="
  | "!"
  | ">"
  | "<"
  | "^"
  | "&"
  | "|";

export type Token =
  | { type: "STRING"; value: string; line: number; col: number }
  | { type: "KEYWORD"; value: Keyword; line: number; col: number }
  | { type: "IDENT"; value: string; line: number; col: number }
  | { type: "NUMBER"; value: string; line: number; col: number }
  | { type: "SYMBOL"; value: string; line: number; col: number }
  | { type: "COMMENT"; value: string; line: number; col: number }
  | { type: "EOF"; value: null, line: number; col: number }
  | { type: "RANGE"; value: RangeSymbol; line: number; col: number }
  | { type: "ARITH_OP"; value: ArithmeticOperator; line: number; col: number }
  | { type: "LOGIC_OP"; value: LogicalOperator; line: number; col: number};
