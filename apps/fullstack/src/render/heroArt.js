/**
 * Портрет героя 48×48. Кожен грейд додає до образу щось своє:
 * худі з кільцем React → бейдж Node → циліндр бази → плащ → капелюх Staff.
 */

import { PALETTE, clear, rect, px, disc, dither, frame, line } from "@edu/pixel-ui";

export const HERO_ART = { width: 48, height: 48 };

export function drawHero(ctx, { gradeIndex = 0 }) {
  clear(ctx, "#182028", 48, 48);
  dither(ctx, 0, 36, 48, 12, "#243240", 2);

  // Плащ Senior+ позаду тіла.
  if (gradeIndex >= 3) {
    rect(ctx, 12, 22, 24, 20, "#7a2238");
    rect(ctx, 13, 22, 22, 18, "#9a2e48");
  }
  // Тіло — худі.
  rect(ctx, 15, 24, 18, 16, "#2f3f6f");
  rect(ctx, 16, 25, 16, 14, "#3a4c86");
  rect(ctx, 22, 25, 4, 3, "#2f3f6f");
  // Голова.
  rect(ctx, 18, 12, 12, 12, "#f0c9a0");
  rect(ctx, 18, 10, 12, 4, "#3a2a1c");
  px(ctx, 21, 17, PALETTE.ink);
  px(ctx, 26, 17, PALETTE.ink);
  rect(ctx, 22, 20, 4, 1, "#b0705a");
  // Кільце React на худі.
  disc(ctx, 24, 32, 3, "#61dafb");
  disc(ctx, 24, 32, 1, "#3a4c86");
  px(ctx, 24, 32, "#61dafb");
  // Junior+: бейдж Node на плечі.
  if (gradeIndex >= 1) {
    rect(ctx, 29, 26, 4, 4, "#3c873a");
    px(ctx, 30, 27, "#bfe0b2");
  }
  // Middle+: циліндр бази в руці.
  if (gradeIndex >= 2) {
    rect(ctx, 34, 30, 7, 8, "#336791");
    rect(ctx, 34, 29, 7, 2, "#5a8fbf");
    line(ctx, 34, 33, 40, 33, "#5a8fbf");
  }
  // Staff: капелюх.
  if (gradeIndex >= 4) {
    rect(ctx, 16, 8, 16, 3, "#a08a3a");
    rect(ctx, 19, 2, 10, 7, "#a08a3a");
    px(ctx, 24, 4, "#f0d59a");
  }
  frame(ctx, 0, 0, 48, 48, PALETTE.ink);
}
