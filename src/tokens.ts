import { ArithmeticOperator } from "./types";

export type NamespaceKeyword =
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
  | "Name"
  | "for"
  | "in"
  | "Mark"
  | "when"
  | "not"
  | "and"
  | "or"
  | "StrFrag"
  | "RoleFrag"
  | "Frag";

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
  | { type: "STRING"; value: string; line: number; col: number; spaceBefore?: boolean }
  | { type: "KEYWORD"; value: Keyword; line: number; col: number; spaceBefore?: boolean }
  | { type: "IDENT"; value: string; line: number; col: number; spaceBefore?: boolean }
  | { type: "NUMBER"; value: string; line: number; col: number; spaceBefore?: boolean }
  | { type: "SYMBOL"; value: string; line: number; col: number; spaceBefore?: boolean }
  | { type: "COMMENT"; value: string; line: number; col: number; spaceBefore?: boolean }
  | { type: "EOF"; value: null, line: number; col: number; spaceBefore?: boolean }
  | { type: "RANGE"; value: RangeSymbol; line: number; col: number; spaceBefore?: boolean }
  | { type: "ARITH_OP"; value: ArithmeticOperator; line: number; col: number; spaceBefore?: boolean }
  | { type: "LOGIC_OP"; value: LogicalOperator; line: number; col: number; spaceBefore?: boolean };
