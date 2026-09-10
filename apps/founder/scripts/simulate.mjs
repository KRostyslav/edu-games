/**
 * Балансовий прогін без браузера.
 *
 * Шар `src/game` і `src/data` не торкається DOM, тому вся модель запускається
 * під голим node. Це не тест «чи не падає», а перевірка того, що гра вчить
 * правильного: якщо стратегія «просто пиляти код» виграє, модель бреше, і
 * жоден текст у довіднику цього не виправить.
 *
 *   node scripts/simulate.mjs [seeds=20] [scenario]
 */

import { SCENARIOS } from "../src/data/scenarios.js";
import { createInitialState, TOTAL_MONTHS } from "../src/game/model.js";
import { createMonthEngine } from "../src/game/month.js";
import { pickByIds, hintedPicks } from "../src/game/strategy.js";
import { ACTIONS_BY_ID } from "../src/data/actions.data.js";
import { judge, CHAINS_FOR, REMEDIES } from "../src/game/verdict.js";
import { repairSave } from "../src/game/migrate.js";
import { buildReview } from "../src/game/review.js";
import { STRENGTHS, MISTAKES } from "../src/game/reviewItems.js";

const SEEDS = Number(process.argv[2] ?? 20);
const ONLY_SCENARIO = process.argv[3] ?? null;

// ─────────────────────────── стратегії ───────────────────────────

const STRATEGIES = {
  nothing: {
    label: "Не робити нічого",
    pick: () => [],
  },

  build_only: {
    label: "Просто пиляти код",
    pick: (state) =>
      pickByIds(state, [
        "build_mvp",
        "setup_billing",
        "fix_bugs",
        "refactor",
        "ship_feature",
        "polish_onboarding",
      ]),
  },

  market_only: {
    label: "Тільки маркетинг",
    pick: (state) =>
      pickByIds(state, [
        "build_mvp",
        "setup_billing",
        "write_article",
        "community_presence",
        "directory_listings",
        "prep_launch",
        "launch_product_hunt",
        "cold_outreach",
      ]),
  },

  ship_and_pray: {
    label: "Швидко зробити й запустити",
    pick: (state) =>
      pickByIds(state, [
        "build_mvp",
        "setup_billing",
        "launch_product_hunt",
        "launch_show_hn",
        "ship_feature",
        "fix_bugs",
      ]),
  },

  cheap: {
    label: "Усе правильно, але дешево",
    // Відрізняється від `balanced` рівно однією річчю: ніколи не піднімає ціну.
    // Інакше порівняння вимірювало б не урок про ціну, а різницю стратегій.
    pick: (state) => hintedPicks(state, { ban: ["raise_price"] }),
  },

  validate_first: {
    label: "Спершу валідація",
    pick: (state) => {
      if (state.monthIndex <= 4 && !state.flags.hasProduct) {
        return pickByIds(state, [
          "customer_interviews",
          "landing_smoke_test",
          "narrow_the_niche",
          "install_analytics",
        ]);
      }
      return hintedPicks(state, {
        extra: ["write_article", "ship_requested_feature", "community_presence"],
      });
    },
  },

  balanced: {
    label: "Робити все важливе за підказками",
    // Рівно той самий код, який гра пропонує гравцеві підказками і який
    // показує на екрані вироку як альтернативу. Якщо ця стратегія не виграє —
    // підказки брешуть гравцеві.
    pick: (state) => hintedPicks(state),
  },

  max_effort: {
    label: "Працювати на межі без відпочинку",
    pick: (state) =>
      hintedPicks(state, {
        extra: [
          "write_article",
          "community_presence",
          "ship_feature",
          "fix_bugs",
          "cold_outreach",
          "ship_requested_feature",
          "customer_interviews",
          "support_sprint",
          "directory_listings",
          "collect_testimonials",
          "write_docs",
        ],
        ban: ["rest_week", "healthy_month"],
      }),
  },
};

// ─────────────────────────── прогін ───────────────────────────

const seenTargets = new Set();

