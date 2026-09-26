import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  BLOCKS_CSS,
  BlockRange,
  DEFAULT_WRAP_WIDTH,
  MAX_WRAP_WIDTH,
  MIN_WRAP_WIDTH,
  clampWrapWidth,
  escapeHtml,
  listRenderableBlocks,
  pageFontFaceCss,
  renderBlocksHtml,
} from "../../src/render-blocks";
import {
  ExportItem,
  ExportOptions,
  beginExport,
  buildRasterizeMessage,
  completeExport,
} from "./export";

// The preview renders every block with the SVG renderer through the shared
// src/render-blocks.ts, the same code the website visualizer draws with, so
// the pane, the visualizer and Copy / Save / Export all show the same thing.

const WRAP_WIDTH_KEY = "acdl.previewWrapWidth";

type PreviewState = {
  panel: vscode.WebviewPanel;
  sourceUri: vscode.Uri;
  sourceCursorLine: number;
  /** Blocks rendered in the preview, in file order (from the last render). */
  blocks: BlockRange[];
  /** Index of the block the preview is currently focused on. */
  currentIndex: number;
  /** Wrap width in CSS px passed to the SVG renderer (0 = natural width). */
  wrapWidth: number;
  /** Export options waiting for the webview to finish rasterizing. */
  pendingExport?: ExportOptions;
};

export function registerPreviewCommand(context: vscode.ExtensionContext) {
  let state: PreviewState | undefined;

  const setPreviewVisible = (visible: boolean) => {
    vscode.commands.executeCommand(
      "setContext",
      "acdl.previewVisible",
      visible,
    );
  };

  const getSourceEditor = (): vscode.TextEditor | undefined => {
    if (!state) return undefined;
    return vscode.window.visibleTextEditors.find(
      (e) => e.document.uri.toString() === state!.sourceUri.toString(),
    );
  };

  /** Scroll the preview to block `index` and mark it as current. */
  const focusBlock = (index: number, source: "cursor" | "nav") => {
    if (!state || state.blocks.length === 0) return;
    const clamped = Math.min(state.blocks.length - 1, Math.max(0, index));
    state.currentIndex = clamped;
    state.panel.webview.postMessage({ type: "focusBlock", index: clamped, source });
  };

  /** Full re-render: parse the file and rebuild the webview with every block. */
  const refresh = () => {
    if (!state) return;
    const editor = getSourceEditor();
    if (!editor) return;
    state.sourceCursorLine = editor.selection.active.line + 1; // 1-based
    state.blocks = updatePreview(
      state.panel,
      editor.document,
      state.wrapWidth,
      context,
    );
    if (state.blocks.length === 0) return;
    // After a rebuild the webview starts at the top; jump back to the block
    // under the cursor.
    focusBlock(pickBlockIndex(state.blocks, state.sourceCursorLine), "cursor");
  };

  const navigate = (delta: number) => {
    if (!state || state.blocks.length === 0) return;
    const next = Math.min(
      state.blocks.length - 1,
      Math.max(0, state.currentIndex + delta),
    );
    if (next === state.currentIndex) return;
    focusBlock(next, "nav");
    // Scroll the editor so the block is on screen, without moving the cursor
    // (moving the cursor would immediately re-trigger cursor-based focusing).
    const editor = getSourceEditor();
    const target = state.blocks[next];
    editor?.revealRange(
      new vscode.Range(target.startLine - 1, 0, target.startLine - 1, 0),
      vscode.TextEditorRevealType.AtTop,
    );
  };

  /** Copy the current block to the clipboard as PNG (rasterized in the webview). */
  const copyCurrentBlock = () => {
    if (!state || state.blocks.length === 0) return;
    state.panel.webview.postMessage(
      buildRasterizeMessage(
        state.blocks,
        [state.currentIndex],
        state.wrapWidth,
        "copy",
        2,
        false,
      ),
    );
  };

  /** Open the Save dialog (current / all / chosen blocks, PDF or PNG). */
  const openSaveDialog = () => {
    state?.panel.webview.postMessage({ type: "openExport" });
  };

  const setWrapWidth = (width: number) => {
    if (!state) return;
    const w = clampWrapWidth(width);
    if (w === state.wrapWidth) return;
    state.wrapWidth = w;
    context.workspaceState.update(WRAP_WIDTH_KEY, w);
    refresh();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("acdl.showPreview", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      if (state) {
        state.sourceUri = editor.document.uri;
        state.panel.reveal(vscode.ViewColumn.Beside, true);
      } else {
        const panel = vscode.window.createWebviewPanel(
          "acdlPreview",
          "ACDL Preview",
          { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
          {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
              vscode.Uri.file(path.join(context.extensionPath, "media")),
              vscode.Uri.file(path.join(context.extensionPath, "fonts")),
            ],
          },
        );

        state = {
          panel,
          sourceUri: editor.document.uri,
          sourceCursorLine: editor.selection.active.line + 1,
          blocks: [],
          currentIndex: 0,
          wrapWidth: clampWrapWidth(
            context.workspaceState.get<number>(WRAP_WIDTH_KEY, DEFAULT_WRAP_WIDTH),
          ),
        };

        panel.onDidDispose(() => {
          state = undefined;
          setPreviewVisible(false);
        });

        panel.onDidChangeViewState(() => {
          setPreviewVisible(panel.visible);
        });

        panel.webview.onDidReceiveMessage(async (msg) => {
          if (!state || !msg) return;
          switch (msg.type) {
            case "navigate":
              navigate(Number(msg.delta) || 0);
              break;
            case "blockVisible":
              // The user scrolled the preview; remember which block is on top
              // so the next arrow press continues from there.
              if (Number.isInteger(msg.index)) {
                state.currentIndex = Math.min(
                  state.blocks.length - 1,
                  Math.max(0, msg.index),
                );
              }
              break;
            case "setWrapWidth":
              setWrapWidth(Number(msg.width));
              break;
            case "requestCopy":
              copyCurrentBlock();
              break;
            case "export": {
              // The dialog was submitted: decide what the webview must rasterize.
              const opts = msg as ExportOptions;
              const job = beginExport(opts, state.blocks, state.wrapWidth);
              if (!job) {
                vscode.window.showWarningMessage("ACDL export: no blocks selected.");
                return;
              }
              state.pendingExport = opts;
              state.panel.webview.postMessage(job);
              break;
            }
            case "exportImages": {
              const opts = state.pendingExport;
              state.pendingExport = undefined;
              if (msg.error) {
                vscode.window.showErrorMessage(`ACDL export failed: ${msg.error}`);
                return;
              }
              if (!opts) return;
              try {
                await completeExport(opts, msg.items as ExportItem[], state.sourceUri);
              } catch (err: any) {
                vscode.window.showErrorMessage(
                  `ACDL export failed: ${err?.message || err}`,
                );
              }
              break;
            }
            case "info":
              vscode.window.setStatusBarMessage(`ACDL: ${msg.text}`, 2000);
              break;
            case "error":
              vscode.window.showErrorMessage(`ACDL preview: ${msg.text}`);
              break;
          }
        });
      }

      setPreviewVisible(true);
      refresh();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("acdl.copyPreviewImage", copyCurrentBlock),
    vscode.commands.registerCommand("acdl.savePreviewImage", openSaveDialog),
    vscode.commands.registerCommand("acdl.zoomInPreview", () => {
      state?.panel.webview.postMessage({ type: "zoomIn" });
    }),
    vscode.commands.registerCommand("acdl.zoomOutPreview", () => {
      state?.panel.webview.postMessage({ type: "zoomOut" });
    }),
    vscode.commands.registerCommand("acdl.resetZoomPreview", () => {
      state?.panel.webview.postMessage({ type: "resetZoom" });
    }),
    vscode.commands.registerCommand("acdl.previewNextBlock", () => {
      navigate(1);
    }),
    vscode.commands.registerCommand("acdl.previewPrevBlock", () => {
      navigate(-1);
    }),
  );

  let timeout: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!state) return;
      if (e.document.uri.toString() !== state.sourceUri.toString()) return;
      clearTimeout(timeout);
      timeout = setTimeout(refresh, 300);
    }),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (!state) return;
      if (e.textEditor.document.uri.toString() !== state.sourceUri.toString())
        return;
      const newLine = e.textEditor.selection.active.line + 1;
      if (newLine === state.sourceCursorLine) return;
      state.sourceCursorLine = newLine;
      if (state.blocks.length === 0) return;
      // No re-render needed: just scroll the preview to the block under the cursor.
      focusBlock(pickBlockIndex(state.blocks, newLine), "cursor");
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!state || !editor) return;
      if (editor.document.languageId !== "acdl") return;
      state.sourceUri = editor.document.uri;
      refresh();
    }),
  );
}

