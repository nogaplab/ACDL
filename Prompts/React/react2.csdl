React2[@t]: {
    S: TASK_DESC  // you are an assistant who's job is...
    U: env.user_question
    ForEach(i: range(1,t-1)) {
        S: {
            INSTRUCTIONS // choose an action, use ReACT
            AVAILABLE_TOOLS 
        }
        A: resp.tool_reaoning[@t-1]
        T: {  
               sys.tool_used[@i]
               sys.tool_used[@i].tool_response[@i]
        }
    }
    S: {
        INSTRUCTIONS   // choose an action, use ReACT
        AVAILABLE_TOOLS
    }
}