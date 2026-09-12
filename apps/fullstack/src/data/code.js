/**
 * Реєстр задач JS-пісочниці. Окремо від решти контенту навмисно: його імпортує
 * воркер пісочниці, і тягнути туди тексти рівнів і довідника немає сенсу.
 *
 * Форма задачі:
 *   { id, title, brief, starter, exports: ["retry"], shims?: ["clock"],
 *     tests: [{ name, run: async ({ mod, assert, clock, redis, http, EventEmitter, once, Writable, tick }) => {} }],
 *     bonusTests?: [...], reference, naive }
 * `reference` мусить пройти всі тести (разом із бонусними), `naive` і
 * `starter` — впасти хоча б на одному основному: це перевіряє test/code.test.js.
 */

import { CODE as prologue } from "./acts/prologue/code.js";
import { CODE as runtime } from "./acts/runtime/code.js";
import { CODE as http } from "./acts/http/code.js";
import { CODE as data } from "./acts/data/code.js";

function merge(...packs) {
  const out = {};
  for (const pack of packs) {
    for (const [id, task] of Object.entries(pack)) {
      if (Object.hasOwn(out, id)) throw new Error(`Дубль задачі пісочниці: ${id}`);
      out[id] = { ...task, id };
    }
  }
  return out;
}

export const CODE_TASKS = merge(prologue, runtime, http, data);
