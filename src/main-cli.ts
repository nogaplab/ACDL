// src/main-cli.ts
import * as fs from 'fs';
import * as path from 'path';
import { Parser } from './parser';
import { renderPrompt } from './renderPrompt';

async function main() {
    const rawArgs = process.argv.slice(2);
    
    // Simple Flag Parsing
    let style = "default";
    const styleIdx = rawArgs.indexOf('--style');
    if (styleIdx !== -1 && rawArgs[styleIdx + 1]) {
        style = rawArgs[styleIdx + 1];
        // Remove style flags from the file list
        rawArgs.splice(styleIdx, 2);
    }

    if (rawArgs.length < 2) {
        console.error("Usage: bun run cli -- <output.html> <file1> [--style <styleName>]");
        process.exit(1);
    }

    const outputFileName = rawArgs[0];
    const inputFiles = rawArgs.slice(1);
    let combinedBody = '';

    inputFiles.forEach(fileName => {
        let filePath = fileName;
        if (!fs.existsSync(filePath)) {
            filePath = path.join('Prompts', fileName.endsWith('.pddl') ? fileName : `${fileName}.pddl`);
        }

        if (fs.existsSync(filePath)) {
            console.log(`Processing [Style: ${style}]: ${filePath}`);
            const content = fs.readFileSync(filePath, 'utf-8');
            try {
                const parser = new Parser(content);
                const ast = parser.parsePrompt();
                
                // PASS STYLE HERE
                combinedBody += `<section class="prompt-section">`;
                combinedBody += `<h3>Source: ${path.basename(filePath)}</h3>`;
                combinedBody += renderPrompt(ast, style); 
                combinedBody += `</section><hr>`;
            } catch (err: any) {
                combinedBody += `<div class="error-msg"><strong>Error in ${fileName}:</strong> ${err.message}</div>`;
            }
        }
    });

    const cssContent = fs.existsSync('./styles.css') ? fs.readFileSync('./styles.css', 'utf-8') : '';

    const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Prompt Export - ${style}</title>
    <style>${cssContent}</style>
</head>
<body class="style-${style}">
    <h1>Static Rendered Prompts (Style: ${style})</h1>
    ${combinedBody}
</body>
</html>`;

    fs.writeFileSync(outputFileName, fullHtml);
    console.log(`\n✨ Exported ${outputFileName} using style: ${style}`);
}

main();