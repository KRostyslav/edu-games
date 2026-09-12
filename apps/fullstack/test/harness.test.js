/**
 * Harness пісочниці: компіляція, експорти, помилки з номерами рядків,
 * таймаути завислих тестів і перетворення import/export.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { runTask, transformSource, compile, createEnv } from "../src/sandbox/harness.js";

const sumTask = {
  exports: ["sum"],
  tests: [
    { name: "1 + 2", run: ({ mod, assert: a }) => a.equal(mod.sum(1, 2), 3) },
    { name: "від'ємні", run: ({ mod, assert: a }) => a.equal(mod.sum(-1, -2), -3) },
  ],
  bonusTests: [{ name: "без аргументів — 0", run: ({ mod, assert: a }) => a.equal(mod.sum(), 0) }],
};

test("правильний код проходить усі тести, бонус рахується окремо", async () => {
  const result = await runTask(sumTask, "function sum(a = 0, b = 0) { return a + b; }");
  assert.equal(result.ok, true);
  assert.equal(result.bonusOk, true);
  assert.equal(result.results.length, 3);
});

test("основні тести пройдено, бонусний — ні", async () => {
  const result = await runTask(sumTask, "const sum = (a, b) => a + b;");
  assert.equal(result.ok, true);
  assert.equal(result.bonusOk, false);
  assert.match(result.results.at(-1).message, /очікували 0|Очікували 0/);
});

test("синтаксична помилка — одна помилка компіляції, без прогону тестів", async () => {
  const result = await runTask(sumTask, "function sum(a, b) { return a + ; }");
  assert.equal(result.ok, false);
  assert.match(result.compileError, /SyntaxError/);
  assert.equal(result.results.length, 0);
});

test("відсутня функція пояснюється по-людськи", async () => {
  const result = await runTask(sumTask, "function add(a, b) { return a + b; }");
  assert.equal(result.ok, false);
  assert.match(result.results[0].message, /Не знайдено sum/);
});

test("помилка часу виконання показує рядок у коді гравця", async () => {
  const source = ["function sum(a, b) {", "  const x = null;", "  return x.value + a + b;", "}"].join("\n");
  const result = await runTask(sumTask, source);
  assert.match(result.results[0].message, /TypeError/);
  assert.match(result.results[0].message, /рядок 3/);
});

test("завислий проміс ловиться м'яким таймаутом тесту", async () => {
  const task = {
    exports: ["wait"],
    tests: [{ name: "чекає", run: async ({ mod }) => mod.wait() }],
  };
  const result = await runTask(task, "function wait() { return new Promise(() => {}); }", { testTimeoutMs: 50 });
  assert.equal(result.ok, false);
  assert.equal(result.results[0].timeout, true);
  assert.match(result.results[0].message, /Тест завис/);
});

test("export/import переписуються без зсуву рядків, CommonJS теж працює", async () => {
  const source = ['import { EventEmitter } from "node:events";', "export function make() {", "  return new EventEmitter();", "}"].join(
    "\n",
  );
  const transformed = transformSource(source);
  assert.equal(transformed.split("\n").length, 4);
  assert.match(transformed, /const \{ EventEmitter \} = require\("node:events"\)/);
  const env = createEnv({ shims: [] });
  const mod = await compile(source, ["make"], env.globals);
  assert.equal(typeof mod.make().on, "function");
  const cjs = await compile("function hi() { return 1; }\nmodule.exports = { hi };", ["hi"], createEnv({}).globals);
  assert.equal(cjs.hi(), 1);
});

test("стан модуля не протікає між тестами: кожен тест компілює код заново", async () => {
  const task = {
    exports: ["next"],
    tests: [
      { name: "перший", run: ({ mod, assert: a }) => a.equal(mod.next(), 1) },
      { name: "другий", run: ({ mod, assert: a }) => a.equal(mod.next(), 1) },
    ],
  };
  const result = await runTask(task, "let n = 0;\nfunction next() { n += 1; return n; }");
  assert.equal(result.ok, true);
});

test("console гравця збирається в логи", async () => {
  const result = await runTask(sumTask, "function sum(a = 0, b = 0) { console.log('sum', a, b); return a + b; }");
  assert.ok(result.logs.some((line) => line.text === "sum 1 2"));
});

test("фейковий годинник підставляється, коли задача його просить", async () => {
  const task = {
    exports: ["later"],
    shims: ["clock"],
    tests: [
      {
        name: "таймер через фейковий час",
        run: async ({ mod, clock, assert: a }) => {
          let done = false;
          mod.later(() => (done = true));
          await clock.advance(999);
          a.equal(done, false);
          await clock.advance(1);
          a.equal(done, true);
        },
      },
    ],
  };
  const result = await runTask(task, "function later(fn) { setTimeout(fn, 1000); }");
  assert.equal(result.ok, true, JSON.stringify(result.results));
});
