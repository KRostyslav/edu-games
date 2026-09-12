/**
 * Кар'єрний шар: грейд — найвищий щабель, для якого переможено боса-«підвищення»
 * і всіх попередніх. Стрибнути через щабель не можна, як і в житті.
 */

import { GRADES } from "../data/grades.js";
import { ACTS_BY_ID } from "../data/acts.js";
import { BOSS_LIST, bossOfAct } from "../data/content.js";

export function gradeIndex(progress) {
  let index = 0;
  for (let i = 1; i < GRADES.length; i += 1) {
    const boss = bossOfAct(GRADES[i].act);
    if (boss && progress.bosses[boss.id]?.won) index = i;
    else break;
  }
  return index;
}

export const currentGrade = (progress) => GRADES[gradeIndex(progress)];

export const nextGrade = (progress) => GRADES[gradeIndex(progress) + 1] ?? null;

/** Що потрібно для наступного грейду — людською мовою. */
export function nextGradeRequirement(progress) {
  const next = nextGrade(progress);
  if (!next) return null;
  const act = ACTS_BY_ID[next.act];
  const boss = bossOfAct(next.act);
  return {
    grade: next,
    act,
    boss,
    text: boss ? `Перемогти боса акту «${act.title}» — ${boss.title}` : `Акт «${act.title}» ще в розробці`,
  };
}

/** Грейд, який дає перемога над цим босом, або null. */
export function gradeForBoss(bossId) {
  const boss = BOSS_LIST.find((item) => item.id === bossId);
  return boss ? (GRADES.find((grade) => grade.act === boss.act) ?? null) : null;
}

/** Титули за переможених босів. */
export function badges(progress) {
  return BOSS_LIST.filter((boss) => progress.bosses[boss.id]?.won).map((boss) => ({
    bossId: boss.id,
    title: boss.reward?.title ?? boss.title,
    act: boss.act,
  }));
}
