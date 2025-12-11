import { Index, MyString } from "./types2";    

export type Observation = {
    kind: "observation";
    value: MyString;
};

export type Response = {
    kind: "response";
    value: MyString;
};

export type Action = {
    kind: "action";
    value: MyString;
    indexes: Array<Index>;
}

export type Memory = {
    kind: "memory";
    content: MyString;
    indexes: Array<Index>;
}

export type PromptExtraction = {
    kind: "prompt-extraction";
    promptName: string;
    content: MyString;
    indexes: Array<Index>;
}

export type ContextItem = Observation | Response | Action | Memory | PromptExtraction;