function runOnce(scenarioId, strategyKey, seed) {
  const scenario = SCENARIOS[scenarioId];
  const season = createMonthEngine({ initialState: createInitialState(scenario, seed), seed });
  const strategy = STRATEGIES[strategyKey];

  let ended = null;
  let endMonth = TOTAL_MONTHS;
  let judgeContractOk = true;
  let peakMrr = 0;
  let peakMonth = 0;
  let seoAt6 = 0;
  let seoAt24 = 0;

  for (let i = 1; i <= TOTAL_MONTHS; i += 1) {
    const state = season.engine.state;
    if (state.verdict?.over) break;

    const picks = strategy.pick(state);
    const turn = season.playMonth(picks);
    if (turn.noop) break;

    for (const effect of turn.effects) seenTargets.add(effect.target);

    // Контракт: судити можна лише остаточно. М'яка віха, повернена звідси,
    // заслонила б фінал — саме так гра колись і зациклювалася на 36-му місяці.
    const check = judge(season.engine.state);
    if (check && check.over !== true) judgeContractOk = false;

    const after = turn.after;
    if (after.biz.mrr > peakMrr) {
      peakMrr = after.biz.mrr;
      peakMonth = i;
    }
    if (i === 6) seoAt6 = after.funnel.visSeo;
    if (i === 24) seoAt24 = after.funnel.visSeo;

    if (turn.isOver) {
      ended = turn.verdict;
      endMonth = i;
      break;
    }
  }

  const final = season.engine.state;
  const indices = final.monthLog.map((entry) => entry.monthIndex);
  return {
    terminated: final.verdict?.over === true,
    logOk:
      final.monthLog.length <= TOTAL_MONTHS &&
      final.history.length <= TOTAL_MONTHS &&
      indices.every((value, i) => i === 0 || value > indices[i - 1]),
    judgeContractOk,
    verdictCode: final.verdict?.code ?? null,
    state: final,
    verdict: ended ?? final.verdict ?? null,
    endMonth,
    peakMrr,
    peakMonth,
    seoAt6,
    seoAt24,
    mrr: final.biz.mrr,
    cash: final.biz.cash,
    customers: final.biz.customers,
    churnPct: final.metrics.churnPct,
    depth: final.product.depth,
    polish: final.product.polish,
    fit: final.product.fit,
    energy: final.founder.energy,
    cumNew: final.biz.cumNew,
    cumChurned: final.biz.cumChurned,
    ramen: final.biz.ramenMonths,
    salary: final.biz.salaryMonths,
    reachedRamen: final.history.some((h) => h.netProfit >= final.biz.personalBurn),
    wonSalary: final.verdict?.code === "win_salary" || final.biz.salaryMonths >= 6,
    burnedOut: final.verdict?.code === "burnout",
    bankrupt: final.verdict?.code === "bankruptcy",
  };
}

function runMany(scenarioId, strategyKey) {
  const runs = [];
  for (let seed = 1; seed <= SEEDS; seed += 1) runs.push(runOnce(scenarioId, strategyKey, seed * 7919));
  return runs;
}

const avg = (list, key) => list.reduce((sum, r) => sum + r[key], 0) / list.length;
const share = (list, predicate) => list.filter(predicate).length / list.length;
const p95 = (list, key) => {
  const sorted = [...list].map((r) => r[key]).sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
};
const money = (value) => `$${Math.round(value).toLocaleString("uk-UA")}`;
const pad = (text, width) => String(text).padEnd(width);

// ─────────────────────────── звіт ───────────────────────────

const scenarioIds = ONLY_SCENARIO ? [ONLY_SCENARIO] : Object.keys(SCENARIOS);
const results = {};

