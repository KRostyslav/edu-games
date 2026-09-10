/**
 * Секції фіналу, які пояснюють ПРОВАЛ, а не підсумок: коли це вирішилося, чому
 * цього не було видно, і чим би скінчилася та сама партія за підказками.
 *
 * Винесені окремо, щоб `finale.js` не розповзався: це три самостійні розділи
 * з власною логікою, які до того ж рендеряться не завжди.
 */

import { el } from "@edu/pixel-ui";
import { timeline } from "./widgets.js";
import { openCodex } from "./codex.js";
import { ACTIONS_BY_ID } from "../data/actions.data.js";
import { LEVELS } from "../game/analytics.js";
import { replayHinted } from "../game/strategy.js";
import { money } from "../game/review.js";
import { MONTH_NAMES } from "./monthPanel.js";

export function buildAftermath({ page, state, review }) {
  const verdict = state.verdict;
  if (!verdict) return;

  if (verdict.chain?.length) {
    page.append(buildDecision(verdict));
    page.append(buildChain(verdict));
  }
  if (verdict.invisible?.length) page.append(buildInvisible(verdict));
  if (verdict.remedyIds?.length && review.headline.kind !== "win") {
    page.append(buildRemedies(verdict));
  }
  page.append(buildCounterfactual(state, review));
}

/** Заголовок — не причина, а місяць. Цінність має відстань між рішенням і наслідком. */
function buildDecision(verdict) {
  const box = section("Коли це вирішилося");
  const first = verdict.decidedAt;

  box.append(
    el("p", "finale__decided", `${MONTH_NAMES[first.month - 1]}, рік ${first.year} — місяць ${first.monthIndex}.`),
  );
  box.append(el("p", "finale__note", first.text));

  const last = verdict.lastChance;
  if (last && last.monthIndex !== first.monthIndex) {
    box.append(el("h3", "finale__subheading", "Останній момент, коли ще можна було звернути"));
    box.append(
      el("p", "finale__note", `${MONTH_NAMES[last.month - 1]}, рік ${last.year}. ${last.text}`),
    );
  }
  return box;
}

function buildChain(verdict) {
  const box = section("Хронологія");
  box.append(
    timeline({
      items: verdict.chain.map((marker, index) => ({
        when: marker.until ? `міс. ${marker.monthIndex}–${marker.until}` : `міс. ${marker.monthIndex}`,
        text: marker.text,
        tone: "bad",
        pivot: index === 0,
        tag: index === 0 ? "початок" : marker.count > 1 ? `${marker.count} міс поспіль` : "",
      })),
    }),
  );

  if (verdict.chains?.length > 1) {
    const other = verdict.chains.filter((entry) => entry.family !== verdict.primaryFamily);
    box.append(
      el(
        "p",
        "finale__note",
        `Паралельно тягнулося ще ${other.length === 1 ? "одне" : other.length} джерело проблем — вони рідко приходять по одному.`,
      ),
    );
  }
  return box;
}

/** Те, заради чого в грі взагалі є рівні аналітики. */
function buildInvisible(verdict) {
  const box = section("Чому цього не було видно");
  box.dataset.highlight = "true";
  box.append(
    el(
      "p",
      "finale__note",
      "Ці попередження спрацювали в місяці, коли ваш рівень аналітики не дозволяв побачити число, що за ними стоїть. Проблема була, дані існували, а ви бачили лише підсумок.",
    ),
  );

  for (const marker of verdict.invisible.slice(0, 5)) {
    const node = el("div", "invisible");
    node.append(
      el("span", "invisible__when", `місяць ${marker.monthIndex}${marker.until ? `–${marker.until}` : ""}`),
    );
    node.append(el("p", "finale__note", marker.text));
    node.append(
      el(
        "p",
        "finale__muted",
        `Щоб побачити це число, потрібен був рівень «${LEVELS[marker.needsLevel].name}». У вас був «${LEVELS[marker.levelAtTime].name}».`,
      ),
    );
    box.append(node);
  }
  return box;
}

/** Поради беруться з живих карток дій — тому не можуть розійтися з грою. */
function buildRemedies(verdict) {
  const box = section("Що треба було робити");
  for (const id of verdict.remedyIds) {
    const action = ACTIONS_BY_ID[id];
    if (!action) continue;
    const node = el("div", "remedy");
    node.append(el("h3", "finale__subheading", action.label));
    node.append(el("p", "finale__note", action.why));
    if (action.codexRef) {
      const link = el("button", "btn btn--ghost", "Довідник →");
      link.type = "button";
      link.addEventListener("click", () => openCodex(action.codexRef));
      node.append(link);
    }
    box.append(node);
  }
  return box;
}

/**
 * Контрфактуал. Переграємо ту саму партію тим самим сідом, роблячи все за
 * підказками — і показуємо, чим це скінчилося. Шар моделі не має DOM, тому
 * 36 ходів чистої арифметики рахуються за мілісекунди.
 */
function buildCounterfactual(state, review) {
  const box = section("А якби грати за підказками");
  const placeholder = el("p", "finale__note", "Рахуємо ту саму партію…");
  box.append(placeholder);

  requestAnimationFrame(() => {
    try {
      const result = replayHinted({ scenarioId: state.scenarioId, seed: state.startSeed ?? 1 });
      const yours = review.headline;

      const table = el("div", "compare");
      const rows = [
        ["MRR наприкінці", money(state.biz.mrr), money(result.mrr)],
        ["Клієнтів", String(state.biz.customers), String(result.customers)],
        ["Місяців зіграно", String(yours.endedAt), String(result.months)],
        ["Фінал", yours.cause, result.verdict?.cause ?? "—"],
      ];

      const header = el("div", "compare__row compare__row--head");
      header.append(el("span", "", ""), el("span", "", "Ваша партія"), el("span", "", "За підказками"));
      table.append(header);

      for (const [label, mine, hinted] of rows) {
        const row = el("div", "compare__row");
        row.append(el("span", "compare__label", label));
        row.append(el("span", "compare__mine", mine));
        row.append(el("span", "compare__hinted", hinted));
        table.append(row);
      }

      placeholder.replaceWith(table);
      box.append(
        el(
          "p",
          "finale__muted",
          "Це не «правильна» гра — це найобережніша з можливих. Підказки не знають вашої ідеї й не вміють ризикувати; вони лише не дають пропустити те, що пропускають майже всі.",
        ),
      );
    } catch {
      placeholder.remove();
    }
  });

  return box;
}

function section(title) {
  const box = el("section", "finale__section");
  box.append(el("h2", "finale__heading", title));
  return box;
}
