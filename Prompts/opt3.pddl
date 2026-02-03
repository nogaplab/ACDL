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
        ForEach(k: range(1, act.tools_used[i].len)){
            T: {
                sys.tool_used[@i.k]
                sys.tool_used[@i.k].tool_response[@i.k]
            }
        }
        if i<t {
            A: resp.agent_answer[@i]
        }
    }  
}