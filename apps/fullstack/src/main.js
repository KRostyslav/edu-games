/**
 * Точка входу: сховище прогресу, навігація й верхня панель.
 *
 * Роутера-бібліотеки немає: режим і його параметри живуть у location.hash
 * (#/level/rt-microtasks, #/boss/boss-runtime, #/codex/event-loop). З відносним
 * `base` збірки це працює однаково з кореня й з підтеки /games/fullstack/.
 *
 * Кожен екран — mount(host, ctx, params) → { unmount }. `unmount` обов'язковий:
 * без нього воркер пісочниці чи Postgres жили б після переходу на інший екран.
 */

import "@edu/pixel-ui/pixel.css";
import "./style.css";

import { el, modal } from "@edu/pixel-ui";
import { dueCount, newCardsLeft, dayNumber } from "@edu/study-kit";
import { createProgressStore } from "./progress/store.js";
import { LEVEL_ORDER, BOSS_LIST, CARDS, CARD_IDS } from "./data/content.js";
import { CODE_TASKS } from "./data/code.js";
import { SQL_TASKS } from "./data/sql.js";
import { totalStars, maxStars } from "./game/unlock.js";
import { currentGrade } from "./game/career.js";
import { xpOf, heroLevel } from "./game/xp.js";
import { mountMap } from "./ui/map.js";
import { mountLevel } from "./ui/level.js";
import { mountBoss } from "./ui/boss.js";
import { mountHero } from "./ui/hero.js";
import { mountStandup } from "./ui/standup.js";
import { mountCodex, openCodexModal } from "./ui/codex.js";
import { paragraphs, button } from "./ui/widgets.js";

const SCREENS = {
  map: mountMap,
  level: mountLevel,
  boss: mountBoss,
  hero: mountHero,
  standup: mountStandup,
  codex: mountCodex,
};
/** Рівні й боси — частина мапи: у верхній панелі підсвічується саме вона. */
const TAB_OF = { level: "map", boss: "map" };

const store = createProgressStore({
  ids: {
    levels: LEVEL_ORDER,
    bosses: BOSS_LIST.map((boss) => boss.id),
    cards: CARD_IDS,
    tasks: [...Object.keys(CODE_TASKS), ...Object.keys(SQL_TASKS)],
    bossPhases: Object.fromEntries(BOSS_LIST.map((boss) => [boss.id, boss.phases.length])),
  },
});

const screenHost = document.getElementById("screen");
const tabs = [...document.querySelectorAll(".tabs__tab")];
const gradeLabel = document.getElementById("grade-label");
const xpLabel = document.getElementById("xp-label");
const starsLabel = document.getElementById("stars-total");
const dueBadge = document.getElementById("due-badge");

let current = null;

const ctx = {
  store,
  go,
  setParams,
  openCodex: (id) => openCodexModal(id, ctx),
  confirm: confirmDialog,
};

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path = "", query = ""] = raw.split("?");
  const [mode, id] = path.split("/");
  const params = Object.fromEntries(new URLSearchParams(query));
  if (id) params.id = decodeURIComponent(id);
  return { mode: SCREENS[mode] ? mode : "map", params };
}

function buildHash(mode, params = {}) {
  const { id, ...rest } = params;
  const query = new URLSearchParams(Object.entries(rest).filter(([, value]) => value != null && value !== "")).toString();
  return `#/${mode}${id ? `/${encodeURIComponent(id)}` : ""}${query ? `?${query}` : ""}`;
}

function go(mode, params = {}) {
  const hash = buildHash(mode, params);
  if (location.hash === hash) render();
  else location.hash = hash;
}

/** Оновлює адресу без перемонтування — екран сам знає, що змінилося. */
function setParams(params) {
  if (!current) return;
  current.params = params;
  history.replaceState(null, "", buildHash(current.mode, params));
}

/**
 * Модальні вікна живуть у body, а не в хості екрана, тож при переході
 * (кнопка «назад», вкладка у верхній панелі) їх треба закрити явно —
 * через їхній власний хрестик, щоб зняти й слухача клавіатури.
 */
