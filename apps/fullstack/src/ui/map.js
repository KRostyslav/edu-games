/**
 * Мапа кампанії: острови-акти, рівні з зірками, боси й шлях до Staff.
 *
 * Головна кнопка — «Продовжити»: людина, що повертається через тиждень, не
 * мусить згадувати, де зупинилася. Акти «скоро» показані чесно — з темами,
 * які там будуть: видно всю дорогу, а не лише найближчий поворот.
 */

import "./map.css";
import { createPixelCanvas } from "@edu/pixel-ui";
import { dueCount, newCardsLeft, dayNumber } from "@edu/study-kit";
import { findGame } from "@edu/catalog";
import { ACTS } from "../data/acts.js";
import { LEVELS, BOSSES, CARDS, levelsOfAct, bossOfAct } from "../data/content.js";
import { CODEX_IDS } from "../data/codex.js";
import { isActOpen, isLevelOpen, isBossOpen, levelStars, actStats, actComplete, nextStep } from "../game/unlock.js";
import { currentGrade, nextGradeRequirement } from "../game/career.js";
import { drawWorldMap, WORLD } from "../render/worldMap.js";
import { el, button, starsEl, chip, kindChip, KIND_ICONS, notice } from "./widgets.js";

function actState(progress, act) {
  if (act.soon) return "soon";
  if (!isActOpen(progress, act.id)) return "locked";
  return actComplete(progress, act.id) ? "done" : "open";
}

/** Посилання на сусідню гру монорепи: у дев-режимі — на її порт, у збірці — на підтеку. */
function siblingHref(id) {
  const game = findGame(id);
  if (!game || game.status === "upcoming") return null;
  if (import.meta.env?.DEV) return `${location.protocol}//${location.hostname}:${game.devPort}/`;
  return `../${game.id}/`;
}

