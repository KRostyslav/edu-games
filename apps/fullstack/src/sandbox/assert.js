/**
 * Мінімальний assert для тестів задач. `node:assert` у браузерному воркері
 * недоступний, а повідомлення мають бути українською й зрозумілими людині,
 * яка щойно написала свою першу функцію на бекенді.
 */

export class AssertionError extends Error {
  constructor(message, { actual, expected } = {}) {
    super(message);
    this.name = "AssertionError";
    this.actual = actual;
    this.expected = expected;
  }
}

/** Компактний показ значення в повідомленні. */
export function show(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "function") return `[функція ${value.name || "без імені"}]`;
  if (value === undefined) return "undefined";
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (value instanceof Map) return `Map(${show([...value.entries()])})`;
  if (value instanceof Set) return `Set(${show([...value])})`;
  try {
    const text = JSON.stringify(value, (key, x) => (typeof x === "bigint" ? `${x}n` : x === undefined ? "‹undefined›" : x));
    if (text === undefined) return String(value);
    return text.length > 160 ? `${text.slice(0, 157)}…` : text;
  } catch {
    return String(value);
  }
}

export function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map && b instanceof Map) || a.size !== b.size) return false;
    for (const [key, value] of a) if (!b.has(key) || !deepEqual(value, b.get(key))) return false;
    return true;
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set && b instanceof Set) || a.size !== b.size) return false;
    for (const value of a) if (!b.has(value)) return false;
    return true;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
}

function mismatch(message, actual, expected) {
  const detail = `очікували ${show(expected)}, отримали ${show(actual)}`;
  return new AssertionError(message ? `${message}: ${detail}` : `Очікували ${show(expected)}, отримали ${show(actual)}`, {
    actual,
    expected,
  });
}

/** Перевірка кинутої помилки: RegExp по message, функція-предикат або об'єкт полів. */
function matches(error, matcher) {
  if (matcher == null) return true;
  if (matcher instanceof RegExp) return matcher.test(String(error?.message ?? error));
  if (typeof matcher === "function") return Boolean(matcher(error));
  if (typeof matcher === "object") {
    return Object.entries(matcher).every(([key, value]) =>
      value instanceof RegExp ? value.test(String(error?.[key])) : Object.is(error?.[key], value),
    );
  }
  return false;
}

export const assert = {
  ok(value, message) {
    if (!value) throw new AssertionError(message ?? `Очікували істинне значення, отримали ${show(value)}`);
  },
  equal(actual, expected, message) {
    if (!Object.is(actual, expected)) throw mismatch(message, actual, expected);
  },
  notEqual(actual, expected, message) {
    if (Object.is(actual, expected)) throw new AssertionError(message ?? `Не очікували ${show(expected)}`);
  },
  deepEqual(actual, expected, message) {
    if (!deepEqual(actual, expected)) throw mismatch(message, actual, expected);
  },
  throws(fn, matcher, message) {
    try {
      fn();
    } catch (error) {
      if (!matches(error, matcher)) throw new AssertionError(message ?? `Кинуто не ту помилку: ${show(error)}`);
      return error;
    }
    throw new AssertionError(message ?? "Очікували помилку, але функція завершилася без неї");
  },
  async rejects(promiseOrFn, matcher, message) {
    try {
      await (typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn);
    } catch (error) {
      if (!matches(error, matcher)) throw new AssertionError(message ?? `Відхилено не з тією помилкою: ${show(error)}`);
      return error;
    }
    throw new AssertionError(message ?? "Очікували відхилений проміс, але він виконався успішно");
  },
  fail(message) {
    throw new AssertionError(message);
  },
};
