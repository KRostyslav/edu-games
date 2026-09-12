/**
 * Міні-Redis у пам'яті для задач про ідемпотентність, rate limiting і TTL.
 * Команди асинхронні, як у справжнього клієнта: кожна — мережевий roundtrip,
 * і між `get` та `set` інший запит встигає втрутитися. Саме тому в задачах
 * потрібні атомарні `SET NX` та `INCR`, а не «прочитав — перевірив — записав».
 *
 * Значення зберігаються рядками, як у Redis. Час — з переданого `now()`,
 * щоб TTL працював і з фейковим годинником.
 */

export function createRedis({ now = () => Date.now() } = {}) {
  const data = new Map();
  const stats = { calls: 0 };

  const alive = (key) => {
    const entry = data.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= now()) {
      data.delete(key);
      return null;
    }
    return entry;
  };

  // Мікрозадача між викликом і відповіддю — мінімальна «мережа»:
  // конкурентні виклики справді переплітаються.
  const reply = async (fn) => {
    stats.calls += 1;
    await Promise.resolve();
    return fn();
  };

  const notInteger = () => new Error("ERR value is not an integer or out of range");

  return {
    stats,
    get: (key) => reply(() => alive(key)?.value ?? null),
    /** set(key, value, { EX, PX, NX, XX, KEEPTTL }) → "OK" або null, якщо умова NX/XX не виконалась. */
    set: (key, value, options = {}) =>
      reply(() => {
        const current = alive(key);
        if (options.NX && current) return null;
        if (options.XX && !current) return null;
        let expiresAt = null;
        if (options.EX) expiresAt = now() + options.EX * 1000;
        else if (options.PX) expiresAt = now() + options.PX;
        else if (options.KEEPTTL && current) expiresAt = current.expiresAt;
        data.set(key, { value: String(value), expiresAt });
        return "OK";
      }),
    del: (...keys) =>
      reply(() => keys.flat().reduce((count, key) => (alive(key) && data.delete(key) ? count + 1 : count), 0)),
    exists: (...keys) => reply(() => keys.flat().filter((key) => alive(key)).length),
    incrby: (key, by) =>
      reply(() => {
        const current = alive(key);
        const base = current ? Number(current.value) : 0;
        if (!Number.isInteger(base)) throw notInteger();
        const next = base + by;
        data.set(key, { value: String(next), expiresAt: current?.expiresAt ?? null });
        return next;
      }),
    incr(key) {
      return this.incrby(key, 1);
    },
    expire: (key, seconds) =>
      reply(() => {
        const current = alive(key);
        if (!current) return 0;
        current.expiresAt = now() + seconds * 1000;
        return 1;
      }),
    pexpire: (key, ms) =>
      reply(() => {
        const current = alive(key);
        if (!current) return 0;
        current.expiresAt = now() + ms;
        return 1;
      }),
    ttl: (key) =>
      reply(() => {
        const current = alive(key);
        if (!current) return -2;
        if (current.expiresAt === null) return -1;
        return Math.ceil((current.expiresAt - now()) / 1000);
      }),
    pttl: (key) =>
      reply(() => {
        const current = alive(key);
        if (!current) return -2;
        if (current.expiresAt === null) return -1;
        return current.expiresAt - now();
      }),
    /** Лише для тестів: скільки ключів живі зараз. */
    size: () => [...data.keys()].filter((key) => alive(key)).length,
  };
}
