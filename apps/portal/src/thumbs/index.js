/**
 * Мініатюри карток. Малюються процедурно тими самими примітивами, що й сцени
 * ігор, — тому в каталозі немає жодного графічного асета, а нова гра має
 * прийнятний вигляд ще до того, як для неї намалюють власну мініатюру.
 *
 * Живуть у порталі, а не в `@edu/catalog`: реєстр лишається чистими даними
 * без залежностей, щоб його міг читати Node-скрипт складання сайту.
 */
import { PALETTE, clear, rect, dither, frame } from "@edu/pixel-ui";
import { drawVineyard } from "./vineyard.js";
import { drawPeppers } from "./peppers.js";
import { drawFounder } from "./founder.js";
import { drawSysdesign } from "./sysdesign.js";

const THUMBS = {
  vineyard: drawVineyard,
  peppers: drawPeppers,
  founder: drawFounder,
  sysdesign: drawSysdesign,
};

/** Малювалка гри або `null`, якщо власної ще немає. */
export function getThumb(id) {
  return THUMBS[id] ?? null;
}

/** Універсальна заглушка в акцентному кольорі гри; емодзі кладе поверх DOM. */
export function drawFallback(ctx, { width, height }, game) {
  const accent = game.accent ?? PALETTE.accent;

  // Дизеринг по темному, а не навпаки: так акцентний колір гри лишається
  // помітним, і порожня картка виглядає навмисною, а не забутою.
  clear(ctx, PALETTE.shadow, width, height);
  dither(ctx, 0, 0, width, height, accent, 2);
  rect(ctx, 0, height - 6, width, 6, accent);
  rect(ctx, 0, height - 7, width, 1, PALETTE.ink);
  frame(ctx, 0, 0, width, height, PALETTE.ink);
}
