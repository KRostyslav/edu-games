import "@edu/pixel-ui/pixel.css";
import "./style.css";

import { createPixelCanvas, el, modal } from "@edu/pixel-ui";
import { createStorage } from "@edu/sim-core";

import { SCENARIOS, SCENARIO_LIST } from "./data/scenarios.js";
import { createInitialState, scenarioOf } from "./game/model.js";
import { createMonthEngine } from "./game/month.js";
import { drawScene, SCENE } from "./render/scene.js";
import { createMonthPanel, MONTH_NAMES } from "./ui/monthPanel.js";
import { openDebrief } from "./ui/debrief.js";
import { openYearReport } from "./ui/yearReport.js";
import { openAutopsy } from "./ui/autopsy.js";
import { openCodex } from "./ui/codex.js";

const storage = createStorage("founder", 1);

const app = document.getElementById("app");
const sceneHost = document.getElementById("scene");
const panelHost = document.getElementById("panel");
const monthLabel = document.getElementById("month-name");
const mrrLabel = document.getElementById("mrr");

const view = createPixelCanvas({ width: SCENE.width, height: SCENE.height, parent: sceneHost, maxScale: 4 });

let season = null;
let panel = null;
let lastEvent = null;

boot();

function boot() {
  document.getElementById("codex-btn").addEventListener("click", () => openCodex());
  document.getElementById("restart-btn").addEventListener("click", restart);

  const saved = storage.load();
  if (saved?.state && SCENARIOS[saved.state.scenarioId]) {
    start(saved.state, saved.seed ?? 1);
    return;
  }
  openStartScreen();
}

/** Екран вибору сценарію. Він визначає години, гроші й спосіб програти. */
function openStartScreen() {
  const dialog = modal({ title: "Свій продукт: 36 місяців", wide: true });

  dialog.body.append(
    el(
      "p",
      "intro",
      "Ви робите SaaS-продукт самі, без інвестицій. Три роки, тридцять шість ходів. Щомісяця у вас обмежена кількість годин, і ви обираєте, на що їх витратити: говорити з людьми, писати код, писати статті, розбирати звернення чи просто відпочити.",
    ),
  );
  dialog.body.append(
    el(
      "p",
      "intro",
      "Мета — щоб продукт після всіх комісій, податків та інфраструктури приносив більше за вашу зарплату, і щоб так було шість місяців поспіль. Не разовий пік, а стабільний рівень.",
    ),
  );
  dialog.body.append(
    el(
      "p",
      "intro intro--warn",
      "Спочатку ви не бачите майже нічого, крім грошей і кількості клієнтів. Воронка, відтік і вартість залучення відкриються, коли ви поставите аналітику, — і саме тому її варто поставити раніше, ніж здається потрібним.",
    ),
  );
  dialog.body.append(el("h3", "intro__heading", "З чого починаєте"));

  const list = el("div", "scenarios");
  for (const scenario of SCENARIO_LIST) {
    const card = el("button", "scenario");
    card.type = "button";
    card.append(
      el("h4", "scenario__name", scenario.name),
      el("span", "scenario__subtitle", scenario.subtitle),
      el("p", "scenario__text", scenario.description),
      el("span", "scenario__dies", `Найчастіше гине ${scenario.dies}`),
    );
    card.addEventListener("click", () => {
      dialog.hide();
      const seed = Math.floor(Math.random() * 100000);
      start(createInitialState(scenario, seed), seed);
    });
    list.append(card);
  }
  dialog.body.append(list);

  const codex = el("button", "btn", "Спершу почитати довідник");
  codex.type = "button";
  codex.addEventListener("click", () => openCodex());
  dialog.foot.append(codex);

  dialog.show();
}

function start(state, seed) {
  season = createMonthEngine({ initialState: state, seed });

  panelHost.replaceChildren();
  panel = createMonthPanel({ root: panelHost, onAdvance: advanceMonth });

  lastEvent = null;
  app.dataset.ready = "true";
  refresh();

  if (state.verdict?.over) {
    openAutopsy({ state: season.engine.state, onRestart: restart });
  }
}

function advanceMonth(actions) {
  const turn = season.playMonth(actions);
  lastEvent = turn.event;

  save();
  refresh();

  openDebrief({
    turn,
    onClose: () => {
      if (turn.isOver) {
        openAutopsy({ state: season.engine.state, onRestart: restart });
        return;
      }
      if (turn.isYearEnd) {
        openYearReport({ state: season.engine.state, onContinue: () => panel.resetDeltas() });
      }
    },
  });
}

function refresh() {
  const state = season.engine.state;
  drawScene(view.ctx, { state, event: lastEvent });

  monthLabel.textContent = `${MONTH_NAMES[state.month - 1]}, рік ${state.year}`;
  mrrLabel.textContent = `MRR $${Math.round(state.biz.mrr).toLocaleString("uk-UA")} · $${Math.round(
    state.biz.cash,
  ).toLocaleString("uk-UA")} на рахунку`;

  panel.render(state);
  view.fit();
}

function save() {
  storage.save({ state: season.engine.state, seed: season.engine.rng.seed });
}

function restart() {
  const dialog = modal({ title: "Почати заново?" });
  dialog.body.append(el("p", "intro", "Увесь прогрес буде втрачено. Сценарій можна буде обрати інший."));

  const yes = el("button", "btn btn--primary", "Так, почати заново");
  yes.type = "button";
  yes.addEventListener("click", () => {
    storage.clear?.();
    dialog.hide();
    panelHost.replaceChildren();
    app.dataset.ready = "false";
    openStartScreen();
  });

  const no = el("button", "btn", "Скасувати");
  no.type = "button";
  no.addEventListener("click", () => dialog.hide());

  dialog.foot.append(yes, no);
  dialog.show();
}

export { scenarioOf };
