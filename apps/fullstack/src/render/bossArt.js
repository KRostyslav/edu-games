/**
 * Боси — процедурні піксельні спрайти 96×64. Кожен уособлює свій інцидент:
 *   blocker     — кам'яний голем, що затиснув собою коло event loop;
 *   storm       — грозова хмара, що б'є блискавками 502;
 *   blackfriday — монстр-візок із ціновою биркою й зубами.
 * Що менше в боса здоров'я (непройдених фаз), то більше на ньому тріщин.
 */

import { PALETTE, clear, rect, px, line, disc, dither, frame } from "@edu/pixel-ui";

export const BOSS_ART = { width: 96, height: 64 };

function cracks(ctx, damage, x, y, w, h, color) {
  // Детерміновані «тріщини»: кількість пропорційна завданій шкоді.
  const count = Math.round(damage * 6);
  for (let i = 0; i < count; i += 1) {
    const cx = x + ((i * 37) % w);
    const cy = y + ((i * 23) % h);
    line(ctx, cx, cy, cx + 3, cy + 2, color);
    line(ctx, cx + 3, cy + 2, cx + 1, cy + 5, color);
  }
}

function drawBlocker(ctx, damage, tick) {
  clear(ctx, "#161c22", 96, 64);
  dither(ctx, 0, 48, 96, 16, "#222c36", 2);
  // Коло event loop, яке голем тримає — сегменти гаснуть, коли він блокує.
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const x = Math.round(48 + Math.cos(a) * 26);
    const y = Math.round(30 + Math.sin(a) * 22);
    rect(ctx, x, y, 2, 2, i === tick % 16 ? "#6cc16a" : "#2c3e2c");
  }
  rect(ctx, 32, 16, 32, 30, "#5a5f66");
  rect(ctx, 34, 18, 28, 26, "#6e747c");
  rect(ctx, 26, 22, 8, 16, "#5a5f66");
  rect(ctx, 62, 22, 8, 16, "#5a5f66");
  rect(ctx, 36, 46, 8, 10, "#4a4f56");
  rect(ctx, 52, 46, 8, 10, "#4a4f56");
  rect(ctx, 40, 24, 5, 3, "#d4941f");
  rect(ctx, 51, 24, 5, 3, "#d4941f");
  rect(ctx, 42, 34, 12, 2, PALETTE.ink);
  // «while(true)» на грудях.
  rect(ctx, 38, 38, 20, 4, "#3c4148");
  for (let i = 0; i < 9; i += 1) px(ctx, 39 + i * 2, 39 + (i % 2), "#b83a2a");
  cracks(ctx, damage, 34, 18, 28, 26, "#2a2d31");
}

function drawStorm(ctx, damage, tick) {
  clear(ctx, "#12161d", 96, 64);
  disc(ctx, 34, 20, 12, "#39424e");
  disc(ctx, 50, 16, 15, "#434d5a");
  disc(ctx, 66, 22, 11, "#39424e");
  rect(ctx, 24, 20, 54, 12, "#39424e");
  dither(ctx, 26, 8, 50, 22, "#56616f", 3);
  rect(ctx, 42, 18, 4, 3, "#e6dcc4");
  rect(ctx, 54, 18, 4, 3, "#e6dcc4");
  px(ctx, 43, 19, PALETTE.ink);
  px(ctx, 55, 19, PALETTE.ink);
  // Блискавки 502 — миготять по черзі.
  const bolts = [
    [34, 32],
    [50, 34],
    [64, 32],
  ];
  bolts.forEach(([x, y], i) => {
    const on = (tick + i) % 3 !== 0;
    const c = on ? "#f0d59a" : "#5a5030";
    line(ctx, x, y, x - 3, y + 8, c);
    line(ctx, x - 3, y + 8, x + 1, y + 8, c);
    line(ctx, x + 1, y + 8, x - 2, y + 18, c);
  });
  // Дощ ретраїв.
  for (let i = 0; i < 24; i += 1) px(ctx, 20 + ((i * 13 + tick * 3) % 60), 36 + ((i * 7 + tick * 5) % 26), "#3f7fb0");
  cracks(ctx, damage, 28, 10, 44, 20, "#1f252d");
}

function drawBlackFriday(ctx, damage, tick) {
  clear(ctx, "#1a1418", 96, 64);
  dither(ctx, 0, 52, 96, 12, "#2a2026", 2);
  // Візок-монстр.
  rect(ctx, 26, 22, 44, 22, "#8c3a3a");
  rect(ctx, 28, 24, 40, 18, "#a84646");
  for (let i = 0; i < 5; i += 1) line(ctx, 30 + i * 9, 24, 30 + i * 9, 41, "#7a2e2e");
  line(ctx, 20, 16, 26, 22, "#c9bb9a");
  rect(ctx, 16, 14, 6, 3, "#c9bb9a");
  disc(ctx, 34, 50, 4, PALETTE.ink);
  disc(ctx, 62, 50, 4, PALETTE.ink);
  disc(ctx, 34, 50, 2, "#6b5f4c");
  disc(ctx, 62, 50, 2, "#6b5f4c");
  // Зуби й очі.
  for (let i = 0; i < 8; i += 1) rect(ctx, 30 + i * 5, 40, 3, 3, "#f2e9d2");
  rect(ctx, 36, 28, 5, 4, "#f0d59a");
  rect(ctx, 55, 28, 5, 4, "#f0d59a");
  px(ctx, 38 + (tick % 2), 30, PALETTE.ink);
  px(ctx, 57 + (tick % 2), 30, PALETTE.ink);
  // Бирка «−90%».
  rect(ctx, 68, 8, 18, 10, "#d4941f");
  px(ctx, 70, 12, PALETTE.ink);
  rect(ctx, 73, 12, 3, 1, PALETTE.ink);
  rect(ctx, 77, 10, 2, 5, PALETTE.ink);
  rect(ctx, 80, 10, 2, 5, PALETTE.ink);
  line(ctx, 70, 18, 68, 22, "#c9bb9a");
  cracks(ctx, damage, 28, 24, 40, 16, "#5a2020");
}

const DRAW = { blocker: drawBlocker, storm: drawStorm, blackfriday: drawBlackFriday };

/** damage 0..1 — частка пройдених фаз; tick — кадр простої анімації. */
export function drawBoss(ctx, { sprite, damage = 0, tick = 0, defeated = false }) {
  (DRAW[sprite] ?? drawBlocker)(ctx, damage, tick);
  if (defeated) dither(ctx, 0, 0, 96, 64, "#11161b", 2);
  frame(ctx, 0, 0, 96, 64, PALETTE.ink);
}
