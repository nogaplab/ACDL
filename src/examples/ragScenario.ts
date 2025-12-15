import {
  prompt, promptTitle, promptBody,
  roleMessage, template, contextVar, pathDesc, func,
  loopBlockInsideRole, loopBlockOutsideRole,
  conditionalBlockInsideRole, Iterable,
  timeIndex, otherIndex,
} from "../types/constructors";

export const ragRepairPrompt = prompt({
  title: promptTitle({
    name: "RAGRepairPrompt",
    indices: [
      timeIndex({ name: "t" })
    ]
  }),

  body: promptBody({
    body: [

      //
      // ─────────────────────────────────────────────
      // SYSTEM — ROLE DESCRIPTION
      // ─────────────────────────────────────────────
      //
      roleMessage({
        role: "system",
        body: [
          template({
            name: "ROLE_DESCRIPTION",
            arguments: [],
            comment: "you are an assistant who’s job is…"
          })
        ]
      }),

      //
      // ─────────────────────────────────────────────
      // PAST INTERACTIONS: i = 1 … t-1
      // ─────────────────────────────────────────────
      //
      loopBlockOutsideRole({
        index: otherIndex({ name: "i" }),
        iterable: Iterable({ value: "1…t-1" }),
        body: [

          // U: obs.user_input[@i]
          roleMessage({
            role: "user",
            body: [
              contextVar({
                base: "obs",
                indices: [],
                path: pathDesc({
                  base: "user_input",
                  indices: [ otherIndex({ name: "i" }) ]
                })
              })
            ]
          }),

          // U: foreach k in mem.rag_resp[@i]
          roleMessage({
            role: "user",
            body: [
              loopBlockInsideRole({
                index: otherIndex({ name: "k" }),
                iterable: Iterable({ value: "1…(mem.rag_resp[@i]).len()" }),
                body: [
                  contextVar({
                    base: "mem",
                    indices: [],
                    path: pathDesc({
                      base: "rag_resp",
                      indices: [
                        otherIndex({ name: "i" }),
                        otherIndex({ name: "k" })
                      ]
                    })
                  })
                ]
              })
            ]
          }),

          // A: resp.llm_text[@i]
          roleMessage({
            role: "assistant",
            body: [
              contextVar({
                base: "resp",
                indices: [],
                path: pathDesc({
                  base: "llm_text",
                  indices: [ otherIndex({ name: "i" }) ]
                })
              })
            ]
          })
        ]
      }),

      //
      // ─────────────────────────────────────────────
      // CONDITIONAL LOGIC (CURRENT TURN)
      // ─────────────────────────────────────────────
      //
      roleMessage({
        role: "system",
        body: [

          conditionalBlockInsideRole({
            Ifcondition: "resp.llm_text[@t-1].len() > num",

            // IF: too long
            IfBody: [
              template({
                name: "LENGTH_INSTRUCTIONS",
                arguments: [],
                comment: "be more concise, previous reply was too long"
              })
            ],

            // ELSE IF: wrong instructions
            elseif: [
              "parse_bad(obs.user_input[@t])",
              "parse_more(obs.user_input[@t])"
            ],

            elseifBody: [

              // WRONG INSTRUCTIONS
              [
                template({
                  name: "WRONG_INSTRUCTIONS",
                  arguments: [],
                  comment: "previous reply was wrong, fix it"
                })
              ],

              // NEED MORE / IMPROVE RAG
              [
                contextVar({
                  base: "obs",
                  indices: [],
                  path: pathDesc({
                    base: "user_input",
                    indices: [ timeIndex({ name: "t" }) ]
                  })
                }),

                loopBlockInsideRole({
                  index: otherIndex({ name: "i" }),
                  iterable: Iterable({
                    value: "1…improve_rag_response(obs.user_input[@t]).len()"
                  }),
                  body: [
                    func({
                      name: "improve_rag_response",
                      arguments: [
                        contextVar({
                          base: "obs",
                          indices: [],
                          path: pathDesc({
                            base: "user_input",
                            indices: [ timeIndex({ name: "t" }) ]
                          })
                        })],
                        indices: [otherIndex({ name: "i" })]
                    })
                  ]
                })
              ]
            ],

            // ELSE: use mem.rag_resp[@t]
            elseBody: [
              loopBlockInsideRole({
                index: otherIndex({ name: "i" }),
                iterable: Iterable({ value: "1…mem.rag_resp[@t].len()" }),
                body: [
                  contextVar({
                    base: "mem",
                    indices: [],
                    path: pathDesc({
                      base: "rag_resp",
                      indices: [
                        timeIndex({ name: "t" }),
                        otherIndex({ name: "i" })
                      ]
                    })
                  })
                ]
              })
            ]
          })
        ]
      }),

      //
      // ─────────────────────────────────────────────
      // FINAL INSTRUCTIONS
      // ─────────────────────────────────────────────
      //
      roleMessage({
        role: "system",
        body: [
          template({
            name: "FINAL_INSTRUCTIONS",
            arguments: [],
            comment: "what to do next"
          })
        ]
      })
    ]
  })
});
