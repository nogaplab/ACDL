import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/**
 * Colors drawn from the existing CSS palette in styles.css:
 *   --accent-template: #0550ae   (blue)
 *   --accent-function: #8250df   (purple)
 *   --accent-context:  #1a7f37   (green)
 */
const acdlHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword,      color: "#12e82f", fontWeight: "bold" },  // namespace keywords + Prompt
  { tag: tags.standard(tags.variableName), color: "#8250df" },          // control keywords (StreamLanguage "builtin" → variableName.standard)
  { tag: tags.tagName,      color: "#0a58ce", fontWeight: "bold" },  // role identifiers S: U: A: T: N:
  { tag: tags.definition(tags.variableName), color: "#18e6e6", fontWeight: "bold" }, // templates ALL_CAPS
  { tag: tags.string,       color: "#0a58ce" },
  { tag: tags.number,       color: "#000000" },
  { tag: tags.comment,      color: "#6e7781", fontStyle: "italic" },
  { tag: tags.operator,     color: "#000000" },
  { tag: tags.variableName, color: "#000000" },                      // identifiers / context paths
  { tag: tags.meta,         color: "#8250df" },                      // range ...
  { tag: tags.bracket,      color: "#0a58ce" },
  { tag: tags.punctuation,  color: "#000000" },
]);

export const acdlHighlighting = syntaxHighlighting(acdlHighlightStyle);