/** Index of the block containing `cursorLine`, or the closest one by line distance. */
function pickBlockIndex(blocks: BlockRange[], cursorLine: number): number {
  const containing = blocks.findIndex(
    (r) => cursorLine >= r.startLine && cursorLine <= r.endLine,
  );
  if (containing >= 0) return containing;
  // Pick the closest block by line distance (e.g. cursor in whitespace).
  let bestIdx = 0;
  let bestDist = Infinity;
  blocks.forEach((r, i) => {
    const dist =
      cursorLine < r.startLine
        ? r.startLine - cursorLine
        : cursorLine - r.endLine;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  });
  return bestIdx;
}

function updatePreview(
  panel: vscode.WebviewPanel,
  doc: vscode.TextDocument,
  wrapWidth: number,
  context: vscode.ExtensionContext,
): BlockRange[] {
  const text = doc.getText();
  let bodyHtml: string;
  let statusHtml = "";
  let blocks: BlockRange[] = [];

  try {
    blocks = listRenderableBlocks(text);
    if (blocks.length === 0) {
      throw new Error("No prompts or fragments found in file");
    }

    // Every block is rendered, stacked in file order. Each one gets a wrapper
    // the webview can scroll to and highlight.
    bodyHtml = renderBlocksHtml(blocks, wrapWidth);

    if (blocks.length > 1) {
      statusHtml = `<div class="acdl-blocknav" role="group" aria-label="Block navigation">
        <button id="acdl-prev" class="acdl-nav" title="Previous block (←, Ctrl/Cmd+Alt+←)">&#8592;</button>
        <span class="acdl-blocknav-text" id="acdl-status-text"></span>
        <button id="acdl-next" class="acdl-nav" title="Next block (→, Ctrl/Cmd+Alt+→)">&#8594;</button>
      </div>`;
    }
  } catch (err: any) {
    blocks = [];
    bodyHtml = `<div class="acdl-block-error">${escapeHtml(err.message)}</div>`;
  }

  // Fonts are inlined as data URIs so the page never depends on webview
  // resource URIs resolving: a fallback font would break the SVG layout, which
  // is computed from JetBrains Mono's metrics.
  const fontUri = (file: string) => {
    const bytes = fs.readFileSync(path.join(context.extensionPath, "fonts", file));
    return `data:font/truetype;base64,${bytes.toString("base64")}`;
  };
  const cspSource = panel.webview.cspSource;
  const nonce = makeNonce();

  panel.webview.html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data: blob:; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource} data:; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  ${pageFontFaceCss(String(fontUri("JetBrainsMono-Regular.ttf")), String(fontUri("JetBrainsMono-Bold.ttf")))}

  html, body { margin: 0; padding: 0; background: #ffffff; }
  /* Fixed-height body so #acdl-scroll (not the window) is the scroller; the
     navigation and scroll-tracking code depends on that. */
  html, body { height: 100%; overflow: hidden; }
  body { display: flex; flex-direction: column; height: 100vh;
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }

  .acdl-preview-toolbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    padding: 5px 10px;
    background: #f6f8fa; border-bottom: 1px solid #d0d7de;
  }
  .acdl-action {
    display: inline-flex; align-items: center; gap: 5px;
    background: #ffffff; color: #1f2328;
    border: 1px solid #d0d7de; border-radius: 5px;
    padding: 4px 8px; cursor: pointer;
    font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    transition: background 0.1s ease, border-color 0.1s ease;
  }
  .acdl-action:hover { background: #f3f4f6; border-color: #9aa4af; }
  .acdl-action:active { background: #e6e8eb; }
  .acdl-action:disabled { opacity: 0.5; cursor: default; }
  .acdl-action.primary {
    background: #1f6feb; color: #ffffff; border-color: #1f6feb;
  }
  .acdl-action.primary:hover { background: #1158c7; border-color: #1158c7; }
  .acdl-action svg { width: 14px; height: 14px; flex: 0 0 14px; }
  /* Dialog buttons keep a little more room than toolbar buttons. */
  .acdl-dialog .acdl-action { padding: 6px 12px; font-size: 13px; }

  .acdl-zoom, .acdl-width {
    display: inline-flex; align-items: center; gap: 2px;
    background: #ffffff; border: 1px solid #d0d7de; border-radius: 5px;
    padding: 1px;
  }
  .acdl-zoom { gap: 0; }
  .acdl-zoom button {
    background: transparent; border: none; cursor: pointer;
    padding: 3px 5px; font: 600 13px/1 inherit; color: #1f2328;
    border-radius: 4px;
  }
  .acdl-zoom button:hover { background: #f3f4f6; }
  .acdl-zoom .zoom-label {
    padding: 0 2px; text-align: center; cursor: default;
    font: 500 11px/1 "JetBrains Mono", "SF Mono", monospace;
    color: #57606a;
  }
  .acdl-width { gap: 5px; padding: 1px 6px; }
  .acdl-width .width-label {
    font: 600 10px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #57606a;
  }
  .acdl-width input[type="range"] { width: 120px; margin: 0; }
  .acdl-width input[type="number"] {
    width: 4ch; padding: 2px 3px; border: 1px solid #d0d7de; border-radius: 4px;
    font: 500 11px/1 "JetBrains Mono", "SF Mono", monospace; color: #1f2328;
    text-align: right; -moz-appearance: textfield; appearance: textfield;
  }
  .acdl-width input[type="number"]::-webkit-inner-spin-button,
  .acdl-width input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }

  .acdl-blocknav {
    display: inline-flex; align-items: center; gap: 1px;
    background: #ffffff; border: 1px solid #d0d7de; border-radius: 5px;
    padding: 1px;
  }
  .acdl-blocknav-text {
    min-width: 44px; text-align: center;
    font: 500 11px/1 "JetBrains Mono", "SF Mono", monospace;
    color: #57606a;
  }
  .acdl-nav {
    background: transparent; color: #1f2328;
    border: none; border-radius: 4px;
    padding: 3px 7px; cursor: pointer;
    font: 600 13px/1 inherit;
  }
  .acdl-nav:hover:not(:disabled) { background: #f3f4f6; }
  .acdl-nav:disabled { opacity: 0.4; cursor: default; }

  .acdl-preview-scroll {
    flex: 1; overflow: auto; padding: 20px;
  }
  .acdl-preview-zoom-host {
    transform-origin: 0 0;
    display: inline-block;
    min-width: 100%;
  }

  ${BLOCKS_CSS}

  .acdl-toast {
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: #1f2328; color: #ffffff;
    padding: 10px 16px; border-radius: 8px;
    font: 500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    opacity: 0; pointer-events: none;
    transition: opacity 0.2s ease;
    z-index: 100;
  }
  .acdl-toast.show { opacity: 1; }
  .acdl-toast.error { background: #cf222e; }

  .acdl-overlay {
    position: fixed; inset: 0; z-index: 50;
    background: rgba(0,0,0,0.35);
    display: flex; align-items: center; justify-content: center;
  }
  .acdl-overlay[hidden] { display: none; }
  .acdl-dialog {
    background: #ffffff; color: #1f2328;
    border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,0.3);
    padding: 18px 20px; width: min(400px, 100vw - 32px);
    max-height: calc(100vh - 32px); overflow: auto; box-sizing: border-box;
    position: relative; overflow-wrap: anywhere;
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .acdl-dialog-title { font-weight: 600; font-size: 15px; margin: 0 28px 10px 0; }
  .acdl-dialog-x {
    position: absolute; top: 10px; right: 10px;
    width: 26px; height: 26px; border-radius: 6px;
    background: transparent; border: none; cursor: pointer;
    color: #57606a; font: 400 20px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .acdl-dialog-x:hover { background: #f3f4f6; color: #1f2328; }
  .acdl-dialog fieldset {
    border: 1px solid #d0d7de; border-radius: 6px;
    margin: 0 0 10px; padding: 6px 12px 8px;
  }
  .acdl-dialog fieldset[hidden] { display: none; }
  .acdl-dialog legend { font-weight: 600; font-size: 12px; color: #57606a; padding: 0 4px; }
  .acdl-dialog label { display: block; padding: 3px 0; cursor: pointer; }
  .acdl-dialog input[type="radio"], .acdl-dialog input[type="checkbox"] { margin: 0 6px 0 0; vertical-align: -1px; }
  .acdl-dim { color: #8c959f; font-size: 11px; }
  .acdl-picker {
    max-height: 160px; overflow: auto;
    margin: 6px 0 0 20px; padding-top: 6px; border-top: 1px dashed #d0d7de;
  }
  .acdl-picker[hidden] { display: none; }
  .acdl-picker label { font: 12px/1.4 "JetBrains Mono", "SF Mono", monospace; }
  .acdl-dialog-note { font-size: 12px; color: #57606a; margin: 2px 0 12px; }
  .acdl-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }

  .acdl-icon-btn { padding: 4px 6px; }
  .acdl-help { width: min(560px, 100vw - 32px); }
  .acdl-help h3 {
    font-size: 12px; font-weight: 600; color: #57606a;
    text-transform: uppercase; letter-spacing: 0.4px;
    margin: 14px 0 6px;
  }
  .acdl-help ul { margin: 0; padding-left: 18px; }
  .acdl-help li { margin: 3px 0; }
  .acdl-help p { margin: 6px 0 0; }
  .acdl-help .mono { font: 12px "JetBrains Mono", "SF Mono", monospace; }
  .acdl-help .acdl-dialog-actions { margin-top: 14px; }
  .acdl-keys { border-collapse: collapse; width: 100%; }
  .acdl-keys td { padding: 3px 0; vertical-align: top; }
  .acdl-keys td:first-child { padding-right: 14px; width: 1%; }
  .acdl-keys kbd { white-space: nowrap; margin: 1px 0; }
  .acdl-help kbd {
    display: inline-block;
    font: 500 11px/1 "JetBrains Mono", "SF Mono", monospace;
    padding: 3px 5px; border-radius: 4px;
    background: #f6f8fa; border: 1px solid #d0d7de; border-bottom-width: 2px;
    color: #1f2328;
  }
</style>
</head>
<body>
  <div class="acdl-preview-toolbar">
    <button id="acdl-copy" class="acdl-action primary" title="Copy the highlighted block as PNG to clipboard">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 1.75A.75.75 0 0 1 5.75 1h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 5 1.75Zm-1.5 0c0-.13.01-.26.04-.39A2.25 2.25 0 0 0 1.5 3.5v10A2.5 2.5 0 0 0 4 16h8a2.5 2.5 0 0 0 2.5-2.5v-10a2.25 2.25 0 0 0-2.04-2.14c.03.13.04.26.04.39A2.25 2.25 0 0 1 10.25 4h-4.5A2.25 2.25 0 0 1 3.5 1.75Z"/></svg>
      Copy
    </button>
    <button id="acdl-save" class="acdl-action" title="Save as PDF or PNG: the highlighted block, all blocks, or a selection; one file or one per block">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 12a.75.75 0 0 0 .75-.75V4.56l1.97 1.97a.75.75 0 1 0 1.06-1.06l-3.25-3.25a.75.75 0 0 0-1.06 0L4.22 5.47a.75.75 0 0 0 1.06 1.06L7.25 4.56v6.69c0 .41.34.75.75.75ZM2.75 9.5a.75.75 0 0 1 .75.75v3a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-3a.75.75 0 0 1 1.5 0v3A2 2 0 0 1 12 15.25H4A2 2 0 0 1 2 13.25v-3a.75.75 0 0 1 .75-.75Z"/></svg>
      Save…
    </button>
    ${statusHtml}
    <button id="acdl-help" class="acdl-action acdl-icon-btn" title="Help: shortcuts and what the preview can do (?)" aria-label="Help">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.92 6.085h.001a.749.749 0 1 1-1.342-.67c.169-.339.436-.701.849-.977C6.845 4.16 7.369 4 8 4a2.756 2.756 0 0 1 1.637.525c.503.377.863.965.863 1.725 0 .448-.115.83-.329 1.15-.205.307-.47.513-.692.662-.109.072-.22.138-.313.195l-.006.004a6.24 6.24 0 0 0-.26.16 1.116 1.116 0 0 0-.276.245.75.75 0 0 1-1.248-.832c.184-.264.42-.489.692-.678.128-.09.266-.17.39-.24l.006-.004c.119-.07.219-.13.308-.19.191-.129.32-.253.393-.362.077-.115.114-.24.114-.415 0-.24-.12-.394-.28-.514A1.265 1.265 0 0 0 8 5.5c-.369 0-.595.09-.74.187a.978.978 0 0 0-.34.398ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>
    </button>
    <div class="acdl-width" title="Wrap width in px: content wider than this wraps. Applies to the preview and to every export.">
      <span class="width-label">Width</span>
      <input type="range" id="acdl-width-slider" min="${MIN_WRAP_WIDTH}" max="${MAX_WRAP_WIDTH}" step="10" value="${wrapWidth}">
      <input type="number" id="acdl-width-num" min="${MIN_WRAP_WIDTH}" max="${MAX_WRAP_WIDTH}" step="10" value="${wrapWidth}">
    </div>
    <div class="acdl-zoom" role="group" aria-label="Zoom">
      <button id="acdl-zoom-out" title="Zoom out">−</button>
      <span class="zoom-label" id="acdl-zoom-label" title="Double-click to reset to 100%">100%</span>
      <button id="acdl-zoom-in" title="Zoom in">+</button>
    </div>
  </div>
  <div id="acdl-toast" class="acdl-toast" role="status" aria-live="polite"></div>
  <div id="acdl-help-overlay" class="acdl-overlay" hidden>
    <div class="acdl-dialog acdl-help" role="dialog" aria-modal="true" aria-label="Help">
      <button class="acdl-dialog-x" id="acdl-help-x" title="Close" aria-label="Close">&#215;</button>
      <div class="acdl-dialog-title">ACDL preview</div>

      <h3>Keyboard shortcuts</h3>
      <table class="acdl-keys">
        <tr><td><kbd data-mod>Ctrl+Alt</kbd>+<kbd>C</kbd></td><td>Copy the highlighted block to the clipboard as PNG</td></tr>
        <tr><td><kbd data-mod>Ctrl+Alt</kbd>+<kbd>S</kbd></td><td>Open the Save dialog (PDF / PNG)</td></tr>
        <tr><td><kbd>&#8592;</kbd> / <kbd>&#8594;</kbd></td><td>Previous / next block (also <kbd>PageUp</kbd> / <kbd>PageDown</kbd>)</td></tr>
        <tr><td><kbd data-mod>Ctrl+Alt</kbd>+<kbd>&#8592;</kbd> / <kbd>&#8594;</kbd></td><td>Previous / next block from the editor, without leaving it</td></tr>
        <tr><td><kbd data-mod>Ctrl+Alt</kbd>+<kbd>=</kbd> / <kbd>&#8722;</kbd> / <kbd>0</kbd></td><td>Zoom in / out / reset (also <kbd data-ctrl>Ctrl</kbd>+scroll wheel)</td></tr>
        <tr><td><kbd>?</kbd></td><td>This help</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Close a dialog</td></tr>
      </table>
      <p class="acdl-dim">The <kbd data-mod>Ctrl+Alt</kbd> shortcuts work both inside the preview and in the editor while the preview is open. Plain arrow keys need the preview to have focus (click it once).</p>

      <h3>Moving around</h3>
      <ul>
        <li>Every prompt and fragment in the file is shown, stacked in file order. Scroll freely; the counter in the yellow bar follows the block at the top.</li>
        <li>Moving the cursor in the editor scrolls the preview to that block and highlights it in blue.</li>
        <li>The arrows (buttons or keys) jump block by block and scroll the editor along, without moving your cursor.</li>
      </ul>

      <h3>Width and zoom</h3>
      <ul>
        <li><b>Width</b> is the wrap width in pixels (200 to 1000). Content wider than this wraps. It applies to the preview and to every export, and is remembered per workspace.</li>
        <li><b>Zoom</b> only changes how big the preview looks on screen; exports are unaffected.</li>
      </ul>

      <h3>Copy and Save</h3>
      <ul>
        <li><b>Copy</b> puts the highlighted block on the clipboard as a PNG, ready to paste into a document or chat.</li>
        <li><b>Save&#8230;</b> opens a dialog where you choose:
          <ul>
            <li><b>Blocks</b>: the highlighted block, all blocks in the file, or a hand-picked set.</li>
            <li><b>Format</b>: PDF or PNG. Both use the preview's rendering and width.</li>
            <li><b>Output</b> (several blocks): one file, or separate files, one per block, in a folder you pick. Separate files are named <span class="mono">&lt;file&gt;-&lt;n&gt;-&lt;block name&gt;</span>.</li>
            <li><b>PDF pages</b> (one PDF, several blocks): one page per block, or a single tall page. A multi-block PNG is stacked into one tall image.</li>
          </ul>
        </li>
        <li>Rendering is the same pipeline the website visualizer uses, so the pane shows exactly what the visualizer and every export produce.</li>
      </ul>

      <div class="acdl-dialog-actions">
        <button id="acdl-help-close" class="acdl-action primary">Close</button>
      </div>
    </div>
  </div>
  <div id="acdl-export-overlay" class="acdl-overlay" hidden>
    <div class="acdl-dialog" role="dialog" aria-modal="true" aria-label="Save">
      <button class="acdl-dialog-x" id="acdl-export-x" title="Close" aria-label="Close">&#215;</button>
      <div class="acdl-dialog-title">Save as PDF / PNG</div>
      <fieldset>
        <legend>Blocks</legend>
        <label><input type="radio" name="scope" value="current" checked> Current block</label>
        <label><input type="radio" name="scope" value="all"> All blocks</label>
        <label><input type="radio" name="scope" value="selected"> Choose…</label>
        <div id="acdl-export-picker" class="acdl-picker" hidden></div>
      </fieldset>
      <fieldset>
        <legend>Format</legend>
        <label><input type="radio" name="format" value="pdf" checked> PDF</label>
        <label><input type="radio" name="format" value="png"> PNG</label>
        <div class="acdl-dim">Both use the preview's rendering and wrap width (${wrapWidth}px).</div>
      </fieldset>
      <fieldset id="acdl-export-layout">
        <legend>Output</legend>
        <label><input type="radio" name="layout" value="single" checked> One file</label>
        <label><input type="radio" name="layout" value="separate"> Separate files, one per block</label>
      </fieldset>
      <fieldset id="acdl-export-pages">
        <legend>PDF pages</legend>
        <label><input type="radio" name="pages" value="perBlock" checked> One page per block</label>
        <label><input type="radio" name="pages" value="continuous"> Single continuous page</label>
      </fieldset>
      <div class="acdl-dialog-note" id="acdl-export-note"></div>
      <div class="acdl-dialog-actions">
        <button id="acdl-export-cancel" class="acdl-action">Cancel</button>
        <button id="acdl-export-go" class="acdl-action primary">Save…</button>
      </div>
    </div>
  </div>
  <div class="acdl-preview-scroll" id="acdl-scroll">
    <div class="acdl-preview-zoom-host" id="acdl-zoom-host">
      <div id="acdl-capture">${bodyHtml}</div>
    </div>
  </div>
  <script nonce="${nonce}">
${getWebviewScript()}
  </script>
</body>
</html>`;

  return blocks;
}

function getWebviewScript(): string {
  return `
    const vscode = acquireVsCodeApi();
    const prev = vscode.getState() || { zoom: 1 };
    const host = document.getElementById('acdl-zoom-host');
    const label = document.getElementById('acdl-zoom-label');
    const toastEl = document.getElementById('acdl-toast');

    // Show OS-appropriate shortcut hints on the action buttons.
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');
    const mod = isMac ? '⌘' : 'Ctrl';
    const alt = isMac ? '⌥' : 'Alt';
    document.getElementById('acdl-copy').title += ' (' + mod + '+' + alt + '+C)';
    document.getElementById('acdl-save').title += ' (' + mod + '+' + alt + '+S)';

    let toastTimer;
    function showToast(text, kind) {
      toastEl.textContent = text;
      toastEl.classList.toggle('error', kind === 'error');
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
    }

    // ---- Zoom ---------------------------------------------------------------
    let zoom = prev.zoom || 1;
    const MIN_ZOOM = 0.25, MAX_ZOOM = 4;

    function saveState() {
      vscode.setState({ zoom, exportPrefs: window.__acdlExportPrefs || prev.exportPrefs });
    }
    function applyZoom() {
      host.style.transform = 'scale(' + zoom + ')';
      label.textContent = Math.round(zoom * 100) + '%';
      saveState();
    }
    function setZoom(z) {
      zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
      applyZoom();
    }
    function zoomIn()  { setZoom(zoom + 0.1); }
    function zoomOut() { setZoom(zoom - 0.1); }
    function resetZoom() { setZoom(1); }

    document.getElementById('acdl-zoom-in').addEventListener('click', zoomIn);
    document.getElementById('acdl-zoom-out').addEventListener('click', zoomOut);
    label.addEventListener('dblclick', resetZoom);
    document.getElementById('acdl-copy').addEventListener('click', () => vscode.postMessage({ type: 'requestCopy' }));
    document.getElementById('acdl-save').addEventListener('click', () => openExport());

    // ---- Help dialog --------------------------------------------------------
    const helpOverlay = document.getElementById('acdl-help-overlay');
    // Show the OS's modifier names in the shortcut table.
    helpOverlay.querySelectorAll('kbd[data-mod]').forEach((k) => { k.textContent = mod + '+' + alt; });
    helpOverlay.querySelectorAll('kbd[data-ctrl]').forEach((k) => { k.textContent = mod; });
    function openHelp() { helpOverlay.hidden = false; document.getElementById('acdl-help-close').focus(); }
    function closeHelp() { helpOverlay.hidden = true; }
    document.getElementById('acdl-help').addEventListener('click', openHelp);
    document.getElementById('acdl-help-close').addEventListener('click', closeHelp);
    document.getElementById('acdl-help-x').addEventListener('click', closeHelp);
    helpOverlay.addEventListener('click', (e) => { if (e.target === helpOverlay) closeHelp(); });

    // ---- Wrap width ---------------------------------------------------------
    const widthSlider = document.getElementById('acdl-width-slider');
    const widthNum = document.getElementById('acdl-width-num');
    function commitWidth(value) {
      const w = parseInt(value, 10);
      if (isNaN(w)) return;
      showToast('Re-rendering at ' + w + 'px…');
      vscode.postMessage({ type: 'setWrapWidth', width: w });
    }
    widthSlider.addEventListener('input', () => { widthNum.value = widthSlider.value; });
    widthSlider.addEventListener('change', () => commitWidth(widthSlider.value));
    widthNum.addEventListener('change', () => { widthSlider.value = widthNum.value; commitWidth(widthNum.value); });

    // ---- Keyboard -----------------------------------------------------------
    window.addEventListener('keydown', (e) => {
      const modKey = e.ctrlKey || e.metaKey;
      if (!modKey || !e.altKey) return;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn(); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomOut(); }
      else if (e.key === '0') { e.preventDefault(); resetZoom(); }
      else if (e.key === 'c' || e.key === 'C') { e.preventDefault(); vscode.postMessage({ type: 'requestCopy' }); }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); openExport(); }
    });
    window.addEventListener('keydown', (e) => {
      const inInput = !!(e.target && e.target.tagName === 'INPUT');
      if (e.key === 'Escape' && isDialogOpen()) { e.preventDefault(); closeExport(); closeHelp(); }
      else if (e.key === '?' && !isDialogOpen() && !inInput) { e.preventDefault(); openHelp(); }
    });

    // Mouse wheel zoom with Ctrl/Cmd
    const scrollEl = document.getElementById('acdl-scroll');
    scrollEl.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn(); else zoomOut();
    }, { passive: false });

    // ---- Block navigation ---------------------------------------------------
    const blocks = Array.from(document.querySelectorAll('.acdl-block'));
    const statusText = document.getElementById('acdl-status-text');
    const prevBtn = document.getElementById('acdl-prev');
    const nextBtn = document.getElementById('acdl-next');
    let currentIndex = 0;

    function navigate(delta) { vscode.postMessage({ type: 'navigate', delta }); }
    if (prevBtn) prevBtn.addEventListener('click', () => navigate(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => navigate(1));

    function markCurrent(index) {
      if (blocks.length === 0) return;
      currentIndex = Math.min(blocks.length - 1, Math.max(0, index));
      blocks.forEach((b, i) => b.classList.toggle('current', i === currentIndex));
      const b = blocks[currentIndex];
      if (statusText) {
        statusText.textContent = (currentIndex + 1) + ' / ' + blocks.length;
        statusText.title = 'Block ' + (currentIndex + 1) + ' of ' + blocks.length +
          ', lines ' + b.dataset.start + '\\u2013' + b.dataset.end;
      }
      if (prevBtn) prevBtn.disabled = currentIndex === 0;
      if (nextBtn) nextBtn.disabled = currentIndex === blocks.length - 1;
    }

    let suppressScrollTracking = 0;
    function scrollToBlock(index) {
      if (blocks.length === 0) return;
      markCurrent(index);
      const b = blocks[currentIndex];
      // Account for the zoom transform: use bounding rects, not offsetTop.
      const top = b.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop;
      suppressScrollTracking = Date.now() + 400;
      scrollEl.scrollTop = Math.max(0, top - 12);
      // Belt and braces: if anything else ended up as the scroller, still land on the block.
      if (Math.abs(b.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top) > 40) {
        b.scrollIntoView({ block: 'start', behavior: 'auto' });
      }
    }

    // While the user scrolls freely, keep the counter on the block nearest the
    // top of the viewport and tell the extension so arrows continue from there.
    let scrollTimer;
    scrollEl.addEventListener('scroll', () => {
      if (Date.now() < suppressScrollTracking) return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        if (blocks.length === 0) return;
        const viewTop = scrollEl.getBoundingClientRect().top;
        let best = 0, bestDist = Infinity;
        blocks.forEach((b, i) => {
          const r = b.getBoundingClientRect();
          // Prefer the block that spans the top edge; otherwise the nearest one.
          const dist = r.top <= viewTop + 16 && r.bottom > viewTop + 16
            ? 0 : Math.abs(r.top - viewTop);
          if (dist < bestDist) { bestDist = dist; best = i; }
        });
        if (best !== currentIndex) {
          markCurrent(best);
          vscode.postMessage({ type: 'blockVisible', index: best });
        }
      }, 80);
    }, { passive: true });

    // Plain arrow keys switch blocks while the preview has focus.
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isDialogOpen()) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT') return;
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault(); navigate(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault(); navigate(1);
      }
    });

    markCurrent(0);

    // ---- Export dialog ------------------------------------------------------
    const overlay = document.getElementById('acdl-export-overlay');
    const picker = document.getElementById('acdl-export-picker');
    const exportGo = document.getElementById('acdl-export-go');
    const exportPrefs = Object.assign(
      { scope: 'current', format: 'pdf', layout: 'single', pages: 'perBlock' },
      prev.exportPrefs || {});
    window.__acdlExportPrefs = exportPrefs;

    function isDialogOpen() { return (!!overlay && !overlay.hidden) || (!!helpOverlay && !helpOverlay.hidden); }
    function escapeText(t) {
      return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function radio(name) {
      const el = overlay.querySelector('input[name="' + name + '"]:checked');
      return el ? el.value : '';
    }
    function setRadio(name, value) {
      const el = overlay.querySelector('input[name="' + name + '"][value="' + value + '"]');
      if (el) el.checked = true;
    }
    function chosenIndices() {
      const scope = radio('scope');
      if (scope === 'all') return blocks.map((_, i) => i);
      if (scope === 'selected') {
        return Array.from(picker.querySelectorAll('input:checked')).map((c) => Number(c.value));
      }
      return blocks.length ? [currentIndex] : [];
    }
    function updateExportUi() {
      const n = chosenIndices().length;
      const format = radio('format');
      const multi = n > 1;
      picker.hidden = radio('scope') !== 'selected';
      document.getElementById('acdl-export-layout').hidden = !multi;
      document.getElementById('acdl-export-pages').hidden =
        !(multi && format === 'pdf' && radio('layout') === 'single');
      let text;
      if (n === 0) {
        text = 'Select at least one block.';
      } else if (!multi || radio('layout') === 'single') {
        text = n + ' block' + (multi ? 's' : '') + ' \\u2192 one ' + format.toUpperCase() + ' file' +
          (multi && format === 'png' ? ' (stacked into one tall image)' :
           multi && radio('pages') === 'continuous' ? ' (one tall page)' :
           multi ? ' (' + n + ' pages)' : '');
      } else {
        text = n + ' blocks \\u2192 ' + n + ' ' + format.toUpperCase() + ' files in a folder you choose';
      }
      document.getElementById('acdl-export-note').textContent = text;
      exportGo.disabled = n === 0;
    }
    function openExport() {
      if (!overlay || blocks.length === 0) { showToast('Nothing to save', 'error'); return; }
      if (!picker.dataset.built) {
        picker.innerHTML = blocks.map((b, i) =>
          '<label><input type="checkbox" value="' + i + '" checked> ' +
          (i + 1) + '. ' + escapeText(b.dataset.label || '') + '</label>').join('');
        picker.dataset.built = '1';
      }
      setRadio('scope', exportPrefs.scope);
      setRadio('format', exportPrefs.format);
      setRadio('layout', exportPrefs.layout);
      setRadio('pages', exportPrefs.pages);
      overlay.hidden = false;
      updateExportUi();
      exportGo.focus();
    }
    function closeExport() { if (overlay) overlay.hidden = true; }
    function submitExport() {
      const indices = chosenIndices();
      if (indices.length === 0) return;
      const format = radio('format');
      const layout = indices.length > 1 ? radio('layout') : 'single';
      Object.assign(exportPrefs, { scope: radio('scope'), format, layout, pages: radio('pages') });
      saveState();
      closeExport();
      vscode.postMessage({ type: 'export', format, layout, pdfPages: radio('pages'), indices });
    }
    if (overlay) {
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeExport(); });
      overlay.addEventListener('change', updateExportUi);
      document.getElementById('acdl-export-cancel').addEventListener('click', closeExport);
      document.getElementById('acdl-export-x').addEventListener('click', closeExport);
      exportGo.addEventListener('click', submitExport);
    }

    // ---- Rasterizing --------------------------------------------------------
    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not load rendered SVG'));
        img.src = src;
      });
    }

    // Draw each self-contained SVG (fonts embedded) onto a canvas, like the
    // website visualizer does for its PDF export.
    async function rasterizeSvgs(jobs, scale) {
      const items = [];
      for (const job of jobs) {
        showToast('Rendering block ' + (job.index + 1) + ' of ' + blocks.length + '\\u2026');
        const blob = new Blob([job.svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        try {
          const img = await loadImage(url);
          const w = job.width, h = job.height;
          // Cap so very tall blocks stay within canvas limits.
          const s = Math.max(1, Math.min(scale || 4, 16000 / Math.max(w, h)));
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(w * s); canvas.height = Math.ceil(h * s);
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          items.push({ index: job.index, name: job.name, canvas, width: w, height: h });
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      return items;
    }

    // Stack several rasters into one tall image.
    function stitchItems(items) {
      const first = items[0].canvas;
      const scale = first.width / items[0].width;
      const GAP = Math.round(24 * scale);
      const w = Math.max(...items.map((it) => it.canvas.width));
      const h = items.reduce((sum, it) => sum + it.canvas.height, 0) + GAP * (items.length - 1);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      let y = 0;
      for (const it of items) { ctx.drawImage(it.canvas, 0, y); y += it.canvas.height + GAP; }
      return { index: items[0].index, name: 'all', canvas, width: w / scale, height: h / scale };
    }

    async function copyCanvas(canvas) {
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('Failed to render canvas to blob.');
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast('Image copied to clipboard');
        vscode.postMessage({ type: 'info', text: 'Image copied to clipboard.' });
        return;
      }
      throw new Error('Clipboard images are not available here; use Save image instead.');
    }

    async function handleRasterize(msg) {
      try {
        let items = await rasterizeSvgs(msg.jobs, msg.scale);
        if (msg.purpose === 'copy') {
          await copyCanvas(items[0].canvas);
          return;
        }
        if (msg.stitch && items.length > 1) items = [stitchItems(items)];
        vscode.postMessage({
          type: 'exportImages',
          items: items.map((it) => ({
            index: it.index, name: it.name, width: it.width, height: it.height,
            dataUrl: it.canvas.toDataURL('image/png'),
          })),
        });
        showToast('Choose where to save\\u2026');
      } catch (err) {
        const text = (err && err.message) || String(err);
        showToast((msg.purpose === 'copy' ? 'Copy' : 'Save') + ' failed: ' + text, 'error');
        if (msg.purpose === 'copy') vscode.postMessage({ type: 'error', text: 'Copy failed: ' + text });
        else vscode.postMessage({ type: 'exportImages', items: [], error: text });
      }
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg) return;
      switch (msg.type) {
        case 'zoomIn': zoomIn(); break;
        case 'zoomOut': zoomOut(); break;
        case 'resetZoom': resetZoom(); break;
        case 'navigate': navigate(msg.delta); break;
        case 'focusBlock': scrollToBlock(msg.index); break;
        case 'openExport': openExport(); break;
        case 'rasterizeSvgs': handleRasterize(msg); break;
      }
    });

    applyZoom();
  `;
}

function makeNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
