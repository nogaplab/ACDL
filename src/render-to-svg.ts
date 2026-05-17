// CLI for rendering ACDL files to SVG and PDF with selectable text
import * as fs from 'fs';
import * as path from 'path';
import { Parser } from './parser';
import { renderPromptsSvg } from './renderPromptSvg';

import puppeteer from 'puppeteer';

// Convert SVG to PDF using Puppeteer for proper text rendering
async function convertSvgToPdf(svgContent: string, outputPath: string): Promise<void> {
  // Parse SVG to get dimensions
  const widthMatch = svgContent.match(/width="([^"]+)"/);
  const heightMatch = svgContent.match(/height="([^"]+)"/);
  const width = widthMatch ? parseFloat(widthMatch[1]) : 500;
  const height = heightMatch ? parseFloat(heightMatch[1]) : 800;

  // Create HTML wrapper for the SVG
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; padding: 0; background: white; }
    svg { display: block; }
  </style>
</head>
<body>
  ${svgContent}
</body>
</html>`;

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  // Wait for fonts to load
  await page.evaluateHandle('document.fonts.ready');

  // Generate PDF with exact dimensions
  await page.pdf({
    path: outputPath,
    width: width + 'px',
    height: height + 'px',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  await browser.close();
}

async function processFile(filePath: string, outputDir: string, format: 'svg' | 'pdf' | 'both'): Promise<string[]> {
  const absoluteFile = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);

  if (!fs.existsSync(absoluteFile)) {
    throw new Error(`File not found: ${absoluteFile}`);
  }

  const content = fs.readFileSync(absoluteFile, 'utf-8');
  const baseName = path.basename(filePath, '.acdl');

  // Parse and render
  const parser = new Parser(content);
  const prompts = parser.parseFile();
  const svgContent = renderPromptsSvg(prompts);

  const outputs: string[] = [];

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save SVG
  if (format === 'svg' || format === 'both') {
    const svgPath = path.join(outputDir, `${baseName}.svg`);
    fs.writeFileSync(svgPath, svgContent);
    outputs.push(svgPath);
    console.log(`  ✓ Generated: ${svgPath}`);
  }

  // Save PDF
  if (format === 'pdf' || format === 'both') {
    const pdfPath = path.join(outputDir, `${baseName}.pdf`);
    try {
      await convertSvgToPdf(svgContent, pdfPath);
      outputs.push(pdfPath);
      console.log(`  ✓ Generated: ${pdfPath}`);
    } catch (err: any) {
      console.error(`  ✗ PDF conversion failed: ${err.message}`);
      // Fall back to just SVG
    }
  }

  return outputs;
}

async function processFolder(folderPath: string, outputDir: string, format: 'svg' | 'pdf' | 'both'): Promise<string[]> {
  const absoluteFolder = path.isAbsolute(folderPath)
    ? folderPath
    : path.join(process.cwd(), folderPath);

  if (!fs.existsSync(absoluteFolder)) {
    throw new Error(`Folder not found: ${absoluteFolder}`);
  }

  // Find all .acdl files
  const files = fs.readdirSync(absoluteFolder)
    .filter(f => f.endsWith('.acdl'));

  if (files.length === 0) {
    console.log(`No .acdl files found in ${absoluteFolder}`);
    return [];
  }

  console.log(`Found ${files.length} .acdl files in ${absoluteFolder}`);

  const outputs: string[] = [];

  for (const file of files) {
    const inputPath = path.join(absoluteFolder, file);
    console.log(`  Processing: ${file}`);

    try {
      const fileOutputs = await processFile(inputPath, outputDir, format);
      outputs.push(...fileOutputs);
    } catch (err: any) {
      console.error(`    ✗ Error: ${err.message}`);
    }
  }

  return outputs;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: bun run render-svg <input> [options]

Arguments:
  <input>           Single .acdl file or folder containing .acdl files

Options:
  --output, -o      Output directory (default: ./output)
  --format, -f      Output format: svg, pdf, or both (default: both)
  --help, -h        Show this help

Examples:
  # Single file to both SVG and PDF
  bun run render-svg Prompts/Paper/OpenClaw.acdl

  # Folder to SVG only
  bun run render-svg Prompts/Paper -f svg

  # Custom output directory
  bun run render-svg Prompts/Paper -o ./svg-output -f pdf
`);
    process.exit(0);
  }

  const inputPath = args[0];
  let outputDir = './output';
  let format: 'svg' | 'pdf' | 'both' = 'both';

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      outputDir = args[++i];
    } else if (args[i] === '--format' || args[i] === '-f') {
      const f = args[++i];
      if (f === 'svg' || f === 'pdf' || f === 'both') {
        format = f;
      }
    }
  }

  const isDirectory = fs.existsSync(inputPath) && fs.statSync(inputPath).isDirectory();

  console.log(`\n📐 ACDL to SVG/PDF Renderer\n`);
  console.log(`Input: ${inputPath}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Format: ${format}\n`);

  try {
    let outputs: string[];

    if (isDirectory) {
      outputs = await processFolder(inputPath, outputDir, format);
    } else {
      outputs = await processFile(inputPath, outputDir, format);
    }

    console.log(`\n✨ Done! Generated ${outputs.length} file(s).`);
  } catch (err: any) {
    console.error(`✗ Error: ${err.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
