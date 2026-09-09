/**
 * Сцена: засклений балкон із чотирма горщиками.
 *
 * Логічний розмір 320×180, як у виноградника. Усе малюється процедурно зі
 * стану: за склом видно пору року й погоду, на підлозі — чи стоять горщики на
 * пінопласті, під стелею — чи ввімкнена фітолампа. Гравець має впізнавати
 * ситуацію з одного погляду, ще до того як подивиться на цифри.
 */

import { PALETTE, clear, dither, frame, line, px, rect } from "@edu/pixel-ui";
import { LOCAL, skyBehindGlass } from "./palette.js";
import { drawPepper } from "./pepper.js";
import { PLANT_IDS } from "../data/plants.data.js";
import { CULTIVARS } from "../data/plants.data.js";

export const SCENE = {
  width: 320,
  height: 180,
  ceilingY: 10,
  glassTop: 12,
  glassBottom: 118,
  parapetY: 118,
  floorY: 132,
  baseY: 158,
};

/** Центри горщиків. Експортується, щоб клік по канві мапився на рослину. */
export const POT_X = [46, 118, 192, 268];

export function drawScene(ctx, { state, selectedId, event }) {
  const month = state.month;
  const { balcony, equipment } = state;

  clear(ctx, LOCAL.wall, SCENE.width, SCENE.height);

  drawCeiling(ctx, equipment.lamp > 0);
  drawGlazing(ctx, { month, balcony, equipment, event });
  drawParapetAndFloor(ctx);

  // ── Рослини ──
  const bounds = {};
  PLANT_IDS.forEach((id, index) => {
    const plant = state.plants[id];
    bounds[id] = drawPepper(ctx, {
      plant,
      cultivar: CULTIVARS[id],
      cx: POT_X[index],
      baseY: SCENE.baseY,
      potStand: equipment.potStand > 0,
    });
  });

  // ── Обрана рослина ──
  if (selectedId && bounds[selectedId]) {
    const b = bounds[selectedId];
    const pad = 3;
    frame(
      ctx,
      b.left - pad,
      Math.max(SCENE.parapetY - 2, b.top - pad),
      b.right - b.left + pad * 2,
      b.bottom - Math.max(SCENE.parapetY - 2, b.top - pad) + pad,
      PALETTE.accent,
    );
  }

  drawOverlays(ctx, { balcony, equipment, event, month });
  return bounds;
}

function drawCeiling(ctx, lampOn) {
  rect(ctx, 0, 0, SCENE.width, SCENE.ceilingY, LOCAL.wallShade);
  rect(ctx, 0, SCENE.ceilingY, SCENE.width, 1, LOCAL.concreteDark);

  if (!lampOn) return;

  // Фітолампа й конус світла під нею — дизеринг замість альфа-каналу.
  for (const cx of [82, 232]) {
    rect(ctx, cx - 34, 2, 68, 4, LOCAL.lampBody);
    rect(ctx, cx - 32, 6, 64, 2, LOCAL.lampGrow);
    for (let i = 0; i < 5; i += 1) {
      const spread = 34 + i * 9;
      dither(ctx, cx - spread, 8 + i * 8, spread * 2, 8, LOCAL.lampGlow, 4 + i);
    }
  }
}

function drawGlazing(ctx, { month, balcony, equipment, event }) {
  const sky = skyBehindGlass(month);
  const h = SCENE.glassBottom - SCENE.glassTop;
  rect(ctx, 0, SCENE.glassTop, SCENE.width, h, sky);

  // Пейзаж за вікном: силует будинків, узимку зі снігом на дахах.
  const roofY = SCENE.glassBottom - 26;
  for (let x = 0; x < SCENE.width; x += 1) {
    const step = Math.floor(x / 26) % 3;
    const top = roofY + step * 5;
    rect(ctx, x, top, 1, SCENE.glassBottom - top, LOCAL.glassShade);
    if (balcony.tempAir < 6 && (x + step) % 2 === 0) px(ctx, x, top, PALETTE.snow);
  }

  // Погода за склом.
  if (event?.id === "cold_snap" || balcony.tempAir < 4) {
    for (let i = 0; i < 60; i += 1) {
      const x = (i * 37) % SCENE.width;
      const y = SCENE.glassTop + ((i * 23) % (h - 30));
      px(ctx, x, y, PALETTE.snow);
    }
  }
  if (event?.id === "long_clouds") {
    dither(ctx, 0, SCENE.glassTop, SCENE.width, 40, PALETTE.skyStorm, 2);
  }
  if (event?.id === "summer_heat" || event?.id === "spring_sun") {
    // Сонце крізь скло — те, що гріє й палить одночасно.
    for (let r = 0; r < 5; r += 1) {
      dither(ctx, 232 - r * 6, SCENE.glassTop + 4, 12 + r * 12, 6 + r * 4, "#f0d878", 3 + r);
    }
  }

  // Рами скління: чотири секції.
  rect(ctx, 0, SCENE.glassTop, SCENE.width, 2, LOCAL.glassFrame);
  rect(ctx, 0, SCENE.glassBottom - 2, SCENE.width, 2, LOCAL.glassFrame);
  for (const x of [0, 78, 156, 234, 316]) {
    rect(ctx, x, SCENE.glassTop, 4, h, LOCAL.glassFrame);
  }

  // Іній по склу — лише коли на балконі справді холодно.
  if (balcony.tempAir < 3) {
    for (const x of [4, 82, 160, 238]) {
      dither(ctx, x, SCENE.glassTop + 2, 74, 14, PALETTE.frost, 2);
      dither(ctx, x, SCENE.glassBottom - 16, 74, 14, PALETTE.frost, 3);
    }
  }

  // Утеплені щілини видно як ущільнювач по периметру стулок.
  if (equipment.insulation > 0) {
    for (const x of [0, 78, 156, 234]) {
      rect(ctx, x + 4, SCENE.glassTop + 2, 74, 1, LOCAL.foam);
    }
  }

  // Відчинена стулка при провітрюванні.
  if (equipment.fan > 0) {
    rect(ctx, 300, SCENE.glassTop + 40, 4, 22, LOCAL.metal);
    line(ctx, 296, SCENE.glassTop + 44, 306, SCENE.glassTop + 52, LOCAL.metal);
  }
}

