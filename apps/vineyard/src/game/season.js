import { createEngine, makeEffect } from "@edu/sim-core";
import { LIMITS } from "./model.js";
import { naturalProcesses } from "./natural.js";
import { rollWeather } from "./weather.js";
import { actionsForMonth } from "../data/actions.data.js";
import { SEASON_MONTHS } from "../data/calendar.js";

/**
 * Один хід = один місяць. Порядок фаз має значення й сам по собі є моделлю:
 *
 *   1) дії гравця   — укриття мусить встигнути захистити лозу від морозу,
 *                     який настане цього ж місяця;
 *   2) природа      — хвороби ростуть, волога випаровується, кущ живе;
 *   3) погода       — перевіряє, наскільки кущ виявився готовим.
 */
export function createSeasonEngine({ region, initialState, seed }) {
  const context = { region };

  const actionsPhase = ({ state, actions, rng }) => {
    const out = [];
    for (const action of actions) {
      const produced = action.apply({ state, month: state.month, region, rng }) ?? [];
      for (const effect of produced) {
        out.push(makeEffect({ ...effect, source: action.id }));
      }
      if (action.exclusiveGroup === "pruning") {
        out.push(
          makeEffect({
            target: "flags.pruned",
            delta: 1,
            reason: "Обрізку виконано — навантаження на сезон задано",
            source: action.id,
          }),
        );
      }
    }
    return out;
  };

  const weatherPhase = ({ state, actions, rng, meta }) => {
    const ctx = { state, actions, region, rng };
    const event = rollWeather(ctx, rng);
    if (!event) {
      meta.weather = { id: "calm", label: "Спокійний місяць", description: "Погода без несподіванок." };
      return [];
    }
    meta.weather = {
      id: event.id,
      label: event.label,
      description: event.describe(ctx),
    };
    return event.effects(ctx).map((e) => makeEffect({ ...e, source: `weather:${event.id}` }));
  };

  const engine = createEngine({
    initialState,
    phases: [actionsPhase, naturalProcesses, weatherPhase],
    limits: { ...LIMITS, "flags.pruned": [0, 1] },
    seed,
  });

  return {
    engine,
    context,

    /** Проходить місяць і повертає все потрібне для навчального розбору. */
    playMonth(selectedActions) {
      const before = engine.state;
      const month = before.month;
      const meta = {};

      const turn = engine.advance({ actions: selectedActions, meta });

      const missed = findMissedActions({
        state: before,
        month,
        region,
        chosen: selectedActions,
      });

      // Місяць змінюємо окремо від ефектів: це рух календаря, а не властивість куща.
      const next = structuredClone(turn.state);
      const index = SEASON_MONTHS.indexOf(month);
      const isSeasonEnd = index === SEASON_MONTHS.length - 1;
      if (!isSeasonEnd) next.month = SEASON_MONTHS[index + 1];
      next.seasonLog = [
        ...before.seasonLog,
        {
          month,
          actions: selectedActions.map((a) => a.id),
          weather: meta.weather,
          missed: missed.map((m) => m.id),
        },
      ];
      // Накопичуємо ефекти за весь сезон — річний звіт аналізує саме їх,
      // тому не може розійтися з тим, що гравець бачив у місячних розборах.
      next.seasonEffects = [...(before.seasonEffects ?? []), ...turn.effects];
      engine.setState(next);

      return {
        month,
        before,
        after: next,
        effects: turn.effects,
        weather: meta.weather,
        missed,
        isSeasonEnd,
      };
    },
  };
}

/**
 * Важливі дії, які гравець не зробив.
 *
 * Без цього гра вчила б лише наслідкам зроблених дій. Але половина
 * виноградарства — це те, що треба було зробити й не зробили, і саме ці
 * пропуски найважче помітити самому.
 */
export function findMissedActions({ state, month, region, chosen }) {
  const chosenIds = new Set(chosen.map((a) => a.id));
  const ctx = { state, month, region, flags: state.flags };

  return actionsForMonth(month, region)
    .filter((action) => action.important?.(ctx))
    .filter((action) => !chosenIds.has(action.id))
    .filter((action) => {
      // Дію, недоступну через умову (нема чого знімати — кущ не вкритий),
      // пропуском вважати не можна.
      const blocked = action.requires?.(state);
      return !blocked;
    })
    .filter((action) => {
      // Взаємовиключні дії: якщо гравець обрав інший варіант обрізки,
      // це не пропуск.
      if (!action.exclusiveGroup) return true;
      return !chosen.some((a) => a.exclusiveGroup === action.exclusiveGroup);
    });
}
