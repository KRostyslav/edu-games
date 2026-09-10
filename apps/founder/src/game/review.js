/**
 * Розбір партії.
 *
 * Мета — не переказати підсумок, а показати причину: у якому місяці все
 * вирішилося, куди насправді пішли години і що гра сама позначала важливим
 * тоді, коли ви цього не зробили.
 *
 * Три правила, яких тут дотримано скрізь:
 *   1) кожен пункт несе ЧИСЛО з партії, а не загальну фразу;
 *   2) поради рендеряться з реєстру дій (`why`, `timing`, `missed`), ніколи
 *      власною прозою — тому вони фізично не можуть суперечити картці, яку
 *      гравець бачив тоді;
 *   3) чого порахувати не можна — того не показуємо, а не вгадуємо.
 *
 * Функція чиста й без DOM: харнес будує розбір під node і перевіряє його.
 */

import { TOTAL_MONTHS } from "./model.js";
import { SCENARIOS } from "../data/scenarios.js";
import { ACTIONS_BY_ID, CATEGORY_LABELS } from "../data/actions.data.js";
import { BENCHMARKS } from "../data/economics.js";
import { detectStrengths, detectMistakes } from "./reviewItems.js";

const num = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const sum = (list, pick = (x) => x) => list.reduce((acc, item) => acc + num(pick(item)), 0);
const share = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

/**
 * Терміновість категорії у зважуванні проігнорованих підказок.
 *
 * Валідація компаундується й найдешевша саме на початку; аналітика — ворота до
 * всіх інших чисел; у контенту лаг, тому «пізно» не дорівнює «те саме».
 * Продукт найнижчий: майже все в ньому відкатне.
 */
const URGENCY = {
  validate: 1.4,
  analytics: 1.3,
  market: 1.2,
  self: 1.2,
  price: 1.0,
  scenario: 1.0,
  product: 0.8,
};

/**
 * Етапи. Жодна межа не вигадана — кожна читається з порогу, який уже є в коді,
 * тому етапи не можуть розійтися з моделлю.
 */
const STAGES = [
  {
    id: "find",
    label: "Знайти проблему",
    from: 1,
    to: 6,
    purpose: "Зрозуміти, кому це треба, поки це ще дешево.",
    boundary: "MVP стає «важливим» лише від ясності ЦА 35; ризик «будуєте наосліп» вмикається на 4-му місяці, «граєте без аналітики» — на 6-му.",
  },
  {
    id: "first",
    label: "Перші клієнти й перший канал",
    from: 7,
    to: 12,
    purpose: "Довести, що хтось платить, і почати будувати канал.",
    boundary: "Ризик «немає дистрибуції» вмикається на 8-му; «немає клієнтів» стає критичним на 10-му при менш ніж трьох клієнтах — це власне визначення гри.",
  },
  {
    id: "grow",
    label: "Ріст і діряве відро",
    from: 13,
    to: 24,
    purpose: "Рости швидше, ніж витікає.",
    boundary: "Тут віддає лаг SEO і вперше стає видно відтік: розмова з тими, хто пішов, потребує трьох втрачених, а події воронки — п'ятнадцяти клієнтів.",
  },
  {
    id: "ceiling",
    label: "Стеля, ціна, гроші",
    from: 25,
    to: 36,
    purpose: "Упертися в стелю й побачити, що її піднімає ціна, а не години.",
    boundary: "Шестимісячна серія мусить початися до 31-го місяця, тож із 25-го «чи я встигаю» стає питанням із відповіддю так/ні.",
  },
];

