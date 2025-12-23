import * as fs from 'fs';
import { Parser } from "./parser/parser";
import { renderPrompt } from "./renderPrompt";

const inputFile = process.argv[2]; // e.g., node cli.js my_prompt.pddl

if (inputFile) {
    try {
        const input = fs.readFileSync(inputFile, 'utf-8');
        const parser = new Parser(input);
        const ast = parser.parsePrompt();
        const html = renderPrompt(ast);
        
        fs.writeFileSync('output.html', html);
        console.log("File rendered to output.html");
    } catch (e: any) {
        console.error(`❌ Validation Failed: ${e.message}`);
    }
}