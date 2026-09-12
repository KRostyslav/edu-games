/**
 * Послідовність: «передбач вивід» (predict) і «упорядкуй кроки» (order).
 *
 * Гравець збирає послідовність клацанням по варіантах; клацання по вже
 * поставленому повертає його назад. Перевірка показує першу хибну позицію
 * й зберігає правильний префікс — як відладка: знайти, де саме розійшлося.
 * Зайві кроки в order — пастки: вибір такого одразу пояснює, чому так не буває.
 */

import { shuffledIndices, checkSequence } from "../../game/grade.js";
import { el, button, codeBlock, paragraphs, notice } from "../widgets.js";

export function mountSequence(host, { payload, mode, seed, onMistake, onSolved }) {
  const root = el("div", "kind seq");
  const expected = mode === "predict" ? payload.expected : payload.items;
  const entries = expected.map((text, index) => ({ id: `e${index}`, text, index }));
  // Пастки: у order — зайві кроки, у predict — рядки, які насправді ніколи не надрукуються.
  const traps = (payload.distractors ?? []).map((d, i) => ({ id: `d${i}`, text: d.text, index: null, why: d.why }));
  const all = [...entries, ...traps];
  const pool = shuffledIndices(all.length, seed).map((i) => all[i]);

  let answer = [];
  let wrongFrom = -1;
  let solved = false;
  const eliminated = new Set();
  const assisted = new Set();

  if (mode === "predict") {
    const prompt = payload.distractors?.length
      ? "У якому порядку рядки з'являться в консолі? Клацайте в порядку виводу. Обережно: деякі рядки не надрукуються взагалі."
      : "У якому порядку рядки з'являться в консолі? Клацайте варіанти в порядку виводу.";
    root.append(el("p", "kind__prompt", prompt));
    if (payload.context === "io") root.append(notice("Увага: код виконується всередині колбека I/O-операції (fs.stat) — тобто вже у фазі poll циклу подій.", "info"));
    root.append(codeBlock(payload.code, { lang: "js", numbered: true }));
  } else {
    root.append(el("p", "kind__prompt", payload.prompt));
  }

  const board = el("div", "seq__board");
  const poolBox = el("div", "seq__col");
  const answerBox = el("div", "seq__col");
  poolBox.append(el("h4", "seq__title", mode === "predict" ? "Рядки виводу" : "Кроки"));
  answerBox.append(el("h4", "seq__title", "Ваша послідовність"));
  const poolList = el("div", "seq__list");
  const answerList = el("ol", "seq__answer");
  poolBox.append(poolList);
  answerBox.append(answerList);
  board.append(poolBox, answerBox);
  root.append(board);

  const feedback = el("div", "kind__feedback");
  const actions = el("div", "row kind__actions");
  const check = button("Перевірити", { variant: "primary", onClick: verify });
  const clear = button("Очистити", {
    onClick: () => {
      answer = answer.filter((entry) => assisted.has(entry.id));
      wrongFrom = -1;
      draw();
    },
  });
  actions.append(check, clear);
  root.append(actions, feedback);

  function place(entry) {
    if (solved) return;
    if (entry.index === null) {
      eliminated.add(entry.id);
      const what = mode === "predict" ? "цей рядок не надрукується" : "зайвий крок";
      feedback.replaceChildren(notice(`«${entry.text}» — ${what}. ${entry.why}`, "bad"));
      onMistake(`«${entry.text}» — ${what}: ${entry.why}`);
    } else {
      answer.push(entry);
      wrongFrom = -1;
      feedback.replaceChildren();
    }
    draw();
  }

  function unplace(entry) {
    if (solved || assisted.has(entry.id)) return;
    answer = answer.filter((item) => item !== entry);
    wrongFrom = -1;
    draw();
  }

  function verify() {
    const result = checkSequence(
      entries.map((entry) => entry.index),
      answer.map((entry) => entry.index),
    );
    if (result.ok) {
      solved = true;
      wrongFrom = -1;
      draw();
      feedback.replaceChildren(notice("Усе на своїх місцях.", "good"), ...paragraphs(payload.explain));
      onSolved({ bonus: false });
      return;
    }
    wrongFrom = result.firstWrong;
    const culprit = answer[result.firstWrong];
    draw();
    feedback.replaceChildren(
      notice(`Позиція ${result.firstWrong + 1}: «${culprit.text}» тут не на місці. Правильний початок збережено — перебудуйте решту.`, "bad"),
    );
    onMistake(`Позиція ${result.firstWrong + 1}: «${culprit.text}» не на місці`);
  }

  function draw() {
    const used = new Set(answer.map((entry) => entry.id));
    poolList.replaceChildren(
      ...pool
        .filter((entry) => !used.has(entry.id))
        .map((entry) => {
          const node = button(entry.text, { onClick: () => place(entry), disabled: solved || eliminated.has(entry.id) });
          node.classList.add("seq__item");
          if (eliminated.has(entry.id)) node.dataset.state = "trap";
          if (mode === "predict") node.classList.add("seq__item--mono");
          return node;
        }),
    );
    answerList.replaceChildren(
      ...answer.map((entry, i) => {
        const li = el("li", "seq__slot");
        const node = button(entry.text, { onClick: () => unplace(entry), disabled: solved });
        node.classList.add("seq__item");
        if (mode === "predict") node.classList.add("seq__item--mono");
        li.dataset.state = solved || (wrongFrom >= 0 && i < wrongFrom) ? "ok" : wrongFrom >= 0 && i >= wrongFrom ? "wrong" : "";
        if (assisted.has(entry.id)) li.dataset.assist = "true";
        li.append(node);
        return li;
      }),
    );
    if (!answer.length) answerList.append(el("li", "seq__empty muted", "Порожньо — клацайте варіанти ліворуч."));
    check.disabled = solved || answer.length !== entries.length;
    clear.disabled = solved || answer.length === 0;
  }

  draw();
  host.append(root);

  return {
    unmount() {},
    /** Качка ставить на місце наступний правильний крок. */
    assist() {
      if (solved) return null;
      let prefix = 0;
      while (prefix < answer.length && answer[prefix].index === prefix) prefix += 1;
      const target = entries[prefix];
      if (!target) return null;
      answer = answer.slice(0, prefix).concat(target, answer.slice(prefix).filter((entry) => entry !== target));
      assisted.add(target.id);
      wrongFrom = -1;
      draw();
      return `Качка поставила на місце крок ${prefix + 1}: «${target.text}».`;
    },
  };
}
