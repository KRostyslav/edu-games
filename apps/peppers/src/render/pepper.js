/**
 * Малювання одного куща перцю.
 *
 * Жодного спрайт-файлу: рослина будується процедурно зі свого стану, тому
 * сцена не ілюструє гру, а показує її. Прив'яле листя, павутиння між гілками
 * чи витягнуті бліді пагони — це не декорація, а ті самі числа, що й у
 * смужках показників.
 */

import { PALETTE, disc, dither, line, px, rect } from "@edu/pixel-ui";
import { LOCAL, POD_COLORS, leafColor } from "./palette.js";

/** Розміри горщика за його об'ємом у літрах. */
export function potSize(volumeL) {
  const width = Math.round(12 + Math.min(volumeL, 14) * 1.3);
  const height = Math.round(9 + Math.min(volumeL, 14) * 0.8);
  return { width, height };
}

/**
 * Малює горщик і рослину. `baseY` — рівень підлоги, `cx` — центр горщика.
 * Повертає межі, щоб сцена могла обвести обрану рослину рамкою.
 */
export function drawPepper(ctx, { plant, cultivar, cx, baseY, potStand }) {
  const { width: pw, height: ph } = potSize(plant.pot.volume);
  const potTop = baseY - ph;
  const left = cx - Math.floor(pw / 2);

  // ── Підставка з пінопласту: агроприйом має бути видно на сцені ──
  if (potStand) {
    rect(ctx, left - 2, baseY, pw + 4, 3, LOCAL.foam);
    rect(ctx, left - 2, baseY + 3, pw + 4, 1, PALETTE.paperDark);
  }

  // ── Горщик ──
  // Стінки звужуються донизу — це читається як горщик, а не як коробка.
  for (let i = 0; i < ph; i += 1) {
    const inset = Math.round((i / ph) * 2);
    rect(ctx, left + inset, potTop + i, pw - inset * 2, 1, i < 2 ? LOCAL.potRim : LOCAL.potPlastic);
  }
  rect(ctx, left + 1, potTop + ph - 2, pw - 2, 1, LOCAL.potPlasticDark);

  // ── Субстрат: вологий темніший, пересохлий сірішає ──
  const soilColor =
    plant.pot.moisture > 62 ? PALETTE.soilWet : plant.pot.moisture < 22 ? PALETTE.soilLight : PALETTE.soil;
  rect(ctx, left + 2, potTop, pw - 4, 2, soilColor);
  if (plant.pot.moisture > 62) {
    dither(ctx, left + 2, potTop, pw - 4, 2, PALETTE.soilDark, 2);
  }
  // Білий наліт солей на поверхні — специфічна для горщика проблема.
  if (plant.pot.salinity > 55) {
    dither(ctx, left + 3, potTop, pw - 6, 1, LOCAL.foam, 2);
  }

  if (plant.alive <= 0) {
    drawDeadStem(ctx, cx, potTop, cultivar);
    return { left, right: left + pw, top: potTop - 14, bottom: baseY + (potStand ? 4 : 0) };
  }

  // ── Стебло ──
  // Висота йде від сили росту й сорту: Ají Limo справді тягнеться вище за
  // компактний NuMex Easter, і це видно без підписів.
  const heightFactor = cultivar.height === "високий" ? 1.35 : cultivar.height === "компактний" ? 0.62 : 1;
  const stemH = Math.max(6, Math.round((10 + (plant.vigor / 100) * 30) * heightFactor));
  const stemTop = potTop - stemH;

  // Етіоляція: у теплі без світла пагони витягуються й бліднуть.
  const etiolated = plant.dormancy < 40 && plant.vigor > 40 && plant.leaf < 25;
  const stemColor = etiolated
    ? LOCAL.stemEtiolated
    : plant.woody > 55
      ? LOCAL.stemWoody
      : LOCAL.stemGreen;

  const thickness = plant.reserves > 60 ? 3 : plant.reserves > 30 ? 2 : 1;
  rect(ctx, cx - Math.floor(thickness / 2), stemTop, thickness, stemH, stemColor);

  // ── Гілки ──
  const branchCount = Math.max(2, Math.round((plant.buds / 100) * 6) + 2);
  const branches = [];
  for (let i = 0; i < branchCount; i += 1) {
    const t = (i + 1) / (branchCount + 1);
    const y = Math.round(stemTop + stemH * t * 0.85);
    const dir = i % 2 === 0 ? -1 : 1;
    const len = Math.round((5 + (plant.vigor / 100) * 8) * heightFactor * (1 - t * 0.35));
    const endX = cx + dir * len;
    const endY = y - Math.round(len * 0.55);
    line(ctx, cx, y, endX, endY, stemColor);
    branches.push({ x: endX, y: endY, dir });
  }

  // ── Листя ──
  const foliage = leafColor(plant);
  const leafiness = plant.leaf / 100;
  for (const branch of branches) {
    const leaves = Math.round(leafiness * 4);
    for (let i = 0; i < leaves; i += 1) {
      const lx = branch.x - branch.dir * i * 2;
      const ly = branch.y + i - 1;
      disc(ctx, lx, ly, leafiness > 0.55 ? 2 : 1, foliage);
    }
  }
  if (leafiness > 0.3) {
    disc(ctx, cx, stemTop + 1, Math.round(1 + leafiness * 2), foliage);
  }

  // ── Ознаки хвороб і шкідників ──
  if (plant.mites > 40) {
    // Павутиння між гілками — те, що видно неозброєним оком уже пізно.
    for (const branch of branches) {
      dither(ctx, Math.min(cx, branch.x), branch.y - 2, Math.abs(branch.x - cx), 3, LOCAL.web, 3);
    }
  }
  if (plant.mites > 25) {
    for (const branch of branches) {
      px(ctx, branch.x, branch.y, LOCAL.miteSpeck);
      px(ctx, branch.x - branch.dir, branch.y + 1, LOCAL.miteSpeck);
    }
  }
  if (plant.pests > 40) {
    px(ctx, cx, stemTop, PALETTE.ink);
    px(ctx, cx + 1, stemTop + 1, PALETTE.ink);
  }
  if (plant.damage > 30) {
    for (const branch of branches.slice(0, 2)) {
      px(ctx, branch.x + branch.dir, branch.y - 1, LOCAL.leafBurn);
    }
  }

  // ── Квітки ──
  const flowerCount = Math.round((plant.flowers / 100) * 6);
  for (let i = 0; i < flowerCount && i < branches.length; i += 1) {
    const b = branches[i];
    px(ctx, b.x, b.y - 2, LOCAL.flower);
    px(ctx, b.x + 1, b.y - 2, LOCAL.flower);
    px(ctx, b.x, b.y - 3, LOCAL.flowerCore);
  }

  // ── Плоди ──
  drawPods(ctx, { plant, cultivar, branches });

  return { left, right: left + pw, top: stemTop - 4, bottom: baseY + (potStand ? 4 : 0) };
}

