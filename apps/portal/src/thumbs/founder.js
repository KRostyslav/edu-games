import { PALETTE, clear, rect, disc, line, dither, frame } from "@edu/pixel-ui";

/** Мініатюра: нічний стіл, монітор із графіком, що росте, і чашка кави. */
export function drawFounder(ctx, { width, height }) {
  clear(ctx, "#2e2940", width, height);
  dither(ctx, 0, 0, width, 14, "#3b3550", 3);

  // Стіл.
  rect(ctx, 0, 36, width, height - 36, PALETTE.wood);
  rect(ctx, 0, 36, width, 1, PALETTE.woodDark);

  // Монітор із висхідним графіком — головне число гри намальоване, а не написане.
  const mx = 34;
  const my = 8;
  const mw = 52;
  const mh = 26;
  rect(ctx, mx, my, mw, mh, "#20202c");
  rect(ctx, mx + 2, my + 2, mw - 4, mh - 4, "#101a26");
  rect(ctx, mx + mw / 2 - 4, my + mh, 8, 3, "#20202c");

  const points = [3, 5, 4, 8, 12, 11, 16, 21];
  for (let i = 1; i < points.length; i += 1) {
    const x0 = mx + 4 + (i - 1) * 6;
    const x1 = mx + 4 + i * 6;
    line(ctx, x0, my + mh - 5 - points[i - 1], x1, my + mh - 5 - points[i], "#4fd18b");
  }

  // Настільна лампа — єдине світло, коли робочий день давно скінчився.
  rect(ctx, 12, 26, 10, 3, PALETTE.warn);
  rect(ctx, 16, 29, 2, 7, PALETTE.woodDark);
  dither(ctx, 8, 29, 18, 12, PALETTE.warn, 4);

  // Чашка кави.
  rect(ctx, 96, 28, 8, 8, PALETTE.paper);
  rect(ctx, 104, 30, 2, 4, PALETTE.paper);
  rect(ctx, 96, 28, 8, 2, "#6b4a2f");

  // Клієнти на стіні — крапки, які ще треба заробити.
  for (let i = 0; i < 6; i += 1) disc(ctx, 96 + (i % 3) * 7, 10 + Math.floor(i / 3) * 7, 2, "#6fd3e8");

  frame(ctx, 0, 0, width, height, PALETTE.ink);
}
