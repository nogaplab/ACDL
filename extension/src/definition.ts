import * as vscode from "vscode";

export function registerDefinitionProvider(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider("acdl", {
      provideDefinition(document, position) {
        const wordRange = document.getWordRangeAtPosition(
          position,
          /[a-zA-Z_][a-zA-Z0-9_]*/,
        );
        if (!wordRange) return;
        const word = document.getText(wordRange);

        // Check if this is a prompt.X reference → find label block "X { ... }"
        const lineText = document.lineAt(position.line).text;
        const before = lineText.substring(0, wordRange.start.character);
        if (/\bprompt\.\s*$/.test(before)) {
          return findLabelDefinition(document, word);
        }

        // ALL_CAPS template → find first occurrence in document
        if (/^[A-Z][A-Z0-9_]+$/.test(word)) {
          return findFirstOccurrence(document, word, position);
        }

        return undefined;
      },
    }),
  );
}

function findLabelDefinition(
  document: vscode.TextDocument,
  label: string,
): vscode.Location | undefined {
  // Search for "label {" pattern (label block definition)
  const regex = new RegExp(`\\b${label}\\s*\\{`);
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const match = regex.exec(line.text);
    if (match) {
      return new vscode.Location(
        document.uri,
        new vscode.Position(i, match.index),
      );
    }
  }
  return undefined;
}

function findFirstOccurrence(
  document: vscode.TextDocument,
  word: string,
  currentPosition: vscode.Position,
): vscode.Location | undefined {
  // Find the first occurrence that isn't the current position
  const regex = new RegExp(`\\b${word}\\b`);
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const match = regex.exec(line.text);
    if (match) {
      const pos = new vscode.Position(i, match.index);
      if (i !== currentPosition.line || match.index !== currentPosition.character) {
        return new vscode.Location(document.uri, pos);
      }
    }
  }
  return undefined;
}
