/**
 * Програвання прогону: година за пів хвилини, з перемоткою.
 *
 * Модель рахує всю годину одразу, тож тут лише показ готової шкали:
 * повзунок можна тягати назад і вперед, а дошка показує стан системи на
 * вибраній хвилині. Інциденти позначені на шкалі — видно, що саме зламалося
 * і чи система оговталася після.
 */

import { el } from "@edu/pixel-ui";
import { CLASS_LABELS } from "../../data/constants.js";
import { lineChart } from "../charts.js";
import { button, chip, fmtMs, fmtPct, fmtRps } from "../widgets.js";

const SPEEDS = [1, 2, 4];
const CLASS_TONE = { read: "accent", write: "warn", static: "good", query: "info", conn: "info" };

export function createPlayback({ level, run, speed = 1, onTick, onEnd, onSpeed, onEdit }) {
  const ticks = run.ticks;
  const last = ticks.length - 1;
  const slo = level.slo ?? {};
  const root = el("section", "pb");
  root.setAttribute("aria-label", "Прогін");

  // ── керування ──
  const controls = el("div", "pb__controls");
  const playBtn = button("▶ Грати", { variant: "primary", onClick: () => (timer ? pause() : play()) });
  const restartBtn = button("⟲", { title: "З початку", onClick: () => seek(0) });
  restartBtn.setAttribute("aria-label", "З початку");
  const skipBtn = button("До розбору ⏭", { onClick: () => finish() });
  const editBtn = button("✎ Змінити схему", { variant: "ghost", onClick: () => onEdit?.() });

  const speedBox = el("div", "pb__speed");
  speedBox.setAttribute("role", "group");
  speedBox.setAttribute("aria-label", "Швидкість");
  const speedBtns = SPEEDS.map((value) => {
    const btn = button(`${value}×`, { variant: "ghost", onClick: () => setSpeed(value) });
    btn.dataset.speed = String(value);
    speedBox.append(btn);
    return btn;
  });

  const track = el("div", "pb__track");
  const slider = el("input", "pb__slider");
  slider.type = "range";
  slider.min = "0";
  slider.max = String(last);
  slider.value = "0";
  slider.setAttribute("aria-label", "Хвилина прогону");
  slider.addEventListener("input", () => {
    pause();
    seek(Number(slider.value));
  });
  const markers = el("div", "pb__markers");
  for (const incident of level.incidents ?? []) {
    const marker = el("span", "pb__marker");
    marker.style.left = `${(incident.at / last) * 100}%`;
    marker.style.width = `${Math.max(1, ((incident.dur ?? 1) / last) * 100)}%`;
    marker.title = `хв ${incident.at}: ${incident.title}`;
    markers.append(marker);
  }
  track.append(markers, slider);
  controls.append(playBtn, restartBtn, track, speedBox, skipBtn, editBtn);

  // ── поточна хвилина ──
  const stats = el("div", "pb__stats");
  stats.setAttribute("aria-live", "polite");

  // ── графіки ──
  const spans = (level.incidents ?? []).map((incident) => ({ from: incident.at, to: incident.at + (incident.dur ?? 1), label: incident.title }));
  const charts = [];
  const classes = Object.keys(slo.p99Ms ?? {}).filter((cls) => run.summary.p99Series[cls]);
  if (classes.length) {
    const top = Math.max(...classes.map((cls) => slo.p99Ms[cls]));
    charts.push(
      lineChart({
        title: "p99 латентність",
        ticks: ticks.length,
        yMax: top * 2.5,
        format: (v) => fmtMs(v),
        thresholds: classes.map((cls) => ({ value: slo.p99Ms[cls], label: `SLO ${CLASS_LABELS[cls]}` })),
        spans,
        series: classes.map((cls) => ({ label: CLASS_LABELS[cls], values: run.summary.p99Series[cls], tone: CLASS_TONE[cls] })),
      }),
    );
  }
  const budget = 1 - (slo.availability ?? 0.99);
  charts.push(
    lineChart({
      title: "Помилки, % запитів",
      ticks: ticks.length,
      yMax: Math.max(5, budget * 100 * 4),
      format: (v) => `${v.toFixed(v < 10 ? 1 : 0)}%`,
      thresholds: [{ value: budget * 100, label: "бюджет помилок" }],
      spans,
      series: [{ label: "Помилки", values: ticks.map((tick) => (1 - tick.availability) * 100), tone: "bad" }],
    }),
  );
  if (run.summary.lagMax > 0) {
    charts.push(
      lineChart({
        title: "Затримка обробки черги",
        ticks: ticks.length,
        yMax: Math.max(slo.maxLagSec ?? 600, run.summary.lagMax) * 1.1,
        format: (v) => `${Math.round(v)} с`,
        thresholds: slo.maxLagSec ? [{ value: slo.maxLagSec, label: "SLO" }] : [],
        spans,
        series: [{ label: "Лаг", values: ticks.map((tick) => tick.lagSec), tone: "warn" }],
      }),
    );
  }
  const chartBox = el("div", "pb__charts");
  for (const chart of charts) chartBox.append(chart.root);

  const log = el("div", "pb__log");

  root.append(controls, stats, chartBox, log);

  let t = 0;
  let timer = null;
  let currentSpeed = SPEEDS.includes(speed) ? speed : 1;
  let finished = false;

  function renderStats() {
    const tick = ticks[t];
    stats.replaceChildren();
    stats.append(el("strong", "pb__minute", `Хвилина ${t}`));
    const avail = chip(`Доступність ${fmtPct(tick.availability, 2)}`, tick.availability >= (slo.availability ?? 0.99) ? "good" : "bad");
    stats.append(avail);
    const offered = Object.entries(tick.offered)
      .filter(([cls, value]) => value > 0 && cls !== "abuse" && cls !== "conn")
      .reduce((sum, [, value]) => sum + value, 0);
    stats.append(chip(fmtRps(offered)));
    for (const cls of classes) {
      const value = tick.p99[cls];
      stats.append(chip(`p99 ${CLASS_LABELS[cls]} ${fmtMs(value)}`, value <= slo.p99Ms[cls] ? "good" : "bad"));
    }
    if (tick.offered.abuse > 0) stats.append(chip(`атака ${fmtRps(tick.offered.abuse)}`, "warn"));
    for (const index of tick.active) stats.append(chip(`⚡ ${level.incidents[index].title}`, "warn"));

    log.replaceChildren();
    const notes = tick.notes.filter((note) => note.tone !== "info" || note.kind === "breaker" || note.kind === "failover");
    if (!notes.length) {
      log.append(el("p", "pb__calm", "Усе спокійно: вузли встигають, помилок немає."));
    } else {
      const list = el("ul", "pb__notes");
      for (const note of notes.slice(0, 6)) {
        const item = el("li", "pb__note", note.text);
        item.dataset.tone = note.tone;
        list.append(item);
      }
      log.append(list);
    }
  }

  function seek(next) {
    t = Math.max(0, Math.min(last, next));
    slider.value = String(t);
    for (const chart of charts) chart.setCursor(t);
    renderStats();
    onTick?.(t);
  }

  function play() {
    if (t >= last) seek(0);
    playBtn.textContent = "❚❚ Пауза";
    timer = setInterval(() => {
      if (t >= last) {
        finish();
        return;
      }
      seek(t + 1);
    }, 400 / currentSpeed);
  }

  function pause() {
    if (timer) clearInterval(timer);
    timer = null;
    playBtn.textContent = "▶ Грати";
  }

  function setSpeed(value) {
    currentSpeed = value;
    for (const btn of speedBtns) btn.dataset.active = String(Number(btn.dataset.speed) === value);
    onSpeed?.(value);
    if (timer) {
      pause();
      play();
    }
  }

  function finish() {
    pause();
    seek(last);
    if (!finished) {
      finished = true;
      onEnd?.();
    } else {
      onEnd?.({ again: true });
    }
  }

  setSpeed(currentSpeed);
  seek(0);

  return {
    root,
    play,
    pause,
    seek,
    destroy() {
      pause();
      root.remove();
    },
  };
}
