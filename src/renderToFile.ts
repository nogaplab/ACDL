import { EXAMPLES } from "./examples";
import { renderPrompt } from "./renderPrompt";
import { wrapInHtmlDocument } from "./wrapInHtmlDocument";

const args = Bun.argv.slice(2);
const outputPath = args[0];

let examples = ["example1"];

for (let i = 1; i < args.length; i++) {
  if (args[i] === "--examples") {
    examples = args[i + 1]?.split(",") ?? examples;
    i++;
  }
}

const fragment = examples
  .map(name => {
    const prompt = EXAMPLES[name];
    return prompt
      ? renderPrompt(prompt)
      : `<div class="error-block">Unknown example: ${name}</div>`;
  })
  .join("");

const fullHtml = wrapInHtmlDocument(fragment, "Rendered Prompts");

await Bun.write(outputPath, fullHtml);
