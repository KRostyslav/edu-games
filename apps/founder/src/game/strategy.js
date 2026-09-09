/**
 * Гравець, який робить рівно те, що гра сама позначила важливим.
 *
 * Цей код виконує дві ролі одночасно, і це навмисно:
 *   1) у балансовому прогоні він є контрактом — якщо підказки не виграють,
 *      значить, гра бреше гравцеві;
 *   2) на екрані вироку він дає контрфактуал: той самий сід, та сама
 *      випадковість, але уважна гра — і видно, чим це могло скінчитися.
 *
 * Спільний код тут важливіший за зручність: якби автопсія рахувала «уважну
 * гру» власним алгоритмом, вона могла б обіцяти результат, якого підказки
 * насправді не дають.
 */

import { hoursFor, createInitialState, TOTAL_MONTHS } from "./model.js";
import { createMonthEngine } from "./month.js";
import { actionsFor, costOf, ACTIONS_BY_ID } from "../data/actions.data.js";
import { SCENARIOS } from "../data/scenarios.js";

/** Дії, які уважний гравець бере понад позначені важливими. */
const ROUTINE = [
  "write_article",
  "community_presence",
  "ship_requested_feature",
  "collect_testimonials",
  "customer_interviews",
];

/**
 * Набір дій у межах бюджету годин.
 *
 * `ban` відсікає дії ДО набору, а не після: інакше стратегія, яка
 * «відмовляється відпочивати», просто звільняла б собі бюджет і працювала менше.
 */
export function pickByIds(state, ids) {
  const available = hoursFor(state);
  const ctx = { state, month: state.month, monthIndex: state.monthIndex };
  const pool = actionsFor(state);
  const picks = [];
  const groups = new Set();
  let spent = 0;

  for (const id of ids) {
    const action = ACTIONS_BY_ID[id];
    if (!action || !pool.includes(action)) continue;
    if (action.requires?.(ctx)) continue;
    if (picks.includes(action)) continue;
    if (action.exclusiveGroup && groups.has(action.exclusiveGroup)) continue;

    const cost = costOf(action, state, available);
    if (spent + cost > available) continue;

    if (action.exclusiveGroup) groups.add(action.exclusiveGroup);
    picks.push(action);
    spent += cost;
  }
  return picks;
}

/** Усе, що гра позначила важливим, плюс рутина. */
export function hintedPicks(state, { extra = ROUTINE, ban = [] } = {}) {
  const ctx = { state, month: state.month, monthIndex: state.monthIndex };

  // Спершу те, що загрожує вам самим: вичерпані сили множать усі інші години
  // на менше за одиницю, тому відпочинок конкурує не з роботою, а з її віддачею.
  const important = actionsFor(state)
    .filter((action) => action.important?.(ctx))
    .filter((action) => !action.requires?.(ctx))
    .sort((a, b) => (a.category === "self" ? -1 : 0) - (b.category === "self" ? -1 : 0))
    .map((action) => action.id);

  return pickByIds(state, [...important, ...extra].filter((id) => !ban.includes(id)));
}

/**
 * Переграє партію тим самим сідом, роблячи все за підказками.
 *
 * Шар `game/` не має DOM, тому це працює і в браузері, і під node. Тридцять
 * шість ходів чистої арифметики — це мілісекунди, тому екран вироку може
 * порахувати альтернативу наживо замість того, щоб зберігати таблицю відповідей.
 */
export function replayHinted({ scenarioId, seed, months = TOTAL_MONTHS }) {
  const scenario = SCENARIOS[scenarioId];
  const season = createMonthEngine({ initialState: createInitialState(scenario, seed), seed });

  let endedAt = months;
  for (let i = 1; i <= months; i += 1) {
    if (season.engine.state.verdict?.over) {
      endedAt = i - 1;
      break;
    }
    season.playMonth(hintedPicks(season.engine.state));
  }

  const final = season.engine.state;
  return {
    months: endedAt,
    mrr: final.biz.mrr,
    customers: final.biz.customers,
    cash: final.biz.cash,
    churnPct: final.metrics.churnPct,
    verdict: final.verdict ?? null,
  };
}
