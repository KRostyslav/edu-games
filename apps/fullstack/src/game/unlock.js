/**
 * Що відкрито, а що ні. Нічого з цього не зберігається — усе виводиться із
 * зірок і перемог, тож новий рівень, вставлений у середину акту, не ламає
 * нічийого прогресу.
 *
 * Правила:
 *  - рівень відкритий, якщо відкритий його акт і попередній рівень акту має ≥ 1★;
 *  - бос відкритий, коли всі рівні його акту мають ≥ 1★;
 *  - акт відкритий, коли завершено попередній: переможено його боса
 *    (або, якщо боса немає, пройдено всі рівні).
 */

import { PLAYABLE_ACTS, ACTS_BY_ID } from "../data/acts.js";
import { LEVELS, LEVEL_LIST, BOSSES, levelsOfAct, bossOfAct } from "../data/content.js";

export const levelStars = (progress, levelId) => progress.levels[levelId]?.stars ?? 0;
export const bossWon = (progress, bossId) => progress.bosses[bossId]?.won === true;

export function actComplete(progress, actId) {
  const boss = bossOfAct(actId);
  if (boss) return bossWon(progress, boss.id);
  const levels = levelsOfAct(actId);
  return levels.length > 0 && levels.every((level) => levelStars(progress, level.id) > 0);
}

export function isActOpen(progress, actId) {
  const act = ACTS_BY_ID[actId];
  if (!act || act.soon) return false;
  const index = PLAYABLE_ACTS.findIndex((item) => item.id === actId);
  if (index <= 0) return true;
  return actComplete(progress, PLAYABLE_ACTS[index - 1].id);
}

export function isLevelOpen(progress, levelId) {
  const level = LEVELS[levelId];
  if (!level || !isActOpen(progress, level.act)) return false;
  const list = levelsOfAct(level.act);
  const index = list.findIndex((item) => item.id === levelId);
  return index === 0 || levelStars(progress, list[index - 1].id) > 0;
}

export function isBossOpen(progress, bossId) {
  const boss = BOSSES[bossId];
  if (!boss || !isActOpen(progress, boss.act)) return false;
  return levelsOfAct(boss.act).every((level) => levelStars(progress, level.id) > 0);
}

export function totalStars(progress) {
  return LEVEL_LIST.reduce((sum, level) => sum + levelStars(progress, level.id), 0);
}

export function maxStars() {
  return LEVEL_LIST.length * 3;
}

export function actStats(progress, actId) {
  const levels = levelsOfAct(actId);
  const boss = bossOfAct(actId);
  return {
    stars: levels.reduce((sum, level) => sum + levelStars(progress, level.id), 0),
    max: levels.length * 3,
    done: levels.filter((level) => levelStars(progress, level.id) > 0).length,
    total: levels.length,
    bossId: boss?.id ?? null,
    bossWon: boss ? bossWon(progress, boss.id) : false,
  };
}

/**
 * Куди веде кнопка «Продовжити»: перший непройдений рівень, потім бос, а коли
 * все пройдено — перший рівень, де ще не всі зірки.
 */
export function nextStep(progress) {
  for (const act of PLAYABLE_ACTS) {
    if (!isActOpen(progress, act.id)) break;
    for (const level of levelsOfAct(act.id)) {
      if (levelStars(progress, level.id) === 0) return { type: "level", id: level.id };
    }
    const boss = bossOfAct(act.id);
    if (boss && !bossWon(progress, boss.id)) return { type: "boss", id: boss.id };
  }
  for (const level of LEVEL_LIST) {
    if (isLevelOpen(progress, level.id) && levelStars(progress, level.id) < 3) return { type: "level", id: level.id, polish: true };
  }
  return null;
}

/** Наступний рівень того самого акту (для кнопки «Далі» в дебрифі) або бос. */
export function afterLevel(progress, levelId) {
  const level = LEVELS[levelId];
  if (!level) return null;
  const list = levelsOfAct(level.act);
  const index = list.findIndex((item) => item.id === levelId);
  const next = list[index + 1];
  if (next) return { type: "level", id: next.id };
  const boss = bossOfAct(level.act);
  if (boss && isBossOpen(progress, boss.id) && !bossWon(progress, boss.id)) return { type: "boss", id: boss.id };
  return nextStep(progress);
}
