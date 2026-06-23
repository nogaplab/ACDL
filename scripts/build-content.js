// Markdown authoring pipeline for the ACDL website.
//
// Reads editable Markdown from website/content/*.md, renders it (with a small
// set of custom shortcodes for the recurring components), drops the result into
// a per-page HTML shell from website/templates/, and writes the assembled page
// to website/src/*.html -- which is exactly what build-website.js already
// consumes. So this is an additive pre-step: nothing downstream changes.
//
// Run directly (`node scripts/build-content.js`) or via build-website.js, which
// invokes it first.
//
// ── Authoring cheatsheet ───────────────────────────────────────────────────
// Frontmatter (YAML between --- fences) supplies template placeholders, e.g.
//   ---
//   title: Getting Started - ACDL Tutorial
//   ---
// Any `key: value` becomes available in the template as {{KEY}} (uppercased).
//
// Shortcodes (fenced with :::), all bodies are themselves Markdown:
//   ::: step 1 | What is ACDL?      numbered tutorial step (id="step1")
//   ...markdown...
//   :::
//
//   ::: callout The Roles           note box with a title + info icon
//   ...markdown...                  (use `::: callout warning Title` to vary)
//   :::
//
//   ::: explanation                 inset explanation box with an icon
//   ...markdown...
//   :::
//
// Anything bespoke (code-and-render previews, hero blocks, feature/resource
// cards, comparison grids) is just written as raw HTML inline in the Markdown
// -- markdown-it passes HTML blocks through untouched.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import MarkdownIt from 'markdown-it';
import container from 'markdown-it-container';
import attrs from 'markdown-it-attrs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTENT_DIR = path.join(__dirname, '..', 'website', 'content');
const TEMPLATE_DIR = path.join(__dirname, '..', 'website', 'templates');
const SRC_DIR = path.join(__dirname, '..', 'website', 'src');

// Fixed icons, copied verbatim from the original hand-written pages so the
// generated markup is identical.
const ICON_INFO =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';

// Named icons available to the ::: explanation shortcode (default = "box").
const EXPLAIN_ICONS = {
  box: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line></svg>',
  code: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
  refresh: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>',
};

const CALLOUT_VARIANTS = new Set(['note', 'warning', 'tip']);

function makeMarkdown() {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false });
  md.use(attrs);

  // ::: step N | Title
  md.use(container, 'step', {
    validate: (params) => /^step\b/.test(params.trim()),
    render(tokens, idx) {
      if (tokens[idx].nesting === 1) {
        const info = tokens[idx].info.trim().replace(/^step\s*/, '');
        const m = info.match(/^(\S+)\s*\|\s*(.+)$/);
        const num = m ? m[1] : '';
        const title = m ? m[2] : info;
        return (
          `<section id="step${num}" class="step">\n` +
          `  <div class="step-header">\n` +
          `    <div class="step-number">${num}</div>\n` +
          `    <h2>${md.utils.escapeHtml(title)}</h2>\n` +
          `  </div>\n`
        );
      }
      return '</section>\n';
    },
  });

  // ::: callout [variant] Title
  md.use(container, 'callout', {
    validate: (params) => /^callout\b/.test(params.trim()),
    render(tokens, idx) {
      if (tokens[idx].nesting === 1) {
        const rest = tokens[idx].info.trim().replace(/^callout\s*/, '');
        const parts = rest.split(/\s+/);
        let variant = 'note';
        if (CALLOUT_VARIANTS.has(parts[0])) variant = parts.shift();
        const title = parts.join(' ');
        return (
          `<div class="callout ${variant}">\n` +
          `  <div class="callout-title">\n    ${ICON_INFO}\n    ${md.utils.escapeHtml(title)}\n  </div>\n` +
          `  <div class="callout-content">\n`
        );
      }
      return '  </div>\n</div>\n';
    },
  });

  // ::: explanation [icon]   icon ∈ {box (default), code, refresh}
  md.use(container, 'explanation', {
    validate: (params) => /^explanation\b/.test(params.trim()),
    render(tokens, idx) {
      if (tokens[idx].nesting === 1) {
        const name = tokens[idx].info.trim().replace(/^explanation\s*/, '') || 'box';
        const icon = EXPLAIN_ICONS[name] || EXPLAIN_ICONS.box;
        return (
          `<div class="explanation">\n` +
          `  <div class="explanation-icon">${icon}</div>\n` +
          `  <div class="explanation-text">\n`
        );
      }
      return '  </div>\n</div>\n';
    },
  });

  return md;
}

// Void elements never have a closing tag, so they can't open a balanced block.
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

