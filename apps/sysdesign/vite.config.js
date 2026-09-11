import { defineConfig } from "vite";

export default defineConfig({
  // Відносний base — збірка релокабельна: працює і сама по собі,
  // і під підшляхом /games/sysdesign/ на спільному сайті.
  base: "./",
  // Порт фіксований і продубльований у packages/catalog (поле devPort):
  // саме за ним портал будує посилання в дев-режимі.
  server: { port: 5184, strictPort: true, open: false },
  // Бандл важкий через контент (довідник, картки, співбесіди — сотні КБ тексту),
  // а не через код. Ділити його на чанки немає сенсу: довідник потрібен з
  // першого екрана, бо відкривається з будь-якого місця гри.
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1200 },
});
