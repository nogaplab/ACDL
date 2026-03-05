#!/usr/bin/env node
/**
 * Build script for generating the standalone ACDL Visualizer HTML file.
 *
 * This script:
 * 1. Bundles the TypeScript parser and renderer into plain JavaScript
 * 2. Reads the CSS from styles.css
 * 3. Combines them with the HTML template into standalone.html
 *
 * Usage: node scripts/build-standalone.js
 */

import * as fs from 'fs';
import * as path from 'path';
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Example configuration: maps keys to file paths and display info
// Edit this to change which examples are included in the standalone build
const EXAMPLE_CONFIG = {
  // React Variants
  fig1_base: { file: 'Prompts/Paper/fig1-base.acdl', label: 'ReAct Base', group: 'React Variants' },
  fig1_left: { file: 'Prompts/Paper/fig1-left.acdl', label: 'ReAct Left', group: 'React Variants' },
  fig1_right: { file: 'Prompts/Paper/fig1-right.acdl', label: 'ReAct Right', group: 'React Variants' },

  // Examples
  rag: { file: 'Prompts/Paper/basic-rag.acdl', label: 'RAG', group: 'Examples' },
  mintagent: { file: 'Prompts/Paper/mint-original.acdl', label: 'MintAgent', group: 'Examples' },
  multiagent: { file: 'Prompts/Paper/MultiAgent.acdl', label: 'MultiAgent', group: 'Examples' },

  // Advanced
  openclaw: { file: 'Prompts/Paper/OpenClaw.acdl', label: 'OpenClaw', group: 'Advanced' },
  opencode: { file: 'Prompts/Paper/OpenCode.acdl', label: 'OpenCode', group: 'Advanced' },
  pokemon: { file: 'Prompts/Paper/pokemon.acdl', label: 'Pokemon', group: 'Advanced' },
};

// Load prompts from files
function loadPrompts() {
  const prompts = {};
  for (const [key, config] of Object.entries(EXAMPLE_CONFIG)) {
    const filePath = path.join(rootDir, config.file);
    try {
      prompts[key] = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      console.warn(`  Warning: Could not load ${config.file}: ${err.message}`);
    }
  }
  return prompts;
}

// Generate the dropdown HTML from config
function generateDropdownHTML() {
  const groups = {};
  for (const [key, config] of Object.entries(EXAMPLE_CONFIG)) {
    if (!groups[config.group]) groups[config.group] = [];
    groups[config.group].push({ key, label: config.label });
  }

  let html = `<option value="">-- Select --</option>\n`;
  for (const [groupName, items] of Object.entries(groups)) {
    html += `        <optgroup label="${groupName}">\n`;
    for (const item of items) {
      html += `          <option value="${item.key}">${item.label}</option>\n`;
    }
    html += `        </optgroup>\n`;
  }
  return html.trim();
}

async function buildStandalone() {
  console.log('Building standalone ACDL Visualizer...');

  // 1. Bundle the parser and renderer using esbuild
  console.log('  Bundling TypeScript...');

  // Create a temporary entry point that exports what we need
  const entryContent = `
export { Scanner } from './scanner';
export { Parser } from './parser';
export { renderPrompt, renderPrompts } from './renderPrompt';
`;

  const tempEntryPath = path.join(rootDir, 'src', '_standalone_entry.ts');
  fs.writeFileSync(tempEntryPath, entryContent);

  try {
    const result = await esbuild.build({
      entryPoints: [tempEntryPath],
      bundle: true,
      format: 'iife',
      globalName: 'ACDL',
      write: false,
      target: 'es2020',
      minify: false,
      sourcemap: false,
    });

    // Clean up temp file
    fs.unlinkSync(tempEntryPath);

    const bundledJS = result.outputFiles[0].text;

    // 2. Read CSS
    console.log('  Reading CSS...');
    const cssPath = path.join(rootDir, 'styles.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // 3. Load prompts from files
    console.log('  Loading prompts...');
    const prompts = loadPrompts();

    // 4. Generate HTML
    console.log('  Generating HTML...');
    const html = generateStandaloneHTML(bundledJS, cssContent, prompts);

    // 4. Write output
    const outputPath = path.join(rootDir, 'standalone.html');
    fs.writeFileSync(outputPath, html);

    console.log(`\nStandalone build complete: ${outputPath}`);
    console.log(`  Size: ${(html.length / 1024).toFixed(1)} KB`);

  } catch (error) {
    // Clean up temp file on error
    if (fs.existsSync(tempEntryPath)) {
      fs.unlinkSync(tempEntryPath);
    }
    throw error;
  }
}

function generateStandaloneHTML(bundledJS, cssContent, prompts) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>ACDL Prompt Visualizer - Standalone</title>

  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">

  <!-- Export libraries -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>

  <style>
${cssContent}

/* App Shell Overrides */
body {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-primary);
}

