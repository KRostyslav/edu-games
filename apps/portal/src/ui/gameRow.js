import { createPixelCanvas, el } from "@edu/pixel-ui";
import { hrefFor } from "../links.js";
import { getThumb, drawFallback } from "../thumbs/index.js";

/** Логічний розмір мініатюри: 120×45 ≈ пропорція капсули крамниці ігор. */
export const THUMB = { width: 120, height: 45 };

const STATUS = {
  released: { label: "Грати", tone: "play" },
  beta: { label: "Beta", tone: "beta" },
  upcoming: { label: "Незабаром", tone: "soon" },
};

const DATE = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", year: "numeric" });

export function createGameRow(game) {
  const status = STATUS[game.status];
  const href = hrefFor(game);

  const item = el("li", "rows__item");
  // Гра, у яку ще не можна грати, навмисно не посилання: клік у нікуди дратує
  // сильніше, ніж відсутність кліку.
  const root = el(href ? "a" : "div", "row");
  root.dataset.status = game.status;
  root.style.setProperty("--row-accent", game.accent);
  if (href) {
    root.href = href;
    root.setAttribute("aria-label", `${game.title} — ${status.label}`);
  }

  root.append(thumbOf(game), bodyOf(game), badgeOf(status));
  item.append(root);
  return item;
}

function thumbOf(game) {
  const host = el("div", "row__thumb");
  // Ширину задає CSS: на вузькому екрані контейнер стискається вдвічі, і
  // createPixelCanvas сам переходить на масштаб ×1 — піксель лишається квадратним
  // без жодної медіа-логіки в JS.
  const view = createPixelCanvas({ ...THUMB, parent: host, maxScale: 2 });
  view.canvas.setAttribute("aria-hidden", "true");

  const draw = getThumb(game.id);
  if (draw) {
    draw(view.ctx, THUMB);
  } else {
    drawFallback(view.ctx, THUMB, game);
    // Емодзі кладемо DOM-шаром: текст на канві в цьому проєкті не малюється.
    host.append(el("span", "row__emoji", game.emoji));
  }
  return host;
}

function bodyOf(game) {
  const box = el("div", "row__body");
  box.append(el("h2", "row__title", game.title));
  box.append(el("p", "row__sub", game.subtitle));

  const tags = el("ul", "row__tags");
  for (const tag of game.tags) tags.append(el("li", "row__tag", tag));
  box.append(tags);

  box.append(el("p", "row__date", `Реліз: ${formatDate(game.released)}`));
  return box;
}

function badgeOf({ label, tone }) {
  const badge = el("span", "row__badge", label);
  badge.dataset.tone = tone;
  return badge;
}

function formatDate(iso) {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : DATE.format(date);
}
