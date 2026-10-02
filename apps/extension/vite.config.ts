import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@darkshield/schemas": resolve(__dirname, "../../packages/schemas/src/index.ts"),
      "@darkshield/rules": resolve(__dirname, "../../packages/rules/src/index.ts"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        content: resolve(__dirname, "src/content/content.ts"),
        background: resolve(__dirname, "src/background/background.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "[name].[ext]",
      },
    },
    // Extensions must run in the browser — no minification for easier debugging
    minify: false,
    sourcemap: true,
  },
  // Copy public folder (manifest.json, icons) to dist
  publicDir: "public",
});
