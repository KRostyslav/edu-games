/**
 * Аркуш героя: грейд і кар'єрна драбина, досвід, навички, інструменти, титули.
 * Усе обчислюється з прогресу — тут нічого не зберігається.
 */

import "./hero.css";
import { createPixelCanvas } from "@edu/pixel-ui";
import { currentStreak, dayNumber, MASTERED_BOX } from "@edu/study-kit";
import { GRADES, LADDER_AXES } from "../data/grades.js";
import { PLAYABLE_ACTS, ACTS_BY_ID } from "../data/acts.js";
import { CARD_IDS, bossOfAct, LEVELS } from "../data/content.js";
import { CODEX_IDS } from "../data/codex.js";
import { gradeIndex, badges } from "../game/career.js";
import { xpOf, heroLevel, XP_RULES } from "../game/xp.js";
import { skillsOfAct, skillProgress, skillSummary } from "../game/skills.js";
import { loadout } from "../game/loadout.js";
import { totalStars, maxStars } from "../game/unlock.js";
import { drawHero, HERO_ART } from "../render/heroArt.js";
import { el, button, chip, meter, section } from "./widgets.js";

const SKILL_ICON = { locked: "○", learning: "◐", learned: "●", mastered: "★" };
const SKILL_TEXT = { locked: "ще не почато", learning: "вивчається", learned: "вивчено", mastered: "освоєно назавжди" };

