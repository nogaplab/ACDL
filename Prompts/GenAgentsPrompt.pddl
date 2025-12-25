Prompt[@t, agent_name]: {
	S: {mem.agent_desc}
	U: {obs.datetime[@t]}
	U: {mem.status[@t]}
	U: {obs.general[@t]}
	A: {get_context_summary(@t, mem.agent_name123, mem.topic_)}
	ForEach(i: t - k … t -1)   {  
		U: {obs.agent_utterance[@i]}
		A: {act.my_utterance[@i]}
	}
	ForEach(agent_name: agent_names){
		If obs.in_dialog(agent_name) {
			U: {get_dialog_history(mem.agent_name)}
		}
	}
	S: {QUESTION // How would Eddy respond to John?}
}
