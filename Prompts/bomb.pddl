Prompt[@t]: {
	S: {
        TASK INTRO    // scenario description and high level description of task
        MAP DESCRIPTION     // textual map description, connections between rooms
	    CHALLENGE     // what the agent needs to accomplish
	    TOOLS // tools to be used in the task
	    ACTIONS	// available actions in each round
	    COMMUNICATION INSTRUCTIONS	// explanation for how to communicate with the other 2 agents
	    OBSERVATION INSTRUCTIONS      // explanation of what will be given in each observation
	    BELIEF INTRO // telling the agent this section will inform it about its current beliefs
	    ROLE	// telling the agent which player it is playing as
	}
	U: {
        obs.round_number[@t]
	   	obs.team_score[@t]
	    obs.general[@t]
        ForEach(teammate: obs.teammates){
	 		mem.teammate_locations[@t].teammate
        }
        obs.room_connectivity
	    ForEach(bomb: obs.bombs) {
	     	obs.bomb_location[@t, bomb]
	     	obs.bomb_details[@t, bomb]
        }
	
		ForEach(agent: obs.agents) {
	    	obs.agent_inventory[@t, agent]
        }
        obs.available_actions[@t]
       }
}