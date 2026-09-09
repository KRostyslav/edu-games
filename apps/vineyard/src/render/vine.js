import { PALETTE, rect, line, disc, px } from "@edu/pixel-ui";

/**
 * Процедурний кущ винограду.
 *
 * Малюється зі стану, а не з готових картинок: перевантажений кущ виглядає
 * інакше за збалансований, хворий — інакше за здоровий. Сцена має бути
 * читабельною без цифр, інакше гравець дивитиметься тільки на смужки.
 */

const TRUNK_X = 112;
const GROUND_Y = 138;
// Розмах рукавів і висота штамба задані так, щоб кущ займав більшу частину
// кадру: дрібний кущ у порожньому небі не читається як головний об'єкт сцени.
const ARM = 54;
const TRUNK_TOP = GROUND_Y - 62;

export function drawVine(ctx, state, month) {
  const covered = state.flags.covered === 1;

  if (covered && isWinter(month)) {
    drawCovered(ctx, month);
    return;
  }

  drawTrunk(ctx, state);

  if (month === 11 || month === 12 || month <= 3) {
    drawBareVine(ctx, state, month);
    return;
  }

  drawFoliage(ctx, state, month);

  if (month >= 6) drawClusters(ctx, state, month);
}

function isWinter(month) {
  return month === 11 || month === 12 || month === 1 || month === 2;
}

/** Штамб. Товщина відображає силу куща — виснажений кущ буквально тонший. */
function drawTrunk(ctx, state) {
  // Товщина штамба відображає запас поживних речовин: виснажений кущ
  // буквально тонший за здоровий.
  const width = 5 + Math.round((state.vine.reserves / 100) * 4);
  const top = TRUNK_TOP;

  rect(ctx, TRUNK_X - Math.floor(width / 2), top, width, GROUND_Y - top, PALETTE.wood);
  rect(ctx, TRUNK_X - Math.floor(width / 2), top, 2, GROUND_Y - top, PALETTE.woodDark);

  // Рукави вздовж нижнього дроту шпалери
  for (const dy of [0, 1]) {
    line(ctx, TRUNK_X, top + 6 + dy, TRUNK_X - ARM, top + 3 + dy, PALETTE.woodDark);
    line(ctx, TRUNK_X, top + 6 + dy, TRUNK_X + ARM, top + 3 + dy, PALETTE.woodDark);
  }
}

/** Гола лоза взимку. Колір показує визрівання: коричнева — визріла, зелена — ні. */
function drawBareVine(ctx, state, month) {
  const ripe = state.vine.woodRipeness > 55;
  const color = ripe ? PALETTE.vineRipe : PALETTE.vineYoung;
  const top = TRUNK_TOP + 4;
  const shoots = 5 + Math.round((state.vine.load / 100) * 8);

  for (let i = 0; i < shoots; i += 1) {
    const x = TRUNK_X - ARM + Math.round((i / (shoots - 1)) * ARM * 2);
    const alive = (i / shoots) * 100 < state.vine.budsAlive;
    const height = 24 + ((i * 7) % 14);
    line(ctx, x, top, x, top - height, alive ? color : PALETTE.leafDead);
    // Вічка на лозі — видно, які живі
    for (let b = 4; b < height; b += 5) {
      px(ctx, x + 1, top - b, alive ? PALETTE.woodDark : PALETTE.leafDead);
    }
  }

  if (month <= 2) drawSnow(ctx);
}

