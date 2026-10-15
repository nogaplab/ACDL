// Blog build for the ACDL website.
//
// Reads the posts from blog/*.md, renders each into the shell at
// website/templates/blog/post.html, and writes the result straight to
// dist/website/blog/:
//   <slug>.html   one page per post (slug = the file name without .md)
//   index.html    the list of all posts
//   posts.json    slug/title/date of every post (read by the comments backend)
// plus every local file a post refers to (figures, linked files).
//
// Run directly (`npm run build:blog`) or via build-website.js, which invokes it
// after the regular pages are built.
//
// ── Authoring cheatsheet ───────────────────────────────────────────────────
// Each post starts with YAML frontmatter:
//   ---
//   title: Hermes          shown in the side ledger, the page heading and the tab
//   date: 2026-10-10       publication date; the ledger is ordered by it
//   draft: true            optional; the post is left out of the build
//   ---
// A leading `# Heading` line in the body is dropped (the title replaces it), and
// is used as the title if the frontmatter has none.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import MarkdownIt from 'markdown-it';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'blog');
const TEMPLATE = path.join(ROOT, 'website', 'templates', 'blog', 'post.html');
const WEBSITE_SHARED = path.join(ROOT, 'website', 'shared');
const DIST_WEBSITE = path.join(ROOT, 'dist', 'website');
const DIST_BLOG = path.join(DIST_WEBSITE, 'blog');

// Blog pages sit one level below the site root.
const BASE = '../';

// Newest post first in the ledger. Set to false to list them oldest first.
const NEWEST_FIRST = true;

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

function formatDate(date, month) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month, year: 'numeric', timeZone: 'UTC' });
}

// Local files referenced by the posts: path inside dist/website/blog -> source file.
const assets = new Map();
let slugs = new Set();

