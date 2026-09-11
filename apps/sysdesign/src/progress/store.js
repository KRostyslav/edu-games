/**
 * Прогрес гравця: зірки кампанії, чернетки схем, коробки карток, оцінки, історія співбесід.
 *
 * Одне сховище на всю гру (`edu-sim:sysdesign`). Версію не підвищуємо ніколи:
 * `createStorage` на новій версії мовчки стер би людині прогрес. Натомість
 * `repairProgress` на кожному завантаженні приводить будь-які дані — старі,
 * биті, чужі — до коректної форми. Він чистий, ідемпотентний і не кидає:
 * найгірше, що може статися, — прогрес почнеться з нуля, а гра не впаде.
 */

import { createStorage } from "@edu/sim-core";
import { LEVEL_ORDER } from "../data/order.js";

export const STORAGE_NS = "sysdesign";
export const MAX_MOCKS = 20;

export function defaultProgress() {
  return {
    campaign: {},
    quiz: { boxes: {}, lastDay: null, streak: 0 },
    estimate: {},
    mocks: [],
    activeMock: null,
    codex: { read: {} },
    settings: { speed: 1 },
  };
}

/**
 * @param raw       будь-що з localStorage
 * @param ids       відомі ідентифікатори: { levels, cards, problems } — невідомі викидаються
 */
export function repairProgress(raw, ids = {}) {
  try {
    return repair(raw, ids);
  } catch {
    return defaultProgress();
  }
}

const isObject = (value) => value != null && typeof value === "object" && !Array.isArray(value);
const clampInt = (value, min, max, fallback) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;

function repair(raw, { levels = LEVEL_ORDER, cards = null, problems = null }) {
  const out = defaultProgress();
  if (!isObject(raw)) return out;

  const levelSet = new Set(levels);
  for (const [id, entry] of Object.entries(isObject(raw.campaign) ? raw.campaign : {})) {
    if (!levelSet.has(id) || !isObject(entry)) continue;
    out.campaign[id] = {
      stars: clampInt(entry.stars, 0, 3, 0),
      best: isObject(entry.best) ? { cost: Number(entry.best.cost) || 0, availability: Number(entry.best.availability) || 0 } : null,
      // Сам граф нормалізує normalizeGraph під час відкриття рівня — там відомі правила рівня.
      draft: isObject(entry.draft) && Array.isArray(entry.draft.nodes) ? entry.draft : null,
      solvedAt: Number.isFinite(entry.solvedAt) ? entry.solvedAt : null,
      hintsUsed: clampInt(entry.hintsUsed, 0, 3, 0),
    };
  }

  const quiz = isObject(raw.quiz) ? raw.quiz : {};
  const cardSet = cards ? new Set(cards) : null;
  for (const [id, entry] of Object.entries(isObject(quiz.boxes) ? quiz.boxes : {})) {
    if ((cardSet && !cardSet.has(id)) || !isObject(entry)) continue;
    out.quiz.boxes[id] = {
      box: clampInt(entry.box, 1, 5, 1),
      due: clampInt(entry.due, 0, 1e7, 0),
      seen: clampInt(entry.seen, 0, 1e6, 0),
      correct: clampInt(entry.correct, 0, 1e6, 0),
    };
  }
  out.quiz.lastDay = Number.isFinite(quiz.lastDay) ? quiz.lastDay : null;
  out.quiz.streak = clampInt(quiz.streak, 0, 1e5, 0);

  const problemSet = problems ? new Set(problems) : null;
  for (const [id, entry] of Object.entries(isObject(raw.estimate) ? raw.estimate : {})) {
    if ((problemSet && !problemSet.has(id)) || !isObject(entry)) continue;
    out.estimate[id] = { bestStars: clampInt(entry.bestStars, 0, 3, 0), attempts: clampInt(entry.attempts, 0, 1e6, 0) };
  }

  out.mocks = (Array.isArray(raw.mocks) ? raw.mocks : []).filter(isObject).slice(-MAX_MOCKS);
  out.activeMock = isObject(raw.activeMock) ? raw.activeMock : null;

  for (const [id, value] of Object.entries(isObject(raw.codex?.read) ? raw.codex.read : {})) {
    if (value === true) out.codex.read[id] = true;
  }

  const speed = raw.settings?.speed;
  out.settings.speed = [1, 2, 4].includes(speed) ? speed : 1;
  return out;
}

/**
 * Живе сховище: один об'єкт стану, зміни через `update`, збереження з
 * невеликою затримкою — щоб перетягування вузла не писало в localStorage
 * шістдесят разів на секунду.
 */
export function createProgressStore({ backend = createStorage(STORAGE_NS, 1), ids } = {}) {
  let state = repairProgress(backend.load(), ids);
  const listeners = new Set();
  let timer = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    backend.save(state);
  };
  const notify = () => listeners.forEach((fn) => fn(state));

  if (typeof window !== "undefined") window.addEventListener("pagehide", flush);

  return {
    get state() {
      return state;
    },
    update(mutator, { immediate = false } = {}) {
      mutator(state);
      notify();
      if (immediate) flush();
      else {
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, 500);
      }
    },
    flush,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    reset() {
      state = defaultProgress();
      flush();
      notify();
    },
  };
}

/** Номер дня за локальним часом — одиниця розкладу карток. */
export function dayNumber(date = new Date()) {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
}
