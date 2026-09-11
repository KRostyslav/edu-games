/**
 * Черги й хвости латентності.
 *
 * Латентність запиту описується сумішшю компонентів [p, d, m]: з імовірністю p
 * запит іде шляхом, де фіксована частина — d мс, а очікування в чергах —
 * експонента із середнім m. Суміш потрібна, бо p99 визначають рідкісні шляхи:
 * при 95% влучань у кеш хвіст задають саме 5% промахів, і середнє цього
 * ніколи не покаже.
 *
 * Спрощення (і вони чесно описані в README): очікування — Sakasegawa-наближення
 * M/M/c, послідовні черги додають середні, розподіл — експонента.
 */

/**
 * Середнє очікування в черзі, мс. Наближення Сакасегави для M/M/c:
 * за тієї ж утилізації багато серверів чекають набагато менше, ніж один, —
 * тому пул із десяти малих інстансів дає коротший хвіст за один великий.
 */
export function waitMs(serviceMs, rho, servers = 1) {
  if (!(rho > 0)) return 0;
  const r = Math.min(rho, 0.95);
  const c = Math.max(1, servers);
  return (serviceMs * Math.pow(r, Math.sqrt(2 * (c + 1)) - 1)) / (c * (1 - r));
}

export const point = (d) => [[1, d, 0]];
export const single = (d, m) => [[1, d, m]];

export function shift(comps, delta) {
  if (!delta) return comps;
  return comps.map(([p, d, m]) => [p, d + delta, m]);
}

/** Послідовне проходження: латентності додаються. */
export function seq(a, b) {
  if (!a.length) return b;
  if (!b.length) return a;
  const out = [];
  for (const [pa, da, ma] of a) {
    for (const [pb, db, mb] of b) out.push([pa * pb, da + db, ma + mb]);
  }
  return compact(out);
}

/** Зважена суміш: parts = [{ w, comps }], ваги абсолютні. Результат нормований. */
export function mix(parts) {
  const total = parts.reduce((sum, part) => sum + (part.comps.length ? part.w : 0), 0);
  if (!(total > 0)) return [];
  const out = [];
  for (const { w, comps } of parts) {
    if (!(w > 0)) continue;
    for (const [p, d, m] of comps) out.push([(p * w) / total, d, m]);
  }
  return compact(out);
}

/**
 * Обмежує кількість компонентів, зливаючи сусідні за d найменш імовірні.
 * Без цього суміш росте експоненційно з глибиною графа.
 */
export function compact(comps, max = 24) {
  const merged = new Map();
  for (const [p, d, m] of comps) {
    if (!(p > 1e-7)) continue;
    const key = `${Math.round(d * 10)}|${Math.round(m * 10)}`;
    const prev = merged.get(key);
    if (prev) prev[0] += p;
    else merged.set(key, [p, d, m]);
  }
  const list = [...merged.values()].sort((a, b) => a[1] - b[1]);
  while (list.length > max) {
    let best = 0;
    let bestP = Infinity;
    for (let i = 0; i < list.length - 1; i += 1) {
      const p = list[i][0] + list[i + 1][0];
      if (p < bestP) {
        bestP = p;
        best = i;
      }
    }
    const [a, b] = [list[best], list[best + 1]];
    const p = a[0] + b[0];
    list.splice(best, 2, [p, (a[0] * a[1] + b[0] * b[1]) / p, (a[0] * a[2] + b[0] * b[2]) / p]);
  }
  return list;
}

/** P(T > t). */
export function tailAt(comps, t) {
  let tail = 0;
  for (const [p, d, m] of comps) {
    if (t < d) tail += p;
    else if (m > 0) tail += p * Math.exp(-(t - d) / m);
  }
  return tail;
}

/** Квантиль бісекцією: tailAt монотонно спадає. */
export function quantile(comps, q = 0.99) {
  if (!comps.length) return 0;
  const target = 1 - q;
  let hi = 1;
  for (const [, d, m] of comps) hi = Math.max(hi, d + 14 * m + 1);
  let lo = 0;
  for (let i = 0; i < 50; i += 1) {
    const mid = (lo + hi) / 2;
    if (tailAt(comps, mid) > target) lo = mid;
    else hi = mid;
  }
  return hi;
}

export function meanOf(comps) {
  return comps.reduce((sum, [p, d, m]) => sum + p * (d + m), 0);
}

/** E[min(T, cap)] — скільки в середньому тримає потік виклик із таймаутом `cap`. */
export function cappedMean(comps, cap) {
  let sum = 0;
  for (const [p, d, m] of comps) {
    if (d >= cap) sum += p * cap;
    else if (m > 0) sum += p * (d + m * (1 - Math.exp(-(cap - d) / m)));
    else sum += p * d;
  }
  return sum;
}

/**
 * Таймаут: частка запитів, довших за T, падає. Решта лишається в суміші.
 * Повертає { comps, lost }.
 */
export function cutAt(comps, cap) {
  const lost = Math.min(1, tailAt(comps, cap));
  const kept = comps.filter(([, d]) => d < cap);
  const total = kept.reduce((sum, [p]) => sum + p, 0);
  if (!(total > 0) || lost >= 1) return { comps: [], lost: 1 };
  return { comps: kept.map(([p, d, m]) => [p / total, d, m]), lost };
}
