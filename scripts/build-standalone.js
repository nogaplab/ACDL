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
  // Basic Patterns
  basic: { file: 'ACDL_examples/other/basic-context.acdl', label: 'Basic Context', group: 'Basic Patterns' },
  rag: { file: 'ACDL_examples/other/basic-rag.acdl', label: 'Basic RAG', group: 'Basic Patterns' },

  // ReAct Patterns
  react: { file: 'website/src/examples/react.acdl', label: 'ReAct', group: 'ReAct Patterns' },
  fig1_left: { file: 'ACDL_examples/React_variants/fig1-left.acdl', label: 'ReAct No Reasoning in History', group: 'ReAct Patterns' },
  fig1_right: { file: 'ACDL_examples/React_variants/fig1-right.acdl', label: 'ReAct with Tool-RAG', group: 'ReAct Patterns' },

  // Real-World Systems
  opencode: { file: 'ACDL_examples/complex_examples/OpenCode.acdl', label: 'OpenCode', group: 'Real-World Systems' },
  openclaw: { file: 'ACDL_examples/complex_examples/OpenClaw.acdl', label: 'OpenClaw', group: 'Real-World Systems' },
  pokemon: { file: 'ACDL_examples/complex_examples/pokemon.acdl', label: 'Pokemon Agent', group: 'Real-World Systems' },
  multiagent: { file: 'ACDL_examples/complex_examples/MultiAgent.acdl', label: 'Multi-Agent Simulation', group: 'Real-World Systems' },
  mintagent: { file: 'ACDL_examples/MintAgent_variants/mint-original.acdl', label: 'MintAgent', group: 'Real-World Systems' },
};

// Load the JetBrains Mono fonts as base64 so the browser SVG renderer has the
// same glyph metrics and embeddable @font-face as the Node CLI. Without this the
// website PDF export computes its layout from guessed widths and text spills out
// of its boxes (see src/svg-layout.ts loadFonts/getFontBase64).
function loadFontsBase64() {
  const fontsDir = path.join(rootDir, 'fonts');
  const readBase64 = (file) => {
    const fontPath = path.join(fontsDir, file);
    try {
      return fs.readFileSync(fontPath).toString('base64');
    } catch (err) {
      console.warn(`  Warning: Could not load font ${file}: ${err.message}`);
      return '';
    }
  };
  return {
    regular: readBase64('JetBrainsMono-Regular.ttf'),
    bold: readBase64('JetBrainsMono-Bold.ttf'),
  };
}

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
export { renderPromptsSvg } from './renderPromptSvg';
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

    // 5b. Load fonts for the SVG/PDF export renderer
    console.log('  Loading fonts...');
    const fonts = loadFontsBase64();

    // 6. Transform the HTML
    console.log('  Transforming HTML...');
    html = transformHTML(html, bundledJS, editorJS, cssContent, prompts, fonts);

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
 * 2. Replace ONLY the Vite module script (editor/example bootstrap) with a
 *    standalone bootstrap that uses the bundled parser/editor + embedded prompts
 *
 * The large inline <script> in src/index.html that follows the module script
 * (resize, width, and PNG/PDF export + trim logic) is intentionally left
 * UNTOUCHED and carried through verbatim. That block is the single source of
 * truth for export behaviour, so the standalone/website visualizer always
 * matches what `npm run dev` produces and can no longer drift out of sync.
 */
function transformHTML(html, bundledJS, editorJS, cssContent, prompts, fonts) {
  // 1. Replace the external CSS link with inlined CSS
  // Match: <link rel="stylesheet" href="./styles.css" />
  // Note: We use replacer functions instead of strings to avoid issues with
  // special replacement patterns ($1, $&, etc.) in the bundled JavaScript code.

  html = html.replace(
    /<link\s+rel="stylesheet"\s+href="\.\/styles\.css"\s*\/?>/,
    () => `<style>\n${cssContent}\n  </style>`
  );

  // 2. Replace the <script type="module"> block (Vite imports from main-ui.ts)
  // with the standalone bootstrap. This is the ONLY script we substitute.
  const moduleScriptRe =
    /<script type="module">[\s\S]*?from\s*"\.\/main-ui\.ts"[\s\S]*?<\/script>/;
  if (!moduleScriptRe.test(html)) {
    throw new Error(
      'build-standalone: could not find the main-ui.ts module <script> in ' +
        'src/index.html. The template structure changed — update ' +
        'transformHTML() in scripts/build-standalone.js before building.'
    );
  }
  html = html.replace(moduleScriptRe, () =>
    generateStandaloneScripts(bundledJS, editorJS, prompts, fonts)
  );

  // Sanity check: the export/trim logic must survive verbatim from
  // src/index.html. If these markers are missing, the build is producing a
  // visualizer that differs from `npm run dev` — fail loudly rather than
  // silently shipping a stale/wrong export.
  const exportMarkers = [
    'async function captureAllContent',
    'drawImage(fullCanvas',
    'const constrainedWidth = Math.min(currentWidth',
  ];
  const missing = exportMarkers.filter((m) => !html.includes(m));
  if (missing.length > 0) {
    throw new Error(
      'build-standalone: the up-to-date PNG export/trim logic was not found ' +
        'in the standalone output (missing: ' +
        missing.join(', ') +
        '). The inline export <script> in src/index.html may have been ' +
        'removed or rewritten.'
    );
  }

  return html;
}

