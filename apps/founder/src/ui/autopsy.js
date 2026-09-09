/**
 * Розтин.
 *
 * Заголовок екрана — не причина, а місяць, у якому все вирішилося. Причина
 * зазвичай очевидна заднім числом; цінність має саме відстань між моментом
 * рішення і моментом наслідку, бо в цій відстані й ховається урок.
 *
 * Дві секції, яких немає в інших іграх монорепи:
 *   «Чому цього не було видно» — ризики, що спрацювали тоді, коли рівень
 *   аналітики не дозволяв побачити відповідне число;
 *   контрфактуал — та сама партія, той самий сід, але гра за підказками.
 */

import { el, modal } from "@edu/pixel-ui";
import { timeline } from "./widgets.js";
import { openCodex } from "./codex.js";
import { ACTIONS_BY_ID } from "../data/actions.data.js";
import { LEVELS } from "../game/analytics.js";
import { replayHinted } from "../game/strategy.js";
import { MONTH_NAMES } from "./monthPanel.js";

const money = (value) => `$${Math.round(value).toLocaleString("uk-UA")}`;

export function openAutopsy({ state, onRestart }) {
  const verdict = state.verdict;
  if (!verdict) return;

  const won = verdict.code === "win_salary" || verdict.code === "sold";
  const dialog = modal({ title: verdict.cause, wide: true });

  dialog.body.append(el("p", "autopsy__lead", verdict.reason));
  dialog.body.append(buildNumbers(state));

  if (!won && verdict.chain?.length) {
    dialog.body.append(buildDecision(verdict));
    dialog.body.append(buildChain(verdict));
  }

  if (verdict.invisible?.length) {
    dialog.body.append(buildInvisible(verdict));
  }

  if (!won && verdict.remedyIds?.length) {
    dialog.body.append(buildRemedies(verdict));
  }

  const counterfactual = el("section", "autopsy__section");
  counterfactual.append(el("h3", "autopsy__heading", "А якби грати за підказками"));
  counterfactual.append(el("p", "autopsy__text", "Рахуємо ту саму партію…"));
  dialog.body.append(counterfactual);

  const again = el("button", "btn btn--primary", "Почати заново");
  again.type = "button";
  again.addEventListener("click", () => {
    dialog.hide();
    onRestart?.();
  });
  dialog.foot.append(again);

  dialog.show();

  // Переграємо наживо: шар моделі не має DOM, і 36 ходів чистої арифметики
  // рахуються за мілісекунди — тому таблиця заздалегідь не потрібна.
  // Переграємо в наступному кадрі, щоб модальне вікно встигло з'явитися.
  requestAnimationFrame(() => {
    try {
      const result = replayHinted({ scenarioId: state.scenarioId, seed: state.startSeed ?? 1 });
      counterfactual.replaceChildren(el("h3", "autopsy__heading", "А якби грати за підказками"));
      counterfactual.append(
        el(
          "p",
          "autopsy__text",
          `Той самий сценарій, той самий сід, ті самі випадковості — але щомісяця робити рівно те, що гра позначала важливим: ${money(
            result.mrr,
          )} MRR і ${result.customers} клієнтів на ${result.months}-му місяці${
            result.verdict ? `, фінал — «${result.verdict.cause}»` : ""
          }.`,
        ),
      );
      counterfactual.append(
        el(
          "p",
          "autopsy__text autopsy__text--muted",
          "Це не «правильна» гра — це найобережніша з можливих. Підказки не знають вашої ідеї й не вміють ризикувати; вони лише не дають пропустити те, що пропускають майже всі.",
        ),
      );
    } catch {
      counterfactual.replaceChildren();
    }
  });
}

