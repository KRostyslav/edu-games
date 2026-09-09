import { defineConfig } from "vite";

export default defineConfig({
  // Відносний base — сайт має однаково працювати і з кореня домену, і з підтеки.
  base: "./",
  server: { port: 5180, strictPort: true, open: true },
  build: { outDir: "dist", emptyOutDir: true },
});
