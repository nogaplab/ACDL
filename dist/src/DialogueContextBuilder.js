import { prompt, promptTitle, promptBody, roleMessage, template, contextVar, pathDesc, func, loopBlockInsideRole, loopBlockOutsideRole, conditionalBlockInsideRole, conditionalBlockOutsideRole, switchBlockOutsideRole, caseBlockOutsideRole, defaultCaseBlockOutsideRole, otherIndex, timeIndex, Iterable } from "./types/constructors.js";
export const examplePrompt2 = prompt({
    title: promptTitle({
        name: "DialogueContextBuilder",
        indices: [
            timeIndex({ name: "t" })
        ]
    }),
    body: promptBody({
        body: [
            //
            // ─────────────────────────────────────────────
            // USER ROLE MESSAGE
            // ─────────────────────────────────────────────
            //
            roleMessage({
                role: "user",
                body: [
                    // A multi-segment path with several index layers
                    contextVar({
                        base: "obs",
                        indices: [],
                        path: pathDesc({
                            base: "dialogue_history",
                            indices: [timeIndex({ name: "t" })],
                            next: pathDesc({
                                base: "turns",
                                indices: [otherIndex({ name: "i" })],
                                next: pathDesc({
                                    base: "speaker",
                                    indices: [],
                                    next: pathDesc({
                                        base: "profile",
                                        indices: [otherIndex({ name: "k" })]
                                    })
                                })
                            })
                        })
                    }),
                    // Conditional inside a role with a loop inside the IF branch
                    conditionalBlockInsideRole({
                        Ifcondition: "obs.state == 'awaiting_input'",
                        IfBody: [
                            func({
                                name: "prepare_for_input",
                                arguments: []
                            }),
                            // LOOP INSIDE IF
                            loopBlockInsideRole({
                                index: otherIndex({ name: "j" }),
                                iterable: Iterable({ value: "1...3" }),
                                body: [
                                    template({
                                        name: "ECHO_PART",
                                        arguments: [
                                            contextVar({
                                                base: "obs",
                                                indices: [],
                                                path: pathDesc({
                                                    base: "pending_chunks",
                                                    indices: [otherIndex({ name: "j" })]
                                                })
                                            })
                                        ]
                                    })
                                ]
                            })
                        ],
                        elseif: ["obs.state == 'clarify'"],
                        elseifBody: [
                            [
                                template({
                                    name: "REQUEST_CLARIFICATION",
                                    arguments: []
                                })
                            ]
                        ],
                        elseBody: [
                            template({
                                name: "UNKNOWN_STATE",
                                arguments: []
                            })
                        ]
                    })
                ]
            }),
            //
            // ─────────────────────────────────────────────
            // LOOP OUTSIDE ROLE
            // ─────────────────────────────────────────────
            //
            loopBlockOutsideRole({
                index: otherIndex({ name: "idx" }),
                iterable: Iterable({ value: "active_sessions" }),
                body: [
                    // NESTED CONDITIONAL + ROLE BLOCK
                    conditionalBlockOutsideRole({
                        Ifcondition: "session_type == 'multi_turn'",
                        IfBody: [
                            roleMessage({
                                role: "assistant",
                                body: [
                                    template({
                                        name: "HANDLE_MULTI_TURN",
                                        arguments: [
                                            contextVar({
                                                base: "obs",
                                                indices: [],
                                                path: pathDesc({
                                                    base: "sessions",
                                                    indices: [otherIndex({ name: "idx" })]
                                                })
                                            })
                                        ]
                                    })
                                ]
                            })
                        ],
                        elseif: ["session_type == 'one_turn'"],
                        elseifBody: [
                            [
                                roleMessage({
                                    role: "assistant",
                                    body: [
                                        func({
                                            name: "handle_single_turn",
                                            arguments: []
                                        })
                                    ]
                                })
                            ]
                        ],
                        elseBody: [
                            roleMessage({
                                role: "assistant",
                                body: [
                                    template({ name: "UNKNOWN_SESSION_TYPE", arguments: [] })
                                ]
                            })
                        ]
                    })
                ]
            }),
            //
            // ─────────────────────────────────────────────
            // SWITCH OUTSIDE ROLE
            // ─────────────────────────────────────────────
            //
            switchBlockOutsideRole({
                expression: "environment_mode",
                cases: [
                    caseBlockOutsideRole({
                        match: "debug",
                        body: [
                            roleMessage({
                                role: "system",
                                body: [
                                    template({
                                        name: "DEBUG_INFO",
                                        arguments: [
                                            contextVar({
                                                base: "obs",
                                                indices: [],
                                                path: pathDesc({
                                                    base: "system",
                                                    indices: [],
                                                    next: pathDesc({
                                                        base: "debug_trace",
                                                        indices: []
                                                    })
                                                })
                                            })
                                        ]
                                    })
                                ]
                            })
                        ]
                    }),
                    caseBlockOutsideRole({
                        match: "release",
                        body: [
                            roleMessage({
                                role: "system",
                                body: [
                                    func({
                                        name: "optimize_for_release",
                                        arguments: []
                                    })
                                ]
                            })
                        ]
                    })
                ],
                defaultCase: defaultCaseBlockOutsideRole({
                    body: [
                        roleMessage({
                            role: "system",
                            body: [
                                template({ name: "FALLBACK_MODE", arguments: [] })
                            ]
                        })
                    ]
                })
            })
        ]
    })
});
