import "@edu/pixel-ui/pixel.css";
import "./style.css";

import { createPixelCanvas, el, modal } from "@edu/pixel-ui";
import { createStorage } from "@edu/sim-core";

import { createInitialState } from "./game/model.js";
import { createSeasonEngine } from "./game/season.js";
import { calculateHarvest } from "./game/harvest.js";
import { startNextYear } from "./game/carryover.js";
import { SCENE, drawScene, plantAt } from "./render/scene.js";
import { createMonthPanel } from "./ui/monthPanel.js";
import { openDebrief } from "./ui/debrief.js";
import { openAutopsy } from "./ui/autopsy.js";
import { openYearReport } from "./ui/yearReport.js";
import { openCodex } from "./ui/codex.js";
import { CULTIVARS, PLANT_IDS } from "./data/plants.data.js";
import { MONTH_NAMES } from "./data/calendar.js";

const sceneHost = document.getElementById("scene");
const panelHost = document.getElementById("panel");
const seasonLabel = document.getElementById("season-name");
const weatherLabel = document.getElementById("weather");

const storage = createStorage("peppers", 1);
const view = createPixelCanvas({ width: SCENE.width, height: SCENE.height, parent: sceneHost, maxScale: 4 });

// Підписи горщиків живуть у DOM під канвою: текст на канві не малюється
// (правило pixel-ui), а клікати по рослинах усе одно треба.
const legend = el("div", "scene__legend");
sceneHost.append(legend);

let season = null;
let panel = null;
let lastEvent = null;
let bounds = {};

boot();

function boot() {
  document.getElementById("codex-btn").addEventListener("click", () => openCodex());
  document.getElementById("restart-btn").addEventListener("click", restart);

  view.canvas.addEventListener("click", (event) => {
    const rect = view.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * SCENE.width;
    const y = ((event.clientY - rect.top) / rect.height) * SCENE.height;
    const id = plantAt(x, y, bounds);
    if (id) panel.selectTab(id);
  });

  const saved = storage.load();
  if (saved) {
    start(saved);
    return;
  }
  openIntro();
}

function openIntro() {
  const box = modal({ title: "Гострий балкон", wide: true });

  box.body.append(
    el(
      "p",
      "intro__lead",
      "Жовтень. Сезон скінчився, урожай зібрано. На заскленому неопалюваному балконі стоять чотири горщики — і зараз вирішується, яким буде наступний рік.",
    ),
  );

  box.body.append(
    el(
      "p",
      "intro__text",
      "Перець — багаторічна рослина, і це головне, чого не знає більшість. Кущ, який пережив зиму, навесні стартує з готового коріння й запасу в стеблі, цвіте на півтора-два місяці раніше й дає в рази більший урожай. Український клімат змушує вирощувати перець як однорічник — але засклений балкон цього не змушує.",
    ),
  );

  const grid = el("div", "intro__plants");
  for (const id of PLANT_IDS) {
    const c = CULTIVARS[id];
    const card = el("article", "intro__plant");
    card.append(
      el("h3", "intro__plant-name", c.name),
      el("span", "intro__plant-species", c.species === "annuum" ? "Capsicum annuum" : "Capsicum chinense"),
      el("p", "intro__plant-note", c.note),
    );
    grid.append(card);
  }
  box.body.append(grid);

  box.body.append(
    el(
      "p",
      "intro__text",
      "Умови на балконі спільні для всіх — температуру не можна ввімкнути для одного горщика. А от полив, обрізка, підживлення й пересадка робляться окремо для кожної рослини. Годин догляду щомісяця обмежено, тож доведеться обирати, ким зайнятися.",
    ),
  );

  box.body.append(
    el(
      "p",
      "intro__warning",
      "Рослина може загинути. Якщо це станеться, гра покаже розтин: не лише причину, а й місяць, у якому доля насправді вирішилася.",
    ),
  );

  const begin = el("button", "btn btn--primary", "Почати з жовтня →");
  begin.type = "button";
  begin.addEventListener("click", () => {
    box.hide();
    start(createInitialState());
  });
  box.foot.append(begin);

  box.show();
}

function start(state) {
  season = createSeasonEngine({ initialState: state, seed: 20260905 + state.year });

  panelHost.replaceChildren();
  panel = createMonthPanel({
    root: panelHost,
    onAdvance: advanceMonth,
    onSelectPlant: () => redrawScene(),
    onAutopsy: (plantId) => openAutopsy({ state: season.engine.state, plantId, onCodex: openCodex }),
  });

  lastEvent = null;
  refresh();
}

function advanceMonth(selections) {
  const turn = season.playMonth(selections);
  lastEvent = turn.events[0] ?? null;

  save();
  refresh();

  openDebrief({
    turn,
    onCodex: (ref) => openCodex(ref),
    onAutopsy: (plantId) => openAutopsy({ state: season.engine.state, plantId, onCodex: openCodex }),
    onClose: () => {
      if (turn.isSeasonEnd) finishSeason();
    },
  });
}

function finishSeason() {
  const state = season.engine.state;
  const harvest = calculateHarvest(state);
  const carried = startNextYear(state, harvest);

  openYearReport({
    state,
    harvest,
    notes: carried.notes,
    onAutopsy: (plantId) => openAutopsy({ state, plantId, onCodex: openCodex }),
    onNextYear: () => {
      start(carried.state);
      panel.resetDeltas();
      save();
    },
  });
}

function refresh() {
  redrawScene();
  panel.render(season.engine.state);
}

/**
 * Перемальовує лише сцену й топбар.
 *
 * Окремо від `refresh` навмисно: перемикання вкладки рослини має підсвітити
 * інший горщик, але не чіпати панель. Повний `render` скидає вже обрані на
 * цей місяць дії, і гравець, який перейшов з халапеньо на хабанеро, мовчки
 * втрачав усе, що встиг обрати.
 */
function redrawScene() {
  const state = season.engine.state;
  const selectedId = panel?.activePlant ?? null;

  bounds = drawScene(view.ctx, { state, selectedId, event: lastEvent });
  renderLegend(state, selectedId);

  seasonLabel.textContent = `${MONTH_NAMES[state.month]}, рік ${state.year}`;
  weatherLabel.textContent = lastEvent ? lastEvent.label : "Спокійний місяць";

  view.fit();
}

function renderLegend(state, selectedId) {
  legend.replaceChildren();
  for (const id of PLANT_IDS) {
    const plant = state.plants[id];
    const button = el("button", "scene__label", CULTIVARS[id].name);
    button.type = "button";
    button.dataset.active = String(id === selectedId);
    button.dataset.dead = String(plant.alive <= 0);
    button.addEventListener("click", () => panel.selectTab(id));
    legend.append(button);
  }
}

function save() {
  storage.save(season.engine.state);
}

function restart() {
  const box = modal({ title: "Почати заново" });
  box.body.append(
    el(
      "p",
      "intro__text",
      "Поточна гра буде втрачена разом з усіма роками й перезимованими кущами. Продовжити?",
    ),
  );

  const yes = el("button", "btn btn--primary", "Так, почати заново");
  yes.type = "button";
  yes.addEventListener("click", () => {
    storage.clear?.();
    box.hide();
    start(createInitialState());
    panel.resetDeltas();
  });

  const no = el("button", "btn btn--ghost", "Скасувати");
  no.type = "button";
  no.addEventListener("click", () => box.hide());

  box.foot.append(yes, no);
  box.show();
}
