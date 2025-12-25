Prompt[@t]: {
	U: {obs.user_question[@t]}
	ForEach(tool : act.tool_call[@t].*) {
		A: {act.tool_call.tool}
	}
	S: {INSTRUCTIONS // some instructions on what to do next}
}
