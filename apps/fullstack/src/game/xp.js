/**
 * Досвід і рівень героя. Нічого не зберігається: XP — функція від прогресу,
 * тож «накрутити» його можна лише навчившись. І нічого ним не блокується:
 * рівень — дзеркало, а не бар'єр.
 */

import { MASTERED_BOX } from "@edu/study-kit/leitner";

export const XP_RULES = { star: 10, boss: 100, masteredCard: 2, article: 1 };

export function xpOf(progress, { cardIds = null } = {}) {
  const stars = Object.values(progress.levels).reduce((sum, entry) => sum + entry.stars, 0);
  const bosses = Object.values(progress.bosses).filter((entry) => entry.won).length;
  const cardSet = cardIds ? new Set(cardIds) : null;
  const mastered = Object.entries(progress.quiz.boxes).filter(
    ([id, entry]) => entry.box >= MASTERED_BOX && (!cardSet || cardSet.has(id)),
  ).length;
  const articles = Object.keys(progress.codex.read).length;
  return (
    stars * XP_RULES.star + bosses * XP_RULES.boss + mastered * XP_RULES.masteredCard + articles * XP_RULES.article
  );
}

/** Скільки XP потрібно, щоб досягти рівня `level` (рівень 1 — з нуля). */
export function xpForLevel(level) {
  return (50 * level * (level - 1)) / 2;
}

/** Рівень героя і прогрес до наступного. */
export function heroLevel(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, into: xp - from, need: to - from, next: to };
}
