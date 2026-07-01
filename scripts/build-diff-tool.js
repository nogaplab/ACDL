#!/usr/bin/env node
/**
 * Build the standalone ACDL Diff tool: dist/website/diff.html
 *
 * A self-contained page with two ACDL editors and a live structural diff between
 * them. Mirrors scripts/build-standalone.js: it bundles the diff engine
 * (src/diff.ts) and the CodeMirror editor (src/editor/setup.ts) into IIFE
 * globals and inlines them into a single HTML file — no server, no build step at
 * runtime.
 *
 * Usage: node scripts/build-diff-tool.js
 */

import * as fs from "fs";
import * as path from "path";
import * as esbuild from "esbuild";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Preset comparison pairs shown in the dropdown. Each side is an .acdl file.
const PRESETS = [
  {
    key: "react",
    label: "ReAct: v1 → v2",
    a: "ACDL_examples/React_variants/react1.acdl",
    b: "ACDL_examples/React_variants/react2.acdl",
  },
  {
    key: "mint",
    label: "MintAgent: opt1 → opt2",
    a: "ACDL_examples/MintAgent_variants/opt1.acdl",
    b: "ACDL_examples/MintAgent_variants/opt2.acdl",
  },
  {
    key: "presentation",
    label: "Presentation: option1 → option2",
    a: "ACDL_examples/presentation_variants/option1.acdl",
    b: "ACDL_examples/presentation_variants/option2.acdl",
  },
];

function readSafe(rel) {
  try {
    return fs.readFileSync(path.join(rootDir, rel), "utf-8");
  } catch (err) {
    console.warn(`  Warning: could not read ${rel}: ${err.message}`);
    return "";
  }
}

function loadPresets() {
  return PRESETS.map((p) => ({
    key: p.key,
    label: p.label,
    a: readSafe(p.a),
    b: readSafe(p.b),
  }));
}

async function build() {
  console.log("Building standalone ACDL Diff tool...");

  // 1. Bundle the diff engine (diffFiles / formatDiffHtml / DIFF_CSS).
  const diffEntry = path.join(rootDir, "src", "_diff_entry.ts");
  fs.writeFileSync(
    diffEntry,
    `export { diffFiles, formatDiffHtml, DIFF_CSS } from "./diff";\n`
  );

  // 2. Bundle the CodeMirror editor factory.
  const editorEntry = path.join(rootDir, "src", "_diff_editor_entry.ts");
  fs.writeFileSync(
    editorEntry,
    `export { createEditor, EditorView } from "./editor/setup";\n`
  );

  try {
    console.log("  Bundling diff engine + editor...");
    const [diffResult, editorResult] = await Promise.all([
      esbuild.build({
        entryPoints: [diffEntry],
        bundle: true,
        format: "iife",
        globalName: "ACDLDiff",
        write: false,
        target: "es2020",
      }),
      esbuild.build({
        entryPoints: [editorEntry],
        bundle: true,
        format: "iife",
        globalName: "ACDLEditor",
        write: false,
        target: "es2020",
      }),
    ]);

    fs.unlinkSync(diffEntry);
    fs.unlinkSync(editorEntry);

    const diffJS = diffResult.outputFiles[0].text;
    const editorJS = editorResult.outputFiles[0].text;
    const presets = loadPresets();

    const html = page(diffJS, editorJS, presets);

    const outDir = path.join(rootDir, "dist", "website");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "diff.html");
    fs.writeFileSync(outPath, html);

    console.log(`\nDiff tool build complete:`);
    console.log(`  ${outPath}`);
    console.log(`  Size: ${(html.length / 1024).toFixed(1)} KB`);
  } catch (err) {
    for (const f of [diffEntry, editorEntry]) if (fs.existsSync(f)) fs.unlinkSync(f);
    throw err;
  }
}

