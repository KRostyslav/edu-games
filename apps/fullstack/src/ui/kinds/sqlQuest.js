/**
 * SQL на справжньому Postgres (PGlite у воркері).
 *
 * «Виконати» працює як psql: стан сесії зберігається між запусками, тож можна
 * створити індекс, а потім подивитися EXPLAIN. «Перевірити» — окремий чистий
 * прогін: свіжий датасет, еталон, потім SQL гравця. Невдала перевірка
 * помилкою не вважається — як і невдалий запит у консолі.
 *
 * Клієнт один на всю гру: Postgres стартує раз за сесію, а не на кожному рівні.
 */

import { SQL_TASKS, DATASETS } from "../../data/sql.js";
import { createSqlClient, SqlTimeoutError } from "../../sql/client.js";
import { checkTask, runSql, describeNode } from "../../sql/checkers.js";
import { MAX_DRAFT } from "../../progress/store.js";
import { createEditor } from "../editor.js";
import { el, button, paragraphs, notice, codeBlock } from "../widgets.js";

let shared = null;
const client = () => (shared ??= createSqlClient());

/** Остання непорожня інструкція — для кнопки EXPLAIN. */
function lastStatement(sql) {
  const parts = sql
    .split(";")
    .map((part) => part.replace(/--[^\n]*/g, "").trim())
    .filter(Boolean);
  return parts.at(-1) ?? "";
}