function closeModals() {
  for (const overlay of document.querySelectorAll(".modal__overlay")) {
    const close = overlay.querySelector(".modal__close");
    if (close) close.click();
    else overlay.remove();
  }
}

function render() {
  const { mode, params } = parseHash();
  closeModals();
  current?.screen?.unmount?.();
  screenHost.replaceChildren();
  screenHost.dataset.mode = mode;
  const active = TAB_OF[mode] ?? mode;
  for (const tab of tabs) {
    if (tab.dataset.mode === active) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  current = { mode, params, screen: null };
  current.screen = SCREENS[mode](screenHost, ctx, params);
  window.scrollTo(0, 0);
}

function updateStats(state) {
  const xp = xpOf(state, { cardIds: CARD_IDS });
  gradeLabel.textContent = `🎖 ${currentGrade(state).title}`;
  xpLabel.textContent = `Рів. ${heroLevel(xp).level} · ${xp} XP`;
  starsLabel.textContent = `★ ${totalStars(state)} / ${maxStars()}`;
  const today = dayNumber();
  const due = dueCount(state.quiz.boxes, CARDS, today, { newLimit: newCardsLeft(state.quiz.boxes, CARDS, today) });
  dueBadge.hidden = due === 0;
  dueBadge.textContent = String(due);
  dueBadge.title = `Карток на сьогодні: ${due}`;
}

function confirmDialog({ title, text, yes = "Так", no = "Скасувати", onYes, danger = false }) {
  const dialog = modal({ title });
  dialog.body.append(...paragraphs(text));
  dialog.foot.append(
    button(yes, {
      variant: danger ? "danger" : "primary",
      onClick: () => {
        dialog.hide();
        onYes?.();
      },
    }),
    button(no, { onClick: () => dialog.hide() }),
  );
  dialog.show();
}

/** Перший запуск: хто ви в цій історії й як тут грати. */
function showIntro() {
  const dialog = modal({ title: "По той бік API", wide: true });
  dialog.body.append(
    ...paragraphs(
      "Ви — сильний React-розробник. Стан, рендеринг, хуки, DevTools — усе своє. Але кожна фіча впирається в `fetch()`, за яким починається чужа територія: сервер, база, мережа, інциденти о третій ночі.\n\n" +
        "Ця гра — дорога від Frontend до Staff Engineer через усе, що лежить по той бік API. Кожен акт — нова територія: рантайм Node.js, мережа й HTTP, справжній Postgres прямо в браузері, а далі архітектура, кеш, черги, безпека й експлуатація.\n\n" +
        "Рівні бувають різні: передбачити вивід event loop, написати код, який перевірять приховані тести, оптимізувати SQL-запит до справжнього плану, розслідувати інцидент за логами й метриками, прогнати дві транзакції в лабораторії ізоляції.\n\n" +
        "Наприкінці акту — бос: продакшн-інцидент у кілька фаз. Ваш ресурс — бюджет помилок, як error budget у SLO. Перемога над босом — це підвищення: Junior, Middle, Senior, Staff. А після будь-якого фіналу — чесний blameless-постмортем.\n\n" +
        "Щодня — «Стендап»: кілька карток інтервального повторення, щоб вивчене лишалося з вами через місяць, а не лише до кінця вечора.",
    ),
  );
  dialog.foot.append(
    button("Почати з прологу →", {
      variant: "primary",
      onClick: () => {
        dialog.hide();
        go("level", { id: LEVEL_ORDER[0] });
      },
    }),
    button("Спершу подивлюся мапу", { onClick: () => dialog.hide() }),
  );
  store.update((state) => (state.seenIntro = true), { immediate: true });
  dialog.show();
}

for (const tab of tabs) tab.addEventListener("click", () => go(tab.dataset.mode));
window.addEventListener("hashchange", render);
store.subscribe(updateStats);
updateStats(store.state);
render();
if (!store.state.seenIntro) showIntro();

export { el };
