import { PALETTE, clear, rect, px, line, dither, frame } from "@edu/pixel-ui";

/**
 * Мініатюра: ліворуч вікно браузера з кільцем React, праворуч сервер і база,
 * між ними — міст-запит, яким герой переходить на той бік API.
 */
export function drawFullstack(ctx, { width, height }) {
  clear(ctx, "#11161b", width, height);
  dither(ctx, 0, 0, width, height, "#18212a", 3);

  // Браузер.
  rect(ctx, 6, 8, 34, 26, PALETTE.ink);
  rect(ctx, 7, 9, 32, 5, "#c9bb9a");
  px(ctx, 9, 11, PALETTE.bad);
  px(ctx, 11, 11, PALETTE.warn);
  px(ctx, 13, 11, PALETTE.good);
  rect(ctx, 7, 14, 32, 19, "#1f2a36");
  line(ctx, 17, 20, 29, 26, "#61dafb");
  line(ctx, 17, 26, 29, 20, "#61dafb");
  rect(ctx, 22, 22, 3, 3, "#61dafb");

  // Міст-запит.
  for (let x = 42; x < 78; x += 3) {
    px(ctx, x, 22, "#6cc16a");
    px(ctx, x + 1, 23, "#3c873a");
  }
  line(ctx, 74, 19, 77, 22, "#6cc16a");
  line(ctx, 74, 25, 77, 22, "#6cc16a");

  // Сервер.
  rect(ctx, 80, 6, 16, 30, PALETTE.ink);
  for (let i = 0; i < 4; i += 1) {
    const y = 8 + i * 7;
    rect(ctx, 82, y, 12, 5, "#26374a");
    px(ctx, 84, y + 2, i === 2 ? PALETTE.warn : "#6cc16a");
    rect(ctx, 87, y + 2, 5, 1, "#3a4c60");
  }

  // База — циліндр Postgres.
  rect(ctx, 100, 16, 14, 18, "#336791");
  rect(ctx, 100, 14, 14, 3, "#5a8fbf");
  line(ctx, 100, 22, 113, 22, "#5a8fbf");
  line(ctx, 100, 28, 113, 28, "#5a8fbf");

  rect(ctx, 0, height - 5, width, 5, "#3c873a");
  rect(ctx, 0, height - 6, width, 1, PALETTE.ink);
  frame(ctx, 0, 0, width, height, PALETTE.ink);
}
