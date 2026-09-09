import { defineConfig } from "vite";

export default defineConfig({
  // Відносний base — збірка релокабельна: працює і сама по собі,
  // і під підшляхом /games/founder/ на спільному сайті.
  base: "./",
  // Порт фіксований і продубльований у packages/catalog (поле devPort):
  // саме за ним портал будує посилання в дев-режимі.
  server: { port: 5183, strictPort: true, open: false },
  build: { outDir: "dist", emptyOutDir: true },
});
