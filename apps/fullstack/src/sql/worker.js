/**
 * Воркер із Postgres (PGlite). Окремий потік з двох причин: WASM-Postgres
 * виконує запит синхронно й заморозив би сторінку, а важкий запит гравця
 * (декартів добуток на мільйони рядків) можна зупинити лише вбивши воркер.
 */

import { PGlite } from "@electric-sql/pglite";
import { DATASETS } from "../data/sql.js";
import { createLocalDb } from "./local.js";

const db = createLocalDb(PGlite, DATASETS);

self.addEventListener("message", async (event) => {
  const { id, op, sql, datasetId } = event.data ?? {};
  try {
    let result;
    if (op === "reset") result = await db.reset(datasetId);
    else if (op === "exec") result = await db.exec(sql);
    else throw new Error(`Невідома операція: ${op}`);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: {
        message: error?.message ?? String(error),
        code: error?.code ?? null,
        position: error?.position ?? null,
        detail: error?.detail ?? null,
        hint: error?.hint ?? null,
      },
    });
  }
});
