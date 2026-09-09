/**
 * Хід = один місяць.
 *
 * Порядок фаз сам по собі є моделлю:
 *
 *   1) дії          — переписаний лендінг конвертує трафік ЦЬОГО місяця;
 *   2) ринок        — активи дозрівають і згасають; саме тут живе лаг SEO;
 *   3) трафік       — скільки людей до вас дійшло;
 *   4) воронка      — скільки з них спробувало й заплатило;
 *   5) відтік       — скільки пішло; рахується від бази, що вже включає
 *                     щойно куплених, бо найбільший відтік — у першому місяці;
 *   6) гроші        — наслідок, а не важіль: жодна дія не піднімає MRR прямо;
 *   7) ви самі      — енергія, борг і підтримка реагують на те, що вийшло;
 *   8) події        — перевіряють стан, у якому ви опинилися;
 *   9) метрики      — рахуються останніми, бо мусять описувати місяць,
 *                     який справді стався, включно з його випадковостями;
 *  10) вирок        — бачить усе.
 */

import { createEngine, makeEffect, rollEvent } from "@edu/sim-core";
import { LIMITS, TOTAL_MONTHS, hoursFor } from "./model.js";
import { marketPhase, trafficPhase, funnelPhase, retentionPhase } from "./funnel.js";
import { financePhase, founderPhase, metricsPhase, HOUR_VALUE } from "./finance.js";
import { risksFor, judge, buildAutopsy } from "./verdict.js";
import { actionsFor, costOf, ACTIONS_BY_ID } from "../data/actions.data.js";
import { EVENTS, IDLE_WEIGHT } from "../data/events.data.js";

/** Категорії, години в яких вважаються витратами на залучення. */
const ACQUISITION_CATEGORIES = new Set(["market"]);

