// src/main-diff.ts
//
// CLI: structural diff between two ACDL descriptions.
//
//   bun run src/main-diff.ts <fileA.acdl> <fileB.acdl> [--json] [--no-color]
//
// Exit code is 0 when the files are structurally identical, 1 when they differ,
// so it can be dropped into scripts / pre-commit checks.

import * as fs from "fs";
import { diffFiles, formatDiff } from "./diff";

function read(p: string): string {
  const path = fs.existsSync(p) ? p : p.endsWith(".acdl") ? p : `${p}.acdl`;
  if (!fs.existsSync(path)) {
    console.error(`File not found: ${p}`);
    process.exit(2);
  }
  return fs.readFileSync(path, "utf-8");
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const noColor = args.includes("--no-color");
  const files = args.filter((a) => !a.startsWith("--"));

  if (files.length < 2) {
    console.error("Usage: bun run src/main-diff.ts <fileA.acdl> <fileB.acdl> [--json] [--no-color]");
    process.exit(2);
  }

  let lines;
  try {
    lines = diffFiles(read(files[0]), read(files[1]));
  } catch (err: any) {
    console.error(`Parse error: ${err.message}`);
    process.exit(2);
  }

  const changed = lines.filter((l) => l.op !== "context").length;
  if (asJson) {
    console.log(JSON.stringify(lines, null, 2));
  } else {
    console.log(`\x1b[1m${files[0]}\x1b[0m  →  \x1b[1m${files[1]}\x1b[0m\n`);
    console.log(formatDiff(lines, !noColor && process.stdout.isTTY));
  }

  process.exit(changed === 0 ? 0 : 1);
}

main();