function resultTable(result) {
  const wrap = el("div", "sql__result");
  if (!result.fields.length) {
    wrap.append(el("p", "muted", `Готово. Змінено рядків: ${result.affected}`));
    return wrap;
  }
  const scroll = el("div", "sql__scroll");
  const table = el("table", "sql__table");
  const head = el("tr");
  for (const field of result.fields) head.append(el("th", "", field));
  const thead = el("thead");
  thead.append(head);
  const tbody = el("tbody");
  for (const row of result.rows) {
    const tr = el("tr");
    for (const value of row) {
      const td = el("td", value === null ? "sql__null" : "", value === null ? "NULL" : String(value));
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  scroll.append(table);
  wrap.append(scroll, el("p", "muted sql__count", result.total > result.rows.length ? `Показано ${result.rows.length} з ${result.total} рядків` : `Рядків: ${result.total}`));
  return wrap;
}

export function mountSqlQuest(host, { payload, ctx, context, onSolved }) {
  const task = SQL_TASKS[payload.task];
  const dataset = DATASETS[task.dataset];
  const db = client();
  const root = el("div", "kind sql");

  const brief = el("div", "code__brief");
  brief.append(el("h4", "seq__title", task.title), ...paragraphs(task.brief));
  const schema = el("details", "sql__schema");
  schema.open = true;
  schema.append(el("summary", "", `Схема: ${dataset.title ?? task.dataset}`));
  const tables = el("ul", "sql__tables");
  for (const table of dataset.tables) {
    const item = el("li", "");
    item.append(el("code", "code-inline", table.name), document.createTextNode(` — ${table.columns}`));
    tables.append(item);
  }
  schema.append(tables);
  root.append(brief, schema);

  const status = el("div", "sql__status");
  const editorHost = el("div", "editor-host");
  editorHost.append(el("div", "loading", "Завантажуємо редактор"));
  const toolbar = el("div", "row kind__actions");
  const runButton = button("▶ Виконати", { onClick: execute, title: "Ctrl+Enter" });
  const explainButton = button("EXPLAIN", { onClick: explain, title: "План останнього запиту в редакторі" });
  const checkButton = button("✓ Перевірити", { variant: "primary", onClick: check });
  const reseedButton = button("↻ Скинути базу", { variant: "ghost", onClick: () => boot(true) });
  const starterButton = button("↺ Заготовка", { variant: "ghost", onClick: () => editor?.setValue(task.starter) });
  toolbar.append(runButton, explainButton, checkButton, reseedButton, starterButton);
  const output = el("div", "sql__output");
  root.append(status, editorHost, toolbar, output);
  host.append(root);

  let editor = null;
  let destroyed = false;
  let solved = false;
  let busy = false;
  let ready = false;

  const draft = ctx.store.state.drafts[task.id] ?? task.starter;
  createEditor({
    parent: editorHost,
    doc: draft,
    lang: "sql",
    label: `SQL задачі «${task.title}»`,
    onRun: execute,
    onChange: (text) => ctx.store.update((state) => (state.drafts[task.id] = text.slice(0, MAX_DRAFT))),
  }).then((instance) => {
    if (destroyed) return instance.destroy();
    editorHost.querySelector(".loading")?.remove();
    editor = instance;
  });

  function setBusy(value) {
    busy = value;
    for (const node of [runButton, explainButton, checkButton, reseedButton]) node.disabled = value || !ready;
  }

  async function boot(manual = false) {
    ready = false;
    setBusy(true);
    status.replaceChildren(el("div", "loading", db.booted ? "Скидаємо базу до початкового датасету" : "Піднімаємо Postgres у браузері (перший раз — кілька секунд)"));
    try {
      await db.reset(task.dataset);
      if (destroyed) return;
      ready = true;
      status.replaceChildren(notice(manual ? "База скинута до початкового стану." : "Postgres готовий. Датасет завантажено — можна писати запити.", "good"));
    } catch (error) {
      if (destroyed) return;
      status.replaceChildren(notice(`Не вдалося запустити Postgres: ${error.message}`, "bad"), button("Спробувати ще раз", { onClick: () => boot() }));
    }
    setBusy(false);
  }

  async function guarded(work) {
    if (!editor || busy || !ready) return;
    setBusy(true);
    try {
      await work();
    } catch (error) {
      if (destroyed) return;
      output.replaceChildren(notice(error.message, error instanceof SqlTimeoutError ? "warn" : "bad"));
      if (error instanceof SqlTimeoutError) {
        setBusy(false);
        await boot();
        return;
      }
    }
    if (!destroyed) setBusy(false);
  }

  function execute() {
    return guarded(async () => {
      output.replaceChildren(el("div", "loading", "Виконуємо"));
      const out = await runSql(db, editor.getValue());
      if (destroyed) return;
      output.replaceChildren();
      if (out.error) return output.append(notice(`Помилка: ${out.error}`, "bad"));
      if (!out.results.length) return output.append(el("p", "muted", "Порожній запит."));
      for (const result of out.results) output.append(resultTable(result));
    });
  }

  function explain() {
    return guarded(async () => {
      const statement = lastStatement(editor.getValue());
      if (!/^(select|with)\b/i.test(statement)) {
        output.replaceChildren(notice("EXPLAIN показує план для SELECT. Поставте запит останнім у редакторі.", "info"));
        return;
      }
      const out = await runSql(db, `EXPLAIN ${statement}`);
      if (destroyed) return;
      if (out.error) return output.replaceChildren(notice(`Помилка: ${out.error}`, "bad"));
      const text = out.results[0].rows.map((row) => row[0]).join("\n");
      output.replaceChildren(el("h4", "seq__title", "План запиту"), codeBlock(text, { lang: "text" }));
    });
  }

  function check() {
    return guarded(async () => {
      output.replaceChildren(el("div", "loading", "Перевіряємо: свіжий датасет → еталон → ваш SQL"));
      const verdict = await checkTask(db, task, editor.getValue());
      if (destroyed) return;
      output.replaceChildren();
      if (verdict.ok) {
        const bonusLine = task.bonus ? (verdict.bonus ? " Бонусну умову теж виконано." : " Бонусну умову поки не виконано — спробуйте ще.") : "";
        output.append(notice(`Перевірку пройдено!${bonusLine}`, "good"));
      } else {
        output.append(notice(`Ще ні: ${verdict.reason}`, "bad"));
      }
      if (verdict.plan?.length) {
        output.append(el("h4", "seq__title", "Вузли плану"), codeBlock(verdict.plan.map((node) => `${"  ".repeat(node.depth)}${describeNode(node)}  (cost ${node.cost})`).join("\n")));
      }
      for (const result of verdict.results ?? []) if (result.fields.length) output.append(resultTable({ ...result, total: result.rows.length, rows: result.rows.slice(0, 50) }));
      if (verdict.ok && !solved) {
        solved = true;
        onSolved({ bonus: verdict.bonus });
      }
      // Після перевірки в сесії стан «датасет + ваш SQL» — можна продовжувати експерименти.
    });
  }

  boot();

  return {
    unmount() {
      destroyed = true;
      editor?.destroy();
    },
  };
}
