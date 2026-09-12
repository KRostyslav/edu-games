/**
 * Сигнали інциденту: метрики, логи, трейси, нотатки. Спільні для рівнів
 * і фаз боса. Малюються DOM-ом у піксельному стилі, без бібліотек графіків.
 */

import { el } from "../widgets.js";

const LOG_TONE = /\b(error|err|fatal|panic|refused|reset|timeout|502|503|504)\b/i;
const WARN_TONE = /\b(warn|warning|slow|retry|lag)\b/i;

function metric(signal) {
  const box = el("div", "signal__metric");
  const values = signal.values;
  const peak = Math.max(...values, signal.threshold ?? 0) || 1;
  const bars = el("div", "signal__bars");
  values.forEach((value, index) => {
    const bar = el("span", "signal__bar");
    bar.style.height = `${Math.max(3, (value / peak) * 100)}%`;
    if (signal.mark != null && index >= signal.mark) bar.dataset.tone = "bad";
    else if (signal.threshold != null && value > signal.threshold) bar.dataset.tone = "warn";
    bar.title = `${value} ${signal.unit ?? ""}`.trim();
    bars.append(bar);
  });
  if (signal.threshold != null) {
    const line = el("span", "signal__threshold");
    line.style.bottom = `${(signal.threshold / peak) * 100}%`;
    line.title = `Поріг: ${signal.threshold} ${signal.unit ?? ""}`;
    bars.append(line);
  }
  const last = values.at(-1);
  box.append(bars, el("div", "signal__legend", `зараз: ${last} ${signal.unit ?? ""}${signal.threshold != null ? ` · поріг ${signal.threshold}` : ""}`));
  return box;
}

function log(signal) {
  const pre = el("pre", "signal__log");
  for (const line of signal.lines) {
    const row = el("span", "signal__logline", line);
    if (LOG_TONE.test(line)) row.dataset.tone = "bad";
    else if (WARN_TONE.test(line)) row.dataset.tone = "warn";
    pre.append(row);
  }
  return pre;
}

function trace(signal) {
  const box = el("div", "signal__trace");
  const total = Math.max(...signal.spans.map((span) => span.start + span.dur)) || 1;
  for (const span of signal.spans) {
    const row = el("div", "signal__span");
    const label = el("span", "signal__span-name", span.name);
    label.style.paddingLeft = `${(span.depth ?? 0) * 12}px`;
    const track = el("span", "signal__span-track");
    const bar = el("span", "signal__span-bar");
    bar.style.left = `${(span.start / total) * 100}%`;
    bar.style.width = `${Math.max(0.6, (span.dur / total) * 100)}%`;
    if (span.dur / total > 0.5) bar.dataset.tone = "bad";
    track.append(bar);
    row.append(label, track, el("span", "signal__span-dur", `${span.dur} мс`));
    box.append(row);
  }
  return box;
}

function noteBlock(signal) {
  const list = el("ul", "signal__note");
  for (const line of signal.lines) list.append(el("li", "", line));
  return list;
}

const RENDER = { metric, log, trace, note: noteBlock };
const ICON = { metric: "📈", log: "📜", trace: "🧵", note: "📝" };

export function renderSignals(signals) {
  const grid = el("div", "signals");
  for (const signal of signals) {
    const card = el("section", "signal");
    card.dataset.kind = signal.kind;
    card.append(el("h4", "signal__title", `${ICON[signal.kind] ?? ""} ${signal.title}`));
    card.append(RENDER[signal.kind](signal));
    grid.append(card);
  }
  return grid;
}
