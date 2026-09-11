/**
 * Дошка конструктора: вузли на сітці й стрілки між ними.
 *
 * Вузли — звичайні DOM-елементи з role="button", стрілки — один SVG під ними.
 * Піксельною лишається лише іконка: текст, фокус і доступність дає DOM, а не
 * канва, де все це довелося б будувати руками.
 *
 * Керування:
 *   • миша/дотик: перетягнути вузол — перемістити; потягнути за «порт» справа
 *     — з'єднати; клік — вибрати;
 *   • режим «З'єднати» (C): клік по джерелу, потім по цілі — для дотику, де
 *     тягнути за маленький порт незручно;
 *   • клавіатура: Tab між вузлами, стрілки — рух, Delete — видалити, C — з'єднати.
 */

import { el } from "@edu/pixel-ui";
import { COMPONENTS } from "../../data/components.js";
import { GRID, findNode, addNode, moveNode, removeNode, removeEdge, connect, canConnect, cellFree, inGrid } from "../../sim/graph.js";
import { iconImg } from "../../render/icons.js";

export const CELL_W = 80;
export const CELL_H = 68;
const NODE_W = 66;
const NODE_H = 56;
const NS = "http://www.w3.org/2000/svg";

const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};

export function createBoard({ level, graph, readOnly = false, onSelect, onChange, onToast }) {
  const root = el("div", "bd");
  root.setAttribute("aria-label", "Дошка архітектури");
  const surface = el("div", "bd__surface");
  surface.style.width = `${GRID.cols * CELL_W}px`;
  surface.style.height = `${GRID.rows * CELL_H}px`;
  const cells = el("div", "bd__cells");
  const svg = svgEl("svg", { class: "bd__edges", width: GRID.cols * CELL_W, height: GRID.rows * CELL_H });
  const defs = svgEl("defs");
  for (const tone of ["idle", "active", "open", "selected"]) {
    const marker = svgEl("marker", { id: `bd-arrow-${tone}`, viewBox: "0 0 8 8", refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: "auto" });
    marker.append(svgEl("path", { d: "M0 0 L8 4 L0 8 Z", class: `bd__arrow bd__arrow--${tone}` }));
    defs.append(marker);
  }
  svg.append(defs);
  const edgeLayer = svgEl("g");
  const tempLine = svgEl("path", { class: "bd__temp", d: "" });
  svg.append(edgeLayer, tempLine);
  const nodeLayer = el("div", "bd__nodes");
  surface.append(cells, svg, nodeLayer);
  root.append(surface);

  // Клітинки потрібні для режиму розміщення: їх видно й по них можна клікнути.
  for (let yy = 0; yy < GRID.rows; yy += 1) {
    for (let xx = 0; xx < GRID.cols; xx += 1) {
      const cell = el("div", "bd__cell");
      cell.dataset.x = String(xx);
      cell.dataset.y = String(yy);
      cell.style.left = `${xx * CELL_W}px`;
      cell.style.top = `${yy * CELL_H}px`;
      cells.append(cell);
    }
  }

  let selection = null;
  let mode = "select"; // select | connect | place
  let placeType = null;
  let connectFrom = null;
  let loads = null;
  let locked = readOnly;
  const nodeEls = new Map();

  const emitChange = () => onChange?.(graph);

  // ─────────────────────────── рендер ───────────────────────────

  function cellCenter(node) {
    return { cx: node.x * CELL_W + CELL_W / 2, cy: node.y * CELL_H + CELL_H / 2 };
  }

  function render() {
    root.dataset.mode = mode;
    root.dataset.readonly = String(locked);
    for (const cell of cells.children) {
      const free = cellFree(graph, Number(cell.dataset.x), Number(cell.dataset.y));
      cell.dataset.free = String(free);
    }
    renderNodes();
    renderEdges();
  }

  function renderNodes() {
    const keep = new Set(graph.nodes.map((node) => node.id));
    for (const [id, element] of nodeEls) {
      if (!keep.has(id)) {
        element.remove();
        nodeEls.delete(id);
      }
    }
    for (const node of graph.nodes) {
      let element = nodeEls.get(node.id);
      if (!element) {
        element = buildNode(node);
        nodeEls.set(node.id, element);
        nodeLayer.append(element);
      }
      updateNode(element, node);
    }
  }

  function buildNode(node) {
    const def = COMPONENTS[node.type];
    const element = el("div", "bd__node");
    element.setAttribute("role", "button");
    element.tabIndex = 0;
    element.dataset.id = node.id;
    element.dataset.type = node.type;
    element.append(
      iconImg(node.type, "bd__icon"),
      el("span", "bd__label", node.label ?? def.short),
      el("span", "bd__count"),
      el("span", "bd__badge"),
    );
    if (def.connectsTo.length) {
      const port = el("span", "bd__port");
      port.title = "Потягніть, щоб з'єднати";
      element.append(port);
    }
    return element;
  }

  function updateNode(element, node) {
    const def = COMPONENTS[node.type];
    element.style.left = `${node.x * CELL_W + (CELL_W - NODE_W) / 2}px`;
    element.style.top = `${node.y * CELL_H + (CELL_H - NODE_H) / 2}px`;
    element.dataset.selected = String(selection?.kind === "node" && selection.id === node.id);
    element.dataset.locked = String(Boolean(node.locked));
    element.dataset.source = String(connectFrom === node.id);

    const snapshot = loads?.nodes?.[node.id];
    const instances = snapshot?.instances ?? node.config.instances;
    element.querySelector(".bd__count").textContent = def.clustered && instances > 1 ? `×${instances}` : node.config.size && node.config.size !== "M" ? node.config.size : "";
    const badge = element.querySelector(".bd__badge");
    if (snapshot && node.type !== "client") {
      element.dataset.load = snapshot.band;
      badge.textContent = snapshot.down ? "✕" : snapshot.rho >= 9.99 ? "999+" : `${Math.round(snapshot.rho * 100)}%`;
    } else {
      element.dataset.load = "none";
      badge.textContent = "";
    }

    let targetState = "";
    if (mode === "connect" && connectFrom && connectFrom !== node.id) {
      const check = canConnect(graph, connectFrom, node.id);
      targetState = check.ok ? "ok" : "no";
      element.title = check.ok ? "Клацніть, щоб з'єднати" : check.reason;
    } else {
      element.title = "";
    }
    element.dataset.target = targetState;

    const parts = [node.label ?? def.label];
    if (def.clustered) parts.push(`${instances} ${instances === 1 ? "інстанс" : "інстанси"}`);
    if (snapshot && node.type !== "client") parts.push(snapshot.down ? "недоступний" : `завантаження ${Math.round(snapshot.rho * 100)}%`);
    element.setAttribute("aria-label", parts.join(", "));
    element.setAttribute("aria-pressed", element.dataset.selected);
  }

  function edgePath(from, to) {
    const a = cellCenter(from);
    const b = cellCenter(to);
    const sx = a.cx + NODE_W / 2;
    const tx = b.cx - NODE_W / 2 - 2;
    const sy = a.cy;
    const ty = b.cy;
    if (tx - sx >= 16) {
      const mid = Math.round((sx + tx) / 2);
      return `M${sx} ${sy} H${mid} V${ty} H${tx}`;
    }
    // Ціль лівіше або в тій самій колонці — обходимо між рядами.
    const lane = ty >= sy ? Math.max(sy, ty) - CELL_H / 2 + 4 : Math.min(sy, ty) + CELL_H / 2 - 4;
    return `M${sx} ${sy} H${sx + 8} V${lane} H${tx - 10} V${ty} H${tx}`;
  }

  function renderEdges() {
    edgeLayer.replaceChildren();
    for (const edge of graph.edges) {
      const from = findNode(graph, edge.from);
      const to = findNode(graph, edge.to);
      if (!from || !to) continue;
      const d = edgePath(from, to);
      const snapshot = loads?.edges?.[edge.id];
      const selected = selection?.kind === "edge" && selection.id === edge.id;
      const tone = selected ? "selected" : snapshot?.open ? "open" : snapshot?.rps > 0 ? "active" : "idle";
      const width = snapshot?.rps > 0 ? Math.min(6, 2 + Math.log10(snapshot.rps + 1)) : 2;
      const visible = svgEl("path", {
        d,
        class: "bd__edge",
        "data-tone": tone,
        "stroke-width": width.toFixed(1),
        "marker-end": `url(#bd-arrow-${tone})`,
      });
      const hit = svgEl("path", { d, class: "bd__edge-hit", "data-edge": edge.id });
      const tip = svgEl("title");
      tip.textContent = `${from.label ?? COMPONENTS[from.type].label} → ${to.label ?? COMPONENTS[to.type].label}${snapshot ? `: ${Math.round(snapshot.rps)} req/s` : ""}`;
      hit.append(tip);
      edgeLayer.append(visible, hit);
    }
  }

  // ─────────────────────────── вибір і режими ───────────────────────────

  function select(next, { focus = false } = {}) {
    selection = next;
    render();
    onSelect?.(selection);
    if (focus && next?.kind === "node") nodeEls.get(next.id)?.focus();
  }

  function setMode(next, type = null) {
    mode = next;
    placeType = next === "place" ? type : null;
    if (next !== "connect") connectFrom = null;
    if (next === "connect" && selection?.kind === "node") connectFrom = selection.id;
    render();
  }

  function tryConnect(fromId, toId) {
    const result = connect(graph, fromId, toId);
    if (!result.ok) {
      onToast?.(result.reason, "bad");
      return false;
    }
    emitChange();
    select({ kind: "edge", id: result.edge.id });
    return true;
  }

  function cellAt(clientX, clientY) {
    const box = surface.getBoundingClientRect();
    const x = Math.floor((clientX - box.left) / CELL_W);
    const y = Math.floor((clientY - box.top) / CELL_H);
    return inGrid(x, y) ? { x, y } : null;
  }

  /** Кидок компонента з палітри в точку екрана. */
  function dropAt(type, clientX, clientY) {
    if (locked) return false;
    const cell = cellAt(clientX, clientY);
    if (!cell) return false;
    return placeAt(type, cell.x, cell.y);
  }

  function placeAt(type, x, y) {
    if (!cellFree(graph, x, y)) {
      onToast?.("Клітинка зайнята — оберіть вільну.", "warn");
      return false;
    }
    const node = addNode(graph, type, x, y, level);
    if (!node) return false;
    setMode("select");
    emitChange();
    select({ kind: "node", id: node.id }, { focus: true });
    return true;
  }

  function deleteSelection() {
    if (locked || !selection) return;
    if (selection.kind === "node") {
      const node = findNode(graph, selection.id);
      if (node?.locked) {
        onToast?.("Цей вузол — частина умови рівня, його не можна прибрати.", "warn");
        return;
      }
      removeNode(graph, selection.id);
    } else {
      removeEdge(graph, selection.id);
    }
    emitChange();
    select(null);
  }

  // ─────────────────────────── вказівник ───────────────────────────

  let drag = null;

  root.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const port = event.target.closest(".bd__port");
    const nodeEl = event.target.closest(".bd__node");
    const edgeHit = event.target.closest(".bd__edge-hit");

    if (port && nodeEl && !locked) {
      event.preventDefault();
      drag = { kind: "wire", from: nodeEl.dataset.id, pointer: event.pointerId };
      root.setPointerCapture(event.pointerId);
      return;
    }
    if (nodeEl) {
      drag = { kind: "node", id: nodeEl.dataset.id, startX: event.clientX, startY: event.clientY, moved: false, el: nodeEl, pointer: event.pointerId };
      return;
    }
    if (edgeHit) {
      select({ kind: "edge", id: edgeHit.dataset.edge });
      return;
    }
    const cell = cellAt(event.clientX, event.clientY);
    if (mode === "place" && placeType && cell && !locked) {
      placeAt(placeType, cell.x, cell.y);
      return;
    }
    if (mode === "connect") setMode("select");
    select(null);
  });

  root.addEventListener("pointermove", (event) => {
    if (!drag) return;
    if (drag.kind === "wire") {
      const from = findNode(graph, drag.from);
      const a = cellCenter(from);
      const box = surface.getBoundingClientRect();
      tempLine.setAttribute("d", `M${a.cx + NODE_W / 2} ${a.cy} L${event.clientX - box.left} ${event.clientY - box.top}`);
      return;
    }
    if (drag.kind === "node") {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      const node = findNode(graph, drag.id);
      if (locked || !node || node.type === "client") return;
      if (!drag.moved) {
        drag.moved = true;
        root.setPointerCapture(drag.pointer);
        drag.el.dataset.dragging = "true";
      }
      drag.el.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  });

  const endDrag = (event) => {
    if (!drag) return;
    const current = drag;
    drag = null;
    if (current.kind === "wire") {
      tempLine.setAttribute("d", "");
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".bd__node");
      if (target && target.dataset.id !== current.from) tryConnect(current.from, target.dataset.id);
      return;
    }
    if (current.kind === "node") {
      current.el.style.transform = "";
      current.el.dataset.dragging = "false";
      if (current.moved) {
        const cell = cellAt(event.clientX, event.clientY);
        if (cell && moveNode(graph, current.id, cell.x, cell.y)) emitChange();
        render();
        return;
      }
      // Звичайний клік по вузлу.
      if (mode === "connect") {
        if (!connectFrom) {
          connectFrom = current.id;
          render();
        } else if (connectFrom !== current.id) {
          const from = connectFrom;
          if (tryConnect(from, current.id)) setMode("select");
        }
        return;
      }
      select({ kind: "node", id: current.id });
    }
  };
  root.addEventListener("pointerup", endDrag);
  root.addEventListener("pointercancel", () => {
    if (drag?.el) {
      drag.el.style.transform = "";
      drag.el.dataset.dragging = "false";
    }
    tempLine.setAttribute("d", "");
    drag = null;
  });

  // ─────────────────────────── клавіатура ───────────────────────────

  root.addEventListener("keydown", (event) => {
    const nodeEl = event.target.closest?.(".bd__node");
    if (event.key === "Escape") {
      setMode("select");
      select(null);
      return;
    }
    if (!nodeEl) return;
    const id = nodeEl.dataset.id;
    const node = findNode(graph, id);
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[event.key] && !locked && node.type !== "client") {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      if (moveNode(graph, id, node.x + dx, node.y + dy)) {
        emitChange();
        render();
        nodeEls.get(id)?.focus();
      }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (mode === "connect" && connectFrom && connectFrom !== id) {
        if (tryConnect(connectFrom, id)) setMode("select");
        return;
      }
      select({ kind: "node", id }, { focus: true });
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && !locked) {
      event.preventDefault();
      select({ kind: "node", id });
      deleteSelection();
      return;
    }
    if ((event.key === "c" || event.key === "с") && !locked) {
      select({ kind: "node", id });
      setMode("connect");
      onToast?.("Режим з'єднання: оберіть, куди йдуть запити.", "info");
    }
  });

  render();

  return {
    root,
    render,
    select,
    setMode,
    dropAt,
    deleteSelection,
    get mode() {
      return mode;
    },
    get selection() {
      return selection;
    },
    setGraph(next) {
      graph = next;
      selection = null;
      nodeEls.forEach((element) => element.remove());
      nodeEls.clear();
      render();
    },
    showLoads(snapshot) {
      loads = snapshot;
      render();
    },
    setReadOnly(value) {
      locked = value;
      if (value) setMode("select");
      render();
    },
    connectFrom(id) {
      if (locked) return;
      select({ kind: "node", id });
      setMode("connect");
    },
  };
}
