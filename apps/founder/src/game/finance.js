/**
 * Гроші, ви самі й метрики.
 *
 * Фінанси стоять шостою фазою з десяти, і сам порядок є твердженням: виручка —
 * це наслідок, а не важіль. У грі немає жодної дії, яка піднімає MRR. Є лише
 * дії, що піднімають те, з чого MRR рахується.
 */

import { makeEffect } from "@edu/sim-core";
import { INFRA, PROCESSOR, TAX, BENCHMARKS, SUPPORT_MAX_SHARE } from "../data/economics.js";
import { n, scenarioOf, supportDemand, hoursFor } from "./model.js";

const round1 = (value) => Math.round(value * 10) / 10;
const money = (value) => `$${Math.round(value).toLocaleString("uk-UA")}`;
const pct = (value) => `${round1(value * 100)}%`;

/**
 * Умовна вартість вашої години.
 *
 * Потрібна, щоб CAC не був нулем у того, хто залучає контентом. Соло-розробник
 * зазвичай вважає, що написати статтю «безкоштовно», — і саме тому не помічає,
 * що канал не окупається.
 */
export const HOUR_VALUE = 25;

const setTo = (state, path, value, reason, source, tone) => {
  const current = path.split(".").reduce((acc, key) => acc?.[key], state);
  return makeEffect({ target: path, delta: value - current, reason, source, tone });
};

// ─────────────────────────── фаза 6: гроші ───────────────────────────