export function buildReview(state) {
  const log = state.monthLog ?? [];
  const hist = state.history ?? [];
  const scenario = SCENARIOS[state.scenarioId];
  const monthsPlayed = log.length;

  const snaps = log.map((entry) => entry.snap ?? null);
  const hasSnaps = snaps.some(Boolean);

  const ctx = {
    state,
    log,
    hist,
    snaps,
    hasSnaps,
    scenario,
    monthsPlayed,
    /** Знімок стану на початок місяця (1-based) або null. */
    snapAt: (monthIndex) => snaps[monthIndex - 1] ?? null,
    /** Останній відомий знімок не пізніше вказаного місяця. */
    snapUpTo: (monthIndex) => {
      for (let i = Math.min(monthIndex, snaps.length) - 1; i >= 0; i -= 1) {
        if (snaps[i]) return snaps[i];
      }
      return null;
    },
    at: (monthIndex) => hist[monthIndex - 1] ?? null,
    /** Скільки місяців містили цю дію у вказаному вікні. */
    countOf: (id, from = 1, to = TOTAL_MONTHS) =>
      log.filter((e) => e.monthIndex >= from && e.monthIndex <= to && e.actions.includes(id)).length,
    firstMonthOf: (id) => log.find((e) => e.actions.includes(id))?.monthIndex ?? null,
    longestRun: (id) => longestRun(log.map((e) => e.actions.includes(id))),
    journalOf: (code) => (state.journal ?? []).filter((m) => m.code === code),
  };

  const hours = buildHours(ctx);
  const ignored = buildIgnored(ctx);
  ctx.hours = hours;
  ctx.ignored = ignored;

  return {
    meta: {
      scenarioId: state.scenarioId,
      scenarioName: scenario?.name ?? state.scenarioId,
      monthsPlayed,
      endedEarly: monthsPlayed < TOTAL_MONTHS,
      source: hasSnaps ? "snapshot" : "derived",
    },
    headline: buildHeadline(ctx),
    grades: buildGrades(ctx),
    stages: buildStages(ctx),
    strengths: detectStrengths(ctx),
    mistakes: detectMistakes(ctx),
    hours,
    moments: buildMoments(ctx),
    ignored: ignored.slice(0, 5),
  };
}

// ─────────────────────────── заголовок і дуга ───────────────────────────

function buildHeadline(ctx) {
  const { state, hist, scenario } = ctx;
  const verdict = state.verdict ?? {};
  const biz = state.biz;

  return {
    code: verdict.code ?? "stalled",
    kind: verdict.kind ?? "partial",
    cause: verdict.cause ?? "Партія триває",
    reason: verdict.reason ?? "",
    endedAt: ctx.monthsPlayed,
    finishedEarly: state.finishedAt != null,
    numbers: [
      { label: "Місяців зіграно", value: `${ctx.monthsPlayed} з ${TOTAL_MONTHS}` },
      { label: "MRR наприкінці", value: money(biz.mrr) },
      { label: "Клієнтів", value: String(biz.customers) },
      { label: "Чистий прибуток", value: money(biz.netProfit) },
      { label: "Грошей на рахунку", value: money(biz.cash) },
      { label: "Усього залучено", value: String(biz.cumNew) },
      { label: "Усього втрачено", value: String(biz.cumChurned) },
      { label: "Витрачено годин", value: String(Math.round(ctx.hours.spent)) },
    ],
    goal: {
      target: biz.salaryTarget,
      burn: biz.personalBurn,
      reachedAt: state.achieved?.salary ?? null,
      ramenAt: state.achieved?.ramen ?? null,
      monthsAbove: hist.filter((h) => h.netProfit >= biz.salaryTarget).length,
    },
    // Дуга: MRR і енергія на одній осі часу. Обидві серії вже є в історії.
    arc: hist.map((h) => ({
      monthIndex: h.monthIndex,
      mrr: Math.round(num(h.mrr)),
      netProfit: Math.round(num(h.netProfit)),
      customers: num(h.customers),
      energy: Math.round(num(h.energy)),
    })),
    scenario: { name: scenario?.name ?? "", subtitle: scenario?.subtitle ?? "" },
  };
}

// ─────────────────────────── куди пішли години ───────────────────────────

/**
 * Еталонний розподіл годин. Це смуга ±7 пунктів, а не ціль: інакше секція
 * лаяла б усіх, а це нічого не вчить. Кожне число аргументоване вартістю
 * відповідних дій і твердженнями балансового прогону.
 */
const REFERENCE = {
  validate: 15,
  product: 35,
  market: 30,
  price: 2,
  analytics: 2,
  self: 14,
  scenario: 2,
};

