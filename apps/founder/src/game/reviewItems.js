/**
 * Детектори сильних сторін і помилок.
 *
 * Правило одне: кожен пункт несе число з ЦІЄЇ партії. «Ви мало спілкувалися з
 * клієнтами» нікого нічого не вчить; «23 інтерв'ю до першого рядка коду» або
 * «340 годин коду, поки ви не знали, кому це» — вчить.
 *
 * Помилки, де це можливо, несуть ціну: у грошах, годинах, клієнтах або місяцях.
 * Ціна — це те, що перетворює докір на урок.
 */

import { ACTIONS_BY_ID } from "../data/actions.data.js";
import { BENCHMARKS, ACQUISITION_ARR_MULTIPLE } from "../data/economics.js";

const num = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const money = (value) => `$${Math.round(num(value)).toLocaleString("uk-UA")}`;
const sum = (list, pick = (x) => x) => list.reduce((acc, item) => acc + num(pick(item)), 0);

const item = (id, title, evidence, extra = {}) => ({
  id,
  title,
  evidence,
  detail: extra.detail ?? "",
  monthIndex: extra.monthIndex ?? null,
  span: extra.span ?? null,
  cost: extra.cost ?? null,
  weight: extra.weight ?? 50,
  actionIds: extra.actionIds ?? [],
  codexRef: extra.codexRef ?? null,
});

const cost = (kind, value, text) => ({ kind, value, text });

/** Скільки годин категорії витрачено в місяцях, що задовольняють умову. */
function hoursWhere(ctx, category, predicate) {
  let total = 0;
  for (const entry of ctx.log) {
    if (!predicate(entry)) continue;
    for (let i = 0; i < entry.actions.length; i += 1) {
      const action = ACTIONS_BY_ID[entry.actions[i]];
      if (action?.category !== category) continue;
      total += entry.costs?.[i] ?? action.laborCost ?? 0;
    }
  }
  return Math.round(total);
}

// ─────────────────────────── сильні сторони ───────────────────────────

