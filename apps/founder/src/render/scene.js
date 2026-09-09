/**
 * Кімната соло-розробника, 320×180.
 *
 * Сцена показує те, що не влазить у цифри: скільки на полиці накопичилося
 * технічного боргу, скільки на стіні клієнтів, як виглядає графік на екрані
 * і в якій позі сидить людина. Текст на канві не малюється — підписи живуть
 * у DOM поверх неї.
 */

import { clear, rect, px, line, disc, dither, frame } from "@edu/pixel-ui";
import { ROOM, skyFor } from "./palette.js";

export const SCENE = { width: 320, height: 180 };

const FLOOR_Y = 128;

export function drawScene(ctx, { state, event }) {
  const { product, biz, founder, month } = state;
  const tired = founder.energy < 35;

  clear(ctx, tired ? ROOM.wallDark : ROOM.wall, SCENE.width, SCENE.height);
  rect(ctx, 0, FLOOR_Y, SCENE.width, SCENE.height - FLOOR_Y, ROOM.floor);
  rect(ctx, 0, FLOOR_Y, SCENE.width, 2, ROOM.floorDark);
  dither(ctx, 0, FLOOR_Y + 6, SCENE.width, SCENE.height - FLOOR_Y - 6, ROOM.floorDark, 3);

  drawWindow(ctx, month, tired);
  drawShelf(ctx, product.techDebt, product.bugs);
  drawCustomerWall(ctx, biz.customers);
  drawDesk(ctx);
  drawMonitor(ctx, state);
  drawFounder(ctx, founder.energy);
  drawLamp(ctx, founder.energy);

  if (event) drawAlert(ctx, event);
}

/** Вікно: пора року видно з першого погляду. */
function drawWindow(ctx, month, tired) {
  const x = 236;
  const y = 16;
  const w = 68;
  const h = 58;

  rect(ctx, x - 2, y - 2, w + 4, h + 4, ROOM.wallLight);
  rect(ctx, x, y, w, h, skyFor(month));
  if (tired) dither(ctx, x, y, w, h, ROOM.night, 2);

  // Далекі будинки — місто живе своїм життям, поки ви працюєте.
  rect(ctx, x, y + 34, w, h - 34, "#5a6a80");
  for (let i = 0; i < 5; i += 1) {
    const bx = x + 4 + i * 13;
    const bh = 10 + ((i * 7) % 14);
    rect(ctx, bx, y + h - bh - 8, 9, bh, "#465570");
    for (let wy = 0; wy < bh - 4; wy += 4) {
      if ((i + wy) % 3 === 0) px(ctx, bx + 3, y + h - bh - 6 + wy, ROOM.lamp);
    }
  }

  rect(ctx, x + w / 2 - 1, y, 2, h, ROOM.wallLight);
  rect(ctx, x, y + h / 2 - 1, w, 2, ROOM.wallLight);
  frame(ctx, x, y, w, h, ROOM.wallDark);
}

/** Полиця з коробками — накопичений технічний борг видно фізично. */
function drawShelf(ctx, techDebt, bugs) {
  const x = 10;
  const y = 24;

  rect(ctx, x, y + 46, 52, 3, ROOM.desk);
  rect(ctx, x, y + 22, 52, 3, ROOM.desk);

  const boxes = Math.round(techDebt / 12);
  for (let i = 0; i < Math.min(8, boxes); i += 1) {
    const row = i < 4 ? 0 : 1;
    const col = i % 4;
    const bx = x + 2 + col * 12;
    const by = row === 0 ? y + 10 : y + 34;
    rect(ctx, bx, by, 10, 12, ROOM.box);
    rect(ctx, bx, by, 10, 2, ROOM.boxDark);
    line(ctx, bx, by + 6, bx + 9, by + 6, ROOM.boxDark);
  }

  // Баги — дрібні плями, які помітні лише зблизька, як і в житті.
  const spots = Math.round(bugs / 14);
  for (let i = 0; i < Math.min(6, spots); i += 1) {
    px(ctx, x + 4 + ((i * 9) % 46), y + 50 + ((i * 5) % 6), "#c0553a");
  }
}

/** Стіна клієнтів: одна крапка — один клієнт, поки їх можна перелічити. */
function drawCustomerWall(ctx, customers) {
  if (customers <= 0) return;

  const x = 76;
  const y = 20;
  const cols = 18;
  const rows = 6;
  const capacity = cols * rows;
  const perDot = Math.max(1, Math.ceil(customers / capacity));
  const dots = Math.min(capacity, Math.ceil(customers / perDot));

  for (let i = 0; i < dots; i += 1) {
    const cx = x + (i % cols) * 8;
    const cy = y + Math.floor(i / cols) * 8;
    disc(ctx, cx + 2, cy + 2, 2, i < dots - 1 ? ROOM.customer : ROOM.customerDim);
  }
}

