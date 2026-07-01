import * as vscode from "vscode";
import { registerDiagnostics } from "./diagnostics";
import { registerPreviewCommand } from "./preview";
import { registerDefinitionProvider } from "./definition";
import { registerDiffCommand } from "./diff";

export function activate(context: vscode.ExtensionContext) {
  registerDiagnostics(context);
  registerPreviewCommand(context);
  registerDefinitionProvider(context);
  registerDiffCommand(context);
}

export function deactivate() {}
