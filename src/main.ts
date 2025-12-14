import { examplePrompt } from "./example";
import { renderPrompt } from "./renderPrompt";
import { examplePrompt3 } from "./agentPlanner";
import { examplePrompt2 } from "./DialogueContextBuilder";


export function runRenderer() {
  return renderPrompt(examplePrompt2);
}
