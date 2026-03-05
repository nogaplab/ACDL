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
      // Allow serving files from the ACDL_examples directory (one level up from root)
      allow: [
        path.resolve(__dirname, "src"),
        path.resolve(__dirname, "ACDL_examples"),
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
  ],
});
