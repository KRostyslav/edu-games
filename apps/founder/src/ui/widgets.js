/**
 * Локальні віджети.
 *
 * Дублюють два віджети з @edu/pixel-ui навмисно:
 *   statBar    — тут потрібні гроші з від'ємною шкалою, одиниці ($ , %, міс)
 *                і показники, у яких «більше» означає «гірше»;
 *   actionCard — у пакеті вартість підписана як «трудодні», а тут ресурс —
 *                години, і вони можуть залежати від стану.
 *
 * Правити спільний пакет заради цього означало б зачепити дві робочі гри.
 */

import { el } from "@edu/pixel-ui";

/** Українська множина для годин. */
export function hours(count) {
  const value = Math.round(count);
  const tens = value % 100;
  const ones = value % 10;
  if (tens >= 11 && tens <= 14) return `${value} годин`;
  if (ones === 1) return `${value} година`;
  if (ones >= 2 && ones <= 4) return `${value} години`;
  return `${value} годин`;
}

/**
 * Смужка показника.
 *
 * `unknown` — не помилка, а стан: показник існує, але аналітики бракує.
 * Порожнє місце нічого не вчить, а замок із поясненням учить дуже багато.
 */
export function statBar({ label, value = 0, min = 0, max = 100, unit = "", hint = "", inverted = false }) {
  const root = el("div", "stat");
  if (inverted) root.dataset.invert = "true";

  const head = el("div", "stat__head");
  const name = el("span", "stat__label", label);
  const num = el("span", "stat__value");
  head.append(name, num);

  const track = el("div", "stat__track");
  const fill = el("div", "stat__fill");
  const delta = el("span", "stat__delta");
  track.append(fill);
  root.append(head, track, delta);

  if (hint) root.title = hint;

  function update(next, change, { unknown = false, unknownHint = "" } = {}) {
    if (unknown) {
      root.dataset.unknown = "true";
      num.textContent = "?";
      fill.style.width = "0%";
      delta.textContent = unknownHint;
      delta.dataset.dir = "";
      return;
    }
    root.dataset.unknown = "false";

    const span = max - min || 1;
    const pct = Math.max(0, Math.min(100, ((next - min) / span) * 100));
    fill.style.width = `${pct}%`;
    num.textContent = `${formatNumber(next)}${unit}`;
    const level = inverted ? 100 - pct : pct;
    fill.dataset.level = level < 25 ? "low" : level < 60 ? "mid" : "high";

    if (change == null || Math.abs(change) < 0.5) {
      delta.textContent = "";
      delta.dataset.dir = "";
    } else {
      const up = change > 0;
      delta.textContent = `${up ? "▲" : "▼"} ${formatNumber(Math.abs(change))}`;
      delta.dataset.dir = (inverted ? !up : up) ? "up" : "down";
    }
  }

  update(value, null);
  return { root, update };
}

function formatNumber(value) {
  const rounded = Math.round(value);
  return Math.abs(rounded) >= 1000 ? rounded.toLocaleString("uk-UA") : String(rounded);
}

/**
 * Картка дії.
 *
 * Пояснення стоїть ПЕРЕД кнопкою: гравець мусить прочитати, навіщо це робиться
 * і що буде, якщо не робити, до того як витратить години.
 */