export function mountMap(host, ctx) {
  const { store } = ctx;
  const state = store.state;
  const page = el("div", "page map");

  const head = el("div", "page__head");
  const titles = el("div");
  titles.append(
    el("h1", "page__title", "Мапа"),
    el("p", "page__lead", "Від React-розробника до Staff Engineer: кожен острів — нова територія по той бік API."),
  );
  head.append(titles);
  page.append(head);

  // ── мапа світу ──
  const states = ACTS.map((act) => ({
    id: act.id,
    color: act.color,
    state: actState(state, act),
    boss: Boolean(act.boss),
    bossWon: act.boss ? Boolean(state.bosses[act.boss]?.won) : false,
  }));
  const currentIndex = Math.max(0, states.findIndex((item) => item.state === "open"));
  const art = el("div", "map__art");
  page.append(art);
  const view = createPixelCanvas({ width: WORLD.width, height: WORLD.height, parent: art, maxScale: 4 });
  let tick = 0;
  const paint = () => drawWorldMap(view.ctx, { acts: states, current: currentIndex, frameTick: tick });
  paint();
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const timer = reduced ? null : setInterval(() => ((tick += 1), paint()), 600);

  const layout = el("div", "map__layout");
  const column = el("div", "map__acts");
  const side = el("aside", "map__side");
  layout.append(column, side);
  page.append(layout);

  // ── продовжити ──
  const step = nextStep(state);
  const cont = el("div", "panel map__continue");
  if (step?.type === "boss") {
    const boss = BOSSES[step.id];
    cont.append(
      el("span", "map__kicker", "Бос чекає"),
      el("strong", "map__next", `☠ ${boss.title}`),
      el("span", "muted", boss.subtitle),
      button("До бою →", { variant: "danger", onClick: () => ctx.go("boss", { id: boss.id }) }),
    );
  } else if (step) {
    const level = LEVELS[step.id];
    cont.append(
      el("span", "map__kicker", step.polish ? "Усе пройдено — добийте зірки" : "Продовжити"),
      el("strong", "map__next", `${KIND_ICONS[level.kind]} ${level.title}`),
      el("span", "muted", level.teaser),
      button("До рівня →", { variant: "primary", onClick: () => ctx.go("level", { id: level.id }) }),
    );
  } else {
    cont.append(el("span", "map__kicker", "Доступний контент пройдено на всі зірки"), el("span", "muted", "Нові акти вже в дорозі."));
  }
  column.append(cont);

  // ── акти ──
  for (const act of ACTS) {
    const status = actState(state, act);
    const panel = el("section", "panel map__act");
    panel.dataset.state = status;
    panel.style.setProperty("--act-color", act.color);
    const actHead = el("header", "map__act-head");
    const title = el("h2", "map__act-title", `${act.no}. ${act.title}`);
    actHead.append(title);
    if (!act.soon) {
      const stats = actStats(state, act.id);
      actHead.append(el("span", "map__act-stars", `★ ${stats.stars} / ${stats.max}`));
    } else actHead.append(chip("скоро"));
    panel.append(actHead);

    if (act.soon) {
      panel.append(el("p", "muted map__act-sub", "Що тут буде:"));
      const list = el("ul", "map__topics");
      for (const topic of act.topics) list.append(el("li", "", topic));
      panel.append(list);
      if (act.related) {
        const href = siblingHref(act.related);
        const game = findGame(act.related);
        if (href && game) {
          const link = el("a", "map__related", `Поки що System Design тренуйте в грі «${game.title}» →`);
          link.href = href;
          panel.append(link);
        }
      }
      column.append(panel);
      continue;
    }

    panel.append(el("p", "muted map__act-sub", act.subtitle));
    if (status === "locked") panel.append(notice("Відкриється після перемоги над босом попереднього акту.", "warn"));
    else if (act.lead) panel.append(el("p", "map__lead", act.lead));

    const grid = el("div", "map__levels");
    levelsOfAct(act.id).forEach((level, index) => {
      const open = isLevelOpen(state, level.id);
      const stars = levelStars(state, level.id);
      const tile = el("button", "map__level");
      tile.type = "button";
      tile.dataset.state = !open ? "locked" : stars === 3 ? "done" : stars > 0 ? "partial" : "open";
      tile.disabled = !open;
      const top = el("span", "map__level-top");
      top.append(el("span", "map__level-no", String(index + 1)), kindChip(level.kind));
      tile.append(
        top,
        el("span", "map__level-title", level.title),
        el("span", "map__level-teaser", open ? level.teaser : "Відкриється після попереднього рівня"),
        open ? starsEl(stars) : el("span", "map__lock", "🔒"),
      );
      tile.setAttribute("aria-label", `${level.title}. ${open ? `${stars} з 3 зірок` : "закрито"}`);
      tile.addEventListener("click", () => ctx.go("level", { id: level.id }));
      grid.append(tile);
    });

    const boss = bossOfAct(act.id);
    if (boss) {
      const open = isBossOpen(state, boss.id);
      const won = Boolean(state.bosses[boss.id]?.won);
      const tile = el("button", "map__level map__boss");
      tile.type = "button";
      tile.dataset.state = won ? "done" : open ? "open" : "locked";
      tile.disabled = !open && !won;
      tile.append(
        el("span", "map__level-top", won ? "☠ Переможено" : "☠ Бос"),
        el("span", "map__level-title", boss.title),
        el("span", "map__level-teaser", open || won ? boss.subtitle : "Відкриється, коли всі рівні акту матимуть хоча б ★"),
        won ? chip(boss.reward.title, "good") : chip(`Бюджет помилок: ${boss.budget}`, open ? "boss" : ""),
      );
      tile.addEventListener("click", () => ctx.go("boss", { id: boss.id }));
      grid.append(tile);
    }
    panel.append(grid);
    column.append(panel);
  }

  // ── бічна колонка ──
  const grade = currentGrade(state);
  const requirement = nextGradeRequirement(state);
  const gradeCard = el("div", "panel map__mode");
  gradeCard.append(el("h3", "map__mode-title", "Кар'єра"), el("p", "", `Зараз: ${grade.title}`));
  if (requirement) gradeCard.append(el("p", "muted", `Далі — ${requirement.grade.title}. ${requirement.text}.`));
  gradeCard.append(button("Аркуш героя →", { onClick: () => ctx.go("hero") }));
  side.append(gradeCard);

  const today = dayNumber();
  const due = dueCount(state.quiz.boxes, CARDS, today, { newLimit: newCardsLeft(state.quiz.boxes, CARDS, today) });
  const standup = el("div", "panel map__mode");
  standup.append(
    el("h3", "map__mode-title", "Стендап"),
    el("p", "muted", "П'ять хвилин інтервального повторення. Те, що знаєте, повертається рідше."),
    due ? chip(`${due} карток на сьогодні`, "warn") : chip("На сьогодні все", "good"),
    button(due ? `Почати (${due})` : "Тренувати теми", { variant: due ? "primary" : "", onClick: () => ctx.go("standup") }),
  );
  side.append(standup);

  const read = Object.keys(state.codex.read).length;
  const codex = el("div", "panel map__mode");
  codex.append(
    el("h3", "map__mode-title", "Довідник"),
    el("p", "muted", `Прочитано ${read} з ${CODEX_IDS.length} статей: від event loop до MVCC.`),
    button("Відкрити →", { onClick: () => ctx.go("codex") }),
  );
  side.append(codex);

  const reset = button("Скинути весь прогрес", {
    variant: "ghost",
    onClick: () =>
      ctx.confirm({
        title: "Скинути прогрес?",
        text: "Зірки, перемоги над босами, чернетки коду й коробки карток зникнуть. Це не можна скасувати.",
        yes: "Скинути",
        danger: true,
        onYes: () => {
          store.reset();
          ctx.go("map");
        },
      }),
  });
  reset.classList.add("map__reset");
  side.append(reset);

  host.append(page);
  return {
    unmount() {
      if (timer) clearInterval(timer);
      view.destroy();
    },
  };
}