/** Крона. Густина листя = стан canopy, колір = сезон і хвороби. */
function drawFoliage(ctx, state, month) {
  const density = Math.max(0.15, state.vine.canopy / 100);
  const sick = state.disease.mildew + state.disease.oidium > 90;
  const base = leafColor(month, sick);
  const top = TRUNK_TOP + 4;
  const shoots = 5 + Math.round((state.vine.load / 100) * 8);

  for (let i = 0; i < shoots; i += 1) {
    const x = TRUNK_X - ARM + Math.round((i / (shoots - 1)) * ARM * 2);
    const alive = (i / shoots) * 100 < state.vine.budsAlive;
    if (!alive) continue;

    const height = Math.round((30 + ((i * 7) % 16)) * (0.5 + density * 0.7));
    line(ctx, x, top, x, top - height, PALETTE.vineYoung);

    for (let l = 3; l < height; l += 4) {
      const side = l % 8 === 3 ? -1 : 1;
      const size = 2 + (density > 0.6 ? 1 : 0);
      disc(ctx, x + side * 3, top - l, size, base);
      // Плями хвороби на листі — сигнал, який видно раніше за падіння врожаю
      if (sick && (i + l) % 3 === 0) px(ctx, x + side * 3, top - l, PALETTE.leafSick);
    }
  }
}

function leafColor(month, sick) {
  if (sick) return PALETTE.leafSick;
  if (month <= 5) return PALETTE.leafSpring;
  if (month <= 8) return PALETTE.leafSummer;
  return PALETTE.leafAutumn;
}

/** Грона. Кількість — від навантаження, розмір — від наливу, колір — від цукру. */
function drawClusters(ctx, state, month) {
  const count = Math.max(0, Math.round((state.vine.load / 100) * 8 * (state.vine.budsAlive / 100)));
  const size = 2 + Math.round((state.crop.berrySize / 100) * 4);
  const ripe = month >= 8 && state.crop.sugar > 45;
  const color = month <= 7 ? PALETTE.berryUnripe : ripe ? PALETTE.berryRipe : PALETTE.berry;
  const top = TRUNK_TOP + 4;

  // Грона підвішені під кордоном, у вільній зоні між рукавами й землею.
  // Серед листя вони губилися б, а так одразу видно і їх кількість, і стан.
  for (let i = 0; i < count; i += 1) {
    const x = TRUNK_X - ARM + 6 + Math.round((i / Math.max(1, count - 1)) * (ARM * 2 - 12));
    const y = top + 9 + ((i * 5) % 7);
    drawCluster(ctx, x, y, size, color, state.crop.sanitary < 55);
  }
}

/** Одне гроно — трикутник із ягід. */
function drawCluster(ctx, x, y, size, color, damaged) {
  for (let row = 0; row < size + 2; row += 1) {
    const inRow = Math.max(1, size - row + 1);
    for (let i = 0; i < inRow; i += 1) {
      const bx = x - Math.floor(inRow / 2) + i;
      const by = y + row;
      px(ctx, bx, by, damaged && (bx + by) % 4 === 0 ? PALETTE.leafDead : color);
    }
  }
  px(ctx, x, y - 1, PALETTE.berryHighlight);
}

/** Укритий кущ: земляний вал уздовж ряду. */
function drawCovered(ctx, month) {
  // Пригнута лоза під земляним валом — характерний силует укритого виноградника.
  const w = ARM * 2 + 16;
  const x0 = TRUNK_X - ARM - 8;
  rect(ctx, x0, GROUND_Y - 16, w, 16, PALETTE.cover);
  rect(ctx, x0, GROUND_Y - 16, w, 2, PALETTE.soilLight);
  for (let i = 0; i < 26; i += 1) {
    px(ctx, x0 + 2 + i * 5, GROUND_Y - 13 + ((i * 3) % 10), PALETTE.mulch);
  }
  if (month <= 2 || month === 12) drawSnow(ctx);
}

function drawSnow(ctx) {
  rect(ctx, 0, GROUND_Y - 5, 320, 5, PALETTE.snow);
  rect(ctx, 0, GROUND_Y - 5, 320, 1, PALETTE.snowShade);
  for (let i = 0; i < 40; i += 1) {
    px(ctx, (i * 29) % 320, GROUND_Y - 6 - ((i * 7) % 3), PALETTE.snow);
  }
}

export const SCENE_LAYOUT = { TRUNK_X, GROUND_Y };
