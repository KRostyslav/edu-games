/**
 * Правила відкриття, кар'єри, інструментів і XP на справжньому контенті.
 * Нічого з цього не зберігається — усе виводиться з прогресу, тож тести
 * будують прогрес руками й перевіряють висновки.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PLAYABLE_ACTS } from "../src/data/acts.js";
import { LEVEL_LIST, BOSS_LIST, levelsOfAct, bossOfAct } from "../src/data/content.js";
import { defaultProgress } from "../src/progress/store.js";
import { isActOpen, isLevelOpen, isBossOpen, nextStep, afterLevel } from "../src/game/unlock.js";
import { gradeIndex, currentGrade } from "../src/game/career.js";
import { toolUnlocked } from "../src/game/loadout.js";
import { TOOLS_BY_ID } from "../src/data/tools.js";
import { xpOf } from "../src/game/xp.js";

const starAll = (progress, actId, stars = 1) => {
  for (const level of levelsOfAct(actId)) progress.levels[level.id] = { stars, hintsUsed: 0, solvedAt: 1 };
};

test("новий гравець: відкрито лише перший рівень прологу", () => {
  const p = defaultProgress();
  const open = LEVEL_LIST.filter((level) => isLevelOpen(p, level.id)).map((level) => level.id);
  assert.deepEqual(open, [LEVEL_LIST[0].id]);
  assert.deepEqual(nextStep(p), { type: "level", id: LEVEL_LIST[0].id });
});

test("рівні відкриваються по черзі в межах акту", () => {
  const p = defaultProgress();
  const [first, second, third] = levelsOfAct("prologue");
  p.levels[first.id] = { stars: 1, hintsUsed: 0, solvedAt: 1 };
  assert.equal(isLevelOpen(p, second.id), true);
  if (third) assert.equal(isLevelOpen(p, third.id), false);
});

test("акт відкривається після завершення попереднього, бос — коли всі рівні акту мають ★", () => {
  const p = defaultProgress();
  starAll(p, "prologue");
  const [, next] = PLAYABLE_ACTS;
  if (!next || !levelsOfAct(next.id).length) return;
  assert.equal(isActOpen(p, next.id), true);
  const boss = bossOfAct(next.id);
  if (!boss) return;
  assert.equal(isBossOpen(p, boss.id), false);
  starAll(p, next.id);
  assert.equal(isBossOpen(p, boss.id), true);
  assert.deepEqual(nextStep(p), { type: "boss", id: boss.id });
  const last = levelsOfAct(next.id).at(-1);
  assert.deepEqual(afterLevel(p, last.id), { type: "boss", id: boss.id });
  const third = PLAYABLE_ACTS[2];
  if (third) {
    assert.equal(isActOpen(p, third.id), false, "без перемоги над босом наступний акт закритий");
    p.bosses[boss.id] = { won: true, attempts: 1, bestBudget: 1, wonAt: 1 };
    assert.equal(isActOpen(p, third.id), true);
  }
});

test("грейд росте лише послідовно: перемога над пізнім босом без раннього не підвищує", () => {
  const p = defaultProgress();
  assert.equal(currentGrade(p).id, "frontend");
  const runtime = BOSS_LIST.find((boss) => boss.act === "runtime");
  const data = BOSS_LIST.find((boss) => boss.act === "data");
  if (data) {
    p.bosses[data.id] = { won: true, attempts: 1, bestBudget: 1, wonAt: 1 };
    assert.equal(gradeIndex(p), 0);
  }
  if (runtime) {
    p.bosses[runtime.id] = { won: true, attempts: 1, bestBudget: 1, wonAt: 1 };
    assert.equal(currentGrade(p).id, data ? "middle" : "junior");
  }
});

test("інструменти: качка — за пролог, кава — за серію стендапів, решта — за ★★★ на своєму рівні", () => {
  const p = defaultProgress();
  assert.equal(toolUnlocked(p, TOOLS_BY_ID.duck), false);
  starAll(p, "prologue");
  assert.equal(toolUnlocked(p, TOOLS_BY_ID.duck), true);
  assert.equal(toolUnlocked(p, TOOLS_BY_ID.coffee), false);
  p.quiz.streak = 3;
  assert.equal(toolUnlocked(p, TOOLS_BY_ID.coffee), true);
  const flame = TOOLS_BY_ID.flamegraph.unlock.level;
  p.levels[flame] = { stars: 2, hintsUsed: 0, solvedAt: 1 };
  assert.equal(toolUnlocked(p, TOOLS_BY_ID.flamegraph), false);
  p.levels[flame].stars = 3;
  assert.equal(toolUnlocked(p, TOOLS_BY_ID.flamegraph), true);
});

test("XP рахується із зірок, босів, освоєних карток і прочитаних статей", () => {
  const p = defaultProgress();
  assert.equal(xpOf(p), 0);
  p.levels.a = { stars: 3, hintsUsed: 0, solvedAt: 1 };
  p.bosses.b = { won: true, attempts: 1, bestBudget: 1, wonAt: 1 };
  p.quiz.boxes.c = { box: 4, due: 0, seen: 3, correct: 3 };
  p.quiz.boxes.d = { box: 2, due: 0, seen: 1, correct: 1 };
  p.codex.read.e = true;
  assert.equal(xpOf(p), 3 * 10 + 100 + 2 + 1);
});