export function actionCard({ action, cost, disabled, disabledReason, important, onToggle, onCodex }) {
  const root = el("article", "card");
  root.dataset.actionId = action.id;
  root.dataset.category = action.category;
  if (important) root.dataset.important = "true";

  const head = el("header", "card__head");
  head.append(el("h3", "card__title", action.label));
  const price = el("span", "card__cost", hours(cost));
  price.title = "Витрата годин цього місяця";
  head.append(price);

  const details = el("div", "card__details");
  details.append(detail("Навіщо", action.why));
  details.append(detail("Коли", action.timing));
  details.append(detail("Якщо не зробити", action.risk));

  const foot = el("div", "card__foot");
  const pick = el("button", "btn btn--pick", "Обрати");
  pick.type = "button";
  pick.disabled = Boolean(disabled);
  if (disabled && disabledReason) {
    pick.title = disabledReason;
    pick.textContent = "Недоступно";
  }
  foot.append(pick);

  if (action.codexRef && onCodex) {
    const codex = el("button", "btn btn--ghost", "Довідник");
    codex.type = "button";
    codex.addEventListener("click", () => onCodex(action.codexRef));
    foot.append(codex);
  }

  root.append(head, details, foot);
  if (important && !disabled) root.append(el("p", "card__flag", "Цього місяця це важливо"));
  if (disabled && disabledReason) root.append(el("p", "card__blocked", disabledReason));

  let selected = false;
  pick.addEventListener("click", () => {
    selected = !selected;
    root.dataset.selected = String(selected);
    pick.textContent = selected ? "Скасувати" : "Обрати";
    onToggle?.(action, selected);
  });

  return {
    root,
    get selected() {
      return selected;
    },
    setSelected(next) {
      selected = next;
      root.dataset.selected = String(next);
      pick.textContent = next ? "Скасувати" : "Обрати";
    },
    setDisabled(next, reason) {
      pick.disabled = next;
      root.dataset.disabled = String(next);
      pick.title = next && reason ? reason : "";
      if (!selected) pick.textContent = next ? "Недоступно" : "Обрати";
    },
  };
}

function detail(label, text) {
  const row = el("div", "card__detail");
  row.append(el("span", "card__detail-label", label), el("span", "card__detail-text", text));
  return row;
}

/** Смуга вкладок. */
export function tabStrip({ tabs, active, onSelect }) {
  const root = el("div", "tabs");
  root.setAttribute("role", "tablist");
  const buttons = new Map();

  for (const tab of tabs) {
    const button = el("button", "tabs__tab", tab.label);
    button.type = "button";
    button.setAttribute("aria-selected", String(tab.id === active));
    if (tab.badge) button.append(el("span", "tabs__badge", tab.badge));
    button.addEventListener("click", () => {
      for (const [key, other] of buttons) other.setAttribute("aria-selected", String(key === tab.id));
      onSelect(tab.id);
    });
    buttons.set(tab.id, button);
    root.append(button);
  }

  return { root, select: (id) => buttons.get(id)?.click() };
}

/**
 * Список ефектів — основа кожного розбору.
 *
 * Кожен рядок несе назву показника, зміну в числах і причину. Прихований
 * ефект показується замком: число існує, ви його не бачите, і ось чому.
 */
export function effectList({ effects, nameOf, formatOf, valueOf, absolute, limit }) {
  const list = el("ul", "effects");
  const shown = limit ? effects.slice(0, limit) : effects;

  for (const effect of shown) {
    const item = el("li", "effects__item");
    item.dataset.tone = effect.hidden ? "hidden" : effect.tone;

    const head = el("div", "effects__head");
    head.append(el("span", "effects__name", nameOf(effect.target)));

    const delta = effect.actualDelta ?? effect.delta;
    if (effect.hidden) {
      head.append(el("span", "effects__delta", "?"));
    } else if (absolute?.has(effect.target) && valueOf) {
      // Потік показуємо результатом, а не зміною: «39 з пошуку», а не «+8».
      head.append(el("span", "effects__delta", valueOf(effect.target, effect.after ?? delta)));
    } else if (Math.abs(delta) >= 0.5 || effect.target.startsWith("flags.")) {
      head.append(el("span", "effects__delta", formatOf(effect.target, delta)));
    } else {
      head.append(el("span", "effects__delta", "без змін"));
    }

    item.append(head, el("p", "effects__reason", effect.reason));
    list.append(item);
  }
  return list;
}

/** Хронологія для розтину. */
export function timeline({ items }) {
  const root = el("ol", "timeline");
  for (const item of items) {
    const node = el("li", "timeline__item");
    node.dataset.tone = item.tone ?? "bad";
    if (item.pivot) node.dataset.pivot = "true";
    node.append(el("span", "timeline__when", item.when));
    node.append(el("p", "timeline__text", item.text));
    if (item.tag) node.append(el("span", "timeline__tag", item.tag));
    root.append(node);
  }
  return root;
}