function buildNumbers(state) {
  const box = el("section", "autopsy__numbers");
  const items = [
    ["Місяців прожито", String(state.monthIndex)],
    ["MRR наприкінці", money(state.biz.mrr)],
    ["Клієнтів", String(state.biz.customers)],
    ["Усього залучено", String(state.biz.cumNew)],
    ["Усього втрачено", String(state.biz.cumChurned)],
    ["Грошей на рахунку", money(state.biz.cash)],
  ];
  for (const [label, value] of items) {
    const cell = el("div", "autopsy__number");
    cell.append(el("span", "autopsy__number-label", label));
    cell.append(el("span", "autopsy__number-value", value));
    box.append(cell);
  }
  return box;
}

/** Головний екран розтину: коли це насправді вирішилося. */
function buildDecision(verdict) {
  const box = el("section", "autopsy__section");
  box.append(el("h3", "autopsy__heading", "Коли це вирішилося"));

  const first = verdict.decidedAt;
  if (first) {
    box.append(
      el(
        "p",
        "autopsy__decided",
        `${MONTH_NAMES[first.month - 1]}, рік ${first.year} — місяць ${first.monthIndex}.`,
      ),
    );
    box.append(el("p", "autopsy__text", first.text));
  }

  const last = verdict.lastChance;
  if (last && last.monthIndex !== first?.monthIndex) {
    box.append(el("h4", "autopsy__subheading", "Останній момент, коли ще можна було звернути"));
    box.append(
      el(
        "p",
        "autopsy__text",
        `${MONTH_NAMES[last.month - 1]}, рік ${last.year}. ${last.text}`,
      ),
    );
  }

  return box;
}

function buildChain(verdict) {
  const box = el("section", "autopsy__section");
  box.append(el("h3", "autopsy__heading", "Хронологія"));
  box.append(
    timeline({
      items: verdict.chain.map((marker, index) => ({
        when: marker.until
          ? `міс. ${marker.monthIndex}–${marker.until}`
          : `міс. ${marker.monthIndex}`,
        text: marker.text,
        tone: "bad",
        pivot: index === 0,
        tag: index === 0 ? "початок" : marker.count > 1 ? `${marker.count} міс поспіль` : "",
      })),
    }),
  );
  return box;
}

/** Те, заради чого в грі взагалі є рівні аналітики. */
function buildInvisible(verdict) {
  const box = el("section", "autopsy__section autopsy__section--invisible");
  box.append(el("h3", "autopsy__heading", "Чому цього не було видно"));
  box.append(
    el(
      "p",
      "autopsy__text",
      "Ці попередження спрацювали в місяці, коли ваш рівень аналітики не дозволяв побачити число, що за ними стоїть. Проблема була, дані існували, а ви бачили лише підсумок.",
    ),
  );

  for (const marker of verdict.invisible.slice(0, 5)) {
    const item = el("div", "autopsy__invisible");
    item.append(
      el(
        "span",
        "autopsy__invisible-when",
        `місяць ${marker.monthIndex}${marker.until ? `–${marker.until}` : ""}`,
      ),
    );
    item.append(el("p", "autopsy__text", marker.text));
    item.append(
      el(
        "p",
        "autopsy__text autopsy__text--muted",
        `Щоб побачити це число, потрібен був рівень «${LEVELS[marker.needsLevel].name}». У вас був «${
          LEVELS[marker.levelAtTime].name
        }».`,
      ),
    );
    box.append(item);
  }
  return box;
}

/** Поради беруться з живих карток дій, тому не можуть розійтися з грою. */
function buildRemedies(verdict) {
  const box = el("section", "autopsy__section");
  box.append(el("h3", "autopsy__heading", "Що треба було робити"));

  for (const id of verdict.remedyIds) {
    const action = ACTIONS_BY_ID[id];
    if (!action) continue;
    const item = el("div", "autopsy__remedy");
    item.append(el("h4", "autopsy__subheading", action.label));
    item.append(el("p", "autopsy__text", action.why));
    if (action.codexRef) {
      const link = el("button", "btn btn--ghost", "Довідник");
      link.type = "button";
      link.addEventListener("click", () => openCodex(action.codexRef));
      item.append(link);
    }
    box.append(item);
  }
  return box;
}
