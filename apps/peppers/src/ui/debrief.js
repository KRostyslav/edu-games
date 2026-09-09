/**
 * Розбір місяця.
 *
 * Найважливіша навчальна панель гри: саме тут дія перетворюється на наслідок,
 * а наслідок — на пояснення. Усе будується з логу ефектів, тому текст фізично
 * не може розійтися з розрахунком.
 *
 * Колонки відповідають трьом різним питанням:
 *   що зробив я → що зробив балкон → що рослина зробила сама.
 * Розділення саме таке, бо новачок найчастіше приписує собі те, що зробила
 * погода, і навпаки.
 */

import { el, modal } from "@edu/pixel-ui";
import { topEffects } from "@edu/sim-core";
import { effectList } from "./widgets.js";
import { CULTIVARS, PLANT_IDS } from "../data/plants.data.js";
import { MONTH_NAMES } from "../data/calendar.js";
import { parseSource } from "../game/source.js";
import { fullNameOf, statNameOf, describeSource } from "./labels.js";
import { ACTIONS_BY_ID } from "../data/actions.data.js";

export function openDebrief({ turn, onClose, onAutopsy, onCodex }) {
  const box = modal({ title: `${MONTH_NAMES[turn.month]} — що сталося`, wide: true });

  // ── Загибель виводиться першою: це найважливіше, що могло статися ──
  if (turn.deaths.length) {
    const dead = el("section", "debrief__deaths");
    dead.append(el("h3", "debrief__deaths-title", "Втрати цього місяця"));
    for (const death of turn.deaths) {
      const item = el("div", "debrief__death");
      item.append(
        el("h4", "debrief__death-name", `${CULTIVARS[death.plantId].name} — ${death.cause}`),
        el("p", "debrief__death-reason", death.reason),
      );
      const button = el("button", "btn", "Відкрити розтин");
      button.type = "button";
      button.addEventListener("click", () => onAutopsy(death.plantId));
      item.append(button);
      dead.append(item);
    }
    box.body.append(dead);
  }

  // ── Події балкона ──
  if (turn.events.length) {
    const events = el("section", "debrief__events");
    for (const event of turn.events) {
      const item = el("div", "debrief__event");
      item.append(el("h4", "debrief__event-title", event.label), el("p", "debrief__event-text", event.description));
      events.append(item);
    }
    box.body.append(events);
  }

  const columns = el("div", "debrief__columns");

  // ── Колонка 1: дії гравця, згруповані за рослиною ──
  const mine = el("section", "debrief__column");
  mine.append(el("h3", "debrief__title", "Ваші дії"));
  const actionEffects = turn.effects.filter((e) => parseSource(e.source).kind === "action");

  if (actionEffects.length === 0) {
    mine.append(el("p", "debrief__empty", "Цього місяця ви нічого не робили."));
  } else {
    for (const group of groupByPlant(actionEffects)) {
      const wrap = el("div", "debrief__group");
      wrap.append(el("h4", "debrief__group-title", group.title));

      for (const byAction of groupByAction(group.effects)) {
        const actionBox = el("div", "debrief__action");
        const head = el("div", "debrief__action-head");
        head.append(el("h5", "debrief__action-name", byAction.label));
        if (byAction.codexRef && onCodex) {
          const link = el("button", "btn btn--ghost btn--small", "Довідник");
          link.type = "button";
          link.addEventListener("click", () => onCodex(byAction.codexRef));
          head.append(link);
        }
        actionBox.append(head, effectList({ effects: byAction.effects, nameOf: statNameOf }));
        wrap.append(actionBox);
      }
      mine.append(wrap);
    }
  }

  // ── Колонка 2: балкон і події ──
  const outside = el("section", "debrief__column");
  outside.append(el("h3", "debrief__title", "Балкон і погода"));
  const climateEffects = turn.effects.filter((e) => {
    const kind = parseSource(e.source).kind;
    return kind === "climate" || kind === "event";
  });
  outside.append(effectList({ effects: significant(climateEffects), nameOf: fullNameOf }));

  // ── Колонка 3: рослини живуть самі ──
  const natural = el("section", "debrief__column");
  natural.append(el("h3", "debrief__title", "Рослини живуть самі"));
  const naturalEffects = turn.effects.filter((e) => parseSource(e.source).kind === "natural");

  for (const id of PLANT_IDS) {
    const own = naturalEffects.filter((e) => parseSource(e.source).plantId === id);
    if (own.length === 0) continue;

    const details = el("details", "debrief__details");
    const summary = el("summary", "debrief__summary", CULTIVARS[id].name);
    details.append(summary);

    // Показуємо найзначніші зміни, решту ховаємо: інакше чотири рослини дають
    // півсотні рядків, у яких головне тоне.
    const top = topEffects(own, { limit: 4 });
    details.append(effectList({ effects: top, nameOf: statNameOf }));

    if (own.length > top.length) {
      const more = el("button", "btn btn--ghost btn--small", `Показати всі (${own.length})`);
      more.type = "button";
      more.addEventListener("click", () => {
        more.remove();
        details.append(effectList({ effects: own, nameOf: statNameOf }));
      });
      details.append(more);
    }
    natural.append(details);
  }

  columns.append(mine, outside, natural);
  box.body.append(columns);

  // ── Пропущене ──
  if (turn.missed.length) {
    const missed = el("section", "debrief__missed");
    missed.append(el("h3", "debrief__title", "Що ви пропустили"));
    missed.append(
      el(
        "p",
        "debrief__missed-note",
        "Половина догляду — це те, що треба було зробити й не зробили. Такі пропуски найважче помітити самому.",
      ),
    );

    for (const { action, plantId } of turn.missed) {
      const item = el("div", "debrief__missed-item");
      const title = plantId ? `${CULTIVARS[plantId].name} · ${action.label}` : action.label;
      item.append(el("h4", "debrief__missed-title", title));
      item.append(el("p", "debrief__missed-text", action.missed ?? action.risk));
      missed.append(item);
    }
    box.body.append(missed);
  }

  const next = el("button", "btn btn--primary", "Далі →");
  next.type = "button";
  next.addEventListener("click", () => {
    box.hide();
    onClose?.();
  });
  box.foot.append(next);

  box.show();
  return box;
}

/** Прибирає дрібницю, яка лише зашумлює розбір. */
function significant(effects) {
  return effects.filter((e) => Math.abs(e.actualDelta ?? e.delta) >= 1);
}

function groupByPlant(effects) {
  const groups = new Map();
  for (const effect of effects) {
    const { plantId } = parseSource(effect.source);
    const key = plantId ?? "__balcony";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(effect);
  }

  const out = [];
  if (groups.has("__balcony")) {
    out.push({ title: "Балкон", effects: groups.get("__balcony") });
  }
  for (const id of PLANT_IDS) {
    if (groups.has(id)) out.push({ title: CULTIVARS[id].name, effects: groups.get(id) });
  }
  return out;
}

function groupByAction(effects) {
  const groups = new Map();
  for (const effect of effects) {
    const { id } = parseSource(effect.source);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(effect);
  }

  return [...groups.entries()].map(([id, list]) => ({
    id,
    label: describeSource(`action:${id}`).label,
    codexRef: ACTIONS_BY_ID[id]?.codexRef ?? null,
    effects: list,
  }));
}
