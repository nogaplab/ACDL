// blog/tools/build-post.mjs
// Build a self-contained HTML version of a blog post: the Markdown is rendered
// and every local image is embedded in the file, so the one .html can be opened
// or sent on its own.
//
// Usage: node blog/tools/build-post.mjs blog/01-hermes.md
import fs from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';

const input = process.argv[2];
if (!input) {
    console.log('Usage: node blog/tools/build-post.mjs <post.md>');
    process.exit(1);
}
const dir = path.dirname(input);
// The frontmatter is only for the website build (scripts/build-blog.js).
const src = fs.readFileSync(input, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

// Embed local images as data URIs.
const defaultImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const ref = token.attrGet('src');
    if (ref && !/^[a-z]+:/i.test(ref)) {
        const file = path.join(dir, ref);
        const data = fs.readFileSync(file).toString('base64');
        token.attrSet('src', `data:image/png;base64,${data}`);
    }
    return defaultImage(tokens, idx, options, env, self);
};

// External links open in a new tab.
const defaultLinkOpen = md.renderer.rules.link_open || ((t, i, o, e, s) => s.renderToken(t, i, o));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet('href') || '';
    if (/^https?:/i.test(href)) {
        tokens[idx].attrSet('target', '_blank');
        tokens[idx].attrSet('rel', 'noopener');
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
};

const title = (src.match(/^#\s+(.+)$/m) || [, 'Post'])[1];
const body = md.render(src);
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { --bg: #ffffff; --text: #1f2328; --muted: #59636e; --link: #0969da; --rule: #d1d9e0; --code-bg: #f0f2f4; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0d1117; --text: #e6edf3; --muted: #9198a1; --link: #58a6ff; --rule: #30363d; --code-bg: #1b2028; }
  }
  body { margin: 0; background: var(--bg); color: var(--text);
         font: 18px/1.65 Georgia, 'Times New Roman', serif; }
  main { max-width: 740px; margin: 0 auto; padding: 48px 16px 96px; }
  h1, h2, h3 { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; line-height: 1.25; }
  h1 { font-size: 2.1rem; margin: 0 0 1.2rem; }
  h2 { font-size: 1.5rem; margin: 2.6rem 0 0.8rem; padding-top: 1.4rem; border-top: 1px solid var(--rule); }
  h3 { font-size: 1.15rem; margin: 2rem 0 0.6rem; }
  a { color: var(--link); }
  img { display: block; max-width: 100%; height: auto; margin: 1.4rem auto; border-radius: 6px; }
  code { font: 0.85em Consolas, 'JetBrains Mono', monospace; background: var(--code-bg);
         padding: 0.12em 0.35em; border-radius: 4px; }
  blockquote { margin: 1.2rem 0; padding: 0 1rem; border-left: 3px solid var(--rule); color: var(--muted); }
  li { margin: 0.3rem 0; }
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
const output = input.replace(/\.md$/i, '.html');
fs.writeFileSync(output, html);
console.log(`Generated: ${output} (${(fs.statSync(output).size / 1048576).toFixed(1)} MB)`);
