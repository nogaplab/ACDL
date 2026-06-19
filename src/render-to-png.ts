// src/render-to-png.ts
// Batch render .acdl files to PNG using Puppeteer + html2canvas (same as web version)
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

    // Use html2canvas inside the page (same as web version)
    const dataUrl = await page.evaluate(async () => {
        const output = document.querySelector('#output') as HTMLElement;
        if (!output) return null;

        // html2canvas doesn't render text inside inline-flex elements properly
        // in certain nesting contexts (e.g. context-vars inside ForEach loops).
        // Temporarily switch to inline-block for the capture.
        const inlineFlexEls = output.querySelectorAll('.context-var, .template-block, .func-block, .expr-context-var');
        inlineFlexEls.forEach(el => {
            (el as HTMLElement).style.display = 'inline-block';
        });

        // Fix mark blocks - html2canvas has issues with absolute positioning
        // Convert back to flex layout for capture
        const markBlocks = output.querySelectorAll('.mark-block');
        markBlocks.forEach(el => {
            const htmlEl = el as HTMLElement;
            htmlEl.style.display = 'flex';
            htmlEl.style.alignItems = 'stretch';
            htmlEl.style.paddingRight = '0';
        });

        const markBrackets = output.querySelectorAll('.mark-block-bracket');
        markBrackets.forEach(el => {
            const htmlEl = el as HTMLElement;
            htmlEl.style.position = 'relative';
            htmlEl.style.right = 'auto';
            htmlEl.style.top = 'auto';
            htmlEl.style.bottom = 'auto';
            htmlEl.style.marginLeft = '8px';
        });

        const markContents = output.querySelectorAll('.mark-block-content');
        markContents.forEach(el => {
            (el as HTMLElement).style.flex = '1';
        });

        // Fix time-index and other-index elements - html2canvas doesn't support CSS variables
        // Apply inline styles directly for reliable rendering
        const timeIndexEls = output.querySelectorAll('.time-index, .other-index');
        timeIndexEls.forEach(el => {
            const htmlEl = el as HTMLElement;
            htmlEl.style.display = 'inline';
            htmlEl.style.color = '#0969da';
            htmlEl.style.fontWeight = '700';
            htmlEl.style.fontFamily = "'JetBrains Mono', 'SF Mono', monospace";
        });

        // Fix end-dashed-line - html2canvas doesn't render repeating-linear-gradient
        // Convert to border-bottom dashed style (works better with flex align-items: center)
        const endDashedLines = output.querySelectorAll('.end-dashed-line');
        endDashedLines.forEach(el => {
            const htmlEl = el as HTMLElement;
            htmlEl.style.background = 'none';
            htmlEl.style.height = '0';
            htmlEl.style.borderBottom = '1px dashed #6e7781';
            htmlEl.style.alignSelf = 'center';
        });

        // Fix title to prevent wrapping
        const titleH1s = output.querySelectorAll('.prompt-title h1');
        titleH1s.forEach(el => {
            (el as HTMLElement).style.whiteSpace = 'nowrap';
        });

        // html2canvas misrenders ::before pseudo-elements when display is
        // inline-block instead of inline-flex. Add a fix style.
        const exportFixStyle = document.createElement('style');
        exportFixStyle.textContent = `
            .template-block::before {
                vertical-align: middle;
                line-height: 1;
                position: relative;
                top: -1px;
            }
        `;
        document.head.appendChild(exportFixStyle);

        // Remove max-width constraints on containers to allow natural sizing
        const containers = output.querySelectorAll('.prompt-container');
        containers.forEach(el => {
            (el as HTMLElement).style.maxWidth = 'none';
            (el as HTMLElement).style.width = 'auto';
        });

        // Step 1: Hide comments to measure content width
        const comments = output.querySelectorAll('.comment, .inline-comment');
        comments.forEach(c => (c as HTMLElement).style.display = 'none');

        // Force layout recalculation
        document.body.offsetHeight;

        // Find the widest line of content (same logic as web version)
        const lineElements: Element[] = [];

        // Prompt titles
        output.querySelectorAll('.prompt-title h1').forEach(el => lineElements.push(el));

        // Role body blocks - each child is a line
        output.querySelectorAll('.role-body-block').forEach(block => {
            Array.from(block.children).forEach(child => {
                if (child.classList.contains('block-with-comment')) {
                    const mainContent = child.firstElementChild;
                    if (mainContent) lineElements.push(mainContent);
                } else if (!child.classList.contains('comment') && !child.classList.contains('inline-comment')) {
                    lineElements.push(child);
                }
            });
        });

        // Control flow headers
        output.querySelectorAll('.loop-block-outside-role-header, .loop-block-inside-role-header, .conditional-block-outside-role-header, .conditional-section-header, .switch-block-outside-role-header, .switch-block-inside-role-header, .switch-case-header, .switch-default-header').forEach(el => lineElements.push(el));

        // Name definitions
        output.querySelectorAll('.name-def').forEach(el => lineElements.push(el));

        // End blocks - measure only the end-text part, not the flex-grow dashed line
        output.querySelectorAll('.end-block .end-text').forEach(el => lineElements.push(el));

        // Label starts/ends
        output.querySelectorAll('.label-start, .label-end').forEach(el => lineElements.push(el));

        // Find the widest element
        let maxWidth = 0;
        lineElements.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width > maxWidth) maxWidth = rect.width;
        });

        // Add padding for the prompt-container's border, padding, and breathing room
        const contentWidthWithoutComments = Math.ceil(maxWidth) + 70;

        // Step 2: Restore comments and constrain width so they wrap
        comments.forEach(c => (c as HTMLElement).style.display = '');
        // Min 200px, max 450px
        const constrainedWidth = Math.min(Math.max(contentWidthWithoutComments, 200), 450);

        // Set container widths to the constrained width
        containers.forEach(el => {
            (el as HTMLElement).style.width = (constrainedWidth - 40) + 'px';
            (el as HTMLElement).style.maxWidth = (constrainedWidth - 40) + 'px';
        });
        output.style.width = constrainedWidth + 'px';
        output.style.minWidth = '200px';

        // For each block-with-comment, calculate available width for comment
        const blockWithComments = output.querySelectorAll('.block-with-comment');
        blockWithComments.forEach(el => {
            const htmlEl = el as HTMLElement;
            const mainContent = htmlEl.firstElementChild as HTMLElement;
            const comment = htmlEl.querySelector('.inline-comment, .comment') as HTMLElement;

            if (mainContent && comment) {
                const mainWidth = mainContent.getBoundingClientRect().width;
                // Match HTML's natural flex layout so the export wraps the same
                // way as the live preview. Overhead = container padding-left +
                // border-left (10 + 1) + role-body-block padding-x (2 * 6) +
                // block-with-comment gap (4) = 27 px. Cap at the CSS max-width
                // from .comment / .inline-comment (350 px) so we never give the
                // comment more room than CSS would.
                const CSS_COMMENT_MAX = 350;
                const availableForComment = constrainedWidth - 27 - mainWidth;
                const commentMaxWidth = Math.max(80, Math.min(availableForComment, CSS_COMMENT_MAX));

                comment.style.maxWidth = commentMaxWidth + 'px';
                comment.style.minWidth = '0';
                comment.style.flex = '0 1 auto';
                comment.style.whiteSpace = 'normal';
                comment.style.overflowWrap = 'break-word';
            }
        });

        // Force layout recalculation with constrained width
        document.body.offsetHeight;

        // Detect wrapped comments and add class for top alignment
        blockWithComments.forEach(el => {
            const htmlEl = el as HTMLElement;
            const comment = htmlEl.querySelector('.inline-comment, .comment') as HTMLElement;
            if (comment) {
                const lineHeight = parseFloat(getComputedStyle(comment).lineHeight) || 16;
                if (comment.offsetHeight > lineHeight * 1.5) {
                    htmlEl.classList.add('comment-wrapped');
                } else {
                    htmlEl.classList.remove('comment-wrapped');
                }
            }
        });

        // Step 3: Get final dimensions with comments wrapping
        const fullWidth = Math.max(
            output.scrollWidth,
            output.offsetWidth,
            output.getBoundingClientRect().width
        );
        const fullHeight = Math.max(
            output.scrollHeight,
            output.offsetHeight,
            output.getBoundingClientRect().height
        );

        // Add padding to ensure nothing gets cropped
        const captureWidth = Math.ceil(fullWidth) + 40;
        const captureHeight = Math.ceil(fullHeight) + 60;

        // Use html2canvas to render (same as web version)
        // @ts-ignore - html2canvas is loaded via script tag
        const canvas = await html2canvas(output, {
            backgroundColor: '#ffffff',
            scale: 2,
            useCORS: true,
            logging: false,
            width: captureWidth,
            height: captureHeight,
            windowWidth: captureWidth,
            windowHeight: captureHeight,
            scrollX: 0,
            scrollY: 0,
            x: 0,
            y: 0,
            allowTaint: true,
            imageTimeout: 0
        });

        // Clean up the temporary style
        exportFixStyle.remove();

        return canvas.toDataURL('image/png');
    });

    if (dataUrl) {
        // Convert data URL to buffer and save
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));
    }

    await browser.close();
}

function generateHtml(acdlContent: string, fileName: string): string {
    const parser = new Parser(acdlContent);
    const prompts = parser.parseFile();
    const renderedPrompt = renderPrompts(prompts, 'default');

    const cssContent = fs.existsSync('./src/styles.css')
        ? fs.readFileSync('./src/styles.css', 'utf-8')
        : '';

    // Include html2canvas from CDN (same library as web version)
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${fileName}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <style>
        ${cssContent}

        /* PNG export overrides matching web version behavior */
        body {
            background: white;
            margin: 0;
            padding: 0;
        }

        #output {
            padding: 20px;
            margin: 0;
            background: white;
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