function drawParapetAndFloor(ctx) {
  // Парапет.
  rect(ctx, 0, SCENE.parapetY, SCENE.width, SCENE.floorY - SCENE.parapetY, LOCAL.concrete);
  rect(ctx, 0, SCENE.parapetY, SCENE.width, 1, LOCAL.concreteLight);
  rect(ctx, 0, SCENE.floorY - 1, SCENE.width, 1, LOCAL.concreteDark);

  // Підлога — та сама бетонна плита, що всю зиму тягне тепло з горщиків.
  rect(ctx, 0, SCENE.floorY, SCENE.width, SCENE.height - SCENE.floorY, LOCAL.tile);
  for (let x = 0; x < SCENE.width; x += 16) {
    rect(ctx, x, SCENE.floorY, 1, SCENE.height - SCENE.floorY, LOCAL.tileSeam);
  }
  for (let y = SCENE.floorY + 12; y < SCENE.height; y += 14) {
    rect(ctx, 0, y, SCENE.width, 1, LOCAL.tileSeam);
  }
}

function drawOverlays(ctx, { balcony, equipment, event, month }) {
  // Сухе повітря — рідке дизерингове марево знизу вгору.
  if (balcony.humidity < 38) {
    dither(ctx, 0, SCENE.floorY - 10, SCENE.width, 10, LOCAL.concreteLight, 5);
  }

  // Зволожувач: хмарка пари в кутку.
  if (equipment.humidifier > 0) {
    rect(ctx, 8, SCENE.baseY - 10, 6, 10, LOCAL.metal);
    dither(ctx, 4, SCENE.baseY - 22, 14, 12, PALETTE.frost, 3);
  }

  // Обігрівач: корпус із теплим світінням.
  if (equipment.heater > 0) {
    rect(ctx, SCENE.width - 22, SCENE.baseY - 12, 14, 12, LOCAL.metal);
    rect(ctx, SCENE.width - 20, SCENE.baseY - 10, 10, 3, PALETTE.accent);
    dither(ctx, SCENE.width - 26, SCENE.baseY - 24, 22, 12, PALETTE.warn, 4);
  }

  // Термометр на стіні.
  if (equipment.thermometer > 0) {
    rect(ctx, 300, SCENE.parapetY - 22, 3, 16, LOCAL.glassFrame);
    px(ctx, 301, SCENE.parapetY - 8, balcony.tempAir < 5 ? PALETTE.skyWinter : PALETTE.bad);
  }

  // Спалах кліща — павутина в кутку скління, найпомітніший симптом.
  if (event?.id === "mite_outbreak" || balcony.mitePressure > 55) {
    for (let i = 0; i < 6; i += 1) {
      line(ctx, 300, SCENE.glassTop + 4, 300 - i * 4, SCENE.glassTop + 4 + i * 3, LOCAL.web);
    }
  }

  // Затінення на склі влітку.
  if ([6, 7, 8].includes(month) && balcony.tempAir < 28) {
    dither(ctx, 4, SCENE.glassTop + 2, SCENE.width - 8, 20, LOCAL.glassFrame, 3);
  }
}

/** Який горщик під точкою кліку. Повертає id рослини або null. */
export function plantAt(x, y, bounds) {
  if (y < SCENE.parapetY - 20) return null;
  for (const [id, box] of Object.entries(bounds)) {
    if (x >= box.left - 4 && x <= box.right + 4) return id;
  }
  return null;
}
