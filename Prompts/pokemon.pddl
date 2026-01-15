Prompt[@t]:
    U: obs.image.HUD // heads up display, a screenshot with things like HP, coordinates of the character on the map and ID codes for items printed on it
    S: {
        INTRO // you are playing pokemon blue
        GOAL // beat the game
        CONVENTIONS  // vision to text translation conventions, general gameplay tips
    } 

    History {
        if t>1 {
            ForEach(i: range(t-min(t, 100), t-1)) {
                A: resp.action[@i]
            }
            
            if t>100 {
                Summary{
                    A: summarize(t-min(100+t,200),t-100)  // first argument is start and second is stop
                }

                Compressed_Summary{
                    if t > 1000 {
                        A: compress_summaries(Summary[@t]...Summary[@t-900]) // In jumps of 100 between summary times
                    }
                }    
            
                ForEach(i: range(max(100, t-900), t-100, 100)) // in jumps of 100 {  
                    A: prompt.Summary[@i]
                }
                
                if t>1000 {
                    ForEach(i: range(1000, t-100, 1000)) { 
                        A: prompt.Compressed_Summary[@i]
                    } 
                }
            }
        }
    }    

    if t%25==0 {
        //response from critique agents tracking of subgoals (primary, secondary, tertiary, contingency plants, preparation, exploration, team composition)
        A: critique_performance(prompt.History[@t]) // not sure what it gets, probably action history of some sort but they didnt say
    }

    U: obs.xml_map[@t] // unseen coordinates are not viewable until explored
    S: INSTRUCTION_TO_EXPLORE
    S: CHOOSE_ACTION // instructions to choose next action and how

   