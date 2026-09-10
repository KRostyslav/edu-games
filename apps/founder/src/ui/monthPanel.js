/**
 * Панель місяця: стан справ, попередження, бюджет годин і вибір дій.
 *
 * Показники згруповані так, як їх мислить фаундер (гроші / воронка / продукт /
 * ринок / ви самі), а не за структурою стану. Ті, яких не видно без аналітики,
 * не зникають — вони показуються замком із поясненням, якого рівня бракує.
 */

import { el } from "@edu/pixel-ui";
import { statBar, actionCard, tabStrip, hours } from "./widgets.js";
import { statNameOf, INVERTED } from "./labels.js";
import { openCodex } from "./codex.js";
import { actionsFor, costOf, CATEGORY_LABELS } from "../data/actions.data.js";
import { hoursFor, hoursBreakdown, scenarioOf, TOTAL_MONTHS } from "../game/model.js";
import { risksFor } from "../game/verdict.js";
import { isVisible, levelFor, LEVELS } from "../game/analytics.js";

const MONTH_NAMES = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

const GROUPS = [
  {
    id: "money",
    label: "Гроші",
    stats: [
      { path: "biz.cash", min: -5000, max: 40000, unit: "" },
      { path: "biz.mrr", min: 0, max: 6000 },
      { path: "biz.netProfit", min: -4000, max: 6000 },
      { path: "metrics.runwayMonths", min: 0, max: 24, unit: " міс" },
      { path: "biz.price", min: 0, max: 120 },
    ],
  },
  {
    id: "funnel",
    label: "Воронка",
    stats: [
      { path: "funnel.visitors", min: 0, max: 1200 },
      { path: "funnel.trials", min: 0, max: 80 },
      { path: "funnel.newCustomers", min: 0, max: 30 },
      { path: "funnel.churnedCustomers", min: 0, max: 30 },
      { path: "biz.customers", min: 0, max: 250 },
      { path: "metrics.churnPct", min: 0, max: 25, unit: "%" },
      { path: "metrics.mrrCeiling", min: 0, max: 12000 },
    ],
  },
  {
    id: "product",
    label: "Продукт",
    stats: [
      { path: "product.fit" },
      { path: "product.depth" },
      { path: "product.onboarding" },
      { path: "product.polish" },
      { path: "product.bugs" },
      { path: "product.techDebt" },
      { path: "product.selfServe" },
    ],
  },
  {
    id: "market",
    label: "Ринок",
    stats: [
      { path: "market.icpClarity" },
      { path: "market.positioning" },
      { path: "market.trust" },
      { path: "market.awareness" },
      { path: "market.tam" },
      { path: "channels.seoAsset" },
      { path: "channels.seoMature" },
      { path: "channels.communityRep" },
    ],
  },
  {
    id: "self",
    label: "Ви",
    stats: [
      { path: "founder.energy" },
      { path: "founder.supportBacklog" },
      { path: "founder.skillMarketing" },
      { path: "founder.skillSales" },
      { path: "biz.ramenMonths", min: 0, max: 6, unit: " з 6" },
      { path: "biz.salaryMonths", min: 0, max: 6, unit: " з 6" },
    ],
  },
];