export function mountHero(host, ctx) {
  const state = ctx.store.state;
  const page = el("div", "page hero");
  const index = gradeIndex(state);
  const grade = GRADES[index];
  const xp = xpOf(state, { cardIds: CARD_IDS });
  const level = heroLevel(xp);

  const head = el("div", "page__head");
  const titles = el("div");
  titles.append(el("h1", "page__title", "Аркуш героя"), el("p", "page__lead", "Грейд росте лише з перемогами над босами. Досвід — дзеркало всього, що ви вивчили."));
  head.append(titles);
  page.append(head);

  // ── портрет і досвід ──
  const card = el("div", "panel hero__card");
  const portrait = el("div", "hero__portrait");
  const view = createPixelCanvas({ width: HERO_ART.width, height: HERO_ART.height, parent: portrait, maxScale: 4 });
  drawHero(view.ctx, { gradeIndex: index });
  const info = el("div", "hero__info");
  const bossesWon = Object.values(state.bosses).filter((entry) => entry.won).length;
  const mastered = Object.values(state.quiz.boxes).filter((entry) => entry.box >= MASTERED_BOX).length;
  const stats = el("div", "row");
  stats.append(
    chip(`★ ${totalStars(state)} / ${maxStars()}`),
    chip(`☠ Босів переможено: ${bossesWon}`),
    chip(`📖 Статей: ${Object.keys(state.codex.read).length} / ${CODEX_IDS.length}`),
    chip(`🗂 Карток освоєно: ${mastered}`),
    chip(`🔥 Серія стендапів: ${currentStreak(state.quiz, dayNumber())}`),
  );
  info.append(
    el("h2", "hero__grade", grade.title),
    meter({ label: `Рівень ${level.level}`, value: level.into, max: level.need, text: `${xp} XP · до рівня ${level.level + 1}: ${level.next - xp}` }),
    stats,
    el("p", "muted hero__xp-rules", `XP: ★ = ${XP_RULES.star}, бос = ${XP_RULES.boss}, освоєна картка = ${XP_RULES.masteredCard}, прочитана стаття = ${XP_RULES.article}.`),
  );
  card.append(portrait, info);
  page.append(card);

  // ── кар'єрна драбина ──
  const ladder = el("div", "panel");
  ladder.append(el("h3", "section__title", "Кар'єрна драбина"));
  const steps = el("ol", "hero__ladder");
  GRADES.forEach((item, i) => {
    const li = el("li", "hero__step");
    li.dataset.state = i < index ? "done" : i === index ? "current" : i === index + 1 ? "next" : "ahead";
    const act = item.act ? ACTS_BY_ID[item.act] : null;
    const boss = act ? bossOfAct(act.id) : null;
    const req = !act ? "Старт" : boss ? `Бос акту «${act.title}»: ${boss.title}` : `Акт «${act.title}» — скоро`;
    li.append(el("strong", "", item.title), el("span", "muted", req));
    steps.append(li);
  });
  ladder.append(steps);
  const compare = el("div", "hero__compare");
  const next = GRADES[index + 1];
  for (const [label, g] of [
    ["Зараз", grade],
    ["Далі", next],
  ]) {
    if (!g) continue;
    const col = el("div", "hero__axes");
    col.append(el("h4", "seq__title", `${label}: ${g.title}`));
    const dl = el("dl", "postmortem__ladder");
    for (const axis of LADDER_AXES) dl.append(el("dt", "", axis.label), el("dd", "", g.ladder[axis.id]));
    col.append(dl);
    compare.append(col);
  }
  ladder.append(compare);
  page.append(ladder);

  // ── титули ──
  const titlesBox = el("div", "panel");
  titlesBox.append(el("h3", "section__title", "Титули"));
  const earned = badges(state);
  if (earned.length) {
    const row = el("div", "row");
    for (const badge of earned) row.append(chip(`☠ ${badge.title}`, "good"));
    titlesBox.append(row);
  } else titlesBox.append(el("p", "muted", "Перший титул — за перемогу над першим босом."));
  page.append(titlesBox);

  // ── навички ──
  const skills = el("div", "panel");
  const summary = skillSummary(state);
  skills.append(el("h3", "section__title", `Дерево навичок · вивчено ${summary.learned} з ${summary.total}, освоєно ${summary.mastered}`));
  skills.append(
    el(
      "p",
      "muted",
      "Навичка вивчена, коли всі її рівні пройдено без підказок (★★). Освоєна — коли ще й усі картки її тем витримали повтор через тиждень: «знаю» від «пам'ятаю через місяць» відрізняє саме повторення.",
    ),
  );
  for (const act of PLAYABLE_ACTS) {
    const list = skillsOfAct(act.id);
    if (!list.length) continue;
    const group = section(`${act.no}. ${act.title}`);
    const grid = el("div", "hero__skills");
    for (const skill of list) {
      const p = skillProgress(state, skill);
      const node = el("div", "hero__skill");
      node.dataset.state = p.state;
      node.append(
        el("span", "hero__skill-icon", SKILL_ICON[p.state]),
        el("strong", "", skill.title),
        el("span", "hero__skill-sum", skill.summary),
        el("span", "muted hero__skill-meta", `${SKILL_TEXT[p.state]} · рівні ★★: ${p.levelsDone}/${p.levelsTotal} · картки: ${p.masteredCards}/${p.cardsTotal}`),
      );
      node.title = skill.levels.map((id) => LEVELS[id]?.title).filter(Boolean).join(" · ");
      grid.append(node);
    }
    group.append(grid);
    skills.append(group);
  }
  page.append(skills);

  // ── інструменти ──
  const kit = el("div", "panel");
  kit.append(el("h3", "section__title", "Інструменти для боїв із босами"));
  const toolGrid = el("div", "boss__toolkit");
  for (const tool of loadout(state)) {
    const item = el("div", "boss__kit-item");
    item.dataset.unlocked = String(tool.unlocked);
    item.append(el("strong", "", `${tool.icon} ${tool.title}`), el("span", "", tool.summary), el("span", "muted", tool.unlocked ? "✓ Є в наборі" : `🔒 ${tool.unlockText}`));
    if (tool.codexRef) item.append(button("Що це за інструмент →", { variant: "ghost", onClick: () => ctx.openCodex(tool.codexRef) }));
    toolGrid.append(item);
  }
  kit.append(toolGrid);
  page.append(kit);

  page.append(button("← На мапу", { onClick: () => ctx.go("map") }));
  host.append(page);
  return {
    unmount() {
      view.destroy();
    },
  };
}
