// Standalone export of blog posts, for sharing outside the website.
//
// Renders each blog/*.md (or only the posts named on the command line) into a
// single self-contained HTML file in dist/standalone/<slug>.html: light,
// print-friendly styling, figures embedded as data URIs, and none of the
// site's chrome (no nav, post list, comments or analytics).
//
//   npm run build:post-standalone              every post
//   npm run build:post-standalone -- 01-hermes one post
//
// The page heading is the post's leading `# Heading` line when it has one
// (the website uses the shorter frontmatter title instead).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import MarkdownIt from 'markdown-it';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'blog');
const OUT_DIR = path.join(ROOT, 'dist', 'standalone');

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: {}, body: raw };
  return { data: yaml.load(m[1]) || {}, body: raw.slice(m[0].length) };
}

// Inline a local image as a data URI so the page is a single file.
function embedImage(ref, postFile) {
  if (!ref || /^([a-z][a-z0-9+.-]*:|#|\/)/i.test(ref)) return ref;
  const file = path.resolve(path.dirname(postFile), decodeURI(ref.replace(/[?#].*$/, '')));
  const mime = MIME[path.extname(file).toLowerCase()];
  if (!mime || !fs.existsSync(file)) {
    console.warn(`  Warning: ${path.basename(postFile)} refers to a missing image: ${ref}`);
    return ref;
  }
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

function makeMarkdown() {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

  const defaultImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    token.attrSet('src', embedImage(token.attrGet('src'), env.file));
    return `<figure>${defaultImage(tokens, idx, options, env, self)}</figure>`;
  };

  const defaultLinkOpen = md.renderer.rules.link_open || ((t, i, o, e, s) => s.renderToken(t, i, o));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    if (/^https?:/i.test(tokens[idx].attrGet('href') || '')) {
      tokens[idx].attrSet('target', '_blank');
      tokens[idx].attrSet('rel', 'noopener');
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  return md;
}

const CSS = `
  :root {
    --text: #1f2328; --muted: #59636e; --rule: #d0d7de;
    --code-bg: #f6f8fa; --link: #0969da; --page: #ffffff;
  }
  * { box-sizing: border-box; }
  html { background: var(--page); }
  body {
    margin: 0; padding: 48px 16px 80px; background: var(--page); color: var(--text);
    font: 17px/1.65 Georgia, "Times New Roman", serif;
  }
  article { max-width: 760px; margin: 0 auto; }
  header { margin-bottom: 36px; padding-bottom: 20px; border-bottom: 1px solid var(--rule); }
  h1 { font-size: 2em; line-height: 1.25; margin: 0 0 8px; }
  .date { color: var(--muted); margin: 0; font-size: 0.95em; }
  h1, h2, h3, h4 { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  h2 { font-size: 1.5em; margin: 2em 0 0.6em; padding-bottom: 0.25em; border-bottom: 1px solid var(--rule); }
  h3 { font-size: 1.2em; margin: 1.6em 0 0.5em; }
  p { margin: 0 0 1em; }
  ul, ol { margin: 0 0 1em; padding-left: 1.6em; }
  li { margin-bottom: 0.3em; }
  a { color: var(--link); }
  blockquote { margin: 0 0 1em; padding: 0 1em; color: var(--muted); border-left: 4px solid var(--rule); }
  code {
    font: 0.85em/1.5 "JetBrains Mono", Consolas, "SF Mono", Menlo, monospace;
    background: var(--code-bg); padding: 0.15em 0.35em; border-radius: 4px;
  }
  pre {
    background: var(--code-bg); border: 1px solid var(--rule); border-radius: 6px;
    padding: 12px 16px; margin: 0 0 1.2em; overflow-x: auto;
    white-space: pre-wrap; overflow-wrap: anywhere;
  }
  pre code { background: none; padding: 0; font-size: 0.82em; }
  figure { margin: 1.6em 0; text-align: center; }
  figure img { max-width: 100%; height: auto; border: 1px solid var(--rule); border-radius: 6px; }
  table { border-collapse: collapse; margin: 0 0 1.2em; width: 100%; font-size: 0.92em; }
  th, td { border: 1px solid var(--rule); padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: var(--code-bg); }
  hr { border: 0; border-top: 1px solid var(--rule); margin: 2em 0; }
  @media (max-width: 600px) { body { padding-top: 24px; font-size: 16px; } }
  @media print {
    body { padding: 0; font-size: 11pt; }
    a { color: inherit; }
    h2, h3 { break-after: avoid; }
    figure, pre { break-inside: avoid; }
  }
`;

function render(name, md) {
  const file = path.join(BLOG_DIR, name);
  const { data, body } = parseFrontmatter(readText(file));
  const h1 = body.match(/^\s*#\s+(.+)\n?/);
  const title = (h1 && h1[1].trim()) || data.title || name.replace(/\.md$/, '');
  const date = data.date ? new Date(data.date) : null;
  const dateText = date && !isNaN(date)
    ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : '';
  const content = md.render(h1 ? body.slice(h1[0].length) : body, { file });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<article>
<header>
<h1>${escapeHtml(title)}</h1>
${dateText ? `<p class="date">${dateText}</p>` : ''}
</header>
${content}
</article>
</body>
</html>
`;
}

function build() {
  const wanted = process.argv.slice(2).map((a) => a.replace(/\.md$/, ''));
  const names = fs
    .readdirSync(BLOG_DIR)
    .filter((n) => n.endsWith('.md') && (!wanted.length || wanted.includes(n.replace(/\.md$/, ''))));
  if (!names.length) {
    console.error(wanted.length ? `No post named: ${wanted.join(', ')}` : 'No posts in blog/.');
    process.exit(1);
  }

  const md = makeMarkdown();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const name of names) {
    const out = path.join(OUT_DIR, name.replace(/\.md$/, '.html'));
    fs.writeFileSync(out, render(name, md));
    console.log(`Built: ${path.relative(ROOT, out)}`);
  }
}

build();
