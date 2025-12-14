// src/examples/index.ts

import type { Prompt } from "../types/types";

import { examplePrompt as example1 } from "./example";
import { examplePrompt3 as example2 } from "./agentPlanner";
import { examplePrompt2 as example3 } from "./DialogueContextBuilder";

export const EXAMPLES: Record<string, Prompt> = {
  example1,
  example2,
  example3,
};
