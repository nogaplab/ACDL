import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Parser } from "../../src/parser";
import { renderPrompts } from "../../src/renderPrompt";

type PreviewState = {
  panel: vscode.WebviewPanel;
  sourceUri: vscode.Uri;
  sourceCursorLine: number;
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

  const refresh = () => {
    if (!state) return;
    const editor = getSourceEditor();
    if (!editor) return;
    state.sourceCursorLine = editor.selection.active.line + 1; // 1-based
    updatePreview(state.panel, editor.document, state.sourceCursorLine, context);
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
            ],
          },
        );

        state = {
          panel,
          sourceUri: editor.document.uri,
          sourceCursorLine: editor.selection.active.line + 1,
        };

        panel.onDidDispose(() => {
          state = undefined;
          setPreviewVisible(false);
        });

        panel.onDidChangeViewState(() => {
          setPreviewVisible(panel.visible);
        });

        panel.webview.onDidReceiveMessage(async (msg) => {
          if (msg?.type === "saveImage") {
            await handleSaveImage(msg.dataUrl, state?.sourceUri);
          } else if (msg?.type === "copyImageFallback") {
            await handleCopyImageFallback(msg.dataUrl);
          } else if (msg?.type === "info") {
            vscode.window.setStatusBarMessage(`ACDL: ${msg.text}`, 2000);
          } else if (msg?.type === "error") {
            vscode.window.showErrorMessage(`ACDL preview: ${msg.text}`);
          }
        });
      }

      setPreviewVisible(true);
      refresh();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("acdl.copyPreviewImage", () => {
      state?.panel.webview.postMessage({ type: "copyImage" });
    }),
    vscode.commands.registerCommand("acdl.savePreviewImage", () => {
      state?.panel.webview.postMessage({ type: "saveImage" });
    }),
    vscode.commands.registerCommand("acdl.zoomInPreview", () => {
      state?.panel.webview.postMessage({ type: "zoomIn" });
    }),
    vscode.commands.registerCommand("acdl.zoomOutPreview", () => {
      state?.panel.webview.postMessage({ type: "zoomOut" });
    }),
    vscode.commands.registerCommand("acdl.resetZoomPreview", () => {
      state?.panel.webview.postMessage({ type: "resetZoom" });
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
      refresh();
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!state || !editor) return;
      if (editor.document.languageId !== "acdl") return;
      state.sourceUri = editor.document.uri;
      refresh();
    }),
  );
}

async function handleSaveImage(
  dataUrl: string,
  sourceUri: vscode.Uri | undefined,
) {
  if (!dataUrl) return;
  const defaultDir = sourceUri
    ? path.dirname(sourceUri.fsPath)
    : process.cwd();
  const defaultBase = sourceUri
    ? path.basename(sourceUri.fsPath, path.extname(sourceUri.fsPath))
    : "acdl-preview";
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(defaultDir, `${defaultBase}.png`)),
    filters: { Images: ["png"] },
  });
  if (!target) return;
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  await vscode.workspace.fs.writeFile(target, Buffer.from(base64, "base64"));
  vscode.window.showInformationMessage(`Saved preview to ${target.fsPath}`);
}

async function handleCopyImageFallback(dataUrl: string) {
  // The webview's navigator.clipboard.write isn't always permitted; as a
  // fallback we write a PNG to a temp file and put its path on the clipboard.
  if (!dataUrl) return;
  const tmp = path.join(
    require("os").tmpdir(),
    `acdl-preview-${Date.now()}.png`,
  );
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(tmp, Buffer.from(base64, "base64"));
  await vscode.env.clipboard.writeText(tmp);
  vscode.window.showInformationMessage(
    `Image saved to ${tmp} and path copied to clipboard.`,
  );
}

