/**
 * Бій із босом як машина станів і відновлення прогресу.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { startAttempt, bossReduce, bossHp, canTakeHint, canUseTool, attemptSummary } from "../src/game/boss.js";
import { repairProgress, defaultProgress, createProgressStore } from "../src/progress/store.js";
import { starsFor } from "../src/game/stars.js";
import { heroLevel, xpForLevel } from "../src/game/xp.js";
import { checkSequence, shuffledIndices, reviewClick } from "../src/game/grade.js";

const BOSS = {
  id: "boss-x",
  title: "Тест",
  budget: 3,
  phases: [
    { id: "a", kind: "incident", hints: ["h1", "h2"], tools: { flamegraph: "…" } },
    { id: "b", kind: "codeQuest", hints: [] },
  ],
};
const DUCK = { id: "duck", title: "Качка", effect: "assist" };
const FLAME = { id: "flamegraph", title: "Flame graph", effect: "reveal" };
const COFFEE = { id: "coffee", title: "Кава", effect: "budget" };

test("перемога: усі фази пройдено, бюджет лишився", () => {
  let a = startAttempt(BOSS);
  assert.equal(bossHp(a, BOSS), 2);
  a = bossReduce(a, BOSS, { type: "mistake", text: "не та гіпотеза" });
  a = bossReduce(a, BOSS, { type: "clear" });
  assert.equal(bossHp(a, BOSS), 1);
  a = bossReduce(a, BOSS, { type: "clear" });
  assert.equal(a.status, "won");
  assert.equal(a.budget, 2);
  assert.equal(attemptSummary(a).mistakes, 1);
});

test("поразка: бюджет на нулі — інцидент ескалює, далі дії ігноруються", () => {
  let a = startAttempt(BOSS);
  for (let i = 0; i < 3; i += 1) a = bossReduce(a, BOSS, { type: "mistake", text: `m${i}` });
  assert.equal(a.status, "lost");
  assert.equal(a.budget, 0);
  const after = bossReduce(a, BOSS, { type: "clear" });
  assert.equal(after, a);
});

test("підказка коштує одиницю бюджету, але останню одиницю не забирає", () => {
  let a = startAttempt(BOSS);
  a = bossReduce(a, BOSS, { type: "hint" });
  assert.equal(a.budget, 2);
  a = bossReduce(a, BOSS, { type: "hint" });
  assert.equal(a.budget, 1);
  assert.equal(canTakeHint(a, BOSS), false);
  assert.equal(bossReduce(a, BOSS, { type: "hint" }), a);
});

test("інструменти: одноразові; reveal лише там, де фаза його передбачила; кава додає бюджет", () => {
  let a = startAttempt(BOSS);
  assert.equal(canUseTool(a, BOSS, FLAME), true);
  a = bossReduce(a, BOSS, { type: "tool", tool: FLAME });
  assert.equal(canUseTool(a, BOSS, FLAME), false);
  a = bossReduce(a, BOSS, { type: "tool", tool: COFFEE });
  assert.equal(a.budget, 4);
  a = bossReduce(a, BOSS, { type: "clear" });
  assert.equal(canUseTool(a, BOSS, DUCK), false, "качка не допомагає писати код");
});

test("repairProgress: сміття на вході — чистий дефолт, повторний прогін нічого не змінює", () => {
  for (const raw of [null, 42, "x", [], { levels: 5 }, { quiz: { boxes: { a: "bad" } } }]) {
    const once = repairProgress(raw);
    assert.deepEqual(repairProgress(once), once);
  }
  assert.deepEqual(repairProgress(undefined), defaultProgress());
});

test("repairProgress: відкидає невідомі id і незавершену спробу, яку не можна продовжити", () => {
  const raw = {
    levels: { a: { stars: 7, hintsUsed: -1 }, ghost: { stars: 3 } },
    bosses: { "boss-x": { won: true, attempts: 2 } },
    activeBoss: { bossId: "boss-x", phase: 5, budget: 2, status: "active" },
    drafts: { t1: "x".repeat(30_000), unknown: "y" },
  };
  const ids = { levels: ["a"], bosses: ["boss-x"], tasks: ["t1"], bossPhases: { "boss-x": 2 } };
  const out = repairProgress(raw, ids);
  assert.deepEqual(Object.keys(out.levels), ["a"]);
  assert.equal(out.levels.a.stars, 3);
  assert.equal(out.levels.a.hintsUsed, 0);
  assert.equal(out.activeBoss, null, "фаза 5 з 2 — продовжити неможливо");
  assert.equal(out.drafts.t1.length, 20_000);
  assert.equal(out.drafts.unknown, undefined);
  const resumable = repairProgress({ ...raw, activeBoss: { ...raw.activeBoss, phase: 1 } }, ids);
  assert.equal(resumable.activeBoss.phase, 1);
  assert.deepEqual(repairProgress(resumable, ids), resumable);
});

test("сховище переживає збереження й завантаження через підмінний бекенд", () => {
  let saved = null;
  const backend = { load: () => saved, save: (data) => void (saved = structuredClone(data)) };
  const store = createProgressStore({ backend });
  store.update((s) => (s.levels.a = { stars: 2, hintsUsed: 1, solvedAt: 1 }), { immediate: true });
  const again = createProgressStore({ backend });
  assert.equal(again.state.levels.a.stars, 2);
});

test("зірки: ★ пройдено, ★★ без підказок, ★★★ бонус", () => {
  const level = { bonus: { type: "firstTry" } };
  assert.equal(starsFor(level, { mistakes: 0 }, 0), 3);
  assert.equal(starsFor(level, { mistakes: 1 }, 0), 2);
  assert.equal(starsFor(level, { mistakes: 0 }, 2), 2);
  assert.equal(starsFor(level, { mistakes: 3 }, 3), 1);
  assert.equal(starsFor({ bonus: { type: "tests" } }, { bonus: true, mistakes: 5 }, 0), 3);
});

test("рівень героя росте за зростаючими порогами XP", () => {
  assert.equal(heroLevel(0).level, 1);
  assert.equal(heroLevel(xpForLevel(2)).level, 2);
  assert.equal(heroLevel(xpForLevel(5) - 1).level, 4);
  assert.ok(heroLevel(120).into < heroLevel(120).need);
});

test("грейдери: послідовність, перемішування, code review", () => {
  assert.deepEqual(checkSequence(["a", "b", "c"], ["a", "c", "b"]), { ok: false, firstWrong: 1, prefix: 1 });
  assert.equal(checkSequence(["a", "b"], ["a", "b"]).ok, true);
  const order = shuffledIndices(5, "seed");
  assert.deepEqual([...order].sort(), [0, 1, 2, 3, 4]);
  assert.notDeepEqual(order, [0, 1, 2, 3, 4]);
  assert.deepEqual(shuffledIndices(5, "seed"), order, "те саме зерно — те саме перемішування");
  const review = { bad: [{ line: 3, why: "SQL injection" }], fine: { 1: "імпорт" } };
  assert.deepEqual(reviewClick(review, 3), { hit: true, why: "SQL injection" });
  assert.equal(reviewClick(review, 1).why, "імпорт");
});
