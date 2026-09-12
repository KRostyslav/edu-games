/**
 * MVCC-лабораторія: симулятор мусить відтворювати семантику Postgres, а
 * заявлені в контенті `expect` варіантів — збігатися з реальним прогоном.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { runLab, outcomeOf, sqlOf } from "../src/labs/mvcc.js";
import { LABS } from "../src/data/labs.js";

for (const [labId, lab] of Object.entries(LABS)) {
  for (const variant of lab.variants) {
    test(`${labId} / ${variant.id}: симуляція збігається з поясненням`, () => {
      const result = runLab(lab, variant);
      const outcome = outcomeOf(result);
      assert.equal(outcome.anomaly, variant.expect.anomaly, `аномалія: ${result.verdict.text}`);
      assert.deepEqual(outcome.aborted, variant.expect.aborted);
      if ("deadlock" in variant.expect) assert.equal(outcome.deadlock, variant.expect.deadlock);
    });
  }

  test(`${labId}: запитання коректне`, () => {
    const { question } = lab;
    assert.ok(question.options.length >= 3);
    assert.ok(question.answer >= 0 && question.answer < question.options.length);
    assert.ok(question.explain.length > 40);
    const problem = (v) => v.expect.anomaly || v.expect.aborted.length > 0;
    assert.ok(lab.variants.some(problem), "хоч один варіант має показувати проблему: аномалію або перервану транзакцію");
    assert.ok(lab.variants.some((v) => !problem(v)), "хоч один варіант має обходитися без проблем");
    for (const v of lab.variants) assert.ok(v.label && v.note && ["RC", "RR", "SER"].includes(v.iso), `${labId}/${v.id}: label/note/iso`);
  });
}

test("READ COMMITTED: lost update — T2 перезаписує значенням, прочитаним до коміту T1", () => {
  const result = runLab(LABS["lab-lost-update"], { iso: "RC" });
  assert.equal(result.final[0].qty, 9);
  assert.ok(result.events.some((event) => event.kind === "wait" && event.tx === "T2"));
});

test("атомарний UPDATE перечитує свіжу версію рядка після очікування", () => {
  const lab = LABS["lab-lost-update"];
  const result = runLab(lab, lab.variants.find((v) => v.id === "atomic"));
  assert.equal(result.final[0].qty, 8);
});

test("REPEATABLE READ: знімок береться на першій інструкції, а не на BEGIN", () => {
  const lab = {
    table: { name: "t", columns: ["id", "v"], rows: [{ id: 1, v: 0 }] },
    t1: [{ op: "begin" }, { op: "update", id: 1, col: "v", value: { const: 5 } }, { op: "commit" }],
    t2: [{ op: "begin" }, { op: "read", id: 1, col: "v", as: "seen" }, { op: "commit" }],
    // T2 почала (BEGIN) раніше за коміт T1, але перше читання — після нього.
    schedule: ["T2", "T1", "T1", "T1", "T2", "T2"],
    invariant: { type: "minCount", where: { col: "v", eq: 5 }, min: 1 },
  };
  const result = runLab(lab, { iso: "RR" });
  assert.equal(result.txs.T2.vars.seen, 5);
});

test("REPEATABLE READ: не бачить змін, закомічених після знімка", () => {
  const lab = {
    table: { name: "t", columns: ["id", "v"], rows: [{ id: 1, v: 0 }] },
    t1: [{ op: "begin" }, { op: "update", id: 1, col: "v", value: { const: 5 } }, { op: "commit" }],
    t2: [{ op: "begin" }, { op: "read", id: 1, col: "v", as: "a" }, { op: "read", id: 1, col: "v", as: "b" }, { op: "commit" }],
    schedule: ["T2", "T2", "T1", "T1", "T1", "T2", "T2"],
    invariant: { type: "minCount", where: { col: "v", eq: 5 }, min: 1 },
  };
  const rr = runLab(lab, { iso: "RR" });
  assert.deepEqual([rr.txs.T2.vars.a, rr.txs.T2.vars.b], [0, 0]);
  const rc = runLab(lab, { iso: "RC" });
  assert.deepEqual([rc.txs.T2.vars.a, rc.txs.T2.vars.b], [0, 5], "READ COMMITTED бачить новий коміт на другій інструкції");
});

test("SERIALIZABLE: перша транзакція комітиться, друга отримує serialization failure", () => {
  const result = runLab(LABS["lab-write-skew"], { iso: "SER" });
  assert.equal(result.txs.T1.status, "committed");
  assert.equal(result.txs.T2.status, "aborted");
  assert.match(result.txs.T2.error, /read\/write dependencies/);
});

test("дедлок: одна транзакція переривається, друга завершується", () => {
  const result = runLab(LABS["lab-deadlock"], { iso: "RC" });
  assert.equal(result.txs.T1.status, "committed");
  assert.equal(result.txs.T2.status, "aborted");
  assert.deepEqual(
    result.final.map((row) => row.balance),
    [70, 130],
  );
});

test("sqlOf показує SQL так, як його написав би застосунок", () => {
  const table = { name: "items" };
  assert.equal(sqlOf({ op: "update", id: 1, col: "qty", value: { self: true, add: -1 } }, table), "UPDATE items SET qty = qty - 1 WHERE id = 1;");
  assert.equal(sqlOf({ op: "update", id: 1, col: "qty", value: { var: "x", add: -1 } }, table), "UPDATE items SET qty = :x - 1 WHERE id = 1;");
  assert.equal(sqlOf({ op: "begin" }, table, "SER"), "BEGIN ISOLATION LEVEL SERIALIZABLE;");
});
