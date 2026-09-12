/**
 * Задачі JS-пісочниці акту «Рантайм».
 *
 * Тести однаково працюють під Node і в браузерному воркері: жодного Buffer,
 * node:crypto чи process.hrtime. «Heartbeat» у тестах — це цикл на `tick()`
 * (справжня макрозадача): якщо код гравця не віддає керування event loop,
 * heartbeat просто не встигає тикнути.
 */

/** Запускає heartbeat на справжніх макрозадачах; повертає зупинку зі зрізами лічильника. */
function startHeartbeat(tick, read) {
  const beats = [];
  let running = true;
  const loop = (async () => {
    while (running) {
      beats.push(read());
      await tick();
    }
  })();
  return async () => {
    running = false;
    await loop;
    beats.push(read());
    let maxGap = 0;
    for (let i = 1; i < beats.length; i += 1) maxGap = Math.max(maxGap, beats[i] - beats[i - 1]);
    return { beats: beats.length, maxGap };
  };
}

/**
 * Помічає проміс обробленим одразу, зберігаючи результат для пізнішого await.
 * Інакше відхилений проміс, який тест перевіряє лише після `clock.runAll()`,
 * Node вважає unhandled rejection і валить процес.
 */
function later(promise) {
  promise.catch(() => {});
  return promise;
}

async function ticks(tick, n) {
  for (let i = 0; i < n; i += 1) await tick();
}

/** Async-джерело для pipe: рахує, скільки забрали, і чи закрили його. */
function source(n, stats = {}) {
  stats.pulled = 0;
  stats.closed = false;
  return (async function* gen() {
    try {
      for (let i = 0; i < n; i += 1) {
        stats.pulled = i + 1;
        yield `chunk-${i}`;
      }
    } finally {
      stats.closed = true;
    }
  })();
}

/** Записує максимум буфера після кожного write(). */
function watchBuffer(dest) {
  const stats = { max: 0, writes: 0 };
  const write = dest.write.bind(dest);
  dest.write = (...args) => {
    const ok = write(...args);
    stats.writes += 1;
    stats.max = Math.max(stats.max, dest.writableLength);
    return ok;
  };
  return stats;
}

const chunks = (n) => Array.from({ length: n }, (_, i) => `chunk-${i}`);