const STRENGTHS = [
  function validatedBeforeBuilding(ctx) {
    const build = ctx.firstMonthOf("build_mvp");
    if (!build) return null;
    const before = ctx.countOf("customer_interviews", 1, build - 1);
    const snap = ctx.snapAt(build);
    if (before < 2 && !(snap && snap.icp >= 50)) return null;
    return item(
      "validated_before_building",
      "Ви говорили з людьми до того, як писати код",
      snap
        ? `${snap.interviews} інтерв'ю й ясність ЦА ${snap.icp}/100 на момент, коли почали MVP.`
        : `${before} місяців інтерв'ю до першого рядка коду.`,
      { monthIndex: build, weight: 95, actionIds: ["customer_interviews"], codexRef: "validation" },
    );
  },

  function analyticsEarly(ctx) {
    const month = ctx.firstMonthOf("install_analytics");
    if (!month || month > 4) return null;
    return item(
      "analytics_early",
      "Аналітику поставили рано",
      `На ${month}-му місяці — до того, як з'явилися числа, які треба було читати.`,
      { monthIndex: month, weight: 80, actionIds: ["install_analytics"], codexRef: "analytics" },
    );
  },

  function talkedToChurned(ctx) {
    const count = ctx.countOf("talk_to_churned");
    if (count < 2) return null;
    return item(
      "talked_to_churned",
      "Ви питали тих, хто пішов",
      `${count} разів. Це найдешевші дані у всьому бізнесі, і майже ніхто їх не збирає. Відтік наприкінці: ${Math.round(num(ctx.state.metrics.churnPct) * 10) / 10}%.`,
      { weight: 85, actionIds: ["talk_to_churned"], codexRef: "churn" },
    );
  },

  function raisedPrice(ctx) {
    const month = ctx.firstMonthOf("raise_price");
    if (!month) return null;
    const snap = ctx.snapUpTo(ctx.monthsPlayed);
    return item(
      "raised_price",
      "Ви піднімали ціну",
      snap
        ? `Уперше на ${month}-му. Наприкінці ${money(snap.price)} за звичних для цієї аудиторії ${money(snap.anchor)}.`
        : `Уперше на ${month}-му місяці.`,
      { monthIndex: month, weight: 90, actionIds: ["raise_price"], codexRef: "pricing" },
    );
  },

  function contentConsistency(ctx) {
    const run = ctx.longestRun("write_article");
    if (run < 5) return null;
    const early = num(ctx.at(6)?.visitors);
    const late = num(ctx.at(Math.min(24, ctx.monthsPlayed))?.visitors);
    return item(
      "content_consistency",
      "Ви писали регулярно",
      `${run} місяців поспіль. Відвідувачів на 6-му місяці: ${Math.round(early)}, пізніше: ${Math.round(late)} — контент віддає із затримкою, і саме тому його неможливо надолужити.`,
      { weight: 85, actionIds: ["write_article"], codexRef: "seo" },
    );
  },

  function distributionBeforeLaunch(ctx) {
    const launch = ctx.firstMonthOf("launch_product_hunt") ?? ctx.firstMonthOf("launch_show_hn");
    if (!launch) return null;
    const before =
      ctx.countOf("write_article", 1, launch - 1) + ctx.countOf("community_presence", 1, launch - 1);
    if (before < 3) return null;
    const entry = ctx.at(launch);
    return item(
      "distribution_before_launch",
      "Запускалися на підготовлений ґрунт",
      `До запуску вже ${before} місяців контенту й присутності. Того місяця: ${Math.round(num(entry?.visitors))} відвідувачів, лишилося ${num(entry?.newCustomers)} клієнтів.`,
      { monthIndex: launch, weight: 75, actionIds: ["prep_launch"], codexRef: "launch" },
    );
  },

  function neverNearBurnout(ctx) {
    const energies = ctx.hist.map((h) => num(h.energy, 100));
    if (!energies.length) return null;
    const low = Math.min(...energies);
    if (low < 40) return null;
    return item(
      "never_near_burnout",
      "Ви не заганяли себе",
      `Найнижчі сили за всю партію — ${Math.round(low)}/100. Спринтувати можна рік, а не три, і ви це витримали.`,
      { weight: 70, actionIds: ["healthy_month"], codexRef: "burnout" },
    );
  },

  function stoppedInTime(ctx) {
    const energies = ctx.hist.map((h) => num(h.energy, 100));
    if (!energies.length || Math.min(...energies) < 25 || Math.min(...energies) >= 40) return null;
    const rests = ctx.countOf("rest_week") + ctx.countOf("healthy_month");
    if (rests < 2) return null;
    return item(
      "stopped_in_time",
      "Ви зупинялися раніше, ніж вас зупиняло",
      `Сили падали до ${Math.round(Math.min(...energies))}/100, але ви ${rests} разів свідомо відпочивали — і жодного разу не дійшли до дна.`,
      { weight: 80, actionIds: ["rest_week"], codexRef: "burnout" },
    );
  },

  function annualPlan(ctx) {
    const month = ctx.firstMonthOf("add_annual_plan");
    if (!month) return null;
    return item(
      "annual_plan",
      "Ви ввели річний план",
      `З ${month}-го місяця. Гроші за рік наперед — найдешевший спосіб купити собі runway, коли інвестора немає, а клієнт на річній оплаті цього місяця піти фізично не може.`,
      { monthIndex: month, weight: 75, actionIds: ["add_annual_plan"], codexRef: "annual" },
    );
  },

  function nicheNarrowed(ctx) {
    const month = ctx.firstMonthOf("narrow_the_niche");
    if (!month) return null;
    const before = ctx.snapAt(month)?.tam;
    const after = ctx.snapUpTo(ctx.monthsPlayed)?.tam;
    return item(
      "niche_narrowed",
      "Ви звузили нішу",
      before != null && after != null
        ? `На ${month}-му місяці: ширина ніші ${before} → ${after}. Це ділить охоплення й множить конверсію — соло виграє саме другим.`
        : `На ${month}-му місяці.`,
      { monthIndex: month, weight: 80, actionIds: ["narrow_the_niche"], codexRef: "niche" },
    );
  },

  function fixedWhatDataShowed(ctx) {
    const count = ctx.countOf("fix_onboarding_step");
    if (!count) return null;
    return item(
      "fixed_by_data",
      "Онбординг лагодили за даними",
      `${count} разів — це ті самі години, що й наосліп, але втричі більший результат, бо ви знали, який саме крок втрачає людей.`,
      { weight: 80, actionIds: ["fix_onboarding_step"], codexRef: "onboarding" },
    );
  },

  function noWastedMonths(ctx) {
    const wasted = ctx.log.filter(
      (e) => e.monthIndex > 2 && num(e.hoursSpent) < 0.5 * num(e.hoursAvailable),
    ).length;
    if (wasted > 0 || ctx.monthsPlayed < 12) return null;
    return item(
      "no_wasted_months",
      "Жодного порожнього місяця",
      `За ${ctx.monthsPlayed} місяців не було жодного, де більш ніж половина доступних годин лишилася невитраченою.`,
      { weight: 65 },
    );
  },

  function survivedShock(ctx) {
    for (let i = 1; i < ctx.hist.length; i += 1) {
      const before = num(ctx.hist[i - 1].mrr);
      const after = num(ctx.hist[i].mrr);
      if (before < 200 || after > before * 0.75) continue;
      const recovered = ctx.hist.slice(i + 1, i + 4).find((h) => num(h.mrr) > before);
      if (!recovered) continue;
      return item(
        "survived_shock",
        "Ви пережили удар і повернулися",
        `На ${ctx.hist[i].monthIndex}-му MRR упав ${money(before)} → ${money(after)}. За ${recovered.monthIndex - ctx.hist[i].monthIndex} міс. ви були вище, ніж до падіння.`,
        { monthIndex: ctx.hist[i].monthIndex, weight: 85 },
      );
    }
    return null;
  },

  function declinedAndWasRight(ctx) {
    const offers = ctx.state.declinedOffers ?? [];
    if (!offers.length) return null;
    const valuation = num(ctx.state.biz.mrr) * 12 * ACQUISITION_ARR_MULTIPLE;
    const best = offers.reduce((a, b) => (b.offer > a.offer ? b : a));
    if (valuation <= best.offer) return null;
    return item(
      "declined_and_right",
      "Ви правильно відмовилися продавати",
      `На ${best.monthIndex}-му пропонували ${money(best.offer)}. Наприкінці той самий множник дає ${money(valuation)}.`,
      { monthIndex: best.monthIndex, weight: 90, codexRef: "exit" },
    );
  },
];

