/**
 * Граф архітектури: вузли на сітці й спрямовані ребра «хто кого викликає».
 *
 * Функції мутують граф на місці й повертають результат операції: UI тримає
 * один живий граф і після кожної зміни просто перераховує модель. Незмінність
 * тут дала б лише зайве копіювання — симуляція все одно перераховується з нуля.
 *
 * Граф навмисно лишається простим JSON: його зберігають у localStorage,
 * порівнюють у тестах і вставляють як еталонні рішення у файли рівнів.
 */

import { COMPONENTS, EDGE_KNOBS, knobDefault, knobOptions } from "../data/components.js";

export const GRID = { cols: 12, rows: 7 };

/** Налаштування компонента за замовчуванням — усі, навіть ще закриті. */
export function defaultConfig(type, level) {
  const def = COMPONENTS[type];
  const cfg = {};
  for (const [key, knob] of Object.entries(def?.knobs ?? {})) cfg[key] = knobDefault(knob, level);
  return cfg;
}

export function defaultPolicy() {
  const policy = {};
  for (const [key, knob] of Object.entries(EDGE_KNOBS)) policy[key] = knob.default;
  return policy;
}

/** Порожній граф рівня: користувачі й зафіксовані вузли (наприклад, зовнішній провайдер). */
export function createGraph(level) {
  const nodes = [{ id: "client", type: "client", x: 0, y: 3, locked: true, config: {} }];
  for (const fixed of level.fixed ?? []) {
    nodes.push({
      id: fixed.id,
      type: fixed.type,
      x: fixed.x,
      y: fixed.y,
      locked: true,
      label: fixed.label,
      config: { ...defaultConfig(fixed.type, level), ...(fixed.config ?? {}) },
    });
  }
  return { nodes, edges: [] };
}

export function findNode(graph, id) {
  return graph.nodes.find((node) => node.id === id) ?? null;
}

export function cellFree(graph, x, y, exceptId = null) {
  return !graph.nodes.some((node) => node.x === x && node.y === y && node.id !== exceptId);
}

export function inGrid(x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < GRID.cols && y < GRID.rows;
}

export function nextId(graph, type) {
  let index = 1;
  while (graph.nodes.some((node) => node.id === `${type}-${index}`)) index += 1;
  return `${type}-${index}`;
}

export function addNode(graph, type, x, y, level, config = {}) {
  if (!COMPONENTS[type] || !inGrid(x, y) || !cellFree(graph, x, y)) return null;
  const node = { id: nextId(graph, type), type, x, y, config: { ...defaultConfig(type, level), ...config } };
  graph.nodes.push(node);
  return node;
}

export function moveNode(graph, id, x, y) {
  const node = findNode(graph, id);
  if (!node || !inGrid(x, y) || !cellFree(graph, x, y, id)) return false;
  node.x = x;
  node.y = y;
  return true;
}

export function removeNode(graph, id) {
  const node = findNode(graph, id);
  if (!node || node.locked) return false;
  graph.nodes = graph.nodes.filter((item) => item.id !== id);
  graph.edges = graph.edges.filter((edge) => edge.from !== id && edge.to !== id);
  return true;
}

export const edgeId = (from, to) => `${from}>${to}`;

/** Усі вузли, досяжні з `fromId` за напрямком ребер. */
export function reachable(graph, fromId) {
  const seen = new Set([fromId]);
  const stack = [fromId];
  while (stack.length) {
    const id = stack.pop();
    for (const edge of graph.edges) {
      if (edge.from === id && !seen.has(edge.to)) {
        seen.add(edge.to);
        stack.push(edge.to);
      }
    }
  }
  return seen;
}

/**
 * Чи можна з'єднати два вузли. Причина відмови — повноцінне пояснення:
 * гравець має зрозуміти, ЧОМУ так не буває в реальних системах, а не просто
 * побачити сіру стрілку.
 */