header {
  height: 60px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 16px;
  box-sizing: border-box;
}

header h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

#drop-zone {
  flex: 1;
  max-width: 400px;
  height: 40px;
  border: 1px dashed var(--border-medium);
  border-radius: 8px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

#drop-zone:hover,
#drop-zone.hover {
  background: rgba(59, 130, 246, 0.1);
  border-color: var(--system-border);
  color: var(--text-primary);
}

.browse-btn {
  font-size: 12px;
  color: var(--system-border);
  margin-left: 6px;
  font-weight: 400;
}

.prompt-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.prompt-selector label {
  font-size: 13px;
  color: var(--text-secondary);
}

.prompt-selector select {
  padding: 6px 10px;
  border: 1px solid var(--border-medium);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

.main-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

#sidebar {
  width: 420px;
  min-width: 200px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 12px;
  box-sizing: border-box;
  transition: width 0.3s ease, min-width 0.3s ease, padding 0.3s ease;
}

#sidebar.collapsed {
  width: 0 !important;
  min-width: 0 !important;
  padding: 0 !important;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.panel-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.panel-toggle-btn {
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 8px;
  font-size: 12px;
  transition: all 0.2s ease;
}

.panel-toggle-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--border-medium);
}

#acdl-editor {
  flex: 1;
  width: 100%;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  line-height: 1.5;
  resize: none;
  background: var(--bg-primary);
  color: var(--text-primary);
  box-sizing: border-box;
}

#acdl-editor:focus {
  outline: none;
  border-color: var(--system-border);
  box-shadow: 0 0 0 3px var(--system-glow);
}

#render-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 6px rgba(16, 185, 129, 0.25);
}

#render-btn:hover {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  transform: translateY(-1px);
  box-shadow: 0 6px 12px rgba(16, 185, 129, 0.35);
}

.resizer {
  width: 6px;
  background: var(--border-subtle);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.2s ease;
}

.resizer:hover,
.resizer.dragging {
  background: var(--system-border);
}

#output-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 200px;
  overflow: hidden;
}

#output-wrapper.collapsed {
  min-width: 0 !important;
  flex: 0 !important;
  width: 0 !important;
  overflow: hidden;
}

#output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-subtle);
}

#output-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

#output {
  flex: 1;
  overflow-y: auto;
  padding: 40px;
  background: var(--bg-primary);
}

.restore-btn {
  position: fixed;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 8px;
  font-size: 12px;
  transition: all 0.2s ease;
  display: none;
  z-index: 100;
  writing-mode: vertical-rl;
}

.restore-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--system-border);
}

#restore-sidebar {
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  border-left: none;
  border-radius: 0 4px 4px 0;
}

#restore-output {
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  border-right: none;
  border-radius: 4px 0 0 4px;
}

body.resizing {
  user-select: none;
  cursor: col-resize;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.export-dropdown {
  position: relative;
}

.export-btn {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s ease;
}

.export-btn:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  transform: translateY(-1px);
}

.export-btn svg {
  width: 14px;
  height: 14px;
}

.export-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 4px;
  min-width: 140px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: none;
}

.export-menu.show {
  display: block;
}

.export-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.export-menu-item:hover {
  background: var(--bg-tertiary);
}

.export-menu-item svg {
  width: 16px;
  height: 16px;
  color: var(--text-secondary);
}

