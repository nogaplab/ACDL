// src/side-by-side.ts
// Generate a side-by-side visualization of multiple ACDL files
import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer';
import { Parser } from './parser';
import { renderPrompt } from './renderPrompt';

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
        const ast = parser.parsePrompt();
        const rendered = renderPrompt(ast, 'default');
        const name = labels?.[index] || path.basename(filePath, '.acdl');
        return { name, rendered };
    });

    const title = panels.map(p => p.name).join(' vs ');

    const cssContent = fs.existsSync('./styles.css')
        ? fs.readFileSync('./styles.css', 'utf-8')
        : '';

    const panelsHtml = panels.map(panel => `
        <div class="panel compact">
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

        .panel {
            display: inline-block;
        }

        /* Override prompt container to shrink to content */
        .panel .prompt-container {
            max-width: none;
            display: inline-block;
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

    // Convert CSS ::before pseudo-elements to real text
    await page.evaluate(() => {
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

    await page.pdf({
        path: outputPath,
        width: `${contentBox.width}px`,
        height: `${contentBox.height}px`,
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });

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
