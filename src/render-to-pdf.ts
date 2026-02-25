// src/render-to-pdf.ts
// Batch render .acdl files to PDF and optionally sync to Overleaf
import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer';
import { PDFDocument, AFRelationship } from 'pdf-lib';
import { Parser } from './parser';
import { renderPrompt } from './renderPrompt';

const OVERLEAF_DIR = path.join(process.cwd(), 'overleaf');
const OVERLEAF_FIGURES_DIR = path.join(OVERLEAF_DIR, 'figures');

async function renderToPdf(htmlContent: string, outputPath: string): Promise<void> {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Use wide viewport initially
    await page.setViewport({ width: 2000, height: 2000 });

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // Wait for fonts to load
    await page.evaluateHandle('document.fonts.ready');

    // Convert CSS ::before pseudo-elements to real text for better PDF text selection
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

        const container = document.querySelector('.prompt-container');
        if (!container) return 400;

        const width = container.getBoundingClientRect().width;

        // Restore comments
        comments.forEach(c => (c as HTMLElement).style.display = '');

        return Math.ceil(width);
    });

    // Step 2: Set the container width to force comments to wrap
    await page.evaluate((width) => {
        const output = document.querySelector('#output') as HTMLElement;
        if (output) {
            output.style.width = width + 'px';
            output.style.maxWidth = width + 'px';
        }
    }, contentWidth);

    // Get final dimensions after comments have wrapped
    const contentBox = await page.evaluate(() => {
        const container = document.querySelector('.prompt-container');
        const footer = document.querySelector('.source-link-footer');
        if (!container) return { width: 400, height: 200 };

        const containerRect = container.getBoundingClientRect();
        const footerRect = footer?.getBoundingClientRect();

        // Include footer height in total height
        const totalHeight = footerRect
            ? footerRect.bottom
            : containerRect.bottom;

        return {
            width: Math.ceil(containerRect.width) + 2,
            height: Math.ceil(totalHeight) + 2
        };
    });

    await page.pdf({
        path: outputPath,
        width: `${contentBox.width}px`,
        height: `${contentBox.height}px`,
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });

    await browser.close();
}

async function embedSourceAttachment(pdfPath: string, acdlContent: string, fileName: string): Promise<void> {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Embed the ACDL source as a file attachment
    await pdfDoc.attach(
        Buffer.from(acdlContent, 'utf-8'),
        `${fileName}.acdl`,
        {
            mimeType: 'text/plain',
            description: `Original ACDL source for ${fileName}`,
            afRelationship: AFRelationship.Source
        }
    );

    const modifiedPdfBytes = await pdfDoc.save();
    fs.writeFileSync(pdfPath, modifiedPdfBytes);
}

