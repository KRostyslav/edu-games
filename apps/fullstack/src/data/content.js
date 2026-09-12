/**
 * Збирає контент усіх актів у плоскі реєстри. Кожен акт живе у власній теці
 * `acts/<id>/` і нічого не знає про інші — так новий акт додається новою
 * текою й одним рядком тут.
 */

import { CONTENT as prologue } from "./acts/prologue/index.js";
import { CONTENT as runtime } from "./acts/runtime/index.js";
import { CONTENT as http } from "./acts/http/index.js";
import { CONTENT as data } from "./acts/data/index.js";

const PACKS = [prologue, runtime, http, data];

export const LEVEL_LIST = PACKS.flatMap((pack) => pack.levels);
export const LEVELS = Object.fromEntries(LEVEL_LIST.map((level) => [level.id, level]));
export const LEVEL_ORDER = LEVEL_LIST.map((level) => level.id);

export const BOSS_LIST = PACKS.map((pack) => pack.boss).filter(Boolean);
export const BOSSES = Object.fromEntries(BOSS_LIST.map((boss) => [boss.id, boss]));

export const SKILLS = PACKS.flatMap((pack) => pack.skills);
export const CARDS = PACKS.flatMap((pack) => pack.cards);
export const CARD_IDS = CARDS.map((card) => card.id);

/** Статті довідника в порядку актів; групу кожній дає її акт. */
export const CODEX_PACKS = PACKS.map((pack) => ({ act: pack.act, codex: pack.codex }));

export function levelsOfAct(actId) {
  return LEVEL_LIST.filter((level) => level.act === actId);
}

export function bossOfAct(actId) {
  return BOSS_LIST.find((boss) => boss.act === actId) ?? null;
}