for (const scenarioId of scenarioIds) {
  console.log(`\n${"═".repeat(78)}`);
  console.log(`  ${SCENARIOS[scenarioId].name}  [${scenarioId}]   ${SEEDS} сідів × ${TOTAL_MONTHS} міс`);
  console.log("═".repeat(78));
  console.log(
    `  ${pad("стратегія", 30)}${pad("MRR", 10)}${pad("клієнтів", 10)}${pad("відтік", 9)}${pad("глибина", 9)}фінал`,
  );

  results[scenarioId] = {};
  for (const [key, strategy] of Object.entries(STRATEGIES)) {
    const runs = runMany(scenarioId, key);
    results[scenarioId][key] = runs;

    const codes = {};
    for (const run of runs) {
      const code = run.verdict?.code ?? "stalled";
      codes[code] = (codes[code] ?? 0) + 1;
    }
    const top = Object.entries(codes).sort((a, b) => b[1] - a[1])[0];

    console.log(
      `  ${pad(strategy.label, 30)}${pad(money(avg(runs, "mrr")), 10)}${pad(
        Math.round(avg(runs, "customers")),
        10,
      )}${pad(`${avg(runs, "churnPct").toFixed(1)}%`, 9)}${pad(Math.round(avg(runs, "depth")), 9)}${top[0]} ${Math.round(
        (top[1] / runs.length) * 100,
      )}%`,
    );
  }
}

// ─────────────────────────── твердження ───────────────────────────

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass, detail });

const allRuns = Object.values(results).flatMap((byStrategy) => Object.values(byStrategy).flat());

const base = results[ONLY_SCENARIO ?? "savings"];
if (base) {
  const buildMrr = avg(base.build_only, "mrr");
  const buildDepth = avg(base.build_only, "depth");
  check(
    "Писати код не може виграти, і продукт при цьому хороший",
    buildMrr < 300 && buildDepth > 60,
    `MRR ${money(buildMrr)} (<$300), глибина ${Math.round(buildDepth)} (>60)`,
  );

  const balancedMrr = avg(base.balanced, "mrr");
  const validateMrr = avg(base.validate_first, "mrr");
  check(
    "Валідація й збалансована гра обганяють «просто код» щонайменше увосьмеро",
    balancedMrr > 8 * Math.max(buildMrr, 1) && validateMrr > 8 * Math.max(buildMrr, 1),
    `balanced ${money(balancedMrr)}, validate_first ${money(validateMrr)} проти ${money(buildMrr)}`,
  );

  const ramen = share(base.balanced, (r) => r.reachedRamen);
  const salary = share(base.balanced, (r) => r.wonSalary);
  check(
    "Підказки гри виграють: balanced доходить до рамену ≥80% і до зарплати ≥55%",
    ramen >= 0.8 && salary >= 0.55,
    `рамен ${Math.round(ramen * 100)}%, зарплата ${Math.round(salary * 100)}%`,
  );

  const nothingRuns = results.savings?.nothing ?? base.nothing;
  const bankruptMonths = nothingRuns.filter((r) => r.bankrupt).map((r) => r.endMonth);
  const okRange = bankruptMonths.length > 0 && bankruptMonths.every((m) => m >= 10 && m <= 16);
  check(
    "Бездіяльність у сценарії з заощаджень банкрутує на 10–16 місяці",
    okRange,
    bankruptMonths.length ? `місяці ${Math.min(...bankruptMonths)}–${Math.max(...bankruptMonths)}` : "банкрутств не було",
  );

  const marketChurn = avg(base.market_only, "churnPct");
  const leaky = share(base.market_only, (r) => r.cumChurned >= 0.5 * Math.max(1, r.cumNew));
  check(
    "Тільки маркетинг = діряве відро: відтік >11% і половина залучених втрачена",
    marketChurn > 11 && leaky >= 0.6,
    `відтік ${marketChurn.toFixed(1)}%, дірявих прогонів ${Math.round(leaky * 100)}%`,
  );

  check(
    "Модель не видає фантастичних результатів: p95 MRR < $12 000",
    p95(allRuns, "mrr") < 12000,
    `p95 ${money(p95(allRuns, "mrr"))}`,
  );

  const seoLag = share(
    base.balanced.filter((r) => r.seoAt24 > 0),
    (r) => r.seoAt6 < 0.15 * r.seoAt24,
  );
  check(
    "Лаг SEO помітний: трафік 6-го місяця менше 15% від трафіку 24-го",
    seoLag >= 0.8,
    `${Math.round(seoLag * 100)}% прогонів`,
  );

  const burned = share(base.max_effort, (r) => r.burnedOut);
  const balancedBurned = share(base.balanced, (r) => r.burnedOut);
  check(
    "Вигорання досяжне: робота на межі вигорає, збалансована гра — ні",
    burned >= 0.5 && balancedBurned <= 0.05,
    `на межі ${Math.round(burned * 100)}%, збалансовано ${Math.round(balancedBurned * 100)}%`,
  );

  const cheapRuns = base.cheap;
  const cheapCustomers = avg(cheapRuns, "customers");
  const balancedCustomers = avg(base.balanced, "customers");
  check(
    "Урок про ціну: дешевше майже не додає клієнтів, зате дає вдвічі менше грошей",
    cheapCustomers <= 1.15 * balancedCustomers && avg(cheapRuns, "mrr") < 0.6 * avg(base.balanced, "mrr"),
    `клієнтів ${Math.round(cheapCustomers)} проти ${Math.round(
      balancedCustomers,
    )} — стеля підтримки та сама, а грошей на реінвестування менше; MRR ${money(
      avg(cheapRuns, "mrr"),
    )} проти ${money(avg(base.balanced, "mrr"))}`,
  );
}

