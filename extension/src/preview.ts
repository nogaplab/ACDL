import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Parser } from "../../src/parser";
import { renderPrompt } from "../../src/renderPrompt";

export function registerPreviewCommand(context: vscode.ExtensionContext) {
  let panel: vscode.WebviewPanel | undefined;

  context.subscriptions.push(
    vscode.commands.registerCommand("acdl.showPreview", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      if (panel) {
        panel.reveal(vscode.ViewColumn.Beside);
      } else {
        panel = vscode.window.createWebviewPanel(
          "acdlPreview",
          "ACDL Preview",
          vscode.ViewColumn.Beside,
          { enableScripts: false },
        );
        panel.onDidDispose(() => {
          panel = undefined;
        });
      }

      updatePreview(panel, editor.document, context);
    }),
  );

  // Auto-update on changes
  let timeout: ReturnType<typeof setTimeout> | undefined;
  vscode.workspace.onDidChangeTextDocument(
    (e) => {
      if (panel && e.document.languageId === "acdl") {
        clearTimeout(timeout);
        timeout = setTimeout(
          () => updatePreview(panel!, e.document, context),
          500,
        );
      }
    },
    null,
    context.subscriptions,
  );
}

function updatePreview(
  panel: vscode.WebviewPanel,
  doc: vscode.TextDocument,
  context: vscode.ExtensionContext,
) {
  const text = doc.getText();
  let bodyHtml: string;

  try {
    const ast = new Parser(text).parsePrompt();
    bodyHtml = renderPrompt(ast);
  } catch (err: any) {
    bodyHtml = `<div style="color: #cf222e; padding: 20px; font-family: monospace; white-space: pre-wrap;">${escapeHtml(err.message)}</div>`;
  }

  const cssContent = loadPreviewCss(context);

  panel.webview.html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${cssContent}</style>
<style>
  body { padding: 20px; background: #ffffff; }
</style>
</head>
<body class="compact">${bodyHtml}</body>
</html>`;
}

function loadPreviewCss(context: vscode.ExtensionContext): string {
  const cssPath = path.join(context.extensionPath, "media", "preview.css");
  try {
    return fs.readFileSync(cssPath, "utf-8");
  } catch {
    return "/* preview.css not found */";
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