/**
 * Generate the standalone-specific script blocks that replace the Vite module imports
 */
function generateStandaloneScripts(bundledJS, editorJS, prompts, fonts) {
  return `
  <!-- Embedded fonts for the SVG/PDF export renderer (read by src/svg-layout.ts) -->
  <script>
window.__ACDL_FONTS__ = ${JSON.stringify(fonts || {})};
  </script>

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
 * Returns the standalone *bootstrap* JavaScript.
 *
 * This deliberately covers ONLY the parts that genuinely differ from the Vite
 * dev build: wiring up the bundled parser/editor globals, loading examples from
 * the embedded PROMPTS object instead of fetching .acdl files, and the editor /
 * file-drop / render-button handlers (the equivalent of main-ui.ts +
 * src/index.html's <script type="module">).
 *
 * The resize / width / PNG+PDF export + trim logic is NOT duplicated here. It
 * is carried through verbatim from src/index.html's inline export <script>, so
 * `npm run dev` and the built website visualizer always behave identically.
 * The window.ACDL* globals and the detectOverflow() no-op below are the contract
 * that retained script depends on.
 */
function getStandaloneUILogic() {
  return `// Extract Parser and renderPrompts/renderPromptsSvg from the bundle
const { Parser, renderPrompts, renderPromptsSvg } = ACDL;
const { createEditor } = ACDLEditor;

let editorView = null;

// --- Contract with the export <script> carried over from src/index.html ---
// Its PDF export reads these globals; its width slider calls detectOverflow().
window.ACDLParser = Parser;
window.ACDLRenderSvg = renderPromptsSvg;
window.ACDLGetEditorView = function () { return editorView; };

// Overflow detection is a no-op in the dev build too (see main-ui.ts); defined
// here as a global so the retained width-slider handler does not throw.
function detectOverflow() {}

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
  // NOTE: resize / collapse / width / export elements are handled by the
  // export <script> carried over verbatim from src/index.html. This bootstrap
  // only owns the editor, file input, example dropdown and render button.
  const promptSelect = document.getElementById("prompt-select");
  const editorContainer = document.getElementById("acdl-editor-container");
  const renderBtn = document.getElementById("render-btn");
  const output = document.getElementById("output");
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("acdl-upload");

  // Initialize CodeMirror editor
  editorView = createEditor(editorContainer, "");

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

  // ---------------------------------------------------------------------
  // Resize, width-slider and PNG/PDF export are intentionally NOT wired up
  // here. They live in the inline export <script> carried over verbatim
  // from src/index.html so the standalone matches the dev build exactly.
  // ---------------------------------------------------------------------

  // URL parameter handling for loading examples from links
  // Map example page parameter names to PROMPTS keys
  const EXAMPLE_MAP = {
    "basic": "basic",
    "basic_rag": "rag",
    "react": "react",
    "react_tutorial": "react",
    "react_base": "react",
    "react_no_reasoning": "fig1_left",
    "react_tool_rag": "fig1_right",
    "opencode": "opencode",
    "openclaw": "openclaw",
    "pokemon": "pokemon",
    "multiagent": "multiagent",
    "rag": "rag",
    "mintagent": "mintagent",
    // Direct keys also work
    "fig1_base": "react",
    "fig1_left": "fig1_left",
    "fig1_right": "fig1_right"
  };

  const urlParams = new URLSearchParams(window.location.search);
  const exampleParam = urlParams.get("example");
  if (exampleParam) {
    const promptKey = EXAMPLE_MAP[exampleParam] || exampleParam;
    if (PROMPTS[promptKey]) {
      setEditorContent(PROMPTS[promptKey]);
      promptSelect.value = promptKey;
      doRender();
    }
  }
});`;
}

// Run the build
buildStandalone().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
