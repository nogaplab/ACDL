import { defineConfig } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "src",
  server: {
    open: "/index.html",
    fs: {
      // Allow serving files from the ACDL_examples and fonts directories
      // (one level up from root)
      allow: [
        path.resolve(__dirname, "src"),
        path.resolve(__dirname, "ACDL_examples"),
        path.resolve(__dirname, "fonts"),
      ],
    },
  },
  resolve: {
    alias: {
      // Map /ACDL_examples to the actual folder
      "/ACDL_examples": path.resolve(__dirname, "ACDL_examples"),
    },
  },
  plugins: [
    {
      name: "serve-acdl-examples",
      configureServer(server) {
        // Middleware to serve ACDL_examples folder for fetch() requests
        server.middlewares.use("/ACDL_examples", (req, res, next) => {
          const filePath = path.join(__dirname, "ACDL_examples", req.url || "");
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            fs.createReadStream(filePath).pipe(res);
          } else {
            next();
          }
        });
      },
    },
    {
      name: "serve-fonts",
      configureServer(server) {
        // The SVG/PDF export renderer (src/svg-layout.ts) fetches the JetBrains
        // Mono .ttf files from /fonts so it has real glyph metrics. The fonts
        // live one level up from the Vite root, so serve them explicitly —
        // otherwise the request falls through to index.html and font parsing
        // fails, leaving the export with estimated widths (boxes too narrow).
        server.middlewares.use("/fonts", (req, res, next) => {
          const filePath = path.join(__dirname, "fonts", req.url || "");
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.setHeader("Content-Type", "font/ttf");
            fs.createReadStream(filePath).pipe(res);
          } else {
            next();
          }
        });
      },
    },
  ],
});
