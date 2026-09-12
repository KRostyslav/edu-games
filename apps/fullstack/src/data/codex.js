/**
 * Довідник: статті всіх актів плюс загальні (кар'єра, практики).
 *
 * Форма статті:
 *   { title, aliases?, summary, how, code?: [{ lang, caption, src }],
 *     tradeoffs?: ["+ …", "− …"], numbers?: [], interview?: [],
 *     frontendBridge?: "як це пов'язано з React/браузером", see: [] }
 *
 * Групу статті дає її акт, а поле `inGame` (де стаття зустрічається в грі)
 * обчислюється з рівнів і босів — вручну його не пишуть, щоб не розходилось.
 */

import { ACTS } from "./acts.js";
import { CODEX_PACKS, LEVEL_LIST, BOSS_LIST } from "./content.js";
import { CAREER_CODEX } from "./codex-career.js";

const CAREER_GROUP = { id: "career", title: "Кар'єра і практики" };

function build() {
  const articles = {};
  const groups = [];
  const add = (group, pack) => {
    const ids = [];
    for (const [id, article] of Object.entries(pack)) {
      if (Object.hasOwn(articles, id)) throw new Error(`Дубль статті довідника: ${id}`);
      articles[id] = { ...article, id, group: group.title, groupId: group.id, inGame: [] };
      ids.push(id);
    }
    if (ids.length) groups.push({ ...group, ids });
  };
  for (const pack of CODEX_PACKS) {
    const act = ACTS.find((item) => item.id === pack.act);
    add({ id: act.id, title: act.title }, pack.codex);
  }
  add(CAREER_GROUP, CAREER_CODEX);

  for (const level of LEVEL_LIST) {
    for (const ref of level.codexRefs ?? []) articles[ref]?.inGame.push({ type: "level", id: level.id, title: level.title });
  }
  for (const boss of BOSS_LIST) {
    for (const ref of boss.codexRefs ?? []) articles[ref]?.inGame.push({ type: "boss", id: boss.id, title: boss.title });
  }
  return { articles, groups };
}

const built = build();

export const CODEX = built.articles;
export const CODEX_GROUPS = built.groups;
export const CODEX_IDS = CODEX_GROUPS.flatMap((group) => group.ids);

/** Пошук: назва важить більше за синоніми, синоніми — більше за короткий опис. */
export function searchCodex(query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const id of CODEX_IDS) {
    const article = CODEX[id];
    let score = 0;
    if (article.title.toLowerCase().includes(q)) score += 3;
    if ((article.aliases ?? []).some((alias) => alias.toLowerCase().includes(q))) score += 2;
    if (article.summary.toLowerCase().includes(q)) score += 1;
    if (score) scored.push({ id, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((item) => item.id);
}
