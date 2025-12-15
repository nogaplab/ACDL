import {
  prompt, promptTitle, promptBody,
  roleMessage, template, contextVar, pathDesc, func,
  loopBlockInsideRole, loopBlockOutsideRole,
  conditionalBlockInsideRole, Iterable,
  timeIndex, otherIndex,
} from "../types/constructors";

export const dialogReasoningPrompt = prompt({
  title: promptTitle({
    name: "DialogReasoningPrompt",
    indices: [
      timeIndex({ name: "t" }),
      otherIndex({ name: "agent_name" })
    ]
  }),

  body: promptBody({
    body: [

      //
      // ─────────────────────────────────────────────
      // SYSTEM
      // ─────────────────────────────────────────────
      //
      roleMessage({
        role: "system",
        body: [
          contextVar({
            base: "mem",
            indices: [],
            path: pathDesc({
              base: "agent_desc",
              indices: []
            })
          })
        ]
      }),

      //
      // ─────────────────────────────────────────────
      // USER (CURRENT STATE)
      // ─────────────────────────────────────────────
      //
      roleMessage({
        role: "user",
        body: [

          // obs.datetime[@t]
          contextVar({
            base: "obs",
            indices: [],
            path: pathDesc({
              base: "datetime",
              indices: [ timeIndex({ name: "t" }) ]
            })
          }),

          // mem.status[@t]
          contextVar({
            base: "mem",
            indices: [],
            path: pathDesc({
              base: "status",
              indices: [ timeIndex({ name: "t" }) ]
            })
          }),

          // obs.general[@t]
          contextVar({
            base: "obs",
            indices: [],
            path: pathDesc({
              base: "general",
              indices: [ timeIndex({ name: "t" }) ]
            })
          })
        ]
      }),

      //
      // ─────────────────────────────────────────────
      // ASSISTANT (CONTEXT SUMMARY)
      // ─────────────────────────────────────────────
      //
      roleMessage({
        role: "assistant",
        body: [
          func({
            name: "get_context_summary",
            arguments: [
              timeIndex({ name: "t" }),
              contextVar({ base: "mem", path: pathDesc({base: "agent_name", indices: []}), indices: [] }),
              func({ name: "get_topic", arguments: [] })
            ]
          })
        ]
      }),

      //
      // ─────────────────────────────────────────────
      // LOOP OVER RECENT TURNS: t-k … t-1
      // ─────────────────────────────────────────────
      //
      loopBlockOutsideRole({
        index: otherIndex({ name: "i" }),
        iterable: Iterable({ value: "t-k…t-1" }),
        body: [

          // [U] obs.agent_utterance[@i]
          roleMessage({
            role: "user",
            body: [
              contextVar({
                base: "obs",
                indices: [],
                path: pathDesc({
                  base: "agent_utterance",
                  indices: [ timeIndex({ name: "i" }) ]
                })
              })
            ]
          }),

          // [A] act.my_utterance[@i]
          roleMessage({
            role: "assistant",
            body: [
              contextVar({
                base: "act",
                indices: [],
                path: pathDesc({
                  base: "my_utterance",
                  indices: [ timeIndex({ name: "i" }) ]
                })
              })
            ]
          })
        ]
      }),

      //
      // ─────────────────────────────────────────────
      // LOOP OVER AGENTS WITH CONDITIONAL
      // ─────────────────────────────────────────────
      //
      loopBlockOutsideRole({
        index: otherIndex({ name: "agent_name" }),
        iterable: Iterable({ value: "agent_names" }),
        body: [
          roleMessage({
            role: "user",
            body: [
              conditionalBlockInsideRole({
                Ifcondition: "obs.in_dialog(agent_name)",
                IfBody: [
                  func({
                    name: "get_dialog_history",
                    arguments: [
                      contextVar({ base: "mem", path: pathDesc({base:"agent_name", indices: [] }), indices: []})
                ]})],
                elseif: [""],
                elseifBody: [],
                elseBody: []
              })
            ]
          })
        ]
      }),

      //
      // ─────────────────────────────────────────────
      // FINAL QUESTION
      // ─────────────────────────────────────────────
      //
      roleMessage({
        role: "system",
        body: [
          template({
            name: "QUESTION",
            arguments: [],
            comment: "How would Eddy respond to John?"
          })
        ]
      })
    ]
  })
});
