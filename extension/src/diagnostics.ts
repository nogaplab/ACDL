import * as vscode from "vscode";
import { Parser } from "../../src/parser";

export function registerDiagnostics(context: vscode.ExtensionContext) {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection("acdl");
  context.subscriptions.push(diagnosticCollection);

  const diagnose = (document: vscode.TextDocument) => {
    console.log("ACDL diagnose called for:", document.uri.toString());
    if (document.languageId !== "acdl") return;
    const diagnostics: vscode.Diagnostic[] = [];

    try {
      new Parser(document.getText()).parseFile();
    } catch (err: any) {
      console.log("ACDL Parse Error:", err.message);  // Debug output
      const match = err.message.match(/\[(\d+):(\d+)\]\s*(.*)/s);
      if (match) {
        const line = Math.max(0, parseInt(match[1]) - 1);
        const col = Math.max(0, parseInt(match[2]) - 1);
        const endCol = col + 10;
        const docLine = document.lineAt(Math.min(line, document.lineCount - 1));
        const range = new vscode.Range(
          docLine.lineNumber,
          Math.min(col, docLine.text.length),
          docLine.lineNumber,
          Math.min(endCol, docLine.text.length),
        );
        diagnostics.push(
          new vscode.Diagnostic(range, match[3], vscode.DiagnosticSeverity.Error),
        );
      } else {
        diagnostics.push(
          new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 1),
            err.message,
            vscode.DiagnosticSeverity.Error,
          ),
        );
      }
    }

    console.log("ACDL setting diagnostics:", diagnostics.length, "errors");
    diagnosticCollection.set(document.uri, diagnostics);
  };

  // Diagnose on open and on change (debounced)
  let timeout: ReturnType<typeof setTimeout> | undefined;
  vscode.workspace.onDidChangeTextDocument(
    (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => diagnose(e.document), 300);
    },
    null,
    context.subscriptions,
  );

  vscode.workspace.onDidOpenTextDocument(diagnose, null, context.subscriptions);
  vscode.workspace.textDocuments.forEach(diagnose);
}
