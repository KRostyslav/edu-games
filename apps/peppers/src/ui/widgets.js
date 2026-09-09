/**
 * Віджети, яких немає в @edu/pixel-ui або які там не підходять.
 *
 * Два з них — свідомий дубль спільного пакета:
 *
 *   statBar    — у pixel-ui шкала завжди від нуля, тому −5 °C малюється
 *                порожньою смужкою. Тут потрібна від'ємна шкала й одиниці;
 *   actionCard — у pixel-ui вартість жорстко підписана «трудоднями», а в
 *                квартирі ресурс — години догляду.
 *
 * Правити спільний пакет заради цього не можна: виноградник — окрема робоча
 * гра, і зачепити її ціною двохсот рядків тут було б поганим обміном.
 *
 * Решта — tabStrip, compareTable, timeline — специфічні для гри з чотирма
 * рослинами на спільному балконі.
 */

import { el } from "@edu/pixel-ui";

/**
 * Смужка показника з довільною шкалою.
 *
 * `min` дозволяє від'ємні значення (температура), `unit` дописує одиниці,
 * `optimum` малює позначку там, де показнику належить бути: для вологості
 * субстрату «більше» не означає «краще», і смужка мусить це показувати.
 */
export function statBar({ label, value = 0, min = 0, max = 100, unit = "", hint = "", optimum = null }) {
  const root = el("div", "stat");
  const head = el("div", "stat__head");
  const name = el("span", "stat__label", label);
  const num = el("span", "stat__value");
  head.append(name, num);

  const track = el("div", "stat__track");
  const fill = el("div", "stat__fill");
  track.append(fill);

  if (optimum != null) {
    const mark = el("span", "stat__optimum");
    mark.style.left = `${pct(optimum, min, max)}%`;
    mark.title = `Оптимум — близько ${optimum}${unit}`;
    track.append(mark);
  }

  const delta = el("span", "stat__delta");
  root.append(head, track, delta);

  if (hint) {
    root.title = hint;
    root.dataset.hint = hint;
  }

  function update(next, change) {
    const share = pct(next, min, max);
    fill.style.width = `${share}%`;
    num.textContent = `${Math.round(next)}${unit}`;
    fill.dataset.level = share < 25 ? "low" : share < 60 ? "mid" : "high";

    if (change == null || Math.abs(change) < 0.5) {
      delta.textContent = "";
      delta.dataset.dir = "";
    } else {
      delta.textContent = `${change > 0 ? "▲" : "▼"} ${Math.abs(Math.round(change))}`;
      delta.dataset.dir = change > 0 ? "up" : "down";
    }
  }

  update(value, null);
  return { root, update };
}

