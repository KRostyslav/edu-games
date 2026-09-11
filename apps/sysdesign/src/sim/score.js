/**
 * Зірки рівня.
 *
 *   ★   Працює — у спокійні хвилини помилок не більше 1%.
 *   ★★  Тримає SLO — латентність, доступність, лаг і свіжість у межах вимог
 *       навіть під час інцидентів.
 *   ★★★ Як на співбесіді — у бюджеті й з тими рішеннями, про які спитає
 *       інтерв'юер (без SPOF, з breaker, ідемпотентно...).
 *
 * Кожен критерій повертається зі значенням із цього прогону: «p99 312 мс при
 * SLO 200» вчить більше, ніж просто червоний хрестик.
 */

import { CLASS_LABELS } from "../data/constants.js";
import { CHECKS } from "./checks.js";

const pct = (value, digits = 2) => `${(value * 100).toFixed(digits)}%`;
const ms = (value) => `${Math.round(value).toLocaleString("uk-UA")} мс`;

export function scoreRun(run, level) {
  if (!run?.ok) return { stars: 0, criteria: [] };
  const summary = run.summary;
  const slo = level.slo ?? {};
  const criteria = [];

  criteria.push({
    id: "works",
    tier: 1,
    label: "Працює: у спокійні хвилини помилок ≤ 1%",
    ok: summary.baselineErr <= 0.01,
    detail: `Помилок у перші хвилини: ${pct(summary.baselineErr)}`,
    codexRef: "what-happens-url",
  });

  for (const [cls, limit] of Object.entries(slo.p99Ms ?? {})) {
    const worst = summary.p99Worst[cls];
    if (worst == null) continue;
    criteria.push({
      id: `p99-${cls}`,
      tier: 2,
      label: `p99 «${CLASS_LABELS[cls]}» ≤ ${ms(limit)}`,
      ok: worst <= limit,
      detail: `Найгірше: ${ms(worst)}${slo.graceTicks ? ` (без ${slo.graceTicks} найгірших хв)` : ""}`,
      codexRef: "sla-slo-sli",
    });
  }

  if (slo.availability != null) {
    criteria.push({
      id: "availability",
      tier: 2,
      label: `Доступність ≥ ${pct(slo.availability, slo.availability >= 0.999 ? 2 : 1)}`,
      ok: summary.availability >= slo.availability,
      detail: `За годину: ${pct(summary.availability)}${summary.degradedShare > 0.001 ? `, з них у режимі деградації ${pct(summary.degradedShare, 1)}` : ""}`,
      codexRef: "sla-slo-sli",
    });
  }

  if (slo.maxLagSec != null) {
    criteria.push({
      id: "lag",
      tier: 2,
      label: `Затримка обробки черги ≤ ${Math.round(slo.maxLagSec / 60)} хв`,
      ok: summary.lagMax <= slo.maxLagSec,
      detail: `Найбільша: ${Math.round(summary.lagMax)} с`,
      codexRef: "message-queues",
    });
  }

  if (slo.maxStalenessSec != null) {
    criteria.push({
      id: "staleness",
      tier: 2,
      label: `Дані застарівають не більше ніж на ${slo.maxStalenessSec} с`,
      ok: summary.stalenessMax <= slo.maxStalenessSec,
      detail: `Найгірше: ${Math.round(summary.stalenessMax)} с`,
      codexRef: "cache-invalidation",
    });
  }

  if (slo.maxOutageTicks != null) {
    criteria.push({
      id: "rto",
      tier: 2,
      label: `RTO ≤ ${slo.maxOutageTicks} хв: система не лежить довше`,
      ok: summary.outageTicks <= slo.maxOutageTicks,
      detail: `Найдовший простій: ${summary.outageTicks} хв`,
      codexRef: "multi-region",
    });
  }

  if (level.budget) {
    criteria.push({
      id: "budget",
      tier: 3,
      label: `Бюджет ≤ $${level.budget.toLocaleString("uk-UA")}/міс`,
      ok: summary.cost <= level.budget,
      detail: `Схема коштує $${Math.round(summary.cost).toLocaleString("uk-UA")}/міс`,
      codexRef: "cloud-services",
    });
  }

  for (const check of level.checks ?? []) {
    const spec = CHECKS[check.id];
    const result = spec.test(run.plan, run, check.args ?? {});
    criteria.push({ id: `check-${check.id}`, tier: 3, label: check.label ?? spec.label, ok: result.ok, detail: result.detail, codexRef: spec.codexRef });
  }

  const tierOk = (tier) => criteria.filter((item) => item.tier === tier).every((item) => item.ok);
  let stars = 0;
  if (tierOk(1)) stars = 1;
  if (stars === 1 && tierOk(2)) stars = 2;
  if (stars === 2 && tierOk(3)) stars = 3;
  return { stars, criteria };
}
