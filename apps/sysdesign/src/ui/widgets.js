/**
 * Дрібні віджети й форматування, спільні для всіх екранів гри.
 *
 * `statBar` з pixel-ui тут не підходить для завантаження: у ньому низьке
 * значення червоне, а для вузла низьке завантаження — це добре. Тому
 * `meter` свій, з інвертованою шкалою.
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

/** Смужка завантаження: зелене — простоює, червоне — на межі й вище. */
export function meter({ label, value = 0, max = 1, format = (v) => `${Math.round(v * 100)}%` }) {
  const root = el("div", "meter");
  const head = el("div", "meter__head");
  const name = el("span", "meter__label", label);
  const num = el("span", "meter__value");
  head.append(name, num);
  const track = el("div", "meter__track");
  const fill = el("div", "meter__fill");
  track.append(fill);
  root.append(head, track);

  function update(next) {
    const ratio = Math.max(0, next / max);
    fill.style.width = `${Math.min(100, ratio * 100)}%`;
    fill.dataset.level = ratio < 0.7 ? "ok" : ratio < 1 ? "warn" : "over";
    num.textContent = format(next);
  }
  update(value);
  return { root, update };
}

export function section(title, className = "") {
  const root = el("section", `section ${className}`.trim());
  if (title) root.append(el("h3", "section__title", title));
  return root;
}

// ─────────────────────────── форматування ───────────────────────────

const nf = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });

export const fmtNum = (value) => nf.format(Math.round(value));

export const fmtMoney = (value) => `$${nf.format(Math.round(value))}`;

export function fmtMs(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 10_000) return `${(value / 1000).toFixed(0)} с`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(".", ",")} с`;
  return `${Math.round(value)} мс`;
}

export function fmtPct(value, digits = 1) {
  return `${(value * 100).toFixed(digits).replace(".", ",")}%`;
}

export function fmtRps(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1).replace(".", ",")}M req/s`;
  if (value >= 1e4) return `${(value / 1e3).toFixed(0)}k req/s`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1).replace(".", ",")}k req/s`;
  return `${Math.round(value)} req/s`;
}

/** Абзаци з тексту, розділеного "\n\n". */
export function paragraphs(text, className = "text") {
  return String(text ?? "")
    .split("\n\n")
    .filter(Boolean)
    .map((part) => el("p", className, part));
}
