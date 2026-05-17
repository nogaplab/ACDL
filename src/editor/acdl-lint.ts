import { linter, type Diagnostic } from "@codemirror/lint";
import { Parser } from "../parser.js";

export const acdlLinter = linter((view) => {
  const diagnostics: Diagnostic[] = [];
  const doc = view.state.doc.toString();
  if (!doc.trim()) return diagnostics;

  try {
    new Parser(doc).parseFile();
  } catch (err: any) {
    // Parser errors have the format: [line:col] message
    const match = err.message.match(/\[(\d+):(\d+)\]\s*(.*)/);
    if (match) {
      const line = parseInt(match[1]);
      const col = parseInt(match[2]);
      const msg = match[3];
      const lineCount = view.state.doc.lines;
      const lineObj = view.state.doc.line(Math.min(line, lineCount));
      const from = lineObj.from + Math.min(col - 1, lineObj.length);
      const to = Math.min(from + 10, lineObj.to); // underline up to 10 chars
      diagnostics.push({ from, to, severity: "error", message: msg });
    } else {
      diagnostics.push({ from: 0, to: Math.min(1, doc.length), severity: "error", message: err.message });
    }
  }
  return diagnostics;
});
