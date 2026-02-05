Prompt[@t]: {
	S: {
        TASK INTRO    // scenario description and high level description of task
        MAP DESCRIPTION     // textual map description, connections between rooms
	    CHALLENGE     // what the agent needs to accomplish
	    TOOLS // tools to be used in the task
	    ACTIONS	// available actions in each round
	    COMMUNICATION INSTRUCTIONS	// explanation for how to communicate with the other 2 agents
	    envERVATION INSTRUCTIONS      // explanation of what will be given in each envervation
	    BELIEF INTRO // telling the agent this section will inform it about its current beliefs
	    ROLE	// telling the agent which player it is playing as
	}
	U: {
        env.round_number[@t]
	   	env.team_score[@t]
	    env.general[@t]
        ForEach(teammate: env.teammates){
	 		sys.teammate_locations[@t].teammate
        }
        env.room_connectivity
	    ForEach(bomb: env.bombs) {
	     	env.bomb_location[@t, bomb]
	     	env.bomb_details[@t, bomb]
        }
	
		ForEach(agent: env.agents) {
	    	env.agent_inventory[@t, agent]
        }
        env.available_actions[@t]
       }
}