// ─────────────────── твердження про кінець партії ───────────────────

check(
  "Кожна партія закінчується: вирок over === true в межах 36 ходів",
  allRuns.every((r) => r.terminated),
  `${allRuns.filter((r) => r.terminated).length}/${allRuns.length} прогонів завершилися`,
);

check(
  "monthLog не перевищує 36 записів, індекси строго зростають",
  allRuns.every((r) => r.logOk),
  `${allRuns.filter((r) => r.logOk).length}/${allRuns.length} логів цілі`,
);

check(
  "Контракт judge(): нефінальний вирок неможливий",
  allRuns.every((r) => r.judgeContractOk),
  `${allRuns.filter((r) => r.judgeContractOk).length}/${allRuns.length} прогонів без порушень`,
);

const codes = new Set(allRuns.map((r) => r.verdictCode));
// Повний перелік вимагаємо лише коли зіграно всі сценарії: `stalled` дає
// сценарій «вечорами», де програш означає застій, а не банкрутство.
const wanted = scenarioIds.length === Object.keys(SCENARIOS).length
  ? ["bankruptcy", "burnout", "win_salary", "win_ramen", "stalled", "stalled_growing"]
  : ["bankruptcy", "win_salary"];
check(
  "Усі основні фінали досяжні",
  wanted.every((code) => codes.has(code)),
  `трапилися: ${[...codes].filter(Boolean).sort().join(", ")}${
    scenarioIds.length === Object.keys(SCENARIOS).length ? "" : " (частковий прогін — перевірено скорочений перелік)"
  }`,
);

// Відтворення партії з початкового сіда має збігтися до місяця — саме на цьому
// тримається розділ розбору «що краще було робити». Порівнюємо прогін,
// згенерований у ЦЬОМУ ж процесі: навмисна зміна балансу не має валити тест.
{
  const original = runOnce("savings", "balanced", 31337);
  const src = original.state;
  const replay = createMonthEngine({
    initialState: createInitialState(SCENARIOS.savings, src.startSeed),
    seed: src.startSeed,
  });
  let mismatch = null;
  for (let i = 0; i < src.monthLog.length; i += 1) {
    const picks = pickByIds(replay.engine.state, src.monthLog[i].actions);
    if (picks.length !== src.monthLog[i].actions.length) { mismatch = `місяць ${i + 1}: дії не відтворилися`; break; }
    replay.playMonth(picks);
    const got = replay.engine.state.biz;
    const want = src.history[i];
    if (got.customers !== want.customers || Math.abs(got.mrr - want.mrr) > 0.5) {
      mismatch = `місяць ${i + 1}: ${Math.round(got.mrr)} проти ${Math.round(want.mrr)}`;
      break;
    }
  }
  check("Партія точно відтворюється з початкового сіда", mismatch === null, mismatch ?? `${src.monthLog.length} місяців збіглися`);
}

// Години мусять відновлюватися з логу: інакше розділ «куди пішли години» бреше.
{
  let worst = 0;
  for (const run of allRuns) {
    for (const entry of run.state.monthLog) {
      const sum = (entry.costs ?? []).reduce((acc, cost) => acc + cost, 0);
      worst = Math.max(worst, Math.abs(sum - entry.hoursSpent));
    }
  }
  check("Витрачені години відновлюються з логу", worst <= 1, `найбільше розходження ${worst} год`);
}

