Prompt[@t]: {
    U: {
        TASK_DESCRIPTION(mem.max_total_steps)
        env.tool_desc
        env.in_context_example
        env.task_prompt
    } 

    // only the result of the previous turns or the new query in them
    ForEach(k: range(1, t-1)){
        U: env.user_input[@k]  // could be a new query/task, or a response to a solution(success or failure)
        A: resp.agent_answer[@k]
    }

    U: env.user_input[@t]

    // all the tool calls and reponses from the current turn
    ForEach(i: range(1, sys.steps[@t].len)){
        T: { 
            sys.tool_used[@t.i]
            sys.tool_used[@t.i].tool_response[@t.i]
        }
    }
}