export function canConnect(graph, fromId, toId) {
  const from = findNode(graph, fromId);
  const to = findNode(graph, toId);
  if (!from || !to) return { ok: false, reason: "Вузол не знайдено." };
  if (fromId === toId) return { ok: false, reason: "Вузол не може викликати сам себе." };
  const fromDef = COMPONENTS[from.type];
  const toDef = COMPONENTS[to.type];
  if (to.type === "client") return { ok: false, reason: "Користувачі лише надсилають запити — викликати їх не можна." };
  if (!fromDef.connectsTo.includes(to.type)) {
    const allowed = fromDef.connectsTo.map((type) => COMPONENTS[type].label).join(", ");
    return {
      ok: false,
      reason: allowed
        ? `${fromDef.label} не викликає ${toDef.label}. Звідси можна піти в: ${allowed}.`
        : `${fromDef.label} — кінцевий вузол: він обслуговує запити сам і нікого не викликає.`,
    };
  }
  if (graph.edges.some((edge) => edge.from === fromId && edge.to === toId)) {
    return { ok: false, reason: "Такий зв'язок уже є." };
  }
  // Цикл означав би запит, що ходить по колу вічно. У реальних системах
  // так теж буває — і це завжди інцидент, а не архітектура.
  if (reachable(graph, toId).has(fromId)) return { ok: false, reason: "Цей зв'язок утворить цикл." };
  return { ok: true, reason: "" };
}

export function connect(graph, fromId, toId) {
  const check = canConnect(graph, fromId, toId);
  if (!check.ok) return check;
  const edge = { id: edgeId(fromId, toId), from: fromId, to: toId, policy: defaultPolicy() };
  graph.edges.push(edge);
  return { ok: true, reason: "", edge };
}

export function removeEdge(graph, id) {
  const before = graph.edges.length;
  graph.edges = graph.edges.filter((edge) => edge.id !== id);
  return graph.edges.length !== before;
}

export function edgePolicy(edge) {
  return { ...defaultPolicy(), ...(edge?.policy ?? {}) };
}

export function cloneGraph(graph) {
  return structuredClone(graph);
}

/**
 * Приводить граф до коректного вигляду: викидає невідомі типи й биті ребра,
 * дописує налаштування, яких не було в старих збереженнях, і повертає на місце
 * зафіксовані вузли рівня. Чиста й ідемпотентна — викликається на кожному
 * завантаженні чернетки, щоб оновлення гри не ламало збережених схем.
 */
export function normalizeGraph(input, level) {
  const base = createGraph(level);
  const nodes = [...base.nodes];
  const ids = new Set(nodes.map((node) => node.id));

  for (const raw of Array.isArray(input?.nodes) ? input.nodes : []) {
    if (!raw || typeof raw.id !== "string" || ids.has(raw.id)) {
      // Зафіксовані вузли беремо з рівня, але позицію гравця зберігаємо.
      const fixed = nodes.find((node) => node.id === raw?.id);
      if (fixed && inGrid(raw.x, raw.y) && cellFree({ nodes }, raw.x, raw.y, fixed.id)) {
        fixed.x = raw.x;
        fixed.y = raw.y;
      }
      continue;
    }
    const def = COMPONENTS[raw.type];
    if (!def || def.fixed) continue;
    if (!inGrid(raw.x, raw.y) || !cellFree({ nodes }, raw.x, raw.y)) continue;
    nodes.push({ id: raw.id, type: raw.type, x: raw.x, y: raw.y, config: normalizeConfig(def, raw.config, level) });
    ids.add(raw.id);
  }

  const graph = { nodes, edges: [] };
  for (const raw of Array.isArray(input?.edges) ? input.edges : []) {
    if (!raw || !ids.has(raw.from) || !ids.has(raw.to)) continue;
    const result = connect(graph, raw.from, raw.to);
    if (result.ok) result.edge.policy = normalizePolicy(raw.policy);
  }
  return graph;
}

function normalizeConfig(def, raw, level) {
  const cfg = {};
  for (const [key, knob] of Object.entries(def.knobs)) {
    const value = raw?.[key];
    cfg[key] = validKnobValue(knob, value, level) ? value : knobDefault(knob, level);
  }
  return cfg;
}

function normalizePolicy(raw) {
  const policy = defaultPolicy();
  for (const [key, knob] of Object.entries(EDGE_KNOBS)) {
    if (validKnobValue(knob, raw?.[key], null)) policy[key] = raw[key];
  }
  return policy;
}

export function validKnobValue(knob, value, level) {
  if (knob.type === "toggle") return typeof value === "boolean";
  if (knob.type === "int") return Number.isInteger(value) && value >= knob.min && value <= knob.max;
  if (knob.type === "select") return knobOptions(knob, level ?? { data: {} }).includes(value);
  return false;
}
