import { examplePrompt } from "./example";
import { renderPrompt } from "./renderPrompt";
import { examplePrompt3 } from "./agentPlanner";
import { examplePrompt2 } from "./DialogueContextBuilder";


export function runRenderer() {
    console.log("Rendered Prompt:");
    console.log("=====================================");   
    console.log()
  return renderPrompt(examplePrompt2);
}
