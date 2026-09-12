/**
 * Чекери SQL-задач на справжньому PGlite: result / plan / state / error,
 * бонуси й захист від «обману» через SET enable_seqscan = off.
 * Контентні SQL-задачі перевіряються окремо в sql.test.js.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { createLocalDb } from "../src/sql/local.js";
import { checkTask, runSql, compareResults } from "../src/sql/checkers.js";

const DATASETS = {
  mini: {
    setup: `
      CREATE TABLE users (id int PRIMARY KEY, email text NOT NULL, country text NOT NULL);
      INSERT INTO users SELECT i, 'u' || i || '@x.io', (ARRAY['UA','PL','DE'])[1 + i % 3] FROM generate_series(1, 20000) i;
      CREATE TABLE orders (id int PRIMARY KEY, user_id int NOT NULL, total int NOT NULL);
      INSERT INTO orders SELECT i, 1 + (i * 7919) % 20000, (i * 31) % 500 FROM generate_series(1, 30000) i;
      ANALYZE;`,
  },
};

const db = createLocalDb(PGlite, DATASETS);
test.after(() => db.close());

test("result: значення порівнюються без назв колонок і без порядку, якщо його не просили", async () => {
  const task = { dataset: "mini", reference: "SELECT country, count(*) FROM users GROUP BY country", check: { type: "result" } };
  assert.equal((await checkTask(db, task, "SELECT country AS c, count(id) AS n FROM users GROUP BY 1 ORDER BY 2 DESC")).ok, true);
  const wrong = await checkTask(db, task, "SELECT country, count(*) FROM users WHERE id > 10 GROUP BY country");
  assert.equal(wrong.ok, false);
  assert.match(wrong.reason, /не збігається/);
});

test("result з ordered: порядок важить", async () => {
  const task = { dataset: "mini", reference: "SELECT id FROM users ORDER BY id DESC LIMIT 3", check: { type: "result", ordered: true } };
  assert.equal((await checkTask(db, task, "SELECT id FROM users ORDER BY id DESC LIMIT 3")).ok, true);
  assert.equal((await checkTask(db, task, "SELECT id FROM users WHERE id > 19997 ORDER BY id")).ok, false);
});

test("синтаксична помилка повертається зі SQLSTATE", async () => {
  const task = { dataset: "mini", reference: "SELECT 1", check: { type: "result" } };
  const result = await checkTask(db, task, "SELEC 1");
  assert.equal(result.ok, false);
  assert.match(result.reason, /42601/);
});

test("plan: індекс прибирає Seq Scan; SET enable_seqscan = off не допомагає обдурити перевірку", async () => {
  const task = {
    dataset: "mini",
    reference: "CREATE INDEX ON orders (user_id);",
    check: {
      type: "plan",
      query: "SELECT * FROM orders WHERE user_id = 42",
      expect: { forbid: [{ node: "Seq Scan", relation: "orders" }] },
    },
    bonus: { type: "plan", query: "SELECT * FROM orders WHERE user_id = 42", expect: { maxCost: 60 } },
  };
  const good = await checkTask(db, task, "CREATE INDEX orders_user_idx ON orders (user_id);");
  assert.equal(good.ok, true, good.reason);
  assert.equal(good.bonus, true);
  const none = await checkTask(db, task, "SELECT 1;");
  assert.equal(none.ok, false);
  assert.match(none.reason, /Seq Scan on orders/);
  const cheat = await checkTask(db, task, "SET enable_seqscan = off;");
  assert.equal(cheat.ok, false, "RESET ALL перед перевіркою плану скасовує підкручені налаштування");
});

test("бонус із планом може перевіряти інший запит, ніж основна умова", async () => {
  const task = {
    dataset: "mini",
    reference: "CREATE INDEX ON orders (user_id); CREATE INDEX ON users (email);",
    check: { type: "plan", query: "SELECT id FROM orders WHERE user_id = 42", expect: { forbid: [{ node: "Seq Scan", relation: "orders" }] } },
    bonus: { type: "plan", query: "SELECT id FROM users WHERE email = 'u42@x.io'", expect: { forbid: [{ node: "Seq Scan", relation: "users" }] } },
  };
  const full = await checkTask(db, task, task.reference);
  assert.equal(full.ok, true, full.reason);
  assert.equal(full.bonus, true, "бонус з окремим запитом має звірятися зі своїм еталоном");
  const partial = await checkTask(db, task, "CREATE INDEX ON orders (user_id);");
  assert.equal(partial.ok, true);
  assert.equal(partial.bonus, false);
});

test("часовий пояс бази — UTC незалежно від машини гравця", async () => {
  await db.reset("mini");
  const [result] = await db.exec("SHOW TimeZone");
  assert.equal(result.rows[0][0], "UTC");
});

test("plan: запит мусить повертати те саме, що й до оптимізації", async () => {
  const task = {
    dataset: "mini",
    reference: "CREATE INDEX ON orders (user_id);",
    check: { type: "plan", query: "SELECT id FROM orders WHERE user_id = 42", expect: { forbid: [{ node: "Seq Scan", relation: "orders" }] } },
  };
  const destructive = await checkTask(db, task, "CREATE INDEX ON orders (user_id); DELETE FROM orders WHERE user_id = 42;");
  assert.equal(destructive.ok, false);
  assert.match(destructive.reason, /повертає інше/);
});

test("state: перевірочний запит після змін гравця", async () => {
  const task = {
    dataset: "mini",
    reference: "ALTER TABLE users ADD COLUMN active boolean NOT NULL DEFAULT true;",
    check: {
      type: "state",
      verify: "SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'active'",
      rows: [["active", "NO", "true"]],
    },
  };
  assert.equal((await checkTask(db, task, "ALTER TABLE users ADD COLUMN active boolean NOT NULL DEFAULT true;")).ok, true);
  assert.equal((await checkTask(db, task, "ALTER TABLE users ADD COLUMN active boolean;")).ok, false);
});

test("error: обмеження мусить зупинити некоректну вставку з потрібним SQLSTATE", async () => {
  const task = {
    dataset: "mini",
    reference: "CREATE UNIQUE INDEX ON users (lower(email));",
    check: { type: "error", probe: "INSERT INTO users VALUES (99999, 'U1@X.IO', 'UA')", sqlstate: "23505" },
  };
  assert.equal((await checkTask(db, task, "CREATE UNIQUE INDEX users_email_ci ON users (lower(email));")).ok, true);
  const weak = await checkTask(db, task, "CREATE UNIQUE INDEX ON users (email);");
  assert.equal(weak.ok, false, "регістрозалежний унікальний індекс пропускає U1@X.IO");
});

test("runSql обрізає результат до 200 рядків і повідомляє загальну кількість", async () => {
  await db.reset("mini");
  const out = await runSql(db, "SELECT id FROM users");
  assert.equal(out.results[0].rows.length, 200);
  assert.equal(out.results[0].total, 20000);
  const failed = await runSql(db, "SELECT nope FROM users");
  assert.match(failed.error, /42703/);
});

test("незакрита транзакція гравця не ламає наступне скидання", async () => {
  await db.reset("mini");
  await db.exec("BEGIN; UPDATE users SET country = 'XX';");
  await db.reset("mini");
  const [result] = await db.exec("SELECT count(*) FROM users WHERE country = 'XX'");
  assert.equal(result.rows[0][0], 0);
});

test("compareResults: numeric-рядки й числа рівноправні", () => {
  const a = { fields: ["s"], rows: [["9.0"]] };
  const b = { fields: ["sum"], rows: [[9]] };
  assert.equal(compareResults(a, b).ok, true);
});
