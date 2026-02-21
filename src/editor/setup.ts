import { EditorView, keymap, lineNumbers, highlightActiveLine,
  highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { acdlStreamLanguage } from "./acdl-language.js";
import { acdlHighlighting } from "./acdl-theme.js";
import { acdlLinter } from "./acdl-lint.js";

export function createEditor(parent: HTMLElement, initialDoc: string): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc: initialDoc,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        history(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        highlightSelectionMatches(),
        acdlHighlighting,
        acdlStreamLanguage,
        acdlLinter,
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        EditorView.theme({
          "&": {
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: "13px",
            lineHeight: "1.6",
          },
          ".cm-content": {
            padding: "16px 0",
          },
          ".cm-gutters": {
            background: "var(--bg-secondary)",
            borderRight: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          },
          "&.cm-focused": {
            outline: "none",
          },
          ".cm-activeLine": {
            background: "rgba(0, 0, 0, 0.04)",
          },
          ".cm-activeLineGutter": {
            background: "rgba(0, 0, 0, 0.06)",
          },
        }),
      ],
    }),
    parent,
  });
}
