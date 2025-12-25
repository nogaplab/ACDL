import { Parser } from "./parser";
import { renderPrompt } from "./renderPrompt";
import { enableCollapsibleBlocks } from "./ui";

export function initFileHandlers() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("pddl-upload") as HTMLInputElement;
  const output = document.getElementById("output");
  
  // New Elements
  const editor = document.getElementById("pddl-editor") as HTMLTextAreaElement;
  const renderBtn = document.getElementById("render-btn");

  if (!dropZone || !fileInput || !output || !editor || !renderBtn) return;

  // --- 1. Handle Live Editor Button ---
  renderBtn.addEventListener("click", () => {
    processAndRender(editor.value, output);
  });

  // --- 2. Handle Browse Button ---
  fileInput.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) validateAndProcess(file, output, editor);
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
    if (file) validateAndProcess(file, output, editor);
  });
}

/**
 * Validates the file and reads its content into the editor before rendering.
 */
function validateAndProcess(file: File, output: HTMLElement, editor: HTMLTextAreaElement) {
  if (file.name.toLowerCase().endsWith('.pddl')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      // Populate editor so the user can see/edit the code they just uploaded
      editor.value = text;
      processAndRender(text, output);
    };
    reader.readAsText(file);
  } else {
    alert(`Invalid file: ${file.name}. Please use a .pddl file.`);
  }
}

/**
 * The core logic: takes raw text, runs it through the Scanner/Parser,
 * and updates the DOM with the visualization or an error message.
 */
function processAndRender(text: string, output: HTMLElement) {
  if (!text.trim()) {
    output.innerHTML = `<div class="info-msg">Editor is empty. Write or drop a .pddl file to begin.</div>`;
    return;
  }

  try {
    // Parser validates logic, keywords (mem, obs, etc.), and nesting
    const parser = new Parser(text);
    const ast = parser.parsePrompt();
    
    output.innerHTML = renderPrompt(ast);
    enableCollapsibleBlocks();
  } catch (err: any) {
    // Captures errors like "Expected IDENT, got KEYWORD" with line/col info
    output.innerHTML = `<div class="error-msg"><strong>Parsing Error:</strong> ${err.message}</div>`;
  }
}