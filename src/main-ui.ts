import { EditorView } from "@codemirror/view";
import { createEditor } from "./editor/setup.js";
import {
  BlockRange,
  BLOCKS_CSS,
  DEFAULT_WRAP_WIDTH,
  clampWrapWidth,
  escapeHtml,
  listRenderableBlocks,
  pageFontFaceCss,
  renderBlockSvg,
  renderBlocksHtml,
  svgSize,
} from "./render-blocks";

// The visualizer renders every block with the SVG renderer, exactly like the
// VSCode extension's preview pane, so the page shows what PNG / PDF export
// produce. Re-export what the page's export script needs.
export { renderBlockSvg, svgSize };

let editorView: EditorView;
let wrapWidth = DEFAULT_WRAP_WIDTH;
let renderedBlocks: BlockRange[] = [];

/**
 * Returns the CodeMirror editor view instance.
 */
export function getEditorView(): EditorView | null {
  return editorView || null;
}

/** Blocks shown by the last render, in file order. */
export function getRenderedBlocks(): BlockRange[] {
  return renderedBlocks;
}

export function getWrapWidth(): number {
  return wrapWidth;
}

/** Change the wrap width (200–1000 px) and re-render at it. */
export function setWrapWidth(width: number): void {
  const w = clampWrapWidth(width);
  if (w === wrapWidth) return;
  wrapWidth = w;
  doRender();
}

/**
 * Renders the current editor content.
 */
export function doRender(): void {
  const output = document.getElementById("output");
  if (output && editorView) {
    processAndRender(editorView.state.doc.toString(), output);
  }
}

/**
 * Install the page-level styles the inlined block SVGs rely on: the block
 * layout and one @font-face pair for JetBrains Mono. The fonts come from the
 * base64 the build injected (window.__ACDL_FONTS__) or, in the dev server,
 * from /fonts.
 */
export function installBlockStyles(): void {
  if (document.getElementById("acdl-block-styles")) return;
  const fonts = (window as any).__ACDL_FONTS__ as { regular?: string; bold?: string } | undefined;
  const regular = fonts?.regular
    ? `data:font/truetype;base64,${fonts.regular}`
    : "/fonts/JetBrainsMono-Regular.ttf";
  const bold = fonts?.bold
    ? `data:font/truetype;base64,${fonts.bold}`
    : "/fonts/JetBrainsMono-Bold.ttf";
  const style = document.createElement("style");
  style.id = "acdl-block-styles";
  style.textContent = pageFontFaceCss(regular, bold) + BLOCKS_CSS;
  document.head.appendChild(style);
}

export function initFileHandlers() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("acdl-upload") as HTMLInputElement;
  const output = document.getElementById("output");
  const editorContainer = document.getElementById("acdl-editor-container");
  const renderBtn = document.getElementById("render-btn");

  if (!dropZone || !fileInput || !output || !editorContainer || !renderBtn) return;

  installBlockStyles();

  // Initialize CodeMirror editor
  editorView = createEditor(editorContainer, "");

  // --- 1. Handle Live Editor Button ---
  renderBtn.addEventListener("click", () => {
    processAndRender(editorView.state.doc.toString(), output);
  });

  // --- 2. Handle Browse Button ---
  fileInput.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) validateAndProcess(file, output);
  });

  // --- 3. Handle Drag and Drop ---
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  dropZone.addEventListener("dragover", () => dropZone.classList.add("hover"));
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("hover"));

  dropZone.addEventListener("drop", (e: DragEvent) => {
    dropZone.classList.remove("hover");
    const file = e.dataTransfer?.files[0];
    if (file) validateAndProcess(file, output);
  });
}

/**
 * Validates the file and reads its content into the editor before rendering.
 */
function validateAndProcess(file: File, output: HTMLElement) {
  if (file.name.toLowerCase().endsWith('.acdl')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      // Populate editor so the user can see/edit the code they just uploaded
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: text },
      });
      processAndRender(text, output);
    };
    reader.readAsText(file);
  } else {
    alert(`Invalid file: ${file.name}. Please use a .acdl file.`);
  }
}

/**
 * The core logic: takes raw text, parses it into blocks, renders each block
 * with the SVG renderer at the wrap width, and updates the DOM with the
 * stacked blocks or an error message.
 */
function processAndRender(text: string, output: HTMLElement) {
  if (!text.trim()) {
    renderedBlocks = [];
    output.innerHTML = `<div class="info-msg">Editor is empty. Write or drop a .acdl file to begin.</div>`;
    return;
  }

  try {
    const blocks = listRenderableBlocks(text);
    if (blocks.length === 0) {
      throw new Error("No prompts or fragments found in file");
    }
    renderedBlocks = blocks;
    output.innerHTML = renderBlocksHtml(blocks, wrapWidth);
  } catch (err: any) {
    renderedBlocks = [];
    output.innerHTML = `<div class="error-msg"><strong>Parsing Error:</strong> ${escapeHtml(err.message || String(err))}</div>`;
  }
}
