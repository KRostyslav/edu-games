/**
 * Панель місяця.
 *
 * Головна складність цієї гри проти виноградника — чотири рослини замість
 * однієї. Двадцять смужок на кожну дали б стіну, у якій нічого не видно, тому
 * панель тришарова:
 *
 *   1) балкон       — п'ять спільних показників і обладнання, завжди на очах;
 *   2) таблиця      — щільне порівняння чотирьох рослин, відповідає на одне
 *                     питання: «де зараз проблема»;
 *   3) вкладка      — усе про одну рослину: фаза, попередження, показники, дії.
 *
 * Бюджет годин спільний і завжди видимий унизу: саме він робить колекцію
 * колекцією. Годин ніколи не вистачає на всіх, і вибір, кого доглянути, — це
 * і є головне рішення місяця.
 */

import { el } from "@edu/pixel-ui";
import { statBar, actionCard, tabStrip, compareTable, hours } from "./widgets.js";
import { openCodex } from "./codex.js";
import { CULTIVARS, PLANT_IDS, speciesOf } from "../data/plants.data.js";
import { BALCONY_PHASE, MONTH_NAMES } from "../data/calendar.js";
import { actionsForMonth } from "../data/actions.data.js";
import { hoursFor } from "../game/model.js";
import { buildActionContext, plantTargets } from "../game/season.js";
import { forecast } from "../game/climate.js";
import { phaseOf } from "../game/phenology.js";
import { risksFor } from "../game/verdict.js";

const BALCONY_TAB = "balcony";

