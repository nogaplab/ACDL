# Editing website content

The written content of the website pages lives here as Markdown. **Edit these
`.md` files** — never edit `website/src/*.html` directly (those are generated and
carry an "AUTO-GENERATED" banner).

## Workflow

```
npm run build:content      # regenerate website/src/*.html from content/*.md
```

`npm run build:website` (and the deploy script) run this automatically first, so
for a normal deploy you don't need to run it by hand — but it's handy for a quick
local check after editing.

## How a page is assembled

```
website/content/<page>.md    ← you edit this (prose + shortcodes + raw HTML)
website/templates/<page>.html ← the HTML shell: <head>, the page's <style> block,
                                {{NAV}}, {{FOOTER}}, and a {{CONTENT}} slot
        │  build-content.js (Markdown + shortcodes)
        ▼
website/src/<page>.html       ← generated; consumed by the existing build/deploy
```

All seven pages are built this way. Nested pages are mirrored, so
`content/examples/index.md` + `templates/examples/index.html` →
`src/examples/index.html`. A page-specific `<script>` or modal can live in the
template after the `{{CONTENT}}`/`{{FOOTER}}` slots (see
`templates/claude-code-skill.html` and `templates/examples/index.html`).

Each `.md` starts with YAML frontmatter. `title:` fills the page `<title>`. Any
other `key:` is available in the template as `{{KEY}}` (uppercased) — e.g. the
tutorial template uses `{{HERO_TITLE}}` / `{{HERO_SUBTITLE}}`.

## What you can write

- **Prose** — normal Markdown: `**bold**`, `` `code` ``, `[link](url)`,
  `## headings`, `- lists`.
- **Raw HTML** — paste any HTML for bespoke layout (cards, grids, hero blocks,
  the code-and-render panels with hand-highlighted ACDL). It passes through
  untouched. You may use blank lines and indentation freely inside it.
- **Shortcodes** (used by `tutorial.md`) — fenced with colons; the body of each
  is itself Markdown:

  ```
  :::: step 1 | What is ACDL?        numbered tutorial step (note 4 colons, so it
  ...                                 can contain the 3-colon shortcodes below)
  ::::

  ::: callout The Roles              note box with a title + info icon
  ...                                 (::: callout warning Title to change variant)
  :::

  ::: explanation                    inset explanation box; optional icon name:
  ...                                 ::: explanation code  /  ::: explanation refresh
  :::
  ```

  Step shortcodes use **four** colons so the callout/explanation shortcodes
  (three colons) can nest inside them.

The full list of shortcodes and the icons they support is documented at the top
of `scripts/build-content.js`.
