import { Parser } from "./parser";
import { renderPrompt } from "./renderPrompt";
import { enableCollapsibleBlocks } from "./ui";

export function initFileHandlers() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("pddl-upload") as HTMLInputElement;
  const output = document.getElementById("output");

  if (!dropZone || !fileInput || !output) return;

  // --- 1. Handle Browse Button ---
  fileInput.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) validateAndProcess(file, output);
  });

  // --- 2. Handle Drag and Drop ---
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

function validateAndProcess(file: File, output: HTMLElement) {
  // Use toLowerCase to ensure my_prompt.pddl matches
  if (file.name.toLowerCase().endsWith('.pddl')) {
    renderPddlFile(file, output);
  } else {
    alert(`Invalid file: ${file.name}. Please use a .pddl file.`);
  }
}

function renderPddlFile(file: File, output: HTMLElement) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result as string;
    try {
      // Parser strictly validates Top-Level vs Inside-Role scope
      const parser = new Parser(text);
      const ast = parser.parsePrompt();
      
      output.innerHTML = renderPrompt(ast);
      enableCollapsibleBlocks();
    } catch (err: any) {
      // Renders syntax error message if nesting rules are broken
      output.innerHTML = `<div class="error-msg"><strong>Parsing Error:</strong> ${err.message}</div>`;
    }
  };
  reader.readAsText(file);
}