export function createMonthPanel({ root, onAdvance }) {
  const header = el("header", "panel__header");
  const title = el("h2", "panel__month");
  const scenarioLine = el("p", "panel__scenario");
  const goal = el("p", "panel__goal");
  header.append(title, scenarioLine, goal);

  const warnings = el("div", "panel__warnings");

  const statsWrap = el("div", "panel__stats");
  const statsTabs = el("div", "panel__stats-tabs");
  const statsBody = el("div", "panel__stats-body");
  statsWrap.append(statsTabs, statsBody);

  const actionsWrap = el("div", "panel__actions");
  const actionsHead = el("div", "panel__actions-head");
  actionsHead.append(el("h3", "panel__actions-title", "Що робимо цього місяця"));
  const budget = el("span", "panel__budget");
  actionsHead.append(budget);
  const budgetNote = el("p", "panel__budget-note");
  const categoryTabs = el("div", "panel__category-tabs");
  const grid = el("div", "actions-grid");
  const advance = el("button", "btn btn--primary panel__advance", "Прожити місяць →");
  advance.type = "button";
  actionsWrap.append(actionsHead, budgetNote, categoryTabs, grid, advance);

  root.append(header, warnings, statsWrap, actionsWrap);

  const bars = new Map();
  let activeGroup = "money";
  let activeCategory = "all";
  let selected = [];
  let cards = [];
  let current = null;
  let previous = null;

  advance.addEventListener("click", () => onAdvance(selected));

  buildStatsTabs();

  function buildStatsTabs() {
    const strip = tabStrip({
      tabs: GROUPS.map((group) => ({ id: group.id, label: group.label })),
      active: activeGroup,
      onSelect: (id) => {
        activeGroup = id;
        renderStats();
      },
    });
    statsTabs.replaceChildren(strip.root);
  }

  function renderStats() {
    if (!current) return;
    const group = GROUPS.find((item) => item.id === activeGroup);
    statsBody.replaceChildren();
    bars.clear();

    for (const spec of group.stats) {
      const value = read(current, spec.path);
      const before = previous ? read(previous, spec.path) : null;
      const known = isVisible(spec.path, current.analytics.level);

      const bar = statBar({
        label: statNameOf(spec.path),
        value,
        min: spec.min ?? 0,
        max: spec.max ?? 100,
        unit: spec.unit ?? "",
        inverted: INVERTED.has(spec.path),
      });
      bar.update(value, before == null ? null : value - before, {
        unknown: !known,
        unknownHint: `потрібен рівень «${LEVELS[levelFor(spec.path)].name}»`,
      });
      bars.set(spec.path, bar);
      statsBody.append(bar.root);
    }
  }

  function renderWarnings(state) {
    warnings.replaceChildren();
    const risks = risksFor(state).filter((risk) => risk.severity === "bad" || risk.severity === "warn");
    if (risks.length === 0) return;

    warnings.append(el("h3", "panel__warnings-title", "На що варто подивитися"));
    for (const risk of risks.slice(0, 4)) {
      const item = el("div", "warning");
      item.dataset.severity = risk.severity;
      item.append(el("p", "warning__text", risk.text));
      warnings.append(item);
    }
  }

  function render(state) {
    current = state;
    const scenario = scenarioOf(state);

    // Завершену партію панель не показує взагалі. Захист другого рівня:
    // основну гарантію дає сам рушій, але між закриттям розбору й появою
    // фіналу не має бути моменту, коли кнопку «Прожити місяць» видно живою.
    if (state.verdict?.over) {
      renderFinished(state);
      return;
    }

    title.textContent = `${MONTH_NAMES[state.month - 1]}, рік ${state.year} — місяць ${state.monthIndex} з ${TOTAL_MONTHS}`;
    scenarioLine.textContent = `${scenario.name}. Рівень аналітики: ${LEVELS[state.analytics.level].name}.`;
    goal.textContent = `Мета: щоб продукт після всіх комісій і податків приносив $${scenario.salaryTarget.toLocaleString(
      "uk-UA",
    )} на місяць шість місяців поспіль. Зараз серія: ${state.biz.salaryMonths} з 6.`;

    renderWarnings(state);
    renderStats();

    const budgetInfo = hoursBreakdown(state);
    const available = budgetInfo.available;
    budget.textContent = `0 з ${hours(available)}`;
    budgetNote.textContent = buildBudgetNote(budgetInfo);

    selected = [];
    cards = [];
    renderCategoryTabs(state);
    renderActions(state, available);

    previous = structuredClone(state);
  }

  function renderCategoryTabs(state) {
    const present = [...new Set(actionsFor(state).map((action) => action.category))];
    const strip = tabStrip({
      tabs: [
        { id: "all", label: "Усі" },
        ...present.map((category) => ({ id: category, label: CATEGORY_LABELS[category] ?? category })),
      ],
      active: activeCategory,
      onSelect: (id) => {
        activeCategory = id;
        renderActions(current, hoursFor(current));
      },
    });
    categoryTabs.replaceChildren(strip.root);
  }

  function renderActions(state, available) {
    grid.replaceChildren();
    cards = [];
    const ctx = { state, month: state.month, monthIndex: state.monthIndex };

    const list = actionsFor(state).filter(
      (action) => activeCategory === "all" || action.category === activeCategory,
    );

    for (const action of list) {
      const blocked = action.requires?.(ctx);
      const cost = costOf(action, state, available);
      const card = actionCard({
        action,
        cost,
        disabled: Boolean(blocked),
        disabledReason: blocked ?? "",
        important: Boolean(action.important?.(ctx)) && !blocked,
        onCodex: (ref) => openCodex(ref),
        onToggle: (chosen, isOn) => {
          if (isOn) selected.push(chosen);
          else selected = selected.filter((item) => item.id !== chosen.id);
          syncAvailability(available);
        },
      });
      cards.push({ card, action, cost });
      grid.append(card.root);
    }

    syncAvailability(available);
  }

  /** Блокує те, на що вже не вистачає годин, і взаємовиключні варіанти. */
  function syncAvailability(available) {
    const spent = selected.reduce(
      (sum, action) => sum + costOf(action, current, available),
      0,
    );
    const groups = new Set(selected.filter((a) => a.exclusiveGroup).map((a) => a.exclusiveGroup));
    const ctx = { state: current, month: current.month, monthIndex: current.monthIndex };

    for (const { card, action, cost } of cards) {
      if (card.selected) {
        card.setDisabled(false);
        continue;
      }
      const blocked = action.requires?.(ctx);
      if (blocked) {
        card.setDisabled(true, blocked);
        continue;
      }
      if (action.exclusiveGroup && groups.has(action.exclusiveGroup)) {
        card.setDisabled(true, "Ви вже обрали інший варіант цієї роботи");
        continue;
      }
      if (spent + cost > available) {
        card.setDisabled(true, "Не вистачає годин цього місяця");
        continue;
      }
      card.setDisabled(false);
    }

    budget.textContent = `${Math.round(spent)} з ${hours(available)}`;
    budget.dataset.full = String(spent >= available * 0.95);
  }

  function renderFinished(state) {
    title.textContent = `Партію завершено на ${state.monthLog.length}-му місяці`;
    scenarioLine.textContent = state.verdict.cause;
    goal.textContent = state.verdict.reason;
    warnings.replaceChildren();
    statsWrap.hidden = true;
    categoryTabs.replaceChildren();
    grid.replaceChildren();
    budget.textContent = "";
    budgetNote.textContent = "";
    advance.disabled = true;
    advance.textContent = "Гру завершено";
  }

  return {
    render,
    resetDeltas() {
      previous = null;
    },
  };
}

function buildBudgetNote(info) {
  const parts = [`Базово ${hours(info.base)}`];
  if (info.support > 0) parts.push(`підтримка забирає ${hours(info.support)}`);
  if (info.debt > 0) parts.push(`технічний борг ${hours(info.debt)}`);
  if (info.energyMult < 0.99) parts.push(`сили множать на ${Math.round(info.energyMult * 100) / 100}`);
  if (info.penaltyPct > 0) parts.push(`втрачено ${info.penaltyPct}% місяця`);
  if (info.unanswered > 1) parts.push(`${hours(info.unanswered)} звернень лишаються без відповіді`);
  return `${parts.join(", ")}.`;
}

function read(object, path) {
  return path.split(".").reduce((acc, key) => acc?.[key], object);
}

export { MONTH_NAMES };
