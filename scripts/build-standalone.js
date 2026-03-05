#!/usr/bin/env node
/**
 * Build script for generating the standalone ACDL Visualizer HTML file.
 *
 * This script:
 * 1. Reads src/index.html as the base template
 * 2. Bundles the TypeScript parser and renderer into plain JavaScript
 * 3. Reads the CSS from src/styles.css and inlines it
 * 4. Embeds example prompts and standalone UI logic
 * 5. Outputs dist/website/visualizer.html
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
  fig1_base: { file: 'ACDL_examples/React_variants/fig1-base.acdl', label: 'ReAct Base', group: 'React Variants' },
  fig1_left: { file: 'ACDL_examples/React_variants/fig1-left.acdl', label: 'ReAct Left', group: 'React Variants' },
  fig1_right: { file: 'ACDL_examples/React_variants/fig1-right.acdl', label: 'ReAct Right', group: 'React Variants' },

  // Examples
  rag: { file: 'ACDL_examples/other/basic-rag.acdl', label: 'RAG', group: 'Examples' },
  mintagent: { file: 'ACDL_examples/MintAgent_variants/mint-original.acdl', label: 'MintAgent', group: 'Examples' },
  multiagent: { file: 'ACDL_examples/complex_examples/MultiAgent.acdl', label: 'MultiAgent', group: 'Examples' },

  // Advanced
  openclaw: { file: 'ACDL_examples/complex_examples/OpenClaw.acdl', label: 'OpenClaw', group: 'Advanced' },
  opencode: { file: 'ACDL_examples/complex_examples/OpenCode.acdl', label: 'OpenCode', group: 'Advanced' },
  pokemon: { file: 'ACDL_examples/complex_examples/pokemon.acdl', label: 'Pokemon', group: 'Advanced' },
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

async function buildStandalone() {
  console.log('Building standalone ACDL Visualizer...');

  // 1. Read the source HTML template
  console.log('  Reading src/index.html...');
  const htmlPath = path.join(rootDir, 'src', 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf-8');

  // 2. Bundle the parser and renderer using esbuild
  console.log('  Bundling parser/renderer...');

  // Create a temporary entry point that exports what we need
  const entryContent = `
export { Scanner } from './scanner';
export { Parser } from './parser';
export { renderPrompt, renderPrompts } from './renderPrompt';
`;

  const tempEntryPath = path.join(rootDir, 'src', '_standalone_entry.ts');
  fs.writeFileSync(tempEntryPath, entryContent);

  // 3. Bundle the CodeMirror editor
  console.log('  Bundling CodeMirror editor...');

  const editorEntryContent = `
import { EditorView, keymap, lineNumbers, highlightActiveLine,
  highlightActiveLineGutter, drawSelection, placeholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { acdlStreamLanguage } from "./editor/acdl-language.js";
import { acdlHighlighting } from "./editor/acdl-theme.js";
import { acdlLinter } from "./editor/acdl-lint.js";

export function createEditor(parent, initialDoc) {
  return new EditorView({
    state: EditorState.create({
      doc: initialDoc,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        history(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        highlightSelectionMatches(),
        placeholder("Enter ACDL code here or select an example prompt..."),
        acdlHighlighting,
        acdlStreamLanguage,
        acdlLinter,
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        EditorView.theme({
          "&": {
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: "13px",
            lineHeight: "1.6",
          },
          ".cm-content": {
            padding: "16px 0",
          },
          ".cm-gutters": {
            background: "var(--bg-secondary)",
            borderRight: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          },
          "&.cm-focused": {
            outline: "none",
          },
          ".cm-activeLine": {
            background: "rgba(0, 0, 0, 0.04)",
          },
          ".cm-activeLineGutter": {
            background: "rgba(0, 0, 0, 0.06)",
          },
        }),
      ],
    }),
    parent,
  });
}

export { EditorView };
`;

  const tempEditorEntryPath = path.join(rootDir, 'src', '_standalone_editor_entry.ts');
  fs.writeFileSync(tempEditorEntryPath, editorEntryContent);

  try {
    const [parserResult, editorResult] = await Promise.all([
      esbuild.build({
        entryPoints: [tempEntryPath],
        bundle: true,
        format: 'iife',
        globalName: 'ACDL',
        write: false,
        target: 'es2020',
        minify: false,
        sourcemap: false,
      }),
      esbuild.build({
        entryPoints: [tempEditorEntryPath],
        bundle: true,
        format: 'iife',
        globalName: 'ACDLEditor',
        write: false,
        target: 'es2020',
        minify: false,
        sourcemap: false,
      }),
    ]);

    // Clean up temp files
    fs.unlinkSync(tempEntryPath);
    fs.unlinkSync(tempEditorEntryPath);

    const bundledJS = parserResult.outputFiles[0].text;
    const editorJS = editorResult.outputFiles[0].text;

    // 4. Read CSS
    console.log('  Reading CSS...');
    const cssPath = path.join(rootDir, 'src', 'styles.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // 5. Load prompts from files
    console.log('  Loading prompts...');
    const prompts = loadPrompts();

    // 6. Transform the HTML
    console.log('  Transforming HTML...');
    html = transformHTML(html, bundledJS, editorJS, cssContent, prompts);

    // 7. Write output to dist/website/visualizer.html
    const websiteDir = path.join(rootDir, 'dist', 'website');
    if (!fs.existsSync(websiteDir)) {
      fs.mkdirSync(websiteDir, { recursive: true });
    }
    const outputPath = path.join(websiteDir, 'visualizer.html');
    fs.writeFileSync(outputPath, html);

    console.log(`\nStandalone build complete:`);
    console.log(`  ${outputPath}`);
    console.log(`  Size: ${(html.length / 1024).toFixed(1)} KB`);

  } catch (error) {
    // Clean up temp files on error
    if (fs.existsSync(tempEntryPath)) {
      fs.unlinkSync(tempEntryPath);
    }
    if (fs.existsSync(tempEditorEntryPath)) {
      fs.unlinkSync(tempEditorEntryPath);
    }
    throw error;
  }
}

/**
 * Transform the source HTML into a standalone version:
 * 1. Replace the external CSS link with inlined styles
 * 2. Remove the Vite module scripts
 * 3. Add bundled JS, embedded prompts, and standalone UI logic
 */
