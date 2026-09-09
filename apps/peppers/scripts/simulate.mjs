/**
 * Прогін симуляції без інтерфейсу.
 *
 * Чотири рослини на спільному середовищі мають конфліктні оптимуми, і без
 * прогону на кілька років уперед не видно, чи взагалі існує стратегія, за якої
 * виживають усі. Балансувати це в браузері, клікаючи по картках, неможливо.
 *
 *   node scripts/simulate.mjs            усі стратегії, 4 роки
 *   node scripts/simulate.mjs 6          6 років
 *   node scripts/simulate.mjs 4 careful  лише одна стратегія
 */

import { createInitialState, PLANT_IDS } from "../src/game/model.js";
import { createSeasonEngine, appliesTo, buildActionContext, plantTargets } from "../src/game/season.js";
import { calculateHarvest } from "../src/game/harvest.js";
import { startNextYear } from "../src/game/carryover.js";
import { actionsForMonth, ACTIONS_BY_ID } from "../src/data/actions.data.js";
import { CULTIVARS } from "../src/data/plants.data.js";
import { SEASON_MONTHS, MONTH_NAMES } from "../src/data/calendar.js";
import { hoursFor } from "../src/game/model.js";

const YEARS = Number(process.argv[2] ?? 4);
const ONLY = process.argv[3] ?? null;

/**
 * Стратегії — це моделі гравців, а не оптимізатори. Кожна відповідає на
 * питання «що буде, якщо людина поводиться ось так».
 */
const STRATEGIES = {
  // Нічого не робить узагалі. Нижня межа: показує, чи гине те, що має гинути.
  nothing: {
    label: "Нічого не робити",
    pick: () => [],
  },

  // Поливає, як улітку, цілий рік і більше нічого. Найпоширеніша помилка.
  naive: {
    label: "Тільки поливати, як улітку",
    pick: ({ state, month }) => {
      const water = ACTIONS_BY_ID.water_normal;
      if (!water.months.includes(month)) return [];
      return plantTargets(state, water).map((plantId) => ({ action: water, plantId }));
    },
  },

  // Купує обладнання, але за рослинами не стежить.
  gear: {
    label: "Купити обладнання, далі не стежити",
    pick: ({ state, month }) => {
      const wanted = ["insulate_pots", "grow_light", "seal_windows", "humidifier_on", "thermometer"];
      const picks = [];
      for (const id of wanted) {
        const action = ACTIONS_BY_ID[id];
        if (!action.months.includes(month)) continue;
        if (action.requires?.({ state, month })) continue;
        picks.push({ action, plantId: null });
      }
      return picks;
    },
  },

  // Робить те, що гра сама позначає важливим. Це «уважний новачок».
  careful: {
    label: "Робити все важливе за підказками",
    pick: ({ state, month }) => pickImportant(state, month),
  },
};

function pickImportant(state, month) {
  const picks = [];
  const groups = new Set();

  for (const action of actionsForMonth(month)) {
    const targets = action.scope === "plant" ? plantTargets(state, action) : [null];
    for (const plantId of targets) {
      const ctx = buildActionContext(state, action, plantId, month);
      if (action.requires?.(ctx)) continue;
      if (!action.important?.(ctx)) continue;

      const groupKey = `${action.exclusiveGroup ?? action.id}@${plantId ?? ""}`;
      if (action.exclusiveGroup && groups.has(groupKey)) continue;
      if (action.exclusiveGroup) groups.add(groupKey);

      picks.push({ action, plantId });
    }
  }

  // Полив — базова робота, яку гра не завжди позначає важливою, але яку
  // будь-який притомний гравець робить.
  for (const id of ["water_dormant", "wake_watering", "water_normal"]) {
    const action = ACTIONS_BY_ID[id];
    if (!action.months.includes(month)) continue;
    for (const plantId of plantTargets(state, action)) {
      const already = picks.some((p) => p.plantId === plantId && p.action.exclusiveGroup === "watering");
      if (already) continue;
      const ctx = buildActionContext(state, action, plantId, month);
      if (action.requires?.(ctx)) continue;
      if (state.plants[plantId].pot.moisture > 55) continue;
      picks.push({ action, plantId });
    }
  }

  return withinBudget(picks, state, month);
}

/** Бюджет годин спільний — зайве відсікається, як і в справжній грі. */
function withinBudget(picks, state, month) {
  const budget = hoursFor(state, month);
  const out = [];
  let spent = 0;
  for (const pick of picks) {
    if (spent + pick.action.laborCost > budget) continue;
    out.push(pick);
    spent += pick.action.laborCost;
  }
  return out;
}

function runStrategy(key, years) {
  const strategy = STRATEGIES[key];
  let state = createInitialState();
  const report = [];

  for (let year = 1; year <= years; year += 1) {
    const season = createSeasonEngine({ initialState: state, seed: 1234 + year });
    const deaths = [];

    for (const month of SEASON_MONTHS) {
      const current = season.engine.state;
      const picks = strategy.pick({ state: current, month });
      const turn = season.playMonth(picks);
      for (const death of turn.deaths) {
        deaths.push({
          plantId: death.plantId,
          cause: death.cause,
          when: `${MONTH_NAMES[death.month]} р.${death.year}`,
        });
      }
    }

    const finished = season.engine.state;
    const harvest = calculateHarvest(finished);
    report.push({ year, harvest, deaths });

    const carried = startNextYear(finished, harvest);
    state = carried.state;
  }

  return { key, strategy, report };
}

function printReport({ key, strategy, report }) {
  console.log(`\n${"═".repeat(72)}`);
  console.log(`  ${strategy.label}  [${key}]`);
  console.log("═".repeat(72));

  for (const { year, harvest, deaths } of report) {
    const line = PLANT_IDS.map((id) => {
      const p = harvest.plants.find((x) => x.id === id);
      const name = CULTIVARS[id].name.padEnd(13);
      if (!p.alive) return `  ${name} ✝ загинув`;
      const green = p.greenCount > 0 ? `  (+${p.greenCount} зелених)` : "";
      return `  ${name} ${String(p.grams).padStart(4)} г   ${p.ripeCount} шт${green}`;
    }).join("\n");

    console.log(`\n Рік ${year} — разом ${harvest.totalGrams} г, вижило ${harvest.survived}/4`);
    console.log(line);
    for (const death of deaths) {
      console.log(`   ✝ ${CULTIVARS[death.plantId].name}: ${death.cause} (${death.when})`);
    }
  }

  const last = report[report.length - 1];
  console.log(`\n  Підсумок: ${last.harvest.lesson}`);
}

const keys = ONLY ? [ONLY] : Object.keys(STRATEGIES);
for (const key of keys) {
  if (!STRATEGIES[key]) {
    console.error(`Невідома стратегія: ${key}. Доступні: ${Object.keys(STRATEGIES).join(", ")}`);
    process.exit(1);
  }
  printReport(runStrategy(key, YEARS));
}
console.log("");