export function createMonthEngine({ initialState, seed }) {
  /** Фаза 1: дії гравця. */
  const actionsPhase = ({ state, actions, rng, meta }) => {
    const out = [];
    const available = hoursFor(state);
    let spent = 0;
    const byCategory = {};

    for (const action of actions) {
      const cost = costOf(action, state, available);
      spent += cost;
      const key = categoryKey(action.category);
      byCategory[key] = (byCategory[key] ?? 0) + cost;

      const produced = action.apply({ state, month: state.month, monthIndex: state.monthIndex, rng, meta }) ?? [];
      for (const effect of produced) {
        out.push(makeEffect({ ...effect, source: `action:${action.id}` }));
      }
    }

    meta.hoursSpent = spent;
    meta.hoursAvailable = available;
    meta.hoursByCategory = byCategory;
    // Час, витрачений на залучення, — теж гроші. Соло-розробник зазвичай
    // вважає контент безкоштовним і саме тому не помічає, що канал не окупається.
    meta.acquisitionSpend = state.biz.adSpend + (byCategory.marketing ?? 0) * HOUR_VALUE;
    return out;
  };

  /** Фаза 8: події. */
  const eventsPhase = ({ state, rng, meta }) => {
    const previous = state.history[state.history.length - 1];
    const growth = previous && previous.mrr > 0 ? state.biz.mrr / previous.mrr - 1 : 0;
    const ctx = { state, monthIndex: state.monthIndex, rng, growth };

    const table = EVENTS.map((event) => ({ ...event, weight: event.weightFor(ctx) })).filter(
      (event) => event.weight > 0,
    );

    const event = rollEvent(table, { ...ctx, idleWeight: IDLE_WEIGHT }, rng);
    if (!event) {
      meta.event = null;
      return [];
    }

    meta.event = {
      id: event.id,
      label: event.label,
      description: event.describe(ctx),
      codexRef: event.codexRef,
    };
    if (event.decision) meta.decision = event.decision(ctx);

    return (event.effects(ctx) ?? []).map((effect) =>
      makeEffect({ ...effect, source: `event:${event.id}` }),
    );
  };

  /** Фаза 10: вирок. Ефектів не дає — лише дивиться. */
  const verdictPhase = ({ state, meta }) => {
    meta.risks = risksFor(state);
    return [];
  };

  const engine = createEngine({
    initialState,
    phases: [
      actionsPhase,
      marketPhase,
      trafficPhase,
      funnelPhase,
      retentionPhase,
      financePhase,
      founderPhase,
      eventsPhase,
      metricsPhase,
      verdictPhase,
    ],
    limits: LIMITS,
    seed,
  });

  return {
    engine,

    /** Проживає місяць і повертає все потрібне для навчального розбору. */
    playMonth(selectedActions) {
      const before = engine.state;
      const monthIndex = before.monthIndex;
      const meta = {};

      const missed = findMissedActions(before, selectedActions);
      const turn = engine.advance({ actions: selectedActions, meta });

      const next = structuredClone(turn.state);

      // Маркери журналу пишуться щомісяця з того самого `risksFor`, що живить
      // панель попереджень. Саме з них розтин потім збирає ланцюг.
      for (const risk of meta.risks ?? []) {
        if (risk.severity !== "bad" || !risk.chainFor) continue;
        next.journal.push({
          ...risk,
          monthIndex,
          year: before.year,
          month: before.month,
          levelAtTime: before.analytics.level,
        });
      }

      next.monthLog.push({
        monthIndex,
        actions: selectedActions.map((action) => action.id),
        event: meta.event ?? null,
        missed: missed.map((action) => action.id),
        hoursSpent: meta.hoursSpent ?? 0,
        hoursAvailable: meta.hoursAvailable ?? 0,
      });

      next.history.push({
        monthIndex,
        mrr: next.biz.mrr,
        cash: next.biz.cash,
        customers: next.biz.customers,
        newCustomers: next.funnel.newCustomers,
        churned: next.funnel.churnedCustomers,
        visitors: next.funnel.visitors,
        trials: next.funnel.trials,
        netProfit: next.biz.netProfit,
        energy: next.founder.energy,
        spend: meta.acquisitionSpend ?? 0,
      });

      for (const action of selectedActions) {
        if (action.once) next.usedOnce.push(action.id);
      }

      if (meta.decision) next.pending = meta.decision;

      // Прапорці «на цей місяць» живуть рівно один хід.
      next.flags.communityActive = 0;
      next.flags.rested = 0;
      next.flags.trafficSpike = 0;
      next.flags.hoursPenaltyPct = 0;

      // Календар рухається окремо від ефектів: це не властивість бізнесу.
      if (monthIndex < TOTAL_MONTHS) {
        next.monthIndex = monthIndex + 1;
        next.month = ((next.monthIndex - 1) % 12) + 1;
        next.year = Math.floor((next.monthIndex - 1) / 12) + 1;
      }

      const verdict = judge(next);
      if (verdict) {
        next.verdict = verdict.over ? buildAutopsy(next, verdict) : verdict;
      }

      engine.setState(next);

      return {
        monthIndex,
        before,
        after: next,
        effects: turn.effects,
        event: meta.event ?? null,
        risks: meta.risks ?? [],
        missed,
        meta,
        verdict: next.verdict,
        isYearEnd: monthIndex % 12 === 0,
        isOver: Boolean(verdict?.over),
      };
    },
  };
}

/**
 * Важливі дії, які гравець не зробив.
 *
 * Без цього гра вчила б лише наслідкам зробленого. Але половина помилок
 * соло-розробника — це не те, що він зробив не так, а те, чого не зробив
 * узагалі, і саме ці пропуски найважче помітити самому.
 */
export function findMissedActions(state, chosen) {
  const chosenIds = new Set(chosen.map((action) => action.id));
  const chosenGroups = new Set(chosen.filter((a) => a.exclusiveGroup).map((a) => a.exclusiveGroup));
  const ctx = { state, month: state.month, monthIndex: state.monthIndex };

  return actionsFor(state)
    .filter((action) => action.important?.(ctx))
    .filter((action) => !chosenIds.has(action.id))
    .filter((action) => !action.requires?.(ctx))
    .filter((action) => !(action.exclusiveGroup && chosenGroups.has(action.exclusiveGroup)));
}

function categoryKey(category) {
  if (category === "market") return "marketing";
  if (category === "product") return "product";
  if (category === "validate") return "sales";
  if (category === "scenario") return "product";
  return "other";
}

export { ACTIONS_BY_ID, ACQUISITION_CATEGORIES };