// Map a link or image target written in a post to its URL on the site. A file
// inside blog/ keeps its relative path; a file elsewhere in the repo is
// published under files/.
function localRef(ref, postFile) {
  if (!ref || /^([a-z][a-z0-9+.-]*:|#|\/)/i.test(ref)) return ref;
  const [, target, suffix] = ref.match(/^([^?#]*)(.*)$/);

  // A link to another post.
  const post = target.match(/^(?:\.\/)?([^/]+)\.md$/);
  if (post && slugs.has(post[1])) return `${post[1]}.html${suffix}`;

  const file = path.resolve(BLOG_DIR, decodeURI(target));
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    console.warn(`  Warning: ${path.basename(postFile)} refers to a missing file: ${ref}`);
    return ref;
  }
  const rel = path.relative(BLOG_DIR, file).split(path.sep).join('/');
  const dest = rel.startsWith('..') ? `files/${path.basename(file)}` : rel;
  assets.set(dest, file);
  return encodeURI(dest) + suffix;
}

function makeMarkdown() {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

  // Figures open at full size in a new tab.
  const defaultImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const src = localRef(token.attrGet('src'), env.file);
    token.attrSet('src', src);
    token.attrSet('loading', 'lazy');
    const img = defaultImage(tokens, idx, options, env, self);
    return `<a class="blog-figure" href="${escapeHtml(src)}" target="_blank" rel="noopener">${img}</a>`;
  };

  // External links open in a new tab.
  const defaultLinkOpen = md.renderer.rules.link_open || ((t, i, o, e, s) => s.renderToken(t, i, o));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet('href') || '';
    if (/^https?:/i.test(href)) {
      tokens[idx].attrSet('target', '_blank');
      tokens[idx].attrSet('rel', 'noopener');
    } else {
      tokens[idx].attrSet('href', localRef(href, env.file));
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  return md;
}

function loadPosts() {
  const posts = [];
  for (const name of fs.readdirSync(BLOG_DIR)) {
    if (!name.endsWith('.md')) continue;
    const file = path.join(BLOG_DIR, name);
    const { data, body } = parseFrontmatter(readText(file));
    if (data.draft) {
      console.log(`Skipped: blog/${name} (draft)`);
      continue;
    }
    const slug = name.replace(/\.md$/, '');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      throw new Error(`blog/${name}: file names may only use lowercase letters, digits and hyphens.`);
    }
    const h1 = body.match(/^\s*#\s+(.+)\n?/);
    const title = data.title || (h1 && h1[1].trim());
    if (!title) throw new Error(`blog/${name}: no title (add "title:" to the frontmatter).`);
    const date = new Date(data.date);
    if (!data.date || isNaN(date)) {
      throw new Error(`blog/${name}: missing or invalid "date:" in the frontmatter (use YYYY-MM-DD).`);
    }
    posts.push({ slug, file, title: String(title), date, body: h1 ? body.slice(h1[0].length) : body });
  }
  posts.sort((a, b) => a.date - b.date || a.slug.localeCompare(b.slug));
  if (NEWEST_FIRST) posts.reverse();
  return posts;
}

function ledger(posts, current) {
  return posts
    .map((p) => {
      const active = p.slug === current ? ' class="active" aria-current="page"' : '';
      return (
        `<li><a href="${p.slug}.html"${active}>` +
        `<span class="ledger-title">${escapeHtml(p.title)}</span>` +
        `<span class="ledger-date">${formatDate(p.date, 'short')}</span>` +
        `</a></li>`
      );
    })
    .join('\n          ');
}

// Plain text of the first paragraph, for the post list and the meta description.
function excerpt(html) {
  const m = html.match(/<p>([\s\S]*?)<\/p>/);
  if (!m) return '';
  const entities = { '&quot;': '"', '&lt;': '<', '&gt;': '>', '&amp;': '&' };
  const text = m[1]
    .replace(/<[^>]+>/g, '')
    .replace(/&(quot|lt|gt|amp);/g, (e) => entities[e])
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 260 ? text.slice(0, 260).replace(/\s+\S*$/, '') + '…' : text;
}

function build() {
  if (!fs.existsSync(BLOG_DIR)) {
    console.log('No blog directory; skipping blog build.');
    return;
  }
  const posts = loadPosts();
  slugs = new Set(posts.map((p) => p.slug));

  const md = makeMarkdown();
  const partials = {
    NAV: readText(path.join(WEBSITE_SHARED, 'nav.html')),
    FOOTER: readText(path.join(WEBSITE_SHARED, 'footer.html')),
    GA: readText(path.join(WEBSITE_SHARED, 'ga.html')),
  };
  const template = readText(TEMPLATE);

  // Replacement values are passed as functions so a `$` in a post is not read
  // as a replacement pattern.
  const page = (shell, values) => {
    let out = shell;
    for (const [key, value] of Object.entries({ ...partials, ...values, BASE })) {
      out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), () => value);
    }
    return out;
  };

  fs.rmSync(DIST_BLOG, { recursive: true, force: true });
  fs.mkdirSync(DIST_BLOG, { recursive: true });

  for (const post of posts) {
    post.html = md.render(post.body, { file: post.file });
    post.excerpt = excerpt(post.html);
    const html = page(template, {
      TITLE: `${escapeHtml(post.title)} - ACDL Blog`,
      DESCRIPTION: escapeHtml(post.excerpt),
      HEADING: escapeHtml(post.title),
      DATE: `<time datetime="${post.date.toISOString().slice(0, 10)}">${formatDate(post.date, 'long')}</time>`,
      LEDGER: ledger(posts, post.slug),
      POST: post.slug,
      CONTENT: post.html,
    });
    fs.writeFileSync(path.join(DIST_BLOG, `${post.slug}.html`), html);
    console.log(`Built: blog/${post.slug}.html`);
  }

  // The list of all posts. It has no comments section.
  const list = posts
    .map(
      (p) =>
        `<a class="post-card" href="${p.slug}.html">\n` +
        `  <span class="post-card-date">${formatDate(p.date, 'long')}</span>\n` +
        `  <h2>${escapeHtml(p.title)}</h2>\n` +
        `  <p>${escapeHtml(p.excerpt)}</p>\n` +
        `</a>`
    )
    .join('\n');
  const index = page(template.replace(/<!-- COMMENTS:START -->[\s\S]*?<!-- COMMENTS:END -->/, ''), {
    TITLE: 'ACDL Blog',
    DESCRIPTION: 'Posts about agent context structure and ACDL.',
    HEADING: 'Blog',
    DATE: '',
    LEDGER: ledger(posts, null),
    POST: '',
    CONTENT: list || '<p>No posts yet.</p>',
  });
  fs.writeFileSync(path.join(DIST_BLOG, 'index.html'), index);
  console.log('Built: blog/index.html');

  const manifest = posts.map((p) => ({ slug: p.slug, title: p.title, date: p.date.toISOString().slice(0, 10) }));
  fs.writeFileSync(path.join(DIST_BLOG, 'posts.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('Built: blog/posts.json');

  for (const [dest, src] of assets) {
    const out = path.join(DIST_BLOG, dest);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(src, out);
  }
  console.log(`Copied: ${assets.size} file(s) referenced by the posts`);

  // styles.css is copied too, so `npm run build:blog` alone gives a viewable page.
  const sharedDest = path.join(DIST_WEBSITE, 'shared');
  fs.mkdirSync(sharedDest, { recursive: true });
  for (const name of ['styles.css', 'blog.css', 'blog.js']) {
    fs.copyFileSync(path.join(WEBSITE_SHARED, name), path.join(sharedDest, name));
  }

  console.log('\nBlog build complete.');
}

build();
