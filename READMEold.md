# PDDL Prompt Renderer

This project implements a **TypeScript-based DSL and renderer** for structured prompts.
It allows writing prompts programmatically (using constructors) and rendering them as a
readable, interactive HTML visualization.

The project supports **two execution modes**:
- an interactive **browser-based viewer** powered by Vite
- a **serverless static HTML generator** powered by Bun

Both modes share the same rendering logic and DSL definitions.

---

## Project Overview

The project consists of the following main components:

### 1. DSL Types & Constructors
Located under `src/types/`, these define the prompt description language:
- Prompt titles and indices
- Role messages
- Templates and functions
- Context variables with indexed, nested paths
- Control structures (loops, conditionals, switches) inside and outside roles

Prompts are constructed programmatically using helper constructors rather than raw objects.

---

### 2. Renderer
The renderer walks a parsed prompt structure and produces **HTML fragments**:
- Each prompt is rendered into a single container element
- Role blocks are color-coded
- Control structures are visually nested
- Blocks are collapsible for readability
- Semantic content (templates, functions, context variables) is emphasized visually

The renderer **does not produce full HTML pages**; it returns reusable fragments that can
be embedded multiple times in the same document.

---

### 3. Example Prompts
Example prompts are located under: `src/examples/`

All examples are registered in a centralized registry (`src/examples/index.ts`), allowing:
- declarative selection of examples
- reuse across browser and CLI workflows
- extension without modifying renderer logic

---

### 4. Viewer (index.html)
The browser viewer is implemented via `index.html` and Vite:
- Loads the renderer and selected examples
- Applies styling via an external CSS file
- Enables interactive features such as collapsing blocks
- Supports rendering multiple prompts on the same page

---

## Requirements

- **Node.js** (version 18+ recommended)
- **npm** (comes with Node)
- **Bun** (for static HTML generation)

---

## Setup

From the project root:

```bash
npm install
```

---

## Running the Interactive Viewer (Vite)

Start the development server:
```bash
npm run dev
```

Vite will:
- Compile TypeScript automatically
- Start a local development server
- Serve index.html as the application entry point

After the server starts, open the provided URL (usually `http://localhost:5173`) in your browser.

### Selecting Examples (Browser Mode)

The rendered examples are selected in `index.html`:
```html
<script type="module">
  import { runRenderer } from "/src/main.ts";

  runRenderer(["example1", "example3"]);
</script>
```
Vite hot-reloads automatically when files change.

---

## Static HTML Generation (No Server)

The project also supports generating standalone HTML files without running a server. This mode is intended for submission, sharing, or offline viewing.

Static rendering is powered by **Bun**.

### Generate a static HTML file
```bash
npm run render:static -- output.html --examples example1,example2
```
This command:
- Runs the renderer in a CLI environment
- Renders the selected example prompts
- Wraps them in a full HTML document
- Writes the result to output.html
- Copies required styling assets alongside the output
- The generated file can be opened directly in a browser using file://.

---

## Selecting Examples (Static Mode)
- Examples are selected using the --examples flag:
```bash
npm run render:static -- output.html --examples example2,example3
```
Example names must match keys defined in:
```bash
src/examples/index.ts
```

---

## Styling

All styling is defined in a separate styles.css file located in the project root. This file is shared by:
- the Vite-based viewer
- the static HTML output

The styling emphasizes semantic content over structural syntax:
- Control structures are visually subdued
- Templates, functions, and context variables are highlighted

---

## Design Notes

- Rendering is deterministic and side-effect free
- HTML fragment generation is separated from document generation
- The same renderer is used for browser and CLI workflows
- Example selection is decoupled from rendering logic
- No global installations or implicit assumptions are required
- The project is reproducible in a clean environment

---

## Tooling Summary

- **TypeScript** — DSL definitions and renderer implementation
- **Vite** — interactive development and browser-based visualization
- **Bun** — serverless static HTML generation
- **npm** — dependency management and script orchestration
