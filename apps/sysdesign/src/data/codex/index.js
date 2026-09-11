/**
 * Довідник цілком: статті всіх груп в одному словнику і глосарій.
 *
 * Статті розкладені по файлах за групами, щоб їх було зручно писати й
 * рецензувати, а все інше в грі бачить один `CODEX` і посилається на статті
 * за id — з палітри, інспектора, брифу, розбору, карток і співбесіди.
 */

import { WEB } from "./web.js";
import { NETWORK } from "./network.js";
import { SCALING } from "./scaling.js";
import { DATA } from "./data.js";
import { RELIABILITY } from "./reliability.js";
import { PATTERNS } from "./patterns.js";
import { PROBLEMS } from "./problems.js";
import { GLOSSARY } from "./glossary.js";
import { LEVEL_LIST } from "../levels.js";
import { LEVEL_ORDER } from "../order.js";
import { COMPONENTS } from "../components.js";

export const CODEX_GROUPS = ["Основи вебу", "Мережі й хмари", "Масштабування", "Дані", "Надійність", "Патерни", "Задачі"];

const ARTICLES = { ...WEB, ...NETWORK, ...SCALING, ...DATA, ...RELIABILITY, ...PATTERNS, ...PROBLEMS };

/**
 * «У грі» будується з рівнів і компонентів, а не пишеться руками: так
 * посилання «це тренує рівень 4» не розійдеться з кампанією, коли рівні
 * переставлять чи додадуть новий.
 */
function inGameText(id) {
  const levels = LEVEL_LIST.filter((level) => level.codexRefs?.includes(id)).map(
    (level) => `рівень ${LEVEL_ORDER.indexOf(level.id) + 1} «${level.title}»`,
  );
  const components = Object.values(COMPONENTS)
    .filter((def) => !def.fixed && def.codexRef === id)
    .map((def) => `«${def.label}»`);
  const parts = [];
  if (components.length) parts.push(`Компонент ${components.join(", ")} у конструкторі.`);
  if (levels.length) parts.push(`Тренується на: ${levels.join(", ")}.`);
  return parts.join(" ") || undefined;
}

export const CODEX = Object.fromEntries(
  Object.entries(ARTICLES).map(([id, entry]) => {
    const inGame = entry.inGame ?? inGameText(id);
    return [id, inGame ? { ...entry, inGame } : entry];
  }),
);

export const CODEX_IDS = CODEX_GROUPS.flatMap((group) => Object.keys(CODEX).filter((id) => CODEX[id].group === group));

export { GLOSSARY };

const normalize = (text) => text.toLocaleLowerCase("uk").replace(/[’ʼ`]/g, "'");

/**
 * Пошук за назвою, синонімами й підсумком. Назва важить більше: хто шукає
 * «кеш», має першою побачити статтю про кешування, а не кожну, де кеш згадано.
 */
export function searchCodex(query) {
  const needle = normalize(query.trim());
  if (!needle) return CODEX_IDS;
  const scored = [];
  for (const id of CODEX_IDS) {
    const entry = CODEX[id];
    let score = 0;
    if (normalize(entry.title).includes(needle)) score += 3;
    if (entry.aliases?.some((alias) => normalize(alias).includes(needle))) score += 2;
    if (normalize(entry.summary).includes(needle)) score += 1;
    if (score) scored.push({ id, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((item) => item.id);
}

/** Терміни глосарія, що підходять під запит. */
export function searchGlossary(query) {
  const needle = normalize(query.trim());
  if (!needle) return GLOSSARY;
  return GLOSSARY.filter((item) => normalize(item.term).includes(needle) || normalize(item.def).includes(needle));
}
