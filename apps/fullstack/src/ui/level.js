/**
 * Екран рівня: бриф, підказки, міні-гра й дебриф.
 *
 * Зірки: ★ пройдено · ★★ без підказок · ★★★ бонус-ціль. Лише ростуть.
 * Дебриф — головна навчальна частина: урок, як це питають на співбесіді й
 * місток до того, що гравець уже знає з фронтенду.
 */

import "./level.css";
import { modal } from "@edu/pixel-ui";
import { ACTS_BY_ID } from "../data/acts.js";
import { LEVELS, levelsOfAct } from "../data/content.js";
import { CODEX } from "../data/codex.js";
import { isLevelOpen, afterLevel, isBossOpen, isActOpen } from "../game/unlock.js";
import { starsFor, bonusText, bonusType, bonusMet } from "../game/stars.js";
import { loadout } from "../game/loadout.js";
import { mountKind } from "./kinds/index.js";
import { el, button, starsEl, chip, kindChip, paragraphs, section, codexLink, notice } from "./widgets.js";

function snapshot(progress, level) {
  const act = level.act;
  return {
    tools: new Set(loadout(progress).filter((tool) => tool.unlocked).map((tool) => tool.id)),
    boss: ACTS_BY_ID[act].boss ? isBossOpen(progress, ACTS_BY_ID[act].boss) : false,
  };
}