function generateHtml(acdlContent: string, fileName: string): string {
    const parser = new Parser(acdlContent);
    const ast = parser.parsePrompt();
    const renderedPrompt = renderPrompt(ast, 'default');

    const cssContent = fs.existsSync('./styles.css')
        ? fs.readFileSync('./styles.css', 'utf-8')
        : '';

    // Create a data URL for downloading the original ACDL source
    const base64Source = Buffer.from(acdlContent, 'utf-8').toString('base64');
    const downloadUrl = `data:text/plain;base64,${base64Source}`;

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

        /* PDF overrides matching web PNG export behavior */
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

        /* Hide CSS pseudo-elements - we inject them as real text for PDF */
        .loop-block-outside-role-header::before,
        .loop-block-inside-role-header::before,
        .conditional-section-header::before,
        .conditional-block-outside-role-header::before,
        .switch-block-outside-role-header::before,
        .switch-block-inside-role-header::before,
        .template-block::before {
            content: none !important;
        }

        /* Style the injected PDF symbols to match original pseudo-elements */
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
            align-items: flex-start;
        }

        /* Source link footer */
        .source-link-footer {
            margin-top: 8px;
            padding-top: 6px;
            border-top: 1px solid #e0e0e0;
            font-family: 'Inter', sans-serif;
            font-size: 9px;
        }
        .source-link-footer a {
            color: #666;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .source-link-footer a:hover {
            color: #333;
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div id="output" class="compact">
        ${renderedPrompt}
    </div>
    <div class="source-link-footer">
        📎 <strong>${fileName}.acdl</strong> attached
    </div>
</body>
</html>`;
}

async function processFolder(folderPath: string, outputDir: string, syncToOverleaf: boolean): Promise<string[]> {
    const absoluteFolder = path.isAbsolute(folderPath)
        ? folderPath
        : path.join(process.cwd(), folderPath);

    if (!fs.existsSync(absoluteFolder)) {
        console.error(`Folder not found: ${absoluteFolder}`);
        process.exit(1);
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

    const generatedPdfs: string[] = [];

    for (const file of files) {
        const inputPath = path.join(absoluteFolder, file);
        const baseName = path.basename(file, '.acdl');
        const pdfName = `${baseName}.pdf`;
        const outputPath = path.join(outputDir, pdfName);

        console.log(`  Processing: ${file} -> ${pdfName}`);

        try {
            const content = fs.readFileSync(inputPath, 'utf-8');
            const html = generateHtml(content, baseName);
            await renderToPdf(html, outputPath);
            await embedSourceAttachment(outputPath, content, baseName);
            generatedPdfs.push(outputPath);
            console.log(`    ✓ Generated: ${outputPath} (with embedded source)`);
        } catch (err: any) {
            console.error(`    ✗ Error processing ${file}: ${err.message}`);
        }
    }

    return generatedPdfs;
}

async function syncToOverleaf(pdfFiles: string[]): Promise<void> {
    if (!fs.existsSync(OVERLEAF_DIR)) {
        console.error('Overleaf directory not found. Clone it first with:');
        console.error('  git clone https://git.overleaf.com/<project-id> overleaf');
        return;
    }

    // Create figures directory if it doesn't exist
    if (!fs.existsSync(OVERLEAF_FIGURES_DIR)) {
        fs.mkdirSync(OVERLEAF_FIGURES_DIR, { recursive: true });
    }

    console.log('\nCopying PDFs to Overleaf...');

    for (const pdfPath of pdfFiles) {
        const fileName = path.basename(pdfPath);
        const destPath = path.join(OVERLEAF_FIGURES_DIR, fileName);
        fs.copyFileSync(pdfPath, destPath);
        console.log(`  ✓ Copied: ${fileName}`);
    }

    // Git operations - ONLY touch figures/ folder
    const { execSync } = await import('child_process');
    const originalCwd = process.cwd();

    try {
        process.chdir(OVERLEAF_DIR);

        // Pull latest changes first to avoid conflicts
        console.log('\nPulling latest from Overleaf...');
        execSync('git fetch origin', { stdio: 'pipe' });
        execSync('git reset --hard origin/master', { stdio: 'pipe' });

        // Ensure figures directory exists after reset
        if (!fs.existsSync(OVERLEAF_FIGURES_DIR)) {
            fs.mkdirSync(OVERLEAF_FIGURES_DIR, { recursive: true });
        }

        // Copy PDFs again after reset (they were overwritten)
        // Use absolute paths since we changed directory
        for (const pdfPath of pdfFiles) {
            const absolutePdfPath = path.isAbsolute(pdfPath) ? pdfPath : path.join(originalCwd, pdfPath);
            const fileName = path.basename(pdfPath);
            const destPath = path.join(OVERLEAF_FIGURES_DIR, fileName);
            fs.copyFileSync(absolutePdfPath, destPath);
        }

        // Check if there are changes in figures/ only
        const status = execSync('git status --porcelain figures/', { encoding: 'utf-8' });
        if (!status.trim()) {
            console.log('No changes to commit.');
            return;
        }

        console.log('Committing and pushing to Overleaf...');
        execSync('git add figures/', { stdio: 'inherit' });
        execSync(`git commit -m "Update ACDL prompt visualizations"`, { stdio: 'inherit' });
        execSync('git push', { stdio: 'inherit' });
        console.log('✓ Pushed to Overleaf successfully!');
    } catch (err: any) {
        console.error('Git operation failed:', err.message);
    }
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log(`
Usage: bun run render-pdf <folder> [options]

Arguments:
  <folder>      Folder containing .acdl files (e.g., "Prompts/Papers")

Options:
  --output, -o  Output directory for PDFs (default: ./output)
  --sync        Copy PDFs to Overleaf and push
  --help, -h    Show this help

Examples:
  bun run render-pdf Prompts/Papers
  bun run render-pdf Prompts/Papers --sync
  bun run render-pdf Prompts/Papers -o ./pdfs --sync
`);
        process.exit(0);
    }

    const folderPath = args[0];
    let outputDir = './output';
    let shouldSync = false;

    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--output' || args[i] === '-o') {
            outputDir = args[++i];
        } else if (args[i] === '--sync') {
            shouldSync = true;
        }
    }

    console.log(`\n📄 ACDL to PDF Batch Renderer\n`);
    console.log(`Input folder: ${folderPath}`);
    console.log(`Output directory: ${outputDir}`);
    console.log(`Sync to Overleaf: ${shouldSync ? 'Yes' : 'No'}\n`);

    const pdfFiles = await processFolder(folderPath, outputDir, shouldSync);

    if (pdfFiles.length > 0 && shouldSync) {
        await syncToOverleaf(pdfFiles);
    }

    console.log(`\n✨ Done! Generated ${pdfFiles.length} PDF(s).`);
}

main().catch(console.error);
