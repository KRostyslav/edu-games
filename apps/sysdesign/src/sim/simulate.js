/**
 * Прогін схеми: година симульованого часу, хвилина за хвилиною.
 *
 * Чиста функція без DOM: той самий граф, рівень і seed завжди дають ту саму
 * часову шкалу. На цьому стоять і програвання з перемоткою в UI, і балансовий
 * скрипт, і тести: розбір «чому впало» чесний лише тоді, коли його можна
 * відтворити.
 */

import { createRng } from "@edu/sim-core";
import { RUN_TICKS, BASELINE_TICKS, CLASSES } from "../data/constants.js";
import { buildEnv } from "../data/incidents.js";
import { compile } from "./compile.js";
import { validate, hasErrors } from "./validate.js";
import { initCarry, solveTick, AVAIL_CLASSES } from "./tick.js";
import { computeCost } from "./cost.js";
import { explain } from "./explain.js";

export function simulate(graph, level, { seed = 1, ticks = RUN_TICKS, incidents = true } = {}) {
  const runLevel = incidents ? level : { ...level, incidents: [] };
  const plan = compile(graph, runLevel);
  const issues = validate(graph, runLevel, plan);
  if (hasErrors(issues)) return { ok: false, issues, plan };

  const rng = createRng(seed);
  const carry = initCarry(plan);
  const series = [];
  for (let t = 0; t < ticks; t += 1) {
    series.push(solveTick(plan, buildEnv(runLevel, plan, t), carry, t, rng));
  }

  const cost = computeCost(plan, series, carry);
  if (level.budget && cost.total > level.budget) {
    issues.push({
      severity: "warn",
      code: "W-BUDGET",
      text: `Схема коштує $${Math.round(cost.total).toLocaleString("uk-UA")}/міс при бюджеті $${level.budget.toLocaleString("uk-UA")}.`,
      codexRef: "cloud-services",
    });
  }
  const summary = summarize(plan, series, cost);
  return { ok: true, issues, plan, ticks: series, summary, cost };
}

/**
 * Прогноз для редактора: одна спокійна хвилина. Показує завантаження вузлів
 * і вартість ще до запуску — але без інцидентів, бо їхній час лишається сюрпризом.
 */
export function forecast(graph, level) {
  return simulate(graph, level, { ticks: 1, incidents: false });
}

function summarize(plan, series, cost) {
  const level = plan.level;
  const slo = level.slo ?? {};
  const grace = slo.graceTicks ?? 0;

  let offered = 0;
  let served = 0;
  let degraded = 0;
  let baseOffered = 0;
  let baseServed = 0;
  for (const tick of series) {
    for (const cls of AVAIL_CLASSES) {
      offered += tick.offered[cls];
      served += tick.served[cls];
      degraded += tick.served[cls] * (tick.degraded[cls] ?? 0);
      if (tick.t < BASELINE_TICKS) {
        baseOffered += tick.offered[cls];
        baseServed += tick.served[cls];
      }
    }
  }

  const p99Worst = {};
  const p99Max = {};
  const p99Series = {};
  for (const cls of CLASSES) {
    const values = series.map((tick) => tick.p99[cls]).filter((value) => value != null);
    if (!values.length) continue;
    p99Series[cls] = series.map((tick) => tick.p99[cls] ?? null);
    const sorted = [...values].sort((a, b) => b - a);
    p99Max[cls] = sorted[0];
    // Кілька найгірших хвилин прощаються: failover чи підйом автоскейлера
    // триває хвилину-дві навіть у правильно зібраній системі.
    p99Worst[cls] = sorted[Math.min(grace, sorted.length - 1)];
  }

  let longest = 0;
  let streak = 0;
  for (const tick of series) {
    streak = tick.availability < 0.9 ? streak + 1 : 0;
    longest = Math.max(longest, streak);
  }

  return {
    availability: offered > 0 ? served / offered : 1,
    baselineErr: baseOffered > 0 ? 1 - baseServed / baseOffered : 0,
    degradedShare: served > 0 ? degraded / served : 0,
    p99Worst,
    p99Max,
    p99Series,
    lagMax: Math.max(0, ...series.map((tick) => tick.lagSec)),
    stalenessMax: Math.max(0, ...series.map((tick) => tick.staleness)),
    rpoLost: series.reduce((sum, tick) => sum + tick.rpoLost, 0),
    outageTicks: longest,
    cost: cost.total,
    bottlenecks: explain(series, plan),
  };
}
