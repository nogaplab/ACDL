import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WEBSITE_SRC = path.join(__dirname, '..', 'website', 'src');
const WEBSITE_SHARED = path.join(__dirname, '..', 'website', 'shared');
const DIST_WEBSITE = path.join(__dirname, '..', 'dist', 'website');

// Read shared partials
const navHtml = fs.readFileSync(path.join(WEBSITE_SHARED, 'nav.html'), 'utf8');
const footerHtml = fs.readFileSync(path.join(WEBSITE_SHARED, 'footer.html'), 'utf8');
const gaHtml = fs.readFileSync(path.join(WEBSITE_SHARED, 'ga.html'), 'utf8');

// Ensure dist directories exist
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Calculate the base path prefix based on file depth relative to src root
function getBasePath(filePath) {
  const relativePath = path.relative(WEBSITE_SRC, path.dirname(filePath));
  if (!relativePath) return '';
  const depth = relativePath.split(path.sep).length;
  return '../'.repeat(depth);
}

// Process an HTML file by replacing placeholders
function processHtmlFile(srcPath, destPath) {
  let content = fs.readFileSync(srcPath, 'utf8');
  const basePath = getBasePath(srcPath);

  // Replace placeholders
  content = content.replace(/\{\{NAV\}\}/g, navHtml.replace(/\{\{BASE\}\}/g, basePath));
  content = content.replace(/\{\{FOOTER\}\}/g, footerHtml.replace(/\{\{BASE\}\}/g, basePath));
  content = content.replace(/\{\{GA\}\}/g, gaHtml);
  content = content.replace(/\{\{BASE\}\}/g, basePath);

  ensureDir(path.dirname(destPath));
  fs.writeFileSync(destPath, content);
  console.log(`Built: ${path.relative(DIST_WEBSITE, destPath)}`);
}

// Copy a file without processing
function copyFile(srcPath, destPath) {
  ensureDir(path.dirname(destPath));
  fs.copyFileSync(srcPath, destPath);
  console.log(`Copied: ${path.relative(DIST_WEBSITE, destPath)}`);
}

// Recursively process all files in a directory
function processDirectory(srcDir, destDir) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      processDirectory(srcPath, destPath);
    } else if (entry.name.endsWith('.html')) {
      processHtmlFile(srcPath, destPath);
    } else {
      // Copy non-HTML files as-is (e.g., .acdl files)
      copyFile(srcPath, destPath);
    }
  }
}

// Main build process
console.log('Building website...\n');

// Regenerate website/src/*.html from Markdown content first, so the rest of the
// build picks up the latest authored content.
console.log('Building Markdown content...\n');
try {
  execSync('node scripts/build-content.js', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
  });
} catch (error) {
  console.error('Failed to build Markdown content:', error.message);
  process.exit(1);
}
console.log('');

// Clean and create dist directory
if (fs.existsSync(DIST_WEBSITE)) {
  fs.rmSync(DIST_WEBSITE, { recursive: true });
}
ensureDir(DIST_WEBSITE);

// Process all source files
processDirectory(WEBSITE_SRC, DIST_WEBSITE);

// Copy shared assets
const sharedDest = path.join(DIST_WEBSITE, 'shared');
ensureDir(sharedDest);
copyFile(path.join(WEBSITE_SHARED, 'styles.css'), path.join(sharedDest, 'styles.css'));

console.log('\nWebsite pages complete!\n');

// Build the standalone visualizer
console.log('Building standalone visualizer...\n');
try {
  execSync('node scripts/build-standalone.js', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });
} catch (error) {
  console.error('Failed to build standalone visualizer:', error.message);
  process.exit(1);
}

// Build the standalone diff tool
console.log('\nBuilding standalone diff tool...\n');
try {
  execSync('node scripts/build-diff-tool.js', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });
} catch (error) {
  console.error('Failed to build standalone diff tool:', error.message);
  process.exit(1);
}

// Build the VSCode extension VSIX
console.log('\nBuilding VSCode extension...\n');
try {
  execSync('npm run package', {
    cwd: path.join(__dirname, '..', 'extension'),
    stdio: 'inherit'
  });
} catch (error) {
  console.error('Failed to build VSCode extension:', error.message);
  process.exit(1);
}

console.log('\nFull website build complete!');
