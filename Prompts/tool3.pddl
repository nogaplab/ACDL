Prompt[@t]:{
    U: {
        obs.user_input[@0]
        obs.user_document[@0]
        obs.calendar[@0]
    }
    
    S: {
        AVAILABLE_TOOLS   // calendar_lookup, document_scan, flight_booking, hotel_booking
        INSTRUCTIONS    // you are an assistant whos job is to book a holiday trip...
    }

    if i>1 {
        ForEach(i: range(1, t-1)) {
            if act.tool[@i] == get_clarification {
                U: obs.user_input[@i]
            }
            
            else {
                A: act.tool[@i]
                A: resp.tool_reasoning[@i]
                A: obs.tool_response[@i]  not sure what role this should be
            }   
        }
    }
    S: REACT_INSTRUCTIONS   // choose a tool, ask for calrifications or report done, but write down your reasoning first
}