// ─────────────────────────── помилки ───────────────────────────

const MISTAKES = [
  function builtBlind(ctx) {
    const markers = ctx.journalOf("building_blind");
    if (markers.length < 2) return null;
    const months = new Set(markers.map((m) => m.monthIndex));
    const wasted = hoursWhere(ctx, "product", (e) => months.has(e.monthIndex));
    return item(
      "built_blind",
      "Ви будували, не знаючи, кому це",
      `${markers.length} місяців поспіль гра попереджала про це.`,
      {
        span: [markers[0].monthIndex, markers[markers.length - 1].monthIndex],
        cost: wasted > 0 ? cost("hours", wasted, `${wasted} годин коду, поки ясність ЦА була нижчою за 30`) : null,
        detail: markers[0].text,
        weight: 100,
        actionIds: ["customer_interviews", "landing_smoke_test"],
        codexRef: "validation",
      },
    );
  },

  function lateAnalytics(ctx) {
    const month = ctx.firstMonthOf("install_analytics");
    if (month && month <= 8) return null;
    const blind = ctx.log.filter((e) => (e.snap?.analytics ?? 0) === 0).length || (month ?? ctx.monthsPlayed) - 1;
    return item(
      "late_analytics",
      month ? "Аналітику поставили пізно" : "Ви так і не поставили аналітику",
      month
        ? `Лише на ${month}-му місяці. До того ${month - 1} місяців рішень ухвалювалися наосліп.`
        : `За всю партію жодного разу. Ви бачили, що клієнтів стало більше або менше, але не бачили, з чого це склалося.`,
      {
        monthIndex: month,
        cost: cost("months", blind, `${blind} місяців без розділення нових і втрачених клієнтів`),
        weight: 95,
        actionIds: ["install_analytics"],
        codexRef: "analytics",
      },
    );
  },

  function leakyBucket(ctx) {
    const { cumNew, cumChurned, arpu } = ctx.state.biz;
    if (cumNew < 10 || cumChurned < cumNew * 0.5) return null;
    return item(
      "leaky_bucket",
      "Ви наливали у відро без дна",
      `Залучили ${cumNew}, втратили ${cumChurned} — це ${Math.round((cumChurned / cumNew) * 100)}%.`,
      {
        cost: cost("money", cumChurned * num(arpu), `${money(cumChurned * num(arpu))} MRR, який ви вже купили й віддали`),
        weight: 100,
        actionIds: ["talk_to_churned", "fix_bugs", "support_sprint"],
        codexRef: "churn",
      },
    );
  },

  function neverRaisedPrice(ctx) {
    if (ctx.countOf("raise_price") > 0) return null;
    const snap = ctx.snapUpTo(ctx.monthsPlayed);
    const customers = num(ctx.state.biz.customers);
    if (customers < 10) return null;
    const target = snap ? Math.min(snap.anchor, snap.price * 1.4) : null;
    const gain = snap && target > snap.price ? customers * (target - snap.price) : null;
    return item(
      "never_raised_price",
      "Ви жодного разу не підняли ціну",
      snap
        ? `Наприкінці ${money(snap.price)} за звичних для цієї аудиторії ${money(snap.anchor)}.`
        : `За всю партію ціна лишалася стартовою.`,
      {
        cost: gain ? cost("money", gain, `${money(gain)} на місяць за поточної бази клієнтів`) : null,
        weight: 95,
        actionIds: ["raise_price"],
        codexRef: "pricing",
      },
    );
  },

  function noDistribution(ctx) {
    const markers = ctx.journalOf("no_distribution");
    const snap = ctx.snapUpTo(ctx.monthsPlayed);
    const weak = snap && snap.seo + snap.comm + snap.listings < 40;
    if (!markers.length && !weak) return null;
    return item(
      "no_distribution",
      "Каналів залучення так і не з'явилося",
      snap
        ? `Наприкінці: пошук ${snap.seo}/100, спільноти ${snap.comm}/100, каталоги ${snap.listings}/100.`
        : `Гра попереджала про це ${markers.length} місяців.`,
      {
        cost: cost("customers", Math.round(sum(ctx.hist, (h) => h.visitors)), `усього ${Math.round(sum(ctx.hist, (h) => h.visitors))} відвідувачів за партію`),
        detail: markers[0]?.text ?? "Продукт може бути яким завгодно добрим — про нього нікому дізнатися.",
        weight: 95,
        actionIds: ["write_article", "community_presence", "cold_outreach"],
        codexRef: "channels",
      },
    );
  },

  function ignoredTheWarning(ctx) {
    const top = ctx.ignored[0];
    if (!top || top.longest < 3) return null;
    const run = top.runs.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
    return item(
      "ignored_the_warning",
      `Гра ${top.months.length} місяців казала: «${top.label}»`,
      `Найдовший відрізок — місяці ${run[0]}–${run[1]}. Ви не взяли цю дію жодного разу.`,
      {
        span: run,
        cost: cost("months", top.months.length, `${top.months.length} місяців з позначкою «це важливо»`),
        detail: top.detail,
        weight: 90,
        actionIds: [top.actionId],
        codexRef: top.codexRef,
      },
    );
  },

  function burnedTheHours(ctx) {
    const lost = sum(ctx.log, (e) => Math.max(0, num(e.hoursAvailable) - num(e.hoursSpent)));
    const energies = ctx.hist.map((h) => num(h.energy, 100));
    const low = energies.length ? Math.min(...energies) : 100;
    if (low >= 25 && ctx.journalOf("energy_critical").length === 0) return null;
    return item(
      "burned_the_hours",
      "Ви працювали на межі",
      `Сили падали до ${Math.round(low)}/100. Нижче тридцяти кожна година дає менше, ніж могла б.`,
      {
        cost: lost > 10 ? cost("hours", Math.round(lost), `${Math.round(lost)} годин лишилися невитраченими — сил на них не було`) : null,
        weight: 95,
        actionIds: ["rest_week", "healthy_month"],
        codexRef: "burnout",
      },
    );
  },

  function supportDebt(ctx) {
    const markers = ctx.journalOf("support_drowning");
    const backlog = num(ctx.state.founder.supportBacklog);
    if (markers.length < 2 && backlog < 45) return null;
    return item(
      "support_debt",
      "Ви потонули в підтримці",
      `Черга звернень наприкінці — ${Math.round(backlog)}/100.${ctx.countOf("write_docs") === 0 ? " Документацію не писали жодного разу." : ""}`,
      {
        detail: "Ріст сам створює навантаження, яке з'їдає години, потрібні для росту. Документація зменшує не швидкість ваших відповідей, а саму кількість питань.",
        weight: 90,
        actionIds: ["write_docs", "support_sprint"],
        codexRef: "support",
      },
    );
  },

  function featuresNotCustomers(ctx) {
    const product = ctx.hours.rows.find((row) => row.category === "product");
    if (!product || product.sharePct < 55 || num(ctx.state.biz.customers) >= 25) return null;
    return item(
      "features_not_customers",
      "Години йшли у продукт, а клієнти — ні",
      `${product.sharePct}% усіх годин у розробку, клієнтів наприкінці — ${ctx.state.biz.customers}.`,
      {
        cost: cost("hours", product.hours, `${product.hours} годин у продукт`),
        weight: 95,
        actionIds: ["cold_outreach", "write_article"],
        codexRef: "channels",
      },
    );
  },

  function launchedIntoNothing(ctx) {
    const launch = ctx.firstMonthOf("launch_product_hunt") ?? ctx.firstMonthOf("launch_show_hn");
    if (!launch) return null;
    const snap = ctx.snapAt(launch);
    const prepared = snap ? snap.seo >= 15 || snap.comm >= 15 : launch > 6;
    if (prepared) return null;
    const entry = ctx.at(launch);
    return item(
      "launched_into_nothing",
      "Запуск не було куди вести",
      `На ${launch}-му місяці: ${Math.round(num(entry?.visitors))} відвідувачів, лишилося ${num(entry?.newCustomers)}. Запуск — це подія, а не канал: трафік спадає за три дні.`,
      { monthIndex: launch, weight: 80, actionIds: ["prep_launch", "write_article"], codexRef: "launch" },
    );
  },

  function adsBeforeEconomics(ctx) {
    const ads = ctx.firstMonthOf("run_ads");
    if (!ads) return null;
    const analytics = ctx.firstMonthOf("install_analytics");
    if (analytics && analytics <= ads) return null;
    return item(
      "ads_before_economics",
      "Реклама пішла раніше за аналітику",
      `Рекламу ввімкнули на ${ads}-му, аналітику — ${analytics ? `на ${analytics}-му` : "не ввімкнули взагалі"}. Без неї близько 45% бюджету йде нікуди: ви не знаєте, які покази марні.`,
      {
        monthIndex: ads,
        cost: cost("money", num(ctx.state.biz.cumSpend), `${money(ctx.state.biz.cumSpend)} витрачено на залучення`),
        weight: 85,
        actionIds: ["install_analytics"],
        codexRef: "ads",
      },
    );
  },

  function debtTax(ctx) {
    const peak = Math.max(0, ...ctx.log.map((e) => e.snap?.debt ?? 0));
    if (peak < 65) return null;
    const lost = sum(ctx.log, (e) => {
      const snap = e.snap;
      return snap ? snap.hoursBase * (snap.debt / 100) ** 2 * 0.5 : 0;
    });
    return item(
      "debt_tax",
      "Технічний борг з'їв ваші години",
      `Пік — ${peak}/100. Борг оподатковує години квадратично: 70 — це вже чверть бюджету.`,
      {
        cost: lost > 10 ? cost("hours", Math.round(lost), `${Math.round(lost)} годин пішли на боротьбу з власним кодом`) : null,
        weight: 85,
        actionIds: ["refactor"],
        codexRef: "tech-debt",
      },
    );
  },

  function idleMonths(ctx) {
    const idle = ctx.log.filter(
      (e) => e.monthIndex > 2 && num(e.hoursSpent) < 0.5 * num(e.hoursAvailable),
    );
    if (idle.length < 3) return null;
    const lost = sum(idle, (e) => num(e.hoursAvailable) - num(e.hoursSpent));
    return item(
      "idle_months",
      "Були місяці, у яких ви майже нічого не робили",
      `${idle.length} таких місяців: ${idle.slice(0, 6).map((e) => e.monthIndex).join(", ")}${idle.length > 6 ? "…" : ""}.`,
      {
        cost: cost("hours", Math.round(lost), `${Math.round(lost)} невитрачених годин`),
        weight: 75,
      },
    );
  },

  function declinedAndWasWrong(ctx) {
    const offers = ctx.state.declinedOffers ?? [];
    if (!offers.length) return null;
    const valuation = num(ctx.state.biz.mrr) * 12 * ACQUISITION_ARR_MULTIPLE;
    const best = offers.reduce((a, b) => (b.offer > a.offer ? b : a));
    if (valuation >= best.offer) return null;
    return item(
      "declined_and_wrong",
      "Пропозицію варто було прийняти",
      `На ${best.monthIndex}-му пропонували ${money(best.offer)}. Наприкінці той самий множник дає ${money(valuation)}.`,
      {
        monthIndex: best.monthIndex,
        cost: cost("money", best.offer - valuation, `різниця ${money(best.offer - valuation)}`),
        weight: 85,
        codexRef: "exit",
      },
    );
  },
];

