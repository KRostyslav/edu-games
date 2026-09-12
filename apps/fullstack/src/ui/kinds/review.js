/**
 * Code review: клацнути рядки з проблемами. Влучання пояснює проблему й фікс,
 * хибний клік пояснює, чому рядок насправді коректний, — хибна тривога на
 * рев'ю теж коштує: колега витрачає час на відповідь.
 */

import { reviewClick } from "../../game/grade.js";
import { el, notice } from "../widgets.js";

export function mountReview(host, { payload, onMistake, onSolved }) {
  const root = el("div", "kind review");
  root.append(el("p", "kind__prompt", payload.prompt));
  const lines = payload.code.split("\n");
  const total = payload.bad.length;
  const found = new Set();
  const cleared = new Set();
  let solved = false;

  const progress = el("p", "review__progress");
  const code = el("div", "review__code");
  code.setAttribute("role", "list");
  const notes = el("div", "review__notes");
  const rows = lines.map((text, index) => {
    const line = index + 1;
    const row = el("button", "review__line");
    row.type = "button";
    row.setAttribute("role", "listitem");
    row.setAttribute("aria-label", `Рядок ${line}: ${text.trim() || "порожній"}`);
    row.append(el("span", "review__no", String(line)), el("span", "review__text", text || " "));
    row.addEventListener("click", () => pick(line));
    code.append(row);
    return row;
  });
  root.append(progress, code, notes);

  function note(line, text, tone) {
    const item = notice(`Рядок ${line}: ${text}`, tone);
    notes.prepend(item);
  }

  function pick(line, { byDuck = false } = {}) {
    if (solved || found.has(line) || cleared.has(line)) return;
    const verdict = reviewClick(payload, line);
    const row = rows[line - 1];
    if (verdict.hit) {
      found.add(line);
      row.dataset.state = "bad";
      if (byDuck) row.dataset.assist = "true";
      note(line, verdict.why, "bad");
    } else {
      cleared.add(line);
      row.dataset.state = "fine";
      note(line, verdict.why, "info");
      onMistake(`Хибна тривога на рядку ${line}: ${verdict.why}`);
    }
    update();
  }

  function update() {
    progress.textContent = `Знайдено ${found.size} з ${total}`;
    if (!solved && found.size === total) {
      solved = true;
      for (const row of rows) row.disabled = true;
      notes.prepend(notice("Усі проблеми знайдено — цей PR можна повертати автору з конкретними коментарями.", "good"));
      onSolved({ bonus: false });
    }
  }

  update();
  host.append(root);

  return {
    unmount() {},
    assist() {
      const next = payload.bad.find((item) => !found.has(item.line));
      if (!next || solved) return null;
      pick(next.line, { byDuck: true });
      return `Качка звернула увагу на рядок ${next.line}.`;
    },
  };
}
