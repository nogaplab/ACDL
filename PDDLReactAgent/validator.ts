import { Parser } from '../src/parser';

const content = process.argv[2]; // Get content from command line arg

try {
    const parser = new Parser(content);
    parser.parsePrompt();
    console.log("Valid!");
} catch (e) {
    if (e instanceof Error) {
        console.error(e.message);
    } else {
        console.error(String(e));
    }
    process.exit(1);
}