function updatePreview(
  panel: vscode.WebviewPanel,
  doc: vscode.TextDocument,
  cursorLine: number,
  context: vscode.ExtensionContext,
) {
  const text = doc.getText();
  let bodyHtml: string;
  let statusHtml = "";

  try {
    const ranges = new Parser(text).parseFileWithRanges();
    if (ranges.length === 0) {
      throw new Error("No prompts or fragments found in file");
    }

    const renderable = ranges.filter((r) => r.block.kind !== "comment-block");
    if (renderable.length === 0) {
      throw new Error("No prompts or fragments found in file");
    }

    let selected = renderable.find(
      (r) => cursorLine >= r.startLine && cursorLine <= r.endLine,
    );
    if (!selected) {
      // Pick the closest block by line distance (e.g. cursor in whitespace).
      selected = renderable.reduce((best, r) => {
        const dist =
          cursorLine < r.startLine
            ? r.startLine - cursorLine
            : cursorLine - r.endLine;
        const bestDist =
          cursorLine < best.startLine
            ? best.startLine - cursorLine
            : cursorLine - best.endLine;
        return dist < bestDist ? r : best;
      });
    }

    bodyHtml = renderPrompts([selected.block]);

    if (renderable.length > 1) {
      const idx = renderable.indexOf(selected) + 1;
      statusHtml = `<div class="acdl-preview-status">Showing ${idx} of ${renderable.length} (lines ${selected.startLine}–${selected.endLine}). Move cursor to switch.</div>`;
    }
  } catch (err: any) {
    bodyHtml = `<div style="color: #cf222e; padding: 20px; font-family: monospace; white-space: pre-wrap;">${escapeHtml(err.message)}</div>`;
  }

  const cssContent = loadPreviewCss(context);
  const html2canvasUri = panel.webview.asWebviewUri(
    vscode.Uri.file(
      path.join(context.extensionPath, "media", "html2canvas.min.js"),
    ),
  );
  const cspSource = panel.webview.cspSource;
  const nonce = makeNonce();

  panel.webview.html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data: blob:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${cssContent}</style>
<style>
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body { display: flex; flex-direction: column; min-height: 100vh;
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }

  .acdl-preview-toolbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px;
    background: #f6f8fa; border-bottom: 1px solid #d0d7de;
  }
  .acdl-action {
    display: inline-flex; align-items: center; gap: 8px;
    background: #ffffff; color: #1f2328;
    border: 1px solid #d0d7de; border-radius: 6px;
    padding: 7px 12px; cursor: pointer;
    font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    transition: background 0.1s ease, border-color 0.1s ease;
  }
  .acdl-action:hover { background: #f3f4f6; border-color: #9aa4af; }
  .acdl-action:active { background: #e6e8eb; }
  .acdl-action.primary {
    background: #1f6feb; color: #ffffff; border-color: #1f6feb;
  }
  .acdl-action.primary:hover { background: #1158c7; border-color: #1158c7; }
  .acdl-action svg { width: 16px; height: 16px; flex: 0 0 16px; }
  .acdl-action .kbd {
    font: 500 11px/1 "JetBrains Mono", "SF Mono", monospace;
    padding: 3px 6px; border-radius: 4px;
    background: rgba(0,0,0,0.08); color: inherit; opacity: 0.85;
  }
  .acdl-action.primary .kbd { background: rgba(255,255,255,0.2); }

  .acdl-zoom {
    display: inline-flex; align-items: center; gap: 2px;
    background: #ffffff; border: 1px solid #d0d7de; border-radius: 6px;
    padding: 2px;
  }
  .acdl-zoom button {
    background: transparent; border: none; cursor: pointer;
    padding: 5px 9px; font: 600 14px/1 inherit; color: #1f2328;
    border-radius: 4px;
  }
  .acdl-zoom button:hover { background: #f3f4f6; }
  .acdl-zoom .zoom-label {
    min-width: 44px; text-align: center;
    font: 500 12px/1 "JetBrains Mono", "SF Mono", monospace;
    color: #57606a;
  }
  .acdl-toolbar-spacer { flex: 1; }

  .acdl-preview-status {
    padding: 6px 14px; background: #fff8c5; border-bottom: 1px solid #e6c200;
    font: 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #57534e;
  }
  .acdl-preview-scroll {
    flex: 1; overflow: auto; padding: 20px;
  }
  .acdl-preview-zoom-host {
    transform-origin: 0 0;
    display: inline-block;
    min-width: 100%;
  }

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
</style>
</head>
<body>
  <div class="acdl-preview-toolbar">
    <button id="acdl-copy" class="acdl-action primary" title="Copy preview as PNG to clipboard">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 1.75A.75.75 0 0 1 5.75 1h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 5 1.75Zm-1.5 0c0-.13.01-.26.04-.39A2.25 2.25 0 0 0 1.5 3.5v10A2.5 2.5 0 0 0 4 16h8a2.5 2.5 0 0 0 2.5-2.5v-10a2.25 2.25 0 0 0-2.04-2.14c.03.13.04.26.04.39A2.25 2.25 0 0 1 10.25 4h-4.5A2.25 2.25 0 0 1 3.5 1.75Z"/></svg>
      Copy image
      <span class="kbd" id="acdl-copy-kbd">Ctrl+Alt+C</span>
    </button>
    <button id="acdl-save" class="acdl-action" title="Save preview as PNG file">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 12a.75.75 0 0 0 .75-.75V4.56l1.97 1.97a.75.75 0 1 0 1.06-1.06l-3.25-3.25a.75.75 0 0 0-1.06 0L4.22 5.47a.75.75 0 0 0 1.06 1.06L7.25 4.56v6.69c0 .41.34.75.75.75ZM2.75 9.5a.75.75 0 0 1 .75.75v3a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-3a.75.75 0 0 1 1.5 0v3A2 2 0 0 1 12 15.25H4A2 2 0 0 1 2 13.25v-3a.75.75 0 0 1 .75-.75Z"/></svg>
      Save image…
      <span class="kbd" id="acdl-save-kbd">Ctrl+Alt+S</span>
    </button>
    <span class="acdl-toolbar-spacer"></span>
    <div class="acdl-zoom" role="group" aria-label="Zoom">
      <button id="acdl-zoom-out" title="Zoom out">−</button>
      <span class="zoom-label" id="acdl-zoom-label">100%</span>
      <button id="acdl-zoom-in" title="Zoom in">+</button>
      <button id="acdl-zoom-reset" title="Reset zoom to 100%" style="padding-left:8px;padding-right:8px;font-size:11px;font-weight:500;">Reset</button>
    </div>
  </div>
  <div id="acdl-toast" class="acdl-toast" role="status" aria-live="polite"></div>
  ${statusHtml}
  <div class="acdl-preview-scroll" id="acdl-scroll">
    <div class="acdl-preview-zoom-host" id="acdl-zoom-host">
      <div id="acdl-capture" class="compact">${bodyHtml}</div>
    </div>
  </div>
  <script nonce="${nonce}" src="${html2canvasUri}"></script>
  <script nonce="${nonce}">
${getWebviewScript()}
  </script>
</body>
</html>`;
}

function getWebviewScript(): string {
  return `
    const vscode = acquireVsCodeApi();
    const prev = vscode.getState() || { zoom: 1 };
    const host = document.getElementById('acdl-zoom-host');
    const label = document.getElementById('acdl-zoom-label');
    const capture = document.getElementById('acdl-capture');
    const toastEl = document.getElementById('acdl-toast');

    // Show OS-appropriate shortcut hints on the action buttons.
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');
    const mod = isMac ? '⌘' : 'Ctrl';
    const alt = isMac ? '⌥' : 'Alt';
    document.getElementById('acdl-copy-kbd').textContent = mod + '+' + alt + '+C';
    document.getElementById('acdl-save-kbd').textContent = mod + '+' + alt + '+S';

    let toastTimer;
    function showToast(text, kind) {
      toastEl.textContent = text;
      toastEl.classList.toggle('error', kind === 'error');
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
    }

    let zoom = prev.zoom || 1;
    const MIN_ZOOM = 0.25, MAX_ZOOM = 4;

    function applyZoom() {
      host.style.transform = 'scale(' + zoom + ')';
      label.textContent = Math.round(zoom * 100) + '%';
      vscode.setState({ zoom });
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
    document.getElementById('acdl-zoom-reset').addEventListener('click', resetZoom);
    document.getElementById('acdl-copy').addEventListener('click', copyImage);
    document.getElementById('acdl-save').addEventListener('click', saveImage);

    window.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || !e.altKey) return;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn(); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomOut(); }
      else if (e.key === '0') { e.preventDefault(); resetZoom(); }
      else if (e.key === 'c' || e.key === 'C') { e.preventDefault(); copyImage(); }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); saveImage(); }
    });

    // Mouse wheel zoom with Ctrl/Cmd
    document.getElementById('acdl-scroll').addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn(); else zoomOut();
    }, { passive: false });

    async function renderCanvas() {
      // Render at zoom = 1 regardless of current preview zoom.
      const prevTransform = host.style.transform;
      host.style.transform = 'scale(1)';
      try {
        // eslint-disable-next-line no-undef
        const canvas = await html2canvas(capture, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
          logging: false,
        });
        return canvas;
      } finally {
        host.style.transform = prevTransform;
      }
    }

    async function copyImage() {
      showToast('Rendering image…');
      try {
        const canvas = await renderCanvas();
        const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
        if (!blob) throw new Error('Failed to render canvas to blob.');
        if (navigator.clipboard && window.ClipboardItem) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob }),
            ]);
            showToast('Image copied to clipboard');
            vscode.postMessage({ type: 'info', text: 'Image copied to clipboard.' });
            return;
          } catch (err) {
            // fall through to fallback
          }
        }
        // Fallback: send dataURL to extension host to write file + put path on clipboard.
        const dataUrl = canvas.toDataURL('image/png');
        vscode.postMessage({ type: 'copyImageFallback', dataUrl });
        showToast('Copied PNG path (clipboard blocked image data)');
      } catch (err) {
        showToast('Copy failed: ' + (err && err.message || err), 'error');
        vscode.postMessage({ type: 'error', text: 'Copy failed: ' + (err && err.message || err) });
      }
    }

    async function saveImage() {
      showToast('Rendering image…');
      try {
        const canvas = await renderCanvas();
        const dataUrl = canvas.toDataURL('image/png');
        vscode.postMessage({ type: 'saveImage', dataUrl });
        showToast('Choose a location to save…');
      } catch (err) {
        showToast('Save failed: ' + (err && err.message || err), 'error');
        vscode.postMessage({ type: 'error', text: 'Save failed: ' + (err && err.message || err) });
      }
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg) return;
      switch (msg.type) {
        case 'zoomIn': zoomIn(); break;
        case 'zoomOut': zoomOut(); break;
        case 'resetZoom': resetZoom(); break;
        case 'copyImage': copyImage(); break;
        case 'saveImage': saveImage(); break;
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
