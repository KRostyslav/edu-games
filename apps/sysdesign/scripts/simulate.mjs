/**
 * Балансовий прогін без браузера.
 *
 * Шари `src/data` і `src/sim` не торкаються DOM, тому вся модель запускається
 * під голим node. Це не тест «чи не падає», а перевірка того, що рівні вчать
 * правильного: еталонне рішення бере три зірки на всіх seed, а наївне —
 * те, що збирають, не знаючи уроку, — не бере другої. Якщо наївне проходить,
 * рівень нічого не вчить; якщо еталон падає — рівень нерозв'язний.
 *
 *   node scripts/simulate.mjs [seeds=5] [levelId] [--verbose]
 */

import { LEVEL_LIST } from "../src/data/levels.js";
import { SOLUTIONS, buildSolution } from "../src/data/solutions.js";
import { simulate } from "../src/sim/simulate.js";
import { scoreRun } from "../src/sim/score.js";
import { CLASS_LABELS } from "../src/data/constants.js";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const positional = args.filter((arg) => !arg.startsWith("--"));
const SEEDS = Number(positional[0] ?? 5);
const ONLY = positional[1] ?? null;

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.log(`  FAIL ${message}`);
};

const started = performance.now();
let runs = 0;

for (const level of LEVEL_LIST) {
  if (ONLY && level.id !== ONLY) continue;
  const solution = SOLUTIONS[level.id];
  console.log(`\n${level.id} «${level.title}»`);
  if (!solution) {
    fail("немає еталонного рішення");
    continue;
  }

  const variants = [
    { name: "еталон", spec: solution.reference, expect: (stars) => stars === 3, want: "3★" },
    { name: "наївне", spec: solution.naive, expect: (stars) => stars <= 1, want: "≤1★" },
    ...(solution.alternatives ?? []).map((spec, index) => ({ name: `альтернатива ${index + 1}`, spec, expect: (stars) => stars === 3, want: "3★" })),
  ];

  for (const variant of variants) {
    let graph;
    try {
      graph = buildSolution(level, variant.spec);
    } catch (error) {
      fail(`${variant.name}: ${error.message}`);
      continue;
    }

    const starsBySeed = [];
    let sample = null;
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const run = simulate(graph, level, { seed });
      runs += 1;
      if (!run.ok) {
        fail(`${variant.name}: схема не проходить валідацію — ${run.issues.map((issue) => issue.text).join("; ")}`);
        break;
      }
      const score = scoreRun(run, level);
      starsBySeed.push(score.stars);
      if (!sample || score.stars < sample.score.stars) sample = { run, score, seed };
    }
    if (!sample) continue;

    const { run, score } = sample;
    const s = run.summary;
    const p99 = Object.entries(level.slo?.p99Ms ?? {})
      .map(([cls, limit]) => `${CLASS_LABELS[cls]} ${Math.round(s.p99Worst[cls] ?? 0)}/${limit}`)
      .join(", ");
    const line =
      `  ${variant.name.padEnd(14)} ${starsBySeed.map((stars) => `${stars}★`).join(" ")}  ` +
      `$${Math.round(s.cost)}/${level.budget}  доступн. ${(s.availability * 100).toFixed(2)}%  p99 ${p99}` +
      (s.lagMax ? `  лаг ${Math.round(s.lagMax)} с` : "") +
      (s.stalenessMax ? `  свіжість ${Math.round(s.stalenessMax)} с` : "");
    console.log(line);

    if (!starsBySeed.every(variant.expect)) {
      fail(`${variant.name}: очікувалось ${variant.want} на всіх seed`);
      for (const item of score.criteria.filter((criterion) => !criterion.ok)) console.log(`       ✗ ${item.label} — ${item.detail}`);
      for (const note of s.bottlenecks.slice(0, 4)) console.log(`       · ${note.range}: ${note.text}`);
    } else if (verbose) {
      for (const item of score.criteria) console.log(`       ${item.ok ? "✓" : "✗"} ${item.label} — ${item.detail}`);
      for (const note of s.bottlenecks.slice(0, 4)) console.log(`       · ${note.range}: ${note.text}`);
    }

    if (variant.name === "еталон" && level.budget && s.cost < level.budget * 0.5) {
      fail(`еталон коштує $${Math.round(s.cost)} — бюджет $${level.budget} надто щедрий, рівень не вчить економії`);
    }
  }
}

const elapsed = performance.now() - started;
console.log(`\n${runs} прогонів за ${(elapsed / 1000).toFixed(1)} с (${(elapsed / Math.max(1, runs)).toFixed(0)} мс на прогін)`);
if (failures) {
  console.log(`FAIL: ${failures}`);
  process.exitCode = 1;
} else {
  console.log("PASS");
}
