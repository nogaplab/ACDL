Prompt[@t]:{
    ForEach(i: 0...t-1){
        U: {obs.user_question[@i]}
        A: {resp.tool_reasoning[@i]}
        ForEach(tool: act.tools_used[@i].*){
            A: {act.tools_used[@i].tool}
            U: {obs.tool[@i].tool_result}
        }
    }
    U: {obs.user_question[@t]}
    S: {
        AVAILABLE_TOOLS
        INSTRUCTION // use tools until you can return an answer to the user question
    }

}