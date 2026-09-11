/**
 * Що відкрито в кампанії. Розблокування обчислюється з зірок, а не зберігається:
 * так воно не може розійтися з прогресом, а новий рівень, вставлений у середину
 * кампанії, одразу займе правильне місце.
 *
 * Довідник, картки, оцінки й співбесіда відкриті завжди — знання не ховаємо.
 */

import { LEVEL_ORDER } from "../data/order.js";

export function levelStars(progress, levelId) {
  return progress.campaign[levelId]?.stars ?? 0;
}

export function isLevelOpen(progress, levelId) {
  const index = LEVEL_ORDER.indexOf(levelId);
  if (index <= 0) return index === 0;
  return levelStars(progress, LEVEL_ORDER[index - 1]) >= 1;
}

export function totalStars(progress) {
  return LEVEL_ORDER.reduce((sum, id) => sum + levelStars(progress, id), 0);
}

/** Перший відкритий рівень без трьох зірок — туди веде кнопка «Продовжити». */
export function nextLevelId(progress) {
  return LEVEL_ORDER.find((id) => isLevelOpen(progress, id) && levelStars(progress, id) < 3) ?? LEVEL_ORDER[LEVEL_ORDER.length - 1];
}
