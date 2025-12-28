// ReAct with Nested Tools
// Tools can call other tools, creating a hierarchical execution tree
// Context shows parent-child relationships and nested results

Prompt[@0]: {
    U: {obs.user_question}
    S: {AVAILABLE_TOOLS}
    S: {INSTRUCTION // Choose a tool. Tools may call other tools as needed.}
}

Prompt[@1]: {
    U: {obs.user_question}
    S: {AVAILABLE_TOOLS}
    
    // First tool and its potential subtool calls
    A: {resp.tool_reasoning[@0]}
    A: {act.tool[@0]}
    
    // If this tool called subtool(s)
    If act.subtools[@0] > 0 {
        ForEach(sub_id: act.subtools[@0].*) {
            A: {act.subtool[sub_id].name}
            A: {act.subtool[sub_id].input}
            U: {obs.subtool_result[sub_id]}
        }
    }
    
    U: {obs.tool_result[@0]}
    S: {INSTRUCTION // Continue or provide final answer}
}

Prompt[@t]: {
    U: {obs.user_question}
    S: {AVAILABLE_TOOLS}
    
    // Show all previous tool executions with their nested structure
    ForEach(i: 0...t-1) {
        A: {resp.tool_reasoning[@i]}
        A: {act.tool[@i].name}
        A: {act.tool[@i].input}
        
        // Show nested subtool executions if any
        If act.subtools[@i] > 0 {
            ForEach(sub_id: act.subtools[@i].*) {
                A: {SUBTOOL_MARKER // Indented to show hierarchy}
                A: {act.subtool[@i][sub_id].name}
                A: {act.subtool[@i][sub_id].input}
                U: {obs.subtool_result[@i][sub_id]}
            }
        }
        
        U: {obs.tool_result[@i]}
    }
    
    S: {INSTRUCTION // Continue or provide final answer}
}
