/**
 * Ремонт збереження.
 *
 * Поки гра не завершувалася на 36-му місяці, `playMonth` продовжував дописувати
 * в `monthLog` і `history` записи з тим самим штампом `monthIndex: 36`. Такі
 * збереження треба полагодити, а не викинути: підняти версію в `createStorage`
 * означало б мовчки стерти людині партію.
 *
 * Функція чиста, ідемпотентна й ніколи не кидає — на виняток повертає стан як є.
 * Поламаний ремонт не має коштувати нікому гри, тому найгірше, що тут може
 * статися, — що ремонт нічого не змінить.
 *
 * Викликається на КОЖНОМУ завантаженні, а не лише на підозрілих: саме це робить
 * її ідемпотентною за побудовою й лишає один шлях виконання замість двох.
 */

import { TOTAL_MONTHS } from "./model.js";
import { judge, buildAutopsy } from "./verdict.js";

export function repairSave(input) {
  try {
    return repair(input);
  } catch {
    return input;
  }
}

function repair(input) {
  const state = structuredClone(input);

  // 1. Дублікати. Місяці 1–35 унікальні, повторюється лише 36-й — тому
  //    збереження першого запису дає лог зі строго зростаючими індексами,
  //    не відрізнимий від чесно зіграної партії.
  state.monthLog = dedupe(state.monthLog ?? [], (entry) => entry.monthIndex).slice(0, TOTAL_MONTHS);
  state.history = dedupe(state.history ?? [], (entry) => entry.monthIndex).slice(0, TOTAL_MONTHS);
  state.journal = dedupe(state.journal ?? [], (marker) => `${marker.code}@${marker.monthIndex}`);

  // 2. Зайві ходи справді рухали гроші й клієнтів, тому після обрізання остання
  //    точка історії розходиться з живим станом. Підганяємо її під стан, щоб
  //    графік у фіналі закінчувався там, де закінчується заголовок над ним.
  const last = state.history[state.history.length - 1];
  if (last) {
    last.mrr = state.biz.mrr;
    last.cash = state.biz.cash;
    last.customers = state.biz.customers;
    last.netProfit = state.biz.netProfit;
    last.energy = state.founder.energy;
  }
  // `cumNew`, `cumChurned` і `cumSpend` роздуті зайвими ходами незворотно:
  // це накопичувальні лічильники, і розкласти їх назад нема з чого. Приймаємо.

  // 3. Поля, яких не було в старих збереженнях.
  state.achieved = state.achieved ?? { ramen: null, salary: null };
  state.milestones = state.milestones ?? { goalOffered: false };
  state.finishedAt = state.finishedAt ?? null;
  state.soldFor = state.soldFor ?? null;
  state.soldAt = state.soldAt ?? null;
  state.declinedOffers = state.declinedOffers ?? [];

  // 4. Backfill досягнень. `salaryTarget` і `personalBurn` не мутуються ніде в
  //    моделі, тому серії відновлюються з `history[].netProfit` точно, а не
  //    приблизно — і фінал знає справжній місяць, у який мету було досягнуто.
  if (state.achieved.salary == null) {
    state.achieved.salary = streakEndsAt(state.history, (h) => h.netProfit >= state.biz.salaryTarget, 6);
  }
  if (state.achieved.ramen == null) {
    state.achieved.ramen = streakEndsAt(state.history, (h) => h.netProfit >= state.biz.personalBurn, 6);
  }

  // 5. Календар і вирок за новими правилами. Зависле збереження одразу
  //    розв'язується у свій справжній фінал і потрапляє на екран розбору.
  state.monthIndex = Math.min(TOTAL_MONTHS, (state.monthLog.length || 0) + 1);
  state.month = ((state.monthIndex - 1) % 12) + 1;
  state.year = Math.floor((state.monthIndex - 1) / 12) + 1;

  const verdict = judge(state);
  state.verdict = verdict ? buildAutopsy(state, verdict) : null;

  return state;
}

function dedupe(list, keyOf) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Місяць, у який серія довжиною `length` уперше завершилася, або null. */
export function streakEndsAt(history, predicate, length) {
  let run = 0;
  for (const entry of history) {
    run = predicate(entry) ? run + 1 : 0;
    if (run >= length) return entry.monthIndex;
  }
  return null;
}
