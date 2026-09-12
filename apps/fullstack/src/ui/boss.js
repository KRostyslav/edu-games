/**
 * Бій із босом — продакшн-інцидент у кілька фаз.
 *
 * Уся логіка бою — чиста машина станів у game/boss.js; тут лише показ і
 * збереження. Спроба пишеться в прогрес після кожної дії, тож закрита вкладка
 * посеред інциденту не губить ні фазу, ні витрачений бюджет.
 */

import "./boss.css";
import { createPixelCanvas } from "@edu/pixel-ui";
import { BOSSES } from "../data/content.js";
import { ACTS_BY_ID } from "../data/acts.js";
import { TOOLS } from "../data/tools.js";
import { isBossOpen } from "../game/unlock.js";
import { startAttempt, bossReduce, bossHp, canTakeHint, canUseTool } from "../game/boss.js";
import { loadout } from "../game/loadout.js";
import { gradeIndex } from "../game/career.js";
import { GRADES } from "../data/grades.js";
import { drawBoss, BOSS_ART } from "../render/bossArt.js";
import { mountKind } from "./kinds/index.js";
import { renderPostmortem } from "./postmortem.js";
import { el, button, paragraphs, notice, chip, codeBlock, kindChip } from "./widgets.js";

const hearts = (budget, max) => "❤".repeat(Math.max(0, budget)) + "♡".repeat(Math.max(0, max - budget));

