React1[@t]: {
    S: AVAILABLE_TOOLS
    U: {env.user_question}
    ForEach(i: range(1,t-1)) {
        A: {
            resp.tool_reasoning[@i]
            sys.tool_used[@i]
        }
        U: {env.tool_resp[@i]}
    }
    S: {INSTRUCTION   // choose an action}
}