/**
 * Клієнт головного потоку до Postgres-воркера. Той самий інтерфейс, що й
 * `createLocalDb` (reset / exec), тож `checkers.js` не знає, де живе база.
 *
 * Завислий запит лікується так само, як завислий процес у проді: воркер
 * вбивається, наступний виклик піднімає новий. Стан бази при цьому
 * втрачається, тому після таймауту екран робить reset.
 */

export const QUERY_TIMEOUT_MS = 8000;
export const BOOT_TIMEOUT_MS = 45_000;

export class SqlTimeoutError extends Error {
  constructor(ms) {
    super(
      `Запит виконувався довше ${ms / 1000} с, тому Postgres зупинено й перезапущено. ` +
        "Схоже на декартів добуток (JOIN без умови) або генерацію мільйонів рядків.",
    );
    this.name = "SqlTimeoutError";
    this.code = "TIMEOUT";
  }
}

export function createSqlClient({ timeoutMs = QUERY_TIMEOUT_MS } = {}) {
  let worker = null;
  let seq = 0;
  let booted = false;
  const pending = new Map();

  function failAll(error) {
    worker?.terminate();
    worker = null;
    booted = false;
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  }

  function spawn() {
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event) => {
      const { id, ok, result, error } = event.data ?? {};
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      clearTimeout(entry.timer);
      if (ok) {
        booted = true;
        entry.resolve(result);
      } else entry.reject(Object.assign(new Error(error.message), error));
    });
    worker.addEventListener("error", (event) => {
      event.preventDefault?.();
      failAll(new Error(`Postgres-воркер впав: ${event.message || "невідома помилка"}`));
    });
  }

  function call(op, payload) {
    if (!worker) spawn();
    // Перший виклик вантажить WASM (~3 МБ) і стартує Postgres — даємо йому більше часу.
    const limit = booted ? timeoutMs : BOOT_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      seq += 1;
      const id = seq;
      const timer = setTimeout(() => failAll(new SqlTimeoutError(limit)), limit);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, op, ...payload });
    });
  }

  return {
    get booted() {
      return booted;
    },
    reset: (datasetId) => call("reset", { datasetId }),
    exec: (sql) => call("exec", { sql }),
    destroy() {
      failAll(new Error("Екран закрито"));
    },
  };
}
