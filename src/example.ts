import {Prompt, prompt, promptTitle, promptBody, roleMessage} from "./types/types_old";

const p: Prompt = prompt({
  title: promptTitle({
    name: "myPrompt",
    indices: [],
  }),
  body: promptBody({
    body: [
      roleMessage({ role: "system", body: ["this is your propmpt"] }),
      roleMessage({ role: "user", body: ["another prompt"] }),
    ]
  })
});