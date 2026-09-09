import { PALETTE, clear, rect, line, px, dither, disc, skyForMonth } from "@edu/pixel-ui";
import { drawVine, SCENE_LAYOUT } from "./vine.js";

const W = 320;
const H = 180;
const { GROUND_Y } = SCENE_LAYOUT;

/** Малює всю сцену виноградника для поточного стану, місяця й погоди. */
export function drawScene(ctx, { state, month, weather }) {
  drawSky(ctx, month, weather);
  drawHills(ctx, month);
  drawGround(ctx, state, month);
  drawTrellis(ctx);
  drawNeighbourVines(ctx, state, month);
  drawVine(ctx, state, month);
  drawWeatherOverlay(ctx, weather, month);
}

function drawSky(ctx, month, weather) {
  const stormy = weather && ["long_rain", "hail"].includes(weather.id);
  clear(ctx, stormy ? PALETTE.skyStorm : skyForMonth(month), W, H);

  if (!stormy && month >= 5 && month <= 8) {
    disc(ctx, 268, 32, 9, "#f5d76e");
    disc(ctx, 268, 32, 6, "#fdf0a8");
  }

  if (stormy) {
    for (let i = 0; i < 5; i += 1) {
      const cx = 30 + i * 62;
      disc(ctx, cx, 26 + ((i * 5) % 9), 9, "#48566b");
      disc(ctx, cx + 10, 28 + ((i * 3) % 6), 7, "#48566b");
    }
  }
}

function drawHills(ctx, month) {
  const far = month >= 12 || month <= 2 ? "#b8c6d2" : month >= 4 && month <= 8 ? "#6f9a5a" : "#94a06a";
  for (let x = 0; x < W; x += 1) {
    const h = 18 + Math.round(8 * Math.sin(x / 46) + 5 * Math.sin(x / 17));
    const top = GROUND_Y - 30 - h;
    // Пагорби доводимо до самої землі — інакше між ними й ґрунтом лишається
    // смуга неба, і горизонт розпадається на дві незв'язані частини.
    rect(ctx, x, top, 1, GROUND_Y - top, far);
  }
}

function drawGround(ctx, state, month) {
  const wet = state.soil.moisture > 60;
  const base = wet ? PALETTE.soilWet : PALETTE.soil;
  rect(ctx, 0, GROUND_Y, W, H - GROUND_Y, base);
  rect(ctx, 0, GROUND_Y, W, 2, PALETTE.soilLight);

  // Структура ґрунту — видно як «грудкуватість». Розпушений ґрунт читається інакше.
  const structure = state.soil.structure;
  for (let i = 0; i < 90; i += 1) {
    const x = (i * 37) % W;
    const y = GROUND_Y + 4 + ((i * 13) % (H - GROUND_Y - 5));
    px(ctx, x, y, structure > 55 ? PALETTE.soilLight : PALETTE.soilDark);
  }

  if (wet) dither(ctx, 0, GROUND_Y + 2, W, 6, PALETTE.soilWet, 3);

  // Трава в міжрядді тільки у вегетацію
  if (month >= 4 && month <= 9) {
    for (let x = 0; x < W; x += 3) {
      const h = 2 + ((x * 7) % 3);
      line(ctx, x, GROUND_Y, x, GROUND_Y - h, PALETTE.leafSummer);
    }
  }
}

function drawTrellis(ctx) {
  // Стовпи
  rect(ctx, 12, GROUND_Y - 78, 4, 78, PALETTE.woodDark);
  rect(ctx, 302, GROUND_Y - 78, 4, 78, PALETTE.woodDark);
  // Яруси дроту: нижній — для плодових лоз, верхні — для зелених пагонів
  for (const y of [GROUND_Y - 56, GROUND_Y - 70, GROUND_Y - 40]) {
    for (let x = 12; x < 306; x += 2) px(ctx, x, y, "#7d848c");
  }
}

/** Сусідні кущі в ряду — дають глибину й показують, що це виноградник, а не один кущ. */
function drawNeighbourVines(ctx, state, month) {
  for (const x of [222, 268]) {
    const top = GROUND_Y - 44;
    rect(ctx, x, top, 3, 44, PALETTE.woodDark);
    if (month >= 4 && month <= 10 && !state.flags.covered) {
      for (let i = 0; i < 7; i += 1) {
        disc(ctx, x + 1 + ((i % 2) * 5 - 2), top - 3 - i * 4, 2, leafTint(month));
      }
    } else if (state.flags.covered) {
      rect(ctx, x - 14, GROUND_Y - 11, 32, 11, PALETTE.cover);
    }
  }
}

function leafTint(month) {
  if (month <= 5) return PALETTE.leafSpring;
  if (month <= 8) return PALETTE.leafSummer;
  return PALETTE.leafAutumn;
}

function drawWeatherOverlay(ctx, weather, month) {
  if (!weather) return;

  if (weather.id === "long_rain") {
    for (let i = 0; i < 70; i += 1) {
      const x = (i * 53) % W;
      const y = (i * 31) % GROUND_Y;
      line(ctx, x, y, x - 1, y + 4, "#a8c4dc");
    }
  }

  if (weather.id === "hail") {
    for (let i = 0; i < 45; i += 1) {
      px(ctx, (i * 47) % W, (i * 23) % GROUND_Y, PALETTE.snow);
    }
  }

  if (weather.id === "hard_frost" || weather.id === "spring_frost" || weather.id === "early_frost") {
    dither(ctx, 0, 0, W, GROUND_Y, PALETTE.frost, 5);
  }

  if (weather.id === "heat_wave" || weather.id === "drought") {
    // Марево над самою землею. Широка смуга перекривала б пів кадру
    // й читалася б як штрихування, а не як спека.
    dither(ctx, 0, GROUND_Y - 10, W, 10, "#e8c78a", 5);
  }

  if (weather.id === "thaw" && (month <= 2 || month === 12)) {
    dither(ctx, 0, GROUND_Y - 20, W, 24, "#c8d8e4", 3);
  }

  if (weather.id === "wasps") {
    for (let i = 0; i < 12; i += 1) {
      px(ctx, 60 + ((i * 17) % 90), 70 + ((i * 11) % 30), "#d8b020");
    }
  }
}
