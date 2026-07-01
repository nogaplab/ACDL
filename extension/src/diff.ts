import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { diffFiles, formatDiffHtml, DIFF_CSS } from "../../src/diff";

// A single reusable diff panel (like the preview panel).
let diffPanel: vscode.WebviewPanel | undefined;

export function registerDiffCommand(context: vscode.ExtensionContext) {
  // Palette / editor-title flow: diff the active .acdl editor against a file
  // the user picks from open documents, the workspace, or a file dialog.
  context.subscriptions.push(
    vscode.commands.registerCommand("acdl.diff", async () => {
      const active = vscode.window.activeTextEditor;
      if (!active || active.document.languageId !== "acdl") {
        vscode.window.showWarningMessage("Open an .acdl file to diff, then run ACDL: Diff.");
        return;
      }
      const other = await pickOtherFile(active.document.uri);
      if (!other) return;
      showDiff(
        { name: labelFor(active.document.uri), text: active.document.getText() },
        { name: labelFor(other), text: readFile(other) },
        context,
      );
    }),
  );

  // Explorer flow: right-click two selected .acdl files → ACDL: Diff.
  // VS Code passes (clickedUri, allSelectedUris).
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "acdl.diffSelected",
      async (clicked: vscode.Uri, selected?: vscode.Uri[]) => {
        const acdl = (selected ?? [clicked]).filter((u) => u?.fsPath.endsWith(".acdl"));
        if (acdl.length >= 2) {
          showDiff(
            { name: labelFor(acdl[0]), text: readFile(acdl[0]) },
            { name: labelFor(acdl[1]), text: readFile(acdl[1]) },
            context,
          );
          return;
        }
        // Only one file selected: use it as the base and pick the second.
        const base = acdl[0] ?? clicked;
        const other = await pickOtherFile(base);
        if (!other) return;
        showDiff(
          { name: labelFor(base), text: readFile(base) },
          { name: labelFor(other), text: readFile(other) },
          context,
        );
      },
    ),
  );
}

type Side = { name: string; text: string };

/** Let the user choose a second .acdl file (open docs → workspace → browse). */
async function pickOtherFile(exclude: vscode.Uri): Promise<vscode.Uri | undefined> {
  const seen = new Set<string>([exclude.toString()]);
  const items: Array<vscode.QuickPickItem & { uri?: vscode.Uri }> = [];

  // Open .acdl documents first.
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === "acdl" && !seen.has(doc.uri.toString())) {
      seen.add(doc.uri.toString());
      items.push({ label: `$(file) ${labelFor(doc.uri)}`, description: "open", uri: doc.uri });
    }
  }

  // Then other .acdl files in the workspace.
  const found = await vscode.workspace.findFiles("**/*.acdl", "**/node_modules/**", 200);
  for (const uri of found) {
    if (!seen.has(uri.toString())) {
      seen.add(uri.toString());
      items.push({
        label: `$(file) ${path.basename(uri.fsPath)}`,
        description: vscode.workspace.asRelativePath(uri),
        uri,
      });
    }
  }

  items.push({ label: "$(folder-opened) Browse…", description: "pick a file", uri: undefined });

  const chosen = await vscode.window.showQuickPick(items, {
    title: `Diff ${labelFor(exclude)} against…`,
    placeHolder: "Select the .acdl file to compare against",
    matchOnDescription: true,
  });
  if (!chosen) return undefined;
  if (chosen.uri) return chosen.uri;

  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { ACDL: ["acdl"] },
    openLabel: "Diff against this file",
  });
  return picked?.[0];
}

function readFile(uri: vscode.Uri): string {
  // Prefer an open (possibly unsaved) document's text; fall back to disk.
  const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (open) return open.getText();
  return fs.readFileSync(uri.fsPath, "utf-8");
}

function labelFor(uri: vscode.Uri): string {
  return path.basename(uri.fsPath);
}

function showDiff(a: Side, b: Side, context: vscode.ExtensionContext) {
  if (!diffPanel) {
    diffPanel = vscode.window.createWebviewPanel(
      "acdlDiff",
      "ACDL Diff",
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      { enableScripts: false, retainContextWhenHidden: true },
    );
    diffPanel.onDidDispose(() => (diffPanel = undefined), null, context.subscriptions);
  }
  diffPanel.title = `ACDL Diff: ${a.name} → ${b.name}`;
  diffPanel.webview.html = renderDiffHtml(a, b);
  diffPanel.reveal(diffPanel.viewColumn, false);
}

function renderDiffHtml(a: Side, b: Side): string {
  let body: string;
  try {
    body = formatDiffHtml(diffFiles(a.text, b.text));
  } catch (err: any) {
    body = `<div class="acdl-diff-error">Could not parse: ${escapeHtml(err?.message ?? String(err))}</div>`;
  }

  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #1f2328; background: #ffffff;
  }
  .acdl-diff-head {
    position: sticky; top: 0; z-index: 5;
    padding: 10px 16px;
    background: #f6f8fa; border-bottom: 1px solid #d0d7de;
    font-size: 13px; font-weight: 600;
  }
  .acdl-diff-head .from { opacity: 0.7; }
  .acdl-diff-head .arw { margin: 0 8px; opacity: 0.5; }
  .acdl-diff-body { padding: 14px 16px; }
  .acdl-diff-error {
    padding: 16px; font-family: monospace; white-space: pre-wrap;
    color: var(--vscode-errorForeground, #cf222e);
  }
  ${DIFF_CSS}
</style>
</head><body>
  <div class="acdl-diff-head"><span class="from">${escapeHtml(a.name)}</span><span class="arw">→</span><span>${escapeHtml(b.name)}</span></div>
  <div class="acdl-diff-body">${body}</div>
</body></html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
