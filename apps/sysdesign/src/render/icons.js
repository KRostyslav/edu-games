/**
 * Піксельні іконки компонентів 16×16.
 *
 * Малюються тими самими примітивами pixel-ui, що й сцени інших ігор, і
 * кешуються як dataURL: на дошці їх показують звичайні <img> з
 * `image-rendering: pixelated`. Так іконка лишається піксельною, а все
 * навколо неї — текст, фокус, скрінрідер — звичайним DOM.
 */

import { rect, px, line, disc } from "@edu/pixel-ui";

const C = {
  ink: "#1b1610",
  paper: "#e6dcc4",
  light: "#f2e9d2",
  blue: "#2f6f8f",
  sky: "#5a9bbb",
  led: "#57d18b",
  red: "#b83a2a",
  amber: "#d4941f",
  steel: "#8a9aa8",
  dark: "#26374a",
  violet: "#6a4c93",
};

function cylinder(ctx, x, y, w, h, body, top) {
  rect(ctx, x + 1, y, w - 2, h, C.ink);
  rect(ctx, x, y + 1, w, h - 2, C.ink);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, body);
  rect(ctx, x + 1, y + 1, w - 2, 2, top);
}

const DRAW = {
  client(ctx) {
    disc(ctx, 5, 5, 2, C.ink);
    rect(ctx, 2, 8, 6, 7, C.ink);
    rect(ctx, 3, 9, 4, 5, C.blue);
    disc(ctx, 11, 4, 2, C.ink);
    rect(ctx, 8, 7, 7, 8, C.ink);
    rect(ctx, 9, 8, 5, 6, C.sky);
  },
  dns(ctx) {
    rect(ctx, 7, 1, 2, 14, C.dark);
    rect(ctx, 1, 2, 12, 5, C.ink);
    rect(ctx, 2, 3, 10, 3, C.amber);
    px(ctx, 13, 4, C.ink);
    rect(ctx, 3, 8, 12, 5, C.ink);
    rect(ctx, 4, 9, 10, 3, C.sky);
    px(ctx, 2, 10, C.ink);
  },
  server(ctx) {
    rect(ctx, 2, 1, 12, 14, C.ink);
    for (let i = 0; i < 3; i += 1) {
      rect(ctx, 3, 2 + i * 4, 10, 3, C.steel);
      rect(ctx, 7, 3 + i * 4, 5, 1, C.dark);
      px(ctx, 4, 3 + i * 4, i === 1 ? C.amber : C.led);
    }
  },
  app(ctx) {
    rect(ctx, 1, 2, 14, 12, C.ink);
    rect(ctx, 2, 3, 12, 2, C.blue);
    rect(ctx, 2, 5, 12, 8, C.light);
    line(ctx, 5, 7, 3, 9, C.ink);
    line(ctx, 3, 9, 5, 11, C.ink);
    line(ctx, 11, 7, 13, 9, C.ink);
    line(ctx, 13, 9, 11, 11, C.ink);
    line(ctx, 9, 6, 7, 12, C.blue);
  },
  sql(ctx) {
    cylinder(ctx, 2, 1, 12, 14, C.blue, C.sky);
    rect(ctx, 3, 6, 10, 1, C.ink);
    rect(ctx, 3, 10, 10, 1, C.ink);
  },
  nosql(ctx) {
    cylinder(ctx, 0, 1, 7, 7, C.blue, C.sky);
    cylinder(ctx, 9, 1, 7, 7, C.blue, C.sky);
    cylinder(ctx, 4, 8, 8, 7, C.blue, C.sky);
  },
  lb(ctx) {
    rect(ctx, 0, 6, 4, 4, C.ink);
    rect(ctx, 1, 7, 2, 2, C.amber);
    line(ctx, 4, 8, 9, 3, C.ink);
    line(ctx, 4, 8, 9, 8, C.ink);
    line(ctx, 4, 8, 9, 13, C.ink);
    for (const y of [1, 6, 11]) {
      rect(ctx, 10, y, 5, 4, C.ink);
      rect(ctx, 11, y + 1, 3, 2, C.sky);
    }
  },
  cache(ctx) {
    rect(ctx, 1, 1, 14, 14, C.ink);
    rect(ctx, 2, 2, 12, 12, C.red);
    for (const dx of [0, 1]) {
      line(ctx, 9 + dx, 3, 5 + dx, 8, C.light);
      line(ctx, 5 + dx, 8, 10 + dx, 8, C.light);
      line(ctx, 10 + dx, 8, 6 + dx, 13, C.light);
    }
  },
  cdn(ctx) {
    disc(ctx, 8, 8, 7, C.ink);
    disc(ctx, 8, 8, 6, C.sky);
    line(ctx, 8, 2, 8, 14, C.blue);
    line(ctx, 2, 8, 14, 8, C.blue);
    rect(ctx, 5, 3, 1, 10, C.blue);
    rect(ctx, 10, 3, 1, 10, C.blue);
    px(ctx, 5, 5, C.led);
    px(ctx, 11, 11, C.led);
    px(ctx, 10, 4, C.led);
  },
  objstore(ctx) {
    rect(ctx, 1, 2, 14, 3, C.ink);
    rect(ctx, 2, 3, 12, 1, C.amber);
    for (let y = 5; y < 14; y += 1) {
      const inset = Math.floor((y - 5) / 3) + 2;
      rect(ctx, inset, y, 16 - inset * 2, 1, C.ink);
      rect(ctx, inset + 1, y, 14 - inset * 2, 1, y % 3 === 0 ? C.amber : "#b07a18");
    }
    rect(ctx, 5, 14, 6, 1, C.ink);
  },
  gateway(ctx) {
    rect(ctx, 1, 1, 14, 3, C.ink);
    rect(ctx, 2, 2, 12, 1, C.amber);
    rect(ctx, 2, 4, 3, 11, C.dark);
    rect(ctx, 11, 4, 3, 11, C.dark);
    rect(ctx, 6, 5, 1, 10, C.steel);
    rect(ctx, 9, 5, 1, 10, C.steel);
    px(ctx, 3, 6, C.led);
    px(ctx, 12, 6, C.led);
  },
  ratelimiter(ctx) {
    rect(ctx, 2, 1, 12, 2, C.ink);
    rect(ctx, 2, 13, 12, 2, C.ink);
    for (let i = 0; i < 5; i += 1) {
      rect(ctx, 3 + i, 3 + i, 10 - i * 2, 1, i < 2 ? C.amber : C.ink);
      rect(ctx, 3 + i, 12 - i, 10 - i * 2, 1, i < 3 ? C.amber : C.ink);
    }
    px(ctx, 8, 8, C.amber);
  },
  queue(ctx) {
    for (let i = 0; i < 3; i += 1) {
      rect(ctx, 1 + i * 5, 4, 4, 7, C.ink);
      rect(ctx, 2 + i * 5, 5, 2, 5, i === 2 ? C.amber : C.light);
    }
    line(ctx, 0, 13, 15, 13, C.blue);
    px(ctx, 14, 12, C.blue);
    px(ctx, 14, 14, C.blue);
  },
  worker(ctx) {
    rect(ctx, 7, 0, 2, 3, C.ink);
    rect(ctx, 7, 13, 2, 3, C.ink);
    rect(ctx, 0, 7, 3, 2, C.ink);
    rect(ctx, 13, 7, 3, 2, C.ink);
    disc(ctx, 8, 8, 6, C.ink);
    disc(ctx, 8, 8, 5, C.steel);
    disc(ctx, 8, 8, 2, C.ink);
  },
  external(ctx) {
    rect(ctx, 1, 3, 14, 10, C.ink);
    rect(ctx, 2, 4, 12, 8, C.violet);
    rect(ctx, 2, 6, 12, 2, C.ink);
    rect(ctx, 3, 9, 4, 1, C.amber);
    rect(ctx, 9, 9, 3, 1, C.light);
  },
  wsgateway(ctx) {
    rect(ctx, 2, 2, 12, 12, C.ink);
    rect(ctx, 3, 3, 10, 10, C.blue);
    line(ctx, 5, 6, 11, 6, C.light);
    px(ctx, 10, 5, C.light);
    px(ctx, 10, 7, C.light);
    line(ctx, 5, 10, 11, 10, C.light);
    px(ctx, 6, 9, C.light);
    px(ctx, 6, 11, C.light);
  },
};

const cache = new Map();

/** dataURL іконки типу компонента (або заглушка, якщо малюнка немає). */
export function iconUrl(type) {
  if (cache.has(type)) return cache.get(type);
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  (DRAW[type] ?? DRAW.server)(ctx);
  const url = canvas.toDataURL();
  cache.set(type, url);
  return url;
}

export function iconImg(type, className = "icon") {
  const img = document.createElement("img");
  img.className = className;
  img.src = iconUrl(type);
  img.alt = "";
  img.width = 32;
  img.height = 32;
  img.draggable = false;
  return img;
}
