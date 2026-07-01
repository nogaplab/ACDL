// scripts/diff.mjs
//
// Node runner for the ACDL structural diff (no bun required).
// Transpiles src/main-diff.ts on the fly with the esbuild already in
// node_modules, then executes it. argv is passed straight through.
//
//   node scripts/diff.mjs <fileA.acdl> <fileB.acdl> [--json] [--no-color]
//   npm run diff -- <fileA.acdl> <fileB.acdl>

import { build } from "esbuild";
import { fileURLToPath } from "url";
import * as path from "path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const res = await build({
  entryPoints: [path.join(root, "src/main-diff.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});

// Import from a data: URL so there's no temp file to clean up (main-diff.ts
// calls process.exit(), which would otherwise skip cleanup).
const code = res.outputFiles[0].text;
await import("data:text/javascript," + encodeURIComponent(code));
