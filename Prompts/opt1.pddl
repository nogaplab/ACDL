Prompt[@t]: {
    U: {
        TASK_DESCRIPTION(mem.max_total_steps)
        obs.tool_desc
        obs.in_context_example
        obs.task_prompt
    } 

    // only the result of the previous turns or the new query in them
    ForEach(k: range(1, t-1)){
        U: obs.user_input[@k]  // could be a new query/task, or a response to a solution(success or failure)
        A: resp.agent_answer[@k]
    }

    U: obs.user_input[@t]

    // all the tool calls and reponses from the current turn
    ForEach(i: range(1, act.steps[@t].len)){
        T: { 
            act.tool_used[@t.i]
            act.tool_response[@t.i]
        }
    }
}