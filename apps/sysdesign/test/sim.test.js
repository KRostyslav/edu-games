/**
 * Тести моделі. Перевіряють не «чи не падає», а що модель поводиться так,
 * як вчить довідник: кеш знімає читання з бази, повтори без backoff
 * множать навантаження, повільна залежність з'їдає потоки, а той самий
 * seed завжди дає ту саму годину.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { waitMs, quantile, mix, cutAt, point } from "../src/sim/queueing.js";
import { createGraph, addNode, connect, canConnect, normalizeGraph, removeNode } from "../src/sim/graph.js";
import { compile } from "../src/sim/compile.js";
import { validate, hasErrors } from "../src/sim/validate.js";
import { simulate, forecast } from "../src/sim/simulate.js";
import { scoreRun } from "../src/sim/score.js";
import { LEVELS } from "../src/data/levels.js";
import { SOLUTIONS, buildSolution } from "../src/data/solutions.js";

const reference = (id) => buildSolution(LEVELS[id], SOLUTIONS[id].reference);
const naive = (id) => buildSolution(LEVELS[id], SOLUTIONS[id].naive);

test("очікування в черзі росте з утилізацією і падає з кількістю серверів", () => {
  assert.ok(waitMs(10, 0.5) < waitMs(10, 0.8));
  assert.ok(waitMs(10, 0.8) < waitMs(10, 0.95));
  assert.ok(waitMs(10, 0.8, 8) < waitMs(10, 0.8, 1));
  assert.equal(waitMs(10, 0), 0);
});

test("p99 суміші визначають рідкісні повільні шляхи", () => {
  const fast = [[1, 10, 1]];
  const slow = [[1, 200, 1]];
  const ninetyFive = mix([{ w: 0.95, comps: fast }, { w: 0.05, comps: slow }]);
  const almostAll = mix([{ w: 0.995, comps: fast }, { w: 0.005, comps: slow }]);
  assert.ok(quantile(ninetyFive, 0.99) > 190, "при 5% промахів p99 = латентність промаху");
  assert.ok(quantile(almostAll, 0.99) < 30, "при 0,5% промахів p99 = латентність влучання");
  const exp = [[1, 0, 10]];
  assert.ok(Math.abs(quantile(exp, 0.99) - 10 * Math.log(100)) < 0.5, "квантиль експоненти");
});

test("таймаут відрізає довгі запити", () => {
  const { lost, comps } = cutAt(point(4000), 1000);
  assert.equal(lost, 1);
  assert.deepEqual(comps, []);
  const partial = cutAt([[1, 100, 200]], 500);
  assert.ok(partial.lost > 0.1 && partial.lost < 0.3);
});

test("з'єднання: заборонені цикли, самопосилання й виклик користувачів", () => {
  const level = LEVELS["l1-2"];
  const graph = createGraph(level);
  const dns = addNode(graph, "dns", 2, 3, level);
  const app = addNode(graph, "app", 4, 3, level);
  const sql = addNode(graph, "sql", 6, 3, level);
  assert.ok(connect(graph, "client", dns.id).ok);
  assert.ok(connect(graph, dns.id, app.id).ok);
  assert.ok(connect(graph, app.id, sql.id).ok);
  assert.equal(canConnect(graph, sql.id, app.id).ok, false, "SQL нікого не викликає");
  assert.equal(canConnect(graph, app.id, app.id).ok, false);
  assert.equal(canConnect(graph, app.id, "client").ok, false);
  assert.equal(canConnect(graph, app.id, sql.id).ok, false, "дубль");
  assert.equal(addNode(graph, "app", 4, 3, level), null, "клітинка зайнята");
});

test("валідація: без шляху до бази прогін заблоковано", () => {
  const level = LEVELS["l1-2"];
  const graph = createGraph(level);
  const dns = addNode(graph, "dns", 2, 3, level);
  const app = addNode(graph, "app", 4, 3, level);
  connect(graph, "client", dns.id);
  connect(graph, dns.id, app.id);
  const issues = validate(graph, level);
  assert.ok(hasErrors(issues));
  assert.ok(issues.some((issue) => issue.code === "E-ROUTE"));
  const run = simulate(graph, level);
  assert.equal(run.ok, false);
});

test("валідація: компонент поза палітрою рівня", () => {
  const level = LEVELS["l1-1"];
  const graph = reference("l1-1");
  graph.nodes.push({ id: "cache-9", type: "cache", x: 8, y: 1, config: {} });
  assert.ok(validate(graph, level).some((issue) => issue.code === "E-PALETTE"));
});

test("той самий seed — та сама година", () => {
  const level = LEVELS["l2-2"];
  const a = simulate(reference("l2-2"), level, { seed: 7 });
  const b = simulate(reference("l2-2"), level, { seed: 7 });
  assert.deepEqual(a.summary.p99Worst, b.summary.p99Worst);
  assert.equal(a.summary.availability, b.summary.availability);
  assert.deepEqual(a.ticks[33].nodes, b.ticks[33].nodes);
});

test("кеш знімає читання з бази", () => {
  const level = LEVELS["l2-2"];
  const withCache = reference("l2-2");
  const withoutCache = reference("l2-2");
  removeNode(withoutCache, "cache-1");
  const hit = forecast(withCache, level).ticks[0].nodes["sql-1"];
  const miss = forecast(withoutCache, level).ticks[0].nodes["sql-1"];
  assert.ok(hit.inflow.read < miss.inflow.read * 0.3, "у базу доходить лише частка промахів");
  assert.ok(hit.rho < miss.rho);
});

test("черга забирає запис із app, а базу пишуть воркери", () => {
  const plan = compile(reference("l4-2"), LEVELS["l4-2"]);
  const writeTargets = plan.routes["app-1"].write.groups.flat().map((edge) => edge.to);
  assert.deepEqual(writeTargets, ["mq-1"]);
  const readTargets = plan.routes["app-1"].read.groups.flat().map((edge) => edge.to);
  assert.ok(readTargets.includes("sql-1"), "читання й далі йдуть у базу");
});

test("закон Літтла: повільна залежність без таймауту з'їдає потоки app", () => {
  const level = LEVELS["l4-3"];
  const run = simulate(naive("l4-3"), level);
  const slow = run.ticks[22].nodes["app-1"];
  assert.ok(slow.threadRho > 1, `потоки мали б закінчитися, а threadRho = ${slow.threadRho}`);
  const safe = simulate(reference("l4-3"), level);
  assert.ok(safe.ticks[22].nodes["app-1"].threadRho < 0.5);
});

test("retry без backoff множить навантаження на хвору залежність", () => {
  const level = LEVELS["l4-3"];
  const build = (policy) => {
    const graph = reference("l4-3");
    Object.assign(graph.edges.find((edge) => edge.to === "pay").policy, { breaker: false, fallback: "none", ...policy });
    return simulate(graph, level).ticks[45].nodes.pay.inflow.write;
  };
  const storm = build({ retries: 3, backoff: false });
  const gentle = build({ retries: 3, backoff: true });
  const none = build({ retries: 0 });
  assert.ok(storm > gentle && gentle > none, `${storm} > ${gentle} > ${none}`);
});

test("consistent hashing переносить при масштабуванні менше, ніж mod N", () => {
  const level = LEVELS["l3-3"];
  const peak = (hashing) => {
    const graph = reference("l3-3");
    graph.nodes.find((node) => node.id === "nosql-1").config.hashing = hashing;
    return simulate(graph, level).ticks[39].nodes["nosql-1"].rho;
  };
  assert.ok(peak("mod") > peak("consistent") * 1.3);
});

test("hot key б'є в один шард кешу, скільки б шардів не було", () => {
  const level = LEVELS["l5-1"];
  // Без локального кешу гарячий шард перевантажується, його латентність
  // з'їдає потоки app — і падає весь сайт, а не лише кеш.
  const broken = simulate(naive("l5-1"), level);
  assert.ok(broken.summary.bottlenecks.some((note) => note.nodeId === "cache-1" && note.tone === "bad"));
  assert.ok(broken.ticks[20].availability < 0.5);
  const fixed = simulate(reference("l5-1"), level);
  assert.ok(fixed.ticks[20].nodes["cache-1"].rho < 1);
  assert.ok(fixed.ticks[20].availability > 0.99);
});

test("зірки: еталон проходить, наївне рішення — ні", () => {
  for (const id of ["l1-1", "l2-1", "l4-3"]) {
    assert.equal(scoreRun(simulate(reference(id), LEVELS[id]), LEVELS[id]).stars, 3, id);
    assert.ok(scoreRun(simulate(naive(id), LEVELS[id]), LEVELS[id]).stars <= 1, id);
  }
});

test("normalizeGraph чистить сміття й ідемпотентний", () => {
  const level = LEVELS["l4-3"];
  const dirty = {
    nodes: [
      { id: "client", type: "client", x: 0, y: 3 },
      { id: "x", type: "nonsense", x: 1, y: 1 },
      { id: "app-1", type: "app", x: 5, y: 3, config: { instances: 999, size: "HUGE" } },
      { id: "app-1", type: "app", x: 6, y: 3 },
      { id: "far", type: "sql", x: 99, y: 99 },
    ],
    edges: [
      { from: "app-1", to: "pay" },
      { from: "app-1", to: "ghost" },
      { from: "app-1", to: "pay" },
    ],
  };
  const once = normalizeGraph(dirty, level);
  assert.ok(once.nodes.some((node) => node.id === "pay"), "зафіксований вузол повертається");
  assert.equal(once.nodes.filter((node) => node.id === "app-1").length, 1);
  assert.equal(once.nodes.find((node) => node.id === "app-1").config.size, "M");
  assert.equal(once.nodes.find((node) => node.id === "app-1").config.instances, 1);
  assert.equal(once.edges.length, 1);
  assert.deepEqual(normalizeGraph(once, level), once);
  assert.doesNotThrow(() => normalizeGraph(null, level));
  assert.doesNotThrow(() => normalizeGraph({ nodes: "x", edges: 5 }, level));
});
