/**
 * Мапа світу: острови-акти на нічному «терміналі», з'єднані стежкою.
 * Процедурно, примітивами pixel-ui — жодного графічного асета.
 *
 * Стан острова читається з кольору: пройдений — з прапорцем, відкритий —
 * у кольорі акту, закритий — сірий дизеринг, «скоро» — контур у тумані.
 */

import { PALETTE, clear, rect, px, line, disc, dither, frame, sprite } from "@edu/pixel-ui";

export const WORLD = { width: 320, height: 124 };

const NIGHT = "#11161b";
const GRID = "#18212a";
const PATH = "#3a4a58";
const FOG = "#2a3440";

/** Змійка: верхній ряд зліва направо, нижній — справа наліво. */
export function islandPositions(count) {
  const top = Math.ceil(count / 2);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    if (i < top) out.push({ x: 26 + i * Math.floor(268 / Math.max(1, top - 1)), y: 36 });
    else {
      const j = i - top;
      const bottom = count - top;
      out.push({ x: 294 - 22 - j * Math.floor(250 / Math.max(1, bottom - 1)), y: 92 });
    }
  }
  return out;
}

const HERO = ["  aa  ", "  ss  ", " gggg ", " gggg ", "  bb  ", "  bb  "];

const FLAG = ["wf  ", "wff ", "w   ", "w   "];

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function drawIsland(ctx, x, y, act) {
  const { state, color } = act;
  if (state === "soon") {
    dither(ctx, x - 12, y - 7, 24, 14, FOG, 2);
    disc(ctx, x, y + 1, 9, FOG);
    disc(ctx, x, y, 8, NIGHT);
    dither(ctx, x - 7, y - 5, 14, 10, FOG, 3);
    return;
  }
  const base = state === "locked" ? "#4a5562" : color;
  disc(ctx, x, y + 2, 11, shade(base, -60));
  disc(ctx, x, y, 11, shade(base, -25));
  disc(ctx, x - 1, y - 1, 9, base);
  disc(ctx, x - 3, y - 3, 3, shade(base, 40));
  if (state === "locked") dither(ctx, x - 10, y - 10, 20, 20, "#2a3440", 2);
  if (act.boss) {
    // Лігво боса — темна вежа на краю острова.
    const bx = x + 5;
    rect(ctx, bx, y - 12, 5, 9, PALETTE.ink);
    rect(ctx, bx + 1, y - 11, 3, 7, act.bossWon ? "#4a9a3a" : "#b83a5a");
    px(ctx, bx + 2, y - 9, act.bossWon ? "#bfe0b2" : "#ffd0d8");
  }
  if (state === "done") sprite(ctx, x - 6, y - 14, FLAG, { w: "#e6dcc4", f: "#6cc16a" });
}

/**
 * @param acts [{ id, color, state: "done"|"open"|"locked"|"soon", boss, bossWon }]
 * @param current індекс акту, де стоїть герой
 */
export function drawWorldMap(ctx, { acts, current = 0, frameTick = 0 }) {
  const { width, height } = WORLD;
  clear(ctx, NIGHT, width, height);
  for (let x = 0; x < width; x += 16) line(ctx, x, 0, x, height - 1, GRID);
  for (let y = 0; y < height; y += 16) line(ctx, 0, y, width - 1, y, GRID);

  const points = islandPositions(acts.length);
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const passed = acts[i].state === "done";
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let s = 0; s <= steps; s += 3) {
      const t = s / steps;
      const x = Math.round(a.x + (b.x - a.x) * t);
      const y = Math.round(a.y + (b.y - a.y) * t);
      px(ctx, x, y, passed ? "#6cc16a" : PATH);
      px(ctx, x + 1, y, passed ? "#3c873a" : GRID);
    }
  }
  acts.forEach((act, index) => drawIsland(ctx, points[index].x, points[index].y, act));

  const hero = points[Math.min(current, points.length - 1)];
  const bob = frameTick % 2;
  sprite(ctx, hero.x - 3, hero.y - 20 - bob, HERO, { a: "#1b1610", s: "#f0c9a0", g: "#3c873a", b: "#2f3f6f" });
  frame(ctx, 0, 0, width, height, PALETTE.ink);
}
