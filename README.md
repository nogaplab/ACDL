# ACDL Prompt Renderer

A TypeScript compiler and interactive visualizer for the **Agentic Context Description Language (ACDL)** — a declarative language for specifying, documenting, and reasoning about LLM prompt structures.

ACDL captures the architecture of prompts: which role messages exist, what dynamic content they contain, how they evolve over time, and under what conditions sections appear or repeat. This tool parses `.acdl` files and renders them as interactive HTML visualizations.

---

## Features

- **Compiler pipeline**: Scanner, recursive descent parser, and AST-based renderer (`src/scanner.ts` -> `src/parser.ts` -> `src/renderPrompt.ts`)
- **Semantic highlighting**: Distinct visual treatments for Templates (all-caps), Functions, and Context Variables (`env`, `sys`, `resp`, `prompt`)
- **Role partitioning**: Color-coded containment for `system`, `user`, `assistant`, `tool`, and `none` (completion) messages
- **Control flow visualization**: Indented block-wrapping for `If/ElseIf/Else`, `ForEach`, and `Switch/Case/Default`
- **Label blocks**: Named grouping sections for organizing related prompt blocks
- **Collapsible blocks**: Click any block header to collapse/expand it
- **CodeMirror editor**: In-browser editing with syntax highlighting, bracket matching, and live linting
- **Compact mode**: Toggle a paper-friendly dense layout for research publications
- **Export**: Save visualizations as PNG or PDF directly from the browser
- **CLI export**: Generate standalone HTML files with bundled CSS via Bun

---

## Getting Started

### Prerequisites
- **Node.js** (v18+)
- **Bun** (required for the CLI generator)

### Installation
```bash
npm install
```

---

## Usage

### Browser Viewer (Vite)

```bash
npm run dev
```

Open the URL provided (usually http://localhost:5173). You can:
- Write or paste ACDL directly in the editor panel
- Drag and drop a `.acdl` file onto the header bar
- Browse for a file using the upload button
- Click **Render Flowchart** to visualize
- Toggle **Compact** mode for paper-ready output
- Export the visualization as PNG or PDF

### Static HTML Generator (CLI)

Generates portable, self-contained HTML files with all CSS inlined.

```bash
# Looks up the file in the Prompts/ folder by default
bun run cli -- output.html my_prompt_name

# Render multiple files with a specific style
bun run cli -- comparison.html prompt_v1 prompt_v2 --style compact

# Render from an absolute path
bun run cli -- result.html "C:/path/to/my_logic.acdl"
```

The `--style` flag applies a rendering style. Define new styles by adding `.style-[name]` classes to `styles.css`.

| Style | Description |
| :--- | :--- |
| **default** | Balanced spacing with clear role headers |
| **compact** | Minimalist layout for dense, complex prompts |

---

## Project Structure

```
src/
  scanner.ts          Lexical tokenizer
  tokens.ts           Token type definitions
  parser.ts           Recursive descent parser
  types.ts            AST type definitions
  constructors.ts     AST node factory functions
  renderPrompt.ts     AST -> HTML renderer
  main-ui.ts          Browser viewer entry point
  main-cli.ts         CLI generator entry point
  ui.ts               Collapsible block behavior
  editor/
    setup.ts           CodeMirror initialization
    acdl-language.ts   ACDL language mode for CodeMirror
    acdl-theme.ts      Editor syntax highlighting theme
    acdl-lint.ts       Live parse-error linting

Prompts/              Default home for .acdl source files
styles.css            Shared stylesheet for all rendering modes
index.html            Browser viewer shell
ConceptualGuide.md    Language design and concepts
SyntaxReference.MD    Language syntax reference
```

---

## VSCode Extension

A VSCode extension is included that provides full language support for `.acdl` files:

- **Syntax highlighting** — color-coded keywords, roles, templates, context variables, strings, comments
- **Bracket matching** and **auto-closing** pairs
- **Comment toggling** (`Ctrl+/`)
- **Code folding** for `{ }` blocks
- **Live diagnostics** — parse errors shown as red underlines in real time
- **Preview panel** — `Ctrl+Shift+P` → "ACDL: Show Preview" renders the visualization alongside the editor
- **Go-to-definition** — click on `prompt.X` references to jump to label definitions

### Install from the repo

```bash
code --install-extension extension/acdl-language-0.1.0.vsix
```

Or in VSCode: `Ctrl+Shift+P` → **Extensions: Install from VSIX...** → select `extension/acdl-language-0.1.0.vsix`.

After installing, reload VSCode (`Ctrl+Shift+P` → **Developer: Reload Window**).

---

## Language Documentation

- **[ConceptualGuide.md](ConceptualGuide.md)** — Design principles, the core model of prompts as role message sequences, context variable namespaces, time indexing, and control flow semantics.
- **[SyntaxReference.MD](SyntaxReference.MD)** — Formal syntax reference covering file structure, scoping rules, role messages, context variables, templates, functions, and all control flow constructs.
