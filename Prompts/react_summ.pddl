Prompt[@t]: {
    U: {obs.user_question}
    S: {
        SUMMARY_INTRO // here is a summary of the history
        summarize_hist(@t-k)
    }
    ForEach(i: t-k...t-1) {
        A: {
            AVAILABLE_TOOLS
            resp.tool_reasoning[@i]
            act.tool[@i]
        }
        U: {obs.tool_resp[@i]}
    }
    S: {INSTRUCTION // choose an action or declare done}
}