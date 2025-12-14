// src/main.ts
import { renderPrompt } from "./renderPrompt";
import { enableCollapsibleBlocks } from "./ui";
import { EXAMPLES } from "./examples";

/**
 * Render selected examples into the page.
 */
export function runRenderer(exampleNames: string[] = ["example1"]): void {
  const output = document.getElementById("output");
  if (!output) return;

  const html = exampleNames
    .map((name) => {
      const prompt = EXAMPLES[name];
      if (!prompt) {
        return `<div class="error-block">Unknown example: ${name}</div>`;
      }
      return renderPrompt(prompt);
    })
    .join("");

  output.innerHTML = html;
  enableCollapsibleBlocks();
}
