// src/side-by-side.ts
// Generate a side-by-side visualization of multiple ACDL files
import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import { Parser } from './parser';
import { renderPrompts } from './renderPrompt';

interface PanelData {
    name: string;
    rendered: string;
}

async function renderSideBySide(
    filePaths: string[],
    outputPath: string,
    labels?: string[]
): Promise<void> {
    // Read and render all files
    const panels: PanelData[] = filePaths.map((filePath, index) => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parser = new Parser(content);
        const prompts = parser.parseFile();
        const rendered = renderPrompts(prompts, 'default');
        const name = labels?.[index] || path.basename(filePath, '.acdl');
        return { name, rendered };
    });

    const title = panels.map(p => p.name).join(' vs ');

    const cssContent = fs.existsSync('./styles.css')
        ? fs.readFileSync('./styles.css', 'utf-8')
        : '';

    const panelsHtml = panels.map(panel => `
        <div class="compact">
            ${panel.rendered}
        </div>
    `).join('\n');

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Side-by-Side: ${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        ${cssContent}

        body {
            background: white;
            margin: 0;
            padding: 20px;
        }

        .comparison-container {
            display: inline-flex;
            gap: 30px;
            align-items: flex-start;
        }

    </style>
</head>
<body>
    <div class="comparison-container">
        ${panelsHtml}
    </div>
</body>
</html>`;

    // Write HTML for preview
    const htmlPath = outputPath.replace(/\.pdf$/, '.html');
    fs.writeFileSync(htmlPath, html);
    console.log(`HTML preview written to: ${htmlPath}`);

    // Render to PDF
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setViewport({ width: 2000, height: 2000 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready');

    // Get dimensions
    const contentBox = await page.evaluate(() => {
        const container = document.querySelector('.comparison-container');
        if (!container) return { width: 800, height: 600 };
        const rect = container.getBoundingClientRect();
        return {
            width: Math.ceil(rect.width) + 40,
            height: Math.ceil(rect.height) + 40
        };
    });

    // Use screenshot-based PDF generation for exact visual match with web version
    await page.setViewport({
        width: contentBox.width,
        height: contentBox.height,
        deviceScaleFactor: 2  // High resolution
    });

    const screenshot = await page.screenshot({
        type: 'png',
        clip: {
            x: 0,
            y: 0,
            width: contentBox.width,
            height: contentBox.height
        }
    });

    // Create PDF from screenshot
    const pdfDoc = await PDFDocument.create();
    const pngImage = await pdfDoc.embedPng(screenshot);

    // Convert pixels to points (72 points per inch, assume 96 DPI screen)
    const pdfWidth = contentBox.width * 0.75;
    const pdfHeight = contentBox.height * 0.75;

    const page_pdf = pdfDoc.addPage([pdfWidth, pdfHeight]);
    page_pdf.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: pdfWidth,
        height: pdfHeight
    });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);

    await browser.close();
    console.log(`PDF written to: ${outputPath}`);
}

async function main() {
    const args = process.argv.slice(2);

    // Parse arguments: separate files from options
    const files: string[] = [];
    let output = './output/comparison.pdf';
    const labels: string[] = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-o' || args[i] === '--output') {
            output = args[++i];
        } else if (args[i] === '-l' || args[i] === '--labels') {
            // Labels are comma-separated
            labels.push(...args[++i].split(','));
        } else if (args[i].endsWith('.acdl')) {
            files.push(args[i]);
        }
    }

    if (files.length < 2) {
        console.log(`
Usage: bun run side-by-side <file1.acdl> <file2.acdl> [file3.acdl ...] [options]

Arguments:
  <fileN.acdl>  ACDL files to compare (2 or more)

Options:
  -o, --output <path>   Output PDF path (default: ./output/comparison.pdf)
  -l, --labels <names>  Comma-separated panel labels

Examples:
  bun run side-by-side file1.acdl file2.acdl
  bun run side-by-side file1.acdl file2.acdl file3.acdl -o output/three-way.pdf
  bun run side-by-side a.acdl b.acdl c.acdl -l "Left,Middle,Right"
`);
        process.exit(0);
    }

    // Ensure output directory exists
    const outputDir = path.dirname(output);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`\n📊 Side-by-Side ACDL Visualization\n`);
    files.forEach((f, i) => console.log(`Panel ${i + 1}: ${f}`));
    console.log(`Output: ${output}\n`);

    await renderSideBySide(files, output, labels.length > 0 ? labels : undefined);
    console.log(`\n✨ Done!`);
}

main().catch(console.error);
