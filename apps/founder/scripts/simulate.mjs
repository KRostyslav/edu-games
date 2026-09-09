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
  let peakMrr = 0;
  let peakMonth = 0;
  let seoAt6 = 0;
  let seoAt24 = 0;

  for (let i = 1; i <= TOTAL_MONTHS; i += 1) {
    const state = season.engine.state;
    if (state.verdict?.over) break;

    const picks = strategy.pick(state);
    const turn = season.playMonth(picks);

    for (const effect of turn.effects) seenTargets.add(effect.target);

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
  return {
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

  const allRuns = Object.values(results).flatMap((byStrategy) => Object.values(byStrategy).flat());
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
    "Урок про ціну: дешевше не купує більше клієнтів, зате вдвічі менше грошей",
    cheapCustomers <= 1.05 * balancedCustomers && avg(cheapRuns, "mrr") < 0.6 * avg(base.balanced, "mrr"),
    `клієнтів ${Math.round(cheapCustomers)} проти ${Math.round(
      balancedCustomers,
    )} — стеля підтримки та сама, а грошей на реінвестування менше; MRR ${money(
      avg(cheapRuns, "mrr"),
    )} проти ${money(avg(base.balanced, "mrr"))}`,
  );
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