// ─────────────────────────── збирання ───────────────────────────

export function detectStrengths(ctx) {
  const found = STRENGTHS.map((detect) => safe(detect, ctx)).filter(Boolean);
  if (found.length >= 2) return sortByWeight(found);

  // Секція «що ви робили добре» не має права бути порожньою: це і погана
  // педагогіка, і твердження в балансовому прогоні. Знаходимо найкраще число.
  const best = ctx.hist.reduce((a, b) => (num(b.newCustomers) > num(a?.newCustomers) ? b : a), null);
  if (best && num(best.newCustomers) > 0) {
    found.push(
      item("best_month_floor", "Найкращий ваш місяць", `${best.newCustomers} нових клієнтів на ${best.monthIndex}-му місяці.`, { monthIndex: best.monthIndex, weight: 40 }),
    );
  } else if (ctx.state.flags?.hasProduct) {
    const month = ctx.firstMonthOf("setup_billing") ?? ctx.firstMonthOf("build_mvp");
    found.push(
      item("shipped_floor", "Ви довели продукт до робочого стану", `Продукт існує й ним можна користуватися${month ? ` — з ${month}-го місяця` : ""}. Більшість не доходить і до цього.`, { monthIndex: month, weight: 35 }),
    );
  } else {
    found.push(
      item("started_floor", "Ви почали", `${ctx.monthsPlayed} місяців роботи над власним продуктом — це вже більше, ніж робить більшість.`, { weight: 30 }),
    );
  }
  return sortByWeight(found);
}

export function detectMistakes(ctx) {
  const found = MISTAKES.map((detect) => safe(detect, ctx)).filter(Boolean);
  if (found.length) return sortByWeight(found);

  const decided = ctx.state.verdict?.decidedAt;
  if (decided) {
    found.push(
      item("decided_floor", "Момент, у який усе вирішилося", decided.text, { monthIndex: decided.monthIndex, weight: 60 }),
    );
  } else {
    found.push(
      item(
        "nothing_major_floor",
        "Грубих помилок не було",
        "Жоден із детекторів не спрацював: партія пройшла без явних провалів. Це рідкість — і водночас означає, що зростання впиралося не в помилки, а в стелю.",
        { weight: 30 },
      ),
    );
  }
  return sortByWeight(found);
}

function safe(detect, ctx) {
  try {
    return detect(ctx);
  } catch {
    return null;
  }
}

const sortByWeight = (list) => [...list].sort((a, b) => b.weight - a.weight);

export { STRENGTHS, MISTAKES };