export function mountBoss(host, ctx, params) {
  const { store } = ctx;
  const boss = BOSSES[params.id];
  const page = el("div", "page boss");
  host.append(page);

  if (!boss) {
    page.append(el("h1", "page__title", "Такого боса немає"), button("← На мапу", { onClick: () => ctx.go("map") }));
    return { unmount() {} };
  }
  const act = ACTS_BY_ID[boss.act];
  const record = () => store.state.bosses[boss.id] ?? { won: false, attempts: 0, bestBudget: 0, wonAt: null };
  if (!isBossOpen(store.state, boss.id) && !record().won) {
    page.append(
      el("h1", "page__title", boss.title),
      el("p", "page__lead", "Бос відкриється, коли всі рівні акту матимуть хоча б одну зірку."),
      button("← На мапу", { onClick: () => ctx.go("map") }),
    );
    return { unmount() {} };
  }

  let view = null;
  let instance = null;
  let timer = null;
  let tick = 0;
  let attempt = store.state.activeBoss?.bossId === boss.id ? store.state.activeBoss : null;
  const tools = loadout(store.state);

  function cleanup() {
    instance?.unmount?.();
    instance = null;
    view?.destroy();
    view = null;
    if (timer) clearInterval(timer);
    timer = null;
  }

  function art(parent, { damage = 0, defeated = false } = {}) {
    view = createPixelCanvas({ width: BOSS_ART.width, height: BOSS_ART.height, parent, maxScale: 3 });
    const paint = () => drawBoss(view.ctx, { sprite: boss.sprite, damage, tick, defeated });
    paint();
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      timer = setInterval(() => {
        tick += 1;
        paint();
      }, 450);
    }
    return paint;
  }

  function persist() {
    store.update((state) => (state.activeBoss = attempt), { immediate: true });
  }

  // ─────────────────────────── вступ ───────────────────────────

  function renderIntro() {
    cleanup();
    page.replaceChildren();
    const crumbs = el("div", "level__crumbs");
    crumbs.append(button("← Мапа", { variant: "ghost", onClick: () => ctx.go("map") }), el("span", "", `Акт ${act.no}. ${act.title} · бос`));
    page.append(crumbs);

    const hero = el("div", "panel boss__intro");
    const artBox = el("div", "boss__art");
    art(artBox, { defeated: record().won });
    const info = el("div", "boss__info");
    info.append(el("h1", "boss__title", `☠ ${boss.title}`), el("p", "boss__subtitle", boss.subtitle), el("div", "incident__alert", `🚨 ${boss.alert}`));
    hero.append(artBox, info);
    page.append(hero);

    const story = el("div", "panel");
    story.append(...paragraphs(boss.intro));
    page.append(story);

    const rules = el("div", "panel boss__rules");
    rules.append(el("h3", "section__title", "Правила інциденту"));
    const list = el("ul", "");
    list.append(
      el("li", "", `${boss.phases.length} фази — кожна окремий тип задачі. Здоров'я боса — фази, які ще не закрито.`),
      el("li", "", `Бюджет помилок: ${boss.budget} ${hearts(boss.budget, boss.budget)}. Хибна гіпотеза чи хибний клік — мінус одиниця. Підказка теж коштує одиницю.`),
      el("li", "", "Бюджет на нулі — інцидент ескалює, спробу програно. Прогрес рівнів це не зачіпає: можна одразу спробувати ще."),
      el("li", "", "Інструменти — одноразові за спробу. Запуск тестів у коді й SQL-запити помилками не вважаються."),
      el("li", "", "Після будь-якого фіналу — blameless-постмортем."),
    );
    rules.append(list);
    page.append(rules);

    const kit = el("div", "panel");
    kit.append(el("h3", "section__title", "Ваші інструменти"));
    const toolList = el("div", "boss__toolkit");
    for (const tool of tools) {
      const item = el("div", "boss__kit-item");
      item.dataset.unlocked = String(tool.unlocked);
      item.append(el("strong", "", `${tool.icon} ${tool.title}`), el("span", "muted", tool.unlocked ? tool.summary : `🔒 ${tool.unlockText}`));
      toolList.append(item);
    }
    kit.append(toolList);
    page.append(kit);

    const actions = el("div", "row boss__start");
    const rec = record();
    if (attempt) {
      actions.append(
        button(`Продовжити інцидент (фаза ${attempt.phase + 1}, ${hearts(attempt.budget, attempt.maxBudget)})`, { variant: "danger", onClick: renderBattle }),
        button("Почати спочатку", { onClick: () => start() }),
      );
    } else {
      actions.append(button(rec.won ? "Переграти інцидент" : "Прийняти інцидент", { variant: "danger", onClick: () => start() }));
    }
    if (store.state.activeBoss && store.state.activeBoss.bossId !== boss.id) {
      actions.append(el("span", "muted", "Незавершений інцидент іншого боса буде скасовано."));
    }
    if (rec.attempts) actions.append(chip(`Спроб: ${rec.attempts}${rec.won ? ` · найкращий залишок бюджету: ${rec.bestBudget}` : ""}`, rec.won ? "good" : ""));
    page.append(actions);
  }

  function start() {
    attempt = startAttempt(boss);
    store.update(
      (state) => {
        const entry = state.bosses[boss.id] ?? { won: false, attempts: 0, bestBudget: 0, wonAt: null };
        entry.attempts += 1;
        state.bosses[boss.id] = entry;
        state.activeBoss = attempt;
      },
      { immediate: true },
    );
    renderBattle();
  }

  // ─────────────────────────── бій ───────────────────────────

  let hud = null;

  function renderBattle() {
    cleanup();
    page.replaceChildren();
    const top = el("div", "panel boss__hud");
    const artBox = el("div", "boss__art boss__art--small");
    const paint = art(artBox, { damage: attempt.phase / boss.phases.length });
    const status = el("div", "boss__status");
    const name = el("h2", "boss__title", `☠ ${boss.title}`);
    const hp = el("div", "boss__hp");
    const budget = el("div", "boss__budget");
    const toolsBar = el("div", "boss__tools");
    status.append(name, hp, budget, toolsBar);
    top.append(artBox, status);
    page.append(top);

    const phaseBox = el("div", "panel boss__phase");
    const reveals = el("div", "boss__reveals");
    const stage = el("div", "boss__stage");
    page.append(phaseBox);

    hud = { top, hp, budget, toolsBar, phaseBox, reveals, stage, paint };
    mountPhase();
  }

  function drawHud() {
    const phase = boss.phases[attempt.phase];
    hud.hp.replaceChildren(el("span", "boss__label", "Здоров'я боса"));
    const bar = el("div", "boss__hp-bar");
    boss.phases.forEach((item, index) => {
      const seg = el("span", "boss__hp-seg");
      seg.dataset.state = index < attempt.phase ? "cleared" : index === attempt.phase ? "current" : "left";
      seg.title = item.title;
      bar.append(seg);
    });
    hud.hp.append(bar, el("span", "muted", `${bossHp(attempt, boss)} з ${boss.phases.length}`));

    hud.budget.replaceChildren(el("span", "boss__label", "Бюджет помилок"), el("span", "boss__hearts", hearts(attempt.budget, Math.max(attempt.maxBudget, attempt.budget))));

    hud.toolsBar.replaceChildren(el("span", "boss__label", "Інструменти"));
    for (const tool of tools) {
      const usable = tool.unlocked && canUseTool(attempt, boss, tool);
      const node = button(`${tool.icon} ${tool.title}`, { onClick: () => useTool(tool), disabled: !usable });
      node.classList.add("boss__tool");
      node.title = !tool.unlocked ? `Закрито: ${tool.unlockText}` : attempt.usedTools.includes(tool.id) ? "Уже використано в цій спробі" : usable ? tool.summary : "У цій фазі не допоможе";
      if (attempt.usedTools.includes(tool.id)) node.dataset.used = "true";
      hud.toolsBar.append(node);
    }
    const hint = button(`💡 Підказка (−1 ❤)`, { onClick: takeHint, disabled: !canTakeHint(attempt, boss) });
    hint.title = phase?.hints?.length ? "Досвідчений колега підкаже напрямок — коштує одиницю бюджету" : "Для цієї фази підказок немає";
    hud.toolsBar.append(hint);
    hud.paint();
  }

  function mountPhase() {
    instance?.unmount?.();
    const phase = boss.phases[attempt.phase];
    hud.phaseBox.replaceChildren();
    const head = el("div", "row boss__phase-head");
    head.append(el("h3", "boss__phase-title", `Фаза ${attempt.phase + 1} з ${boss.phases.length}: ${phase.title}`), kindChip(phase.kind));
    hud.phaseBox.append(head, ...paragraphs(phase.story), hud.reveals, hud.stage);
    hud.reveals.replaceChildren();
    hud.stage.replaceChildren();

    // Відновлення після перезавантаження: уже взяті підказки й інструменти цієї фази.
    const taken = attempt.hints[phase.id] ?? 0;
    for (let i = 0; i < taken; i += 1) hud.reveals.append(notice(`💡 ${phase.hints[i]}`, "warn"));
    for (const entry of attempt.log.filter((item) => item.type === "tool" && item.phase === attempt.phase)) {
      const tool = TOOLS.find((item) => item.title === entry.text);
      if (tool?.effect === "reveal" && phase.tools?.[tool.id]) showReveal(tool, phase);
    }

    instance = mountKind(phase.kind, hud.stage, {
      payload: phase.payload,
      seed: `${boss.id}/${phase.id}`,
      ctx,
      context: "boss",
      onMistake: (text) => dispatch({ type: "mistake", text }),
      onSolved: () => dispatch({ type: "clear", text: phase.title }),
    });
    drawHud();
  }

  function showReveal(tool, phase) {
    const box = el("div", "boss__reveal");
    box.append(el("strong", "", `${tool.icon} ${tool.title}`), codeBlock(phase.tools[tool.id], { lang: "text" }));
    hud.reveals.append(box);
  }

  function dispatch(action) {
    const before = attempt;
    attempt = bossReduce(attempt, boss, action);
    if (attempt === before) return;
    persist();
    if (action.type === "mistake") {
      hud.top.classList.remove("boss__hud--hit");
      void hud.top.offsetWidth;
      hud.top.classList.add("boss__hud--hit");
    }
    if (attempt.status === "lost") return finish(false);
    if (attempt.status === "won") return finish(true);
    if (action.type === "clear") {
      hud.stage.replaceChildren(notice(`Фазу «${boss.phases[attempt.phase - 1].title}» закрито. Бос слабшає.`, "good"));
      drawHud();
      setTimeout(() => {
        if (hud && attempt.status === "active") mountPhase();
      }, 1400);
      return;
    }
    drawHud();
  }

  function takeHint() {
    const phase = boss.phases[attempt.phase];
    const taken = attempt.hints[phase.id] ?? 0;
    dispatch({ type: "hint" });
    if ((attempt.hints[phase.id] ?? 0) > taken) hud.reveals.append(notice(`💡 ${phase.hints[taken]}`, "warn"));
  }

  function useTool(tool) {
    const phase = boss.phases[attempt.phase];
    if (tool.effect === "assist") {
      const text = instance?.assist?.();
      if (!text) {
        hud.reveals.append(notice("Качка уважно вислухала, але тут вона не допоможе.", "info"));
        return;
      }
      dispatch({ type: "tool", tool });
      hud.reveals.append(notice(`🦆 ${text}`, "info"));
      return;
    }
    dispatch({ type: "tool", tool });
    if (tool.effect === "reveal") showReveal(tool, phase);
    if (tool.effect === "budget") hud.reveals.append(notice("☕ Кава: +1 до бюджету помилок. Продовжуємо.", "good"));
  }

  // ─────────────────────────── фінал ───────────────────────────

  function finish(won) {
    const gradeBefore = gradeIndex(store.state);
    const final = attempt;
    store.update(
      (state) => {
        const entry = state.bosses[boss.id] ?? { won: false, attempts: 1, bestBudget: 0, wonAt: null };
        if (won) {
          entry.won = true;
          entry.bestBudget = Math.max(entry.bestBudget, final.budget);
          entry.wonAt ??= Date.now();
        }
        state.bosses[boss.id] = entry;
        state.activeBoss = null;
      },
      { immediate: true },
    );
    attempt = null;
    const gradeAfter = gradeIndex(store.state);
    const promotion = gradeAfter > gradeBefore ? GRADES[gradeAfter] : null;
    cleanup();
    hud = null;
    page.replaceChildren();
    const artBox = el("div", "boss__art boss__art--final");
    art(artBox, { damage: won ? 1 : final.phase / boss.phases.length, defeated: won });
    page.append(artBox);
    renderPostmortem(page, {
      boss,
      attempt: final,
      won,
      promotion,
      ctx,
      onRetry: () => start(),
    });
    window.scrollTo(0, 0);
  }

  if (attempt && params.resume) renderBattle();
  else renderIntro();

  return {
    unmount() {
      cleanup();
      hud = null;
    },
  };
}
