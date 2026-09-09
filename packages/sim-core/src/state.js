/** Робота зі станом симуляції: незмінні оновлення й межі показників. */

export function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

/** Глибока копія простого стану (числа, рядки, масиви, об'єкти). */
export function cloneState(state) {
  return structuredClone(state);
}

/** Читання значення за шляхом "vine.reserves". */
export function getPath(obj, path) {
  return path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), obj);
}

/** Запис значення за шляхом "vine.reserves" (мутує переданий об'єкт). */
export function setPath(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  let node = obj;
  for (const key of keys) {
    if (node[key] == null) node[key] = {};
    node = node[key];
  }
  node[last] = value;
}

/**
 * Ефект — атомарна зміна одного показника, яка ЗАВЖДИ несе причину.
 *
 * Саме `reason` робить гру навчальною: усі підказки, розбори й звіти
 * будуються з цього логу, тому пояснення фізично не може розійтися з моделлю.
 */
export function makeEffect({ target, delta, reason, source, tone }) {
  if (!reason) throw new Error(`Ефект для "${target}" без пояснення (reason)`);
  return { target, delta, reason, source: source ?? "system", tone: tone ?? toneOf(delta) };
}

function toneOf(delta) {
  if (delta > 0) return "good";
  if (delta < 0) return "bad";
  return "neutral";
}

/**
 * Застосовує список ефектів до копії стану.
 * `limits` задає межі для кожного шляху: { "vine.reserves": [0, 100] }.
 */
export function applyEffects(state, effects, limits = {}) {
  const next = cloneState(state);
  const applied = [];

  for (const effect of effects) {
    const before = getPath(next, effect.target);
    if (typeof before !== "number") {
      throw new Error(`Показник "${effect.target}" не є числом — ефект застосувати неможливо`);
    }
    const [min, max] = limits[effect.target] ?? [0, 100];
    const after = clamp(before + effect.delta, min, max);
    setPath(next, effect.target, after);
    applied.push({ ...effect, before, after, actualDelta: after - before });
  }

  return { state: next, effects: applied };
}
