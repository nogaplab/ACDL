Prompt[@t]:{
    U: {
        env.user_input[@0]
        env.user_document[@0]
        env.calendar[@0]
    }
    
    S: {
        AVAILABLE_TOOLS   // calendar_lookup, document_scan, flight_booking, hotel_booking
        INSTRUCTIONS    // you are an assistant whos job is to book a holiday trip...
    }

    If t>1 {
        ForEach(i: range(1, t-1)) {
            If sys.tool_used[@i] == get_clarification {
                U: env.user_input[@i]
            }
            
            Else {
                A: sys.tool_used[@i]
                A: resp.tool_reasoning[@i]
                A: sys.tool_used[@i].tool_response[@i] 
            }   
        }
    }
    S: REACT_INSTRUCTIONS   // choose a tool, ask for calrifications or report done, but write down your reasoning first
}