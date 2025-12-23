// src/examples/index.ts

import type { Prompt } from "../types";
import { examplePrompt as example1 } from "./example";
import { examplePrompt3 as example2 } from "./agentPlanner";
import { examplePrompt2 as example3 } from "./DialogueContextBuilder";
import { dialogReasoningPrompt as genAgentsPrompt } from "./genAgents";
import { teamGamePrompt as bombPrompt } from "./bombPaper";
import { ragRepairPrompt as ragPrompt } from "./ragScenario";

export type PromptExample = {
    raw: string;
    parsed: Prompt;
}

export const EXAMPLES: Record<string, Prompt> = {
  example1,
  example2,
  example3,
  genAgentsPrompt,
  bombPrompt,
  ragPrompt
};
