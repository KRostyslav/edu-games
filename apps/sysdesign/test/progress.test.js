/**
 * Прогрес мусить пережити будь-що в localStorage: старі версії, биті дані,
 * ручні правки. Ремонт чистий, ідемпотентний і ніколи не кидає.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { repairProgress, defaultProgress, createProgressStore, MAX_MOCKS } from "../src/progress/store.js";
import { isLevelOpen, totalStars, nextLevelId } from "../src/progress/unlock.js";
import { LEVEL_ORDER } from "../src/data/order.js";

test("ремонт не кидає на сміття і повертає коректну форму", () => {
  for (const garbage of [null, undefined, 42, "x", [], [1, 2], { campaign: 5 }, { quiz: { boxes: [] } }, { mocks: {} }]) {
    const repaired = repairProgress(garbage);
    assert.deepEqual(Object.keys(repaired).sort(), Object.keys(defaultProgress()).sort());
  }
});

test("ремонт ідемпотентний", () => {
  const raw = {
    campaign: { "l1-1": { stars: 9, draft: { nodes: [], edges: [] } }, "l9-9": { stars: 3 } },
    quiz: { boxes: { "cdn-1": { box: 7, due: 3 }, junk: "x" }, streak: -4 },
    estimate: { "est-url": { bestStars: 5, attempts: 2 } },
    mocks: Array.from({ length: 30 }, (_, i) => ({ id: i })),
    codex: { read: { cdn: true, dns: "yes" } },
    settings: { speed: 3 },
  };
  const once = repairProgress(raw, { cards: ["cdn-1"], problems: ["est-url"] });
  assert.deepEqual(repairProgress(once, { cards: ["cdn-1"], problems: ["est-url"] }), once);
  assert.equal(once.campaign["l1-1"].stars, 3);
  assert.equal(once.campaign["l9-9"], undefined);
  assert.equal(once.quiz.boxes["cdn-1"].box, 5);
  assert.equal(once.quiz.boxes.junk, undefined);
  assert.equal(once.quiz.streak, 0);
  assert.equal(once.estimate["est-url"].bestStars, 3);
  assert.equal(once.mocks.length, MAX_MOCKS);
  assert.deepEqual(once.codex.read, { cdn: true });
  assert.equal(once.settings.speed, 1);
});

test("сховище зберігає й читає через бекенд", () => {
  let saved = null;
  const backend = { load: () => saved, save: (data) => (saved = structuredClone(data)) };
  const store = createProgressStore({ backend });
  store.update((state) => (state.campaign["l1-1"] = { stars: 2 }), { immediate: true });
  const again = createProgressStore({ backend });
  assert.equal(again.state.campaign["l1-1"].stars, 2);
  again.reset();
  assert.deepEqual(saved.campaign, {});
});

test("розблокування рівнів іде за зірками", () => {
  const progress = defaultProgress();
  assert.equal(isLevelOpen(progress, LEVEL_ORDER[0]), true);
  assert.equal(isLevelOpen(progress, LEVEL_ORDER[1]), false);
  progress.campaign[LEVEL_ORDER[0]] = { stars: 1 };
  assert.equal(isLevelOpen(progress, LEVEL_ORDER[1]), true);
  assert.equal(nextLevelId(progress), LEVEL_ORDER[0], "рівень без трьох зірок — ще не пройдений до кінця");
  progress.campaign[LEVEL_ORDER[0]].stars = 3;
  assert.equal(nextLevelId(progress), LEVEL_ORDER[1]);
  assert.equal(totalStars(progress), 3);
  assert.equal(isLevelOpen(progress, "nope"), false);
});
