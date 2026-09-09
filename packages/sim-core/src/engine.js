import { applyEffects } from "./state.js";
import { createRng } from "./rng.js";

/**
 * Рушій покрокової симуляції. Нічого не знає про предметну область —
 * уся специфіка приходить у `phases`.
 *
 * Кожна фаза — функція (context) => Effect[]. Фази виконуються по черзі,
 * і кожна бачить стан, уже змінений попередніми: порядок має значення
 * (напр. дії гравця застосовуються ДО розіграшу погоди, бо укриття мусить
 * встигнути захистити лозу від морозу цього ж місяця).
 */
export function createEngine({ initialState, phases, limits = {}, seed = 1 }) {
  let state = structuredClone(initialState);
  const rng = createRng(seed);
  const history = [];

  function advance({ actions = [], meta = {} } = {}) {
    let working = state;
    const log = [];

    for (const phase of phases) {
      const produced = phase({ state: working, actions, rng, meta, log }) ?? [];
      if (produced.length === 0) continue;
      const result = applyEffects(working, produced, limits);
      working = result.state;
      log.push(...result.effects);
    }

    const turn = { state: working, effects: log, actions, meta };
    history.push(turn);
    state = working;
    return turn;
  }

  return {
    advance,
    get state() {
      return state;
    },
    setState(next) {
      state = structuredClone(next);
    },
    get history() {
      return history;
    },
    rng,
  };
}

/** Групує ефекти за джерелом — основа для панелі «що зробили / що сталося». */
export function groupEffects(effects) {
  const groups = new Map();
  for (const effect of effects) {
    if (!groups.has(effect.source)) groups.set(effect.source, []);
    groups.get(effect.source).push(effect);
  }
  return groups;
}

/** Найвпливовіші ефекти — для «топ-3» у річному звіті. */
export function topEffects(effects, { tone, limit = 3 } = {}) {
  return effects
    .filter((e) => (tone ? e.tone === tone : true))
    .filter((e) => Math.abs(e.actualDelta ?? e.delta) >= 1)
    .sort((a, b) => Math.abs(b.actualDelta ?? b.delta) - Math.abs(a.actualDelta ?? a.delta))
    .slice(0, limit);
}
