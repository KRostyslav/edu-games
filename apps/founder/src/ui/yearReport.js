/**
 * Річний звіт.
 *
 * Головний прийом — розклад на множники, відсортований за зростанням:
 * найнижчий множник і є тим, що вас обмежує. Дивитися на середні числа
 * марно, бо в добутку вирішує найслабший.
 *
 * Другий прийом — стеля MRR. Це не прогноз, а арифметика рівноваги, і саме
 * вона відповідає на питання «а чи достатньо того, що я роблю».
 */

import { el, modal, barChart } from "@edu/pixel-ui";
import { trialFactors, paidFactors, churnFactors } from "../game/funnel.js";
import { isVisible, LEVELS } from "../game/analytics.js";
import { openCodex } from "./codex.js";

const money = (value) => `$${Math.round(value).toLocaleString("uk-UA")}`;
const round2 = (value) => Math.round(value * 100) / 100;

export function openYearReport({ state, onContinue }) {
  const dialog = modal({ title: `Підсумок ${state.year - 1 || state.year}-го року`, wide: true });
  const level = state.analytics.level;

  dialog.body.append(buildHeadline(state));

  // ── Хто до вас доходить ──
  dialog.body.append(
    buildFactors({
      title: "Хто з відвідувачів пробує продукт",
      lead: `Конверсія у тріал — добуток цих множників. Найнижчий і є обмежувачем: підняти його дешевше, ніж покращувати решту.`,
      factors: trialFactors(state),
    }),
  );

  // ── Хто платить ──
  dialog.body.append(
    buildFactors({
      title: "Хто з них починає платити",
      lead: "Тут єдиний множник, що переходить одиницю, — відповідність проблемі. Його не можна зробити за місяць і нічим не можна замінити.",
      factors: paidFactors(state),
    }),
  );

  // ── Чому йдуть ──
  dialog.body.append(
    buildFactors({
      title: "Чому клієнти йдуть",
      lead: "Тут навпаки: чим більший множник, тим гірше. Найбільший — головна причина відтоку.",
      factors: churnFactors(state),
      descending: true,
    }),
  );

  // ── Стеля ──
  dialog.body.append(buildCeiling(state, level));

  // ── Графік року ──
  const months = state.history.slice(-12);
  if (months.length > 1) {
    const chart = el("section", "report__section");
    chart.append(el("h3", "report__heading", "MRR за місяцями"));
    chart.append(
      barChart({
        items: months.map((entry) => ({
          label: `міс ${entry.monthIndex}`,
          value: Math.round(entry.mrr),
          tone: entry.mrr > 0 ? "good" : undefined,
        })),
        unit: " $",
      }),
    );
    chart.append(
      el(
        "p",
        "report__note",
        `Усього залучено ${state.biz.cumNew}, втрачено ${state.biz.cumChurned}. Різниця між цими числами — це і є ваш бізнес.`,
      ),
    );
    dialog.body.append(chart);
  }

  const next = el("button", "btn btn--primary", "Далі");
  next.type = "button";
  next.addEventListener("click", () => {
    dialog.hide();
    onContinue?.();
  });
  dialog.foot.append(next);

  dialog.show();
  next.focus();
}

function buildHeadline(state) {
  const box = el("section", "report__headline");
  const items = [
    ["MRR", money(state.biz.mrr)],
    ["Клієнтів", String(state.biz.customers)],
    ["Чистий прибуток", money(state.biz.netProfit)],
    ["Гроші на рахунку", money(state.biz.cash)],
    ["Сили", `${Math.round(state.founder.energy)}/100`],
  ];
  for (const [label, value] of items) {
    const cell = el("div", "report__cell");
    cell.append(el("span", "report__cell-label", label));
    cell.append(el("span", "report__cell-value", value));
    box.append(cell);
  }
  return box;
}

/** Множники, відсортовані так, щоб обмежувач опинився першим. */
function buildFactors({ title, lead, factors, descending = false }) {
  const box = el("section", "report__section");
  box.append(el("h3", "report__heading", title));
  box.append(el("p", "report__note", lead));

  const rows = Object.values(factors).sort((a, b) =>
    descending ? b.value - a.value : a.value - b.value,
  );

  const list = el("ul", "factors");
  rows.forEach((factor, index) => {
    const item = el("li", "factors__item");
    if (index === 0) item.dataset.binding = "true";

    const head = el("div", "factors__head");
    head.append(el("span", "factors__label", factor.label));
    head.append(el("span", "factors__value", `×${round2(factor.value)}`));
    item.append(head);
    item.append(el("p", "factors__why", factor.why));
    if (index === 0) {
      item.append(
        el(
          "p",
          "factors__binding",
          descending ? "Це головна причина втрат" : "Це те, що вас обмежує найсильніше",
        ),
      );
    }
    list.append(item);
  });

  box.append(list);
  return box;
}

function buildCeiling(state, level) {
  const box = el("section", "report__section report__section--ceiling");
  box.append(el("h3", "report__heading", "Стеля MRR"));

  if (!isVisible("metrics.mrrCeiling", level)) {
    box.append(
      el(
        "p",
        "report__note",
        `Це число не порахувати без рівня «${LEVELS[2].name}»: потрібно окремо знати, скільки нового MRR приходить і яка частка йде.`,
      ),
    );
    return box;
  }

  const churn = state.metrics.churnPct / 100;
  const mrrNew = state.funnel.newCustomers * state.biz.arpu;

  box.append(
    el(
      "p",
      "report__formula",
      `${money(mrrNew)} нового MRR ÷ ${Math.round(state.metrics.churnPct * 10) / 10}% відтоку = ${money(
        state.metrics.mrrCeiling,
      )}`,
    ),
  );
  box.append(
    el(
      "p",
      "report__note",
      churn > 0
        ? "Це рівень, до якого ви сходитеся, якщо нічого не зміниться. Не прогноз і не мета — арифметика рівноваги. Підняти її можна рівно двома способами: більше нового MRR або менше відтоку."
        : "Відтоку поки немає, тому стеля не рахується.",
    ),
  );

  const link = el("button", "btn btn--ghost", "Як це працює →");
  link.type = "button";
  link.addEventListener("click", () => openCodex("mrr-ceiling"));
  box.append(link);
  return box;
}