export const CODE = {
  // ─────────────────────────── rt-yield ───────────────────────────
  "rt-yield": {
    title: "Не блокуй: обробка частинами",
    brief:
      "Напишіть `processInChunks(items, fn, { chunkSize = 500 } = {})` — аналог `items.map(fn)`, який не блокує event loop.\n\n" +
      "• повертає Promise з масивом результатів у тому самому порядку; `fn` отримує `(item, index)`\n" +
      "• обробляє не більше `chunkSize` елементів поспіль, потім віддає керування event loop — щоб між частинами встигали таймери, I/O і health check\n" +
      "• якщо `fn` кинула помилку — проміс відхиляється з нею, і далі `fn` не викликається\n" +
      "• порожній масив → `[]`\n\n" +
      "Пастка: `await Promise.resolve()` між частинами нічого не віддає — мікрозадачі виконуються до будь-якої макрозадачі. Потрібна справжня макрозадача: `setImmediate`.",
    exports: ["processInChunks"],
    starter: [
      "async function processInChunks(items, fn, { chunkSize = 500 } = {}) {",
      "  // Обробіть items частинами по chunkSize і між ними віддайте керування event loop.",
      "  return [];",
      "}",
      "",
    ].join("\n"),
    reference: [
      "const yieldToLoop = () => new Promise((resolve) => setImmediate(resolve));",
      "",
      "async function processInChunks(items, fn, { chunkSize = 500, signal } = {}) {",
      "  const results = [];",
      "  for (let start = 0; start < items.length; start += chunkSize) {",
      "    signal?.throwIfAborted();",
      "    const end = Math.min(start + chunkSize, items.length);",
      "    for (let i = start; i < end; i += 1) results.push(fn(items[i], i));",
      "    // Справжня макрозадача: між частинами відпрацюють таймери, I/O і чужі запити.",
      "    if (end < items.length) await yieldToLoop();",
      "  }",
      "  return results;",
      "}",
      "",
    ].join("\n"),
    naive: [
      "async function processInChunks(items, fn, { chunkSize = 500 } = {}) {",
      "  const results = [];",
      "  for (let start = 0; start < items.length; start += chunkSize) {",
      "    const end = Math.min(start + chunkSize, items.length);",
      "    for (let i = start; i < end; i += 1) results.push(fn(items[i], i));",
      "    await Promise.resolve(); // «віддаємо керування»",
      "  }",
      "  return results;",
      "}",
      "",
    ].join("\n"),
    tests: [
      {
        name: "повертає результати в тому самому порядку, fn отримує (item, index)",
        run: async ({ mod, assert }) => {
          assert.deepEqual(await mod.processInChunks(["a", "b", "c"], (x, i) => x + i, { chunkSize: 2 }), ["a0", "b1", "c2"]);
          const items = Array.from({ length: 5000 }, (_, i) => i);
          const out = await mod.processInChunks(items, (x) => x * 2, { chunkSize: 300 });
          assert.equal(out.length, 5000, "кількість результатів");
          assert.ok(out.every((value, i) => value === i * 2), "результати мають іти в порядку елементів");
        },
      },
      {
        name: "між частинами heartbeat встигає тикнути: event loop не заблоковано",
        run: async ({ mod, assert, tick }) => {
          let calls = 0;
          const stop = startHeartbeat(tick, () => calls);
          const items = Array.from({ length: 3000 }, (_, i) => i);
          await mod.processInChunks(items, (x) => {
            calls += 1;
            return x;
          }, { chunkSize: 100 });
          const { maxGap } = await stop();
          assert.equal(calls, 3000, "fn має бути викликана для кожного елемента");
          assert.ok(
            maxGap <= 200,
            `між двома тиками heartbeat виконалось ${maxGap} викликів fn при chunkSize 100 — event loop не отримує керування. Мікрозадача (await Promise.resolve()) не рахується: потрібна макрозадача, як setImmediate`,
          );
        },
      },
      {
        name: "помилка у fn відхиляє проміс, і обробка зупиняється",
        run: async ({ mod, assert, tick }) => {
          let calls = 0;
          const items = Array.from({ length: 1000 }, (_, i) => i);
          await assert.rejects(
            mod.processInChunks(items, (x) => {
              calls += 1;
              if (x === 250) throw new Error("bad item 250");
              return x;
            }, { chunkSize: 100 }),
            /bad item 250/,
          );
          await ticks(tick, 15);
          assert.equal(calls, 251, "після помилки fn більше не викликається");
        },
      },
      {
        name: "порожній масив → [], опції необов'язкові",
        run: async ({ mod, assert }) => {
          assert.deepEqual(await mod.processInChunks([], (x) => x), []);
          assert.deepEqual(await mod.processInChunks([1, 2, 3], (x) => x + 1), [2, 3, 4]);
        },
      },
    ],
    bonusTests: [
      {
        name: "AbortSignal: скасування між частинами відхиляє проміс з AbortError і зупиняє роботу",
        run: async ({ mod, assert, tick }) => {
          const controller = new AbortController();
          let calls = 0;
          const items = Array.from({ length: 2000 }, (_, i) => i);
          await assert.rejects(
            mod.processInChunks(items, (x) => {
              calls += 1;
              if (x === 250) controller.abort();
              return x;
            }, { chunkSize: 100, signal: controller.signal }),
            { name: "AbortError" },
          );
          await ticks(tick, 15);
          assert.ok(calls <= 300, `після abort() оброблено ${calls} елементів — поточна частина може дорахуватись, але нові не починаються`);

          let touched = false;
          const aborted = AbortSignal.abort();
          await assert.rejects(mod.processInChunks([1, 2], () => (touched = true), { signal: aborted }), { name: "AbortError" });
          assert.equal(touched, false, "з уже скасованим сигналом fn не викликається жодного разу");
        },
      },
    ],
  },

  // ─────────────────────────── rt-emitter ───────────────────────────
  "rt-emitter": {
    title: "Свій EventEmitter",
    brief:
      "Напишіть клас `Emitter` — мінімальний `EventEmitter` без `node:events`.\n\n" +
      "• `on(name, fn)` додає слухача й повертає `this` (для ланцюжків)\n" +
      "• `emit(name, ...args)` синхронно викликає слухачів у порядку додавання; повертає `true`, якщо слухачі були, інакше `false`\n" +
      "• `once(name, fn)` — слухач спрацьовує один раз\n" +
      "• `off(name, fn)` знімає слухача (один екземпляр); зняття неіснуючого не падає\n" +
      "• зняття чи додавання слухача під час `emit` не впливає на поточний виклик — як у Node\n" +
      "• `emit(\"error\", err)` без жодного слухача `error` кидає `err`\n\n" +
      "Бонус: `off(name, fn)` знімає й слухача, доданого через `once(name, fn)`; `listenerCount(name)`.",
    exports: ["Emitter"],
    starter: [
      "class Emitter {",
      "  on(name, fn) {",
      "    return this;",
      "  }",
      "",
      "  off(name, fn) {",
      "    return this;",
      "  }",
      "",
      "  once(name, fn) {",
      "    return this;",
      "  }",
      "",
      "  emit(name, ...args) {",
      "    return false;",
      "  }",
      "}",
      "",
    ].join("\n"),
    reference: [
      "class Emitter {",
      "  #events = new Map();",
      "",
      "  on(name, fn) {",
      "    const list = this.#events.get(name) ?? [];",
      "    list.push(fn);",
      "    this.#events.set(name, list);",
      "    return this;",
      "  }",
      "",
      "  once(name, fn) {",
      "    const wrapper = (...args) => {",
      "      this.off(name, wrapper);",
      "      return fn.apply(this, args);",
      "    };",
      "    wrapper.listener = fn; // щоб off(name, fn) знайшов обгортку",
      "    return this.on(name, wrapper);",
      "  }",
      "",
      "  off(name, fn) {",
      "    const list = this.#events.get(name);",
      "    if (!list) return this;",
      "    const i = list.findLastIndex((item) => item === fn || item.listener === fn);",
      "    if (i !== -1) list.splice(i, 1);",
      "    if (list.length === 0) this.#events.delete(name);",
      "    return this;",
      "  }",
      "",
      "  emit(name, ...args) {",
      "    const list = this.#events.get(name);",
      "    if (!list?.length) {",
      '      if (name === "error") throw args[0] instanceof Error ? args[0] : new Error(`Unhandled error: ${args[0]}`);',
      "      return false;",
      "    }",
      "    // Копія: зміни списку під час emit не зачіпають поточний виклик.",
      "    for (const fn of [...list]) fn.apply(this, args);",
      "    return true;",
      "  }",
      "",
      "  listenerCount(name) {",
      "    return this.#events.get(name)?.length ?? 0;",
      "  }",
      "}",
      "",
    ].join("\n"),
    naive: [
      "class Emitter {",
      "  constructor() {",
      "    this.events = {};",
      "  }",
      "",
      "  on(name, fn) {",
      "    (this.events[name] ||= []).push(fn);",
      "    return this;",
      "  }",
      "",
      "  off(name, fn) {",
      "    const list = this.events[name] || [];",
      "    const i = list.indexOf(fn);",
      "    if (i !== -1) list.splice(i, 1);",
      "    return this;",
      "  }",
      "",
      "  once(name, fn) {",
      "    const wrapper = (...args) => {",
      "      this.off(name, wrapper);",
      "      fn(...args);",
      "    };",
      "    return this.on(name, wrapper);",
      "  }",
      "",
      "  emit(name, ...args) {",
      "    const list = this.events[name];",
      "    if (!list || list.length === 0) return false;",
      "    list.forEach((fn) => fn(...args));",
      "    return true;",
      "  }",
      "}",
      "",
    ].join("\n"),
    tests: [
      {
        name: "on і emit: порядок додавання, аргументи, true/false, ланцюжок",
        run: async ({ mod, assert, EventEmitter }) => {
          const e = new mod.Emitter();
          assert.ok(!(e instanceof EventEmitter), "напишіть власну реалізацію, а не обгортку над node:events");
          const calls = [];
          const same = e.on("order", (id, total) => calls.push(`a:${id}:${total}`)).on("order", (id) => calls.push(`b:${id}`));
          assert.equal(same, e, "on() має повертати this");
          assert.equal(e.emit("order", 7, 420), true, "emit зі слухачами повертає true");
          assert.deepEqual(calls, ["a:7:420", "b:7"]);
          assert.equal(e.emit("nobody-listens"), false, "emit без слухачів повертає false");
        },
      },
      {
        name: "once спрацьовує рівно раз і не збиває сусідніх слухачів",
        run: async ({ mod, assert }) => {
          const e = new mod.Emitter();
          const calls = [];
          e.once("tick", () => calls.push("once"));
          e.on("tick", () => calls.push("on"));
          e.emit("tick");
          e.emit("tick");
          assert.deepEqual(
            calls,
            ["once", "on", "on"],
            "once-слухач знімає себе посеред emit; якщо ітерувати живий масив, наступний слухач пропускається",
          );
        },
      },
      {
        name: "зміни списку під час emit не впливають на поточний виклик",
        run: async ({ mod, assert }) => {
          const e = new mod.Emitter();
          const calls = [];
          const b = () => calls.push("b");
          const late = () => calls.push("late");
          e.on("x", () => {
            calls.push("a");
            e.off("x", b);
            e.on("x", late);
          });
          e.on("x", b);
          e.emit("x");
          assert.deepEqual(calls, ["a", "b"], "перший emit: b ще викликається, late — ще ні");
          calls.length = 0;
          e.off("x", late);
          e.emit("x");
          assert.deepEqual(calls, ["a"], "другий emit: b уже знято");
        },
      },
      {
        name: "off знімає слухача; зняття неіснуючого не падає",
        run: async ({ mod, assert }) => {
          const e = new mod.Emitter();
          let n = 0;
          const fn = () => (n += 1);
          e.on("x", fn);
          e.off("x", fn);
          e.off("x", fn);
          e.off("other", fn);
          assert.equal(e.emit("x"), false, "після off слухачів не лишилось");
          assert.equal(n, 0);
        },
      },
      {
        name: "emit('error') без слухача кидає помилку; зі слухачем — передає її",
        run: async ({ mod, assert }) => {
          const e = new mod.Emitter();
          const boom = new Error("socket hang up");
          const thrown = assert.throws(() => e.emit("error", boom), /socket hang up/, "помилку без слухача не можна тихо проковтнути");
          assert.equal(thrown, boom, "кидається саме той об'єкт помилки");
          let got = null;
          e.on("error", (err) => (got = err));
          assert.equal(e.emit("error", boom), true);
          assert.equal(got, boom);
        },
      },
    ],
    bonusTests: [
      {
        name: "off(name, fn) знімає слухача, доданого через once; listenerCount",
        run: async ({ mod, assert }) => {
          const e = new mod.Emitter();
          let n = 0;
          const fn = () => (n += 1);
          e.once("ready", fn);
          e.on("ready", () => {});
          assert.equal(typeof e.listenerCount, "function", "реалізуйте listenerCount(name)");
          assert.equal(e.listenerCount("ready"), 2);
          e.off("ready", fn);
          assert.equal(e.listenerCount("ready"), 1, "off з оригінальною функцією має зняти once-обгортку");
          e.emit("ready");
          assert.equal(n, 0, "знятий once-слухач не мав спрацювати");
          assert.equal(e.listenerCount("nothing"), 0);
        },
      },
    ],
  },

  // ─────────────────────────── rt-backpressure ───────────────────────────
  "rt-backpressure": {
    title: "pipe із backpressure",
    brief:
      "Напишіть `pipe(source, dest)` — копіює async iterable `source` у Writable `dest` і повертає Promise.\n\n" +
      "• пише чанки по порядку через `dest.write(chunk)`\n" +
      "• якщо `write()` повернув `false` — буфер повний: не пишіть далі й не читайте джерело, доки не прийде `'drain'`\n" +
      "• якщо `write()` повернув `true` — пишіть одразу, `'drain'` не прийде\n" +
      "• наприкінці `dest.end()`, а проміс виконується лише після `'finish'` (усе справді записано)\n\n" +
      "`const { once } = require(\"node:events\")` дає `await once(emitter, name)`.\n\n" +
      "Бонус: якщо `dest` кинув `'error'` — проміс відхиляється з цією помилкою, а джерело закривається (читання припиняється).",
    exports: ["pipe"],
    starter: [
      'const { once } = require("node:events");',
      "",
      "async function pipe(source, dest) {",
      "  // for await (const chunk of source) { … }",
      "}",
      "",
    ].join("\n"),
    reference: [
      'const { once } = require("node:events");',
      "",
      "async function pipe(source, dest) {",
      "  let failure = null;",
      "  // Слухач 'error' на весь час копіювання: без нього помилка між write() кинула б виняток у чужому колбеку.",
      "  const onError = (err) => {",
      "    failure ??= err;",
      "  };",
      '  dest.on("error", onError);',
      "  try {",
      "    for await (const chunk of source) {",
      "      if (failure) throw failure; // throw у for await закриває джерело (return())",
      '      if (!dest.write(chunk)) await once(dest, "drain"); // once відхиляється, якщо прийде \'error\'',
      "    }",
      "    if (failure) throw failure;",
      "    dest.end();",
      '    await once(dest, "finish");',
      "  } finally {",
      '    dest.off("error", onError);',
      "  }",
      "}",
      "",
    ].join("\n"),
    naive: [
      'const { once } = require("node:events");',
      "",
      "async function pipe(source, dest) {",
      "  for await (const chunk of source) {",
      "    dest.write(chunk);",
      "  }",
      "  dest.end();",
      '  await once(dest, "finish");',
      "}",
      "",
    ].join("\n"),
    tests: [
      {
        name: "копіює все по порядку, закриває dest і чекає 'finish'",
        run: async ({ mod, assert, Writable, tick }) => {
          const received = [];
          const dest = new Writable({
            objectMode: true,
            highWaterMark: 100,
            write(chunk, encoding, callback) {
              received.push(chunk);
              tick().then(() => callback());
            },
          });
          await mod.pipe(source(20), dest);
          assert.deepEqual(received, chunks(20), "отримані чанки");
          assert.equal(dest.writableFinished, true, "проміс має виконатися після 'finish', а не одразу після end()");
        },
      },
      {
        name: "повільний приймач: буфер не росте понад highWaterMark",
        run: async ({ mod, assert, Writable, tick }) => {
          const received = [];
          const dest = new Writable({
            objectMode: true,
            highWaterMark: 4,
            write(chunk, encoding, callback) {
              received.push(chunk);
              tick().then(() => callback());
            },
          });
          const stats = watchBuffer(dest);
          await mod.pipe(source(40), dest);
          assert.deepEqual(received, chunks(40), "отримані чанки");
          assert.ok(
            stats.max <= 5,
            `у буфері dest накопичилось ${stats.max} чанків при highWaterMark 4. write() повернув false, а код писав далі — на проді це гігабайти в пам'яті`,
          );
        },
      },
      {
        name: "не чекає 'drain', коли write() повернув true",
        run: async ({ mod, assert, Writable }) => {
          const received = [];
          const dest = new Writable({
            objectMode: true,
            highWaterMark: 1000,
            write(chunk, encoding, callback) {
              received.push(chunk);
              callback();
            },
          });
          await mod.pipe(source(10), dest);
          assert.equal(received.length, 10, "усі чанки записано; якщо тест завис — код чекав 'drain', який не прийде");
        },
      },
      {
        name: "поки чекаємо 'drain', джерело не читається наперед",
        run: async ({ mod, assert, Writable, tick }) => {
          const stats = {};
          let received = 0;
          let maxAhead = 0;
          const dest = new Writable({
            objectMode: true,
            highWaterMark: 2,
            write(chunk, encoding, callback) {
              received += 1;
              maxAhead = Math.max(maxAhead, stats.pulled - received);
              tick().then(() => callback());
            },
          });
          await mod.pipe(source(30, stats), dest);
          assert.equal(received, 30);
          assert.ok(maxAhead <= 3, `з джерела забрали на ${maxAhead} чанків більше, ніж записано: читання не зупиняється на backpressure`);
        },
      },
    ],
    bonusTests: [
      {
        name: "'error' у dest відхиляє проміс і закриває джерело",
        run: async ({ mod, assert, Writable, tick }) => {
          const stats = {};
          const dest = new Writable({
            objectMode: true,
            highWaterMark: 2,
            write(chunk, encoding, callback) {
              if (chunk === "chunk-5") callback(new Error("disk full"));
              else tick().then(() => callback());
            },
          });
          await assert.rejects(mod.pipe(source(50, stats), dest), /disk full/);
          await ticks(tick, 3);
          assert.equal(stats.closed, true, "джерело має бути закрите (for await з throw викликає return())");
          assert.ok(stats.pulled < 12, `після помилки з джерела продовжили читати: забрано ${stats.pulled} з 50`);
        },
      },
    ],
  },

  // ─────────────────────────── rt-promise-pool ───────────────────────────
  "rt-promise-pool": {
    title: "mapLimit: не більше N одночасно",
    brief:
      "Напишіть `mapLimit(items, limit, fn)` — як `Promise.all(items.map(fn))`, але одночасно виконується не більше `limit` викликів `fn(item, index)`.\n\n" +
      "• результати — у порядку `items`, а не в порядку завершення\n" +
      "• щойно один виклик завершився — одразу стартує наступний (жодних «пачок»)\n" +
      "• перша помилка відхиляє проміс\n" +
      "• порожній масив → `[]`\n\n" +
      "Бонус: після першої помилки нові виклики `fn` не стартують.",
    exports: ["mapLimit"],
    shims: ["clock"],
    starter: [
      "async function mapLimit(items, limit, fn) {",
      "  return Promise.all(items.map((item, index) => fn(item, index)));",
      "}",
      "",
    ].join("\n"),
    reference: [
      "async function mapLimit(items, limit, fn) {",
      "  const results = new Array(items.length);",
      "  let next = 0;",
      "  let failed = false;",
      "",
      "  // limit «воркерів»; кожен бере наступний індекс, щойно звільнився.",
      "  async function worker() {",
      "    while (next < items.length && !failed) {",
      "      const index = next;",
      "      next += 1;",
      "      try {",
      "        results[index] = await fn(items[index], index);",
      "      } catch (error) {",
      "        failed = true;",
      "        throw error;",
      "      }",
      "    }",
      "  }",
      "",
      "  const size = Math.min(Math.max(1, limit), items.length);",
      "  await Promise.all(Array.from({ length: size }, worker));",
      "  return results;",
      "}",
      "",
    ].join("\n"),
    naive: [
      "async function mapLimit(items, limit, fn) {",
      "  const results = [];",
      "  for (let start = 0; start < items.length; start += limit) {",
      "    const batch = items.slice(start, start + limit);",
      "    results.push(...(await Promise.all(batch.map((item, j) => fn(item, start + j)))));",
      "  }",
      "  return results;",
      "}",
      "",
    ].join("\n"),
    tests: [
      {
        name: "результати в порядку items, а не в порядку завершення",
        run: async ({ mod, assert, clock }) => {
          const p = later(mod.mapLimit([30, 10, 20], 3, (ms, i) => clock.sleep(ms).then(() => `r${i}`)));
          await clock.runAll();
          assert.deepEqual(await p, ["r0", "r1", "r2"]);
        },
      },
      {
        name: "одночасно не більше limit викликів — і limit справді використовується",
        run: async ({ mod, assert, clock }) => {
          let active = 0;
          let max = 0;
          const fn = async (ms) => {
            active += 1;
            max = Math.max(max, active);
            await clock.sleep(ms);
            active -= 1;
            return ms;
          };
          const items = [30, 10, 20, 40, 10, 50, 20, 10];
          const p = later(mod.mapLimit(items, 3, fn));
          await clock.runAll();
          assert.deepEqual(await p, items);
          assert.ok(max <= 3, `одночасно виконувалось ${max} викликів при limit 3`);
          assert.equal(max, 3, "паралелізм не використано повністю");
        },
      },
      {
        name: "звільнений слот одразу бере наступну задачу, без пакетів",
        run: async ({ mod, assert, clock }) => {
          let done = false;
          const p = later(
            mod.mapLimit([100, 10, 10, 10, 10, 10], 2, (ms, i) => clock.sleep(ms).then(() => i)).then((r) => {
              done = true;
              return r;
            }),
          );
          await clock.advance(100);
          assert.ok(
            done,
            "за 100 мс мало все завершитися: поки перша задача йде 100 мс, другий слот устигає зробити п'ять по 10. Пачки по limit чекають найповільнішу",
          );
          assert.deepEqual(await p, [0, 1, 2, 3, 4, 5]);
        },
      },
      {
        name: "перша помилка відхиляє проміс",
        run: async ({ mod, assert, clock }) => {
          const p = mod.mapLimit([10, 20, 5, 30], 2, async (ms, i) => {
            await clock.sleep(ms);
            if (i === 2) throw new Error("boom on 2");
            return i;
          });
          const check = later(assert.rejects(p, /boom on 2/));
          await clock.runAll();
          await check;
        },
      },
      {
        name: "порожній масив і limit більший за кількість елементів",
        run: async ({ mod, assert, clock }) => {
          assert.deepEqual(await mod.mapLimit([], 3, async (x) => x), []);
          const p = later(
            mod.mapLimit([1, 2], 10, async (x) => {
              await clock.sleep(5);
              return x * 10;
            }),
          );
          await clock.runAll();
          assert.deepEqual(await p, [10, 20]);
        },
      },
    ],
    bonusTests: [
      {
        name: "після першої помилки нові задачі не стартують",
        run: async ({ mod, assert, clock }) => {
          let started = 0;
          const p = mod.mapLimit([50, 10, 10, 10, 10, 10], 2, async (ms, i) => {
            started += 1;
            await clock.sleep(ms);
            if (i === 1) throw new Error("boom");
            return i;
          });
          const check = later(assert.rejects(p, /boom/));
          await clock.runAll();
          await check;
          assert.equal(started, 2, `після помилки стартувало ще ${started - 2} задач — кожна з них могла щось списати чи надіслати`);
        },
      },
    ],
  },

  // ─────────────────────────── бос: rt-login-verifier ───────────────────────────
  "rt-login-verifier": {
    title: "Перевірка пароля без блокування",
    brief:
      "Напишіть `createVerifier({ hash, maxConcurrent, maxQueue = Infinity })` → функцію `verify(password, salt, expected)`, яка повертає Promise<boolean>.\n\n" +
      "• `await hash(password, salt)` — асинхронний хеш (у проді — `crypto.pbkdf2` у libuv threadpool); `verify` порівнює результат з `expected`\n" +
      "• одночасно не більше `maxConcurrent` викликів `hash`: решта чекає в черзі (threadpool має 4 потоки, і їх ділять fs та dns.lookup)\n" +
      "• черга FIFO: хто прийшов раніше, той раніше отримує слот\n" +
      "• помилка `hash` відхиляє `verify` і звільняє слот — інакше після кількох помилок сервіс зависне\n\n" +
      "Бонус: якщо в черзі вже `maxQueue` запитів, новий `verify` одразу відхиляється з `err.code === \"OVERLOADED\"` і `hash` не викликає (хендлер відповість 503 з Retry-After).\n\n" +
      "У проді хеші порівнюють через `crypto.timingSafeEqual`; тут для простоти — `===`.",
    exports: ["createVerifier"],
    shims: ["clock"],
    starter: [
      "function createVerifier({ hash, maxConcurrent, maxQueue = Infinity }) {",
      "  return async function verify(password, salt, expected) {",
      "    return false;",
      "  };",
      "}",
      "",
    ].join("\n"),
    reference: [
      "function createVerifier({ hash, maxConcurrent, maxQueue = Infinity }) {",
      "  let active = 0;",
      "  const queue = [];",
      "",
      "  function acquire() {",
      "    if (active < maxConcurrent) {",
      "      active += 1;",
      "      return Promise.resolve();",
      "    }",
      "    if (queue.length >= maxQueue) {",
      '      const error = new Error("Забагато логінів одночасно, спробуйте пізніше");',
      '      error.code = "OVERLOADED";',
      "      return Promise.reject(error);",
      "    }",
      "    return new Promise((resolve) => queue.push(resolve));",
      "  }",
      "",
      "  function release() {",
      "    const next = queue.shift();",
      "    if (next) next(); // слот переходить наступному в черзі, active не змінюється",
      "    else active -= 1;",
      "  }",
      "",
      "  return async function verify(password, salt, expected) {",
      "    await acquire();",
      "    try {",
      "      return (await hash(password, salt)) === expected;",
      "    } finally {",
      "      release();",
      "    }",
      "  };",
      "}",
      "",
    ].join("\n"),
    naive: [
      "function createVerifier({ hash, maxConcurrent, maxQueue = Infinity }) {",
      "  return async function verify(password, salt, expected) {",
      "    const actual = await hash(password, salt); // уже не pbkdf2Sync — отже, не блокує",
      "    return actual === expected;",
      "  };",
      "}",
      "",
    ].join("\n"),
    tests: [
      {
        name: "правильний пароль → true, хибний → false",
        run: async ({ mod, assert, clock }) => {
          const hash = async (password, salt) => {
            await clock.sleep(30);
            return `h(${password}:${salt})`;
          };
          const verify = mod.createVerifier({ hash, maxConcurrent: 2 });
          const good = later(verify("hunter2", "s1", "h(hunter2:s1)"));
          const bad = later(verify("qwerty", "s1", "h(hunter2:s1)"));
          await clock.runAll();
          assert.equal(await good, true);
          assert.equal(await bad, false);
        },
      },
      {
        name: "одночасно не більше maxConcurrent хешів, решта чекає",
        run: async ({ mod, assert, clock }) => {
          let active = 0;
          let max = 0;
          const hash = async (password) => {
            active += 1;
            max = Math.max(max, active);
            await clock.sleep(30);
            active -= 1;
            return `h(${password})`;
          };
          const verify = mod.createVerifier({ hash, maxConcurrent: 4 });
          const all = later(Promise.all(Array.from({ length: 12 }, (_, i) => verify(`p${i}`, "s", `h(p${i})`))));
          await clock.runAll();
          assert.deepEqual(await all, Array(12).fill(true));
          assert.ok(max <= 4, `одночасно рахувалось ${max} хешів при maxConcurrent 4: threadpool забитий, fs і dns.lookup стоять у черзі`);
          assert.equal(max, 4, "слоти треба використовувати повністю");
        },
      },
      {
        name: "черга FIFO: слот отримує той, хто прийшов раніше",
        run: async ({ mod, assert, clock }) => {
          const order = [];
          const hash = async (password) => {
            order.push(password);
            await clock.sleep(10);
            return password;
          };
          const verify = mod.createVerifier({ hash, maxConcurrent: 1 });
          const all = later(Promise.all(["a", "b", "c", "d", "e"].map((p) => verify(p, "s", p))));
          await clock.runAll();
          await all;
          assert.deepEqual(order, ["a", "b", "c", "d", "e"], "порядок, у якому запити отримали слот");
        },
      },
      {
        name: "помилка hash відхиляє verify і звільняє слот",
        run: async ({ mod, assert, clock }) => {
          const hash = async (password) => {
            await clock.sleep(10);
            if (password === "bad") throw new Error("threadpool exploded");
            return `h(${password})`;
          };
          const verify = mod.createVerifier({ hash, maxConcurrent: 1 });
          const failed = later(assert.rejects(verify("bad", "s", "x"), /threadpool exploded/));
          const failed2 = later(assert.rejects(verify("bad", "s", "x"), /threadpool exploded/));
          const ok = later(verify("good", "s", "h(good)"));
          await clock.runAll();
          await failed;
          await failed2;
          assert.equal(await ok, true, "після помилок слот мав звільнитися для наступного запиту");
        },
      },
    ],
    bonusTests: [
      {
        name: "переповнена черга: миттєва відмова OVERLOADED без виклику hash",
        run: async ({ mod, assert, clock }) => {
          let calls = 0;
          const hash = async (password) => {
            calls += 1;
            await clock.sleep(50);
            return password;
          };
          const verify = mod.createVerifier({ hash, maxConcurrent: 2, maxQueue: 3 });
          const accepted = later(Promise.all(Array.from({ length: 5 }, (_, i) => verify(`p${i}`, "s", `p${i}`))));
          await assert.rejects(verify("p5", "s", "p5"), { code: "OVERLOADED" });
          await clock.runAll();
          assert.deepEqual(await accepted, Array(5).fill(true), "2 у роботі + 3 у черзі мають пройти");
          assert.equal(calls, 5, "відхилений запит не має витрачати CPU на хеш");
        },
      },
    ],
  },
};
