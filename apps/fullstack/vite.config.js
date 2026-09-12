import { defineConfig } from "vite";

// base: "./" — щоб збірка працювала однаково з кореня й з /games/fullstack/.
// PGlite не можна пре-бандлити: він шукає свої pglite.wasm / pglite.data через
// new URL("./…", import.meta.url), і після esbuild-оптимізації шляхи губляться.
// Воркери — ES-модулі, бо PGlite всередині воркера має динамічні імпорти,
// а формат "iife" за замовчуванням їх не розділяє на чанки.
export default defineConfig({
  base: "./",
  server: { port: 5185, strictPort: true, open: false },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["@electric-sql/pglite"] },
  build: { outDir: "dist", emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 1200 },
});