function drawPods(ctx, { plant, cultivar, branches }) {
  if (plant.fruitSet < 5) return;

  const colors = POD_COLORS[cultivar.id];
  const count = Math.min(branches.length, Math.round((plant.fruitSet / 100) * 7));
  const ripeShare = plant.ripeness / 100;
  const size = Math.max(1, Math.round((plant.fruitFill / 100) * 3));

  for (let i = 0; i < count; i += 1) {
    const b = branches[i];
    const isRipe = i / Math.max(1, count) < ripeShare;
    const color = isRipe ? colors.ripe[i % colors.ripe.length] : colors.unripe;
    const x = b.x + b.dir;
    const y = b.y + 2;

    if (cultivar.height === "високий") {
      // Ají Limo — довгі вузькі стручки, що звисають.
      rect(ctx, x, y, 1, size + 2, color);
    } else if (cultivar.id === "habanero") {
      // Хабанеро — короткий пузатий «ліхтарик».
      disc(ctx, x, y + 1, size, color);
    } else if (cultivar.id === "numexEaster") {
      // Дрібні прямостоячі плоди, спрямовані вгору.
      rect(ctx, x, y - size, 1, size + 1, color);
    } else {
      rect(ctx, x, y, 2, size + 1, color);
    }
  }
}

function drawDeadStem(ctx, cx, potTop, cultivar) {
  const h = cultivar.height === "компактний" ? 8 : 12;
  const top = potTop - h;
  rect(ctx, cx, top, 1, h, LOCAL.leafDead);
  line(ctx, cx, top + 3, cx - 4, top, LOCAL.leafDead);
  line(ctx, cx, top + 6, cx + 4, top + 3, LOCAL.leafDead);
}