export function mountLevel(host, ctx, params) {
  const { store } = ctx;
  const level = LEVELS[params.id];
  const page = el("div", "page level");
  host.append(page);

  if (!level || !isLevelOpen(store.state, level.id)) {
    page.append(
      el("h1", "page__title", level ? "Рівень ще закритий" : "Такого рівня немає"),
      el("p", "page__lead", level ? "Пройдіть попередні рівні акту, щоб відкрити цей." : "Можливо, посилання застаріло."),
      button("← На мапу", { onClick: () => ctx.go("map") }),
    );
    return { unmount() {} };
  }

  const act = ACTS_BY_ID[level.act];
  const index = levelsOfAct(level.act).findIndex((item) => item.id === level.id) + 1;
  const best = store.state.levels[level.id]?.stars ?? 0;

  const head = el("div", "page__head level__head");
  const titles = el("div");
  const crumbs = el("div", "level__crumbs");
  crumbs.append(button("← Мапа", { variant: "ghost", onClick: () => ctx.go("map") }), el("span", "", `Акт ${act.no}. ${act.title} · рівень ${index}`));
  const titleRow = el("div", "row");
  titleRow.append(el("h1", "page__title", level.title), kindChip(level.kind), starsEl(best));
  titles.append(crumbs, titleRow, el("p", "page__lead", level.teaser));
  head.append(titles);
  page.append(head);

  const layout = el("div", "level__layout");
  const main = el("div", "level__main");
  const aside = el("aside", "level__aside");
  layout.append(main, aside);
  page.append(layout);

  const brief = el("div", "panel level__brief");
  brief.append(...paragraphs(level.brief));
  main.append(brief);

  const stage = el("div", "panel level__stage");
  main.append(stage);

  // ── бічна панель: зірки, підказки, довідник ──
  let hintsUsed = 0;
  let mistakes = 0;
  let solved = false;

  const goals = section("Зірки");
  const goalList = el("ul", "level__goals");
  goalList.append(el("li", "", "★ Пройти рівень"), el("li", "", "★ Без жодної підказки"), el("li", "", `★ ${bonusText(level)}`));
  goals.append(goalList);
  const mistakesLabel = el("p", "muted level__mistakes");
  if (bonusType(level) === "firstTry") goals.append(mistakesLabel);
  aside.append(goals);

  const hintsBox = section("Підказки");
  const hintList = el("ol", "level__hints");
  const hintButton = button("Показати підказку", { onClick: showHint });
  hintsBox.append(el("p", "muted", "Кожна підказка забирає зірку «без підказок». Спершу подумайте ще хвилину."), hintList, hintButton);
  aside.append(hintsBox);

  const refs = section("Довідник");
  for (const ref of level.codexRefs) refs.append(codexLink(ctx, ref, CODEX[ref]?.title));
  aside.append(refs);

  function updateAside() {
    mistakesLabel.textContent = mistakes ? `Помилок: ${mistakes} — бонусу «без помилок» уже не буде` : "Помилок поки немає";
    hintButton.textContent = hintsUsed < 3 ? `Показати підказку (${hintsUsed + 1}/3)` : "Підказок більше немає";
    hintButton.disabled = hintsUsed >= 3 || solved;
  }

  function showHint() {
    if (hintsUsed >= 3) return;
    hintList.append(el("li", "", level.hints[hintsUsed]));
    hintsUsed += 1;
    updateAside();
  }

  // ── міні-гра ──
  const before = snapshot(store.state, level);
  const instance = mountKind(level.kind, stage, {
    payload: level.payload,
    seed: level.id,
    ctx,
    context: "level",
    onMistake() {
      mistakes += 1;
      updateAside();
    },
    onSolved(result) {
      if (solved) return;
      solved = true;
      updateAside();
      const stars = starsFor(level, { mistakes, bonus: result.bonus }, hintsUsed);
      store.update(
        (state) => {
          const entry = state.levels[level.id] ?? { stars: 0, hintsUsed: 3, solvedAt: null };
          if (stars > entry.stars) {
            entry.stars = stars;
            entry.hintsUsed = hintsUsed;
          }
          entry.solvedAt ??= Date.now();
          state.levels[level.id] = entry;
        },
        { immediate: true },
      );
      openDebrief(stars, result);
    },
  });

  function openDebrief(stars, result) {
    const after = snapshot(store.state, level);
    const dialog = modal({ title: "Рівень пройдено", wide: true });
    const top = el("div", "debrief__top");
    top.append(starsEl(stars));
    const breakdown = el("ul", "debrief__breakdown");
    breakdown.append(
      el("li", "", "✓ Пройдено"),
      el("li", "", `${hintsUsed === 0 ? "✓" : "✗"} Без підказок${hintsUsed ? ` (використано ${hintsUsed})` : ""}`),
      el("li", "", `${bonusMet(level, { mistakes, bonus: result.bonus }) ? "✓" : "✗"} ${bonusText(level)}`),
    );
    top.append(breakdown);
    dialog.body.append(top);

    const unlocked = [...after.tools].filter((id) => !before.tools.has(id));
    for (const tool of loadout(store.state).filter((item) => unlocked.includes(item.id))) {
      dialog.body.append(notice(`Новий інструмент для боїв з босами: ${tool.icon} ${tool.title}. ${tool.summary}`, "good"));
    }
    if (after.boss && !before.boss) dialog.body.append(notice(`Відкрито бос акту «${act.title}». Коли будете готові — він чекає на мапі.`, "warn"));

    const lesson = section("Урок");
    lesson.append(...paragraphs(level.debrief.lesson));
    const interview = section("На співбесіді");
    interview.append(...paragraphs(level.debrief.interview));
    const bridge = section("Місток із фронтенду");
    bridge.classList.add("debrief__bridge");
    bridge.append(...paragraphs(level.debrief.frontendBridge));
    const more = section("Почитати");
    for (const ref of level.codexRefs) more.append(codexLink(ctx, ref, CODEX[ref]?.title));
    dialog.body.append(lesson, interview, bridge, more);

    const next = afterLevel(store.state, level.id);
    if (next?.type === "boss") {
      dialog.foot.append(button("До боса →", { variant: "danger", onClick: () => (dialog.hide(), ctx.go("boss", { id: next.id })) }));
    } else if (next?.type === "level" && next.id !== level.id) {
      const nextLevel = LEVELS[next.id];
      const sameAct = nextLevel.act === level.act || isActOpen(store.state, nextLevel.act);
      if (sameAct) dialog.foot.append(button(`Далі: ${nextLevel.title} →`, { variant: "primary", onClick: () => (dialog.hide(), ctx.go("level", { id: next.id })) }));
    }
    dialog.foot.append(
      button("Переграти", { onClick: () => (dialog.hide(), ctx.go("level", { id: level.id })) }),
      button("На мапу", { onClick: () => (dialog.hide(), ctx.go("map")) }),
    );
    dialog.show();
  }

  if (best > 0) aside.prepend(chip(`Найкращий результат: ${"★".repeat(best)}`, "good"));
  updateAside();

  return {
    unmount() {
      instance.unmount?.();
    },
  };
}
