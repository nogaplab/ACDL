import {
  prompt, promptTitle, promptBody,
  roleMessage, template, contextVar, pathDesc,
  loopBlockInsideRole, Iterable,
  timeIndex, otherIndex,
} from "../types/constructors";

export const teamGamePrompt = prompt({
  title: promptTitle({
    name: "TeamGamePrompt",
    indices: [
      timeIndex({ name: "t" })
    ]
  }),

  body: promptBody({
    body: [

      //
      // ─────────────────────────────────────────────
      // SYSTEM ROLE
      // ─────────────────────────────────────────────
      //
      roleMessage({
        role: "system",
        body: [
          template({ name: "TASK_INTRO", arguments: [] }),
          template({ name: "MAP_DESCRIPTION", arguments: [] }),
          template({ name: "CHALLENGE", arguments: [] }),
          template({ name: "TOOLS", arguments: [] }),
          template({ name: "ACTIONS", arguments: [] }),
          template({ name: "COMMUNICATION_INSTRUCTIONS", arguments: [] }),
          template({ name: "OBSERVATION_INSTRUCTIONS", arguments: [] }),
          template({ name: "BELIEF_INTRO", arguments: [] }),
          template({ name: "ROLE", arguments: [] }),
        ]
      }),

      //
      // ─────────────────────────────────────────────
      // USER ROLE
      // ─────────────────────────────────────────────
      //
      roleMessage({
        role: "user",
        body: [

          // obs.round_number[t]
          contextVar({
            base: "obs",
            indices: [],
            path: pathDesc({
              base: "round_number",
              indices: [ timeIndex({ name: "t" }) ]
            })
          }),

          // obs.team_score[t]
          contextVar({
            base: "obs",
            indices: [],
            path: pathDesc({
              base: "team_score",
              indices: [ timeIndex({ name: "t" }) ]
            })
          }),

          // obs.general[t]
          contextVar({
            base: "obs",
            indices: [],
            path: pathDesc({
              base: "general",
              indices: [ timeIndex({ name: "t" }) ]
            })
          }),

          //
          // foreach (teammate: obs.teammates)
          //
          loopBlockInsideRole({
            index: otherIndex({ name: "teammate" }),
            iterable: Iterable({ value: "obs.teammates" }),
            body: [
              contextVar({
                base: "mem",
                indices: [],
                path: pathDesc({
                  base: "teammate_location",
                  indices: [
                    timeIndex({ name: "t" }),
                    otherIndex({ name: "teammate" })
                  ]
                })
              })
            ]
          }),

          // obs.room_connectivity
          contextVar({
            base: "obs",
            indices: [],
            path: pathDesc({
              base: "room_connectivity",
              indices: []
            })
          }),

          //
          // foreach (bomb: bombs)
          //
          loopBlockInsideRole({
            index: otherIndex({ name: "bomb" }),
            iterable: Iterable({ value: "bombs" }),
            body: [
              contextVar({
                base: "obs",
                indices: [],
                path: pathDesc({
                  base: "bomb_location",
                  indices: [
                    timeIndex({ name: "t" }),
                    otherIndex({ name: "bomb" })
                  ]
                })
              }),
              contextVar({
                base: "obs",
                indices: [],
                path: pathDesc({
                  base: "bomb_details",
                  indices: [
                    timeIndex({ name: "t" }),
                    otherIndex({ name: "bomb" })
                  ]
                })
              })
            ]
          }),

          //
          // foreach (agent: agents)
          //
          loopBlockInsideRole({
            index: otherIndex({ name: "agent" }),
            iterable: Iterable({ value: "agents" }),
            body: [
              contextVar({
                base: "obs",
                indices: [],
                path: pathDesc({
                  base: "agent_inventory",
                  indices: [
                    timeIndex({ name: "t" }),
                    otherIndex({ name: "agent" })
                  ]
                })
              })
            ]
          }),

          // obs.available_actions[t]
          contextVar({
            base: "obs",
            indices: [],
            path: pathDesc({
              base: "available_actions",
              indices: [ timeIndex({ name: "t" }) ]
            })
          })
        ]
      })
    ]
  })
});
