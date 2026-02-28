import { EditorView } from "@codemirror/view";
import { Parser } from "./parser";
import { renderPrompts } from "./renderPrompt";
import { enableCollapsibleBlocks } from "./ui";
import { createEditor } from "./editor/setup.js";

let editorView: EditorView;

export function initFileHandlers() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("acdl-upload") as HTMLInputElement;
  const output = document.getElementById("output");
  const editorContainer = document.getElementById("acdl-editor-container");
  const renderBtn = document.getElementById("render-btn");

  if (!dropZone || !fileInput || !output || !editorContainer || !renderBtn) return;

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
 * The core logic: takes raw text, runs it through the Scanner/Parser,
 * and updates the DOM with the visualization or an error message.
 */
function processAndRender(text: string, output: HTMLElement) {
  if (!text.trim()) {
    output.innerHTML = `<div class="info-msg">Editor is empty. Write or drop a .acdl file to begin.</div>`;
    return;
  }

  try {
    const parser = new Parser(text);
    const prompts = parser.parseFile();

    output.innerHTML = renderPrompts(prompts);
    enableCollapsibleBlocks();
    detectWrappedComments(output);
  } catch (err: any) {
    output.innerHTML = `<div class="error-msg"><strong>Parsing Error:</strong> ${err.message}</div>`;
  }
}

/**
 * Detect comments that wrap to multiple lines and add a class for top alignment.
 * Single-line comments stay centered, multi-line comments align to top.
 */
function detectWrappedComments(container: HTMLElement) {
  const blockWithComments = container.querySelectorAll('.block-with-comment');
  blockWithComments.forEach(el => {
    const comment = el.querySelector('.inline-comment, .comment') as HTMLElement;
    if (comment) {
      // Check if comment height indicates wrapping (more than ~1.5 lines)
      const lineHeight = parseFloat(getComputedStyle(comment).lineHeight) || 16;
      if (comment.offsetHeight > lineHeight * 1.5) {
        el.classList.add('comment-wrapped');
      } else {
        el.classList.remove('comment-wrapped');
      }
    }
  });
}
