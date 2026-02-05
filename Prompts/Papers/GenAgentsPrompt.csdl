Prompt[@t, agent_name]: {
	S: {sys.agent_desc}
	U: {env.datetime[@t]}
	U: {sys.status[@t]}
	U: {env.general[@t]}
	A: {get_context_summary(@t, sys.agent_name123, sys.topic_)}
	ForEach(i: t - k … t -1)   {  
		U: {env.agent_utterance[@i]}
		A: {sys.my_utterance[@i]}
	}
	ForEach(agent_name: agent_names){
		If env.in_dialog(agent_name) {
			U: {get_dialog_history(sys.agent_name)}
		}
	}
	S: {QUESTION // How would Eddy respond to John?}
}
