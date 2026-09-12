/**
 * Серце пісочниці: компіляція коду гравця і прогін прихованих тестів задачі.
 *
 * Модуль чистий від DOM і однаково працює у браузерному воркері та під Node
 * (test/code.test.js проганяє ним еталонні розв'язки). Безпекою він не є і
 * бути не мусить: гравець запускає власний код у власному браузері. Від
 * нескінченного циклу рятує не він, а runner, що вбиває воркер за таймаутом.
 *
 * Код гравця обгортається в `AsyncFunction` з блоком усередині: так його
 * `const`/`function` не конфліктують із підставленими глобалами (setTimeout,
 * require, console), а наприкінці ми забираємо оголошені імена задачі.
 */

import { assert, show } from "./assert.js";
import { createClock, realTick } from "./shims/clock.js";
import { EventEmitter, once } from "./shims/events.js";
import { Writable } from "./shims/stream.js";
import * as http from "./shims/http.js";
import { createRedis } from "./shims/redis.js";

const AsyncFunction = (async () => {}).constructor;

export const LIMITS = { testTimeoutMs: 1000, logLines: 60 };

/** Модулі, які можна отримати через require/import у пісочниці. */
function moduleTable() {
  const events = { EventEmitter, once, default: EventEmitter };
  const stream = { Writable };
  return { events, "node:events": events, stream, "node:stream": stream };
}

/** setImmediate без Node: справжня макрозадача через MessageChannel. */
function realTimers() {
  const hasImmediate = typeof setImmediate === "function";
  const immediate = new Map();
  let seq = 0;
  return {
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (...args) => setInterval(...args),
    clearInterval: (id) => clearInterval(id),
    setImmediate: hasImmediate
      ? (...args) => setImmediate(...args)
      : (fn, ...args) => {
          seq += 1;
          const id = seq;
          immediate.set(id, true);
          realTick().then(() => {
            if (immediate.delete(id)) fn(...args);
          });
          return id;
        },
    clearImmediate: hasImmediate ? (id) => clearImmediate(id) : (id) => void immediate.delete(id),
    Date,
  };
}

function makeConsole(logs) {
  const push = (level) => (...args) => {
    if (logs.length >= LIMITS.logLines) return;
    logs.push({ level, text: args.map((arg) => (typeof arg === "string" ? arg : show(arg))).join(" ") });
  };
  return { log: push("log"), info: push("info"), warn: push("warn"), error: push("error"), debug: push("debug") };
}

/** Свіже оточення одного тесту: власний годинник, власний Redis, власна консоль. */
export function createEnv(task, logs = []) {
  const clock = task.shims?.includes("clock") ? createClock() : null;
  const timers = clock ?? realTimers();
  const modules = moduleTable();
  const require = (name) => {
    if (Object.hasOwn(modules, name)) return modules[name];
    throw new Error(`Модуль "${name}" недоступний у пісочниці. Доступні: ${Object.keys(modules).join(", ")}`);
  };
  const module = { exports: {} };
  const globals = {
    console: makeConsole(logs),
    require,
    module,
    exports: module.exports,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    setImmediate: timers.setImmediate,
    clearImmediate: timers.clearImmediate,
    Date: timers.Date,
    // nextTick як мікрозадача: точний пріоритет черги nextTick над промісами
    // тут не відтворюється — цьому вчать predict-рівні на справжньому Node.
    process: { nextTick: (fn, ...args) => queueMicrotask(() => fn(...args)), env: {}, platform: "sandbox" },
  };
  const tools = {
    clock,
    redis: createRedis({ now: clock ? clock.now : () => Date.now() }),
    http,
    EventEmitter,
    once,
    Writable,
    tick: realTick,
    logs,
  };
  return { globals, tools, module };
}

// ─────────────────────────── компіляція ───────────────────────────

/**
 * ESM-синтаксис у тілі функції неможливий, тож прості форми імпорту/експорту
 * переписуємо рядок у рядок (номери рядків не зсуваються).
 */
export function transformSource(source) {
  return String(source ?? "")
    .split("\n")
    .map((line) => {
      let m = line.match(/^\s*import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["'];?\s*$/);
      if (m) return `const ${m[1]} = require(${JSON.stringify(m[2])});`;
      m = line.match(/^\s*import\s+\{([^}]*)\}\s+from\s+["']([^"']+)["'];?\s*$/);
      if (m) {
        const names = m[1]
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => part.replace(/\s+as\s+/, ": "));
        return `const { ${names.join(", ")} } = require(${JSON.stringify(m[2])});`;
      }
      m = line.match(/^\s*import\s+(\w+)\s+from\s+["']([^"']+)["'];?\s*$/);
      if (m) return `const ${m[1]} = require(${JSON.stringify(m[2])}).default ?? require(${JSON.stringify(m[2])});`;
      if (/^\s*export\s*\{[^}]*\}\s*;?\s*$/.test(line)) return "";
      return line.replace(/^(\s*)export\s+(default\s+)?(?=(async\s+)?(function|class|const|let|var)\b)/, "$1");
    })
    .join("\n");
}