export function financePhase({ state, meta }) {
  const out = [];
  const source = "finance";
  const { biz, product, flags } = state;
  const scenario = scenarioOf(state);

  const arpu =
    biz.price * (0.92 + 0.2 * Math.min(1, product.depth / 80)) * (1 - 0.12 * n(biz.annualShare));
  const mrr = biz.customers * arpu;

  const processorFee = mrr * PROCESSOR.rate + biz.customers * PROCESSOR.perTransaction;
  const tax = mrr * TAX.rate;
  const infra = INFRA.base + biz.customers * INFRA.perCustomer * (1 + product.techDebt / INFRA.debtPenalty);
  const netProfit = mrr - processorFee - tax - TAX.socialFixed - infra - biz.adSpend - biz.toolCost;

  out.push(
    setTo(state, "biz.arpu", arpu, `Середній чек ${money(arpu)} з клієнта на місяць`, source, "neutral"),
  );

  out.push(
    setTo(
      state,
      "biz.mrr",
      mrr,
      `MRR = ${biz.customers} клієнтів × ${money(arpu)} = ${money(mrr)}`,
      source,
      mrr > biz.mrr ? "good" : mrr < biz.mrr ? "bad" : "neutral",
    ),
  );

  out.push(
    setTo(
      state,
      "biz.infraCost",
      infra,
      `Інфраструктура ${money(infra)}: база ${money(INFRA.base)} плюс ${money(INFRA.perCustomer)} на клієнта${
        product.techDebt > 30 ? `, з надбавкою ${pct(product.techDebt / INFRA.debtPenalty)} за технічний борг` : ""
      }`,
      source,
      "neutral",
    ),
  );

  out.push(
    setTo(
      state,
      "biz.netProfit",
      netProfit,
      mrr === 0
        ? `Прибутку немає, а витрати є: ${money(-netProfit)} на місяць. Інфраструктура ${money(infra)}, інструменти ${money(biz.toolCost)}, ЄСВ ${money(TAX.socialFixed)}${biz.adSpend > 0 ? `, реклама ${money(biz.adSpend)}` : ""}`
        : `Чисто в кишеню ${money(netProfit)}. З ${money(mrr)} виручки: платіжна система ${money(processorFee)} (${pct(
            processorFee / mrr,
          )}), податок ${money(tax)}, ЄСВ ${money(TAX.socialFixed)}, інфраструктура ${money(infra)}, інструменти ${money(
            biz.toolCost,
          )}${biz.adSpend > 0 ? `, реклама ${money(biz.adSpend)}` : ""}`,
      source,
      netProfit > 0 ? "good" : "bad",
    ),
  );

  // Комісія merchant of record б'є по дешевих тарифах непропорційно:
  // 5% + $0.50 на тарифі $9 — це 10.5% виручки, а на $49 — 5.9%.
  if (mrr > 0 && processorFee / mrr > 0.08) {
    out.push(
      makeEffect({
        target: "biz.mrr",
        delta: 0,
        reason: `Платіжна система з'їдає ${pct(processorFee / mrr)} виручки. Фіксовані ${money(
          PROCESSOR.perTransaction,
        )} за транзакцію на тарифі ${money(biz.price)} — це і є справжня ціна дешевого плану`,
        source,
        tone: "bad",
      }),
    );
  }

  // Заморожені виплати: гроші зароблені, але їх у вас немає.
  if (flags.holdMonths > 0) {
    out.push(
      makeEffect({
        target: "flags.holdMonths",
        delta: -1,
        reason: "Ще місяць очікування розблокування виплат",
        source,
        tone: "neutral",
      }),
    );
    if (flags.holdMonths <= 1 && flags.heldPayout > 0) {
      out.push(
        makeEffect({
          target: "biz.cash",
          delta: flags.heldPayout,
          reason: `Платіжна система розблокувала ${money(flags.heldPayout)}`,
          source,
          tone: "good",
        }),
        makeEffect({
          target: "flags.heldPayout",
          delta: -flags.heldPayout,
          reason: "Заморожену суму повернуто",
          source,
          tone: "good",
        }),
      );
    }
  }

  const cashDelta = netProfit - biz.personalBurn + biz.outsideIncome;
  out.push(
    makeEffect({
      target: "biz.cash",
      delta: cashDelta,
      reason: `${cashDelta >= 0 ? "На рахунку побільшало" : "З рахунку пішло"} ${money(
        Math.abs(cashDelta),
      )}: прибуток ${money(netProfit)} мінус життя ${money(biz.personalBurn)}${
        biz.outsideIncome > 0 ? ` плюс сторонній дохід ${money(biz.outsideIncome)}` : ""
      }`,
      source,
      tone: cashDelta >= 0 ? "good" : "bad",
    }),
  );

  if (biz.adSpend > 0) {
    out.push(
      makeEffect({
        target: "biz.cumSpend",
        delta: biz.adSpend,
        reason: "Накопичені витрати на рекламу — з них рахується CAC",
        source,
        tone: "neutral",
      }),
    );
  }

  // Лічильники «скільки місяців поспіль» — саме вони, а не разовий пік, є перемогою.
  const ramenHit = netProfit >= biz.personalBurn;
  const salaryHit = netProfit >= biz.salaryTarget;

  out.push(
    setTo(
      state,
      "biz.ramenMonths",
      ramenHit ? biz.ramenMonths + 1 : 0,
      ramenHit
        ? `Продукт покриває ваше життя ${biz.ramenMonths + 1}-й місяць поспіль (${money(netProfit)} проти ${money(biz.personalBurn)})`
        : biz.ramenMonths > 0
          ? "Серія перервалася: цього місяця продукт не покрив ваших витрат"
          : "Продукт поки не покриває ваших витрат",
      source,
      ramenHit ? "good" : "bad",
    ),
  );

  out.push(
    setTo(
      state,
      "biz.salaryMonths",
      salaryHit ? biz.salaryMonths + 1 : 0,
      salaryHit
        ? `Продукт замінює зарплату ${biz.salaryMonths + 1}-й місяць поспіль. Потрібно шість`
        : biz.salaryMonths > 0
          ? "Серія перервалася: до рівня зарплати цього місяця не дотягнули"
          : `До рівня зарплати ${money(biz.salaryTarget)} ще далеко`,
      source,
      salaryHit ? "good" : "neutral",
    ),
  );

  meta.finance = { arpu, mrr, processorFee, tax, infra, netProfit, cashDelta, scenario };
  return out;
}