// Opening block-level HTML tag at the start of a line (CommonMark allows up to
// 3 leading spaces). Used to find the raw-HTML regions authors embed for
// bespoke layout (cards, grids, code-and-render panels, hero blocks, ...).
const OPEN_TAG = /^[ ]{0,3}<([a-zA-Z][\w-]*)(?=[\s/>])/;

// Protect raw-HTML blocks from Markdown parsing.
//
// CommonMark terminates a raw-HTML block at the first blank line, after which an
// indented continuation gets mis-read as an indented code block. That forces
// authors to cram each component onto blank-line-free lines, which is exactly
// the unreadable HTML soup this pipeline exists to avoid. Instead we find each
// top-level HTML block (a column-0 opening tag through its balanced close,
// blank lines and all), stash it behind an inert placeholder, let Markdown
// render everything else, then splice the originals back verbatim. So authors
// can format embedded HTML however they like.
function protectHtml(body) {
  const lines = body.split('\n');
  const stash = [];
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(OPEN_TAG);
    const tag = m && m[1].toLowerCase();
    if (tag && !VOID_TAGS.has(tag)) {
      // Consume lines until this tag's open/close count balances back to zero.
      const openRe = new RegExp(`<${tag}(?=[\\s/>])`, 'gi');
      const selfRe = new RegExp(`<${tag}(?=[\\s/>])[^>]*?/>`, 'gi');
      const closeRe = new RegExp(`</${tag}\\s*>`, 'gi');
      let depth = 0;
      let j = i;
      const block = [];
      do {
        const l = lines[j];
        const opens = (l.match(openRe) || []).length;
        const selfs = (l.match(selfRe) || []).length;
        const closes = (l.match(closeRe) || []).length;
        depth += opens - selfs - closes;
        block.push(l);
        j++;
      } while (depth > 0 && j < lines.length);
      stash.push(block.join('\n'));
      out.push(`@@RAWHTML${stash.length - 1}@@`);
      i = j;
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return { text: out.join('\n'), stash };
}

// Render the Markdown body to HTML, restoring protected raw-HTML blocks. A
// stashed block that sat alone on a line comes back wrapped in <p>…</p> by
// Markdown; strip that wrapper so the HTML is spliced back exactly as written.
function renderBody(md, body) {
  const { text, stash } = protectHtml(body);
  const html = md.render(text);
  return html
    .replace(/<p>@@RAWHTML(\d+)@@<\/p>/g, (_, i) => stash[Number(i)])
    .replace(/@@RAWHTML(\d+)@@/g, (_, i) => stash[Number(i)]);
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: {}, body: raw };
  const data = yaml.load(m[1]) || {};
  return { data, body: raw.slice(m[0].length) };
}

function applyTemplate(template, html, data, name) {
  let out = template.replace(/\{\{CONTENT\}\}/g, html);
  for (const [key, value] of Object.entries(data)) {
    const token = new RegExp(`\\{\\{${key.toUpperCase()}\\}\\}`, 'g');
    out = out.replace(token, String(value));
  }
  const banner =
    `<!-- AUTO-GENERATED from website/content/${name}.md by scripts/build-content.js.\n` +
    `     Do not edit this file directly; edit the Markdown source and re-run \`npm run build:content\`. -->\n`;
  return out.replace(/(<!DOCTYPE html>\n)/i, `$1${banner}`);
}

// Recursively collect .md files under `dir`, returned as paths relative to it
// (POSIX separators), so the same string indexes content/, templates/ and src/.
function collectMarkdown(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectMarkdown(full, base));
    } else if (entry.name.endsWith('.md')) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out;
}

function build() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.log('No website/content directory; skipping markdown build.');
    return;
  }
  const md = makeMarkdown();
  // Walk content/ recursively so nested pages (e.g. examples/index.md ->
  // src/examples/index.html) work the same as top-level ones.
  const files = collectMarkdown(CONTENT_DIR);
  if (files.length === 0) {
    console.log('No markdown content files found.');
    return;
  }

  for (const rel of files) {
    const name = rel.replace(/\.md$/, ''); // e.g. "vscode" or "examples/index"
    const templatePath = path.join(TEMPLATE_DIR, `${name}.html`);
    if (!fs.existsSync(templatePath)) {
      // No matching template (e.g. README.md and other docs in content/) — skip.
      console.log(`Skipped: ${rel} (no website/templates/${name}.html)`);
      continue;
    }
    const raw = fs.readFileSync(path.join(CONTENT_DIR, rel), 'utf8');
    const { data, body } = parseFrontmatter(raw);
    const html = renderBody(md, body);
    const template = fs.readFileSync(templatePath, 'utf8');
    const page = applyTemplate(template, html, data, name);

    const destPath = path.join(SRC_DIR, `${name}.html`);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, page);
    console.log(`Built content: ${rel} -> website/src/${name}.html`);
  }
  console.log('\nMarkdown content build complete.');
}

build();
