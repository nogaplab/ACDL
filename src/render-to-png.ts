// src/render-to-png.ts
// Batch render .acdl files to PNG using Puppeteer
import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer';
import { Parser } from './parser';
import { renderPrompts } from './renderPrompt';

async function renderToPng(htmlContent: string, outputPath: string): Promise<void> {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Use wide viewport initially
    await page.setViewport({ width: 2000, height: 2000, deviceScaleFactor: 2 });

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // Wait for fonts to load
    await page.evaluateHandle('document.fonts.ready');

    // Convert CSS ::before pseudo-elements to real text for better rendering
    await page.evaluate(() => {
        // Map selectors to their ::before content symbols
        const symbolMap: Record<string, string> = {
            '.loop-block-outside-role-header': '↻',
            '.loop-block-inside-role-header': '↻',
            '.conditional-section-header': '◇',
            '.conditional-block-outside-role-header': '◇',
            '.switch-block-outside-role-header': '⎇',
            '.switch-block-inside-role-header': '⎇',
            '.template-block': '◆'
        };

        Object.entries(symbolMap).forEach(([selector, symbol]) => {
            document.querySelectorAll(selector).forEach(el => {
                if (!el.getAttribute('data-symbol-added')) {
                    const span = document.createElement('span');
                    span.textContent = symbol;
                    span.className = 'pdf-symbol';
                    el.insertBefore(span, el.firstChild);
                    el.setAttribute('data-symbol-added', 'true');
                }
            });
        });
    });

    // Step 1: Find the width of the widest non-comment content
    const contentWidth = await page.evaluate(() => {
        // Hide all comments temporarily to measure content width
        const comments = document.querySelectorAll('.comment, .inline-comment');
        comments.forEach(c => (c as HTMLElement).style.display = 'none');

        const containers = document.querySelectorAll('.prompt-container');
        if (containers.length === 0) return 400;

        // Find the widest container
        let maxWidth = 0;
        containers.forEach(container => {
            const width = container.getBoundingClientRect().width;
            if (width > maxWidth) maxWidth = width;
        });

        // Restore comments
        comments.forEach(c => (c as HTMLElement).style.display = '');

        return Math.ceil(maxWidth);
    });

    // Minimum width of 6cm (≈227px at 96 DPI)
    const minWidthPx = 227;
    const finalWidth = Math.max(contentWidth, minWidthPx);

    // Step 2: Set the output width to force comments to wrap, let prompt-container size naturally
    await page.evaluate((width) => {
        const output = document.querySelector('#output') as HTMLElement;
        if (output) {
            output.style.width = width + 'px';
        }
    }, finalWidth);

    // Get final dimensions after comments have wrapped
    const contentBox = await page.evaluate(() => {
        const containers = document.querySelectorAll('.prompt-container');
        if (containers.length === 0) return { width: 400, height: 200 };

        // Find the widest container and the bottom-most point
        let maxWidth = 0;
        let maxBottom = 0;
        containers.forEach(container => {
            const rect = container.getBoundingClientRect();
            if (rect.width > maxWidth) maxWidth = rect.width;
            if (rect.bottom > maxBottom) maxBottom = rect.bottom;
        });

        return {
            width: Math.ceil(maxWidth) + 40,  // Add padding for PNG
            height: Math.ceil(maxBottom) + 40
        };
    });

    // Add padding to the body for better PNG appearance
    await page.evaluate(() => {
        const output = document.querySelector('#output') as HTMLElement;
        if (output) {
            output.style.padding = '20px';
        }
    });

    // Take screenshot with high quality settings
    await page.screenshot({
        path: outputPath,
        type: 'png',
        clip: {
            x: 0,
            y: 0,
            width: contentBox.width,
            height: contentBox.height
        },
        omitBackground: false
    });

    await browser.close();
}