// ─────────────────────────── фаза 7: ви самі ───────────────────────────

export function founderPhase({ state, meta }) {
  const out = [];
  const source = "founder";
  const { founder, product, biz, metrics } = state;
  const scenario = scenarioOf(state);

  // Підтримка: скільки просили і скільки ви встигли.
  const demand = supportDemand(state);
  const paid = Math.min(demand, SUPPORT_MAX_SHARE * founder.hoursBase);
  const overflow = demand - paid;

  if (biz.customers > 0) {
    out.push(
      makeEffect({
        target: "founder.supportBacklog",
        delta: overflow > 0 ? overflow * 3 : -12,
        reason:
          overflow > 0
            ? `Звернень на ${Math.round(demand)} год, а більше ${Math.round(paid)} год ви фізично не витягуєте. Ріст сам створює навантаження, яке з'їдає години, потрібні для росту`
            : `Усі звернення розібрані: ${Math.round(demand)} год підтримки вкладаються в бюджет`,
        source,
        tone: overflow > 0 ? "bad" : "good",
      }),
    );
  }

  // Енергія. Спринтувати можна рік, а не три.
  const hoursAvailable = hoursFor(state);
  const loadRatio = hoursAvailable > 0 ? (meta.hoursSpent ?? 0) / hoursAvailable : 0;
  // Поріг навмисно низький: «повний робочий місяць без залишку» — це вже
  // переробіток, а не норма. Запас у пару вільних годин і є тим, що дозволяє
  // тримати темп роками, а не місяцями.
  const overwork = Math.max(0, loadRatio - 0.7) / 0.3;
  // Нижче 25 ви фізично перестаєте намагатися — і саме це робить спіраль
  // вигорання виживною, якщо її помітити. Свідомий відпочинок дає те саме вдвічі дешевше.
  const brake = (founder.energy < 25 ? 0.5 : 1) * (state.flags.rested ? 0.5 : 1);

  const recent = state.history.slice(-3).map((entry) => entry.mrr);
  const flat = recent.length === 3 && recent[2] <= recent[0] * 1.02 && biz.customers > 0;
  const peak = Math.max(0, ...state.history.map((entry) => entry.mrr));
  const newHigh = biz.mrr > peak && biz.mrr > 0;

  const parts = [];
  let delta = 4;
  parts.push("відпочинок вихідних +4");

  if (overwork > 0) {
    const cost = 15 * Math.min(1, overwork) * brake;
    delta -= cost;
    parts.push(`переробіток −${round1(cost)}`);
  }
  if (founder.supportBacklog > 0) {
    const cost = 0.08 * founder.supportBacklog;
    delta -= cost;
    parts.push(`невідповіді клієнтам −${round1(cost)}`);
  }
  if (flat) {
    delta -= 4;
    parts.push("три місяці без руху −4");
  }
  if (newHigh) {
    delta += 3;
    parts.push("новий рекорд MRR +3");
  }
  if (metrics.runwayMonths < 3) {
    delta -= 3;
    parts.push("гроші закінчуються −3");
  }
  if (scenario.energyDrain > 0) {
    delta -= scenario.energyDrain;
    parts.push(`друга робота −${scenario.energyDrain}`);
  }

  out.push(
    makeEffect({
      target: "founder.energy",
      delta,
      reason: `${parts.join(", ")}. ${
        founder.energy + delta < 30
          ? "Нижче тридцяти кожна дія коштує дорожче, а годин стає менше — спіраль затягується"
          : "Енергія — це не настрій, а множник до всіх ваших годин"
      }`,
      source,
      tone: delta >= 0 ? "good" : "bad",
    }),
  );

  // Борг і баги наростають самі — навіть коли ви нічого не ламали.
  out.push(
    makeEffect({
      target: "product.techDebt",
      delta: 0.8,
      reason: "Код старіє й без вас: залежності виходять з підтримки, обхідні рішення обростають новими",
      source,
      tone: "bad",
    }),
  );

  if (state.flags.hasProduct) {
    out.push(
      makeEffect({
        target: "product.bugs",
        delta: 1.5 + product.techDebt / 25,
        reason:
          product.techDebt > 40
            ? `Нові баги знаходяться швидше, ніж раніше: борг ${Math.round(product.techDebt)}/100 робить кожну зміну ризикованішою`
            : "Клієнти знаходять те, чого ви не передбачили",
        source,
        tone: "bad",
      }),
    );
  }

  // Навички згасають без практики — і саме тому «потім перекваліфікуюсь у маркетолога» не працює.
  for (const [key, category] of [
    ["skillProduct", "product"],
    ["skillMarketing", "marketing"],
    ["skillSales", "sales"],
  ]) {
    const spent = meta.hoursByCategory?.[category] ?? 0;
    if (spent === 0 && founder[key] > 5) {
      out.push(
        makeEffect({
          target: `founder.${key}`,
          delta: -0.3,
          reason: "Навичка без практики повільно згасає",
          source,
          tone: "neutral",
        }),
      );
    }
  }

  meta.loadRatio = loadRatio;
  return out;
}

