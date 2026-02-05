import * as vscode from "vscode";
import { registerDiagnostics } from "./diagnostics";
import { registerPreviewCommand } from "./preview";
import { registerDefinitionProvider } from "./definition";

export function activate(context: vscode.ExtensionContext) {
  registerDiagnostics(context);
  registerPreviewCommand(context);
  registerDefinitionProvider(context);
}

export function deactivate() {}
