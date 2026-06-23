# ACDL — Agentic Context Description Language

ACDL is a domain-specific language for describing and visualizing the structure of
agentic prompts: multi-turn conversations, tool-use patterns, loops, and context flow.
An `.acdl` file is a compact, readable spec of how a prompt is assembled — and ACDL
renders it into clean diagrams (HTML / SVG / PNG / PDF).

**👉 Learn the language, try the live editor, and read the tutorial at [acdlang.org](https://acdlang.org).**

```acdl
MyPrompt[@T]: {
    S: {
        TASK_DESC
        AVAILABLE_TOOLS
    }
    U: env.user_input[@1]
    ForEach(t: range(2, @T)) {
        A: resp.reasoning[@t]
        U: sys.tool_response[@t]
    }
}
```

- **Roles** — `S` (System), `U` (User), `A` (Assistant)
- **Templates** — `ALL_CAPS` identifiers for reusable content
- **Loops** — `ForEach` for iterative patterns
- **References** — `@T` for parameters, `[@t]` for indexing

## Repository layout

| Path | What it is |
|------|------------|
| [`src/`](src/) | The core: language implementation, renderers, CLI, and the in-browser editor |
| [`extension/`](extension/) | VS Code extension for ACDL (syntax highlighting, diagnostics, preview) |
| [`ACDL_examples/`](ACDL_examples/) | A library of example `.acdl` specs |

## `src/` — the core

The language and rendering pipeline live here:

- **`scanner.ts` / `parser.ts`** — tokenize and parse `.acdl` source into an AST.
- **`types.ts` / `constructors.ts` / `tokens.ts`** — the AST node types and helpers.
- **`renderPrompt.ts` / `renderPromptSvg.ts` / `svg-layout.ts`** — turn a parsed prompt
  into rendered output and lay it out as SVG.
- **`render-to-svg.ts` / `render-to-png.ts` / `render-to-pdf.ts`** — export renderers
  for the respective formats.
- **`main-cli.ts`** — command-line entry point.
- **`main-ui.ts` / `ui.ts` / `index.html` / `styles.css`** — the browser-based editor
  and live preview.
- **`editor/`** — CodeMirror integration: ACDL language definition, theme, and linting.

### Running locally

This project uses [Bun](https://bun.sh) for the CLI and [Vite](https://vitejs.dev) for the editor.

```bash
# install dependencies
npm install

# launch the in-browser editor + live preview
npm run dev

# render an .acdl file from the command line
npm run cli -- output.html ACDL_examples/other/example.acdl

# export to a specific format
npm run render-svg
npm run render-png
npm run render-pdf
```

## VS Code extension

[`extension/`](extension/) contains a Visual Studio Code extension that brings ACDL support
to the editor:

- **Syntax highlighting** for `.acdl` files
- **Real-time diagnostics** and validation as you type
- **Preview panel** to visualize a prompt (`ACDL: Show Preview`)
- **Go-to-definition** for labels and templates

Build it with:

```bash
npm run build:extension
```

See [`extension/README.md`](extension/README.md) for details.

## Examples

[`ACDL_examples/`](ACDL_examples/) is a collection of `.acdl` specs you can render and learn from,
organized by category — basic context, RAG, ReAct-style tool loops, multi-agent setups,
and several real-world agent reconstructions. They're a good starting point for seeing how
ACDL describes different prompting patterns.

## License

MIT — see [`LICENSE`](LICENSE).
