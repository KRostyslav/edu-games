import "@edu/pixel-ui/pixel.css";
import "./style.css";

import { createPixelCanvas, el, modal } from "@edu/pixel-ui";
import { createStorage } from "@edu/sim-core";

import { REGIONS, REGION_LIST } from "./data/regions.js";
import { createInitialState } from "./game/model.js";
import { createSeasonEngine } from "./game/season.js";
import { calculateHarvest } from "./game/harvest.js";
import { startNextYear } from "./game/carryover.js";
import { drawScene } from "./render/scene.js";
import { createMonthPanel } from "./ui/monthPanel.js";
import { openDebrief } from "./ui/debrief.js";
import { openYearReport } from "./ui/yearReport.js";
import { openCodex } from "./ui/codex.js";

const storage = createStorage("vineyard", 1);

const app = document.getElementById("app");
const sceneHost = document.getElementById("scene");
const panelHost = document.getElementById("panel");
const weatherLabel = document.getElementById("weather");
const codexButton = document.getElementById("codex-btn");
const restartButton = document.getElementById("restart-btn");

const view = createPixelCanvas({ width: 320, height: 180, parent: sceneHost, maxScale: 4 });

let region = null;
let season = null;
let panel = null;
let lastWeather = null;

codexButton.addEventListener("click", () => openCodex());
restartButton.addEventListener("click", () => {
  if (confirm("Почати заново? Увесь прогрес буде втрачено.")) {
    storage.clear();
    location.reload();
  }
});

boot();

function boot() {
  const saved = storage.load();
  if (saved?.state && REGIONS[saved.state.regionId]) {
    start(REGIONS[saved.state.regionId], saved.state, saved.seed ?? 1);
    return;
  }
  openStartScreen();
}

/** Екран вибору регіону. Регіон визначає календар, ризики й перелік дій. */
function openStartScreen() {
  const dialog = modal({ title: "Виноградник: рік за роком", wide: true });

  dialog.body.append(
    el(
      "p",
      "intro",
      "Гра починається одразу після збору врожаю — у жовтні. Саме осінні роботи закладають урожай наступного року, тому сезон виноградаря починається там, де для стороннього ока він закінчується.",
    ),
    el(
      "p",
      "intro",
      "Щомісяця у вас обмежена кількість трудоднів. Ви обираєте, що встигнути, і бачите, до чого це призвело — з числами й поясненням. Кущ живе далі: помилка листопада може проявитися в березні, а перевантаження цього року — наступної осені.",
    ),
    el("h3", "intro__heading", "Оберіть регіон"),
  );

  const list = el("div", "regions");
  for (const item of REGION_LIST) {
    const card = el("button", "region");
    card.type = "button";
    card.append(
      el("h4", "region__name", item.name),
      el("span", "region__subtitle", item.subtitle),
      el("p", "region__text", item.description),
    );
    card.addEventListener("click", () => {
      dialog.hide();
      start(item, createInitialState(item), Math.floor(Math.random() * 100000));
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

function start(selectedRegion, state, seed) {
  region = selectedRegion;
  season = createSeasonEngine({ region, initialState: state, seed });

  document.getElementById("region-name").textContent = region.name;

  panel = createMonthPanel({
    root: panelHost,
    onAdvance: (actions) => advanceMonth(actions),
  });

  app.dataset.ready = "true";
  refresh();
}

function advanceMonth(actions) {
  const result = season.playMonth(actions);
  lastWeather = result.weather;

  save();
  refresh();

  openDebrief({
    result,
    onContinue: () => {
      if (result.isSeasonEnd) finishSeason();
    },
  });
}

/** Вересень завершує сезон: рахуємо врожай і переносимо наслідки в новий рік. */
function finishSeason() {
  const state = season.engine.state;
  const harvest = calculateHarvest(state);
  const { state: nextState, notes } = startNextYear(state, harvest);

  openYearReport({
    state,
    harvest,
    notes,
    onContinue: () => {
      season = createSeasonEngine({
        region,
        initialState: nextState,
        seed: Math.floor(Math.random() * 100000),
      });
      panel.resetDeltas();
      lastWeather = null;
      save();
      refresh();
    },
  });
}

function refresh() {
  const state = season.engine.state;
  drawScene(view.ctx, { state, month: state.month, weather: lastWeather });
  weatherLabel.textContent = lastWeather ? lastWeather.label : "Початок сезону";
  panel.render(state, region);
  view.fit();
}

function save() {
  storage.save({ state: season.engine.state, seed: season.engine.rng.seed });
}
