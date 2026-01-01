Prompt[@t]:
	S: {TASK INTRO    // scenario description and high level description of task}
	S: {MAP DESCRIPTION     // textual map description, connections between rooms}
	S: {CHALLENGE     // what the agent needs to accomplish}
	S: {TOOLS // tools to be used in the task}
	S: {ACTIONS	// available actions in each round}
	S: {COMMUNICATION INSTRUCTIONS	// explanation for how to communicate with the other 2 agents}
	S: {OBSERVATION INSTRUCTIONS      // explanation of what will be given in each observation}
	S: {BELIEF INTRO // telling the agent this section will inform it about its current beliefs}
	S: {ROLE	// telling the agent which player it is playing as}
	U: {obs.round_number[@t]}
	U: {obs.team_score[@t]}
	U: {obs.general[@t]}
    U: {ForEach(teammate: obs.teammates):
		M.teammate_locations[@t].teammate
	}
    U: {obs.room_connectivity}
	U: {ForEach(bomb: obs.bombs):
		obs.bomb_location[@t, bomb]
		obs.bomb_details[@t, bomb]
	}
	U: {ForEach(agent: obs.agents):
		obs.agent_inventory[@t, agent]
	}
	U: {obs.available_actions[@t]}
