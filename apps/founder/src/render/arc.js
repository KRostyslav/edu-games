/**
 * Дуга партії: MRR за місяцями й ваші сили під ним, на одній осі часу.
 *
 * Це вся гра однією картинкою. MRR, що перетинає лінію зарплати й тримається,
 * поки під ним сповзає смуга енергії, каже більше, ніж будь-яка таблиця —
 * а обидві серії вже є в історії, рахувати нічого не треба.
 *
 * Підписи навмисно не малюються: у примітивах @edu/pixel-ui немає тексту, і це
 * на краще — цифри в DOM лишаються виділюваними й доступними.
 */

import { clear, rect, line, dither } from "@edu/pixel-ui";
import { ROOM } from "./palette.js";

export const ARC = { width: 296, height: 120 };

const CHART = { x: 4, y: 4, width: 288, height: 78 };
const ENERGY = { x: 4, y: 92, width: 288, height: 22 };

export function drawArc(ctx, headline) {
  const months = headline.arc ?? [];
  clear(ctx, ROOM.screen, ARC.width, ARC.height);

  const columns = 36;
  const step = CHART.width / columns;
  const peak = Math.max(
    1,
    headline.goal.target * 1.25,
    ...months.map((entry) => entry.mrr),
  );
  const toY = (value) => CHART.y + CHART.height - Math.round((value / peak) * CHART.height);

  // Роздільники років — щоб «перший рік» був видно, а не вгадувався.
  for (const year of [12, 24]) {
    const x = Math.round(CHART.x + year * step);
    for (let y = CHART.y; y < CHART.y + CHART.height; y += 3) rect(ctx, x, y, 1, 2, ROOM.grid);
  }

  // Дві лінії, що визначають гру: ваші витрати й ціль.
  drawDashed(ctx, toY(headline.goal.burn), ROOM.chartDim);
  drawDashed(ctx, toY(headline.goal.target), ROOM.lamp);

  for (const entry of months) {
    const x = Math.round(CHART.x + (entry.monthIndex - 1) * step);
    const width = Math.max(1, Math.floor(step) - 1);
    const top = toY(entry.mrr);
    const height = CHART.y + CHART.height - top;
    if (height <= 0) continue;
    const above = entry.mrr >= headline.goal.target;
    rect(ctx, x, top, width, height, above ? ROOM.chart : ROOM.chartDim);
  }

  rect(ctx, CHART.x, CHART.y + CHART.height, CHART.width, 1, ROOM.grid);

  // Смуга сил під графіком: та сама вісь часу, інший вимір.
  rect(ctx, ENERGY.x, ENERGY.y, ENERGY.width, ENERGY.height, "#1a2230");
  dither(ctx, ENERGY.x, ENERGY.y, ENERGY.width, ENERGY.height, ROOM.grid, 3);

  let previous = null;
  for (const entry of months) {
    const x = Math.round(ENERGY.x + (entry.monthIndex - 1) * step + step / 2);
    const y = ENERGY.y + ENERGY.height - Math.round((entry.energy / 100) * ENERGY.height);
    const color = entry.energy < 25 ? ROOM.customerDim : entry.energy < 45 ? ROOM.lamp : ROOM.customer;
    if (previous) line(ctx, previous.x, previous.y, x, y, color);
    rect(ctx, x, y - 1, 1, 2, color);
    previous = { x, y };
  }
}

function drawDashed(ctx, y, color) {
  if (y < CHART.y || y > CHART.y + CHART.height) return;
  for (let x = CHART.x; x < CHART.x + CHART.width; x += 4) rect(ctx, x, y, 2, 1, color);
}
