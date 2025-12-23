import {
  prompt, promptTitle, promptBody,
  roleMessage, template, contextVar, pathDesc, func,
  loopBlockInsideRole, loopBlockOutsideRole,
  conditionalBlockInsideRole, switchBlockOutsideRole,
  caseBlockOutsideRole, defaultCaseBlockOutsideRole, Iterable,
  otherIndex, timeIndex,
} from "../constructors";


// --- DUMMY PROMPT EXAMPLE ---

export const examplePrompt = prompt({
  title: promptTitle({
    name: "MyPrompt",
    indices: [
      timeIndex({name:"t"}),
      otherIndex({name:"agent"})
    ]
  }),

  body: promptBody({
    body: [

      //
      // ─────────────────────────────────────────────
      // ROLE MESSAGE (SYSTEM)
      // ─────────────────────────────────────────────
      //
      roleMessage({
        role: "system",
        body: [

          // TEMPLATE with valid argument (no raw string)
          template({
            name: "INTRO",
            arguments: []
          }),

          // CONTEXT VAR: obs.user_question[@t]
          contextVar({
            base: "obs",
            indices: [],
            path: pathDesc({
              base: "user_question",
              indices: [ timeIndex({name:"t"}) ]
            })
          }),

          //
          // IF / ELSEIF / ELSE INSIDE ROLE
          //
          conditionalBlockInsideRole({
            Ifcondition: "obs.user_question[@t] == 'hello'",
            IfBody: [
              func({
                name: "reply_hi",
                arguments: []
              })
            ],
            elseif: ["obs.user_question[@t] == 'bye'"],
            elseifBody: [
              [
                func({
                  name: "reply_bye",
                  arguments: []
                })
              ]
            ],
            elseBody: [
              template({
                name: "UNKNOWN_INPUT",
                arguments: []
              })
            ]
          }),

          //
          // LOOP INSIDE ROLE
          //
          loopBlockInsideRole({
            index: otherIndex({name:"i"}),
            iterable: Iterable({value: "1...3"}),
            body: [
              template({
                name: "STEP",
                arguments: [
                  contextVar({
                    base: "obs",
                    indices: [],
                    path: pathDesc({
                      base: "index_value",
                      indices: [ otherIndex({name: "i"}) ]
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
      // LOOP OUTSIDE ROLE
      // ─────────────────────────────────────────────
      //
      loopBlockOutsideRole({
        index: otherIndex({name:"u"}),
        iterable: Iterable({value:"agents"}),
        body: [
          roleMessage({
            role: "assistant",
            body: [
              template({
                name: "GREET_AGENT",
                arguments: [
                  contextVar({
                    base: "obs",
                    indices: [],
                    path: pathDesc({
                      base: "current_agent",
                      indices: [ otherIndex({name:"u"}) ]
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
      // SWITCH OUTSIDE ROLE
      // ─────────────────────────────────────────────
      //
      switchBlockOutsideRole({
        expression: "mode",
        cases: [
          caseBlockOutsideRole({
            match: "train",
            body: [
              roleMessage({
                role: "assistant",
                body: [
                  template({ name: "TRAINING_MODE", arguments: [], comment: "Explain training mode" })
                ]
              })
            ]
          }),

          caseBlockOutsideRole({
            match: "eval",
            body: [
              roleMessage({
                role: "assistant",
                body: [
                  template({ name: "EVAL_MODE_EXPLANATION", arguments: [], comment: "Explain evaluation mode" })
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
                template({ name: "DEFAULT_MODE", arguments: [], comment: "Explain default mode" })
              ]
            })
          ]
        })
      })
    ]
  })
});
