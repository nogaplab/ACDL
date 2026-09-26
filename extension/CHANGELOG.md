# Changelog

All notable changes to the ACDL Language Support extension will be documented in this file.

## [0.2.3] - 2026-09-26

### Added

- **All blocks in one preview**: a multi-block file now renders every prompt and
  fragment stacked in file order, so you can scroll through the whole file in the
  preview. The block under the editor cursor is highlighted and scrolled into view.
- **Preview navigation**: jump between blocks directly from the preview pane, without
  moving the editor cursor. Use the ← / → buttons in the preview's status bar, press
  ← / → (or PageUp / PageDown) while the preview has focus, or `Ctrl/Cmd+Alt+←` / `→`
  from the editor. The counter follows whichever block you scroll to.
- **Save dialog** (toolbar `Save…`, `Ctrl/Cmd+Alt+S`, or `ACDL: Save Preview as PDF / PNG`):
  save the current block, all blocks, or a hand-picked set as **PDF** or **PNG**.
  Several blocks can go into one file (PDF: one page per block or a single tall page;
  PNG: stacked into one image) or into separate files, one per block, in a folder
  you choose. PDF pages are sized like the website visualizer's PDF export.
- **Width control** in the preview toolbar: the wrap width (default 800px, like the
  visualizer's slider) applies to the preview and to every export, and is remembered
  per workspace.

### Changed

- **The preview now uses the SVG renderer**, the same pipeline as the website
  visualizer's PDF export, so the pane always shows exactly what Copy / Save / Export
  produce. html2canvas and its capture workarounds are gone.
- **Copy image** copies the highlighted block only, as before. **Save** now opens the
  dialog above instead of saving a single PNG straight away.
- **Fragments**: `Frag` invocations are drawn in orange instead of purple, and fragment
  definitions carry a `StrFrag` / `RolesFrag` badge instead of `SF` / `RF` (in both the
  HTML and the SVG/PDF renderers).

## [0.2.2] - 2026-09-03

### Fixed

- **Copy image / Save image** no longer drop content. html2canvas cannot render text
  inside `inline-flex` elements, does not resolve CSS custom properties, and ignores
  `repeating-linear-gradient`, so exported PNGs came out with blank template blocks
  (`SESSION_SEARCH_GUIDANCE`), blank function names (`buildMemoryContextBlock(...)`),
  index brackets missing their `@` (`sys.tool_requests[ t.i ]` instead of
  `sys.tool_requests[@t.i]`), and misplaced mark brackets. The preview now applies the
  same pre-capture substitutions as the web and batch exporters, then restores the DOM.

## [0.2.1] - 2026-08-23

### Fixed

- Comments run to end of line. A `}` inside a comment no longer ends it, so a comment
  quoting a code literal (`// Context { systemPrompt, messages, tools }`) no longer
  spills its remainder into the parser as source. Applies to both diagnostics and
  syntax highlighting.
- Comments are allowed between the branches of an `If` / `ElseIf` / `Else` chain, and
  between `Case` / `Default` arms of a `Switch`. Structural lookahead now sees past
  them instead of treating a comment as the end of the construct.
- Invisible characters that survive a copy from HTML or PDF — zero-width space, ZWNJ,
  ZWJ, word joiner, BOM, soft hyphen — are treated as whitespace instead of raising
  `Unexpected character`.
- `Unexpected character` errors now name the offending code point (e.g. `U+200B`),
  which is the only way to identify an invisible one.

### Changed

- An `If` / `ElseIf` / `Else` chain renders as a single unit in the preview: its
  branches always stack vertically instead of flowing side by side when the
  surrounding role body has room for both.

## [0.2.0] - 2026-07-02

### Added

- Structural diff between two `.acdl` files, shown as a folded, source-like report in a panel:
  - `ACDL: Diff…` (command palette / editor title bar) — diff the active file against one you pick
  - Right-click two selected `.acdl` files in the Explorer → `ACDL: Diff`
- The diff compares files at the level you read ACDL (content lines and block headers), so reindentation and reordering don't add noise — only real changes (role, index, loop range, added/removed blocks) surface.

## [0.1.2] - 2026-06-09

### Added

- Multi-prompt files: preview now shows the prompt under the cursor and switches automatically as the cursor moves between prompts
- Copy preview as PNG to clipboard (toolbar button + `Ctrl/Cmd+Alt+C`)
- Save preview as PNG (toolbar button + `Ctrl/Cmd+Alt+S`)
- Zoom in / out / reset for the preview only (toolbar buttons, `Ctrl/Cmd+Alt+=` / `-` / `0`, and `Ctrl/Cmd` + scroll-wheel)
- Editor title-bar buttons for Copy / Save image while the preview is visible
- Inline toast feedback in the preview confirming copy / save / errors

## [0.1.0] - 2024

### Added

- Initial release
- Syntax highlighting for `.acdl` files
- Real-time diagnostics and error checking
- Preview panel for visualizing ACDL prompts
- Go-to-definition for labels and templates
- Language configuration (brackets, comments, indentation)
