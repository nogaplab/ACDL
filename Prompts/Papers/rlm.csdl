Prompt[@t]: {
    // self.messages
    S: {
        AVAILABLE_TOOLS // context variable, llm query(subquery), python execution via REPL blocks
        INTERACTION_RULES   // inspect context, iterate, dont answer early, how to return final answer
    }
     
    ForEach(i: range(1,t)) {
        // if used tools, adds a list of tool responses to history
        If mem.code_blocks is not None {
            ForEach(k: range(1,act.code_block[@i].len)){
                U: {
                    sys.code_block[@i.k] 
                    sys.code_block[@i.k].response 
                }
            }
        }
        
        Else {
            // if didnt use tools, adds the llm response to the history
            A: LLM_RESP
        }
    }

    // next action prompt
    If sys.final_answer[@t] {
        U: PROVIDE_FINAL_ANSWER
    }
    ElseIf @t == 1 {
        U: {
            USE_REPL        // this is your first interaction, there is no action history yet so use the repl env to view your context
            REPL_INSTRUCTIONS(query)    // use the repl instructions to find the answer to the query. look for context var, or query sublm
        }
    }
    Else {
        U: {
            HIST_EXPLANATION    // the history before is your previous interactions with the REPL env
            REPL(sys.query)     // use the REPL to answer the query
        }
    }

}

SubPrompt[@t]: {
    // gets a prompt written by the rootlm in the repl env
}


```repl llm_query(skkksdhgoi)