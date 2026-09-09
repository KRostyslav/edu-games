import { createEngine, makeEffect } from "@edu/sim-core";
import { CULTIVARS } from "../data/plants.data.js";
import { SEASON_MONTHS } from "../data/calendar.js";
import { actionsForMonth } from "../data/actions.data.js";
import { LIMITS, PLANT_IDS, livePlantIds, pathFor } from "./model.js";
import { climatePhase } from "./climate.js";
import { plantsPhase } from "./plants.js";
import { rollBalconyEvents } from "./weather.js";
import { buildAutopsy, judge, risksFor } from "./verdict.js";
import { makeSource } from "./source.js";

/**
 * Один хід = один місяць. Порядок фаз сам по собі є моделлю:
 *
 *   1) дії гравця   — пінопласт мусить встигнути захистити грудку від
 *                     похолодання, яке настане цього ж місяця;
 *   2) клімат       — календар і обладнання перетворюються на реальні умови;
 *   3) рослини      — реакція на середовище, яке вже склалося;
 *   4) події        — перевірка, наскільки гравець виявився готовим;
 *   5) вирок        — остання, бо мусить бачити результат усіх попередніх.
 */
export function createSeasonEngine({ initialState, seed }) {
  const actionsPhase = ({ state, actions, rng, meta }) => {
    const out = [];

    for (const { action, plantId } of actions) {
      if (action.scope === "plant") {
        const plant = state.plants[plantId];
        // Мертвий горщик доглядати нічим — дія просто не застосовується.
        // Виняток один: посів насіння, який саме з порожнім горщиком і працює.
        if (!plant) continue;
        if (plant.alive <= 0 && !action.revives) continue;

        const produced =
          action.apply({
            state,
            plant,
            plantId,
            cultivar: CULTIVARS[plantId],
            month: state.month,
            rng,
            meta,
            P: pathFor(plantId),
          }) ?? [];

        for (const effect of produced) {
          out.push(makeEffect({ ...effect, source: makeSource({ kind: "action", id: action.id, plantId }) }));
        }
      } else {
        const produced = action.apply({ state, month: state.month, rng, meta }) ?? [];
        for (const effect of produced) {
          out.push(makeEffect({ ...effect, source: makeSource({ kind: "action", id: action.id }) }));
        }
      }
    }

    return out;
  };

  const eventsPhase = ({ state, rng, meta }) => {
    const ctx = { state, rng };
    const events = rollBalconyEvents(ctx, rng);

    meta.events = events.map((event) => ({
      id: event.id,
      label: event.label,
      description: event.describe(ctx),
    }));

    const out = [];
    for (const event of events) {
      const source = makeSource({ kind: "event", id: event.id });
      for (const effect of event.effects(ctx)) {
        out.push(makeEffect({ ...effect, source }));
      }
    }
    return out;
  };

  /**
   * Вирок і маркери ризику.
   *
   * Маркери — це не показники, тому ефектами вони не є: вони йдуть у meta,
   * а `playMonth` дописує їх у журнал рослини. Зате сама загибель — ефект,
   * і тому вона з'являється в розборі місяця тим самим форматом, що й усе інше.
   */
  const verdictPhase = ({ state, meta }) => {
    meta.markers = [];
    meta.deaths = [];
    meta.risks = {};

    const out = [];

    for (const id of livePlantIds(state)) {
      const plant = state.plants[id];
      const risks = risksFor(plant, state, id);
      meta.risks[id] = risks;

      for (const risk of risks) {
        if (risk.severity !== "bad" || !risk.chainFor) continue;
        meta.markers.push({
          plantId: id,
          code: risk.code,
          chainFor: risk.chainFor,
          year: state.year,
          month: state.month,
          tone: "bad",
          text: risk.text,
        });
      }

      const verdict = judge(plant, state, id);
      if (!verdict) continue;

      meta.deaths.push({ plantId: id, ...verdict, year: state.year, month: state.month });
      out.push(
        makeEffect({
          target: pathFor(id)("alive"),
          delta: -1,
          tone: "bad",
          reason: verdict.reason,
          source: makeSource({ kind: "death", id: verdict.code, plantId: id }),
        }),
      );
    }

    return out;
  };

  const engine = createEngine({
    initialState,
    phases: [actionsPhase, climatePhase, plantsPhase, eventsPhase, verdictPhase],
    limits: LIMITS,
    seed,
  });

  return {
    engine,

    /** Проживає місяць і повертає все потрібне для навчального розбору. */
    playMonth(selections) {
      const before = engine.state;
      const month = before.month;
      const meta = {};

      const turn = engine.advance({ actions: selections, meta });

      const missed = findMissedActions({ state: before, month, chosen: selections });

      const next = structuredClone(turn.state);

      // Календар рухається окремо від ефектів: це рух часу, а не властивість рослини.
      const index = SEASON_MONTHS.indexOf(month);
      const isSeasonEnd = index === SEASON_MONTHS.length - 1;
      if (!isSeasonEnd) next.month = SEASON_MONTHS[index + 1];

      // Провітрювання — щомісячна робота, а не куплене обладнання: воно діє
      // рівно той місяць, коли його робили, і наступного вимагає повторення.
      next.flags.ventilated = 0;

      // Маркери ризику — журнал, а не показники. З них будується розтин.
      for (const marker of meta.markers ?? []) {
        next.plants[marker.plantId].journal.push(marker);
      }

      // Вирок фіксується разом із розтином: ланцюг подій треба зібрати саме
      // зараз, поки журнал ще належить цій рослині.
      for (const death of meta.deaths ?? []) {
        const plant = next.plants[death.plantId];
        plant.death = buildAutopsy(plant, death);
        next.deaths = [...(next.deaths ?? []), { plantId: death.plantId, ...plant.death }];
      }

      next.seasonLog = [
        ...before.seasonLog,
        {
          month,
          actions: selections.map((s) => ({ id: s.action.id, plantId: s.plantId ?? null })),
          events: meta.events ?? [],
          forecast: meta.forecast ?? null,
          missed: missed.map((m) => ({ id: m.action.id, plantId: m.plantId ?? null })),
          deaths: (meta.deaths ?? []).map((d) => ({ plantId: d.plantId, code: d.code })),
        },
      ];

      // Дрібні ефекти в сезонний журнал не пишемо: чотири рослини на п'ять фаз
      // дають близько шестисот записів за рік, і все це йде в localStorage.
      next.seasonEffects = [
        ...(before.seasonEffects ?? []),
        ...turn.effects.filter((effect) => Math.abs(effect.actualDelta) >= 1),
      ];

      engine.setState(next);

      return {
        month,
        before,
        after: next,
        effects: turn.effects,
        events: meta.events ?? [],
        forecast: meta.forecast ?? null,
        risks: meta.risks ?? {},
        deaths: meta.deaths ?? [],
        missed,
        isSeasonEnd,
      };
    },
  };
}

