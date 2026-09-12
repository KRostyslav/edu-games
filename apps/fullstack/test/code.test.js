/**
 * Задачі JS-пісочниці: еталон проходить усе (разом із бонусом), а заготовка
 * й «наївний» розв'язок падають. Інакше задача або нерозв'язна, або
 * розв'язується без розуміння.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { CODE_TASKS } from "../src/data/code.js";
import { runTask } from "../src/sandbox/harness.js";

const failures = (result) =>
  result.compileError ? [result.compileError] : result.results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.message}`);

for (const [id, task] of Object.entries(CODE_TASKS)) {
  test(`${id}: форма задачі`, () => {
    for (const key of ["title", "brief", "starter", "reference", "naive"]) {
      assert.ok(typeof task[key] === "string" && task[key].trim(), `${id}: немає ${key}`);
    }
    assert.ok(task.exports?.length >= 1, `${id}: exports`);
    assert.ok(task.tests?.length >= 3, `${id}: основних тестів ≥ 3`);
    assert.ok(task.bonusTests?.length >= 1, `${id}: бонусних тестів ≥ 1`);
    for (const t of [...task.tests, ...task.bonusTests]) assert.ok(t.name && typeof t.run === "function", `${id}: тест без name/run`);
  });

  test(`${id}: еталон проходить усі тести, включно з бонусом`, async () => {
    const result = await runTask(task, task.reference);
    assert.deepEqual(failures(result), []);
    assert.equal(result.ok, true);
    assert.equal(result.bonusOk, true);
  });

  test(`${id}: заготовка падає хоча б на одному основному тесті`, async () => {
    const result = await runTask(task, task.starter, { testTimeoutMs: 300 });
    assert.equal(result.ok, false);
  });

  test(`${id}: наївний розв'язок падає хоча б на одному основному тесті`, async () => {
    const result = await runTask(task, task.naive, { testTimeoutMs: 300 });
    assert.equal(result.ok, false, "наївний розв'язок не повинен проходити — інакше тести не ловлять головну пастку задачі");
  });

  test(`${id}: еталон детермінований — два прогони дають однаковий результат`, async () => {
    const a = await runTask(task, task.reference);
    const b = await runTask(task, task.reference);
    assert.deepEqual(
      a.results.map((r) => r.ok),
      b.results.map((r) => r.ok),
    );
  });
}
