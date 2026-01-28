Prompt[@t]: {
    U: {
        TASK_DESCRIPTION(mem.max_total_steps)
        obs.tool_desc
        obs.in_context_example
        obs.task_prompt
    } 
    
    // all the tool calls and reponses from all turns
    ForEach(i: range(1,t)) {
        U: obs.user_input[@i]
        T: { 
            ForEach(k: range(1, act.steps[i].len)){
                act.tool_used[@i.k]
                act.tool_response[@i.k]
            }
        }
        if i<t {
            A: resp.agent_answer[@i]
        }
    }  
}