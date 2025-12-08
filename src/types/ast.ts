export interface BaseNode {
  kind: string;
}

export interface TextNode extends BaseNode {
  kind: "TextNode";
  text: string;
}

export const exampleAst: TextNode = {
  kind: "TextNode",
  text: "Hello AST"
};
