/**
 * Контентні SQL-задачі на справжньому Postgres (PGlite): еталон проходить
 * (разом із бонусом), заготовка й наївний розв'язок — ні; датасети дрібні
 * й детерміновані, щоб план запиту не «гуляв» між запусками.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { createLocalDb } from "../src/sql/local.js";
import { checkTask } from "../src/sql/checkers.js";
import { SQL_TASKS, DATASETS } from "../src/data/sql.js";

const db = createLocalDb(PGlite, DATASETS);
test.after(() => db.close());

for (const [id, dataset] of Object.entries(DATASETS)) {
  test(`датасет ${id}: детермінований, з ANALYZE, таблиці ≤ 30 000 рядків`, async () => {
    assert.doesNotMatch(dataset.setup, /random\s*\(/i, "без random(): план має бути відтворюваним");
    assert.match(dataset.setup, /\bANALYZE\b/i, "сід мусить закінчуватися ANALYZE");
    assert.ok(dataset.tables?.length >= 1 && dataset.tables.every((t) => t.name && t.columns), `${id}: опишіть tables`);
    await db.reset(id);
    const [result] = await db.exec("SELECT relname, reltuples::int FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace");
    for (const [name, rows] of result.rows) assert.ok(rows <= 30_000, `${name}: ${rows} рядків`);
  });
}

for (const [id, task] of Object.entries(SQL_TASKS)) {
  test(`${id}: еталон проходить і дає бонус, заготовка й наївний розв'язок — ні`, async () => {
    for (const key of ["title", "brief", "starter", "reference", "naive"]) assert.ok(typeof task[key] === "string" && task[key].trim(), `немає ${key}`);
    const reference = await checkTask(db, task, task.reference);
    assert.equal(reference.ok, true, `еталон: ${reference.reason}`);
    if (task.bonus) assert.equal(reference.bonus, true, "еталон мусить отримувати бонус");
    const again = await checkTask(db, task, task.reference);
    assert.equal(again.ok, true, "еталон стабільний на повторному свіжому датасеті");
    const naive = await checkTask(db, task, task.naive);
    assert.equal(naive.ok, false, "наївний розв'язок не має проходити");
    const starter = await checkTask(db, task, task.starter);
    assert.equal(starter.ok, false, "заготовка не має проходити");
  });
}