const BAND = 7;

function buildHours(ctx) {
  const byCategory = {};
  let spent = 0;
  let idle = 0;

  for (const entry of ctx.log) {
    for (let i = 0; i < entry.actions.length; i += 1) {
      const action = ACTIONS_BY_ID[entry.actions[i]];
      if (!action) continue;
      // Точна вартість, якщо її записали; інакше номінальна з реєстру.
      const cost = entry.costs?.[i] ?? action.laborCost ?? 0;
      byCategory[action.category] = (byCategory[action.category] ?? 0) + cost;
      spent += cost;
    }
    idle += Math.max(0, num(entry.hoursAvailable) - num(entry.hoursSpent));
  }

  // Фріланс — премиса сценарію, а не провал: замовлення там законно займають години.
  const reference = { ...REFERENCE };
  if (ctx.state.scenarioId === "freelance") {
    reference.product -= 8;
    reference.scenario += 8;
  }

  const rows = Object.keys(CATEGORY_LABELS).map((category) => {
    const value = byCategory[category] ?? 0;
    const actual = share(value, spent);
    const ref = reference[category] ?? 0;
    const drift = actual - ref;
    return {
      category,
      label: CATEGORY_LABELS[category],
      hours: Math.round(value),
      sharePct: actual,
      referencePct: ref,
      drift: Math.round(drift * 10) / 10,
      status: Math.abs(drift) <= BAND ? "ok" : drift > 0 ? "high" : "low",
    };
  });

  rows.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

  return {
    spent: Math.round(spent),
    idle: Math.round(idle),
    // Невитрачені години точно збережені й часто найпромовистіше число партії.
    idlePct: share(idle, spent + idle),
    rows,
    worst: rows[0]?.status !== "ok" ? rows[0] : null,
  };
}

// ─────────────────────── проігноровані підказки ───────────────────────

/**
 * Що гра позначала важливим і чого гравець не зробив.
 *
 * Вага надлінійна за довжиною серії: три розкидані пропуски дають 3.0, одна
 * безперервна трійка — 5.2. Стала серія — це патерн, розкидані — шум, і розбір
 * має називати саме патерн.
 */