function pct(value, min, max) {
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

/** Картка дії. Пояснення «навіщо / строк / ризик» стоїть ДО кнопки, а не після. */
export function actionCard({ action, disabled, disabledReason, onToggle, onCodex }) {
  const root = el("article", "card");
  root.dataset.actionId = action.id;
  root.dataset.category = action.category;
  if (disabled) root.dataset.disabled = "true";

  const head = el("header", "card__head");
  const title = el("h3", "card__title", action.label);
  const cost = el("span", "card__cost", `${action.laborCost} ${hours(action.laborCost)}`);
  cost.title = "Скільки годин догляду забере ця робота за місяць";
  head.append(title, cost);

  const why = el("p", "card__why", action.why);

  const details = el("div", "card__details");
  details.append(detailRow("Строк", action.timing), detailRow("Якщо не зробити", action.risk));

  const foot = el("div", "card__foot");
  const pick = el("button", "btn btn--pick", disabled ? "Недоступно" : "Обрати");
  pick.type = "button";
  pick.disabled = Boolean(disabled);
  if (disabled && disabledReason) pick.title = disabledReason;
  foot.append(pick);

  if (disabled && disabledReason) {
    foot.append(el("span", "card__blocked", disabledReason));
  }

  if (action.codexRef && onCodex) {
    const more = el("button", "btn btn--ghost", "Довідник");
    more.type = "button";
    more.addEventListener("click", () => onCodex(action.codexRef));
    foot.append(more);
  }

  root.append(head, why, details, foot);

  let selected = false;
  pick.addEventListener("click", () => {
    selected = !selected;
    root.dataset.selected = String(selected);
    pick.textContent = selected ? "Скасувати" : "Обрати";
    onToggle?.(action, selected);
  });

  function setSelected(next) {
    selected = next;
    root.dataset.selected = String(next);
    pick.textContent = next ? "Скасувати" : "Обрати";
  }

  function setDisabled(next, reason) {
    pick.disabled = next;
    root.dataset.disabled = String(next);
    pick.title = next && reason ? reason : "";
    if (next && !selected) pick.textContent = "Недоступно";
    if (!next && !selected) pick.textContent = "Обрати";
  }

  return {
    root,
    setSelected,
    setDisabled,
    get selected() {
      return selected;
    },
  };
}

function detailRow(label, text) {
  const row = el("div", "card__detail");
  row.append(el("span", "card__detail-label", label), el("span", "card__detail-text", text));
  return row;
}

/** Українська плюралізація годин. */
export function hours(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "година";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "години";
  return "годин";
}

/**
 * Перемикач вкладок: балкон і чотири горщики.
 *
 * Вкладка мертвої рослини не зникає — вона стає меморіалом із розтином.
 * Прибирати її означало б ховати від гравця саме той урок, за який він
 * заплатив рослиною.
 */
export function tabStrip({ tabs, active, onSelect }) {
  const root = el("div", "tabs");
  root.setAttribute("role", "tablist");
  const buttons = new Map();

  for (const tab of tabs) {
    const button = el("button", "tabs__tab");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.dataset.tabId = tab.id;
    if (tab.tone) button.dataset.tone = tab.tone;

    button.append(el("span", "tabs__name", tab.label));
    if (tab.badge) button.append(el("span", "tabs__badge", tab.badge));

    button.addEventListener("click", () => onSelect(tab.id));
    buttons.set(tab.id, button);
    root.append(button);
  }

  function setActive(id) {
    for (const [key, button] of buttons) {
      const on = key === id;
      button.dataset.active = String(on);
      button.setAttribute("aria-selected", String(on));
    }
  }

  setActive(active);
  return { root, setActive };
}

/**
 * Щільна таблиця порівняння рослин.
 *
 * Чотири рослини по дванадцять показників — це майже п'ятдесят смужок, тобто
 * стіна, у якій нічого не видно. Таблиця відповідає на єдине питання, потрібне
 * щомісяця: «де зараз проблема». Подробиці — у вкладці рослини.
 */
export function compareTable({ columns, rows, onColumnClick }) {
  const root = el("div", "compare");
  const table = el("table", "compare__table");

  const thead = el("thead");
  const headRow = el("tr");
  headRow.append(el("th", "compare__corner", ""));
  for (const column of columns) {
    const th = el("th", "compare__head");
    th.dataset.plantId = column.id;
    if (column.dead) th.dataset.dead = "true";
    const button = el("button", "compare__plant");
    button.type = "button";
    button.append(el("span", "compare__plant-name", column.label));
    if (column.note) button.append(el("span", "compare__plant-note", column.note));
    button.addEventListener("click", () => onColumnClick?.(column.id));
    th.append(button);
    headRow.append(th);
  }
  thead.append(headRow);

  const tbody = el("tbody");
  for (const row of rows) {
    const tr = el("tr");
    const label = el("th", "compare__row-label", row.label);
    if (row.hint) label.title = row.hint;
    tr.append(label);

    for (const column of columns) {
      const cell = row.cells[column.id];
      const td = el("td", "compare__cell");
      if (!cell) {
        td.textContent = "—";
        td.dataset.tone = "dead";
      } else {
        td.textContent = cell.text;
        if (cell.tone) td.dataset.tone = cell.tone;
        if (cell.hint) td.title = cell.hint;
      }
      tr.append(td);
    }
    tbody.append(tr);
  }

  table.append(thead, tbody);
  root.append(table);
  return root;
}

/**
 * Хронологія: ланцюг подій, що привів до результату.
 *
 * Використовується в розтині, де головне не «що сталося», а «коли це
 * вирішилося», тому вузол можна виділити як поворотний.
 */
export function timeline({ items }) {
  const root = el("ol", "timeline");

  for (const item of items) {
    const li = el("li", "timeline__item");
    if (item.tone) li.dataset.tone = item.tone;
    if (item.pivot) li.dataset.pivot = "true";

    const head = el("div", "timeline__head");
    head.append(el("span", "timeline__when", item.when));
    if (item.tag) head.append(el("span", "timeline__tag", item.tag));

    li.append(head, el("p", "timeline__text", item.text));
    root.append(li);
  }

  return root;
}

/**
 * Список ефектів із поясненнями — основа кожного навчального розбору.
 *
 * Показує не «−12 коріння», а «−12 коріння, бо субстрат стояв мокрим при
 * +3 °C». Саме через це в моделі `reason` обов'язковий.
 */
export function effectList({ effects, nameOf, limit = null }) {
  const root = el("ul", "effects");
  const shown = limit ? effects.slice(0, limit) : effects;

  for (const effect of shown) {
    const li = el("li", "effects__item");
    li.dataset.tone = effect.tone ?? "neutral";

    const head = el("div", "effects__head");
    head.append(el("span", "effects__name", nameOf(effect.target)));
    const value = Math.round(effect.actualDelta ?? effect.delta);
    head.append(el("span", "effects__delta", value > 0 ? `+${value}` : String(value)));

    li.append(head, el("p", "effects__reason", effect.reason));
    root.append(li);
  }

  if (shown.length === 0) {
    root.append(el("li", "effects__empty", "Нічого помітного не змінилося."));
  }

  return root;
}
