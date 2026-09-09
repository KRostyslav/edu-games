/**
 * Розбір місяця — головний навчальний екран.
 *
 * Показує чотири речі й саме в такому порядку:
 *   що ви зробили і що це дало,
 *   що зробив ринок без вашої участі,
 *   що сталося поза вашим контролем,
 *   що ви пропустили.
 *
 * Усі рядки будуються з логу ефектів, тому пояснення не може розійтися
 * з розрахунком: змінюючи число, ви змінюєте його разом із причиною.
 */

import { el, modal } from "@edu/pixel-ui";
import { effectList } from "./widgets.js";
import { statNameOf, formatDelta, formatValue, ABSOLUTE } from "./labels.js";
import { openCodex } from "./codex.js";
import { ACTIONS_BY_ID } from "../data/actions.data.js";
import { redactEffects, LEVELS } from "../game/analytics.js";
import { MONTH_NAMES } from "./monthPanel.js";

const PHASE_TITLES = {
  market: "Активи дозріли й згасли",
  traffic: "Скільки людей до вас дійшло",
  funnel: "Скільки з них спробувало й заплатило",
  retention: "Скільки пішло",
  finance: "Гроші",
  founder: "Ви самі",
  metrics: "Що показують метрики",
};

export function openDebrief({ turn, onClose }) {
  const { monthIndex, before, after, effects, event, missed, meta } = turn;
  const level = after.analytics.level;
  const visible = redactEffects(effects, level);

  const dialog = modal({
    title: `${MONTH_NAMES[before.month - 1]}, рік ${before.year}: що сталося`,
    wide: true,
  });

  // ── Подія місяця йде першою: вона могла перекреслити все інше ──
  if (event) {
    const box = el("section", "debrief__event");
    box.append(el("h3", "debrief__heading", event.label));
    box.append(el("p", "debrief__event-text", event.description));
    const eventEffects = visible.filter((effect) => String(effect.source) === `event:${event.id}`);
    if (eventEffects.length) box.append(effectList({ effects: eventEffects, nameOf: statNameOf, formatOf: formatDelta, valueOf: formatValue, absolute: ABSOLUTE }));
    if (event.codexRef) box.append(codexLink(event.codexRef));
    dialog.body.append(box);
  }

  const grid = el("div", "debrief");

  // ── Колонка 1: ваші дії ──
  const done = el("section", "debrief__col");
  done.append(el("h3", "debrief__heading", "Ваші дії"));

  const byAction = new Map();
  for (const effect of visible) {
    const source = String(effect.source);
    if (!source.startsWith("action:")) continue;
    const id = source.slice("action:".length);
    if (!byAction.has(id)) byAction.set(id, []);
    byAction.get(id).push(effect);
  }

  if (byAction.size === 0) {
    done.append(
      el("p", "debrief__empty", "Цього місяця ви не робили нічого. Іноді це правильно — але рідко."),
    );
  }
  for (const [id, list] of byAction) {
    const action = ACTIONS_BY_ID[id];
    if (!action) continue;
    const block = el("div", "debrief__block");
    block.append(el("h4", "debrief__block-title", action.label));
    block.append(
      effectList({ effects: list, nameOf: statNameOf, formatOf: formatDelta, valueOf: formatValue, absolute: ABSOLUTE }),
    );
    if (action.codexRef) block.append(codexLink(action.codexRef));
    done.append(block);
  }

  // ── Колонка 2: ринок і воронка ──
  const world = el("section", "debrief__col");
  world.append(el("h3", "debrief__heading", "Що сталося без вас"));

  for (const phase of ["market", "traffic", "funnel", "retention", "finance", "founder"]) {
    const list = visible.filter((effect) => effect.source === phase);
    // Потік, який не змінився з минулого місяця, усе одно треба показати:
    // «з пошуку прийшло 39» — це подія місяця, навіть якщо торік було стільки ж.
    const meaningful = list.filter(
      (effect) =>
        effect.hidden ||
        Math.abs(effect.actualDelta ?? effect.delta) >= 0.5 ||
        (ABSOLUTE.has(effect.target) && (effect.after ?? 0) > 0),
    );
    if (meaningful.length === 0) continue;

    const details = el("details", "debrief__block");
    if (phase === "traffic" || phase === "funnel" || phase === "retention") details.open = true;
    details.append(el("summary", "debrief__block-title", PHASE_TITLES[phase]));
    details.append(
      effectList({
        effects: meaningful,
        nameOf: statNameOf,
        formatOf: formatDelta,
        valueOf: formatValue,
        absolute: ABSOLUTE,
      }),
    );
    world.append(details);
  }

  grid.append(done, world);
  dialog.body.append(grid);

  // ── Ключові числа місяця ──
  dialog.body.append(buildSummary(after, meta, level));

  // ── Пропущене — на всю ширину, бо це найважче помітити самому ──
  if (missed.length) {
    const warn = el("section", "debrief__missed");
    warn.append(el("h3", "debrief__heading", "Що ви пропустили"));
    for (const action of missed) {
      const item = el("div", "debrief__miss");
      item.append(el("h4", "debrief__block-title", action.label));
      item.append(el("p", "debrief__miss-text", action.missed ?? action.risk));
      if (action.codexRef) item.append(codexLink(action.codexRef));
      warn.append(item);
    }
    dialog.body.append(warn);
  }

  const next = el("button", "btn btn--primary", "Далі");
  next.type = "button";
  next.addEventListener("click", () => {
    dialog.hide();
    onClose?.();
  });
  dialog.foot.append(next);

  dialog.show();
  next.focus();
}

