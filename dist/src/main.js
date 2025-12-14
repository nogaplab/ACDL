import { renderPrompt } from "./renderPrompt.js";
import { examplePrompt2 } from "./DialogueContextBuilder.js";
export function runRenderer() {
    console.log("Rendered Prompt:");
    console.log("=====================================");
    console.log();
    return renderPrompt(examplePrompt2);
}
