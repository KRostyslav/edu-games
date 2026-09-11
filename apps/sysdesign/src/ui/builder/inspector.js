/**
 * Інспектор: налаштування вибраного вузла чи зв'язку, а без вибору — вимоги рівня.
 *
 * Показуються лише налаштування, відкриті на цьому рівні: інакше в першій
 * главі гравець бачив би consistency level і circuit breaker, які йому ще
 * нічого не кажуть. Кожне налаштування має підказку й посилання в довідник —
 * рішення без розуміння наслідків нічого не вчить.
 *
 * Будь-який зв'язок можна додати звідси, без миші: список «Додати зв'язок →»
 * показує лише ті вузли, куди з'єднання дозволене.
 */

import { el } from "@edu/pixel-ui";
import { COMPONENTS, EDGE_KNOBS, knobOptions, knobLabel } from "../../data/components.js";
import { CLASS_LABELS, REGIONS } from "../../data/constants.js";
import { isUnlocked, LEVEL_ORDER } from "../../data/order.js";
import { findNode, canConnect, connect, removeEdge, removeNode } from "../../sim/graph.js";
import { iconImg } from "../../render/icons.js";
import { button, chip, fmtMoney, fmtPct, fmtRps, meter, paragraphs } from "../widgets.js";

export function createInspector({ level, graph, onChange, onCodex, onSelect, onToast, readOnly = false }) {
  const root = el("aside", "insp");
  root.setAttribute("aria-label", "Налаштування");
  const context = level.unlockContext ?? level.id;
  let selection = null;
  let forecast = null;
  let locked = readOnly;

  const visible = (knob, cfg) => isUnlocked(knob.unlock, context) && (knob.when ? knob.when(level, cfg) !== false : true);

  function show(next, fc = forecast) {
    selection = next;
    forecast = fc;
    const focusedKey = document.activeElement?.dataset?.key;
    render();
    if (focusedKey) root.querySelector(`[data-key="${focusedKey}"]`)?.focus();
  }

  function render() {
    root.replaceChildren();
    if (selection?.kind === "node") {
      const node = findNode(graph, selection.id);
      if (node) return renderNode(node);
    }
    if (selection?.kind === "edge") {
      const edge = graph.edges.find((item) => item.id === selection.id);
      if (edge) return renderEdge(edge);
    }
    return renderLevel();
  }

  // ─────────────────────────── вимоги рівня ───────────────────────────

  function renderLevel() {
    root.append(el("h3", "insp__title", "Вимоги"));
    const traffic = level.traffic;
    const list = el("dl", "insp__facts");
    const fact = (term, value) => list.append(el("dt", "", term), el("dd", "", value));
    fact("Трафік", fmtRps(traffic.rps));
    fact(
      "Склад",
      Object.entries(traffic.mix)
        .map(([cls, share]) => `${CLASS_LABELS[cls]} ${Math.round(share * 100)}%`)
        .join(" · "),
    );
    const geo = Object.entries(traffic.geo ?? {});
    if (geo.length > 1) fact("Користувачі", geo.map(([region, share]) => `${REGIONS[region]} ${Math.round(share * 100)}%`).join(" · "));
    if (level.data?.conns) fact("З'єднань онлайн", level.data.conns.toLocaleString("uk-UA"));
    for (const [cls, limit] of Object.entries(level.slo?.p99Ms ?? {})) fact(`p99 «${CLASS_LABELS[cls]}»`, `≤ ${limit} мс`);
    if (level.slo?.availability) fact("Доступність", `≥ ${fmtPct(level.slo.availability, level.slo.availability >= 0.999 ? 2 : 1)}`);
    if (level.slo?.maxLagSec) fact("Затримка обробки", `≤ ${Math.round(level.slo.maxLagSec / 60)} хв`);
    if (level.slo?.maxStalenessSec) fact("Свіжість даних", `≤ ${level.slo.maxStalenessSec} с`);
    if (level.slo?.maxOutageTicks) fact("RTO", `≤ ${level.slo.maxOutageTicks} хв`);
    if (level.budget) {
      const cost = forecast?.cost?.total;
      fact("Бюджет", `${fmtMoney(level.budget)}/міс${cost != null ? ` · зараз ${fmtMoney(cost)}` : ""}`);
    }
    root.append(list);

    if (forecast?.ok) {
      const t0 = forecast.ticks[0];
      const p99 = Object.keys(level.slo?.p99Ms ?? {})
        .map((cls) => `${CLASS_LABELS[cls]} ${Math.round(t0.p99[cls] ?? 0)} мс`)
        .join(", ");
      root.append(el("p", "insp__hint", `Прогноз у спокійну хвилину: доступність ${fmtPct(t0.availability, 2)}${p99 ? `, p99 ${p99}` : ""}. Інциденти покаже лише прогін.`));
    }
    if (!locked) {
      root.append(
        el(
          "p",
          "insp__hint",
          "Перетягніть компонент з палітри на дошку (або натисніть його й клітинку). Щоб з'єднати, потягніть за квадратик справа на вузлі чи натисніть C.",
        ),
      );
    }
  }

  // ─────────────────────────── вузол ───────────────────────────

  function renderNode(node) {
    const def = COMPONENTS[node.type];
    const head = el("div", "insp__head");
    head.append(iconImg(node.type, "insp__icon"), el("h3", "insp__title", node.label ?? def.label));
    root.append(head);
    root.append(...paragraphs(def.blurb, "insp__blurb"));
    if (def.codexRef) root.append(button("Довідник →", { variant: "ghost", onClick: () => onCodex?.(def.codexRef) }));

    const knobs = Object.entries(def.knobs).filter(([, knob]) => visible(knob, node.config));
    if (knobs.length) {
      const box = el("div", "insp__knobs");
      for (const [key, knob] of knobs) {
        box.append(
          knobControl(key, knob, node.config[key], (value) => {
            node.config[key] = value;
            onChange?.();
          }),
        );
      }
      root.append(box);
    } else if (!def.fixed) {
      root.append(el("p", "insp__hint", "На цьому рівні в компонента немає налаштувань."));
    }

    const snapshot = forecast?.ticks?.[0]?.nodes?.[node.id];
    const cost = forecast?.cost?.items?.find((item) => item.id === node.id)?.cost;
    if (snapshot && node.type !== "client") {
      const load = meter({ label: "Завантаження у спокійну хвилину", value: snapshot.rho, max: 1 });
      root.append(load.root);
      const facts = el("p", "insp__stat", `${fmtRps(snapshot.rps)}${cost != null ? ` · ${fmtMoney(cost)}/міс` : ""}`);
      root.append(facts);
    }

    if (def.connectsTo.length) root.append(connectionsBlock(node));

    const incoming = graph.edges.filter((edge) => edge.to === node.id);
    if (incoming.length) {
      root.append(el("h4", "insp__subtitle", "Звідки приходять запити"));
      const list = el("ul", "insp__links");
      for (const edge of incoming) {
        const from = findNode(graph, edge.from);
        const item = el("li", "insp__link");
        const go = button(`← ${from.label ?? COMPONENTS[from.type].label}`, { variant: "ghost", onClick: () => onSelect?.({ kind: "edge", id: edge.id }) });
        item.append(go);
        list.append(item);
      }
      root.append(list);
    }

    if (!node.locked && !locked) {
      root.append(
        button("Видалити вузол", {
          variant: "ghost",
          onClick: () => {
            removeNode(graph, node.id);
            onChange?.();
            onSelect?.(null);
          },
        }),
      );
    }
  }

  function connectionsBlock(node) {
    const box = el("div", "insp__conn");
    box.append(el("h4", "insp__subtitle", "Куди йдуть запити"));
    const outgoing = graph.edges.filter((edge) => edge.from === node.id);
    const list = el("ul", "insp__links");
    for (const edge of outgoing) {
      const to = findNode(graph, edge.to);
      const item = el("li", "insp__link");
      item.append(button(`→ ${to.label ?? COMPONENTS[to.type].label}`, { variant: "ghost", onClick: () => onSelect?.({ kind: "edge", id: edge.id }) }));
      if (!locked) {
        const remove = button("✕", {
          variant: "ghost",
          title: "Прибрати зв'язок",
          onClick: () => {
            removeEdge(graph, edge.id);
            onChange?.();
            show(selection);
          },
        });
        remove.setAttribute("aria-label", `Прибрати зв'язок до ${to.label ?? COMPONENTS[to.type].label}`);
        item.append(remove);
      }
      list.append(item);
    }
    if (!outgoing.length) list.append(el("li", "insp__hint", "Поки нікуди."));
    box.append(list);

    if (!locked) {
      const targets = graph.nodes.filter((other) => canConnect(graph, node.id, other.id).ok);
      if (targets.length) {
        const row = el("div", "insp__add");
        const select = el("select", "insp__select");
        select.setAttribute("aria-label", "Додати зв'язок");
        select.append(el("option", "", "Додати зв'язок →"));
        for (const target of targets) {
          const option = el("option", "", target.label ?? `${COMPONENTS[target.type].label} (${target.id})`);
          option.value = target.id;
          select.append(option);
        }
        select.addEventListener("change", () => {
          if (!select.value) return;
          const result = connect(graph, node.id, select.value);
          if (!result.ok) onToast?.(result.reason, "bad");
          onChange?.();
          show(selection);
        });
        row.append(select);
        box.append(row);
      }
    }
    return box;
  }

  // ─────────────────────────── зв'язок ───────────────────────────

  function renderEdge(edge) {
    const from = findNode(graph, edge.from);
    const to = findNode(graph, edge.to);
    root.append(el("h3", "insp__title", `${from.label ?? COMPONENTS[from.type].label} → ${to.label ?? COMPONENTS[to.type].label}`));
    root.append(el("p", "insp__blurb", "Зв'язок — це виклик: хто кого кличе. Таймаути, повтори й breaker — властивість того, хто викликає."));

    const knobs = Object.entries(EDGE_KNOBS).filter(
      ([, knob]) => visible(knob, edge.policy) && (!knob.onlyTo || knob.onlyTo.includes(to.type)),
    );
    if (knobs.length) {
      const box = el("div", "insp__knobs");
      for (const [key, knob] of knobs) {
        box.append(
          knobControl(`edge-${key}`, knob, edge.policy[key], (value) => {
            edge.policy[key] = value;
            onChange?.();
          }),
        );
      }
      root.append(box);
    } else {
      const unlockAt = LEVEL_ORDER.indexOf(EDGE_KNOBS.timeoutMs.unlock) + 1;
      root.append(el("p", "insp__hint", `Таймаути, повтори й circuit breaker відкриються на рівні ${unlockAt}.`));
    }

    const flow = forecast?.ticks?.[0]?.edges?.[edge.id];
    if (flow) root.append(el("p", "insp__stat", `У спокійну хвилину: ${fmtRps(flow.rps)}`));

    if (!locked) {
      root.append(
        button("Прибрати зв'язок", {
          variant: "ghost",
          onClick: () => {
            removeEdge(graph, edge.id);
            onChange?.();
            onSelect?.(null);
          },
        }),
      );
    }
  }

  // ─────────────────────────── контроли ───────────────────────────

  function knobControl(key, knob, value, onValue) {
    const wrap = el("div", "insp__knob");
    const id = `knob-${key}`;
    const labelRow = el("div", "insp__knob-head");
    const label = el("label", "insp__knob-label", knob.label);
    label.htmlFor = id;
    labelRow.append(label);
    if (knob.codexRef) {
      const help = el("button", "insp__help", "?");
      help.type = "button";
      help.title = "Довідник";
      help.setAttribute("aria-label", `Довідник: ${knob.label}`);
      help.addEventListener("click", () => onCodex?.(knob.codexRef));
      labelRow.append(help);
    }
    wrap.append(labelRow);

    let control;
    if (knob.type === "toggle") {
      control = el("input", "insp__toggle");
      control.type = "checkbox";
      control.checked = Boolean(value);
      control.addEventListener("change", () => onValue(control.checked));
      wrap.append(control);
    } else if (knob.type === "int") {
      const row = el("div", "insp__stepper");
      control = el("input", "insp__number");
      control.type = "number";
      control.min = String(knob.min);
      control.max = String(knob.max);
      control.value = String(value);
      const commit = (next) => {
        const clamped = Math.max(knob.min, Math.min(knob.max, Math.round(Number(next) || knob.min)));
        control.value = String(clamped);
        if (clamped !== value) onValue(clamped);
      };
      control.addEventListener("change", () => commit(control.value));
      const minus = button("−", { onClick: () => commit(value - 1), disabled: locked || value <= knob.min });
      const plus = button("+", { onClick: () => commit(value + 1), disabled: locked || value >= knob.max });
      minus.setAttribute("aria-label", `Менше: ${knob.label}`);
      plus.setAttribute("aria-label", `Більше: ${knob.label}`);
      row.append(minus, control, plus);
      wrap.append(row);
    } else {
      control = el("select", "insp__select");
      const options = knobOptions(knob, level);
      for (const option of options) {
        const item = el("option", "", knobLabel(knob, option, level));
        item.value = String(option);
        item.selected = option === value;
        control.append(item);
      }
      control.addEventListener("change", () => onValue(options.find((option) => String(option) === control.value)));
      wrap.append(control);
    }
    control.id = id;
    control.dataset.key = key;
    control.disabled = locked;
    if (knob.hint) wrap.append(el("p", "insp__knob-hint", knob.hint));
    return wrap;
  }

  render();

  return {
    root,
    show,
    setReadOnly(value) {
      locked = value;
      render();
    },
    setGraph(next) {
      graph = next;
      selection = null;
      render();
    },
  };
}

export { chip };
