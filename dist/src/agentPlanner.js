import { prompt, promptTitle, promptBody, roleMessage, template, contextVar, pathDesc, func, loopBlockInsideRole, loopBlockOutsideRole, conditionalBlockInsideRole, switchBlockInsideRole, caseBlockInsideRole, defaultCaseBlockInsideRole, switchBlockOutsideRole, caseBlockOutsideRole, defaultCaseBlockOutsideRole, otherIndex, timeIndex, Iterable } from "./types/constructors.js";
export const examplePrompt3 = prompt({
    title: promptTitle({
        name: "AgentPlanner",
        indices: [timeIndex({ name: "t" })]
    }),
    body: promptBody({
        body: [
            //
            // ─────────────────────────────────────────────
            // ASSISTANT ROLE: STRATEGY BUILDING
            // ─────────────────────────────────────────────
            //
            roleMessage({
                role: "assistant",
                body: [
                    // Deep path with 4 levels
                    contextVar({
                        base: "obs",
                        indices: [timeIndex({ name: "t" })],
                        path: pathDesc({
                            base: "agents",
                            indices: [otherIndex({ name: "a" })],
                            next: pathDesc({
                                base: "state",
                                indices: [],
                                next: pathDesc({
                                    base: "tasks",
                                    indices: [otherIndex({ name: "k" })],
                                    next: pathDesc({
                                        base: "priority",
                                        indices: []
                                    })
                                })
                            })
                        })
                    }),
                    //
                    // SWITCH INSIDE ROLE
                    //
                    switchBlockInsideRole({
                        expression: "agent_status",
                        cases: [
                            caseBlockInsideRole({
                                match: "idle",
                                body: [
                                    template({ name: "PLAN_IDLE", arguments: [] })
                                ]
                            }),
                            caseBlockInsideRole({
                                match: "busy",
                                body: [
                                    // LOOP INSIDE CASE
                                    loopBlockInsideRole({
                                        index: otherIndex({ name: "task_i" }),
                                        iterable: Iterable({ value: "tasks_for_agent" }),
                                        body: [
                                            template({
                                                name: "PROCESS_TASK",
                                                arguments: [
                                                    contextVar({
                                                        base: "obs",
                                                        indices: [],
                                                        path: pathDesc({
                                                            base: "agents",
                                                            indices: [otherIndex({ name: "a" })],
                                                            next: pathDesc({
                                                                base: "in_progress",
                                                                indices: [otherIndex({ name: "task_i" })]
                                                            })
                                                        })
                                                    })
                                                ]
                                            })
                                        ]
                                    })
                                ]
                            })
                        ],
                        defaultCase: defaultCaseBlockInsideRole({
                            body: [
                                template({ name: "UNKNOWN_STATUS", arguments: [] })
                            ]
                        })
                    })
                ]
            }),
            //
            // ─────────────────────────────────────────────
            // OUTSIDE ROLE: GLOBAL PLANNING LOOP
            // ─────────────────────────────────────────────
            //
            loopBlockOutsideRole({
                index: otherIndex({ name: "idx" }),
                iterable: Iterable({ value: "all_agents" }),
                body: [
                    roleMessage({
                        role: "system",
                        body: [
                            conditionalBlockInsideRole({
                                Ifcondition: "agent_ready[idx] == true",
                                IfBody: [
                                    func({ name: "prepare_agent", arguments: [] })
                                ],
                                elseif: ["agent_ready[idx] == false"],
                                elseifBody: [
                                    [template({ name: "SKIP_AGENT", arguments: [] })]
                                ],
                                elseBody: [
                                    template({ name: "UNKNOWN_AGENT_STATE", arguments: [] })
                                ]
                            })
                        ]
                    })
                ]
            }),
            //
            // ─────────────────────────────────────────────
            // FINAL SWITCH OUTSIDE ROLE
            // ─────────────────────────────────────────────
            //
            switchBlockOutsideRole({
                expression: "run_mode",
                cases: [
                    caseBlockOutsideRole({
                        match: "simulate",
                        body: [
                            roleMessage({
                                role: "assistant",
                                body: [
                                    func({ name: "simulate_run", arguments: [] })
                                ]
                            })
                        ]
                    }),
                    caseBlockOutsideRole({
                        match: "execute",
                        body: [
                            roleMessage({
                                role: "assistant",
                                body: [
                                    func({ name: "execute_plan", arguments: [] })
                                ]
                            })
                        ]
                    })
                ],
                defaultCase: defaultCaseBlockOutsideRole({
                    body: [
                        roleMessage({
                            role: "assistant",
                            body: [
                                template({ name: "UNKNOWN_RUN_MODE", arguments: [] })
                            ]
                        })
                    ]
                })
            })
        ]
    })
});
