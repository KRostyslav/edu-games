/**
 * Шапка кампанії: нічна серверна з шафами, кабелями й хмарою над нею.
 * Малюється процедурно тими самими примітивами, що й іконки, — жодного
 * графічного асета в репозиторії.
 */

import { PALETTE, clear, rect, px, line, dither, disc } from "@edu/pixel-ui";

export const HUB_ART = { width: 320, height: 72 };

export function drawHubArt(ctx, { stars = 0, total = 45 } = {}) {
  const { width, height } = HUB_ART;
  clear(ctx, "#131b24", width, height);
  dither(ctx, 0, 0, width, 18, "#1b2632", 3);

  // Хмара вгорі праворуч — те, куди врешті переїде вся серверна.
  disc(ctx, 262, 14, 7, "#26374a");
  disc(ctx, 274, 11, 9, "#26374a");
  disc(ctx, 288, 15, 6, "#26374a");
  rect(ctx, 256, 15, 38, 7, "#26374a");

  // Підлога.
  rect(ctx, 0, 62, width, 10, "#1b2632");
  rect(ctx, 0, 62, width, 1, "#000");

  // Шафи: кількість вогників росте з прогресом кампанії.
  const racks = 9;
  const lit = Math.round((stars / Math.max(1, total)) * racks * 5);
  let led = 0;
  for (let i = 0; i < racks; i += 1) {
    const x = 12 + i * 26;
    rect(ctx, x, 24, 20, 38, "#000");
    rect(ctx, x + 1, 25, 18, 36, "#26374a");
    for (let slot = 0; slot < 5; slot += 1) {
      const y = 27 + slot * 7;
      rect(ctx, x + 3, y, 14, 5, "#1b2632");
      rect(ctx, x + 9, y + 2, 7, 1, "#3a4c60");
      const on = led < lit;
      px(ctx, x + 4, y + 2, on ? "#57d18b" : "#3a4c60");
      px(ctx, x + 6, y + 2, on && slot % 2 ? PALETTE.warn : "#3a4c60");
      led += 1;
    }
  }

  // Кабелі між шафами, провислі дугою.
  for (let i = 0; i < racks - 1; i += 1) {
    const x0 = 32 + i * 26;
    line(ctx, x0, 28, x0 + 3, 31, "#2f6f8f");
    line(ctx, x0 + 3, 31, x0 + 6, 28, "#2f6f8f");
  }
  line(ctx, 250, 40, 262, 22, "#2f6f8f");
}
