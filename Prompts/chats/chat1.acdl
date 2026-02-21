Chat1[@t]: {
    S: INSTRUCTIONS 
    U: {
        ForEach(i: range(1,t-1)) {
            env.user_input[@i]
            resp.llm_answer[@i]
        }
    }

    U: env.user_input[@t]
}