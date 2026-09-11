/**
 * Компіляція графа в план маршрутів.
 *
 * Для кожного класу запитів і кожного вузла план знає, куди запит піде далі.
 * Рахується один раз на прогін: граф під час прогону не змінюється, а тік
 * повторюється шістдесят разів.
 *
 * Правила маршрутизації (вони ж — те, як гравець має читати свою схему):
 *   1. Вузол, що обслуговує клас сам (serve), завершує запит.
 *   2. Кеш/CDN без власних дочірніх вузлів — look-aside: у нього спершу
 *      заглядають, а промахи йдуть далі до бази (cache-aside).
 *   3. Кеш/CDN із дочірніми — inline: він забирає весь клас і сам ходить в origin.
 *   4. Роутери (DNS, LB, gateway, лімітер) ділять трафік між дочірніми.
 *   5. Код (app, воркери) викликає КОЖЕН тип залежності: запис у базу і
 *      публікація в чергу — це два виклики, а не вибір одного з двох.
 */

import { COMPONENTS, roleOf } from "../data/components.js";
import { CLASSES } from "../data/constants.js";
import { edgePolicy } from "./graph.js";
import { resolveTargets } from "../data/incidents.js";

export function compile(graph, level) {
  const nodes = {};
  for (const node of graph.nodes) {
    const def = COMPONENTS[node.type];
    nodes[node.id] = {
      id: node.id,
      type: node.type,
      def,
      cfg: resolveConfig(node, level),
      label: node.label ?? def.label,
      out: [],
      in: [],
    };
  }
  for (const edge of graph.edges) {
    if (!nodes[edge.from] || !nodes[edge.to]) continue;
    nodes[edge.from].out.push({ id: edge.id, to: edge.to, policy: edgePolicy(edge) });
    nodes[edge.to].in.push(edge.from);
  }

  const order = topoOrder(nodes);
  const cyclic = order.length !== Object.keys(nodes).length;

  const full = {};
  const partial = {};
  const memo = new Map();
  const isFull = (id, cls) => {
    const key = `${id}|${cls}`;
    if (memo.has(key)) return memo.get(key);
    memo.set(key, false); // захист від циклів у поламаному графі
    const value = computeFull(nodes[id], cls, isFull);
    memo.set(key, value);
    return value;
  };

  for (const id of Object.keys(nodes)) {
    full[id] = new Set();
    partial[id] = new Set();
    for (const cls of CLASSES) {
      if (isFull(id, cls)) full[id].add(cls);
      else if (roleOf(nodes[id].def, cls) === "absorb") partial[id].add(cls);
    }
  }

  const routes = {};
  for (const id of Object.keys(nodes)) {
    routes[id] = {};
    for (const cls of CLASSES) routes[id][cls] = buildRoute(nodes[id], cls, nodes, full, partial);
  }

  const clientId = graph.nodes.find((node) => node.type === "client")?.id ?? "client";
  const reach = reachableFrom(nodes, clientId);

  // Глобальні рішення, які впливають на кілька вузлів одразу.
  const firstApp = Object.values(nodes).find((node) => node.type === "app");
  const globals = {
    fanout: level.data?.fanout ? (firstApp?.cfg.fanout ?? "write") : null,
  };

  const incidentTargets = (level.incidents ?? []).map((incident) => resolveTargets(incident, graph));

  return { level, nodes, order, cyclic, full, partial, routes, clientId, reach, globals, incidentTargets };
}

/** Налаштування вузла з урахуванням параметрів рівня для зафіксованих вузлів. */
function resolveConfig(node, level) {
  return { ...(node.config ?? {}) };
}

function computeFull(node, cls, isFull) {
  if (!node) return false;
  if (node.type === "client") return node.out.some((edge) => isFull(edge.to, cls));
  let role = roleOf(node.def, cls);
  if (node.type === "queue" && node.cfg.mode === "pubsub" && cls === "write") role = "serve";
  if (!role) return false;
  if (role === "serve") return true;
  if (node.def.selfServe?.includes(cls)) return true;
  return node.out.some((edge) => isFull(edge.to, cls));
}

function buildRoute(node, cls, nodes, full, partial) {
  if (node.type !== "client") {
    let role = roleOf(node.def, cls);
    if (node.type === "queue" && node.cfg.mode === "pubsub" && cls === "write") role = "serve";
    if (!role || role === "serve") return { terminal: true, chain: [], groups: [] };
  }

  const candidates = node.out.filter((edge) => full[edge.to].has(cls) || partial[edge.to].has(cls));
  const fullAbsorbers = candidates.filter(
    (edge) => full[edge.to].has(cls) && roleOf(nodes[edge.to].def, cls) === "absorb",
  );

  // Inline-кеш чи CDN з origin забирає весь клас: паралельний шлях повз нього
  // означав би, що половина статики йде в обхід CDN, — так ніхто не будує.
  if (fullAbsorbers.length) return { terminal: false, chain: [], groups: [fullAbsorbers] };

  const chain = candidates.filter((edge) => partial[edge.to].has(cls));
  const rest = candidates.filter((edge) => full[edge.to].has(cls));

  if (!rest.length) {
    const selfServe = node.def.selfServe?.includes(cls);
    return { terminal: Boolean(selfServe), chain: selfServe ? chain : [], groups: [], broken: !selfServe };
  }

  let groups;
  if (node.def.fanout) {
    const byType = new Map();
    for (const edge of rest) {
      const type = nodes[edge.to].type;
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type).push(edge);
    }
    groups = [...byType.values()];
    // Якщо код пише в робочу чергу, запис у базу — справа воркерів. Інакше
    // черга нічого не згладжувала б: кожне замовлення все одно било б у базу.
    const workQueue = (edge) => nodes[edge.to].type === "queue" && nodes[edge.to].cfg.mode !== "pubsub";
    if (cls === "write" && groups.some((group) => group.some(workQueue))) {
      groups = groups.filter((group) => !group.some((edge) => ["sql", "nosql", "cache"].includes(nodes[edge.to].type)));
    }
  } else {
    groups = [rest];
  }
  return { terminal: false, chain, groups };
}

function topoOrder(nodes) {
  const indegree = {};
  for (const id of Object.keys(nodes)) indegree[id] = 0;
  for (const node of Object.values(nodes)) for (const edge of node.out) indegree[edge.to] += 1;
  const queue = Object.keys(nodes).filter((id) => indegree[id] === 0);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const edge of nodes[id].out) {
      indegree[edge.to] -= 1;
      if (indegree[edge.to] === 0) queue.push(edge.to);
    }
  }
  return order;
}

function reachableFrom(nodes, start) {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id) || !nodes[id]) continue;
    seen.add(id);
    for (const edge of nodes[id].out) stack.push(edge.to);
  }
  return seen;
}

/** Класи з ненульовим трафіком на рівні — лише для них перевіряються маршрути. */
export function levelClasses(level) {
  const classes = Object.entries(level.traffic?.mix ?? {})
    .filter(([, share]) => share > 0)
    .map(([cls]) => cls);
  if (level.data?.conns) classes.push("conn");
  return classes;
}