function page(diffJS, editorJS, presets) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ACDL Structural Diff</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #ffffff;
      --bg-secondary: #f6f8fa;
      --border-subtle: #d0d7de;
      --text-primary: #1f2328;
      --text-muted: #6e7781;
      --accent: #7877c6;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; }
    body {
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text-primary); background: var(--bg-primary);
      display: flex; flex-direction: column; height: 100vh; overflow: hidden;
    }
    header {
      display: flex; align-items: center; gap: 16px;
      padding: 12px 20px; background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-subtle); flex: 0 0 auto;
    }
    header .logo { font-weight: 700; font-size: 18px; color: var(--text-primary); text-decoration: none; }
    header .logo:hover { color: var(--accent); }
    header h1 { margin: 0; font-size: 15px; font-weight: 600; color: var(--text-muted); }
    header .spacer { flex: 1; }
    header select, header button {
      font: 500 13px/1 "Inter", sans-serif; color: var(--text-primary);
      background: #fff; border: 1px solid var(--border-subtle); border-radius: 6px;
      padding: 7px 10px; cursor: pointer;
    }
    header button:hover, header select:hover { border-color: #9aa4af; }

    .editors { display: flex; flex: 1 1 55%; min-height: 0; border-bottom: 1px solid var(--border-subtle); }
    .pane { display: flex; flex-direction: column; flex: 1 1 50%; min-width: 0; }
    .pane + .pane { border-left: 1px solid var(--border-subtle); }
    .pane-label {
      padding: 6px 14px; font: 600 12px/1.4 "Inter", sans-serif; color: var(--text-muted);
      background: var(--bg-secondary); border-bottom: 1px solid var(--border-subtle);
      display: flex; align-items: center; gap: 8px;
    }
    .pane-label .dot { width: 8px; height: 8px; border-radius: 50%; }
    .pane-a .dot { background: #cf222e; }
    .pane-b .dot { background: #1a7f37; }
    .editor-host { flex: 1; min-height: 0; overflow: auto; }
    .cm-editor { height: 100%; }

    .diff-out { flex: 1 1 45%; min-height: 0; overflow: auto; padding: 16px 20px; background: #fff; }
    .diff-out .heading { font: 600 12px/1 "Inter"; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 12px; }
    .diff-error { color: #cf222e; font-family: "JetBrains Mono", monospace; white-space: pre-wrap; font-size: 13px; }

    ${diffCssPlaceholder()}
  </style>
</head>
<body>
  <header>
    <a class="logo" href="index.html">ACDL</a>
    <h1>Structural Diff</h1>
    <div class="spacer"></div>
    <label style="font-size:13px;color:var(--text-muted);">Example:</label>
    <select id="preset"></select>
    <button id="swap" title="Swap the two sides">⇄ Swap</button>
  </header>

  <div class="editors">
    <div class="pane pane-a">
      <div class="pane-label"><span class="dot"></span>Base (A)</div>
      <div class="editor-host" id="editor-a"></div>
    </div>
    <div class="pane pane-b">
      <div class="pane-label"><span class="dot"></span>Compare (B)</div>
      <div class="editor-host" id="editor-b"></div>
    </div>
  </div>

  <div class="diff-out">
    <div class="heading">Differences</div>
    <div id="diff-body"></div>
  </div>

  <script>${editorJS}</script>
  <script>${diffJS}</script>
  <script>
    const PRESETS = ${JSON.stringify(presets)};
    const { createEditor } = ACDLEditor;
    const { diffFiles, formatDiffHtml, DIFF_CSS } = ACDLDiff;

    // Inject the diff stylesheet (single source of truth in src/diff.ts).
    const styleEl = document.createElement("style");
    styleEl.textContent = DIFF_CSS;
    document.head.appendChild(styleEl);

    const first = PRESETS[0] || { a: "", b: "" };
    const edA = createEditor(document.getElementById("editor-a"), first.a);
    const edB = createEditor(document.getElementById("editor-b"), first.b);

    const out = document.getElementById("diff-body");
    let timer = null;
    function scheduleDiff() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(runDiff, 200);
    }
    function runDiff() {
      const a = edA.state.doc.toString();
      const b = edB.state.doc.toString();
      try {
        out.innerHTML = formatDiffHtml(diffFiles(a, b));
      } catch (err) {
        out.innerHTML = '<div class="diff-error">Could not parse: ' +
          String(err && err.message ? err.message : err).replace(/</g, "&lt;") + '</div>';
      }
    }

    // Re-diff whenever either editor changes.
    const { EditorView } = ACDLEditor;
    function watch(view) {
      const orig = view.dispatch.bind(view);
      view.dispatch = (...args) => { orig(...args); scheduleDiff(); };
    }
    watch(edA); watch(edB);

    function setEditor(view, text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    }

    // Preset dropdown.
    const sel = document.getElementById("preset");
    PRESETS.forEach((p, i) => {
      const o = document.createElement("option");
      o.value = String(i); o.textContent = p.label; sel.appendChild(o);
    });
    sel.addEventListener("change", () => {
      const p = PRESETS[Number(sel.value)];
      if (!p) return;
      setEditor(edA, p.a); setEditor(edB, p.b);
    });

    // Swap sides.
    document.getElementById("swap").addEventListener("click", () => {
      const a = edA.state.doc.toString();
      const b = edB.state.doc.toString();
      setEditor(edA, b); setEditor(edB, a);
    });

    runDiff();
  </script>
</body>
</html>`;
}

// The diff CSS lives in src/diff.ts (DIFF_CSS). It's already bundled into the
// diff engine IIFE, but the <style> block needs it at build time too, so we pull
// it from the bundle output by re-importing at runtime is not possible here;
// instead the engine exposes it and we inject it via JS after load. To keep the
// initial paint styled, we also emit a minimal copy here.
function diffCssPlaceholder() {
  return `/* .acdl-diff styles are injected at runtime from ACDLDiff.DIFF_CSS */`;
}

build().catch((err) => {
  console.error("Diff tool build failed:", err);
  process.exit(1);
});