function buildIgnored(ctx, from = 1, to = TOTAL_MONTHS) {
  const byAction = new Map();

  for (const entry of ctx.log) {
    if (entry.monthIndex < from || entry.monthIndex > to) continue;
    const chosen = new Set(entry.actions);
    // `hinted` записується під час гри; для старих збережень лишається `missed`,
    // який вужчий — він не включає рутину й не підганяється під бюджет годин.
    const suggested = entry.hinted ?? entry.missed ?? [];
    for (const id of suggested) {
      if (chosen.has(id)) continue;
      if (!byAction.has(id)) byAction.set(id, []);
      byAction.get(id).push(entry.monthIndex);
    }
  }

  const out = [];
  for (const [id, months] of byAction) {
    const action = ACTIONS_BY_ID[id];
    if (!action) continue;
    const runs = toRuns(months);
    const weight = (URGENCY[action.category] ?? 1) * sum(runs, (r) => (r[1] - r[0] + 1) ** 1.5);
    out.push({
      actionId: id,
      label: action.label,
      category: action.category,
      months,
      runs,
      longest: Math.max(...runs.map((r) => r[1] - r[0] + 1)),
      weight: Math.round(weight * 10) / 10,
      why: action.why,
      timing: action.timing,
      detail: action.missed ?? action.risk,
      codexRef: action.codexRef ?? null,
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}

// ─────────────────────────── етапи ───────────────────────────

function buildStages(ctx) {
  return STAGES.map((stage) => {
    const played = ctx.monthsPlayed >= stage.from;
    if (!played) {
      return { ...stage, played: false, verdict: null, criterion: "", facts: [], hours: null, oneThing: null, ignored: [] };
    }

    const to = Math.min(stage.to, ctx.monthsPlayed);
    const entries = ctx.log.filter((e) => e.monthIndex >= stage.from && e.monthIndex <= to);
    const ignored = buildIgnored(ctx, stage.from, to).slice(0, 3);
    const assessed = assessStage(stage.id, ctx, stage.from, to);

    return {
      ...stage,
      played: true,
      to,
      partial: to < stage.to,
      hours: stageHours(entries),
      facts: assessed.facts,
      verdict: assessed.verdict,
      criterion: assessed.criterion,
      ignored,
      oneThing: ignored[0] ?? fallbackAdvice(assessed.weakest),
    };
  });
}

function stageHours(entries) {
  const byCategory = {};
  let spent = 0;
  for (const entry of entries) {
    for (let i = 0; i < entry.actions.length; i += 1) {
      const action = ACTIONS_BY_ID[entry.actions[i]];
      if (!action) continue;
      const cost = entry.costs?.[i] ?? action.laborCost ?? 0;
      byCategory[action.category] = (byCategory[action.category] ?? 0) + cost;
      spent += cost;
    }
  }
  const top = Object.entries(byCategory)
    .map(([category, hoursValue]) => ({
      category,
      label: CATEGORY_LABELS[category],
      hours: Math.round(hoursValue),
      sharePct: share(hoursValue, spent),
    }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 3);
  return { spent: Math.round(spent), top };
}

function assessStage(id, ctx, from, to) {
  const snap = ctx.snapUpTo(to);
  const end = ctx.at(to);
  const facts = [];

  if (id === "find") {
    const interviews = ctx.countOf("customer_interviews", from, to);
    const landing = ctx.countOf("landing_smoke_test", from, to) > 0;
    const buildMonth = ctx.firstMonthOf("build_mvp");
    const icpAtBuild = buildMonth ? ctx.snapAt(buildMonth)?.icp ?? null : null;

    facts.push({ label: "Місяців з інтерв'ю", value: String(interviews) });
    facts.push({ label: "Лендінг-перевірка", value: landing ? "так" : "ні" });
    if (snap) facts.push({ label: "Ясність ЦА наприкінці етапу", value: `${snap.icp}/100` });
    if (buildMonth) facts.push({ label: "MVP почали на місяці", value: String(buildMonth) });

    const blind = icpAtBuild != null && icpAtBuild < 35;
    const failed = (snap && snap.icp < 35) || blind || (interviews === 0 && !landing);
    const good = interviews >= 2 && landing && (!snap || snap.icp >= 50);

    return {
      verdict: failed ? "failed" : good ? "good" : "mixed",
      weakest: failed || !good ? "customer_interviews" : null,
      criterion: snap
        ? `Ясність ЦА на ${to}-му місяці: ${snap.icp}/100. Гра дозволяє братися за MVP з 35, здоровий рівень — 50. Інтерв'ю: ${interviews} міс.${blind ? ` MVP почали при ${icpAtBuild}/100 — саме це визначає, скільки фіту він дасть.` : ""}`
        : `Інтерв'ю: ${interviews} міс, лендінг-перевірка: ${landing ? "була" : "ні"}. До розробки це коштує тижні, після — місяці.`,
      facts,
    };
  }

  if (id === "first") {
    const customers = num(end?.customers);
    const mrr = num(end?.mrr);
    const analytics = snap?.analytics ?? (ctx.firstMonthOf("install_analytics") != null ? 1 : 0);
    const marketMonths = ctx.log.filter(
      (e) => e.monthIndex >= from && e.monthIndex <= to &&
        e.actions.some((a) => ACTIONS_BY_ID[a]?.category === "market"),
    ).length;
    const channel = snap ? Math.max(snap.seo, snap.comm, snap.listings) : null;

    facts.push({ label: `Клієнтів на ${to}-му місяці`, value: String(customers) });
    facts.push({ label: "MRR", value: money(mrr) });
    facts.push({ label: "Місяців із маркетингом", value: String(marketMonths) });
    if (channel != null) facts.push({ label: "Найсильніший канал", value: `${channel}/100` });

    const failed = customers < 3 || mrr === 0;
    const good = customers >= 10 && analytics >= 1 && (channel == null ? marketMonths >= 4 : channel >= 25);

    return {
      verdict: failed ? "failed" : good ? "good" : "mixed",
      weakest: customers < 10 ? "cold_outreach" : marketMonths < 4 ? "write_article" : null,
      criterion: `На ${to}-му місяці ${customers} клієнтів. Гра вважає критичним менше трьох на 10-му: якщо їх немає, проблема не в продукті, а в тому, що він вирішує не ту задачу або не для тих.`,
      facts,
    };
  }

  if (id === "grow") {
    const start = ctx.at(from - 1) ?? ctx.at(from);
    const mrrStart = num(start?.mrr);
    const mrrEnd = num(end?.mrr);
    const window = ctx.hist.filter((h) => h.monthIndex >= from && h.monthIndex <= to);
    const newSum = sum(window, (h) => h.newCustomers);
    const lostSum = sum(window, (h) => h.churned);
    const churn = meanChurn(ctx.hist, from, to);

    facts.push({ label: `MRR ${from - 1}-й → ${to}-й`, value: `${money(mrrStart)} → ${money(mrrEnd)}` });
    facts.push({ label: "Залучено за етап", value: String(newSum) });
    facts.push({ label: "Втрачено за етап", value: String(lostSum) });
    facts.push({ label: "Середній відтік", value: `${Math.round(churn * 10) / 10}%` });

    const failed = mrrEnd <= mrrStart * 1.5 || churn > BENCHMARKS.churnBad;
    const good = mrrEnd >= mrrStart * 4 && churn <= BENCHMARKS.churnOk && lostSum <= newSum * 0.5;

    return {
      verdict: failed ? "failed" : good ? "good" : "mixed",
      weakest: churn > BENCHMARKS.churnOk ? "talk_to_churned" : "write_article",
      criterion: `Відтік за етап ${Math.round(churn * 10) / 10}% на місяць (здорова смуга — до ${BENCHMARKS.churnOk}%). Залучили ${newSum}, втратили ${lostSum}: відтік стоїть у знаменнику стелі MRR, тому зменшити його вдвічі коштує стільки ж, скільки подвоїти залучення, а дається дешевше.`,
      facts,
    };
  }

  // ceiling
  const window = ctx.hist.filter((h) => h.monthIndex >= from && h.monthIndex <= to);
  const best = window.length ? Math.max(...window.map((h) => num(h.netProfit))) : 0;
  const target = ctx.state.biz.salaryTarget;
  const raised = ctx.countOf("raise_price", 1, to);

  facts.push({ label: "Найкращий чистий прибуток", value: money(best) });
  facts.push({ label: "Ціль", value: money(target) });
  facts.push({ label: "Ціну підвищували", value: raised > 0 ? `${raised} раз(и)` : "жодного разу" });
  if (snap) facts.push({ label: "Ціна проти звичної для ЦА", value: `${money(snap.price)} проти ${money(snap.anchor)}` });

  const failed = best < 0.6 * target;
  const good = ctx.state.achieved?.salary != null || best >= target;

  return {
    verdict: failed ? "failed" : good ? "good" : "mixed",
    weakest: raised === 0 ? "raise_price" : "collect_testimonials",
    criterion: `Найкращий місяць етапу дав ${money(best)} чистими за цілі ${money(target)}. На цьому етапі стелю піднімає ціна, а не години: стеля дорівнює новому MRR, поділеному на відтік.`,
    facts,
  };
}

function fallbackAdvice(actionId) {
  const action = actionId ? ACTIONS_BY_ID[actionId] : null;
  if (!action) return null;
  return {
    actionId: action.id,
    label: action.label,
    category: action.category,
    months: [],
    runs: [],
    longest: 0,
    weight: 0,
    why: action.why,
    timing: action.timing,
    detail: action.missed ?? action.risk,
    codexRef: action.codexRef ?? null,
  };
}

// ─────────────────────────── ключові моменти ───────────────────────────

function buildMoments(ctx) {
  const out = [];
  const { hist, log } = ctx;
  const push = (monthIndex, kind, label, text, tone = "neutral") => {
    if (monthIndex) out.push({ monthIndex, kind, label, text, tone });
  };

  const firstCustomer = hist.find((h) => h.customers >= 1);
  if (firstCustomer) {
    const mvp = ctx.firstMonthOf("setup_billing") ?? ctx.firstMonthOf("build_mvp");
    push(
      firstCustomer.monthIndex,
      "first_customer",
      "Перший клієнт",
      mvp && firstCustomer.monthIndex > mvp
        ? `Перша людина заплатила на ${firstCustomer.monthIndex}-му місяці — через ${firstCustomer.monthIndex - mvp} міс. після того, як продукт став можна купити.`
        : `Перша людина заплатила на ${firstCustomer.monthIndex}-му місяці${mvp ? " — того самого місяця, коли ви підключили оплату" : ""}.`,
      "good",
    );
  }

  const first1k = hist.find((h) => h.mrr >= 1000);
  if (first1k) push(first1k.monthIndex, "first_1k", "Перша тисяча MRR", `MRR уперше перевалив за $1000.`, "good");

  const ramen = ctx.state.achieved?.ramen;
  if (ramen) push(ramen, "ramen", "Продукт почав годувати", "Пів року поспіль продукт покривав ваші витрати.", "good");

  const salary = ctx.state.achieved?.salary;
  if (salary) push(salary, "salary", "Мету досягнуто", "Шість місяців поспіль продукт приносив більше за зарплату.", "good");

  // Найкращий місяць — і те, що робилося за два-три місяці до нього: контент
  // і канали платять із лагом, тому місяць причини і є уроком.
  if (hist.length) {
    const best = hist.reduce((a, b) => (num(b.newCustomers) > num(a.newCustomers) ? b : a));
    if (num(best.newCustomers) > 0) {
      const cause = log[best.monthIndex - 4];
      const causeLabels = (cause?.actions ?? [])
        .map((id) => ACTIONS_BY_ID[id]?.label)
        .filter(Boolean)
        .slice(0, 2);
      push(
        best.monthIndex,
        "best_month",
        "Найкращий місяць",
        `${best.newCustomers} нових клієнтів.${causeLabels.length ? ` За три місяці до того ви робили: ${causeLabels.join(", ")} — канали віддають із затримкою, тому причина зазвичай не в тому місяці, у якому видно результат.` : ""}`,
        "good",
      );
    }
  }

  // Найбільше падіння MRR — із назвою події, якщо вона була.
  let drop = null;
  for (let i = 1; i < hist.length; i += 1) {
    const delta = num(hist[i - 1].mrr) - num(hist[i].mrr);
    if (delta > (drop?.delta ?? 0)) drop = { delta, entry: hist[i] };
  }
  if (drop && drop.delta > 1) {
    const event = log[drop.entry.monthIndex - 1]?.event;
    push(
      drop.entry.monthIndex,
      "worst_drop",
      "Найбільше падіння",
      `MRR упав на ${money(drop.delta)}.${event ? ` Того місяця: ${event.label}.` : ` Пішло ${drop.entry.churned} клієнтів.`}`,
      "bad",
    );
  }

  for (const [id, label] of [
    ["install_analytics", "Аналітика"],
    ["funnel_events", "Події воронки"],
    ["cohorts_attribution", "Когорти й атрибуція"],
    ["raise_price", "Перше підвищення ціни"],
    ["add_annual_plan", "Річний план"],
    ["quit_job", "Звільнення з роботи"],
  ]) {
    const month = ctx.firstMonthOf(id);
    if (month) push(month, id, label, ACTIONS_BY_ID[id]?.why ?? "", "good");
  }

  if (hist.length) {
    const low = hist.reduce((a, b) => (num(b.energy) < num(a.energy) ? b : a));
    if (num(low.energy) < 45) {
      const rested = log
        .slice(low.monthIndex - 1, low.monthIndex + 2)
        .some((e) => e.actions.includes("rest_week") || e.actions.includes("healthy_month"));
      push(
        low.monthIndex,
        "energy_bottom",
        "Дно за силами",
        `Енергія опускалася до ${Math.round(low.energy)}/100.${rested ? " Ви зупинилися й відновилися." : " Відпочинку поруч не було — саме звідси починається спіраль."}`,
        rested ? "neutral" : "bad",
      );
    }

    const poor = hist.reduce((a, b) => (num(b.cash) < num(a.cash) ? b : a));
    push(
      poor.monthIndex,
      "cash_bottom",
      "Дно за грошима",
      `На рахунку лишалося ${money(poor.cash)}.`,
      num(poor.cash) < 3000 ? "bad" : "neutral",
    );
  }

  for (const offer of ctx.state.declinedOffers ?? []) {
    push(offer.monthIndex, "offer_declined", "Відмова від пропозиції", `Пропонували ${money(offer.offer)} — ви відмовилися.`, "neutral");
  }
  if (ctx.state.soldAt) {
    push(ctx.state.soldAt, "sold", "Проєкт продано", `Ви прийняли ${money(ctx.state.soldFor)}.`, "good");
  }

  return out.sort((a, b) => a.monthIndex - b.monthIndex);
}

// ─────────────────────────── оцінки ───────────────────────────

function buildGrades(ctx) {
  const snap = ctx.snapUpTo(ctx.monthsPlayed);
  const biz = ctx.state.biz;
  const metrics = ctx.state.metrics;
  const energies = ctx.hist.map((h) => num(h.energy, 100));
  const minEnergy = energies.length ? Math.min(...energies) : 100;

  const grades = [
    grade("validation", "Валідація", ctx.monthsPlayed >= 3, [
      part("Місяці з інтерв'ю", Math.min(1, ctx.countOf("customer_interviews") / 6), 40, "Перші 15–20 розмов дають найбільше"),
      part("Ясність ЦА", snap ? Math.min(1, snap.icp / 70) : 0.5, 30, "Множник усієї воронки згори донизу"),
      part("MVP після валідації", mvpAfterValidation(ctx) ? 1 : 0, 20, "Фіт від MVP множиться на те, що ви знали про клієнта"),
      part("Звуження ніші", ctx.countOf("narrow_the_niche") > 0 ? 1 : 0, 10, "Вузька ніша множить конверсію й ділить конкуренцію"),
    ]),

    grade("distribution", "Дистрибуція", ctx.monthsPlayed >= 8, [
      part("Накопичені канали", snap ? Math.min(1, (snap.seo + snap.comm + snap.listings) / 120) : 0.4, 35, "Активи працюють без вас, оренда — ні"),
      part("Регулярність", marketRegularity(ctx), 35, "Контент і спільноти згасають без участі"),
      part("Загальний трафік", Math.min(1, sum(ctx.hist, (h) => h.visitors) / 12000), 20, "Скільки людей узагалі дійшло"),
      part("Запуск на підготовленому ґрунті", launchPrepared(ctx), 10, "Сплеск без каналу нікуди не веде"),
    ]),

    grade("product", "Продукт", ctx.monthsPlayed >= 6, [
      part("Відповідність проблемі", snap ? Math.min(1, snap.fit / 70) : 0.4, 30, "Єдиний множник, що переходить одиницю"),
      part("Надійність", snap ? 1 - snap.bugs / 100 : 0.5, 25, "Баги б'ють по тих, хто вже платить"),
      part("Технічний борг", snap ? 1 - Math.max(0, snap.debt - 40) / 60 : 0.5, 25, "Борг оподатковує години квадратично"),
      part("Онбординг", snap ? Math.min(1, snap.onboarding / 70) : 0.4, 20, "Клієнт платить за момент першої користі"),
    ]),

    grade("economics", "Юніт-економіка", biz.customers >= 5, [
      part("Відтік", churnScore(metrics.churnPct), 30, `Здорова смуга — до ${BENCHMARKS.churnOk}% на місяць`),
      part("Ціна", priceScore(ctx, snap), 25, "Попит у B2B нееластичний — майже всі ставлять ціну надто низько"),
      part("LTV : CAC", Math.min(1, num(metrics.ltvCac) / BENCHMARKS.ltvCacTarget), 25, `Нижче ${BENCHMARKS.ltvCacTarget} юніт-економіка не сходиться`),
      part("Річні плани", biz.annualShare > 0 ? 1 : 0, 20, "Гроші наперед і клієнт, який не може піти цього місяця"),
    ]),

    grade("self", "Ви самі", true, [
      part("Дно за силами", energyScore(minEnergy), 40, "Сили — це множник до всіх ваших годин"),
      part("Місяці на межі", 1 - share(energies.filter((e) => e < 35).length, energies.length) / 100, 30, "Спринтувати можна рік, а не три"),
      part("Черга звернень", 1 - num(ctx.state.founder.supportBacklog) / 100, 30, "Мовчання у відповідь читається як «проєкт помер»"),
    ]),
  ];

  return grades;
}

function grade(id, label, reached, parts) {
  if (!reached) {
    return { id, label, na: "Партія закінчилася до того, як це можна було оцінити", parts: [] };
  }
  const score = Math.round(sum(parts, (p) => p.got));
  return {
    id,
    label,
    score,
    letter: score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F",
    tone: score >= 70 ? "good" : score >= 55 ? "warn" : "bad",
    parts,
  };
}

function part(label, ratio, max, why) {
  const safe = Math.max(0, Math.min(1, num(ratio)));
  return { label, got: Math.round(safe * max), max, why };
}

const mvpAfterValidation = (ctx) => {
  const month = ctx.firstMonthOf("build_mvp");
  if (!month) return false;
  const snap = ctx.snapAt(month);
  return snap ? snap.icp >= 35 : ctx.countOf("customer_interviews", 1, month) >= 1;
};

const marketRegularity = (ctx) => {
  const months = ctx.log.filter((e) => e.monthIndex >= 4);
  if (!months.length) return 0;
  const active = months.filter((e) => e.actions.some((a) => ACTIONS_BY_ID[a]?.category === "market")).length;
  return active / months.length;
};

const launchPrepared = (ctx) => {
  const launch = ctx.firstMonthOf("launch_product_hunt") ?? ctx.firstMonthOf("launch_show_hn");
  if (!launch) return 0.5;
  const snap = ctx.snapAt(launch);
  if (!snap) return launch >= 8 ? 1 : 0;
  return snap.seo + snap.comm >= 25 ? 1 : 0;
};

const churnScore = (pct) => {
  const value = num(pct);
  if (value <= BENCHMARKS.churnGood) return 1;
  if (value <= BENCHMARKS.churnOk) return 0.67;
  if (value <= BENCHMARKS.churnBad) return 0.33;
  return 0;
};

const energyScore = (value) => (value >= 50 ? 1 : value >= 35 ? 0.7 : value >= 25 ? 0.35 : 0);

function priceScore(ctx, snap) {
  const raised = ctx.countOf("raise_price") > 0;
  if (!snap) return raised ? 1 : 0;
  return raised && snap.price >= 0.85 * snap.anchor ? 1 : raised ? 0.6 : 0;
}

// ─────────────────────────── дрібні хелпери ───────────────────────────

function toRuns(months) {
  const runs = [];
  for (const month of months) {
    const last = runs[runs.length - 1];
    if (last && month === last[1] + 1) last[1] = month;
    else runs.push([month, month]);
  }
  return runs;
}

function longestRun(flags) {
  let best = 0;
  let run = 0;
  for (const flag of flags) {
    run = flag ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

function meanChurn(hist, from, to) {
  const window = hist.filter((h) => h.monthIndex >= from && h.monthIndex <= to);
  const rates = window.map((h, i) => {
    const previous = window[i - 1]?.customers ?? h.customers;
    return previous > 0 ? (num(h.churned) / previous) * 100 : 0;
  });
  return rates.length ? sum(rates) / rates.length : 0;
}

export function money(value) {
  return `$${Math.round(num(value)).toLocaleString("uk-UA")}`;
}

export { STAGES, REFERENCE, URGENCY };
