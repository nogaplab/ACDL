Prompt[@t]:{
    ForEach(i: 0...t-1){
        U: {env.user_question[@i]}
        A: {resp.tool_reasoning[@i]}
        ForEach(k: 1...@i.range){
            A: {sys.tool_used[@i.k]}
            U: {sys.tool_used[@i.k].tool_result[@i.k]}
        }
    }
    U: {env.user_question[@t]}
    S: {
        AVAILABLE_TOOLS
        INSTRUCTION // use tools until you can return an answer to the user question
    }

}