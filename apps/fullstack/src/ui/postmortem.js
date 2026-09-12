/**
 * Blameless-постмортем після бою — і після перемоги, і після поразки.
 *
 * Формат справжнього документа: статус, вплив, таймлайн, root cause, фактори,
 * action items і погляд Staff. Таймлайн будується з журналу спроби: гравець
 * бачить власні хибні гіпотези як записи інциденту, без звинувачень, з
 * поясненням, чому гіпотеза не підтвердилась.
 */

import { CODEX } from "../data/codex.js";
import { LADDER_AXES } from "../data/grades.js";
import { attemptSummary } from "../game/boss.js";
import { el, button, paragraphs, section, codexLink, chip, notice } from "./widgets.js";

function timelineText(entry, boss) {
  const phase = boss.phases[entry.phase];
  switch (entry.type) {
    case "start":
      return { tone: "warn", text: `Алерт: ${entry.text}` };
    case "mistake":
      return { tone: "bad", text: `Гіпотеза не підтвердилась (${phase?.title ?? "фаза"}): ${entry.text}` };
    case "hint":
      return { tone: "info", text: `Залучено досвідченого колегу: «${entry.text}»` };
    case "tool":
      return { tone: "info", text: `Використано інструмент: ${entry.text}` };
    case "clear":
      return { tone: "good", text: `Закрито фазу «${entry.text}»` };
    case "lost":
      return { tone: "bad", text: "Бюджет помилок вичерпано — інцидент ескалював до SEV-1" };
    case "won":
      return { tone: "good", text: "Сервіс відновлено, метрики повернулися в норму" };
    default:
      return { tone: "", text: entry.text };
  }
}

export function renderPostmortem(host, { boss, attempt, won, promotion, ctx, onRetry }) {
  const summary = attemptSummary(attempt);
  const doc = el("article", "panel postmortem");

  const head = el("header", "postmortem__head");
  head.append(
    el("span", "postmortem__kicker", "Blameless-постмортем"),
    el("h1", "postmortem__title", won ? `Інцидент закрито: ${boss.title}` : `Інцидент ескалював: ${boss.title}`),
  );
  const meta = el("div", "row postmortem__meta");
  meta.append(
    chip(won ? "Статус: resolved" : "Статус: escalated", won ? "good" : "bad"),
    chip(`Бюджет: витрачено ${summary.spent} з ${attempt.maxBudget}`),
    chip(`Хибних гіпотез: ${summary.mistakes}`),
    chip(`Підказок: ${summary.hints}`),
    chip(`Інструментів: ${summary.tools}`),
    chip(`Фаз закрито: ${summary.cleared} з ${boss.phases.length}`),
  );
  head.append(meta);
  doc.append(head);

  if (promotion) {
    const ceremony = el("section", "postmortem__promotion");
    ceremony.append(el("h2", "", `🎖 Підвищення: ${promotion.title}`));
    ceremony.append(el("p", "", "Ви провели команду через складний інцидент і поводилися як інженер наступного рівня. Ось що тепер очікують від вас:"));
    const table = el("dl", "postmortem__ladder");
    for (const axis of LADDER_AXES) table.append(el("dt", "", axis.label), el("dd", "", promotion.ladder[axis.id]));
    ceremony.append(table);
    doc.append(ceremony);
  } else if (won) {
    doc.append(notice(`Титул: ${boss.reward.title}`, "good"));
  }

  const pm = boss.postmortem;
  const sum = section("Підсумок");
  sum.append(...paragraphs(pm.summary));
  doc.append(sum);

  const timeline = section("Таймлайн");
  const list = el("ol", "postmortem__timeline");
  attempt.log.forEach((entry, index) => {
    const { tone, text } = timelineText(entry, boss);
    const item = el("li", "postmortem__event");
    item.dataset.tone = tone;
    item.append(el("span", "postmortem__time", `T+${index}`), el("span", "", text));
    list.append(item);
  });
  timeline.append(list);
  doc.append(timeline);

  const root = section("Root cause");
  root.append(...paragraphs(pm.rootCause));
  doc.append(root);

  const contributing = section("Що посилило інцидент");
  const cList = el("ul", "");
  for (const item of pm.contributing) cList.append(el("li", "", item));
  contributing.append(cList);
  doc.append(contributing);

  const actions = section("Action items");
  const aList = el("ul", "postmortem__actions");
  for (const item of pm.actionItems) aList.append(el("li", "", `☐ ${item}`));
  actions.append(aList);
  doc.append(actions);

  const staff = section("Як це побачив би Staff");
  staff.classList.add("postmortem__staff");
  staff.append(...paragraphs(pm.staffView));
  doc.append(staff);

  if (!won) {
    const phase = boss.phases[Math.min(attempt.phase, boss.phases.length - 1)];
    const retry = section("Перед наступною спробою");
    retry.append(
      ...paragraphs(
        `Інцидент зупинився на фазі «${phase.title}». Перечитайте статті нижче й поверніться — бос нікуди не дінеться, а рівні акту можна переграти, щоб відкрити інструменти.`,
      ),
    );
    doc.append(retry);
  }

  const read = section("Почитати");
  const refs = [...new Set([...(boss.codexRefs ?? []), "postmortem"])];
  for (const ref of refs) read.append(codexLink(ctx, ref, CODEX[ref]?.title));
  doc.append(read);

  const foot = el("div", "row postmortem__foot");
  foot.append(
    button(won ? "Переграти інцидент" : "Спробувати ще раз", { variant: won ? "" : "danger", onClick: onRetry }),
    button("На мапу", { variant: "primary", onClick: () => ctx.go("map") }),
    button("Аркуш героя", { onClick: () => ctx.go("hero") }),
  );
  doc.append(foot);
  host.append(doc);
}
