# PDDL Prompt Renderer

This project implements a **TypeScript-based DSL and renderer** for structured prompts.
It allows writing prompts programmatically (using constructors) and rendering them as a
readable, interactive HTML visualization.

The project is **fully self-contained** and runs in a clean environment using **Vite**.
No global installations are required.

---

## Project Overview

The project consists of three main parts:

1. **DSL Types & Constructors**  
   Located under `src/types/`, these define the prompt language:
   - Prompt, roles, templates, functions
   - Context variables with indexed paths
   - Loops, conditionals, and switches (inside and outside roles)

2. **Renderer**  
   The renderer walks a parsed prompt structure and produces HTML:
   - Role blocks are color-coded
   - Loops, conditionals, and switches are nested visually
   - Blocks are collapsible for readability

3. **Viewer (index.html)**  
   A simple HTML page that loads the renderer and displays the result in the browser.

---

## Requirements

- Node.js (version 18+ recommended)
- npm (comes with Node)

---

## Setup & Run

From the project root:

### 1. Install dependencies
```bash
npm install
```

### 2. Start the Development Server
```bash
npm run dev
```

This command starts the Vite development server. Vite will:
- Compile TypeScript automatically
- Start a local development server
- Serve index.html as the application entry point

After running the command, open the provided local URL (usually http://localhost:5173) in your browser.

---

## Running Different Examples
The rendered prompt is selected in:

```css
src/main.ts
```

Example:

```ts
Copy code
import { examplePrompt } from "./example";
import { renderPrompt } from "./renderPrompt";

export function runRenderer() {
  return renderPrompt(examplePrompt);
}
```

To render a different example:
1. Create a new example file (e.g. examplePrompt2.ts)
2. Export a prompt from that file
3. Import it in main.ts and pass it to renderPrompt
4. Vite will hot-reload automatically when files are changed.

---

## Design Notes

- The project intentionally avoids global state and side effects
- All DSL structures are explicit and strongly typed
- Rendering is deterministic and purely functional
- Vite is used to ensure reproducibility and ease of execution in a clean environment