/**
 * Важливі дії, яких гравець не зробив.
 *
 * Половина догляду — це те, що треба було зробити й не зробили, і саме такі
 * пропуски найважче помітити самому. Для дій над рослиною пропуск рахується
 * окремо на кожен горщик: полити халапеньо й забути хабанеро — це пропуск.
 */
export function findMissedActions({ state, month, chosen }) {
  const chosenKeys = new Set(chosen.map((s) => `${s.action.id}@${s.plantId ?? ""}`));
  const chosenGroups = new Set(
    chosen
      .filter((s) => s.action.exclusiveGroup)
      .map((s) => `${s.action.exclusiveGroup}@${s.plantId ?? ""}`),
  );

  const missed = [];

  for (const action of actionsForMonth(month)) {
    const targets = action.scope === "plant" ? plantTargets(state, action) : [null];

    for (const plantId of targets) {
      if (chosenKeys.has(`${action.id}@${plantId ?? ""}`)) continue;
      if (action.exclusiveGroup && chosenGroups.has(`${action.exclusiveGroup}@${plantId ?? ""}`)) continue;

      const ctx = buildActionContext(state, action, plantId, month);
      // Недоступну дію пропуском вважати не можна: нема чого знімати з горщика,
      // який і так не вкритий.
      if (action.requires?.(ctx)) continue;
      if (!action.important?.(ctx)) continue;

      missed.push({ action, plantId });
    }
  }

  return missed;
}

/**
 * Горщики, до яких дія взагалі може застосовуватися.
 *
 * Звичайні дії працюють із живими рослинами, посів насіння — навпаки, лише з
 * порожнім горщиком. Панель і пошук пропусків користуються тим самим списком.
 */
export function plantTargets(state, action) {
  return PLANT_IDS.filter((id) =>
    action.revives ? state.plants[id].alive <= 0 : state.plants[id].alive > 0,
  ).filter((id) => appliesTo(action, id));
}

/** Чи доступна дія для цього сорту. */
export function appliesTo(action, plantId) {
  if (action.cultivars) return action.cultivars.includes(plantId);
  if (action.species) return action.species.includes(CULTIVARS[plantId].species);
  return true;
}

/** Контекст для `requires` / `important` — однаковий для панелі й для розрахунку. */
export function buildActionContext(state, action, plantId, month) {
  if (action.scope === "plant") {
    return {
      state,
      plant: state.plants[plantId],
      plantId,
      cultivar: CULTIVARS[plantId],
      month,
    };
  }
  return { state, month };
}
