/**
 * Лабораторія транзакцій: дві сесії Postgres, крок за кроком.
 *
 * Гравець проганяє варіанти (рівень ізоляції, блокування, атомарний UPDATE)
 * і дивиться, де транзакція чекає, де падає і що лишається в таблиці. Потім
 * відповідає на запитання — вже не з пам'яті, а з побаченого.
 */

import { LABS } from "../../data/labs.js";
import { runLab, outcomeOf, sqlOf, ISOLATION } from "../../labs/mvcc.js";
import { el, button, paragraphs, notice, chip } from "../widgets.js";

function tableView(table, rows) {
  const node = el("table", "sql__table lab__table");
  const head = el("tr");
  for (const col of table.columns) head.append(el("th", "", col));
  const thead = el("thead");
  thead.append(head);
  const tbody = el("tbody");
  for (const row of rows) {
    const tr = el("tr");
    for (const col of table.columns) tr.append(el("td", "", String(row[col])));
    tbody.append(tr);
  }
  node.append(thead, tbody);
  return node;
}

export function mountIsolationLab(host, { payload, onMistake, onSolved }) {
  const lab = LABS[payload.lab];
  const root = el("div", "kind lab");
  root.append(el("h4", "seq__title", lab.title), ...paragraphs(lab.story));
  const start = el("div", "lab__start");
  start.append(el("span", "muted", `Таблиця ${lab.table.name} до початку:`), tableView(lab.table, lab.table.rows));
  const invariant = notice(`Бізнес-правило: ${lab.invariant.text}.`, "info");
  root.append(start, invariant);

  const variantsBox = el("div", "lab__variants");
  root.append(el("h4", "seq__title", "Варіанти — прожени кожен"), variantsBox);
  const programs = el("div", "lab__programs");
  const controls = el("div", "row kind__actions");
  const timeline = el("div", "lab__timeline");
  const verdictBox = el("div", "lab__verdict");
  root.append(programs, controls, timeline, verdictBox);
  const questionBox = el("div", "lab__question");
  root.append(questionBox);
  host.append(root);

  const tried = new Set();
  let current = lab.variants[0];
  let result = null;
  let shown = 0;
  let solved = false;
  let questionShown = false;
  const blocked = new Map();

  function drawVariants() {
    variantsBox.replaceChildren(
      ...lab.variants.map((variant) => {
        const node = button(`${tried.has(variant.id) ? "✓ " : ""}${variant.label}`, { onClick: () => select(variant) });
        node.classList.add("lab__variant");
        if (variant === current) node.setAttribute("aria-pressed", "true");
        return node;
      }),
    );
  }

  function drawPrograms() {
    programs.replaceChildren();
    for (const tx of ["T1", "T2"]) {
      const ops = current[tx.toLowerCase()] ?? lab[tx.toLowerCase()];
      const col = el("div", "lab__program");
      col.dataset.tx = tx;
      col.append(el("h5", "lab__tx", `${tx} · ${ISOLATION[current.iso]}`));
      const pre = el("pre", "lab__sql");
      pre.textContent = ops.map((op) => sqlOf(op, lab.table, current.iso)).join("\n");
      col.append(pre);
      programs.append(col);
    }
    const order = el("p", "muted lab__schedule", `Порядок, у якому сесії надсилають інструкції: ${lab.schedule.join(" → ")}`);
    programs.append(order);
  }

  function select(variant) {
    current = variant;
    result = null;
    timeline.replaceChildren();
    verdictBox.replaceChildren();
    drawVariants();
    drawPrograms();
    drawControls();
  }

  function drawControls() {
    controls.replaceChildren();
    if (!result) {
      controls.append(button("▶ Прогнати покроково", { variant: "primary", onClick: () => run(false) }), button("Показати одразу все", { onClick: () => run(true) }));
      return;
    }
    if (shown < result.events.length) {
      controls.append(button("Наступний крок →", { variant: "primary", onClick: () => reveal(1) }), button("До кінця", { onClick: () => reveal(Infinity) }));
    } else controls.append(button("↺ Прогнати ще раз", { onClick: () => select(current) }));
  }

  function run(all) {
    result = runLab(lab, current);
    shown = 0;
    timeline.replaceChildren(el("div", "lab__row lab__row--head", ""));
    const headRow = timeline.firstChild;
    headRow.append(el("span", "lab__cell lab__no", "#"), el("span", "lab__cell", "T1"), el("span", "lab__cell", "T2"));
    reveal(all ? Infinity : 1);
  }

  function reveal(count) {
    const until = Math.min(result.events.length, shown + count);
    for (; shown < until; shown += 1) {
      const event = result.events[shown];
      const row = el("div", "lab__row");
      row.dataset.kind = event.kind;
      const cell = el("span", "lab__cell lab__event");
      if (event.sql) cell.append(el("code", "lab__code", event.sql));
      if (event.text) cell.append(el("span", "lab__note", event.text));
      const empty = el("span", "lab__cell");
      row.append(el("span", "lab__cell lab__no", String(shown + 1)), ...(event.tx === "T1" ? [cell, empty] : [empty, cell]));
      timeline.append(row);
    }
    if (shown >= result.events.length) finish();
    drawControls();
  }

  function finish() {
    tried.add(current.id);
    drawVariants();
    const outcome = outcomeOf(result);
    verdictBox.replaceChildren();
    const chips = el("div", "row");
    chips.append(chip(outcome.anomaly ? "Аномалія" : "Дані узгоджені", outcome.anomaly ? "bad" : "good"));
    for (const id of outcome.aborted) chips.append(chip(`${id} перервано`, "warn"));
    if (outcome.deadlock) chips.append(chip("Дедлок", "bad"));
    verdictBox.append(chips, el("span", "muted", "Таблиця після обох транзакцій:"), tableView(lab.table, result.final));
    verdictBox.append(notice(result.verdict.text, result.verdict.ok ? "good" : "bad"), notice(current.note, "info"));
    if (!questionShown) showQuestion();
  }

  function showQuestion() {
    questionShown = true;
    drawQuestion();
  }

  function drawQuestion() {
    const q = lab.question;
    questionBox.replaceChildren(el("h4", "seq__title", "Запитання"), el("p", "incident__q", q.q));
    const options = el("div", "incident__options");
    const feedback = el("div", "kind__feedback");
    q.options.forEach((text, index) => {
      const node = button(text, { onClick: () => answer(index, node, feedback), disabled: solved || blocked.has(index) });
      node.classList.add("incident__option");
      if (blocked.has(index)) node.dataset.state = blocked.get(index);
      if (solved && index === q.answer) node.dataset.state = "right";
      options.append(node);
    });
    questionBox.append(options, feedback);
    if (solved) feedback.append(notice(q.explain, "good"));
  }

  function answer(index, node, feedback) {
    if (solved) return;
    const q = lab.question;
    if (index === q.answer) {
      solved = true;
      drawQuestion();
      onSolved({ bonus: false });
      return;
    }
    blocked.set(index, "wrong");
    node.disabled = true;
    node.dataset.state = "wrong";
    feedback.replaceChildren(notice("Не зовсім. Прожени варіанти ще раз і подивися, де саме транзакції розходяться: хто чекає, хто що читає, хто падає.", "bad"));
    onMistake(`Лабораторія «${lab.title}»: хибна відповідь «${q.options[index]}»`);
  }

  drawVariants();
  drawPrograms();
  drawControls();

  return {
    unmount() {},
    assist() {
      if (solved) return null;
      if (!questionShown) showQuestion();
      const index = lab.question.options.findIndex((_, i) => i !== lab.question.answer && !blocked.has(i));
      if (index < 0) return null;
      blocked.set(index, "duck");
      drawQuestion();
      return `Качка відкинула варіант «${lab.question.options[index]}».`;
    },
  };
}