.export-btn.loading {
  pointer-events: none;
  opacity: 0.7;
}

.info-msg {
  color: var(--text-secondary);
  text-align: center;
  padding: 60px 40px;
  font-size: 15px;
}
  </style>
</head>

<body>
  <header>
    <h1>ACDL Visualizer</h1>
    <label id="drop-zone" for="acdl-upload">
      Drop .acdl file here <span class="browse-btn">or browse</span>
      <input type="file" id="acdl-upload" accept=".acdl" style="display: none;" />
    </label>
    <div class="prompt-selector">
      <label for="prompt-select">Examples:</label>
      <select id="prompt-select">
        ${generateDropdownHTML()}
      </select>
    </div>
  </header>

  <div class="main-container">
    <aside id="sidebar">
      <div class="panel-header">
        <h3>Source Editor</h3>
        <button class="panel-toggle-btn" id="collapse-sidebar" title="Collapse editor">
          <span>&#x25C0;</span>
        </button>
      </div>
      <textarea id="acdl-editor" placeholder="Enter ACDL code here or select an example prompt..."></textarea>
      <button id="render-btn">Render Visualization</button>
    </aside>

    <div class="resizer" id="resizer"></div>

    <div id="output-wrapper">
      <div id="output-header">
        <h3>Visualization</h3>
        <div class="header-actions">
          <div class="export-dropdown">
            <button class="export-btn" id="export-btn" title="Export visualization">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export
            </button>
            <div class="export-menu" id="export-menu">
              <button class="export-menu-item" id="export-png">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                Export as PNG
              </button>
              <button class="export-menu-item" id="export-pdf">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                Export as PDF
              </button>
            </div>
          </div>
          <button class="panel-toggle-btn" id="collapse-output" title="Collapse visualization">
            <span>&#x25B6;</span>
          </button>
        </div>
      </div>
      <main id="output" class="compact">
        <div class="info-msg">
          Select an example prompt from the dropdown or enter ACDL code, then click "Render Visualization"
        </div>
      </main>
    </div>
  </div>

  <button class="restore-btn" id="restore-sidebar" title="Show editor">Editor</button>
  <button class="restore-btn" id="restore-output" title="Show visualization">Viz</button>

  <!-- Bundled Parser and Renderer -->
  <script>
${bundledJS}
  </script>

  <!-- Embedded Prompts -->
  <script>
const PROMPTS = ${JSON.stringify(prompts, null, 2)};
  </script>

  <!-- UI Logic -->
  <script>
// Extract Parser and renderPrompt from the bundle
const { Parser, renderPrompts } = ACDL;

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function enableCollapsibleBlocks() {
  const headers = document.querySelectorAll(
    ".role-message-header, " +
    ".loop-block-outside-role-header, .loop-block-inside-role-header, " +
    ".switch-block-outside-role-header, .switch-block-inside-role-header, " +
    ".conditional-section-header"
  );
  headers.forEach((header) => {
    const container = header.parentElement;
    if (!container) return;
    header.classList.add("collapsible-header");
    const newHeader = header.cloneNode(true);
    header.parentNode.replaceChild(newHeader, header);
    newHeader.addEventListener("click", () => { container.classList.toggle("collapsed"); });
  });
}

function detectWrappedComments(container) {
  const blockWithComments = container.querySelectorAll('.block-with-comment');
  blockWithComments.forEach(el => {
    const comment = el.querySelector('.inline-comment, .comment');
    if (comment) {
      const lineHeight = parseFloat(getComputedStyle(comment).lineHeight) || 16;
      if (comment.offsetHeight > lineHeight * 1.5) {
        el.classList.add('comment-wrapped');
      } else {
        el.classList.remove('comment-wrapped');
      }
    }
  });
}

