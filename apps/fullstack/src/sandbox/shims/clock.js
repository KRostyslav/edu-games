/**
 * Фейковий годинник для задач про час: retry з backoff, rate limiter, TTL.
 *
 * Справжні таймери зробили б тест «retry з трьома спробами по 2 с» шестисекундним,
 * а результат — залежним від навантаження машини. Тут час рухає лише тест:
 * `await clock.advance(2000)` виконує всі таймери до цієї миті по черзі й між
 * ними дає відпрацювати мікрозадачам — так async/await у коді гравця
 * поводиться так само, як зі справжнім часом.
 */

/** Одна справжня макрозадача: гарантує, що всі мікрозадачі вже виконано. */
export function realTick() {
  if (typeof setImmediate === "function") return new Promise((resolve) => setImmediate(resolve));
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}

export function createClock({ start = 0 } = {}) {
  let now = start;
  let seq = 0;
  const timers = new Map();

  function schedule(fn, delay, args, repeat) {
    if (typeof fn !== "function") throw new TypeError("Колбек таймера має бути функцією");
    const ms = Math.max(0, Number(delay) || 0);
    seq += 1;
    timers.set(seq, { id: seq, order: seq, at: now + ms, fn, args, every: repeat ? Math.max(1, ms) : null });
    return seq;
  }

  function nextDue(limit) {
    let best = null;
    for (const timer of timers.values()) {
      if (timer.at > limit) continue;
      if (!best || timer.at < best.at || (timer.at === best.at && timer.order < best.order)) best = timer;
    }
    return best;
  }

  /** Пересуває час уперед, виконуючи таймери по черзі. */
  async function advance(ms) {
    const target = now + Math.max(0, Number(ms) || 0);
    await realTick();
    for (let guard = 0; guard < 100_000; guard += 1) {
      const timer = nextDue(target);
      if (!timer) break;
      now = timer.at;
      if (timer.every) {
        timer.at += timer.every;
        seq += 1;
        timer.order = seq;
      } else timers.delete(timer.id);
      timer.fn(...timer.args);
      await realTick();
    }
    now = target;
    await realTick();
  }

  /** Виконує все, що заплановано, але не далі за `limitMs` від поточної миті. */
  async function runAll(limitMs = 3_600_000) {
    const stop = now + limitMs;
    await realTick();
    for (let guard = 0; guard < 100_000; guard += 1) {
      const timer = nextDue(stop);
      if (!timer) break;
      await advance(timer.at - now);
    }
  }

  const clearTimer = (id) => void timers.delete(id);

  class FakeDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(now);
      else super(...args);
    }
    static now() {
      return now;
    }
  }

  return {
    now: () => now,
    Date: FakeDate,
    setTimeout: (fn, delay, ...args) => schedule(fn, delay, args, false),
    clearTimeout: clearTimer,
    setInterval: (fn, delay, ...args) => schedule(fn, delay, args, true),
    clearInterval: clearTimer,
    setImmediate: (fn, ...args) => schedule(fn, 0, args, false),
    clearImmediate: clearTimer,
    sleep: (ms) => new Promise((resolve) => schedule(resolve, ms, [], false)),
    advance,
    runAll,
    pending: () => timers.size,
  };
}
