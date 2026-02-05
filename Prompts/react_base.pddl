ReactBase[@t]: {
    S: TASK_DESC  // you are an assistant who's job is...
    S: AVAILABLE_TOOLS
    U: {env.user_question}
    ForEach(i: range(1,t-1)) {
        A: resp.tool_reasoning[@t-1]
        T: {
            sys.tool_used[@i]
            sys.tool_used[@i].tool_response[@i]
        }
    }
    S: INSTRUCTION   // choose an action, use ReACT
}