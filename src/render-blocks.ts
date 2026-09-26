// Block-by-block SVG rendering shared by the website visualizer and the VSCode
// extension preview. Both parse the file into blocks, drop comment blocks, render
// each block on its own with the SVG renderer at a wrap width, and stack the
// results with a caption. Keeping this in one place is what keeps the two views
// identical.
import { Parser } from "./parser";
import { renderPromptsSvg } from "./renderPromptSvg";

export type BlockRange = ReturnType<Parser["parseFileWithRanges"]>[number];

export const DEFAULT_WRAP_WIDTH = 800;
export const MIN_WRAP_WIDTH = 200;
export const MAX_WRAP_WIDTH = 1000;

/** Gap between stacked blocks in a multi-block PNG / continuous PDF page (CSS px / pt). */
export const BLOCK_GAP = 24;

export function clampWrapWidth(width: number | undefined): number {
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return DEFAULT_WRAP_WIDTH;
  return Math.round(Math.min(MAX_WRAP_WIDTH, Math.max(MIN_WRAP_WIDTH, w)));
}

/** Parse the file and return the blocks that are shown (comment blocks are not). */
export function listRenderableBlocks(text: string): BlockRange[] {
  return new Parser(text)
    .parseFileWithRanges()
    .filter((r) => r.block.kind !== "comment-block");
}

export function blockName(r: BlockRange): string {
  const b = r.block;
  if (b.kind === "prompt") return b.title.name;
  if (b.kind === "str-frag-def" || b.kind === "roles-frag-def") return b.name;
  return "block";
}

export function blockKindLabel(r: BlockRange): string {
  switch (r.block.kind) {
    case "prompt":
      return "Prompt";
    case "str-frag-def":
      return "StrFrag";
    case "roles-frag-def":
      return "RolesFrag";
    default:
      return "Block";
  }
}

/** Render one block as a self-contained SVG document (fonts embedded). */
export function renderBlockSvg(r: BlockRange, wrapWidth: number): string {
  return renderPromptsSvg([r.block], wrapWidth > 0 ? wrapWidth : undefined);
}

export function svgSize(svg: string): { width: number; height: number } {
  const m = svg.match(/<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/);
  return {
    width: m ? parseFloat(m[1]) : 800,
    height: m ? parseFloat(m[2]) : 600,
  };
}

/**
 * Turn a self-contained SVG document into a fragment suitable for inlining in
 * a page: the XML prolog and the per-document @font-face block are dropped, so
 * the page serves the fonts once (see pageFontFaceCss) instead of once per block.
 */
export function toInlineSvg(svg: string): string {
  return svg
    .replace(/^\s*<\?xml[^>]*\?>\s*/, "")
    .replace(/<defs>\s*<style type="text\/css">[\s\S]*?<\/style>\s*<\/defs>\s*/, "")
    .replace(/^<svg\b/, '<svg class="acdl-svg"');
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The HTML for every block, stacked in file order. Each block gets a wrapper a
 * page can scroll to and highlight, plus a caption naming it and its lines.
 */
export function renderBlocksHtml(blocks: BlockRange[], wrapWidth: number): string {
  return blocks
    .map((r, i) => {
      const label = blockKindLabel(r);
      const name = escapeHtml(blockName(r));
      let body: string;
      try {
        body = toInlineSvg(renderBlockSvg(r, wrapWidth));
      } catch (err: any) {
        body = `<div class="acdl-block-error">Could not render this block: ${escapeHtml(err?.message || String(err))}</div>`;
      }
      return `<section class="acdl-block" id="acdl-block-${i}" data-index="${i}" data-start="${r.startLine}" data-end="${r.endLine}" data-name="${name}" data-label="${label} ${name} (lines ${r.startLine}–${r.endLine})">
  <div class="acdl-block-caption">${i + 1} / ${blocks.length} · ${label} · lines ${r.startLine}–${r.endLine}</div>
  <div class="acdl-block-body">${body}</div>
</section>`;
    })
    .join("\n");
}

/**
 * Styles for the stacked blocks. The extension preview and the website
 * visualizer both include this, so the blocks look the same in both.
 */
export const BLOCKS_CSS = `
  .acdl-block { padding: 8px 0 0 0; }
  .acdl-block + .acdl-block {
    margin-top: 28px; border-top: 2px dashed #d0d7de;
  }
  .acdl-block-caption {
    font: 500 11px/1 "JetBrains Mono", "SF Mono", monospace;
    color: #8c959f; margin: 0 0 8px 0;
  }
  .acdl-block.current .acdl-block-caption { color: #1f6feb; }
  .acdl-block-body { display: inline-block; }
  .acdl-block.current > .acdl-block-body {
    outline: 2px solid #1f6feb; outline-offset: 8px; border-radius: 4px;
  }
  .acdl-svg { display: block; }
  .acdl-block-error {
    color: #cf222e; padding: 20px; font-family: monospace; white-space: pre-wrap;
  }
`;

/**
 * @font-face rules for JetBrains Mono 400 / 700, the font the inlined SVGs use.
 * `regular` / `bold` are URLs (a data: URL for the base64 fonts, or a path).
 */
export function pageFontFaceCss(regular: string, bold: string): string {
  return `
  @font-face {
    font-family: 'JetBrains Mono'; font-weight: 400;
    src: url(${regular}) format('truetype');
  }
  @font-face {
    font-family: 'JetBrains Mono'; font-weight: 700;
    src: url(${bold}) format('truetype');
  }
`;
}
