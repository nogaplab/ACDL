Prompt[@0]: {
    U: {obs.user_question}
    S: {INSTRUCTION  // choose an action}
}

prompt[@1]: {
    U: {obs.user_question}
    A: {
        AVAILABLE_TOOLS
        resp.tool_reasoning[@0]
        act.tool[@0] or resp.tool[@0]
    }
    U: {obs.tool_resp[@0]}
    S: {INSTRUCTION   // choose an action}
}

Prompt[@t]: {
    U: {obs.user_question}
    ForEach(i:0...t-1) {
        A: {
            AVAILABLE_TOOLS
            resp.tool_reasoning[@i]
            act.tool[@i] or resp.tool[@i]
        }
        U: {obs.tool_resp[@i]}
    }
    S: {INSTRUCTION   // choose an action}
}