/**
 * DOM-віджети поверх канви. Навмисно без фреймворку: кожен віджет — функція,
 * що повертає елемент і метод оновлення.
 */

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Смужка показника. Порожня смужка нічого не вчить, тому вона завжди
 * підписана назвою, значенням і — за наявності — стрілкою останньої зміни.
 */
export function statBar({ label, value = 0, max = 100, hint = "" }) {
  const root = el("div", "stat");
  const head = el("div", "stat__head");
  const name = el("span", "stat__label", label);
  const num = el("span", "stat__value");
  head.append(name, num);

  const track = el("div", "stat__track");
  const fill = el("div", "stat__fill");
  const delta = el("span", "stat__delta");
  track.append(fill);
  root.append(head, track, delta);

  if (hint) {
    root.title = hint;
    root.dataset.hint = hint;
  }

  function update(next, change) {
    const pct = Math.max(0, Math.min(100, (next / max) * 100));
    fill.style.width = `${pct}%`;
    num.textContent = Math.round(next);
    fill.dataset.level = pct < 25 ? "low" : pct < 60 ? "mid" : "high";

    if (change == null || Math.abs(change) < 0.5) {
      delta.textContent = "";
      delta.dataset.dir = "";
    } else {
      const sign = change > 0 ? "▲" : "▼";
      delta.textContent = `${sign} ${Math.abs(Math.round(change))}`;
      delta.dataset.dir = change > 0 ? "up" : "down";
    }
  }

  update(value, null);
  return { root, update };
}

/** Модальне вікно. Закривається по Esc і кліку на тло — інакше воно дратує. */
export function modal({ title, wide = false }) {
  const overlay = el("div", "modal__overlay");
  const box = el("div", `modal ${wide ? "modal--wide" : ""}`);
  const head = el("header", "modal__head");
  const heading = el("h2", "modal__title", title);
  const close = el("button", "modal__close", "✕");
  close.type = "button";
  close.setAttribute("aria-label", "Закрити");
  head.append(heading, close);
  const body = el("div", "modal__body");
  const foot = el("footer", "modal__foot");
  box.append(head, body, foot);
  overlay.append(box);

  function hide() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  }
  function onKey(event) {
    if (event.key === "Escape") hide();
  }

  close.addEventListener("click", hide);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) hide();
  });

  function show(parent = document.body) {
    parent.append(overlay);
    document.addEventListener("keydown", onKey);
    box.focus();
  }

  return { overlay, box, body, foot, heading, show, hide };
}

/**
 * Картка дії. Пояснення «навіщо / строк / ризик» вбудоване прямо в картку,
 * а не сховане в окремому довіднику: гравець має розуміти наслідки ДО кліку.
 */
export function actionCard({ action, disabled, disabledReason, onToggle, onCodex }) {
  const root = el("article", "card");
  root.dataset.actionId = action.id;
  if (disabled) root.dataset.disabled = "true";

  const head = el("header", "card__head");
  const title = el("h3", "card__title", action.label);
  const cost = el("span", "card__cost", `${action.laborCost} ${plural(action.laborCost)}`);
  cost.title = "Витрата трудоднів за місяць";
  head.append(title, cost);

  const why = el("p", "card__why", action.why);

  const details = el("div", "card__details");
  details.append(
    detailRow("Строк", action.timing),
    detailRow("Якщо не зробити", action.risk),
  );

  const foot = el("div", "card__foot");
  const pick = el("button", "btn btn--pick", disabled ? "Недоступно" : "Обрати");
  pick.type = "button";
  pick.disabled = Boolean(disabled);
  if (disabled && disabledReason) pick.title = disabledReason;
  foot.append(pick);

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

  return { root, setSelected, setDisabled, get selected() { return selected; } };
}

function detailRow(label, text) {
  const row = el("div", "card__detail");
  row.append(el("span", "card__detail-label", label), el("span", "card__detail-text", text));
  return row;
}

function plural(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "трудодень";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "трудодні";
  return "трудоднів";
}

/** Проста піксельна гістограма для порівняння років. */
export function barChart({ items, max, unit = "" }) {
  const root = el("div", "chart");
  const peak = max ?? Math.max(1, ...items.map((i) => i.value));

  for (const item of items) {
    const row = el("div", "chart__row");
    const label = el("span", "chart__label", item.label);
    const track = el("div", "chart__track");
    const bar = el("div", "chart__bar");
    bar.style.width = `${Math.max(2, (item.value / peak) * 100)}%`;
    if (item.tone) bar.dataset.tone = item.tone;
    const value = el("span", "chart__value", `${item.value}${unit}`);
    track.append(bar);
    row.append(label, track, value);
    root.append(row);
  }
  return root;
}
