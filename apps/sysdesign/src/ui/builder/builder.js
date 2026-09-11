/**
 * Конструктор цілком: палітра, дошка, інспектор, список проблем і прогін.
 *
 * Один компонент на три місця: рівні кампанії, крок high-level design у
 * mock interview і перегляд еталонної схеми (readOnly). Тому він нічого не
 * знає про зірки й прогрес — лише повідомляє про зміну графа й про те, що
 * прогін завершено, а що з цим робити, вирішує екран, який його вставив.
 *
 * Поки гравець редагує, після кожної зміни рахується прогноз на одну спокійну
 * хвилину: завантаження вузлів і вартість видно одразу, а інциденти — лише
 * під час справжнього прогону.
 */

import "./builder.css";
import { el } from "@edu/pixel-ui";
import { createBoard } from "./board.js";
import { createPalette } from "./palette.js";
import { createInspector } from "./inspector.js";
import { createPlayback } from "./playback.js";
import { simulate, forecast } from "../../sim/simulate.js";
import { hasErrors } from "../../sim/validate.js";
import { scoreRun } from "../../sim/score.js";
import { button, chip, fmtMoney } from "../widgets.js";

const SEVERITY = { error: { label: "Помилка", tone: "bad" }, warn: { label: "Увага", tone: "warn" }, info: { label: "Порада", tone: "info" } };

export function createBuilder({ level, graph, ctx, readOnly = false, seed = 1, onGraphChange, onRunComplete, toolbarExtra = [] }) {
  const root = el("div", "bl");
  root.dataset.readonly = String(readOnly);

  const toolbar = el("div", "bl__toolbar");
  const connectBtn = button("З'єднати (C)", { onClick: () => toggleConnect() });
  const deleteBtn = button("Видалити", { variant: "ghost", onClick: () => board.deleteSelection() });
  const costChip = chip("—");
  costChip.title = "Вартість схеми на місяць";
  const runBtn = button("▶ Запустити прогін", { variant: "primary", onClick: () => run() });
  const spacer = el("span", "bl__spacer");
  if (!readOnly) toolbar.append(connectBtn, deleteBtn);
  toolbar.append(...toolbarExtra, spacer, costChip, runBtn);

  const main = el("div", "bl__main");
  const boardWrap = el("div", "bl__board");
  const issuesBox = el("div", "bl__issues");
  issuesBox.setAttribute("aria-live", "polite");
  const toastBox = el("div", "bl__toast");
  toastBox.setAttribute("role", "status");
  const playbackHost = el("div", "bl__playback");

  let forecastRun = null;
  let lastRun = null;
  let playback = null;
  let timer = null;
  let toastTimer = null;

  const board = createBoard({
    level,
    graph,
    readOnly,
    onSelect: (selection) => inspector.show(selection, forecastRun),
    onChange: changed,
    onToast: toast,
  });
  const inspector = createInspector({
    level,
    graph,
    readOnly,
    onChange: changed,
    onCodex: (id) => ctx.openCodex(id),
    onSelect: (selection) => board.select(selection),
    onToast: toast,
  });
  const palette = readOnly
    ? null
    : createPalette({
        level,
        onPick: (type) => {
          board.setMode(type ? "place" : "select", type);
          if (type) toast("Оберіть вільну клітинку на дошці.", "info");
        },
        onDrop: (type, x, y) => {
          board.dropAt(type, x, y);
          palette.setActive(null);
        },
        onCodex: (id) => ctx.openCodex(id),
      });

  boardWrap.append(board.root);
  if (palette) main.append(palette.root);
  main.append(boardWrap, inspector.root);
  root.append(toolbar, main, issuesBox, toastBox, playbackHost);

  function changed() {
    board.render();
    onGraphChange?.(graph);
    clearTimeout(timer);
    timer = setTimeout(refresh, 120);
  }

  function refresh() {
    const result = forecast(graph, level);
    forecastRun = result.ok ? result : null;
    renderIssues(result.issues ?? []);
    if (!playback) board.showLoads(forecastRun ? forecastRun.ticks[0] : null);
    inspector.show(board.selection, forecastRun);
    if (forecastRun) {
      const total = forecastRun.cost.total;
      costChip.textContent = `${fmtMoney(total)}/міс${level.budget ? ` з ${fmtMoney(level.budget)}` : ""}`;
      costChip.dataset.tone = level.budget && total > level.budget ? "bad" : "good";
    } else {
      costChip.textContent = "—";
      costChip.dataset.tone = "";
    }
    runBtn.disabled = hasErrors(result.issues ?? []);
    runBtn.title = runBtn.disabled ? "Спершу виправте помилки в схемі" : "";
  }

  function renderIssues(issues) {
    issuesBox.replaceChildren();
    if (!issues.length) return;
    const list = el("ul", "bl__issue-list");
    for (const issue of issues) {
      const item = el("li", "bl__issue");
      item.dataset.tone = SEVERITY[issue.severity].tone;
      item.append(chip(SEVERITY[issue.severity].label, SEVERITY[issue.severity].tone));
      const text = el("span", "bl__issue-text", issue.text);
      item.append(text);
      if (issue.nodeId) {
        item.append(button("Показати", { variant: "ghost", onClick: () => board.select({ kind: "node", id: issue.nodeId }, { focus: true }) }));
      }
      if (issue.codexRef) item.append(button("?", { variant: "ghost", title: "Довідник", onClick: () => ctx.openCodex(issue.codexRef) }));
      list.append(item);
    }
    issuesBox.append(list);
  }

  function toast(text, tone = "info") {
    toastBox.textContent = text;
    toastBox.dataset.tone = tone;
    toastBox.dataset.visible = "true";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastBox.dataset.visible = "false"), 3500);
  }

  function toggleConnect() {
    if (board.mode === "connect") {
      board.setMode("select");
      connectBtn.dataset.active = "false";
      return;
    }
    board.setMode("connect");
    connectBtn.dataset.active = "true";
    toast(board.selection?.kind === "node" ? "Оберіть, куди йдуть запити." : "Оберіть вузол-джерело, потім ціль.", "info");
  }

  function run() {
    const result = simulate(graph, level, { seed });
    if (!result.ok) {
      renderIssues(result.issues);
      toast("Схема ще не готова до прогону.", "bad");
      return;
    }
    lastRun = result;
    playback?.destroy();
    board.setReadOnly(true);
    root.dataset.mode = "playback";
    playback = createPlayback({
      level,
      run: result,
      speed: ctx.store?.state.settings.speed ?? 1,
      onTick: (t) => board.showLoads(result.ticks[t]),
      onEnd: () => onRunComplete?.(result, scoreRun(result, level)),
      onSpeed: (value) => ctx.store?.update((state) => (state.settings.speed = value)),
      onEdit: () => exitPlayback(),
    });
    playbackHost.replaceChildren(playback.root);
    playback.play();
    playbackHost.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }

  function exitPlayback() {
    playback?.destroy();
    playback = null;
    root.dataset.mode = "edit";
    board.setReadOnly(readOnly);
    refresh();
  }

  root.addEventListener("keydown", (event) => {
    if (event.target.matches("input, select, textarea")) return;
    if ((event.key === "c" || event.key === "с") && !event.target.closest(".bd__node") && !readOnly && !playback) toggleConnect();
  });

  refresh();

  return {
    root,
    run,
    exitPlayback,
    refresh,
    get graph() {
      return graph;
    },
    get lastRun() {
      return lastRun;
    },
    destroy() {
      clearTimeout(timer);
      clearTimeout(toastTimer);
      playback?.destroy();
    },
  };
}
