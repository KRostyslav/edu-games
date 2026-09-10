/**
 * Дві модалки-розвилки: пропозиція про купівлю і досягнута мета.
 *
 * Обидві перетворюють число на рішення: показують не «вам пропонують стільки-то»,
 * а «стільки-то — це N місяців вашого теперішнього прибутку». Без такого
 * перерахунку сума нічого не означає.
 */

import { el, modal } from "@edu/pixel-ui";
import { openCodex } from "./codex.js";
import { money } from "../game/review.js";
import { TOTAL_MONTHS } from "../game/model.js";

export function openOffer({ state, onAccept, onDecline }) {
  const pending = state.pending;
  if (!pending) return;

  const dialog = modal({ title: "Пропозиція про купівлю", wide: true });
  let resolved = false;

  dialog.body.append(
    el(
      "p",
      "intro",
      `Вам написав покупець мікро-SaaS і пропонує ${money(pending.offer)} за проєкт. Відповісти треба до наступного місяця — мовчання зарахується як відмова.`,
    ),
  );

  const monthsLeft = Math.max(0, TOTAL_MONTHS - state.monthIndex);
  const profit = Math.max(0, state.biz.netProfit);
  const rows = [
    [
      "Скільки це вашого прибутку",
      profit > 0
        ? `${Math.round(pending.offer / profit)} місяців за теперішніх ${money(profit)} чистими`
        : "Прибутку зараз немає, тому порівнювати нема з чим",
    ],
    [
      "Скільки це зарплат",
      `${Math.round(pending.offer / Math.max(1, state.biz.salaryTarget))} місяців тієї зарплати, яку ви намагаєтеся замінити`,
    ],
    [
      "Якщо нічого не зміниться",
      `До 36-го місяця лишилося ${monthsLeft} — за теперішнього прибутку це ще ${money(profit * monthsLeft)}`,
    ],
  ];

  const table = el("div", "offer");
  for (const [label, text] of rows) {
    const row = el("div", "offer__row");
    row.append(el("span", "offer__label", label));
    row.append(el("span", "offer__text", text));
    table.append(row);
  }
  dialog.body.append(table);

  dialog.body.append(
    el(
      "p",
      "intro",
      "Продаж — нормальний фінал, а не капітуляція. Питання лише в тому, чи виросте проєкт більше, ніж пропонують зараз, і чи хочете ви ще два роки цим займатися.",
    ),
  );

  const codex = el("button", "btn btn--ghost", "Як оцінюють такі проєкти →");
  codex.type = "button";
  codex.addEventListener("click", () => openCodex("exit"));
  dialog.body.append(codex);

  const accept = el("button", "btn btn--primary", `Продати за ${money(pending.offer)}`);
  accept.type = "button";
  accept.addEventListener("click", () => {
    resolved = true;
    dialog.hide();
    onAccept?.();
  });

  const decline = el("button", "btn", "Відмовитися й будувати далі");
  decline.type = "button";
  decline.addEventListener("click", () => {
    resolved = true;
    dialog.hide();
    onDecline?.();
  });

  dialog.foot.append(accept, decline);
  dialog.show();

  // Esc і клік по тлу — це теж відповідь. Пропозиція не має лишитися невирішеною:
  // інакше стан зависає, і наступний хід не знає, що з нею робити.
  const overlay = dialog.overlay;
  const observer = new MutationObserver(() => {
    if (!overlay.isConnected && !resolved) {
      resolved = true;
      observer.disconnect();
      onDecline?.();
    }
  });
  observer.observe(document.body, { childList: true });
}

/**
 * Мету досягнуто. Фінал уже забезпечений — але після цього ще можна вигоріти
 * або лишитися без грошей, і сказати про це чесніше, ніж вдавати, що
 * продовження безкоштовне.
 */
export function openGoalReached({ state, onFinish, onContinue }) {
  const dialog = modal({ title: "Мету досягнуто", wide: false });

  dialog.body.append(
    el(
      "p",
      "intro",
      `Шість місяців поспіль продукт приносив більше за ${money(state.biz.salaryTarget)} чистими — після комісій, податків та інфраструктури. Це і є та мета, заради якої все затівалося.`,
    ),
  );
  dialog.body.append(
    el(
      "p",
      "intro",
      `Зараз ${state.monthIndex}-й місяць із ${TOTAL_MONTHS}. Партію можна завершити тут або дограти до кінця й побачити, куди все прийде.`,
    ),
  );
  dialog.body.append(
    el(
      "p",
      "intro intro--warn",
      "Фінал уже забезпечений: досягнуте не скасовується, навіть якщо серія потім зламається. Але вигоріти чи лишитися без грошей за решту місяців усе ще можна — тож продовження не безкоштовне.",
    ),
  );

  const finish = el("button", "btn btn--primary", "Зупинитися тут");
  finish.type = "button";
  finish.addEventListener("click", () => {
    dialog.hide();
    onFinish?.();
  });

  const play = el("button", "btn", `Грати до ${TOTAL_MONTHS}-го місяця`);
  play.type = "button";
  play.addEventListener("click", () => {
    dialog.hide();
    onContinue?.();
  });

  dialog.foot.append(finish, play);
  dialog.show();
}
