/**
 * Воркер пісочниці: отримує id задачі й код гравця, повертає результати тестів.
 * Живе окремим потоком саме для того, щоб `while (true) {}` гравця заморозив
 * лише його, а не сторінку, — runner просто вб'є воркер за таймаутом.
 */

import { CODE_TASKS } from "../data/code.js";
import { runTask } from "./harness.js";

self.addEventListener("message", async (event) => {
  const { runId, taskId, source } = event.data ?? {};
  const task = CODE_TASKS[taskId];
  if (!task) {
    self.postMessage({ runId, error: `Невідома задача: ${taskId}` });
    return;
  }
  try {
    const result = await runTask(task, source);
    self.postMessage({ runId, result });
  } catch (error) {
    self.postMessage({ runId, error: String(error?.message ?? error) });
  }
});

self.postMessage({ ready: true });
