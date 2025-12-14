import { prompt, promptTitle, promptBody, roleMessage, template, contextVar, pathDesc, index } from "./types/constructors";
const p = prompt({
    title: promptTitle({
        name: "myPrompt",
        indices: [],
    }),
    body: promptBody({
        body: [
            roleMessage({
                role: "system",
                body: [
                    template({
                        name: "TASK_INTRO",
                        arguments: [],
                        comment: "explanation about the task"
                    })
                ]
            }),
            roleMessage({
                role: "user",
                body: [
                    contextVar({
                        base: "obs",
                        path: pathDesc({
                            base: "round_number",
                            indices: [index("time-index", "t")]
                        }),
                        indices: []
                    })
                ]
            }),
        ]
    })
});
