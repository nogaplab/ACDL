Prompt[@t]: {
    A: {mem.summary[@t-k]}
    ForEach(@i: @t-k…@t-1) {
     	U: {obs.user_text[@i]}
    	A: {resp.llm_text[@i]}
    }
    If t%k=0 {
        A: {extract_knowledge(mem.history[@t], mem.knowledge[@t-1])}
    }
    ElseIf t<1 {
        S: {ERROR // print error message}
    }
    ElseIf obs.fridge[@2]=3 {
        S: {CRAZY // what a surprise}
    }
    Else {
        A: {mem.knowledge[@t-1]}
    }
    U: {obs.user_text[@t]} 
    S: {INSTRUCTIONS     // Instructions about how to return an answer}
}
