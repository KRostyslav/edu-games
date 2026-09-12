/**
 * Тест відповідності шимів пісочниці справжньому Node.
 *
 * Однакові сценарії проганяються на `node:events` / `node:stream` і на наших
 * шимах; траси мусять збігтися до символу. Якщо шим розійдеться з Node, гра
 * навчить поведінки, якої в продакшені немає, — тому це найважливіший тест
 * пісочниці.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter as NodeEmitter, once as nodeOnce } from "node:events";
import { Writable as NodeWritable } from "node:stream";
import { EventEmitter, once } from "../src/sandbox/shims/events.js";
import { Writable } from "../src/sandbox/shims/stream.js";
import { createRequest, createResponse, runMiddleware } from "../src/sandbox/shims/http.js";
import { createRedis } from "../src/sandbox/shims/redis.js";
import { createClock } from "../src/sandbox/shims/clock.js";

function emitterScenario(Emitter) {
  const trace = [];
  const e = new Emitter();
  const a = () => trace.push("a");
  const b = () => trace.push("b");
  e.on("x", a);
  e.once("x", () => trace.push("once"));
  e.prependListener("x", () => trace.push("first"));
  e.on("x", () => {
    trace.push("remover");
    e.off("x", b);
  });
  e.on("x", b);
  trace.push(`emit1:${e.emit("x")}`);
  trace.push(`emit2:${e.emit("x")}`);
  trace.push(`count:${e.listenerCount("x")}`);
  e.on("y", a);
  e.on("y", b);
  e.on("y", a);
  e.off("y", a);
  e.emit("y");
  trace.push(`y:${e.listenerCount("y")}`);
  trace.push(`none:${e.emit("nothing")}`);
  try {
    e.emit("error", new Error("boom"));
  } catch (error) {
    trace.push(`err:${error.message}`);
  }
  try {
    e.emit("error", "str");
  } catch (error) {
    trace.push(`err2:${error.code}`);
  }
  e.on("error", (error) => trace.push(`handled:${error.message}`));
  e.emit("error", new Error("ok"));
  const fn = () => {};
  e.once("z", fn);
  trace.push(`listeners:${e.listeners("z")[0] === fn}`);
  e.off("z", fn);
  trace.push(`z:${e.listenerCount("z")}`);
  e.on("args", (...args) => trace.push(`args:${args.join("|")}`));
  e.emit("args", 1, "two", 3);
  return trace;
}

test("EventEmitter: порядок, once, зняття під час emit і 'error' — як у Node", () => {
  assert.deepEqual(emitterScenario(EventEmitter), emitterScenario(NodeEmitter));
});

async function onceScenario(Emitter, onceImpl) {
  const e = new Emitter();
  const pending = onceImpl(e, "ready");
  e.emit("ready", 1, 2);
  const args = await pending;
  const e2 = new Emitter();
  const failing = onceImpl(e2, "ready");
  e2.emit("error", new Error("bad"));
  let message = null;
  try {
    await failing;
  } catch (error) {
    message = error.message;
  }
  return { args, message, left: e2.listenerCount("ready"), leftError: e.listenerCount("error") };
}

test("events.once: масив аргументів і відхилення на 'error' — як у Node", async () => {
  assert.deepEqual(await onceScenario(EventEmitter, once), await onceScenario(NodeEmitter, nodeOnce));
});

async function writableScenario(WritableClass, { highWaterMark, objectMode, chunks, delay }) {
  const trace = [];
  const w = new WritableClass({
    highWaterMark,
    objectMode,
    write(chunk, encoding, callback) {
      trace.push(`sink:${String(chunk)}`);
      if (delay === "sync") callback();
      else setTimeout(callback, delay);
    },
  });
  w.on("drain", () => trace.push(`drain:${w.writableLength}`));
  const finished = new Promise((resolve) => w.on("finish", resolve));
  w.on("finish", () => trace.push("finish"));
  for (const chunk of chunks) trace.push(`write:${chunk}:${w.write(chunk)}:${w.writableLength}:${w.writableNeedDrain}`);
  w.end();
  trace.push("end-called");
  await finished;
  await new Promise((resolve) => setTimeout(resolve, 5));
  return trace;
}

const WRITABLE_CASES = [
  { name: "objectMode, асинхронний приймач", highWaterMark: 2, objectMode: true, chunks: ["a", "b", "c", "d"], delay: 1 },
  { name: "байти, асинхронний приймач", highWaterMark: 4, objectMode: false, chunks: ["ab", "cd", "e", "fgh"], delay: 1 },
  { name: "синхронний приймач", highWaterMark: 1, objectMode: true, chunks: ["a", "b", "c"], delay: "sync" },
  { name: "буфер ніколи не повний", highWaterMark: 100, objectMode: true, chunks: ["a", "b"], delay: 1 },
];

for (const scenario of WRITABLE_CASES) {
  test(`Writable (${scenario.name}): write() → false, 'drain' і 'finish' — як у Node`, async () => {
    assert.deepEqual(await writableScenario(Writable, scenario), await writableScenario(NodeWritable, scenario));
  });
}

async function pumpScenario(WritableClass, onceImpl) {
  const trace = [];
  let maxBuffered = 0;
  const w = new WritableClass({
    highWaterMark: 3,
    objectMode: true,
    write(chunk, encoding, callback) {
      setTimeout(callback, 2);
    },
  });
  for (let i = 0; i < 10; i += 1) {
    const ok = w.write(i);
    maxBuffered = Math.max(maxBuffered, w.writableLength);
    trace.push(ok ? "w" : "W");
    if (!ok) {
      await onceImpl(w, "drain");
      trace.push("d");
    }
  }
  w.end();
  await onceImpl(w, "finish");
  trace.push(`max:${maxBuffered}`);
  return trace;
}

test("цикл із повагою до backpressure поводиться однаково на шимі й на Node", async () => {
  assert.deepEqual(await pumpScenario(Writable, once), await pumpScenario(NodeWritable, nodeOnce));
});

test("Writable: дефолтний highWaterMark — як у поточної версії Node", () => {
  assert.equal(new Writable().writableHighWaterMark, new NodeWritable().writableHighWaterMark);
  assert.equal(new Writable({ objectMode: true }).writableHighWaterMark, new NodeWritable({ objectMode: true }).writableHighWaterMark);
});

test("помилка приймача приходить подією 'error' — як у Node", async () => {
  async function scenario(WritableClass) {
    const w = new WritableClass({
      objectMode: true,
      write(chunk, encoding, callback) {
        setTimeout(() => callback(new Error(`disk full on ${chunk}`)), 1);
      },
    });
    const error = await new Promise((resolve) => {
      w.on("error", resolve);
      w.write("a");
    });
    return { message: error.message, destroyed: w.destroyed };
  }
  assert.deepEqual(await scenario(Writable), await scenario(NodeWritable));
});

test("http: заголовки нечутливі до регістру, після відправлення змінювати їх не можна", () => {
  const req = createRequest({ method: "post", url: "/x?y=1", headers: { "Content-Type": "application/json" } });
  assert.equal(req.method, "POST");
  assert.equal(req.headers["content-type"], "application/json");
  const res = createResponse();
  res.setHeader("X-Trace", "1");
  assert.equal(res.getHeader("x-trace"), "1");
  res.writeHead(201, { "Content-Type": "application/json" });
  assert.throws(() => res.setHeader("A", "b"), { code: "ERR_HTTP_HEADERS_SENT" });
  res.end(JSON.stringify({ ok: true }));
  assert.deepEqual(res.result().json, { ok: true });
  assert.equal(res.result().status, 201);
});

test("runMiddleware розрізняє next(), next(err), завершену й завислу відповідь", async () => {
  const req = createRequest();
  assert.equal((await runMiddleware((q, s, next) => next(), req, createResponse())).next, true);
  assert.equal((await runMiddleware((q, s, next) => next(new Error("x")), req, createResponse())).error.message, "x");
  assert.equal((await runMiddleware((q, s) => s.end("ok"), req, createResponse())).ended, true);
  assert.equal((await runMiddleware(() => {}, req, createResponse(), { timeoutMs: 20 })).hung, true);
});

test("міні-Redis: SET NX, INCR і TTL на фейковому годиннику", async () => {
  const clock = createClock();
  const redis = createRedis({ now: clock.now });
  assert.equal(await redis.set("k", 1, { NX: true, PX: 1000 }), "OK");
  assert.equal(await redis.set("k", 2, { NX: true }), null);
  assert.equal(await redis.get("k"), "1");
  assert.equal(await redis.incr("k"), 2);
  assert.equal(await redis.pttl("k"), 1000);
  await clock.advance(1000);
  assert.equal(await redis.get("k"), null);
  assert.equal(await redis.ttl("k"), -2);
  await redis.set("s", "abc");
  await assert.rejects(redis.incr("s"), /not an integer/);
});

test("фейковий годинник виконує таймери по черзі й дає відпрацювати async-коду між ними", async () => {
  const clock = createClock();
  const log = [];
  clock.setTimeout(() => log.push(`b@${clock.now()}`), 200);
  clock.setTimeout(() => log.push(`a@${clock.now()}`), 100);
  const id = clock.setInterval(() => log.push(`i@${clock.now()}`), 150);
  (async () => {
    await clock.sleep(120);
    log.push(`slept@${clock.now()}`);
  })();
  await clock.advance(320);
  clock.clearInterval(id);
  assert.deepEqual(log, ["a@100", "slept@120", "i@150", "b@200", "i@300"]);
  assert.equal(new clock.Date().getTime(), 320);
  assert.equal(clock.Date.now(), 320);
});
