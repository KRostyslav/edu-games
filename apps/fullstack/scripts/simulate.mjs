/**
 * Баланс босів: прогін справжньою машиною станів (game/boss.js) трьох гравців.
 *
 *   reference — знає відповіді: 0 помилок. Має вигравати з повним бюджетом.
 *   careful   — по одній помилці в кожній фазі з вибором. Має вигравати:
 *               бос карає вгадування, а не одну хибну гіпотезу.
 *   guesser   — угадує навмання у фазах із вибором (код і SQL пише як уміє).
 *               Має програвати більшість спроб — інакше бюджет занадто щедрий.
 *
 * Запуск: node scripts/simulate.mjs [спроб=3000] [bossId]
 */

import { createRng } from "@edu/sim-core";
import { BOSS_LIST } from "../src/data/content.js";
import { LABS } from "../src/data/labs.js";
import { startAttempt, bossReduce } from "../src/game/boss.js";

const RUNS = Number(process.argv[2]) || 3000;
const ONLY = process.argv[3] ?? null;
const CHOICE = new Set(["incident", "decision", "isolationLab", "review", "predict", "order"]);

function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Скільки хибних виборів зробить гравець, що тикає навмання без повторів. */
function wrongBeforeRight(flags, rng) {
  let wrong = 0;
  for (const ok of shuffle(flags, rng)) {
    if (ok) return wrong;
    wrong += 1;
  }
  return wrong;
}

function guessMistakes(kind, payload, rng) {
  switch (kind) {
    case "incident":
      return payload.steps.reduce((sum, step) => sum + wrongBeforeRight(step.options.map((o) => Boolean(o.correct)), rng), 0);
    case "decision":
      return wrongBeforeRight(payload.options.map((o) => Boolean(o.correct)), rng);
    case "isolationLab": {
      const q = LABS[payload.lab].question;
      return wrongBeforeRight(
        q.options.map((_, i) => i === q.answer),
        rng,
      );
    }
    case "review": {
      const lines = payload.code.split("\n").length;
      const bad = new Set(payload.bad.map((b) => b.line));
      let found = 0;
      let wrong = 0;
      for (const line of shuffle(
        Array.from({ length: lines }, (_, i) => i + 1),
        rng,
      )) {
        if (bad.has(line)) found += 1;
        else wrong += 1;
        if (found === bad.size) break;
      }
      return wrong;
    }
    case "predict":
    case "order": {
      const items = kind === "predict" ? payload.expected.length : payload.items.length;
      let traps = kind === "order" ? (payload.distractors ?? []).length : 0;
      let wrong = 0;
      for (let position = 0; position < items; position += 1) {
        const candidates = items - position;
        // Навмання серед решти кандидатів: хибний крок — помилка перевірки, пастка — окрема помилка.
        while (true) {
          const pick = rng.int(0, candidates + traps - 1);
          if (pick === 0) break;
          wrong += 1;
          if (pick > candidates - 1) traps -= 1;
        }
      }
      return wrong;
    }
    default:
      return 0;
  }
}

function play(boss, mistakesFor) {
  let attempt = startAttempt(boss);
  boss.phases.forEach((phase, index) => {
    const mistakes = mistakesFor(phase, index);
    for (let i = 0; i < mistakes && attempt.status === "active"; i += 1) attempt = bossReduce(attempt, boss, { type: "mistake", text: "" });
    if (attempt.status === "active") attempt = bossReduce(attempt, boss, { type: "clear", text: phase.title });
  });
  return attempt;
}

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed += 1;
};

for (const boss of BOSS_LIST.filter((b) => !ONLY || b.id === ONLY)) {
  console.log(`\n${boss.id} «${boss.title}»: бюджет ${boss.budget}, фаз ${boss.phases.length} (${boss.phases.map((p) => p.kind).join(", ")})`);
  const reference = play(boss, () => 0);
  check("еталонний гравець перемагає з повним бюджетом", reference.status === "won" && reference.budget === boss.budget);

  const careful = play(boss, (phase) => (CHOICE.has(phase.kind) ? 1 : 0));
  check("уважний гравець (одна помилка на фазу з вибором) перемагає", careful.status === "won", `залишок бюджету ${careful.budget}`);

  const rng = createRng(20260912);
  let wins = 0;
  const perPhase = boss.phases.map(() => 0);
  for (let run = 0; run < RUNS; run += 1) {
    const attempt = play(boss, (phase, index) => {
      const m = guessMistakes(phase.kind, phase.payload, rng);
      perPhase[index] += m;
      return m;
    });
    if (attempt.status === "won") wins += 1;
  }
  const rate = wins / RUNS;
  console.log(`  середня кількість помилок навмання по фазах: ${perPhase.map((sum) => (sum / RUNS).toFixed(1)).join(" / ")}`);
  check("угадувач програє більшість спроб", rate <= 0.4, `перемог навмання: ${(rate * 100).toFixed(1)}%`);
}

if (!BOSS_LIST.length) console.log("Босів ще немає.");
console.log(failed ? `\n${failed} перевірок не пройдено` : "\nБаланс босів у нормі");
process.exitCode = failed ? 1 : 0;
