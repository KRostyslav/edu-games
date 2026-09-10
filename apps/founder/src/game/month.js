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
import { risksFor, judge, milestonesFor, buildAutopsy } from "./verdict.js";
import { hintedPicks } from "./strategy.js";
import { actionsFor, costOf, ACTIONS_BY_ID } from "../data/actions.data.js";
import { EVENTS, IDLE_WEIGHT } from "../data/events.data.js";

/** Категорії, години в яких вважаються витратами на залучення. */
const ACQUISITION_CATEGORIES = new Set(["market"]);

/**
 * Компактний знімок стану на початок місяця.
 *
 * `history` несе лише бізнес-числа: гроші, клієнтів, MRR. Нічого з того, що
 * пояснює ЧОМУ — ясності ЦА, техборгу, репутації в спільнотах — там немає,
 * і без цих двох десятків чисел фінальний розбір міг би лише переказувати
 * підсумок замість того, щоб показувати причину.
 */
function snapshotOf(state) {
  const r = Math.round;
  const { product: p, market: m, channels: c, biz: b, founder: f } = state;
  return {
    icp: r(m.icpClarity), interviews: r(m.interviews), positioning: r(m.positioning),
    trust: r(m.trust), awareness: r(m.awareness), competition: r(m.competition), tam: r(m.tam),
    anchor: r(m.anchorPrice),
    fit: r(p.fit), depth: r(p.depth), polish: r(p.polish), onboarding: r(p.onboarding),
    selfServe: r(p.selfServe), debt: r(p.techDebt), bugs: r(p.bugs), mvp: r(p.mvpProgress),
    seo: r(c.seoAsset), seoMature: r(c.seoMature), comm: r(c.communityRep), listings: r(c.listings),
    price: r(b.price), annualShare: r(b.annualShare), adSpend: r(b.adSpend),
    analytics: state.analytics.level, energy: r(f.energy), backlog: r(f.supportBacklog),
    hoursBase: r(f.hoursBase),
    hasProduct: state.flags.hasProduct, hasBilling: state.flags.hasBilling,
    churnPct: Math.round(state.metrics.churnPct * 10) / 10,
  };
}

/** Позначає в логу місяця, чим скінчилася пропозиція. */
function stampDecision(state, { accepted, offer }) {
  const last = state.monthLog[state.monthLog.length - 1];
  if (last) last.decision = { id: "acquisition", accepted, offer };
}

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

  /**
   * Відмова від пропозиції. Звичайна функція, а не метод: `playMonth` викликає її
   * сам, і залежність від `this` зламалася б на першому ж деструктуруванні.
   */
  function declineOffer() {
    const s = structuredClone(engine.state);
    if (s.pending?.id !== "acquisition") return;

    s.declinedOffers = [
      ...s.declinedOffers,
      { monthIndex: s.pending.monthIndex ?? s.monthIndex, offer: s.pending.offer },
    ];
    s.pending = null;
    stampDecision(s, { accepted: false, offer: s.declinedOffers[s.declinedOffers.length - 1].offer });
    engine.setState(s);
  }

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

    /**
     * Прийняти пропозицію про купівлю.
     *
     * `state.soldFor` пише лише ця функція. Єдиний автор — саме те, що робить
     * вирок надійним: UI не може оголосити продаж в обхід моделі.
     */
    acceptOffer() {
      const s = structuredClone(engine.state);
      if (s.pending?.id !== "acquisition") return null;

      s.soldFor = s.pending.offer;
      s.soldAt = s.monthIndex;
      s.biz.cash = Math.min(s.biz.cash + s.pending.offer, LIMITS["biz.cash"][1]);
      s.pending = null;
      stampDecision(s, { accepted: true, offer: s.soldFor });

      const verdict = judge(s);
      s.verdict = buildAutopsy(s, verdict);
      engine.setState(s);
      return s.verdict;
    },

    /** Відмовитися. Записуємо — саме відмова робить найкращий матеріал для розбору. */
    declineOffer,

    /** Зупинити партію достроково — після досягнення мети. */
    finishNow() {
      const s = structuredClone(engine.state);
      if (s.verdict?.over) return s.verdict;

      s.finishedAt = s.monthIndex;
      const verdict = judge(s);
      if (!verdict) return null;
      s.verdict = buildAutopsy(s, verdict);
      engine.setState(s);
      return s.verdict;
    },

    /** Запам'ятати, що вибір «грати далі» вже пропонували. */
    markGoalOffered() {
      const s = structuredClone(engine.state);
      s.milestones = { ...s.milestones, goalOffered: true };
      engine.setState(s);
    },

    /** Проживає місяць і повертає все потрібне для навчального розбору. */
    playMonth(selectedActions) {
      const before = engine.state;

      // Єдине місце, яке справді гарантує кінець партії. Дві умови, а не одна:
      // друга тримає навіть тоді, коли вирок якось не проставився. Нічого не
      // мутується, тому monthLog фізично не може перевищити 36 — байдуже, що
      // робить UI. Саме відсутність цієї перевірки давала нескінченний 36-й місяць.
      if (before.verdict?.over || before.monthLog.length >= TOTAL_MONTHS) {
        return {
          monthIndex: before.monthIndex,
          before,
          after: before,
          effects: [],
          event: null,
          risks: [],
          missed: [],
          meta: {},
          verdict: before.verdict,
          milestones: [],
          isYearEnd: false,
          isOver: true,
          noop: true,
        };
      }

      // Пропозиція, на яку не відповіли до дедлайну, вважається відхиленою:
      // інакше перезавантаження в невдалий момент замкнуло б гру назавжди.
      if (before.pending && before.monthIndex > (before.pending.deadline ?? Infinity)) {
        declineOffer();
      }

      const monthIndex = engine.state.monthIndex;
      const meta = {};
      const available = hoursFor(engine.state);
      // Що гра сама позначала важливим цього місяця — записуємо ЗАРАЗ, поки
      // стан ще той. Інакше фінальний розбір мусив би відтворювати партію
      // заново й ламався б від будь-якої зміни балансу.
      const hinted = hintedPicks(engine.state).map((action) => action.id);
      const costs = selectedActions.map((action) => costOf(action, engine.state, available));
      const snap = snapshotOf(engine.state);

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
        // Три поля нижче існують лише заради фінального розбору. Разом це
        // близько трьох кілобайт за партію — і вони роблять розбір точним
        // назавжди, а не «поки ніхто не змінював баланс».
        snap,
        hinted,
        costs,
        decision: null,
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

      // Дедлайн у події справжній: вона сама каже «відповісти треба до наступного місяця».
      if (meta.decision) next.pending = { ...meta.decision, monthIndex, deadline: monthIndex + 1 };

      // Досягнуте проставляється ДО вироку й ніколи не скидається.
      if (next.achieved.salary == null && next.biz.salaryMonths >= 6) next.achieved.salary = monthIndex;
      if (next.achieved.ramen == null && next.biz.ramenMonths >= 6) next.achieved.ramen = monthIndex;

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
        // Постійний запобіжник: судити можна лише остаточно. Якщо колись знову
        // спробують повернути звідси м'який стан, це впаде на першому ж ході.
        if (verdict.over !== true) {
          throw new Error(`judge() повернув нефінальний вирок: ${verdict.code}`);
        }
        next.verdict = buildAutopsy(next, verdict);
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
        milestones: milestonesFor(next),
        isYearEnd: monthIndex % 12 === 0 && !verdict,
        isOver: Boolean(verdict),
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
