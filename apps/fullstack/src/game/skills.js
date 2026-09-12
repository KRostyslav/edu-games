/**
 * Дерево навичок. Вузол має чотири стани:
 *   locked   — жодного рівня навички ще не пройдено;
 *   learning — щось пройдено;
 *   learned  — усі рівні навички мають ★★ (розв'язано без підказок);
 *   mastered — плюс усі картки її тем витримали повтор через тиждень (коробка ≥ 4).
 *
 * Останній стан навмисно неможливо отримати за один вечір: «знаю» від
 * «пам'ятаю через місяць» відрізняє саме інтервальне повторення.
 */

import { MASTERED_BOX } from "@edu/study-kit/leitner";
import { SKILLS, CARDS } from "../data/content.js";

export function skillCards(skill) {
  return CARDS.filter((card) => skill.topics.includes(card.topic));
}

export function skillProgress(progress, skill) {
  const stars = skill.levels.map((id) => progress.levels[id]?.stars ?? 0);
  const cards = skillCards(skill);
  const masteredCards = cards.filter((card) => (progress.quiz.boxes[card.id]?.box ?? 0) >= MASTERED_BOX).length;
  const learned = stars.length > 0 && stars.every((n) => n >= 2);
  const mastered = learned && cards.length > 0 && masteredCards === cards.length;
  const state = mastered ? "mastered" : learned ? "learned" : stars.some((n) => n > 0) ? "learning" : "locked";
  return { state, levelsDone: stars.filter((n) => n >= 2).length, levelsTotal: stars.length, masteredCards, cardsTotal: cards.length };
}

export function skillsOfAct(actId) {
  return SKILLS.filter((skill) => skill.act === actId);
}

export function skillSummary(progress) {
  const states = SKILLS.map((skill) => skillProgress(progress, skill).state);
  return {
    total: SKILLS.length,
    learned: states.filter((s) => s === "learned" || s === "mastered").length,
    mastered: states.filter((s) => s === "mastered").length,
  };
}
