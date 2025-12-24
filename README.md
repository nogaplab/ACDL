# 📝 PDDL Prompt Renderer

This project implements a **TypeScript-based DSL parser and renderer** for structured prompts. It allows writing prompts in a specialized PDDL-inspired format and rendering them as a readable, interactive HTML visualization.

The project supports **two execution modes**:
- 🌐 **Interactive Browser Viewer**: A real-time drag-and-drop interface powered by **Vite**.
- 🛠️ **Static HTML Generator**: A serverless CLI tool powered by **Bun** for portable exports.

Both modes share the same core rendering logic, CSS, and DSL definitions.

---

## 📂 Project Overview

The system follows a compiler-style pipeline to transform raw logic into a visual interface:

1.  **Scanner & Parser**: Located in `src/scanner.ts` and `src/parser.ts`. It performs lexical analysis and recursive descent parsing to turn PDDL text into a logical **Abstract Syntax Tree (AST)**. It handles complex features like nested paths (`mem.topic.summary[@t]`) and logical branching.
2.  **Renderer**: The `src/renderPrompt.ts` module walks the AST to produce semantic HTML fragments. It emphasizes logical intent (Templates, Functions) while subduing structural syntax.
3.  **Styles**: A centralized `styles.css` ensures consistent layout and color-coding across both the dev environment and static exports.



---

## 🛠 Features

* **Semantic Highlighting**: Distinct visual treatments for `Templates`, `Functions`, and `Context Variables`.
* **Role Partitioning**: Automatic color-coding and containment for `system`, `user`, and `assistant` messages.
* **Logical Nesting**: Clear visual indentation and block-wrapping for `If/Else`, `ForEach`, and `Switch` structures.
* **Interactivity**: Rendered blocks are collapsible, allowing users to navigate massive prompts by toggling logical sections.

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** (v18+)
* **Bun** (Required for the CLI generator)

### Installation
```bash
npm install
```

---

## 💻 Execution Modes
**1. Browser Viewer (Vite)**
Best for real-time development and debugging.
```bash
npm run dev
```

- Open the URL provided (usually http://localhost:5173).
- Drag and Drop: Simply drop any .pddl file onto the browser window to render it instantly.

**2. Static HTML Generator (CLI)**
Best for documentation and sharing. This mode bundles CSS directly into the HTML for a single-file, portable result.
```bash
# Basic usage (checks the /Prompts folder by default)
bun run cli -- output.html my_prompt_name

# Render multiple files with a specific style
bun run cli -- comparison.html prompt_v1 prompt_v2 --style compact

# Render a specific file path from anywhere on your computer
bun run cli -- result.html "C:/Users/Desktop/my_logic.pddl"
```

---

## 🎨 Rendering Styles
The CLI supports a `--style` flag to apply different visual themes. You can define new styles by adding `.style-[name]` classes to `styles.css`.

| Style | Description |
| :--- | :--- |
| **default** | Balanced spacing with clear role headers. |
| **compact** | Minimalist layout for dense, complex prompts. |
| **dark** | High-contrast dark mode optimized for code-heavy logic. |

---

## 📁 Directory Structure
- Prompts/ — The default home for your .pddl source files.
- src/ — Core TypeScript source (Scanner, Parser, Renderer, CLI).
- styles.css — Shared stylesheet for all rendering modes.
- index.html — Entry point for the interactive browser viewer.
