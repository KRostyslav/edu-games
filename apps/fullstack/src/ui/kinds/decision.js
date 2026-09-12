/**
 * Архітектурне рішення: сценарій, показники й варіанти. Кожен варіант —
 * набір ефектів sim-core з обов'язковим `reason`: гравець бачить не лише
 * «правильно/ні», а що саме зміниться в затримці, вартості чи складності і чому.
 */

import { makeEffect, applyEffects } from "@edu/sim-core";
import { el, button, notice, paragraphs } from "../widgets.js";

export function mountDecision(host, { payload, onMistake, onSolved }) {
  const root = el("div", "kind decision");
  root.append(...paragraphs(payload.scenario));

  const base = { stats: Object.fromEntries(payload.stats.map((stat) => [stat.id, stat.value])) };
  const limits = Object.fromEntries(payload.stats.map((stat) => [`stats.${stat.id}`, [0, 100]]));
  const statsBox = el("div", "decision__stats");
  const options = el("div", "decision__options");
  const feedback = el("div", "kind__feedback");
  root.append(statsBox, el("h4", "seq__title", "Варіанти"), options, feedback);

  let solved = false;
  const blocked = new Map();

  function drawStats(values, deltas = {}) {
    statsBox.replaceChildren(
      ...payload.stats.map((stat) => {
        const value = values[stat.id];
        const row = el("div", "decision__stat");
        const head = el("div", "meter__head");
        const delta = deltas[stat.id];
        const deltaText = delta ? ` ${delta > 0 ? "▲" : "▼"} ${Math.abs(Math.round(delta))}` : "";
        head.append(el("span", "meter__label", stat.label + (stat.invert ? " (менше — краще)" : "")), el("span", "meter__value", `${Math.round(value)}${deltaText}`));
        const track = el("div", "meter__track");
        const fill = el("div", "meter__fill");
        fill.style.width = `${value}%`;
        const bad = stat.invert ? value > 66 : value < 34;
        const mid = stat.invert ? value > 40 : value < 60;
        fill.dataset.tone = bad ? "bad" : mid ? "warn" : "";
        track.append(fill);
        row.append(head, track);
        if (delta) row.dataset.dir = (delta > 0) !== Boolean(stat.invert) ? "up" : "down";
        return row;
      }),
    );
  }

  function drawOptions() {
    options.replaceChildren(
      ...payload.options.map((option, index) => {
        const node = button(option.text, { onClick: () => choose(option, index), disabled: solved || blocked.has(index) });
        node.classList.add("decision__option");
        if (blocked.has(index)) node.dataset.state = blocked.get(index);
        return node;
      }),
    );
  }

  function choose(option, index) {
    if (solved) return;
    const effects = option.effects.map((e) => makeEffect({ target: `stats.${e.target}`, delta: e.delta, reason: e.reason, source: "option" }));
    const { state, effects: applied } = applyEffects(base, effects, limits);
    const deltas = {};
    for (const effect of applied) deltas[effect.target.slice(6)] = (deltas[effect.target.slice(6)] ?? 0) + effect.actualDelta;
    drawStats(state.stats, deltas);
    const reasons = el("ul", "decision__reasons");
    for (const effect of applied) {
      const stat = payload.stats.find((item) => `stats.${item.id}` === effect.target);
      const sign = effect.actualDelta > 0 ? "+" : "";
      reasons.append(el("li", "", `${stat.label} ${sign}${Math.round(effect.actualDelta)}: ${effect.reason}`));
    }
    if (option.correct) {
      solved = true;
      blocked.set(index, "right");
      feedback.replaceChildren(notice(option.why, "good"), reasons);
      drawOptions();
      onSolved({ bonus: false });
    } else {
      blocked.set(index, "wrong");
      feedback.replaceChildren(notice(option.why, "bad"), reasons);
      drawOptions();
      onMistake(`«${option.text}» — ${option.why}`);
    }
  }

  drawStats(base.stats);
  drawOptions();
  host.append(root);

  return {
    unmount() {},
    assist() {
      if (solved) return null;
      const index = payload.options.findIndex((option, i) => !option.correct && !blocked.has(i));
      if (index < 0) return null;
      blocked.set(index, "duck");
      drawOptions();
      return `Качка відкинула варіант «${payload.options[index].text}».`;
    },
  };
}
