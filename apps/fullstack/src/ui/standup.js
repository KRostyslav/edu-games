/**
 * Стендап — щоденна сесія інтервального повторення (Leitner).
 *
 * Вся логіка розкладу — у @edu/study-kit, тут лише показ і запис. Сесія —
 * знімок на момент відкриття: картка, на яку відповіли, не зникає з-під курсора.
 * Режим «Теми» — тренування без впливу на розклад: розклад має відображати
 * пам'ять, а не старанність у конкретний вечір.
 */

import "./standup.css";
import {
  dueCards,
  dueCount,
  newCardsLeft,
  answerCard,
  nextStreak,
  currentStreak,
  nextDue,
  topicProgress,
  boxStats,
  dayNumber,
  INTERVALS,
} from "@edu/study-kit";
import { CARDS } from "../data/content.js";
import { CODEX, CODEX_GROUPS } from "../data/codex.js";
import { el, button, chip, notice, meter, plural } from "./widgets.js";

export function mountStandup(host, ctx, params) {
  const { store } = ctx;
  const page = el("div", "page standup");
  const today = dayNumber();

  const head = el("div", "page__head");
  const titles = el("div");
  titles.append(
    el("h1", "page__title", "Стендап"),
    el("p", "page__lead", "П'ять хвилин щодня. Правильна відповідь відсуває картку на довше, помилка — повертає на завтра."),
  );
  head.append(titles);
  page.append(head);

  const tabs = el("div", "tabs standup__tabs");
  const body = el("div", "standup__body");
  page.append(tabs, body);
  host.append(page);

  const tab = params.tab === "topics" ? "topics" : "today";
  for (const [id, label] of [
    ["today", "Сьогодні"],
    ["topics", "Теми"],
  ]) {
    const node = button(label, { onClick: () => ctx.go("standup", id === "today" ? {} : { tab: id }) });
    node.className = "tabs__tab";
    if (id === tab) node.setAttribute("aria-selected", "true");
    tabs.append(node);
  }

  if (tab === "topics") renderTopics();
  else renderToday();

  // ─────────────────────────── сьогодні ───────────────────────────

  function renderToday() {
    const state = store.state;
    const queue = dueCards(state.quiz.boxes, CARDS, today, { newLimit: newCardsLeft(state.quiz.boxes, CARDS, today) });
    const streak = currentStreak(state.quiz, today);
    const stats = boxStats(state.quiz.boxes, CARDS);
    const top = el("div", "row standup__meta");
    top.append(chip(`🔥 Серія: ${streak} ${plural(streak, "день", "дні", "днів")}`, streak >= 3 ? "good" : ""), chip(`Освоєно: ${stats.mastered} з ${CARDS.length}`), chip(`Нових: ${stats.new}`));
    body.append(top);
    if (!queue.length) {
      const next = nextDue(state.quiz.boxes, CARDS, today);
      body.append(
        notice(
          next
            ? `На сьогодні все. Наступні ${next.count} ${plural(next.count, "картка", "картки", "карток")} — через ${next.day - today} ${plural(next.day - today, "день", "дні", "днів")}.`
            : "Карток на сьогодні немає.",
          "good",
        ),
        button("Потренувати теми →", { onClick: () => ctx.go("standup", { tab: "topics" }) }),
      );
      return;
    }
    runSession(queue, { record: true });
  }

  function runSession(queue, { record, onDone }) {
    const box = el("div", "panel standup__session");
    body.append(box);
    let index = 0;
    let correct = 0;

    function show() {
      box.replaceChildren();
      if (index >= queue.length) return finish();
      const card = queue[index];
      box.append(meter({ label: record ? "Сесія" : "Тренування", value: index, max: queue.length, text: `${index + 1} з ${queue.length}` }));
      const topic = button(`📖 ${CODEX[card.topic]?.title ?? card.topic}`, { variant: "ghost", onClick: () => ctx.openCodex(card.topic) });
      topic.classList.add("standup__topic");
      box.append(topic);
      if (card.kind === "mcq") mcq(card);
      else flash(card);
    }

    function after(card, ok, feedbackBox) {
      if (ok) correct += 1;
      if (record) {
        const prev = store.state.quiz.boxes[card.id];
        const entry = answerCard(prev, ok, today);
        store.update((state) => {
          state.quiz.boxes[card.id] = entry;
          Object.assign(state.quiz, nextStreak(state.quiz, today));
        });
        const days = INTERVALS[entry.box - 1];
        feedbackBox.append(el("p", "muted standup__move", `Коробка ${prev?.box ?? "нова"} → ${entry.box} · ${days ? `повтор через ${days} ${plural(days, "день", "дні", "днів")}` : "повтор ще сьогодні"}`));
      }
      const next = button(index + 1 < queue.length ? "Далі →" : "Завершити", { variant: "primary", onClick: () => ((index += 1), show()) });
      feedbackBox.append(next);
      next.focus();
    }

    function mcq(card) {
      box.append(el("p", "standup__q", card.q));
      const options = el("div", "incident__options");
      const feedback = el("div", "kind__feedback");
      card.options.forEach((text, i) => {
        const node = button(text, {
          onClick: () => {
            for (const other of options.children) other.disabled = true;
            const ok = i === card.answer;
            node.dataset.state = ok ? "right" : "wrong";
            options.children[card.answer].dataset.state = "right";
            feedback.append(notice(`${ok ? "Так." : "Ні."} ${card.explain}`, ok ? "good" : "bad"));
            after(card, ok, feedback);
          },
        });
        node.classList.add("incident__option");
        options.append(node);
      });
      box.append(options, feedback);
    }

    function flash(card) {
      box.append(el("p", "standup__q", card.front), el("p", "muted", "Спершу відповідайте вголос або подумки, потім відкрийте."));
      const feedback = el("div", "kind__feedback");
      const reveal = button("Показати відповідь", {
        variant: "primary",
        onClick: () => {
          reveal.remove();
          feedback.append(notice(card.back, "info"));
          const grade = el("div", "row");
          grade.append(
            button("✓ Знав", { variant: "primary", onClick: () => (grade.remove(), after(card, true, feedback)) }),
            button("✗ Не знав", { onClick: () => (grade.remove(), after(card, false, feedback)) }),
          );
          feedback.append(grade);
        },
      });
      box.append(reveal, feedback);
    }

    function finish() {
      box.append(notice(`Готово: ${correct} з ${queue.length} правильно.`, correct === queue.length ? "good" : "info"));
      if (record) {
        const left = dueCount(store.state.quiz.boxes, CARDS, today, { newLimit: newCardsLeft(store.state.quiz.boxes, CARDS, today) });
        if (left) box.append(button(`Ще сесія (${left})`, { variant: "primary", onClick: () => ctx.go("standup") }));
      }
      box.append(button("На мапу", { onClick: () => ctx.go("map") }));
      onDone?.();
    }

    show();
  }

  // ─────────────────────────── теми ───────────────────────────

  function renderTopics() {
    const state = store.state;
    body.append(el("p", "muted", "Тренування за темою не змінює розклад повторень — це вільна практика."));
    for (const group of CODEX_GROUPS) {
      const ids = group.ids.filter((id) => CARDS.some((card) => card.topic === id));
      if (!ids.length) continue;
      const panel = el("section", "panel standup__group");
      panel.append(el("h3", "section__title", group.title));
      const grid = el("div", "standup__topics");
      for (const id of ids) {
        const p = topicProgress(state.quiz.boxes, CARDS, id);
        const item = el("div", "standup__topic-card");
        item.append(el("strong", "", CODEX[id].title), meter({ label: "Освоєно", value: p.mastered, max: p.total }));
        item.append(
          button("Тренувати", {
            onClick: () => {
              body.replaceChildren();
              runSession(
                CARDS.filter((card) => card.topic === id),
                { record: false },
              );
            },
          }),
        );
        grid.append(item);
      }
      panel.append(grid);
      body.append(panel);
    }
  }

  return { unmount() {} };
}
