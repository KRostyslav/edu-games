/**
 * Набір інструментів на спробу боса — обчислюється з прогресу, не зберігається.
 */

import { TOOLS } from "../data/tools.js";
import { levelsOfAct } from "../data/content.js";

export function toolUnlocked(progress, tool) {
  const rule = tool.unlock;
  if (rule.type === "act") {
    const levels = levelsOfAct(rule.act);
    return levels.length > 0 && levels.every((level) => (progress.levels[level.id]?.stars ?? 0) > 0);
  }
  if (rule.type === "level") return (progress.levels[rule.level]?.stars ?? 0) >= rule.stars;
  if (rule.type === "streak") return (progress.quiz.streak ?? 0) >= rule.days;
  return false;
}

export function loadout(progress) {
  return TOOLS.map((tool) => ({ ...tool, unlocked: toolUnlocked(progress, tool) }));
}