// ─────────────────────────── фаза 9: метрики ───────────────────────────

export function metricsPhase({ state, meta }) {
  const out = [];
  const source = "metrics";
  const { biz, funnel, metrics } = state;

  const churn = meta.churnExisting ?? 0;
  const arpu = biz.arpu;
  const mrrNew = funnel.newCustomers * arpu;

  const processorFee = biz.mrr * PROCESSOR.rate + biz.customers * PROCESSOR.perTransaction;
  const grossMargin = biz.mrr > 0 ? 1 - (processorFee + biz.infraCost) / biz.mrr : 0;

  // CAC рахуємо ковзним вікном у три місяці: один місяць занадто шумний,
  // а рішення «вимкнути канал» приймають не за одним місяцем.
  const window = [...state.history.slice(-2), { spend: meta.acquisitionSpend ?? 0, newCustomers: funnel.newCustomers }];
  const spendSum = window.reduce((sum, entry) => sum + (entry.spend ?? 0), 0);
  const newSum = window.reduce((sum, entry) => sum + (entry.newCustomers ?? 0), 0);
  const cac = newSum > 0 ? spendSum / newSum : 0;

  const ltv = churn > 0 ? (arpu * grossMargin) / churn : 0;
  const payback = arpu * grossMargin > 0 ? cac / (arpu * grossMargin) : 0;
  const ceiling = churn > 0 ? mrrNew / churn : 0;

  const cashDelta = meta.finance?.cashDelta ?? 0;
  const runway = cashDelta < 0 ? Math.min(600, biz.cash / -cashDelta) : 600;

  out.push(
    setTo(
      state,
      "metrics.churnPct",
      churn * 100,
      `Відтік ${pct(churn)} на місяць. ${churnVerdict(churn * 100)}`,
      source,
      churn * 100 <= BENCHMARKS.churnOk ? "good" : "bad",
    ),
  );

  out.push(
    setTo(
      state,
      "metrics.visitorTrialPct",
      (meta.trialRate ?? 0) * 100,
      `З кожної сотні відвідувачів пробують ${round1((meta.trialRate ?? 0) * 100)}. Норма для B2B-лендінга — 1–5`,
      source,
      "neutral",
    ),
  );

  out.push(
    setTo(
      state,
      "metrics.trialPaidPct",
      (meta.paidRate ?? 0) * 100,
      `З тих, хто спробував, платять ${round1((meta.paidRate ?? 0) * 100)}%. Норма для тріалу без картки — 8–15%`,
      source,
      "neutral",
    ),
  );

  out.push(
    setTo(
      state,
      "metrics.cac",
      cac,
      newSum === 0
        ? "Клієнтів не було — рахувати вартість залучення нема з чого"
        : `Клієнт коштує ${money(cac)}: ${money(spendSum)} за три місяці на ${newSum} нових. У витрати входить і ваш час на маркетинг за ${money(
            HOUR_VALUE,
          )}/год — контент не безкоштовний, він оплачений годинами, які ви могли продати`,
      source,
      "neutral",
    ),
  );

  out.push(
    setTo(
      state,
      "metrics.ltv",
      ltv,
      churn * 100 > BENCHMARKS.ltvUnreliableChurn
        ? `LTV не показуємо: при відтоку ${pct(churn)} формула ARPU/відтік завищує його в рази. Вона припускає, що клієнти йдуть рівномірно, а насправді більшість іде в перші місяці — і чим гірші справи, тим сильніше формула бреше на вашу користь`
        : `Клієнт принесе ${money(ltv)} за весь час: ${money(arpu)} × маржа ${pct(grossMargin)} / відтік ${pct(churn)}`,
      source,
      "neutral",
    ),
  );

  out.push(
    setTo(
      state,
      "metrics.ltvCac",
      cac > 0 ? ltv / cac : 0,
      cac > 0
        ? `LTV:CAC = ${round1(ltv / cac)}. Нижче ${BENCHMARKS.ltvCacTarget} юніт-економіка не сходиться: ви платите за клієнта більше, ніж він принесе`
        : "Співвідношення LTV:CAC порахувати нема з чого",
      source,
      cac > 0 && ltv / cac >= BENCHMARKS.ltvCacTarget ? "good" : "neutral",
    ),
  );

  out.push(
    setTo(
      state,
      "metrics.paybackMonths",
      Math.min(600, payback),
      payback > 0
        ? `Залучення окупається за ${round1(payback)} міс. Орієнтир — не більше ${BENCHMARKS.paybackTarget}`
        : "Окупність залучення порахувати нема з чого",
      source,
      payback > 0 && payback <= BENCHMARKS.paybackTarget ? "good" : "neutral",
    ),
  );

  out.push(
    setTo(
      state,
      "metrics.mrrCeiling",
      ceiling,
      ceiling > 0
        ? `Стеля MRR ${money(ceiling)}. Це не прогноз, а арифметика: ${money(mrrNew)} нового MRR за місяць поділити на відтік ${pct(
            churn,
          )}. При теперішньому залученні й теперішньому відтоку ви сходитеся сюди — і ніщо цього місяця цього не змінить, якщо не змінить одне з цих двох чисел`
        : "Стелі поки немає: нових клієнтів не було",
      source,
      "neutral",
    ),
  );

  out.push(
    setTo(
      state,
      "metrics.runwayMonths",
      runway,
      cashDelta >= 0
        ? "Гроші не закінчуються: місяць вийшов у плюс"
        : `Грошей вистачить на ${round1(runway)} міс за теперішнього мінуса ${money(-cashDelta)}/міс`,
      source,
      runway > 6 ? "good" : "bad",
    ),
  );

  out.push(
    setTo(
      state,
      "metrics.topCustomerShare",
      biz.customers > 0 ? Math.min(60, 45 / Math.sqrt(biz.customers)) : 0,
      biz.customers > 0
        ? `На найбільшого клієнта припадає близько ${Math.round(Math.min(60, 45 / Math.sqrt(biz.customers)))}% виручки`
        : "Клієнтів немає",
      source,
      "neutral",
    ),
  );

  meta.metrics = { cac, ltv, payback, ceiling, grossMargin, mrrNew, runway };
  return out;
}

function churnVerdict(value) {
  if (value <= BENCHMARKS.churnGood) return "Це дуже добре: клієнти лишаються";
  if (value <= BENCHMARKS.churnOk) return "Це здорова норма для self-serve SaaS";
  if (value <= BENCHMARKS.churnBad) return "Це вже багато: половина бази оновлюється за пів року";
  return "Це відро без дна: скільки не наливай, витікає швидше";
}
