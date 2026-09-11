/**
 * Цілісність контенту: кожне посилання в довідник веде в існуючу статтю,
 * кожен рівень має еталон, кожна палітра відкрита на своєму рівні.
 * Бите посилання в грі — це кнопка «Довідник», яка нічого не відкриває.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { CODEX, CODEX_IDS, GLOSSARY } from "../src/data/codex/index.js";
import { COMPONENTS, EDGE_KNOBS } from "../src/data/components.js";
import { LEVELS, LEVEL_LIST, CHAPTERS } from "../src/data/levels.js";
import { LEVEL_ORDER, isUnlocked } from "../src/data/order.js";
import { SOLUTIONS, buildSolution } from "../src/data/solutions.js";
import { INCIDENT_TYPES } from "../src/data/incidents.js";
import { QUIZ } from "../src/data/quiz.js";
import { ESTIMATES } from "../src/data/estimation.js";
import { INTERVIEWS, RUBRIC } from "../src/data/interviews.js";
import { MOCK_SPECS } from "../src/data/mockSpecs.js";
import { CHECKS } from "../src/sim/checks.js";
import { validate, hasErrors } from "../src/sim/validate.js";

const assertRef = (ref, where) => assert.ok(CODEX[ref], `${where}: немає статті «${ref}»`);

test("довідник: ≥ 40 статей, усі see і глосарій ведуть в існуючі статті", () => {
  assert.ok(CODEX_IDS.length >= 40);
  for (const id of CODEX_IDS) for (const ref of CODEX[id].see ?? []) assertRef(ref, `see у ${id}`);
  for (const item of GLOSSARY) if (item.ref) assertRef(item.ref, `глосарій «${item.term}»`);
});

test("компоненти й налаштування посилаються на існуючі статті й рівні", () => {
  for (const [type, def] of Object.entries(COMPONENTS)) {
    assertRef(def.codexRef, `компонент ${type}`);
    if (def.unlock) assert.ok(LEVEL_ORDER.includes(def.unlock), `${type}.unlock`);
    for (const [key, knob] of Object.entries(def.knobs)) {
      if (knob.codexRef) assertRef(knob.codexRef, `${type}.${key}`);
      if (knob.unlock) assert.ok(LEVEL_ORDER.includes(knob.unlock), `${type}.${key}.unlock`);
    }
  }
  for (const [key, knob] of Object.entries(EDGE_KNOBS)) if (knob.codexRef) assertRef(knob.codexRef, `ребро ${key}`);
  for (const [id, check] of Object.entries(CHECKS)) assertRef(check.codexRef, `перевірка ${id}`);
});

test("рівні: порядок, глави, палітри, інциденти, перевірки, еталони", () => {
  assert.equal(LEVEL_LIST.length, LEVEL_ORDER.length);
  for (const level of LEVEL_LIST) {
    assert.ok(CHAPTERS.some((chapter) => chapter.id === level.chapter), `${level.id}: глава`);
    for (const type of level.palette) {
      assert.ok(COMPONENTS[type], `${level.id}: невідомий компонент ${type}`);
      assert.ok(isUnlocked(COMPONENTS[type].unlock, level.id), `${level.id}: ${type} ще закритий на цьому рівні`);
    }
    for (const incident of level.incidents) {
      assert.ok(INCIDENT_TYPES[incident.type], `${level.id}: інцидент ${incident.type}`);
      assert.ok(incident.title, `${level.id}: інцидент без назви`);
    }
    for (const check of level.checks) assert.ok(CHECKS[check.id], `${level.id}: перевірка ${check.id}`);
    for (const ref of level.codexRefs) assertRef(ref, `${level.id}.codexRefs`);
    assert.equal(level.hints.length, 3, `${level.id}: три підказки`);
    assert.ok(level.debrief.lesson && level.debrief.interview, `${level.id}: розбір`);
    assert.ok(SOLUTIONS[level.id], `${level.id}: немає еталону`);
    const graph = buildSolution(level, SOLUTIONS[level.id].reference);
    assert.equal(hasErrors(validate(graph, level)), false, `${level.id}: еталон не проходить валідацію`);
  }
  assert.deepEqual(Object.keys(LEVELS).sort(), [...LEVEL_ORDER].sort());
});

test("картки: теми існують, відповіді в межах варіантів", () => {
  const ids = new Set();
  for (const card of QUIZ) {
    assert.ok(!ids.has(card.id), `дубль ${card.id}`);
    ids.add(card.id);
    assertRef(card.topic, `картка ${card.id}`);
    if (card.kind === "mcq") assert.ok(card.answer >= 0 && card.answer < card.options.length, card.id);
  }
});

test("співбесіди: статті, оцінки, rubric і схеми для кроку HLD", () => {
  const estimateIds = new Set(ESTIMATES.map((problem) => problem.id));
  assert.equal(RUBRIC.length, 6);
  for (const interview of INTERVIEWS) {
    assertRef(interview.codexRef, interview.id);
    assert.ok(estimateIds.has(interview.estimateId), `${interview.id}: оцінка ${interview.estimateId}`);
    const mock = MOCK_SPECS[interview.id];
    assert.ok(mock, `${interview.id}: немає специфікації HLD`);
    const graph = buildSolution(mock.spec, mock.reference);
    assert.equal(hasErrors(validate(graph, mock.spec)), false, `${interview.id}: еталон HLD не валідний`);
  }
  for (const problem of ESTIMATES) assertRef(problem.codexRef, problem.id);
});
