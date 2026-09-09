import test from "node:test";
import assert from "node:assert/strict";

import { createEngine, createRng, makeEffect, applyEffects, topEffects } from "../src/index.js";

test("ефект без пояснення неможливо створити", () => {
  // Це головний інваріант рушія: пояснення не додається до логіки постфактум,
  // а є її обов'язковою частиною. Інакше навчальні панелі можуть розійтися з моделлю.
  assert.throws(() => makeEffect({ target: "a.b", delta: 5 }), /без пояснення/);
});

test("applyEffects дотримується меж і повертає фактичну зміну", () => {
  const state = { vine: { load: 95 } };
  const { state: next, effects } = applyEffects(
    state,
    [makeEffect({ target: "vine.load", delta: 20, reason: "тест" })],
    { "vine.load": [0, 100] },
  );

  assert.equal(next.vine.load, 100);
  assert.equal(effects[0].before, 95);
  assert.equal(effects[0].actualDelta, 5, "фактична зміна врахувала стелю показника");
  assert.equal(state.vine.load, 95, "вихідний стан не мутується");
});

test("фази виконуються по черзі й бачать зміни попередніх", () => {
  const seen = [];
  const engine = createEngine({
    initialState: { v: { x: 0 } },
    limits: { "v.x": [0, 100] },
    phases: [
      () => [makeEffect({ target: "v.x", delta: 10, reason: "перша фаза" })],
      ({ state }) => {
        seen.push(state.v.x);
        return [makeEffect({ target: "v.x", delta: 5, reason: "друга фаза" })];
      },
    ],
  });

  const turn = engine.advance();
  assert.deepEqual(seen, [10], "друга фаза побачила результат першої");
  assert.equal(turn.state.v.x, 15);
  assert.equal(engine.history.length, 1);
});

test("RNG детермінований для однакового seed", () => {
  const a = createRng(123);
  const b = createRng(123);
  const seqA = [a.next(), a.next(), a.int(1, 100)];
  const seqB = [b.next(), b.next(), b.int(1, 100)];
  assert.deepEqual(seqA, seqB, "той самий сезон має відтворюватися однаково");
});

test("topEffects ранжує за модулем фактичної зміни", () => {
  const effects = [
    { target: "a", actualDelta: 3, tone: "good", reason: "r" },
    { target: "b", actualDelta: -20, tone: "bad", reason: "r" },
    { target: "c", actualDelta: 12, tone: "good", reason: "r" },
  ];
  assert.deepEqual(
    topEffects(effects, { limit: 2 }).map((e) => e.target),
    ["b", "c"],
  );
  assert.deepEqual(
    topEffects(effects, { tone: "good", limit: 1 }).map((e) => e.target),
    ["c"],
  );
});
