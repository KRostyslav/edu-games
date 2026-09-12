/**
 * Головний потік пісочниці: один «теплий» воркер, run-id для кожного запуску
 * і жорсткий таймаут. Синхронний нескінченний цикл воркер не переживе:
 * за таймаутом ми його вбиваємо й наступний запуск піднімає новий.
 *
 * Це та сама механіка, що й у проді: заблокований event loop не відповідає
 * ні на що, і єдиний спосіб його «розбудити» — перезапустити процес.
 */

export const HARD_TIMEOUT_MS = 3000;

export function createRunner({ timeoutMs = HARD_TIMEOUT_MS } = {}) {
  let worker = null;
  let seq = 0;
  let pending = null;

  function spawn() {
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event) => {
      const { runId } = event.data ?? {};
      if (!pending || runId !== pending.runId) return;
      const { resolve } = pending;
      clearTimeout(pending.timer);
      pending = null;
      if (event.data.error) resolve({ ok: false, crashed: true, message: event.data.error, results: [], logs: [] });
      else resolve(event.data.result);
    });
    worker.addEventListener("error", (event) => {
      event.preventDefault?.();
      fail(`Воркер пісочниці впав: ${event.message || "невідома помилка"}`);
    });
    worker.addEventListener("messageerror", () => fail("Результат не вдалося передати з воркера"));
  }

  function kill() {
    worker?.terminate();
    worker = null;
  }

  function fail(message, extra = {}) {
    if (!pending) return;
    const { resolve } = pending;
    clearTimeout(pending.timer);
    pending = null;
    kill();
    resolve({ ok: false, crashed: true, message, results: [], logs: [], ...extra });
  }

  /** Запуск тестів задачі. Новий запуск скасовує попередній. */
  function run(taskId, source) {
    if (pending) fail("Запуск скасовано новим");
    if (!worker) spawn();
    seq += 1;
    const runId = seq;
    return new Promise((resolve) => {
      const timer = setTimeout(
        () =>
          fail(
            `Код не повернув керування за ${timeoutMs / 1000} с. Схоже на нескінченний цикл або важку синхронну роботу. ` +
              "Саме так блокується event loop у Node: поки цикл крутиться, сервер не обслуговує жодного іншого запиту.",
            { timeout: true },
          ),
        timeoutMs,
      );
      pending = { runId, resolve, timer };
      worker.postMessage({ runId, taskId, source });
    });
  }

  return {
    run,
    destroy() {
      if (pending) fail("Екран закрито");
      kill();
    },
  };
}
