Prompt[t]: {
    S: {ROLE DESCRIPTION // you are an assistant who’s job is…}
    ForEach(i: 1…t-1) {
	    U: {obs.user_input[@i]}
        U: {ForEach(k: 1…(mem.RAG_resp).len()){
            mem.RAG_resp[@i,k]}}
        A: {resp.LLM_text[@i]}
	}
    Switch obs.user_input[@t] {
	    Case "bad" {
		    U: {ForEach(i: 1…improve_RAG_response(obs.user_input[@t]).len()){
                improve_RAG_response(obs.user_input[@t])[i]}
            }
            S: {INSTRUCTIONS // not good enough, get better results}
		}
	    Default { 
            U: {ForEach(i: 1…(mem.RAG_resp).len()) { 
			        mem.RAG_resp[@t,i]}
            }
        }
    }
}
