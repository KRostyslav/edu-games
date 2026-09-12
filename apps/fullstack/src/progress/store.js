/**
 * Прогрес гравця: зірки рівнів, боси, незавершена спроба боса, чернетки коду,
 * коробки карток, прочитані статті.
 *
 * Одне сховище на гру (`edu-sim:fullstack`). Версію не підвищуємо ніколи —
 * `createStorage` на новій версії мовчки стер би прогрес. Натомість
 * `repairProgress` на кожному завантаженні приводить будь-які дані (старі,
 * биті, чужі) до коректної форми: він чистий, ідемпотентний і не кидає.
 *
 * XP, грейд, навички й інструменти тут не зберігаються — вони обчислюються
 * з цього стану (game/*), тож не можуть розійтися з реальним прогресом.
 */

import { createStorage } from "@edu/sim-core";

export const STORAGE_NS = "fullstack";
export const MAX_DRAFT = 20_000;
export const MAX_LOG = 200;

export function defaultProgress() {
  return {
    levels: {},
    bosses: {},
    activeBoss: null,
    drafts: {},
    quiz: { boxes: {}, lastDay: null, streak: 0 },
    codex: { read: {} },
    seenIntro: false,
  };
}

const isObject = (value) => value != null && typeof value === "object" && !Array.isArray(value);
const clampInt = (value, min, max, fallback) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;

/**
 * @param raw  будь-що з localStorage
 * @param ids  відомі ідентифікатори { levels, bosses, cards, tasks } — невідомі викидаються;
 *             `bossPhases` — { bossId: кількість фаз } для перевірки незавершеної спроби
 */
export function repairProgress(raw, ids = {}) {
  try {
    return repair(raw, ids);
  } catch {
    return defaultProgress();
  }
}

function repair(raw, { levels = null, bosses = null, cards = null, tasks = null, bossPhases = {} }) {
  const out = defaultProgress();
  if (!isObject(raw)) return out;
  const known = (list) => (list ? new Set(list) : null);
  const levelSet = known(levels);
  const bossSet = known(bosses);
  const cardSet = known(cards);
  const taskSet = known(tasks);

  for (const [id, entry] of Object.entries(isObject(raw.levels) ? raw.levels : {})) {
    if ((levelSet && !levelSet.has(id)) || !isObject(entry)) continue;
    out.levels[id] = {
      stars: clampInt(entry.stars, 0, 3, 0),
      hintsUsed: clampInt(entry.hintsUsed, 0, 3, 0),
      solvedAt: Number.isFinite(entry.solvedAt) ? entry.solvedAt : null,
    };
  }

  for (const [id, entry] of Object.entries(isObject(raw.bosses) ? raw.bosses : {})) {
    if ((bossSet && !bossSet.has(id)) || !isObject(entry)) continue;
    out.bosses[id] = {
      won: entry.won === true,
      attempts: clampInt(entry.attempts, 0, 1e5, 0),
      bestBudget: clampInt(entry.bestBudget, 0, 99, 0),
      wonAt: Number.isFinite(entry.wonAt) ? entry.wonAt : null,
    };
  }

  out.activeBoss = repairAttempt(raw.activeBoss, bossSet, bossPhases);

  for (const [id, text] of Object.entries(isObject(raw.drafts) ? raw.drafts : {})) {
    if ((taskSet && !taskSet.has(id)) || typeof text !== "string") continue;
    out.drafts[id] = text.slice(0, MAX_DRAFT);
  }

  const quiz = isObject(raw.quiz) ? raw.quiz : {};
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

  for (const [id, value] of Object.entries(isObject(raw.codex?.read) ? raw.codex.read : {})) {
    if (value === true) out.codex.read[id] = true;
  }
  out.seenIntro = raw.seenIntro === true;
  return out;
}

/** Незавершена спроба боса або null, якщо її не можна безпечно продовжити. */
function repairAttempt(raw, bossSet, bossPhases) {
  if (!isObject(raw) || typeof raw.bossId !== "string") return null;
  if (bossSet && !bossSet.has(raw.bossId)) return null;
  if (raw.status !== "active") return null;
  const phases = bossPhases[raw.bossId];
  const phase = clampInt(raw.phase, 0, 99, 0);
  if (Number.isFinite(phases) && phase >= phases) return null;
  const budget = clampInt(raw.budget, 0, 99, 0);
  if (budget <= 0) return null;
  const log = (Array.isArray(raw.log) ? raw.log : [])
    .filter((entry) => isObject(entry) && typeof entry.type === "string")
    .slice(-MAX_LOG)
    .map((entry) => ({
      type: entry.type,
      phase: clampInt(entry.phase, 0, 99, 0),
      text: typeof entry.text === "string" ? entry.text.slice(0, 600) : "",
    }));
  const hints = {};
  for (const [id, n] of Object.entries(isObject(raw.hints) ? raw.hints : {})) hints[id] = clampInt(n, 0, 9, 0);
  return {
    bossId: raw.bossId,
    phase,
    budget,
    maxBudget: clampInt(raw.maxBudget, 1, 99, budget),
    log,
    usedTools: (Array.isArray(raw.usedTools) ? raw.usedTools : []).filter((id) => typeof id === "string").slice(0, 20),
    hints,
    status: "active",
  };
}

/**
 * Живе сховище: один об'єкт стану, зміни через `update`, збереження з
 * невеликою затримкою, щоб набір коду не писав у localStorage на кожну клавішу.
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
