/**
 * JS-пісочниця: редактор, прогін прихованих тестів у воркері, результати.
 *
 * Запуск тестів помилкою не вважається: так само, як локальний прогін тестів
 * перед комітом. Рівень пройдено, коли зелені всі основні тести; бонусні
 * тести — третя зірка. Чернетка зберігається в прогресі, тож код не губиться
 * при переході на інший екран чи перезавантаженні.
 */

import { modal } from "@edu/pixel-ui";
import { CODE_TASKS } from "../../data/code.js";
import { createRunner } from "../../sandbox/runner.js";
import { MAX_DRAFT } from "../../progress/store.js";
import { createEditor } from "../editor.js";
import { el, button, paragraphs, notice, codeBlock } from "../widgets.js";

export function mountCodeQuest(host, { payload, ctx, context, onSolved }) {
  const task = CODE_TASKS[payload.task];
  const root = el("div", "kind code");
  const brief = el("div", "code__brief");
  brief.append(el("h4", "seq__title", task.title), ...paragraphs(task.brief));
  root.append(brief);

  const editorHost = el("div", "editor-host");
  editorHost.append(el("div", "loading", "Завантажуємо редактор"));
  const toolbar = el("div", "row kind__actions");
  const runButton = button("▶ Запустити тести", { variant: "primary", onClick: run, title: "Ctrl+Enter" });
  const resetButton = button("↺ Заготовка", {
    onClick: () =>
      ctx.confirm({
        title: "Повернути заготовку?",
        text: "Ваш поточний код у редакторі буде замінено початковою заготовкою.",
        yes: "Замінити",
        onYes: () => editor?.setValue(task.starter),
      }),
  });
  const compareButton = button("Порівняти з еталоном", { onClick: showReference });
  compareButton.hidden = true;
  toolbar.append(runButton, resetButton, compareButton, el("span", "muted code__hint", "Ctrl+Enter — запуск"));
  const results = el("div", "code__results");
  root.append(editorHost, toolbar, results);
  host.append(root);

  const runner = createRunner();
  let editor = null;
  let destroyed = false;
  let solved = false;
  let running = false;

  const draft = ctx.store.state.drafts[task.id] ?? task.starter;
  createEditor({
    parent: editorHost,
    doc: draft,
    lang: "js",
    label: `Код задачі «${task.title}»`,
    onRun: run,
    onChange: (text) => ctx.store.update((state) => (state.drafts[task.id] = text.slice(0, MAX_DRAFT))),
  }).then((instance) => {
    if (destroyed) return instance.destroy();
    editorHost.querySelector(".loading")?.remove();
    editor = instance;
  });

  async function run() {
    if (!editor || running) return;
    running = true;
    runButton.disabled = true;
    results.replaceChildren(el("div", "loading", "Проганяємо тести у воркері"));
    const result = await runner.run(task.id, editor.getValue());
    if (destroyed) return;
    running = false;
    runButton.disabled = false;
    render(result);
    if (result.ok && !solved) {
      solved = true;
      if (context === "level") compareButton.hidden = false;
      onSolved({ bonus: result.bonusOk });
    }
  }

  function render(result) {
    results.replaceChildren();
    if (result.crashed) {
      results.append(notice(result.message, result.timeout ? "warn" : "bad"));
      return;
    }
    if (result.compileError) {
      results.append(notice(`Код не компілюється: ${result.compileError}`, "bad"));
      return;
    }
    const main = result.results.filter((r) => !r.bonus);
    const bonus = result.results.filter((r) => r.bonus);
    const passed = main.filter((r) => r.ok).length;
    const summary = `Основні тести: ${passed} з ${main.length}` + (bonus.length ? ` · Бонус: ${bonus.every((r) => r.ok) ? "✓" : "✗"}` : "");
    results.append(notice(result.ok ? `${summary}. Усе зелене!` : summary, result.ok ? "good" : "bad"));
    const list = el("ul", "code__tests");
    for (const entry of result.results) {
      const item = el("li", "code__test");
      item.dataset.state = entry.ok ? "ok" : "fail";
      item.append(el("span", "code__mark", entry.ok ? "✓" : "✗"), el("span", "code__name", `${entry.bonus ? "[бонус] " : ""}${entry.name}`));
      if (!entry.ok && entry.message) item.append(el("div", "code__message", entry.message));
      list.append(item);
    }
    results.append(list);
    if (result.logs?.length) {
      const logs = el("details", "code__logs");
      logs.append(el("summary", "", `console (${result.logs.length})`));
      logs.append(codeBlock(result.logs.map((line) => `[${line.level}] ${line.text}`).join("\n")));
      results.append(logs);
    }
  }

  function showReference() {
    const dialog = modal({ title: `Еталон: ${task.title}`, wide: true });
    dialog.body.append(
      notice("Це один із можливих розв'язків, а не єдино правильний. Порівняйте підходи: що тут зроблено інакше і чому.", "info"),
      codeBlock(task.reference, { lang: "js", numbered: true }),
    );
    dialog.foot.append(button("Закрити", { onClick: () => dialog.hide() }));
    dialog.show();
  }

  return {
    unmount() {
      destroyed = true;
      runner.destroy();
      editor?.destroy();
    },
  };
}