// Ремонт зіпсованого збереження — того самого, яке лишилося після зациклення.
{
  const clean = runOnce("savings", "balanced", 4242).state;
  const broken = structuredClone(clean);
  for (let i = 0; i < 5; i += 1) {
    broken.monthLog.push(structuredClone(broken.monthLog[broken.monthLog.length - 1]));
    broken.history.push(structuredClone(broken.history[broken.history.length - 1]));
  }
  broken.verdict = null;

  const once = repairSave(broken);
  const twice = repairSave(once);
  const idempotent = JSON.stringify(once) === JSON.stringify(twice);
  const ok =
    idempotent &&
    once.monthLog.length === TOTAL_MONTHS &&
    new Set(once.monthLog.map((e) => e.monthIndex)).size === TOTAL_MONTHS &&
    once.verdict?.over === true &&
    once.achieved.salary === clean.achieved.salary;
  check(
    "Зіпсоване збереження ремонтується й дає той самий фінал",
    ok,
    `ідемпотентно: ${idempotent}, місяців: ${once.monthLog.length}, вирок: ${once.verdict?.code}, мета на ${once.achieved.salary} (чисто: ${clean.achieved.salary})`,
  );
}

// Статична узгодженість: жодного маркера без родини й жодної поради в нікуди.
{
  const families = new Set(Object.values(CHAINS_FOR).flat());
  const emitted = new Set();
  for (const run of allRuns) for (const m of run.state.journal) if (m.chainFor) emitted.add(m.chainFor);
  const orphanFamilies = [...emitted].filter((family) => !families.has(family));
  const badRemedies = [...new Set(Object.values(REMEDIES).flat())].filter((id) => !ACTIONS_BY_ID[id]);
  check(
    "Кожна родина маркерів має фінал, кожна порада — існуючу дію",
    orphanFamilies.length === 0 && badRemedies.length === 0,
    orphanFamilies.length || badRemedies.length
      ? `родини без фіналу: ${orphanFamilies.join(", ")}; неіснуючі поради: ${badRemedies.join(", ")}`
      : `${emitted.size} родин, усі поради валідні`,
  );
}

// ─────────────────── твердження про розбір партії ───────────────────

{
  const reviews = allRuns.map((r) => {
    try {
      return buildReview(r.state);
    } catch (error) {
      return { __error: String(error) };
    }
  });

  const broken = reviews.filter((review) => review.__error);
  const usable = reviews.filter(
    (review) =>
      !review.__error &&
      review.strengths.length >= 1 &&
      review.mistakes.length >= 1 &&
      review.stages.some((stage) => stage.played) &&
      review.grades.length === 5 &&
      // Не `spent > 0`: партія, у якій гравець не робив нічого, теж мусить
      // отримати розбір — і саме там нуль витрачених годин є головним фактом.
      review.hours.rows.length === 7 &&
      review.hours.idle >= 0 &&
      review.moments.length >= 1,
  );
  check(
    "Кожен фінал дає придатний розбір",
    broken.length === 0 && usable.length === reviews.length,
    broken.length
      ? `${broken.length} розборів впали: ${broken[0].__error}`
      : `${usable.length}/${reviews.length} розборів повні`,
  );

  // Один регулярний вираз ловить цілий клас помилок форматування: ділення на
  // нуль, невизначене поле, нескінченність — усе, що інакше просочилося б
  // у текст на екрані.
  const dirty = reviews.filter((review) => /NaN|undefined|Infinity/.test(JSON.stringify(review)));
  check(
    "У розборі немає NaN, undefined чи Infinity",
    dirty.length === 0,
    dirty.length ? `${dirty.length} розборів із дірами` : `перевірено ${reviews.length} розборів`,
  );

  // Детектор, який не спрацьовує ніколи, — мертва проза; детектор, який
  // спрацьовує завжди, — шаблон, перевдягнений у доказ.
  const fired = new Map();
  for (const review of reviews) {
    if (review.__error) continue;
    for (const found of [...review.strengths, ...review.mistakes]) {
      fired.set(found.id, (fired.get(found.id) ?? 0) + 1);
    }
  }
  const declared = [...STRENGTHS, ...MISTAKES].length;
  const never = [];
  const always = [];
  for (const [id, count] of fired) {
    if (count > reviews.length * 0.9 && !id.endsWith("_floor")) always.push(id);
  }
  const coverage = fired.size;
  check(
    "Детектори розбору живі: спрацьовують, але не завжди",
    coverage >= Math.round(declared * 0.6) && always.length === 0,
    `спрацювало ${coverage} із ${declared} детекторів${always.length ? `; завжди спрацьовують: ${always.join(", ")}` : ""}`,
  );
  void never;
}

