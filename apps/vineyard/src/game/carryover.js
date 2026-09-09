import { cloneState } from "@edu/sim-core";
import { loadFactor } from "./model.js";

/**
 * Перехід у наступний сезон.
 *
 * Головна навчальна ідея всієї гри живе саме тут: врожай — не подія одного року.
 * Перевантажений цього року кущ програє наступного, а інфекція, яку не добили
 * восени, чекатиме на весні.
 */
export function startNextYear(state, harvest) {
  const next = cloneState(state);
  const notes = [];

  next.year += 1;
  next.month = 10;

  // ── Виснаження врожаєм ──
  // Кущ віддав урожай і мусить відновити запас. Що більший урожай — то
  // дорожче він обійшовся багаторічній деревині.
  const drain = Math.round(harvest.kg * 1.6);
  next.vine.reserves = clamp(next.vine.reserves - drain);
  notes.push({
    tone: drain > 14 ? "warn" : "neutral",
    text: `Урожай ${harvest.kg} кг забрав ${drain} одиниць запасу поживних речовин. Кущ входить у новий сезон із запасом ${Math.round(next.vine.reserves)}.`,
  });

  // ── Наслідки навантаження ──
  const lf = loadFactor(state.vine.load);
  if (state.vine.load > 68) {
    const penalty = Math.round((state.vine.load - 68) * 0.5);
    next.vine.reserves = clamp(next.vine.reserves - penalty);
    next.vine.vigor = clamp(next.vine.vigor - penalty);
    notes.push({
      tone: "bad",
      text: `Кущ був перевантажений (${Math.round(state.vine.load)} при оптимумі 55). Він не встиг ні налити грона, ні відкласти запас — наступного року дасть менше, навіть за ідеального догляду.`,
    });
  } else if (lf > 0.9) {
    next.vine.vigor = clamp(next.vine.vigor + 5);
    notes.push({
      tone: "good",
      text: "Навантаження було збалансованим — кущ зберіг силу росту й повноцінно відновиться.",
    });
  }

  // ── Невизріла лоза — це проблема наступної зими ──
  if (state.vine.woodRipeness < 45) {
    notes.push({
      tone: "bad",
      text: `Лоза визріла лише на ${Math.round(state.vine.woodRipeness)}/100. У зиму вона піде напівзеленою, і морозостійкість буде низькою незалежно від укриття.`,
    });
  }

  // ── Інфекційний фон переноситься ──
  next.disease.mildew = clamp(state.disease.mildew * 0.55);
  next.disease.oidium = clamp(state.disease.oidium * 0.55);
  next.disease.rot = clamp(state.disease.rot * 0.4);
  next.disease.pests = clamp(state.disease.pests * 0.6);
  if (next.disease.mildew > 35) {
    notes.push({
      tone: "warn",
      text: `Інфекція мілдью не добита (${Math.round(next.disease.mildew)}/100) — вона перезимує й дасть ранній весняний старт хвороби.`,
    });
  }

  // ── Ґрунт: органіка й структура деградують без поповнення ──
  next.soil.organic = clamp(state.soil.organic - 8);
  next.soil.structure = clamp(state.soil.structure - 6);
  next.soil.nitrogen = clamp(state.soil.nitrogen * 0.5);
  next.soil.phosphorus = clamp(state.soil.phosphorus * 0.75);
  next.soil.potassium = clamp(state.soil.potassium * 0.6);

  // ── Скидання сезонного ──
  next.vine.budsAlive = 95;
  next.vine.canopy = 15;
  next.crop = { setRate: 0, berrySize: 0, sugar: 0, sanitary: 0 };
  next.flags = {
    covered: 0,
    toolsReady: 0,
    frostGuard: 0,
    wateringStopped: 0,
    measured: 0,
    pruned: 0,
  };
  next.seasonLog = [];
  next.seasonEffects = [];
  next.harvests = [...state.harvests, { year: state.year, ...harvest }];

  return { state: next, notes };
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(v)));
}
