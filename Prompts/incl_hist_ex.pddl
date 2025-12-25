Prompt[@t]: {
	S: {INTRO // explanation of task and introducing history section}
	ForEach(i: 1…t-1) {
		U: {obs.user_question[@i]}
		ForEach(tool : act.tool_call[@i].*) {
			A: {act.tool_call[@i].tool}
		}
	}
	U: {obs.user_question[@t]}
	ForEach(tool : act.tool_call[@t].*) {
		A: {act.tool_call.tool}
	}
	S: {INSTRUCTIONS // some instructions on what to do next}
}