function transformHTML(html, bundledJS, editorJS, cssContent, prompts) {
  // 1. Replace the external CSS link with inlined CSS
  // Match: <link rel="stylesheet" href="./styles.css" />
  // Note: We use replacer functions instead of strings to avoid issues with
  // special replacement patterns ($1, $&, etc.) in the bundled JavaScript code.

  html = html.replace(
    /<link\s+rel="stylesheet"\s+href="\.\/styles\.css"\s*\/?>/,
    () => `<style>\n${cssContent}\n  </style>`
  );

  // 2. Remove the first <script type="module"> block (Vite imports from main-ui.ts)
  // This block starts with: <script type="module"> and contains import from "./main-ui.ts"
  html = html.replace(
    /<script type="module">[\s\S]*?import[\s\S]*?from\s*"\.\/main-ui\.ts"[\s\S]*?<\/script>/,
    () => ''
  );

  // 3. Remove the second inline <script> block (resize/export handlers - we'll replace with standalone version)
  // This is the large script block that handles resizing, collapsing, and export functionality
  // Match from the <script> tag containing "const sidebar" through the closing </body>
  html = html.replace(
    /<script>\s*document\.addEventListener\("DOMContentLoaded"[\s\S]*?const\s+sidebar[\s\S]*?<\/script>\s*<\/body>/,
    () => generateStandaloneScripts(bundledJS, editorJS, prompts) + '\n</body>'
  );

  return html;
}

/**
 * Generate the standalone-specific script blocks that replace the Vite module imports
 */
function generateStandaloneScripts(bundledJS, editorJS, prompts) {
  return `
  <!-- Bundled Parser and Renderer -->
  <script>
${bundledJS}
  </script>

  <!-- Bundled CodeMirror Editor -->
  <script>
${editorJS}
  </script>

  <!-- Embedded Prompts -->
  <script>
const PROMPTS = ${JSON.stringify(prompts, null, 2)};
  </script>

  <!-- Standalone UI Logic -->
  <script>
${getStandaloneUILogic()}
  </script>`;
}

/**
 * Returns the standalone UI logic JavaScript.
 * This is kept separately in the build script because it uses different
 * initialization than the Vite development version.
 */
function getStandaloneUILogic() {
  return `// Extract Parser and renderPrompt from the bundle
const { Parser, renderPrompts } = ACDL;
const { createEditor } = ACDLEditor;

let editorView = null;

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
  if (!editorView) return;
  const input = editorView.state.doc.toString();
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
  const editorContainer = document.getElementById("acdl-editor-container");
  const renderBtn = document.getElementById("render-btn");
  const output = document.getElementById("output");
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("acdl-upload");

  // Initialize CodeMirror editor
  editorView = createEditor(editorContainer, "");

  let isResizing = false;
  let lastSidebarWidth = 420;

  // Helper to set editor content
  function setEditorContent(text) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: text }
    });
  }

  // File upload handling
  function handleFile(file) {
    if (!file.name.endsWith(".acdl")) {
      alert("Please select a .acdl file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setEditorContent(e.target.result);
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

  // Example prompt selection - uses embedded PROMPTS object
  promptSelect.addEventListener("change", () => {
    const key = promptSelect.value;
    if (key && PROMPTS[key]) {
      setEditorContent(PROMPTS[key]);
      doRender();
    }
  });

  renderBtn.addEventListener("click", doRender);

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

  // Width control functionality
  const widthSlider = document.getElementById("width-slider");
  const widthInput = document.getElementById("width-input");
  let currentWidth = 800; // Default width

  function updateWidth(value) {
    // Clamp value to valid range
    value = Math.min(900, Math.max(250, parseInt(value) || 800));
    currentWidth = value;
    widthSlider.value = value;
    widthInput.value = value;

    // Apply width directly to all prompt containers via inline style
    const containers = output.querySelectorAll('.prompt-container');
    containers.forEach(el => {
      el.style.maxWidth = value + 'px';
    });
  }

  widthSlider.addEventListener("input", (e) => updateWidth(e.target.value));
  widthInput.addEventListener("change", (e) => updateWidth(e.target.value));
  widthInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") updateWidth(e.target.value);
  });

  // +/- buttons for width adjustment
  const widthDecrease = document.getElementById("width-decrease");
  const widthIncrease = document.getElementById("width-increase");
  const STEP = 10; // Width change per click

  widthDecrease.addEventListener("click", () => updateWidth(currentWidth - STEP));
  widthIncrease.addEventListener("click", () => updateWidth(currentWidth + STEP));

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
    container.querySelectorAll('.prompt-title h1').forEach(el => lineElements.push(el));
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
    container.querySelectorAll('.loop-block-outside-role-header, .loop-block-inside-role-header, .conditional-block-outside-role-header, .conditional-section-header, .switch-block-outside-role-header, .switch-block-inside-role-header, .switch-case-header, .switch-default-header').forEach(el => lineElements.push(el));
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

  // Helper to capture all content for export
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
    // Use the slider width for export
    const constrainedWidth = currentWidth;
    console.log('Export using width:', constrainedWidth, 'px');

    // Add a style element to FORCE the width with !important
    const widthOverrideStyle = document.createElement('style');
    widthOverrideStyle.id = 'export-width-override';
    widthOverrideStyle.textContent = '.prompt-container { width: ' + constrainedWidth + 'px !important; max-width: ' + constrainedWidth + 'px !important; }';
    document.head.appendChild(widthOverrideStyle);

    // Also set inline styles as backup
    containers.forEach(el => {
      el.style.width = constrainedWidth + 'px';
      el.style.maxWidth = constrainedWidth + 'px';
    });
    output.style.setProperty('--prompt-width', constrainedWidth + 'px');

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
    // Minimal padding to avoid cropping
    const captureWidth = Math.ceil(fullWidth) + 10;
    const captureHeight = Math.ceil(fullHeight) + 10;

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
        imageTimeout: 0,
        onclone: (clonedDoc) => {
          // Copy all stylesheets to the cloned document
          const styles = document.querySelectorAll('link[rel="stylesheet"], style');
          styles.forEach(style => {
            clonedDoc.head.appendChild(style.cloneNode(true));
          });
          // Re-apply width to cloned containers to FORCE the slider width
          const clonedContainers = clonedDoc.querySelectorAll('.prompt-container');
          clonedContainers.forEach(el => {
            el.style.width = constrainedWidth + 'px';
            el.style.maxWidth = constrainedWidth + 'px';
          });
        }
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
      widthOverrideStyle.remove();
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
});`;
}

// Run the build
buildStandalone().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
