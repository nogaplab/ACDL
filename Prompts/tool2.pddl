Prompt[@t]:{
    S: {
        AVAILABLE_TOOLS   // calendar_lookup, document_scan, flight_booking, hotel_booking
        INSTRUCTIONS    // you are an assistant whos job is to book a holiday trip...
    }
    
    U: {
        env.user_input
        env.user_document
        env.calendar
    }

    If t>1 {
        ForEach(i: range(1, t-1)) {
            If sys.tool_used[@i] == get_clarification {
                U: env.user_input[@i]
            }
            
            Else {
                A: resp.tool_reasoning[@i]
                A: env.tool_response[@i]  
            }   
        }
    }

    S: REACT_INSTRUCTIONS   // choose a tool, ask for calrifications or report done, but write down your reasoning first
}