function doRender() {
  const input = document.getElementById("acdl-editor").value;
  const output = document.getElementById("output");
  if (!input.trim()) {
    output.innerHTML = '<div class="info-msg">Enter ACDL code and click "Render Visualization"</div>';
    return;
  }
  try {
    const parser = new Parser(input);
    const ast = parser.parseFile();
    const html = renderPrompts(ast);
    output.innerHTML = html;
    enableCollapsibleBlocks();
    detectWrappedComments(output);
  } catch (err) {
    output.innerHTML = '<div class="error-msg">' + escapeHtml(err.message) + '</div>';
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar");
  const resizer = document.getElementById("resizer");
  const outputWrapper = document.getElementById("output-wrapper");
  const collapseSidebar = document.getElementById("collapse-sidebar");
  const collapseOutput = document.getElementById("collapse-output");
  const restoreSidebar = document.getElementById("restore-sidebar");
  const restoreOutput = document.getElementById("restore-output");
  const promptSelect = document.getElementById("prompt-select");
  const editor = document.getElementById("acdl-editor");
  const renderBtn = document.getElementById("render-btn");
  const output = document.getElementById("output");
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("acdl-upload");

  let isResizing = false;
  let lastSidebarWidth = 420;

  // File upload handling
  function handleFile(file) {
    if (!file.name.endsWith(".acdl")) {
      alert("Please select a .acdl file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      editor.value = e.target.result;
      promptSelect.value = "";
      doRender();
    };
    reader.onerror = () => { alert("Error reading file"); };
    reader.readAsText(file);
  }

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
    fileInput.value = "";
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add("hover");
  });

  dropZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("hover");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("hover");
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  promptSelect.addEventListener("change", () => {
    const key = promptSelect.value;
    if (key && PROMPTS[key]) {
      editor.value = PROMPTS[key];
      doRender();
    }
  });

  renderBtn.addEventListener("click", doRender);

  // Tab key handling for editor - insert spaces instead of moving focus
  editor.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.value = editor.value.substring(0, start) + "  " + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
    }
  });

  // Resizer
  resizer.addEventListener("mousedown", (e) => {
    isResizing = true;
    document.body.classList.add("resizing");
    resizer.classList.add("dragging");
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    const containerRect = document.querySelector(".main-container").getBoundingClientRect();
    const newSidebarWidth = e.clientX - containerRect.left;
    const minWidth = 200;
    const maxWidth = containerRect.width - 250;
    if (newSidebarWidth >= minWidth && newSidebarWidth <= maxWidth) {
      sidebar.style.width = newSidebarWidth + "px";
      lastSidebarWidth = newSidebarWidth;
    }
  });

  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      document.body.classList.remove("resizing");
      resizer.classList.remove("dragging");
    }
  });

  // Collapse/expand
  collapseSidebar.addEventListener("click", () => {
    sidebar.classList.add("collapsed");
    restoreSidebar.style.display = "block";
  });

  restoreSidebar.addEventListener("click", () => {
    sidebar.classList.remove("collapsed");
    sidebar.style.width = lastSidebarWidth + "px";
    restoreSidebar.style.display = "none";
  });

  collapseOutput.addEventListener("click", () => {
    outputWrapper.classList.add("collapsed");
    restoreOutput.style.display = "block";
  });

  restoreOutput.addEventListener("click", () => {
    outputWrapper.classList.remove("collapsed");
    restoreOutput.style.display = "none";
  });

  // Export functionality
  const exportBtn = document.getElementById("export-btn");
  const exportMenu = document.getElementById("export-menu");
  const exportPng = document.getElementById("export-png");
  const exportPdf = document.getElementById("export-pdf");

  exportBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle("show");
  });

  document.addEventListener("click", () => { exportMenu.classList.remove("show"); });

  // Helper to find the widest line of content (excluding comments)
  function findWidestLineWidth(container) {
    const lineElements = [];

    // Prompt titles
    container.querySelectorAll('.prompt-title h1').forEach(el => lineElements.push(el));

    // Role body blocks - each child is a line
    container.querySelectorAll('.role-body-block').forEach(block => {
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
    container.querySelectorAll('.loop-block-outside-role-header, .loop-block-inside-role-header, .conditional-block-outside-role-header, .conditional-section-header, .switch-block-outside-role-header, .switch-block-inside-role-header, .switch-case-header, .switch-default-header').forEach(el => lineElements.push(el));

    // Name definitions, End blocks, Label starts/ends
    container.querySelectorAll('.name-def').forEach(el => lineElements.push(el));
    container.querySelectorAll('.end-block').forEach(el => lineElements.push(el));
    container.querySelectorAll('.label-start, .label-end').forEach(el => lineElements.push(el));

    let maxWidth = 0;
    lineElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width > maxWidth) maxWidth = rect.width;
    });

    return maxWidth;
  }

  // Helper function to capture full content
  async function captureFullContent() {
    if (!output.querySelector(".prompt-container")) return null;

    const content = output;

    const originalOutputStyle = output.style.cssText;
    const originalContentStyle = content.style.cssText;
    const originalWrapperStyle = outputWrapper.style.cssText;
    const originalBodyStyle = document.body.style.cssText;

    output.style.overflow = "visible";
    output.style.height = "auto";
    output.style.maxHeight = "none";
    output.style.position = "relative";
    outputWrapper.style.overflow = "visible";
    outputWrapper.style.height = "auto";
    document.body.style.overflow = "visible";

    const inlineFlexEls = content.querySelectorAll(".context-var, .template-block, .func-block, .expr-context-var");
    const savedDisplays = [];
    inlineFlexEls.forEach(el => {
      savedDisplays.push(el.style.display);
      el.style.display = "inline-block";
    });

    // Fix mark blocks
    const markBlocks = content.querySelectorAll(".mark-block");
    const savedMarkBlockStyles = [];
    markBlocks.forEach(el => {
      savedMarkBlockStyles.push(el.style.cssText);
      el.style.display = "flex";
      el.style.alignItems = "stretch";
      el.style.paddingRight = "0";
    });

    const markBrackets = content.querySelectorAll(".mark-block-bracket");
    const savedMarkBracketStyles = [];
    markBrackets.forEach(el => {
      savedMarkBracketStyles.push(el.style.cssText);
      el.style.position = "relative";
      el.style.right = "auto";
      el.style.top = "auto";
      el.style.bottom = "auto";
      el.style.marginLeft = "8px";
    });

    const markContents = content.querySelectorAll(".mark-block-content");
    const savedMarkContentStyles = [];
    markContents.forEach(el => {
      savedMarkContentStyles.push(el.style.cssText);
      el.style.flex = "1";
    });

    const timeIndexEls = content.querySelectorAll(".time-index, .other-index");
    const savedTimeIndexStyles = [];
    timeIndexEls.forEach(el => {
      savedTimeIndexStyles.push(el.style.cssText);
      el.style.display = "inline";
      el.style.color = "#0969da";
      el.style.fontWeight = "700";
      el.style.fontFamily = "'JetBrains Mono', 'SF Mono', monospace";
    });

    const titleH1s = content.querySelectorAll(".prompt-title h1");
    const savedTitleStyles = [];
    titleH1s.forEach(el => {
      savedTitleStyles.push(el.style.cssText);
      el.style.whiteSpace = "nowrap";
    });

    const exportFixStyle = document.createElement("style");
    exportFixStyle.textContent = '.template-block::before { vertical-align: middle; line-height: 1; position: relative; top: -1px; }';
    document.head.appendChild(exportFixStyle);

    const containers = content.querySelectorAll('.prompt-container');
    const savedContainerStyles = [];
    containers.forEach(el => {
      savedContainerStyles.push(el.style.cssText);
      el.style.maxWidth = 'none';
      el.style.width = 'auto';
    });

    // Hide comments and measure natural line widths
    const comments = content.querySelectorAll('.comment, .inline-comment');
    comments.forEach(c => c.style.display = 'none');
    content.offsetHeight;

    const widestLineWidth = findWidestLineWidth(content);
    const contentWidthWithoutComments = Math.ceil(widestLineWidth) + 60;

    // Restore comments and constrain width
    comments.forEach(c => c.style.display = '');
    const constrainedWidth = Math.min(Math.max(contentWidthWithoutComments, 200), 450);

    containers.forEach(el => {
      el.style.width = (constrainedWidth - 40) + 'px';
      el.style.maxWidth = (constrainedWidth - 40) + 'px';
    });
    content.style.width = constrainedWidth + 'px';
    content.style.minWidth = "200px";

    // Calculate available width for comments
    const blockWithComments = content.querySelectorAll('.block-with-comment');
    const savedBlockStyles = [];
    const savedCommentStyles = [];
    blockWithComments.forEach(el => {
      savedBlockStyles.push({ el, style: el.style.cssText, hadClass: el.classList.contains('comment-wrapped') });
      const mainContent = el.firstElementChild;
      const comment = el.querySelector('.inline-comment, .comment');
      if (mainContent && comment) {
        savedCommentStyles.push({ el: comment, style: comment.style.cssText });
        const mainWidth = mainContent.getBoundingClientRect().width;
        const gap = 8;
        const availableForComment = constrainedWidth - 40 - mainWidth - gap;
        const commentMaxWidth = Math.max(80, availableForComment);
        comment.style.maxWidth = commentMaxWidth + 'px';
        comment.style.minWidth = '0';
        comment.style.flex = '0 1 auto';
        comment.style.whiteSpace = 'normal';
        comment.style.overflowWrap = 'break-word';
      }
    });

    content.offsetHeight;

    // Detect wrapped comments
    blockWithComments.forEach(el => {
      const comment = el.querySelector('.inline-comment, .comment');
      if (comment) {
        const lineHeight = parseFloat(getComputedStyle(comment).lineHeight) || 16;
        if (comment.offsetHeight > lineHeight * 1.5) {
          el.classList.add('comment-wrapped');
        } else {
          el.classList.remove('comment-wrapped');
        }
      }
    });

    const fullWidth = Math.max(content.scrollWidth, content.offsetWidth, content.getBoundingClientRect().width);
    const fullHeight = Math.max(content.scrollHeight, content.offsetHeight, content.getBoundingClientRect().height);
    const captureWidth = Math.ceil(fullWidth) + 40;
    const captureHeight = Math.ceil(fullHeight) + 60;

    try {
      const canvas = await html2canvas(content, {
        backgroundColor: "#ffffff",
        scale: window.devicePixelRatio * 2 || 3,
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
        imageTimeout: 0,
        onclone: (clonedDoc) => {
          const styles = document.querySelectorAll('link[rel="stylesheet"], style');
          styles.forEach(style => {
            clonedDoc.head.appendChild(style.cloneNode(true));
          });
        }
      });
      return canvas;
    } finally {
      inlineFlexEls.forEach((el, i) => { el.style.display = savedDisplays[i]; });
      markBlocks.forEach((el, i) => { el.style.cssText = savedMarkBlockStyles[i]; });
      markBrackets.forEach((el, i) => { el.style.cssText = savedMarkBracketStyles[i]; });
      markContents.forEach((el, i) => { el.style.cssText = savedMarkContentStyles[i]; });
      savedBlockStyles.forEach(({ el, style, hadClass }) => {
        el.style.cssText = style;
        if (hadClass) el.classList.add('comment-wrapped');
        else el.classList.remove('comment-wrapped');
      });
      savedCommentStyles.forEach(({ el, style }) => { el.style.cssText = style; });
      timeIndexEls.forEach((el, i) => { el.style.cssText = savedTimeIndexStyles[i]; });
      titleH1s.forEach((el, i) => { el.style.cssText = savedTitleStyles[i]; });
      containers.forEach((el, i) => { el.style.cssText = savedContainerStyles[i]; });
      exportFixStyle.remove();
      output.style.cssText = originalOutputStyle;
      content.style.cssText = originalContentStyle;
      outputWrapper.style.cssText = originalWrapperStyle;
      document.body.style.cssText = originalBodyStyle;
    }
  }

  // Helper to capture all content (entire output with multiple prompts)
  async function captureAllContent() {
    if (!output.querySelector(".prompt-container")) return null;

    const originalOutputStyle = output.style.cssText;
    const originalWrapperStyle = outputWrapper.style.cssText;
    const originalBodyStyle = document.body.style.cssText;

    output.style.overflow = "visible";
    output.style.height = "auto";
    output.style.maxHeight = "none";
    output.style.position = "relative";
    outputWrapper.style.overflow = "visible";
    outputWrapper.style.height = "auto";
    document.body.style.overflow = "visible";

    const inlineFlexEls = output.querySelectorAll(".context-var, .template-block, .func-block, .expr-context-var");
    const savedDisplays = [];
    inlineFlexEls.forEach(el => {
      savedDisplays.push(el.style.display);
      el.style.display = "inline-block";
    });

    const markBlocks = output.querySelectorAll(".mark-block");
    const savedMarkBlockStyles = [];
    markBlocks.forEach(el => {
      savedMarkBlockStyles.push(el.style.cssText);
      el.style.display = "flex";
      el.style.alignItems = "stretch";
      el.style.paddingRight = "0";
    });

    const markBrackets = output.querySelectorAll(".mark-block-bracket");
    const savedMarkBracketStyles = [];
    markBrackets.forEach(el => {
      savedMarkBracketStyles.push(el.style.cssText);
      el.style.position = "relative";
      el.style.right = "auto";
      el.style.top = "auto";
      el.style.bottom = "auto";
      el.style.marginLeft = "8px";
    });

    const markContents = output.querySelectorAll(".mark-block-content");
    const savedMarkContentStyles = [];
    markContents.forEach(el => {
      savedMarkContentStyles.push(el.style.cssText);
      el.style.flex = "1";
    });

    const timeIndexEls = output.querySelectorAll(".time-index, .other-index");
    const savedTimeIndexStyles = [];
    timeIndexEls.forEach(el => {
      savedTimeIndexStyles.push(el.style.cssText);
      el.style.display = "inline";
      el.style.color = "#0969da";
      el.style.fontWeight = "700";
      el.style.fontFamily = "'JetBrains Mono', 'SF Mono', monospace";
    });

    const titleH1s = output.querySelectorAll(".prompt-title h1");
    const savedTitleStyles = [];
    titleH1s.forEach(el => {
      savedTitleStyles.push(el.style.cssText);
      el.style.whiteSpace = "nowrap";
    });

    const exportFixStyle = document.createElement("style");
    exportFixStyle.textContent = '.template-block::before { vertical-align: middle; line-height: 1; position: relative; top: -1px; }';
    document.head.appendChild(exportFixStyle);

    const containers = output.querySelectorAll('.prompt-container');
    const savedContainerStyles = [];
    containers.forEach(el => {
      savedContainerStyles.push(el.style.cssText);
      el.style.maxWidth = 'none';
      el.style.width = 'auto';
    });

    const comments = output.querySelectorAll('.comment, .inline-comment');
    comments.forEach(c => c.style.display = 'none');
    output.offsetHeight;

    const widestLineWidth = findWidestLineWidth(output);
    const contentWidthWithoutComments = Math.ceil(widestLineWidth) + 60;

    comments.forEach(c => c.style.display = '');
    const constrainedWidth = Math.min(Math.max(contentWidthWithoutComments, 200), 450);

    containers.forEach(el => {
      el.style.width = (constrainedWidth - 40) + 'px';
      el.style.maxWidth = (constrainedWidth - 40) + 'px';
    });
    output.style.width = constrainedWidth + 'px';

    const blockWithComments = output.querySelectorAll('.block-with-comment');
    const savedBlockStyles = [];
    const savedCommentStyles = [];
    blockWithComments.forEach(el => {
      savedBlockStyles.push({ el, style: el.style.cssText, hadClass: el.classList.contains('comment-wrapped') });
      const mainContent = el.firstElementChild;
      const comment = el.querySelector('.inline-comment, .comment');
      if (mainContent && comment) {
        savedCommentStyles.push({ el: comment, style: comment.style.cssText });
        const mainWidth = mainContent.getBoundingClientRect().width;
        const gap = 8;
        const availableForComment = constrainedWidth - 40 - mainWidth - gap;
        const commentMaxWidth = Math.max(80, availableForComment);
        comment.style.maxWidth = commentMaxWidth + 'px';
        comment.style.minWidth = '0';
        comment.style.flex = '0 1 auto';
        comment.style.whiteSpace = 'normal';
        comment.style.overflowWrap = 'break-word';
      }
    });

    output.offsetHeight;

    blockWithComments.forEach(el => {
      const comment = el.querySelector('.inline-comment, .comment');
      if (comment) {
        const lineHeight = parseFloat(getComputedStyle(comment).lineHeight) || 16;
        if (comment.offsetHeight > lineHeight * 1.5) {
          el.classList.add('comment-wrapped');
        } else {
          el.classList.remove('comment-wrapped');
        }
      }
    });

    const fullWidth = Math.max(output.scrollWidth, output.offsetWidth, output.getBoundingClientRect().width);
    const fullHeight = Math.max(output.scrollHeight, output.offsetHeight, output.getBoundingClientRect().height);
    const captureWidth = Math.ceil(fullWidth) + 40;
    const captureHeight = Math.ceil(fullHeight) + 60;

    try {
      const canvas = await html2canvas(output, {
        backgroundColor: "#ffffff",
        scale: window.devicePixelRatio * 2 || 3,
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
      return canvas;
    } finally {
      inlineFlexEls.forEach((el, i) => { el.style.display = savedDisplays[i]; });
      markBlocks.forEach((el, i) => { el.style.cssText = savedMarkBlockStyles[i]; });
      markBrackets.forEach((el, i) => { el.style.cssText = savedMarkBracketStyles[i]; });
      markContents.forEach((el, i) => { el.style.cssText = savedMarkContentStyles[i]; });
      timeIndexEls.forEach((el, i) => { el.style.cssText = savedTimeIndexStyles[i]; });
      titleH1s.forEach((el, i) => { el.style.cssText = savedTitleStyles[i]; });
      containers.forEach((el, i) => { el.style.cssText = savedContainerStyles[i]; });
      savedBlockStyles.forEach(({ el, style, hadClass }) => { el.style.cssText = style; if (hadClass) el.classList.add('comment-wrapped'); else el.classList.remove('comment-wrapped'); });
      savedCommentStyles.forEach(({ el, style }) => { el.style.cssText = style; });
      exportFixStyle.remove();
      output.style.cssText = originalOutputStyle;
      outputWrapper.style.cssText = originalWrapperStyle;
      document.body.style.cssText = originalBodyStyle;
    }
  }

  exportPng.addEventListener("click", async () => {
    exportMenu.classList.remove("show");
    if (!output.querySelector(".prompt-container")) {
      alert("No visualization to export. Please render a prompt first.");
      return;
    }
    exportBtn.classList.add("loading");
    try {
      const canvas = await captureAllContent();
      if (!canvas) throw new Error("Failed to capture content");
      const link = document.createElement("a");
      link.download = "acdl-visualization.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export PNG. Please try again.");
    } finally {
      exportBtn.classList.remove("loading");
    }
  });

  exportPdf.addEventListener("click", async () => {
    exportMenu.classList.remove("show");
    if (!output.querySelector(".prompt-container")) {
      alert("No visualization to export. Please render a prompt first.");
      return;
    }
    exportBtn.classList.add("loading");
    try {
      const canvas = await captureAllContent();
      if (!canvas) throw new Error("Failed to capture content");
      const { jsPDF } = window.jspdf;
      const imgData = canvas.toDataURL("image/png");
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const pdfWidth = Math.max(210, (imgWidth / 2) * 0.264583);
      const pdfHeight = (imgHeight / imgWidth) * pdfWidth;
      const pdf = new jsPDF({
        orientation: pdfWidth > pdfHeight ? "landscape" : "portrait",
        unit: "mm",
        format: [pdfWidth, pdfHeight]
      });
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save("acdl-visualization.pdf");
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export PDF. Please try again.");
    } finally {
      exportBtn.classList.remove("loading");
    }
  });
});
  </script>
</body>
</html>`;
}

// Run the build
buildStandalone().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
