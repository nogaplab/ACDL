Prompt[@t]: {
    U: obs.image.hud // heads up display, a screenshot with things like HP, coordinates of the character on the map and ID codes for items printed on it
    S: {
        INTRO // you are playing pokemon blue
        GOAL // beat the game
        CONVENTIONS  // vision to text translation conventions, general gameplay tips
    } 

    History {
        If @t>1 {
            ForEach(i: range(@t-min(@t, 100), @t-1)) {
                A: resp.action[@i]
            }
            
            If @t>100 {
                Summary{
                    A: summarize(range(@t-min(100+@t,200),@t-100)) 
                }

                
                If @t>1000 {
                    Compressed_Summary{ 
                        A: compress_summaries(range(prompt.Summary[@t], prompt.Summary[@t-900], 100)) // In jumps of 100 between summary times
                    }
                }
                 
            
                ForEach(i: range(max(100, @t-900), @t-100, 100)) {  
                    A: prompt.Summary[@i]
                }
                
                If @t>1000 {
                    ForEach(i: range(1000, @t-100, 1000)) { 
                        A: prompt.Compressed_Summary[@i]
                    } 
                }
            }
        }
    }    

    If @t%25==0 {
        //response from critique agents tracking of subgoals (primary, secondary, tertiary, contingency plants, preparation, exploration, team composition)
        A: critique_performance(prompt.History[@t]) // not sure what it gets, probably action history of some sort but they didnt say
    }

    U: obs.xml_map[@t] // unseen coordinates are not viewable until explored
    S: INSTRUCTION_TO_EXPLORE
    S: CHOOSE_ACTION // instructions to choose next action and how
}
   