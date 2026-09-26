import * as vscode from "vscode";
import * as path from "path";
import { PDFDocument } from "pdf-lib";
import {
  BLOCK_GAP,
  BlockRange,
  blockKindLabel,
  blockName,
  renderBlockSvg,
  svgSize,
} from "../../src/render-blocks";

// The block helpers are shared with the website visualizer (src/render-blocks.ts)
// so the preview and the visualizer render identically.
export type { BlockRange };
export { blockKindLabel, blockName, renderBlockSvg, svgSize };

/** Options chosen in the preview's Export dialog. */
export type ExportOptions = {
  format: "png" | "pdf";
  /** One output file, or one file per block. */
  layout: "single" | "separate";
  /** For a single PDF holding several blocks: a page per block, or one tall page. */
  pdfPages: "perBlock" | "continuous";
  /** Zero-based indices of the blocks to export, in file order. */
  indices: number[];
};

/** One rendered block, rasterized to PNG by the preview webview. */
export type ExportItem = {
  index: number;
  name: string;
  dataUrl: string;
  /** Size in CSS pixels (the PNG itself is rendered at a higher scale). */
  width: number;
  height: number;
};

/** Message asking the webview to rasterize self-contained SVGs. */
export type RasterizeMessage = {
  type: "rasterizeSvgs";
  /** What to do with the result: hand it back for saving, or copy to clipboard. */
  purpose: "export" | "copy";
  /** Device scale for the raster: 4 matches the visualizer's PDF export. */
  scale: number;
  /** Stack all results into one tall image (multi-block single PNG). */
  stitch: boolean;
  jobs: Array<{ index: number; name: string; svg: string; width: number; height: number }>;
};

// The website visualizer sizes PDF pages at max(210mm, content width) and lets
// the image fill the page width. Mirror that so both exports look the same.
const MIN_PAGE_WIDTH_PT = 210 * 2.834645669; // A4 width
const PT_PER_CSS_PX = 0.75;
const BLOCK_GAP_PT = BLOCK_GAP;

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "block";
}

function pngBytes(dataUrl: string): Uint8Array {
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
}

/**
 * Build the rasterize request for a set of blocks. Every export goes through
 * the SVG renderer, so PNG and PDF output look identical to the preview.
 */
export function buildRasterizeMessage(
  blocks: BlockRange[],
  indices: number[],
  wrapWidth: number,
  purpose: "export" | "copy",
  scale: number,
  stitch: boolean,
): RasterizeMessage {
  const jobs = indices.map((i) => {
    const svg = renderBlockSvg(blocks[i], wrapWidth);
    const { width, height } = svgSize(svg);
    return { index: i, name: blockName(blocks[i]), svg, width, height };
  });
  return { type: "rasterizeSvgs", purpose, scale, stitch, jobs };
}

/**
 * Validate the dialog's options against the current blocks and build the
 * rasterize request. Returns undefined when nothing valid was selected.
 */
export function beginExport(
  opts: ExportOptions,
  blocks: BlockRange[],
  wrapWidth: number,
): RasterizeMessage | undefined {
  const indices = Array.from(
    new Set(
      (opts.indices || []).filter(
        (i) => Number.isInteger(i) && i >= 0 && i < blocks.length,
      ),
    ),
  ).sort((a, b) => a - b);
  if (indices.length === 0) return undefined;
  opts.indices = indices;

  return buildRasterizeMessage(
    blocks,
    indices,
    wrapWidth,
    "export",
    opts.format === "pdf" ? 4 : 2,
    opts.format === "png" && opts.layout === "single" && indices.length > 1,
  );
}

async function buildPdf(
  items: ExportItem[],
  pages: "perBlock" | "continuous",
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setProducer("ACDL VSCode extension");
  doc.setCreator("ACDL preview");

  const embedded = [];
  for (const item of items) {
    const img = await doc.embedPng(pngBytes(item.dataUrl));
    embedded.push({
      img,
      w: item.width * PT_PER_CSS_PX,
      h: item.height * PT_PER_CSS_PX,
    });
  }

  // One scale factor for the whole document so blocks keep their relative
  // sizes; narrow content is scaled up to fill an A4-width page, like the
  // visualizer does for a single export.
  const maxW = Math.max(...embedded.map((e) => e.w));
  const pageW = Math.max(MIN_PAGE_WIDTH_PT, maxW);
  const scale = pageW / maxW;

  if (pages === "continuous" && embedded.length > 1) {
    const pageH =
      embedded.reduce((sum, e) => sum + e.h * scale, 0) +
      BLOCK_GAP_PT * (embedded.length - 1);
    const page = doc.addPage([pageW, pageH]);
    let y = pageH;
    for (const e of embedded) {
      const h = e.h * scale;
      y -= h;
      page.drawImage(e.img, { x: 0, y, width: e.w * scale, height: h });
      y -= BLOCK_GAP_PT;
    }
  } else {
    for (const e of embedded) {
      const h = e.h * scale;
      const page = doc.addPage([pageW, h]);
      page.drawImage(e.img, { x: 0, y: 0, width: e.w * scale, height: h });
    }
  }

  return doc.save();
}

/**
 * Write the rasterized blocks to disk, prompting for a file (single output)
 * or a folder (one file per block).
 */
export async function completeExport(
  opts: ExportOptions,
  items: ExportItem[],
  sourceUri: vscode.Uri | undefined,
): Promise<void> {
  if (!items || items.length === 0) return;

  const dir = sourceUri ? path.dirname(sourceUri.fsPath) : process.cwd();
  const base = sourceUri
    ? path.basename(sourceUri.fsPath, path.extname(sourceUri.fsPath))
    : "acdl-preview";
  const ext = opts.format;
  const EXT = ext.toUpperCase();

  if (opts.layout === "separate" && items.length > 1) {
    const picked = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      defaultUri: vscode.Uri.file(dir),
      openLabel: "Export here",
      title: `Choose a folder for ${items.length} ${EXT} files`,
    });
    const folder = picked?.[0];
    if (!folder) return;

    const pad = String(items[items.length - 1].index + 1).length;
    const written: vscode.Uri[] = [];
    for (const item of items) {
      const file = `${base}-${String(item.index + 1).padStart(pad, "0")}-${safeFileName(item.name)}.${ext}`;
      const target = vscode.Uri.joinPath(folder, file);
      const bytes =
        opts.format === "png"
          ? pngBytes(item.dataUrl)
          : await buildPdf([item], "perBlock");
      await vscode.workspace.fs.writeFile(target, bytes);
      written.push(target);
    }
    const choice = await vscode.window.showInformationMessage(
      `Exported ${written.length} ${EXT} files to ${folder.fsPath}`,
      "Open folder",
    );
    if (choice === "Open folder") {
      await vscode.commands.executeCommand("revealFileInOS", written[0]);
    }
    return;
  }

  // Single output file. A multi-block PNG arrives already stitched into one item.
  const suggested =
    opts.indices.length === 1
      ? `${base}-${safeFileName(items[0].name)}.${ext}`
      : `${base}.${ext}`;
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(dir, suggested)),
    filters: opts.format === "png" ? { Images: ["png"] } : { PDF: ["pdf"] },
  });
  if (!target) return;

  const bytes =
    opts.format === "png"
      ? pngBytes(items[0].dataUrl)
      : await buildPdf(items, opts.pdfPages);
  await vscode.workspace.fs.writeFile(target, bytes);

  const choice = await vscode.window.showInformationMessage(
    `Exported ${target.fsPath}`,
    "Open",
  );
  if (choice === "Open") {
    await vscode.env.openExternal(target);
  }
}