// Найдешевша й найважливіша перевірка: ефект, ціль якого не описана в LIMITS,
// мовчки затискається в [0, 100]. Для biz.cash це прибрало б банкрутство з гри.
const { LIMITS } = await import("../src/game/model.js");
const undeclared = [...seenTargets].filter((target) => !(target in LIMITS));
check(
  "Кожна ціль ефекту описана в LIMITS",
  undeclared.length === 0,
  undeclared.length ? `не описані: ${undeclared.join(", ")}` : `перевірено ${seenTargets.size} шляхів`,
);

const a = runOnce("savings", "balanced", 12345);
const b = runOnce("savings", "balanced", 12345);
check(
  "Детермінізм: той самий сід дає той самий результат",
  JSON.stringify(a) === JSON.stringify(b),
  `MRR ${money(a.mrr)} проти ${money(b.mrr)}`,
);

if (process.argv.includes("--review")) printReview(runOnce(ONLY_SCENARIO ?? "savings", "balanced", 4242).state);

console.log(`\n${"═".repeat(78)}`);
console.log("  ПЕРЕВІРКИ БАЛАНСУ");
console.log("═".repeat(78));
let failed = 0;
for (const item of checks) {
  if (!item.pass) failed += 1;
  console.log(`  ${item.pass ? "PASS" : "FAIL"}  ${item.name}`);
  console.log(`        ${item.detail}`);
}
console.log(`\n  ${checks.length - failed}/${checks.length} пройдено\n`);
process.exitCode = failed > 0 ? 1 : 0;

/** Друкує розбір однієї партії текстом — щоб вичитати формулювання без браузера. */
function printReview(state) {
  const review = buildReview(state);
  const line = (text = "") => console.log(text);

  line(`\n${"═".repeat(78)}`);
  line(`  РОЗБІР: ${review.headline.cause}`);
  line("═".repeat(78));
  line(review.headline.reason);
  line();
  for (const cell of review.headline.numbers) line(`  ${pad(cell.label, 24)}${cell.value}`);

  line("\n  ОЦІНКИ");
  for (const grade of review.grades) {
    line(`  ${pad(grade.label, 24)}${grade.na ? "—  " + grade.na : `${grade.letter}  ${grade.score}/100`}`);
  }

  line("\n  ЕТАПИ");
  for (const stage of review.stages) {
    if (!stage.played) { line(`  ${stage.from}–${stage.to} ${stage.label}: до цього не дійшло`); continue; }
    line(`\n  ${stage.from}–${stage.to} ${stage.label} — ${stage.verdict.toUpperCase()}`);
    line(`     ${stage.criterion}`);
    if (stage.oneThing) line(`     Варто було: ${stage.oneThing.label} — ${stage.oneThing.detail}`);
  }

  line("\n  ЩО ДОБРЕ");
  for (const found of review.strengths.slice(0, 3)) line(`  + ${found.title}: ${found.evidence}`);

  line("\n  ДЕ ПОМИЛКИ");
  for (const found of review.mistakes.slice(0, 3)) {
    line(`  − ${found.title}: ${found.evidence}${found.cost ? ` [${found.cost.text}]` : ""}`);
  }

  line("\n  ГОДИНИ");
  for (const row of review.hours.rows) {
    line(`  ${pad(row.label, 20)}${pad(`${row.hours} год`, 10)}${pad(`${row.sharePct}%`, 8)}норма ${row.referencePct}%  ${row.status}`);
  }
  line(`  ${pad("не витрачено", 20)}${pad(`${review.hours.idle} год`, 10)}${review.hours.idlePct}%`);
  line();
}
