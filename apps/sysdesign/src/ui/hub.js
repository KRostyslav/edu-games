/**
 * Хаб кампанії: п'ять глав, рівні з зірками й швидкі входи в інші режими.
 *
 * Головна кнопка — «Продовжити»: людина, що повертається через тиждень, не
 * повинна згадувати, де зупинилася. Решта режимів — поруч, бо підготовка до
 * співбесіди — це не лише кампанія, а й картки щодня та оцінки на час.
 */

import "./hub.css";
import { el, createPixelCanvas } from "@edu/pixel-ui";
import { CHAPTERS, LEVEL_LIST, levelsOfChapter } from "../data/levels.js";
import { LEVEL_ORDER } from "../data/order.js";
import { QUIZ } from "../data/quiz.js";
import { CODEX_IDS } from "../data/codex/index.js";
import { INTERVIEWS } from "../data/interviews.js";
import { isLevelOpen, levelStars, totalStars, nextLevelId } from "../progress/unlock.js";
import { dueCount, newCardsLeft } from "../progress/leitner.js";
import { dayNumber } from "../progress/store.js";
import { drawHubArt, HUB_ART } from "../render/hubArt.js";
import { button, starsEl, chip } from "./widgets.js";

export function mountHub(host, ctx) {
  const { store } = ctx;
  const state = store.state;
  const page = el("div", "page hub");

  const head = el("div", "page__head");
  const titles = el("div");
  titles.append(
    el("h1", "page__title", "Архітектор систем"),
    el(
      "p",
      "page__lead",
      "Збирайте архітектуру під вимоги, запускайте годину трафіку з відмовами й дивіться, де саме вона ламається. Кожен рівень — задача зі співбесіди в мініатюрі.",
    ),
  );
  head.append(titles);
  page.append(head);

  const art = el("div", "hub__art");
  page.append(art);
  const view = createPixelCanvas({ width: HUB_ART.width, height: HUB_ART.height, parent: art, maxScale: 4 });
  drawHubArt(view.ctx, { stars: totalStars(state), total: LEVEL_ORDER.length * 3 });

  const layout = el("div", "hub__layout");
  const chapters = el("div", "hub__chapters");
  const side = el("aside", "hub__side");
  layout.append(chapters, side);
  page.append(layout);

  // ── продовжити ──
  const nextId = nextLevelId(state);
  const next = LEVEL_LIST.find((level) => level.id === nextId);
  const continuePanel = el("div", "panel hub__continue");
  const allDone = LEVEL_ORDER.every((id) => levelStars(state, id) === 3);
  continuePanel.append(
    el("span", "hub__kicker", allDone ? "Кампанію пройдено на всі зірки" : "Продовжити"),
    el("strong", "hub__next", `${LEVEL_ORDER.indexOf(nextId) + 1}. ${next.title}`),
    el("span", "muted", next.teaser),
    button(allDone ? "Переграти" : "До рівня →", { variant: "primary", onClick: () => ctx.go("level", { id: nextId }) }),
  );
  chapters.append(continuePanel);

  // ── глави ──
  for (const chapter of CHAPTERS) {
    const levels = levelsOfChapter(chapter.id);
    const earned = levels.reduce((sum, level) => sum + levelStars(state, level.id), 0);
    const panel = el("section", "panel hub__chapter");
    const chapterHead = el("header", "hub__chapter-head");
    chapterHead.append(
      el("h2", "hub__chapter-title", `Глава ${chapter.id}. ${chapter.title}`),
      el("span", "hub__chapter-stars", `★ ${earned} / ${levels.length * 3}`),
    );
    panel.append(chapterHead, el("p", "muted hub__chapter-sub", chapter.subtitle));

    const grid = el("div", "hub__levels");
    for (const level of levels) {
      const open = isLevelOpen(state, level.id);
      const stars = levelStars(state, level.id);
      const tile = el("button", "hub__level");
      tile.type = "button";
      tile.dataset.state = !open ? "locked" : stars === 3 ? "done" : stars > 0 ? "partial" : "open";
      tile.disabled = !open;
      tile.append(
        el("span", "hub__level-no", String(LEVEL_ORDER.indexOf(level.id) + 1)),
        el("span", "hub__level-title", level.title),
        el("span", "hub__level-teaser", open ? level.teaser : "Відкриється після попереднього рівня"),
        open ? starsEl(stars) : el("span", "hub__lock", "🔒"),
      );
      tile.setAttribute("aria-label", `${level.title}. ${open ? `${stars} з 3 зірок` : "закрито"}`);
      tile.addEventListener("click", () => ctx.go("level", { id: level.id }));
      grid.append(tile);
    }
    panel.append(grid);
    chapters.append(panel);
  }

  // ── інші режими ──
  const today = dayNumber();
  const due = dueCount(state.quiz.boxes, QUIZ, today, { newLimit: newCardsLeft(state.quiz.boxes, QUIZ, today) });
  const read = Object.keys(state.codex.read).length;
  const sideCard = (title, text, action, extra) => {
    const card = el("div", "panel hub__mode");
    card.append(el("h3", "hub__mode-title", title), el("p", "muted", text));
    if (extra) card.append(extra);
    card.append(action);
    side.append(card);
  };
  sideCard(
    "Картки на сьогодні",
    "Коротке повторення за системою Leitner: те, що знаєте, повертається рідше.",
    button(due ? `Повторити ${due}` : "Тренувати теми", { variant: due ? "primary" : "", onClick: () => ctx.go("cards") }),
    due ? chip(`${due} до повторення`, "warn") : chip("На сьогодні все", "good"),
  );
  sideCard("Тренажер оцінок", "QPS, сховище, трафік і кількість серверів — на час і без калькулятора.", button("Рахувати →", { onClick: () => ctx.go("estimate") }));
  sideCard(
    "Mock interview",
    `${INTERVIEWS.length} задач у форматі справжньої 45-хвилинної співбесіди: вимоги, оцінки, API, схема, deep dive.`,
    button("Почати співбесіду →", { onClick: () => ctx.go("mock") }),
  );
  sideCard("Довідник", `Прочитано ${read} з ${CODEX_IDS.length} статей: від DNS до consistent hashing.`, button("Відкрити →", { onClick: () => ctx.go("codex") }));

  const reset = button("Скинути весь прогрес", {
    variant: "ghost",
    onClick: () =>
      ctx.confirm({
        title: "Скинути прогрес?",
        text: "Зірки, чернетки схем, коробки карток і історія співбесід зникнуть. Це не можна скасувати.",
        yes: "Скинути",
        onYes: () => {
          store.reset();
          ctx.go("campaign");
        },
      }),
  });
  reset.classList.add("hub__reset");
  side.append(reset);

  host.append(page);
  return {
    unmount() {
      view.destroy();
    },
  };
}