function buildBody(source, exportNames) {
  const picks = exportNames
    .map((name) => `${JSON.stringify(name)}: typeof ${name} !== "undefined" ? ${name} : undefined`)
    .join(", ");
  return `"use strict";\n{\n${transformSource(source)}\n;return { ${picks} };\n}\n//# sourceURL=solution.js`;
}

let lineOffset = null;

/** Скільки службових рядків рушій додає перед кодом гравця — вимірюємо, а не вгадуємо. */
function measureOffset(names) {
  if (lineOffset !== null) return lineOffset;
  try {
    new Function(...names, buildBody("throw new Error('probe');", []))(...names.map(() => undefined));
  } catch (error) {
    const line = locateRaw(error);
    lineOffset = line === null ? 0 : line - 1;
  }
  return lineOffset;
}

function locateRaw(error) {
  const match = String(error?.stack ?? "").match(/solution\.js:(\d+):\d+/);
  return match ? Number(match[1]) : null;
}

/** Рядок у коді гравця, де сталася помилка, або null. */
export function locateError(error, names) {
  const raw = locateRaw(error);
  if (raw === null) return null;
  const line = raw - measureOffset(names);
  return line >= 1 ? line : null;
}

export function describeError(error, names = []) {
  if (error?.name === "AssertionError") return error.message;
  const line = locateError(error, names);
  const text = error instanceof Error ? `${error.name}: ${error.message}` : `Кинуто не Error: ${show(error)}`;
  return line ? `${text} (рядок ${line})` : text;
}

/** Компілює код гравця в оточенні й повертає об'єкт з оголошеними іменами задачі. */
export async function compile(source, exportNames, globals) {
  const names = Object.keys(globals);
  const factory = new AsyncFunction(...names, buildBody(source, exportNames));
  const picked = await factory(...names.map((name) => globals[name]));
  // CommonJS-стиль: module.exports = { retry } теж рахується.
  const cjs = globals.module?.exports ?? {};
  for (const name of exportNames) if (picked[name] === undefined && cjs[name] !== undefined) picked[name] = cjs[name];
  return picked;
}

// ─────────────────────────── прогін тестів ───────────────────────────

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(
        `Тест завис: результат не з'явився за ${ms} мс. Схоже, код чекає на подію, яка не настане — забутий resolve, колбек чи 'drain'.`,
      );
      error.code = "TEST_TIMEOUT";
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Проганяє код гравця на тестах задачі.
 * Кожен тест отримує свіжу компіляцію: стан модуля (кеш, лічильник) не
 * протікає з тесту в тест, як і між запитами до різних інстансів сервісу.
 *
 * @returns {{ ok, bonusOk, compileError, results: {name, ok, bonus, message, timeout}[], logs }}
 */
export async function runTask(task, source, { testTimeoutMs = LIMITS.testTimeoutMs } = {}) {
  const logs = [];
  const names = Object.keys(createEnv(task).globals);
  const tests = [
    ...task.tests.map((test) => ({ ...test, bonus: false })),
    ...(task.bonusTests ?? []).map((test) => ({ ...test, bonus: true })),
  ];

  try {
    await compile(source, task.exports, createEnv(task, logs).globals);
  } catch (error) {
    return { ok: false, bonusOk: false, compileError: describeError(error, names), results: [], logs };
  }

  const results = [];
  for (const test of tests) {
    const env = createEnv(task, logs);
    const entry = { name: test.name, bonus: test.bonus, ok: false, message: "", timeout: false };
    try {
      const mod = await compile(source, task.exports, env.globals);
      const missing = task.exports.filter((name) => typeof mod[name] === "undefined");
      if (missing.length) {
        entry.message = `Не знайдено ${missing.join(", ")}: оголосіть саме з такою назвою`;
      } else {
        await withTimeout(Promise.resolve().then(() => test.run({ mod, assert, ...env.tools })), testTimeoutMs);
        entry.ok = true;
      }
    } catch (error) {
      entry.message = describeError(error, names);
      entry.timeout = error?.code === "TEST_TIMEOUT";
    }
    results.push(entry);
  }

  const main = results.filter((r) => !r.bonus);
  const bonus = results.filter((r) => r.bonus);
  return {
    ok: main.length > 0 && main.every((r) => r.ok),
    bonusOk: bonus.length > 0 && bonus.every((r) => r.ok),
    compileError: null,
    results,
    logs,
  };
}
