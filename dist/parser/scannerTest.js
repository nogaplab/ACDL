import { Scanner } from "./scanner.js";
function scanAll(input) {
    const s = new Scanner(input);
    const tokens = [];
    while (true) {
        const tok = s.nextToken();
        tokens.push(tok);
        if (tok.type === "EOF")
            break;
    }
    return tokens;
}
console.log(scanAll(`
Prompt[@t, agent]:
S: {mem.agent_desc}
`));
console.log("testing keywords vs identifiers:");
console.log(scanAll("obscene obsidian obs.datetime"));
console.log("testing range operators:");
console.log(scanAll("t-k...t-1"));
console.log(scanAll("t - k … t - 1"));
console.log("testing strings:");
console.log(scanAll(`Case "train"`));
console.log(scanAll(`"hello \\\"world\\\""`));
console.log("testing comments:");
console.log(scanAll(`S: {QUESTION // why?}`));
let input = `Prompt[@t, agent_name]:
S: {mem.agent_desc}
U: {obs.datetime[@t]}
U: {mem.status[@t]}
U: {obs.general[@t]}
A: {get_context_summary(@t, agent_name, topic)}
ForEach(i: t - k … t -1)   {  
U: {obs.agent_utterance[@i]}
	A: {act.my_utterance[@i]}
}
ForEach(agent_name: agent_names){
	If obs.in_dialog(agent_name):{
		U: {get_dialog_history(agent_name)}
	}
}
S: {QUESTION // How would Eddy respond to John?}
`;
console.dir(scanAll(input), { depth: null, maxArrayLength: null });
//console.log("error cases:");
//console.log(scanAll(`"bad \\q escape"`));
//console.log(scanAll(`"unterminated string`));
