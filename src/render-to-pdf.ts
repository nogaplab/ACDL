// src/render-to-pdf.ts
// Batch render .acdl files to PDF and optionally sync to Overleaf
import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer';
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

    // Inject dompdf.js from CDN
    await page.addScriptTag({
        url: 'https://cdn.jsdelivr.net/npm/dompdf.js@latest/dist/dompdf.js'
    });

    // Wait for dompdf to be available
    await page.waitForFunction(() => typeof (window as any).dompdf !== 'undefined');

    // Generate PDF using dompdf.js and get it as base64
    const pdfBase64 = await page.evaluate(async () => {
        const element = document.querySelector('#output') || document.body;
        const blob = await (window as any).dompdf(element, {
            useCORS: true,
            compress: true
        });

        // Convert blob to base64
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    });

    // Write the PDF to file
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    fs.writeFileSync(outputPath, pdfBuffer);

    await browser.close();
}

function generateHtml(acdlContent: string, fileName: string): string {
    const parser = new Parser(acdlContent);
    const ast = parser.parsePrompt();
    const renderedPrompt = renderPrompt(ast, 'default');

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
    </style>
</head>
<body>
    <div id="output" class="compact">
        ${renderedPrompt}
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
            generatedPdfs.push(outputPath);
            console.log(`    ✓ Generated: ${outputPath}`);
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

    console.log(`\n📄 ACDL to PDF Batch Render