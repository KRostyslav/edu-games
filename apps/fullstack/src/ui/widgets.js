/**
 * Дрібні віджети й форматування, спільні для всіх екранів гри.
 */

import { el } from "@edu/pixel-ui";

export { el };

export function button(label, { variant = "", onClick, title, disabled = false, type = "button" } = {}) {
  const node = el("button", `btn${variant ? ` btn--${variant}` : ""}`, label);
  node.type = type;
  if (title) node.title = title;
  node.disabled = disabled;
  if (onClick) node.addEventListener("click", onClick);
  return node;
}

/** Зірки рівня: ★★☆ з текстом для скрінрідера. */
export function starsEl(count, max = 3) {
  const node = el("span", "stars", "★".repeat(count) + "☆".repeat(Math.max(0, max - count)));
  node.dataset.count = String(count);
  node.setAttribute("aria-label", `${count} з ${max} зірок`);
  return node;
}

export function chip(text, tone = "") {
  const node = el("span", "chip", text);
  if (tone) node.dataset.tone = tone;
  return node;
}

export function section(title, className = "") {
  const root = el("section", `section ${className}`.trim());
  if (title) root.append(el("h3", "section__title", title));
  return root;
}

/** Рядок із `інлайн-кодом` у зворотних лапках. */
export function inline(text) {
  const fragment = document.createDocumentFragment();
  const parts = String(text ?? "").split(/`([^`]+)`/);
  parts.forEach((part, index) => {
    if (!part) return;
    fragment.append(index % 2 ? el("code", "code-inline", part) : document.createTextNode(part));
  });
  return fragment;
}

/** Абзаци з тексту, розділеного "\n\n"; одиночні переноси зберігаються. */
export function paragraphs(text, className = "text") {
  return String(text ?? "")
    .split("\n\n")
    .filter(Boolean)
    .map((part) => {
      const p = el("p", className);
      p.append(inline(part));
      return p;
    });
}

/** Блок коду з необов'язковою нумерацією рядків. */
export function codeBlock(src, { lang = "", caption = "", numbered = false } = {}) {
  const figure = el("figure", "codeblock");
  if (lang) figure.dataset.lang = lang;
  const pre = el("pre", "codeblock__pre");
  if (numbered) {
    String(src)
      .split("\n")
      .forEach((line, index) => {
        const row = el("span", "codeblock__line");
        row.append(el("span", "codeblock__no", String(index + 1)), el("span", "codeblock__text", line || " "));
        pre.append(row);
      });
  } else pre.textContent = src;
  figure.append(pre);
  if (caption) figure.append(el("figcaption", "codeblock__caption", caption));
  return figure;
}

export const KIND_LABELS = {
  predict: "Передбач вивід",
  order: "Порядок кроків",
  review: "Code review",
  incident: "Інцидент",
  decision: "Рішення",
  codeQuest: "Код",
  sqlQuest: "SQL",
  isolationLab: "Транзакції",
};

export const KIND_ICONS = {
  predict: "⏱",
  order: "⇅",
  review: "🔎",
  incident: "🚨",
  decision: "⚖",
  codeQuest: "⌨",
  sqlQuest: "🗄",
  isolationLab: "🔀",
};

export function kindChip(kind) {
  const node = chip(`${KIND_ICONS[kind] ?? ""} ${KIND_LABELS[kind] ?? kind}`.trim(), "info");
  node.classList.add("chip--kind");
  return node;
}

/** Смужка прогресу з підписом. */
export function meter({ label, value = 0, max = 1, text = null, tone = "" }) {
  const root = el("div", "meter");
  const head = el("div", "meter__head");
  head.append(el("span", "meter__label", label), el("span", "meter__value", text ?? `${value} / ${max}`));
  const track = el("div", "meter__track");
  const fill = el("div", "meter__fill");
  fill.style.width = `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%`;
  if (tone) fill.dataset.tone = tone;
  track.append(fill);
  root.append(head, track);
  return root;
}

/** Українська множина: plural(3, "зірка", "зірки", "зірок"). */
export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Кнопка-посилання на статтю довідника. */
export function codexLink(ctx, id, title) {
  const node = button(`📖 ${title ?? id}`, { variant: "ghost", onClick: () => ctx.openCodex(id) });
  node.classList.add("codex-link");
  return node;
}

/** Уважне повідомлення з тоном. */
export function notice(text, tone = "") {
  const node = el("div", "notice");
  if (tone) node.dataset.tone = tone;
  if (typeof text === "string") node.append(inline(text));
  else if (text) node.append(text);
  return node;
}
