Prompt[@t]:{
    S: {
        AVAILABLE_TOOLS   // calendar_lookup, document_scan, flight_booking, hotel_booking
        INSTRUCTIONS    // you are an assistant whos job is to book a holiday trip...
    }
    
    U: {
        obs.user_input
        obs.user_document
        obs.calendar
    }

    If t>1 {
        ForEach(i: range(1, t-1)) {
            If act.tool[@i] == get_clarification {
                U: obs.user_input[@i]
            }
            
            Else {
                A: resp.tool_reasoning[@i]
                A: obs.tool_response[@i]  
            }   
        }
    }

    S: REACT_INSTRUCTIONS   // choose a tool, ask for calrifications or report done, but write down your reasoning first
}