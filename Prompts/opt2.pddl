Prompt[@t]: {
    U: {
        TASK_DESCRIPTION(mem.max_total_steps)
        env.tool_desc
        env.in_context_example
        env.task_prompt
    } 
    
    // all the tool calls and reponses from all turns
    ForEach(i: range(1,t)) {
        U: env.user_input[@i]
        T: { 
            ForEach(k: range(1, act.steps[i].len)){
                sys.tool_used[@i.k]
                sys.tool_used[@i.k].tool_response[@i.k]
            }
        }
        if i<t {
            A: resp.agent_answer[@i]
        }
    }  
}