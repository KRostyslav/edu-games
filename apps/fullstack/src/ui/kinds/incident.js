/**
 * Розслідування інциденту: алерт, сигнали й кілька кроків «гіпотеза → дія →
 * перевірка». Хибний варіант не просто «неправильно» — він показує, що
 * сталося б на проді, якби команда так вирішила.
 */

import { renderSignals } from "./signals.js";
import { el, button, notice } from "../widgets.js";

export function mountIncident(host, { payload, onMistake, onSolved }) {
  const root = el("div", "kind incident");
  root.append(el("div", "incident__alert", `🚨 ${payload.alert}`));
  root.append(renderSignals(payload.signals));

  const history = el("ol", "incident__history");
  const stage = el("div", "incident__stage");
  root.append(history, stage);

  let stepIndex = 0;
  let solved = false;
  const disabled = new Map();

  function renderStep() {
    const step = payload.steps[stepIndex];
    stage.replaceChildren();
    const card = el("div", "incident__step");
    card.append(el("p", "incident__q", `Крок ${stepIndex + 1} з ${payload.steps.length}. ${step.q}`));
    const options = el("div", "incident__options");
    const feedback = el("div", "kind__feedback");
    const blocked = disabled.get(stepIndex) ?? new Map();
    disabled.set(stepIndex, blocked);
    step.options.forEach((option, index) => {
      const node = button(option.text, { onClick: () => choose(option, index, feedback, node) });
      node.classList.add("incident__option");
      if (blocked.has(index)) {
        node.disabled = true;
        node.dataset.state = blocked.get(index);
      }
      options.append(node);
    });
    card.append(options, feedback);
    stage.append(card);
  }

  function choose(option, index, feedback, node) {
    if (solved) return;
    const blocked = disabled.get(stepIndex);
    if (!option.correct) {
      blocked.set(index, "wrong");
      node.disabled = true;
      node.dataset.state = "wrong";
      feedback.replaceChildren(notice(option.why, "bad"));
      onMistake(`«${option.text}» — ${option.why}`);
      return;
    }
    node.dataset.state = "right";
    for (const other of node.parentElement.children) other.disabled = true;
    const done = el("li", "incident__done");
    done.append(el("strong", "", payload.steps[stepIndex].q), el("span", "", ` → ${option.text}`));
    const last = stepIndex === payload.steps.length - 1;
    feedback.replaceChildren(
      notice(option.why, "good"),
      button(last ? "Завершити розслідування" : "Далі →", {
        variant: "primary",
        onClick: () => {
          history.append(done);
          if (last) {
            solved = true;
            stage.replaceChildren(notice("Інцидент розібрано: причину знайдено, дію обрано, результат перевірено.", "good"));
            onSolved({ bonus: false });
          } else {
            stepIndex += 1;
            renderStep();
          }
        },
      }),
    );
  }

  renderStep();
  host.append(root);

  return {
    unmount() {},
    assist() {
      if (solved) return null;
      const step = payload.steps[stepIndex];
      const blocked = disabled.get(stepIndex);
      const index = step.options.findIndex((option, i) => !option.correct && !blocked.has(i));
      if (index < 0) return null;
      blocked.set(index, "duck");
      renderStep();
      return `Качка відкинула варіант «${step.options[index].text}».`;
    },
  };
}
