import { PALETTE, clear, rect, px, line, dither, disc, frame } from "@edu/pixel-ui";

/** Мініатюра: нічна серверна — шафи з вогниками, кабелі й хмара над ними. */
export function drawSysdesign(ctx, { width, height }) {
  clear(ctx, "#131b24", width, height);
  dither(ctx, 0, 0, width, 12, "#1b2632", 3);

  // Хмара — куди врешті переїжджає будь-яка серверна.
  disc(ctx, 94, 9, 4, "#26374a");
  disc(ctx, 101, 7, 5, "#26374a");
  disc(ctx, 108, 10, 3, "#26374a");
  rect(ctx, 91, 10, 19, 4, "#26374a");

  rect(ctx, 0, 39, width, 6, "#1b2632");
  rect(ctx, 0, 39, width, 1, PALETTE.ink);

  // Шафи з вогниками: зелений — живе, жовтий — на межі.
  for (let i = 0; i < 5; i += 1) {
    const x = 8 + i * 16;
    rect(ctx, x, 15, 12, 24, PALETTE.ink);
    rect(ctx, x + 1, 16, 10, 22, "#26374a");
    for (let slot = 0; slot < 4; slot += 1) {
      const y = 18 + slot * 5;
      rect(ctx, x + 2, y, 8, 3, "#1b2632");
      px(ctx, x + 3, y + 1, (i + slot) % 5 === 3 ? PALETTE.warn : "#57d18b");
      rect(ctx, x + 6, y + 1, 3, 1, "#3a4c60");
    }
  }

  // Кабелі між шафами й вузький канал до хмари.
  for (let i = 0; i < 4; i += 1) {
    const x0 = 20 + i * 16;
    line(ctx, x0, 18, x0 + 2, 21, "#2f6f8f");
    line(ctx, x0 + 2, 21, x0 + 4, 18, "#2f6f8f");
  }
  line(ctx, 86, 24, 96, 13, "#2f6f8f");

  frame(ctx, 0, 0, width, height, PALETTE.ink);
}