function generateHtml(acdlContent: string, fileName: string): string {
    const parser = new Parser(acdlContent);
    const prompts = parser.parseFile();
    const renderedPrompt = renderPrompts(prompts, 'default');

    const cssContent = fs.existsSync('./styles.css')
        ? fs.readFileSync('./styles.css', 'utf-8')
        : '';

    // Apply the same structure as the web version's PNG export
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${fileName}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        ${cssContent}

        /* PNG export overrides matching web version behavior */
        body {
            background: white;
            margin: 0;
            padding: 0;
        }

        #output {
            padding: 0;
            margin: 0;
            background: white;
        }

        /* Hide CSS pseudo-elements - we inject them as real text for PNG */
        .loop-block-outside-role-header::before,
        .loop-block-inside-role-header::before,
        .conditional-section-header::before,
        .conditional-block-outside-role-header::before,
        .switch-block-outside-role-header::before,
        .switch-block-inside-role-header::before,
        .template-block::before {
            content: none !important;
        }

        /* Style the injected symbols to match original pseudo-elements */
        .pdf-symbol {
            margin-right: 4px;
            color: var(--control-border, #6e7781);
        }
        .template-block .pdf-symbol {
            font-size: 6px;
            opacity: 0.7;
            color: inherit;
        }
        .compact .template-block .pdf-symbol {
            font-size: 5px;
        }
        .loop-block-outside-role-header .pdf-symbol,
        .loop-block-inside-role-header .pdf-symbol {
            font-size: 12px;
        }
        .conditional-section-header .pdf-symbol,
        .conditional-block-outside-role-header .pdf-symbol {
            font-size: 10px;
        }
        .switch-block-outside-role-header .pdf-symbol,
        .switch-block-inside-role-header .pdf-symbol {
            font-size: 12px;
        }
        .compact .loop-block-outside-role-header .pdf-symbol,
        .compact .loop-block-inside-role-header .pdf-symbol,
        .compact .switch-block-outside-role-header .pdf-symbol,
        .compact .switch-block-inside-role-header .pdf-symbol,
        .compact .conditional-block-outside-role-header .pdf-symbol {
            font-size: 8px;
        }
        .compact .conditional-section-header .pdf-symbol {
            font-size: 7px;
        }

        /* Comments wrap within the constrained width */
        .compact .comment,
        .compact .inline-comment {
            white-space: normal;
            word-wrap: break-word;
            flex-shrink: 1;
            min-width: 0;
        }

        /* Block with comment should allow comment wrapping */
        .compact .block-with-comment {
            display: inline-flex;
            flex-wrap: wrap;
            align-items: center;
        }

        /* PNG minimum width override */
        .compact .prompt-container {
            min-width: 227px !important;
        }

        /* PNG vertical alignment fixes for boxed inline elements */
        .compact .context-var,
        .compact .template-block,
        .compact .func-block,
        .compact .name-ref {
            display: inline-flex !important;
            align-items: center !important;
            padding-top: 0.15em !important;
            padding-bottom: 0.15em !important;
            line-height: 1 !important;
        }
    </style>
</head>
<body>
    <div id="output" class="compact">
        ${renderedPrompt}
    </div>
</body>
</html>`;
}

async function processFile(filePath: string, outputPath?: string): Promise<string> {
    const absoluteFile = path.isAbsolute(filePath)
        ? filePath
        : path.join(process.cwd(), filePath);

    if (!fs.existsSync(absoluteFile)) {
        throw new Error(`File not found: ${absoluteFile}`);
    }

    const baseName = path.basename(filePath, '.acdl');
    const pngName = `${baseName}.png`;
    const finalOutput = outputPath || path.join(path.dirname(absoluteFile), pngName);

    const content = fs.readFileSync(absoluteFile, 'utf-8');
    const html = generateHtml(content, baseName);
    await renderToPng(html, finalOutput);

    return finalOutput;
}

async function processFolder(folderPath: string, outputDir: string): Promise<string[]> {
    const absoluteFolder = path.isAbsolute(folderPath)
        ? folderPath
        : path.join(process.cwd(), folderPath);

    if (!fs.existsSync(absoluteFolder)) {
        throw new Error(`Folder not found: ${absoluteFolder}`);
    }

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Find all .acdl files
    const files = fs.readdirSync(absoluteFolder)
        .filter(f => f.endsWith('.acdl'));

    if (files.length === 0) {
        console.log(`No .acdl files found in ${absoluteFolder}`);
        return [];
    }

    console.log(`Found ${files.length} .acdl files in ${absoluteFolder}`);

    const generatedPngs: string[] = [];

    for (const file of files) {
        const inputPath = path.join(absoluteFolder, file);
        const baseName = path.basename(file, '.acdl');
        const pngName = `${baseName}.png`;
        const outputPath = path.join(outputDir, pngName);

        console.log(`  Processing: ${file} -> ${pngName}`);

        try {
            const content = fs.readFileSync(inputPath, 'utf-8');
            const html = generateHtml(content, baseName);
            await renderToPng(html, outputPath);
            generatedPngs.push(outputPath);
            console.log(`    ✓ Generated: ${outputPath}`);
        } catch (err: any) {
            console.error(`    ✗ Error processing ${file}: ${err.message}`);
        }
    }

    return generatedPngs;
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log(`
Usage: bun run render-png <input> [options]

Arguments:
  <input>       Single .acdl file or folder containing .acdl files

Options:
  --output, -o  Output file (for single file) or directory (for folder)
  --help, -h    Show this help

Examples:
  # Single file (outputs to same directory as input)
  bun run render-png Prompts/Paper/OpenClaw.acdl

  # Single file with custom output
  bun run render-png Prompts/Paper/OpenClaw.acdl -o output/my-render.png

  # Batch process folder
  bun run render-png Prompts/Paper

  # Batch process with custom output directory
  bun run render-png Prompts/Paper -o ./png-output
`);
        process.exit(0);
    }

    const inputPath = args[0];
    let outputPath: string | undefined;

    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--output' || args[i] === '-o') {
            outputPath = args[++i];
        }
    }

    const isDirectory = fs.existsSync(inputPath) && fs.statSync(inputPath).isDirectory();

    console.log(`\n🖼️  ACDL to PNG Renderer\n`);

    if (isDirectory) {
        // Batch process folder
        const outputDir = outputPath || './output';
        console.log(`Input folder: ${inputPath}`);
        console.log(`Output directory: ${outputDir}\n`);

        const pngFiles = await processFolder(inputPath, outputDir);
        console.log(`\n✨ Done! Generated ${pngFiles.length} PNG(s).`);
    } else {
        // Single file
        console.log(`Input file: ${inputPath}`);
        if (outputPath) {
            console.log(`Output file: ${outputPath}\n`);
        } else {
            console.log(`Output: Same directory as input\n`);
        }

        try {
            const outputFile = await processFile(inputPath, outputPath);
            console.log(`✓ Generated: ${outputFile}`);
            console.log(`\n✨ Done!`);
        } catch (err: any) {
            console.error(`✗ Error: ${err.message}`);
            process.exit(1);
        }
    }
}

main().catch(console.error);