function drawDesk(ctx) {
  rect(ctx, 24, 116, 272, 8, ROOM.desk);
  rect(ctx, 24, 116, 272, 2, ROOM.deskEdge);
  rect(ctx, 34, 124, 6, FLOOR_Y - 124 + 22, ROOM.deskEdge);
  rect(ctx, 280, 124, 6, FLOOR_Y - 124 + 22, ROOM.deskEdge);
}

/** Монітор із графіком MRR — головне число гри намальоване, а не написане. */
function drawMonitor(ctx, state) {
  const x = 168;
  const y = 66;
  const w = 96;
  const h = 50;

  rect(ctx, x + w / 2 - 6, y + h, 12, 6, ROOM.monitorFrame);
  rect(ctx, x + w / 2 - 14, y + h + 6, 28, 3, ROOM.monitorFrame);

  rect(ctx, x, y, w, h, ROOM.monitorFrame);
  rect(ctx, x + 3, y + 3, w - 6, h - 8, ROOM.screen);

  const inner = { x: x + 6, y: y + 6, w: w - 12, h: h - 16 };

  for (let gy = 0; gy <= 3; gy += 1) {
    line(ctx, inner.x, inner.y + (gy * inner.h) / 3, inner.x + inner.w, inner.y + (gy * inner.h) / 3, ROOM.grid);
  }

  const series = state.history.map((entry) => entry.mrr);
  if (series.length < 2) {
    // Порожній екран — теж стан, і його треба показати чесно.
    dither(ctx, inner.x, inner.y, inner.w, inner.h, ROOM.grid, 3);
    return;
  }

  const peak = Math.max(1, ...series);
  const step = inner.w / Math.max(1, series.length - 1);
  let prev = null;
  for (let i = 0; i < series.length; i += 1) {
    const cx = Math.round(inner.x + i * step);
    const cy = Math.round(inner.y + inner.h - (series[i] / peak) * inner.h);
    if (prev) line(ctx, prev.x, prev.y, cx, cy, ROOM.chart);
    prev = { x: cx, y: cy };
  }
  if (prev) disc(ctx, prev.x, prev.y, 1, "#b6f7d4");

  rect(ctx, inner.x, inner.y + inner.h + 2, inner.w, 1, ROOM.chartDim);
}

/** Постать за столом. Поза читається як рівень сил. */
function drawFounder(ctx, energy) {
  const x = 116;
  const slump = energy < 35 ? 4 : energy < 60 ? 2 : 0;
  const y = 74 + slump;
  const shirt = energy < 35 ? ROOM.shirtTired : ROOM.shirt;

  // Крісло.
  rect(ctx, x - 12, y + 18, 6, 34, "#2a2438");
  rect(ctx, x - 12, y + 48, 26, 4, "#2a2438");

  // Тулуб і голова.
  rect(ctx, x - 6, y + 14, 20, 26, shirt);
  rect(ctx, x - 2, y + 2, 12, 12, ROOM.skin);
  rect(ctx, x - 3, y, 14, 5, ROOM.hair);
  rect(ctx, x - 3, y + 4, 3, 6, ROOM.hair);

  // Руки до столу.
  rect(ctx, x + 12, y + 20, 14, 4, ROOM.skin);
  rect(ctx, x + 12, y + 28, 14, 4, shirt);

  if (energy < 35) {
    // Голова нижче, плечі опущені — те, чого не скаже жодна цифра.
    px(ctx, x + 1, y + 8, ROOM.wallDark);
    px(ctx, x + 7, y + 8, ROOM.wallDark);
  }
}

/** Лампа: єдине джерело світла, коли робочий день давно скінчився. */
function drawLamp(ctx, energy) {
  const x = 54;
  const y = 92;

  rect(ctx, x, y + 20, 12, 4, ROOM.deskEdge);
  rect(ctx, x + 5, y + 6, 2, 16, ROOM.deskEdge);
  rect(ctx, x - 2, y, 16, 6, ROOM.lampGlow);
  rect(ctx, x, y + 6, 12, 2, ROOM.lamp);

  const reach = energy < 35 ? 16 : 26;
  dither(ctx, x - 6, y + 8, 24, reach, ROOM.lamp, 4);
}

/** Подія місяця — червона позначка, яку неможливо не помітити. */
function drawAlert(ctx, event) {
  const bad = ["payment_hold", "critical_bug", "chargebacks", "illness", "big_customer_churn", "competitor_launch", "family_emergency", "platform_change"];
  const color = bad.includes(event.id) ? "#c0553a" : "#4fd18b";

  rect(ctx, 4, 4, 10, 10, color);
  frame(ctx, 4, 4, 10, 10, ROOM.ink);
  px(ctx, 8, 7, ROOM.ink);
  px(ctx, 8, 9, ROOM.ink);
  px(ctx, 8, 10, ROOM.ink);
}
