Prompt[@t]:{
    ForEach(i: 0...t-1){
        U: {obs.user_question[@i]}
        A: {resp.tool_reasoning[@i]}
        ForEach(k: 1...@i.range){
            A: {act.tools_used[@i.k]}
            U: {obs.tools_used[@i.k].tool_result}
        }
    }
    U: {obs.user_question[@t]}
    S: {
        AVAILABLE_TOOLS
        INSTRUCTION // use tools until you can return an answer to the user question
    }

}