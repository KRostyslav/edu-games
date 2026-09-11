/**
 * Лінійні графіки прогону на SVG.
 *
 * Латентність під час відмови стрибає до таймаутів у десятки секунд, і на
 * лінійній шкалі нормальні 80 мс перетворилися б на пласку лінію біля нуля.
 * Тому шкала обрізається трохи вище SLO, а все, що вище, малюється по
 * верхній межі червоним: видно і норму, і сам факт вильоту.
 */

const NS = "http://www.w3.org/2000/svg";
const W = 600;
const H = 150;
const PAD = { l: 52, r: 10, t: 12, b: 20 };

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

/**
 * @param series      [{ label, values: (number|null)[], tone }]
 * @param yMax        верхня межа шкали
 * @param thresholds  [{ value, label }] — пунктирні лінії (SLO)
 * @param spans       [{ from, to, label }] — підсвічені інтервали інцидентів
 */
export function lineChart({ title, series, ticks, yMax, format = (v) => String(Math.round(v)), thresholds = [], spans = [] }) {
  const root = document.createElement("figure");
  root.className = "chart-line";
  const caption = document.createElement("figcaption");
  caption.className = "chart-line__title";
  caption.textContent = title;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart-line__svg", role: "img", "aria-label": title });
  const x = (t) => PAD.l + (t / Math.max(1, ticks - 1)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - Math.min(v, yMax) / yMax) * (H - PAD.t - PAD.b);

  for (const span of spans) {
    const rectNode = svgEl("rect", {
      x: x(span.from),
      y: PAD.t,
      width: Math.max(2, x(Math.min(ticks - 1, span.to)) - x(span.from)),
      height: H - PAD.t - PAD.b,
      class: "chart-line__span",
    });
    const tip = svgEl("title");
    tip.textContent = span.label;
    rectNode.append(tip);
    svg.append(rectNode);
  }

  for (const value of [0, yMax / 2, yMax]) {
    svg.append(svgEl("line", { x1: PAD.l, x2: W - PAD.r, y1: y(value), y2: y(value), class: "chart-line__grid" }));
    const label = svgEl("text", { x: PAD.l - 6, y: y(value) + 4, class: "chart-line__axis", "text-anchor": "end" });
    label.textContent = format(value);
    svg.append(label);
  }
  for (const t of [0, 15, 30, 45, ticks - 1]) {
    const label = svgEl("text", { x: x(t), y: H - 4, class: "chart-line__axis", "text-anchor": "middle" });
    label.textContent = `${t}`;
    svg.append(label);
  }

  for (const threshold of thresholds) {
    svg.append(svgEl("line", { x1: PAD.l, x2: W - PAD.r, y1: y(threshold.value), y2: y(threshold.value), class: "chart-line__slo" }));
    const label = svgEl("text", { x: W - PAD.r - 2, y: y(threshold.value) - 3, class: "chart-line__slo-label", "text-anchor": "end" });
    label.textContent = threshold.label;
    svg.append(label);
  }

  for (const item of series) {
    let d = "";
    let pen = false;
    item.values.forEach((value, t) => {
      if (value == null || !Number.isFinite(value)) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(t).toFixed(1)} ${y(value).toFixed(1)} `;
      pen = true;
    });
    const path = svgEl("path", { d, class: "chart-line__path", "data-tone": item.tone ?? "accent" });
    svg.append(path);
    // Вильоти за шкалу — окремими червоними засічками вгорі.
    item.values.forEach((value, t) => {
      if (value != null && value > yMax) svg.append(svgEl("rect", { x: x(t) - 2, y: PAD.t - 2, width: 4, height: 4, class: "chart-line__over" }));
    });
  }

  const cursor = svgEl("line", { x1: 0, x2: 0, y1: PAD.t, y2: H - PAD.b, class: "chart-line__cursor" });
  svg.append(cursor);

  const legend = document.createElement("div");
  legend.className = "chart-line__legend";
  for (const item of series) {
    const entry = document.createElement("span");
    entry.className = "chart-line__key";
    entry.dataset.tone = item.tone ?? "accent";
    entry.textContent = item.label;
    legend.append(entry);
  }

  root.append(caption, svg, legend);

  function setCursor(t) {
    cursor.setAttribute("x1", x(t));
    cursor.setAttribute("x2", x(t));
  }
  setCursor(0);
  return { root, setCursor };
}
