# ACDL Language Support

Language support for **ACDL (Agentic Context Description Language)** in Visual Studio Code.

ACDL is a domain-specific language for describing and visualizing agentic prompt structures, including multi-turn conversations, tool use patterns, and context flow.

## Features

- **Syntax Highlighting** - Full syntax highlighting for ACDL files (`.acdl`)
- **Diagnostics** - Real-time error checking and validation as you type
- **Preview Panel** - Visualize your ACDL prompts with the preview command
- **Go-to-Definition** - Jump to label and template definitions

## Usage

1. Open any `.acdl` file
2. Use the preview button in the editor title bar (or run `ACDL: Show Preview` from the command palette)
3. Edit your ACDL code and see diagnostics in real-time

## ACDL Syntax Overview

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

- **Roles**: `S` (System), `U` (User), `A` (Assistant)
- **Templates**: `ALL_CAPS` identifiers for reusable content
- **Loops**: `ForEach` for iterative patterns
- **References**: `@T` for parameters, `[@t]` for indexing

## Commands

| Command | Description |
|---------|-------------|
| `ACDL: Show Preview` | Open a preview panel for the current ACDL file |

## Requirements

- Visual Studio Code 1.80.0 or later

## Links

- [GitHub Repository](https://github.com/nogaplab/ACDL)
- [Report Issues](https://github.com/nogaplab/ACDL/issues)

## License

MIT
