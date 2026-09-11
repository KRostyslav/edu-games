/**
 * Точка входу: сховище прогресу, навігація між режимами й верхня панель.
 *
 * Роутера-бібліотеки немає: режим і його параметри живуть у location.hash
 * (#/level/l2-2, #/codex/cdn, #/cards?tab=topics). Це дає кнопку «назад»
 * на телефоні й посилання з довідника на рівень і навпаки, а з відносним
 * `base` збірки працює однаково з кореня й із підтеки /games/sysdesign/.
 *
 * Кожен екран — функція mount(host, ctx, params) → { unmount }. `unmount`
 * обов'язковий: без нього таймер співбесіди чи програвання прогону жили б
 * після переходу на інший екран.
 */

import "@edu/pixel-ui/pixel.css";
import "./style.css";

import { el, modal } from "@edu/pixel-ui";
import { createProgressStore, dayNumber } from "./progress/store.js";
import { totalStars } from "./progress/unlock.js";
import { dueCount, newCardsLeft } from "./progress/leitner.js";
import { LEVEL_ORDER } from "./data/order.js";
import { QUIZ } from "./data/quiz.js";
import { ESTIMATES } from "./data/estimation.js";
import { CODEX_IDS } from "./data/codex/index.js";
import { mountHub } from "./ui/hub.js";
import { mountLevel } from "./ui/level.js";
import { mountCodex, openCodexModal } from "./ui/codex.js";
import { mountQuiz } from "./ui/quiz.js";
import { mountEstimate } from "./ui/estimate.js";
import { mountMock } from "./ui/mock.js";

const SCREENS = {
  campaign: mountHub,
  level: mountLevel,
  codex: mountCodex,
  cards: mountQuiz,
  estimate: mountEstimate,
  mock: mountMock,
};
/** Рівень — частина кампанії: у верхній панелі підсвічується саме вона. */
const TAB_OF = { level: "campaign" };

const store = createProgressStore({
  ids: { levels: LEVEL_ORDER, cards: QUIZ.map((card) => card.id), problems: ESTIMATES.map((problem) => problem.id) },
});

const screenHost = document.getElementById("screen");
const tabs = [...document.querySelectorAll(".tabs__tab")];
const starsLabel = document.getElementById("stars-total");
const readLabel = document.getElementById("read-total");
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
  return { mode: SCREENS[mode] ? mode : "campaign", params };
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

function render() {
  const { mode, params } = parseHash();
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
  starsLabel.textContent = `★ ${totalStars(state)} / ${LEVEL_ORDER.length * 3}`;
  readLabel.textContent = `📖 ${Object.keys(state.codex.read).length} / ${CODEX_IDS.length}`;
  // Той самий денний ліміт нових карток, що й на екрані карток, — інакше
  // бейдж показував би 8, а вкладка «Сьогодні» — порожній день.
  const today = dayNumber();
  const due = dueCount(state.quiz.boxes, QUIZ, today, { newLimit: newCardsLeft(state.quiz.boxes, QUIZ, today) });
  dueBadge.hidden = due === 0;
  dueBadge.textContent = String(due);
  dueBadge.title = `Карток на сьогодні: ${due}`;
}

function confirmDialog({ title, text, yes = "Так", no = "Скасувати", onYes }) {
  const dialog = modal({ title });
  dialog.body.append(el("p", "text", text));
  const ok = el("button", "btn btn--primary", yes);
  ok.type = "button";
  ok.addEventListener("click", () => {
    dialog.hide();
    onYes?.();
  });
  const cancel = el("button", "btn", no);
  cancel.type = "button";
  cancel.addEventListener("click", () => dialog.hide());
  dialog.foot.append(ok, cancel);
  dialog.show();
}

for (const tab of tabs) tab.addEventListener("click", () => go(tab.dataset.mode));
window.addEventListener("hashchange", render);
store.subscribe(updateStats);
updateStats(store.state);
render();