/**
 * Підсумок місяця чотирма числами.
 *
 * Нульовий рівень аналітики показує лише два з них — і саме ця нестача
 * і є уроком: «клієнтів стало 43» не каже, скільки прийшло і скільки пішло.
 */
function buildSummary(state, meta, level) {
  const box = el("section", "debrief__summary");
  box.append(el("h3", "debrief__heading", "Підсумок місяця"));

  const row = el("div", "summary");
  row.append(cell("Клієнтів", String(state.biz.customers), true));
  row.append(cell("MRR", `$${Math.round(state.biz.mrr).toLocaleString("uk-UA")}`, true));
  row.append(
    cell("Прийшло", String(state.funnel.newCustomers), level >= 1, LEVELS[1].name),
  );
  row.append(
    cell("Пішло", String(state.funnel.churnedCustomers), level >= 1, LEVELS[1].name),
  );
  row.append(
    cell(
      "Стеля MRR",
      `$${Math.round(state.metrics.mrrCeiling).toLocaleString("uk-UA")}`,
      level >= 2,
      LEVELS[2].name,
    ),
  );
  box.append(row);

  if (level === 0) {
    box.append(
      el(
        "p",
        "debrief__note",
        "Ви бачите, що клієнтів стало більше або менше, але не бачите, з чого це склалося. «Прийшло 12, пішло 9» і «прийшло 4, пішов 1» дають однакову зміну й вимагають протилежних дій.",
      ),
    );
  } else if (level >= 2 && state.metrics.mrrCeiling > 0) {
    box.append(
      el(
        "p",
        "debrief__note",
        `За теперішнього залучення й теперішнього відтоку ви сходитеся до $${Math.round(
          state.metrics.mrrCeiling,
        ).toLocaleString("uk-UA")}. Підняти цю межу можна рівно двома способами: більше нового MRR або менше відтоку.`,
      ),
    );
  }

  return box;
}

function cell(label, value, known, needs) {
  const node = el("div", "summary__cell");
  node.dataset.known = String(known);
  node.append(el("span", "summary__label", label));
  node.append(el("span", "summary__value", known ? value : "?"));
  if (!known) node.append(el("span", "summary__hint", `потрібен рівень «${needs}»`));
  return node;
}

function codexLink(ref) {
  const link = el("button", "btn btn--ghost", "Як це працює →");
  link.type = "button";
  link.addEventListener("click", () => openCodex(ref));
  return link;
}