export function createMonthPanel({ root, onAdvance, onSelectPlant, onAutopsy }) {
  // ── Шапка ──
  const header = el("header", "panel__header");
  const monthTitle = el("h2", "panel__month");
  const phase = el("p", "panel__phase");
  const phaseText = el("p", "panel__phase-text");
  const forecastRow = el("p", "panel__forecast");
  header.append(monthTitle, phase, phaseText, forecastRow);

  // ── Балкон ──
  const balconySection = el("section", "panel__balcony");
  balconySection.append(el("h3", "panel__section-title", "Балкон — спільне для всіх"));
  const balconyStats = el("div", "balcony__stats");
  const equipmentRow = el("div", "balcony__equipment");
  balconySection.append(balconyStats, equipmentRow);
  const balconyBars = buildBalconyBars(balconyStats);

  // ── Таблиця порівняння ──
  const compareSection = el("section", "panel__compare");
  compareSection.append(el("h3", "panel__section-title", "Чотири горщики"));
  const compareHost = el("div", "panel__compare-host");
  compareSection.append(compareHost);

  // ── Вкладки ──
  const tabsHost = el("div", "panel__tabs");
  const tabBody = el("div", "panel__tab-body");

  // ── Підвал із бюджетом ──
  const foot = el("footer", "panel__foot");
  const budget = el("span", "panel__budget");
  const advance = el("button", "btn btn--primary panel__advance", "Прожити місяць →");
  advance.type = "button";
  foot.append(budget, advance);

  root.append(header, balconySection, compareSection, tabsHost, tabBody, foot);

  let state = null;
  let previous = null;
  let selected = [];
  let cards = [];
  let activeTab = BALCONY_TAB;
  let tabs = null;

  advance.addEventListener("click", () => onAdvance(selected));

  function render(nextState) {
    state = nextState;
    const month = state.month;
    const info = BALCONY_PHASE[month];

    monthTitle.textContent = `${MONTH_NAMES[month]}, рік ${state.year}`;
    phase.textContent = info.phase;
    phaseText.textContent = info.description;

    const f = forecast(state, month);
    forecastRow.textContent =
      `Прогноз: за вікном ${f.outdoor} °C · на балконі ${f.tempAir} °C · ` +
      `у горщиках ${f.tempFloor} °C · день ${f.daylight} год` +
      (f.lamp ? " + лампа" : "");

    updateBalcony();
    renderCompare();

    // Вибір скидається щомісяця: дії однієї рослини не переносяться на іншу.
    selected = [];
    cards = [];

    if (!state.plants[activeTab] && activeTab !== BALCONY_TAB) activeTab = BALCONY_TAB;
    renderTabs();
    renderTabBody();
    syncAvailability();

    previous = structuredClone(state);
  }

  // ─────────────────────────────── Балкон ───────────────────────────────
  function updateBalcony() {
    for (const [path, bar] of balconyBars) {
      const value = read(state, path);
      const before = previous ? read(previous, path) : null;
      bar.update(value, before == null ? null : value - before);
    }

    equipmentRow.replaceChildren();
    const items = [
      ["lamp", "Фітолампа"],
      ["potStand", "Підставки"],
      ["insulation", "Утеплення"],
      ["humidifier", "Зволожувач"],
      ["heater", "Обігрівач"],
      ["fan", "Вентилятор"],
      ["thermometer", "Термометр"],
    ];
    for (const [key, label] of items) {
      const on = state.equipment[key] > 0;
      const chip = el("span", "chip", `${on ? "✓" : "✗"} ${label}`);
      chip.dataset.on = String(on);
      equipmentRow.append(chip);
    }
  }

  // ───────────────────────────── Таблиця ─────────────────────────────
  function renderCompare() {
    const columns = PLANT_IDS.map((id) => {
      const plant = state.plants[id];
      return {
        id,
        label: CULTIVARS[id].name,
        note: plant.alive > 0 ? `${plant.age}-й рік` : "загинула",
        dead: plant.alive <= 0,
      };
    });

    const rows = [
      row("Стан", (plant, id) => {
        if (plant.alive <= 0) return null;
        const risks = risksFor(plant, state, id);
        const bad = risks.filter((r) => r.severity === "bad").length;
        const warn = risks.length - bad;
        if (bad > 0) return { text: `${bad} загроз`, tone: "bad", hint: risks.map((r) => r.text).join("\n\n") };
        if (warn > 0) return { text: `${warn} попер.`, tone: "warn", hint: risks.map((r) => r.text).join("\n\n") };
        return { text: "нормально", tone: "good" };
      }),
      row("Листя", (plant) => level(plant.leaf, [20, 45])),
      row("Запас стебла", (plant) => level(plant.reserves, [20, 45])),
      row("Коріння", (plant) => level(plant.roots, [30, 60])),
      row("Волога", (plant) => moistureCell(plant)),
      row("Кліщ", (plant) => level(plant.mites, [45, 25], true)),
      row("Плоди", (plant) => fruitCell(plant)),
    ];

    compareHost.replaceChildren(
      compareTable({
        columns,
        rows,
        onColumnClick: (id) => selectTab(id),
      }),
    );
  }

  function row(label, cellFor) {
    const cells = {};
    for (const id of PLANT_IDS) {
      cells[id] = cellFor(state.plants[id], id);
    }
    return { label, cells };
  }

  function level(value, [low, mid], inverted = false) {
    const v = Math.round(value);
    if (inverted) {
      return { text: String(v), tone: v > low ? "bad" : v > mid ? "warn" : "good" };
    }
    return { text: String(v), tone: v < low ? "bad" : v < mid ? "warn" : "good" };
  }

  function moistureCell(plant) {
    if (plant.alive <= 0) return null;
    const v = Math.round(plant.pot.moisture);
    // Для вологи «більше» не означає «краще»: обидва краї однаково погані.
    const dormant = plant.dormancy > 40;
    const tooWet = dormant ? v > 55 : v > 88;
    const tooDry = v < 20;
    return {
      text: String(v),
      tone: tooWet || tooDry ? "bad" : v < 32 || v > 78 ? "warn" : "good",
      hint: tooWet
        ? "У спокої мокрий субстрат — головна причина кореневої гнилі"
        : tooDry
          ? "Грудка пересохла — гинуть дрібні всмоктувальні корінці"
          : "",
    };
  }

  function fruitCell(plant) {
    if (plant.alive <= 0) return null;
    if (plant.fruitSet < 5 && plant.flowers < 5) return { text: "—", tone: "neutral" };
    if (plant.fruitSet < 5) return { text: `${Math.round(plant.flowers)} квіт.`, tone: "warn" };
    return {
      text: `${Math.round(plant.fruitSet)} / ${Math.round(plant.ripeness)}%`,
      tone: plant.ripeness > 50 ? "good" : "warn",
      hint: "Зав'язь / частка визрілого",
    };
  }

  // ───────────────────────────── Вкладки ─────────────────────────────
  function renderTabs() {
    const list = [
      { id: BALCONY_TAB, label: "Балкон" },
      ...PLANT_IDS.map((id) => {
        const plant = state.plants[id];
        if (plant.alive <= 0) {
          return { id, label: CULTIVARS[id].name, badge: "✝", tone: "dead" };
        }
        const risks = risksFor(plant, state, id);
        const bad = risks.some((r) => r.severity === "bad");
        return {
          id,
          label: CULTIVARS[id].name,
          badge: risks.length ? String(risks.length) : "",
          tone: bad ? "bad" : risks.length ? "warn" : null,
        };
      }),
    ];

    tabs = tabStrip({ tabs: list, active: activeTab, onSelect: selectTab });
    tabsHost.replaceChildren(tabs.root);
  }

  function selectTab(id) {
    activeTab = id;
    tabs?.setActive(id);
    renderTabBody();
    syncAvailability();
    onSelectPlant?.(id === BALCONY_TAB ? null : id);
  }

  function renderTabBody() {
    tabBody.replaceChildren();
    cards = cards.filter((c) => c.scope !== activeScope());

    if (activeTab === BALCONY_TAB) {
      tabBody.append(el("p", "panel__hint", "Дії з цієї вкладки діють на весь балкон одразу."));
      renderActions(tabBody, null);
      return;
    }

    const id = activeTab;
    const plant = state.plants[id];
    const cultivar = CULTIVARS[id];

    // Заголовок рослини: сорт, вид і індивідуальна фаза.
    const head = el("div", "plant__head");
    head.append(el("h3", "plant__name", cultivar.name));
    head.append(el("span", "plant__species", speciesOf(id).label));
    head.append(el("p", "plant__note", cultivar.note));
    tabBody.append(head);

    const ph = phaseOf(plant, state, id, state.month);
    const phaseBox = el("div", "plant__phase");
    phaseBox.append(el("h4", "plant__phase-title", ph.phase), el("p", "plant__phase-text", ph.description));
    tabBody.append(phaseBox);

    if (plant.alive <= 0) {
      const dead = el("div", "plant__dead");
      dead.append(
        el("p", "plant__dead-text", plant.death ? plant.death.reason : "Рослина загинула."),
      );
      const button = el("button", "btn", "Відкрити розтин");
      button.type = "button";
      button.addEventListener("click", () => onAutopsy?.(id));
      dead.append(button);
      tabBody.append(dead);
      renderActions(tabBody, id);
      return;
    }

    // Попередження — з тієї самої функції, що живить вирок.
    const risks = risksFor(plant, state, id);
    if (risks.length) {
      const box = el("div", "plant__risks");
      box.append(el("h4", "plant__risks-title", "На що зважити зараз"));
      for (const risk of risks) {
        const item = el("p", "plant__risk", risk.text);
        item.dataset.severity = risk.severity;
        box.append(item);
      }
      tabBody.append(box);
    }

    tabBody.append(buildPlantStats(plant, id));
    renderActions(tabBody, id);
  }

  function activeScope() {
    return activeTab === BALCONY_TAB ? "balcony" : "plant";
  }

  function buildPlantStats(plant, id) {
    const wrap = el("div", "plant__stats");
    const cultivar = CULTIVARS[id];

    const groups = [
      {
        title: "Кущ",
        items: [
          ["leaf", "Листовий апарат", plant.leaf, "Листя годує плоди. Взимку без підсвітки воно опадає."],
          ["reserves", "Запас у стеблі", plant.reserves, "Те, з чого кущ стартує навесні, поки листя ще немає."],
          ["vigor", "Сила росту", plant.vigor, "Виводиться зі стану коріння, запасу й об'єму горщика."],
          ["dormancy", "Глибина спокою", plant.dormancy, "100 — повна зупинка. Керується теплом і світлом.", true],
          ["woody", "Здерев'яніння", plant.woody, "Здерев'яніле стебло краще переносить холод."],
          ["damage", "Пошкодження", plant.damage, "Опіки, підмерзання, зламані гілки.", true],
        ],
      },
      {
        title: "Коріння й горщик",
        items: [
          ["roots", "Стан коріння", plant.roots, "Нуль — загибель рослини. Найважливіший показник зими."],
          ["rootFill", "Заповненість горщика", plant.rootFill, "Понад 88 — коренезв'язаність, потрібна пересадка."],
          ["pot.moisture", "Волога субстрату", plant.pot.moisture, "У спокої понад 60 — це вже режим гниття."],
          ["pot.drainage", "Повітроємність", plant.pot.drainage, "Субстрат злежується сам собою щороку."],
          ["pot.salinity", "Засолення", plant.pot.salinity, "Солі від добрив. У горщику їм нікуди подітися.", true],
        ],
      },
      {
        title: "Живлення",
        items: [
          ["pot.nitrogen", "Азот", plant.pot.nitrogen, "Листя й пагони. Потрібен навесні, шкідливий при цвітінні."],
          ["pot.pk", "Фосфор і калій", plant.pot.pk, "Цвітіння й налив плодів."],
          ["pot.calcium", "Кальцій", plant.pot.calcium, "Проти вершинної гнилі. Рухається лише з водою."],
          ["pot.magnesium", "Магній", plant.pot.magnesium, "Центр хлорофілу. Дефіцит — жовті плями між жилками."],
        ],
      },
      {
        title: "Урожай і шкідники",
        items: [
          ["flowers", "Квітки", plant.flowers, "Без ручного запилення більшість обсиплеться."],
          ["fruitSet", "Зав'язь", plant.fruitSet, "Результат запилення."],
          ["fruitFill", "Налив плодів", plant.fruitFill, "Вода, калій і працююче листя."],
          ["ripeness", "Визрівання", plant.ripeness, `${speciesOf(id).label}: ${speciesOf(id).ripenRate < 1 ? "90–120" : "60–80"} днів від зав'язі.`],
          ["mites", "Павутинний кліщ", plant.mites, "Розганяється сухим повітрям. Інсектициди не діють."],
          ["pests", "Комахи-шкідники", plant.pests, "Попелиця, білокрилка, трипс."],
        ],
        invert: true,
      },
    ];

    for (const group of groups) {
      const section = el("section", "stats__group");
      section.append(el("h4", "stats__title", group.title));
      // Для частини показників «менше» означає «краще»: спокій улітку, будь-які
      // пошкодження, засолення, шкідники. Смужка мусить показувати це кольором,
      // інакше нуль пошкоджень читається як провал.
      for (const [key, label, value, hint, inverted] of group.items) {
        const before = previous ? readPlant(previous.plants[id], key) : null;
        const bar = statBar({
          label,
          value,
          hint,
          max: key === "pot.volume" ? 25 : 100,
          optimum: key === "pot.moisture" ? (plant.dormancy > 40 ? 38 : 60) : null,
        });
        if (group.invert || inverted) bar.root.dataset.invert = "true";
        bar.update(value, before == null ? null : value - before);
        section.append(bar.root);
      }
      wrap.append(section);
    }

    // Об'єм горщика — не смужка, а факт із контекстом.
    const potNote = el("p", "plant__pot-note");
    potNote.textContent =
      `Горщик ${plant.pot.volume} л при потребі сорту ${cultivar.needL} л` +
      (plant.pot.volume < cultivar.needL ? " — врожай обмежений посудом." : " — об'єму достатньо.");
    wrap.append(potNote);

    return wrap;
  }

  // ─────────────────────────────── Дії ───────────────────────────────
  function renderActions(host, plantId) {
    const wrap = el("div", "panel__actions");
    const head = el("div", "panel__actions-head");
    head.append(
      el(
        "h4",
        "panel__actions-title",
        plantId ? `Що робимо з «${CULTIVARS[plantId].name}»` : "Робота на балконі",
      ),
    );
    const grid = el("div", "actions-grid");
    wrap.append(head, grid);

    const scope = plantId ? "plant" : "balcony";
    const available = actionsForMonth(state.month)
      .filter((action) => action.scope === scope)
      .filter((action) => (plantId ? plantTargets(state, action).includes(plantId) : true));

    if (available.length === 0) {
      grid.append(
        el(
          "p",
          "panel__empty",
          plantId
            ? "Цього місяця з цією рослиною робити нічого — усе вирішується умовами на балконі."
            : "Цього місяця на балконі робити нічого.",
        ),
      );
    }

    for (const action of available) {
      const ctx = buildActionContext(state, action, plantId, state.month);
      const blocked = action.requires?.(ctx);
      const card = actionCard({
        action,
        disabled: Boolean(blocked),
        disabledReason: blocked ?? "",
        onCodex: (ref) => openCodex(ref),
        onToggle: (chosen, isOn) => {
          if (isOn) selected.push({ action: chosen, plantId });
          else selected = selected.filter((s) => !(s.action.id === chosen.id && s.plantId === plantId));
          syncAvailability();
        },
      });

      // Позначаємо важливе цього місяця — підказка, а не примус.
      if (action.important?.(ctx) && !blocked) {
        card.root.dataset.important = "true";
        card.root.append(el("p", "card__flag", "Цього місяця це важливо"));
      }

      const already = selected.some((s) => s.action.id === action.id && s.plantId === plantId);
      if (already) card.setSelected(true);

      cards.push({ card, action, plantId, scope });
      grid.append(card.root);
    }

    host.append(wrap);
  }

  /** Блокує те, на що вже не вистачає годин, і взаємовиключні варіанти. */
  function syncAvailability() {
    const budgetHours = hoursFor(state, state.month);
    const spent = selected.reduce((sum, s) => sum + s.action.laborCost, 0);
    const takenGroups = new Set(
      selected
        .filter((s) => s.action.exclusiveGroup)
        .map((s) => `${s.action.exclusiveGroup}@${s.plantId ?? ""}`),
    );

    for (const entry of cards) {
      const { card, action, plantId } = entry;
      if (card.selected) {
        card.setDisabled(false);
        continue;
      }

      const ctx = buildActionContext(state, action, plantId, state.month);
      const blocked = action.requires?.(ctx);
      if (blocked) {
        card.setDisabled(true, blocked);
        continue;
      }
      if (action.exclusiveGroup && takenGroups.has(`${action.exclusiveGroup}@${plantId ?? ""}`)) {
        card.setDisabled(true, "Ви вже обрали інший варіант цієї роботи для цієї рослини");
        continue;
      }
      if (spent + action.laborCost > budgetHours) {
        card.setDisabled(true, "Не вистачає годин догляду цього місяця");
        continue;
      }
      card.setDisabled(false);
    }

    const left = budgetHours - spent;
    budget.textContent = `Годин догляду: ${left} з ${budgetHours}`;
    budget.dataset.empty = String(left === 0);
    budget.title = "Бюджет спільний на всі чотири горщики — обирати доводиться завжди";
  }

  return {
    render,
    selectTab,
    get activePlant() {
      return activeTab === BALCONY_TAB ? null : activeTab;
    },
    resetDeltas: () => {
      previous = null;
    },
  };
}

// ─────────────────────────── Допоміжне ───────────────────────────

function buildBalconyBars(host) {
  const bars = new Map();
  const items = [
    ["balcony.tempAir", "Температура повітря", -15, 45, " °C", "Те, що показує термометр на стіні."],
    [
      "balcony.tempFloor",
      "Температура в горщику",
      -17,
      42,
      " °C",
      "Саме тут вирішується доля рослини взимку. Бетон холодніший за повітря на 4–5 градусів.",
    ],
    ["balcony.light", "Освітленість", 0, 100, "", "Нижче 38 лист не окупається й опадає."],
    ["balcony.humidity", "Вологість повітря", 0, 100, "%", "Нижче 40% починається кліщ."],
    ["balcony.airflow", "Рух повітря", 0, 100, "", "Застій — це хвороби, перегрів і слабке стебло."],
  ];

  for (const [path, label, min, max, unit, hint] of items) {
    const bar = statBar({ label, min, max, unit, hint });
    host.append(bar.root);
    bars.set(path, bar);
  }
  return bars;
}

function read(state, path) {
  return path.split(".").reduce((node, key) => node?.[key], state);
}

function readPlant(plant, key) {
  return key.split(".").reduce((node, part) => node?.[part], plant);
}

export { hours };
