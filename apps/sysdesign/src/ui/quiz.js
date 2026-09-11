import "./quiz.css";

/**
 * Екран «Картки»: щоденна сесія Leitner, практика за темами й статистика.
 *
 * Уся логіка розкладу — у progress/leitner.js, тут лише показ і запис
 * відповідей. Сесія — знімок черги на момент старту: якби ми перераховували
 * її після кожної відповіді, картка з помилкою (due = сьогодні) одразу
 * стрибала б назад у чергу, і сесія ніколи б не закінчувалась. Помилки
 * повертаються наступною сесією — підсумок чесно пропонує її.
 *
 * Панель перемальовується цілком (DOM крихітний), а фокус відновлюється за
 * data-focus-key: інакше разом зі знятою з DOM кнопкою фокус падав би на
 * body, і клавіатурні скорочення на корені екрана переставали б працювати.
 */

import { QUIZ } from "../data/quiz.js";
import { CODEX, CODEX_GROUPS, CODEX_IDS } from "../data/codex/index.js";
import { dayNumber } from "../progress/store.js";
import {
  INTERVALS,
  MASTERED_BOX,
  NEW_PER_DAY,
  answerCard,
  boxStats,
  currentStreak,
  dueCards,
  dueCount,
  newCardsLeft,
  nextDue,
  nextStreak,
  topicProgress,
} from "../progress/leitner.js";
import { button, chip, el, fmtPct, paragraphs } from "./widgets.js";

const TABS = [
  { id: "today", label: "Сьогодні" },
  { id: "topics", label: "Теми" },
  { id: "stats", label: "Статистика" },
];
const TAB_IDS = TABS.map((tab) => tab.id);

/** Картки теми в порядку колоди: практика йде від тестів до усного питання. */
const CARDS_BY_TOPIC = new Map();
for (const card of QUIZ) {
  if (!CODEX[card.topic]) continue;
  if (!CARDS_BY_TOPIC.has(card.topic)) CARDS_BY_TOPIC.set(card.topic, []);
  CARDS_BY_TOPIC.get(card.topic).push(card);
}

const GROUPS = CODEX_GROUPS.map((group) => ({
  group,
  topics: CODEX_IDS.filter((id) => CODEX[id].group === group && CARDS_BY_TOPIC.has(id)),
})).filter((item) => item.topics.length > 0);

const EMPTY_QUIZ = Object.freeze({ boxes: Object.freeze({}), lastDay: null, streak: 0 });

let uid = 0;

// ─────────────────────────── текст ───────────────────────────

const isObject = (value) => value != null && typeof value === "object" && !Array.isArray(value);
const topicTitle = (id) => CODEX[id]?.title ?? id;

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const cardsText = (n) => `${n} ${plural(n, "картка", "картки", "карток")}`;
const daysText = (n) => `${n} ${plural(n, "день", "дні", "днів")}`;

function whenText(days) {
  if (days <= 0) return "сьогодні ж";
  if (days === 1) return "завтра";
  return `через ${daysText(days)}`;
}

const DATE_FMT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", timeZone: "UTC" });
/** dayNumber() рахує локальну дату як дні від епохи, тож назад її читаємо в UTC. */
const dayDate = (day) => DATE_FMT.format(new Date(day * 86_400_000));

/** Що сталося з карткою — гравець має бачити механіку Leitner, а не лише «правильно». */
function moveText(result) {
  const when = result.due <= result.today ? "повторимо сьогодні ж" : `повтор ${whenText(result.due - result.today)}`;
  if (!result.correct) return result.from > 1 ? `Назад у коробку 1 · ${when}` : `Коробка 1 · ${when}`;
  if (result.from === 0) return `Нова картка → коробка ${result.to} · ${when}`;
  if (result.to === result.from) return `Коробка ${result.to} — найвища · ${when}`;
  return `Коробка ${result.from} → ${result.to} · ${when}`;
}

function boxChip(box) {
  if (!box) return chip("Нова", "info");
  return chip(`Коробка ${box}`, box >= MASTERED_BOX ? "good" : "");
}

function hintLine(parts) {
  const line = el("p", "quiz__hint");
  parts.forEach(([key, label], i) => {
    if (i > 0) line.append(" · ");
    line.append(el("kbd", "quiz__kbd", key), ` ${label}`);
  });
  return line;
}

function miniBar(ratio) {
  const track = el("span", "quiz__mini");
  track.setAttribute("aria-hidden", "true");
  const fill = el("span", "quiz__mini-fill");
  fill.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
  track.append(fill);
  return track;
}

const levelOf = ({ total, seen, mastered }) => (total > 0 && mastered === total ? "done" : seen > 0 ? "some" : "none");

// ─────────────────────────── екран ───────────────────────────

export function mountQuiz(host, ctx, params = {}) {
  const prefix = `quiz-${++uid}`;
  const view = {
    tab: "today",
    today: null, // сесія «Сьогодні»
    topic: null, // практика теми на вкладці «Теми»
  };
  let recording = false;
  let liveTimer = null;

  const quiz = () => (isObject(ctx.store.state?.quiz) ? ctx.store.state.quiz : EMPTY_QUIZ);
  const boxes = () => (isObject(quiz().boxes) ? quiz().boxes : EMPTY_QUIZ.boxes);
  const boxOf = (id) => {
    const entry = Object.hasOwn(boxes(), id) ? boxes()[id] : null;
    return Number.isFinite(entry?.box) ? Math.max(1, Math.min(5, entry.box)) : 0;
  };

  /** Скільки чекає сьогодні з урахуванням денного ліміту нових — те саме, що візьме сесія. */
  function todayDue(today = dayNumber()) {
    const table = boxes();
    return dueCount(table, QUIZ, today, { newLimit: newCardsLeft(table, QUIZ, today) });
  }

  // --- каркас ---

  const root = el("div", "page quiz");
  root.tabIndex = -1;

  const head = el("header", "page__head");
  const titles = el("div", "quiz__titles");
  titles.append(
    el("h1", "page__title", "Картки"),
    el("p", "page__lead", "Інтервальне повторення: правильна відповідь відсуває картку на довший інтервал, помилка повертає її на початок."),
  );

  const tabList = el("div", "tabs quiz__tabs");
  tabList.setAttribute("role", "tablist");
  tabList.setAttribute("aria-label", "Розділи карток");
  const panelId = `${prefix}-panel`;
  const tabNodes = new Map();
  const badge = el("span", "tabs__badge");
  badge.setAttribute("aria-hidden", "true");
  for (const tab of TABS) {
    const node = el("button", "tabs__tab quiz__tab", tab.label);
    node.type = "button";
    node.id = `${prefix}-tab-${tab.id}`;
    node.dataset.tab = tab.id;
    node.setAttribute("role", "tab");
    node.setAttribute("aria-controls", panelId);
    if (tab.id === "today") node.append(badge);
    node.addEventListener("click", () => selectTab(tab.id));
    tabNodes.set(tab.id, node);
    tabList.append(node);
  }
  head.append(titles, tabList);

  // Один живий регіон на весь час життя екрана: новостворений регіон скрінрідер пропускає.
  const live = el("div", "visually-hidden");
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");

  const panel = el("section", "quiz__panel");
  panel.id = panelId;
  panel.setAttribute("role", "tabpanel");

  root.append(head, live, panel);

  function announce(text) {
    // Очищення й пауза — щоб однаковий текст двічі поспіль теж прозвучав.
    live.textContent = "";
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      live.textContent = text;
    }, 60);
  }

  // --- сесії ---

  function newSession(kind, cards, topic = null) {
    return {
      kind,
      topic,
      cards,
      index: 0,
      phase: cards.length ? "question" : "done", // question | answered | revealed | done
      choice: null,
      results: [],
      day: dayNumber(),
    };
  }

  function buildToday() {
    const today = dayNumber();
    const table = boxes();
    return newSession("today", dueCards(table, QUIZ, today, { newLimit: newCardsLeft(table, QUIZ, today) }));
  }

  /**
   * Нерозпочату сесію перебудовуємо на кожному вході: поки гравець був на
   * «Темах», частина її карток могла вже отримати відповідь. Розпочату не
   * чіпаємо, а завершену — лише коли настав новий день.
   */
  function ensureToday() {
    const session = view.today;
    const untouched = session && session.results.length === 0 && (session.phase === "question" || session.phase === "done");
    const stale = session && session.phase === "done" && session.day !== dayNumber();
    if (!session || untouched || stale) view.today = buildToday();
  }

  function startTopic(topic, { focus = true } = {}) {
    const cards = CARDS_BY_TOPIC.get(topic);
    if (!cards) return;
    view.topic = newSession("topic", cards.slice(), topic);
    view.tab = "topics";
    ctx.setParams({ tab: "topics", topic });
    render(focus ? "card" : null);
  }

  function leaveTopic() {
    const topic = view.topic?.topic;
    view.topic = null;
    ctx.setParams({ tab: "topics" });
    render(topic ? `topic:${topic}` : null);
  }

  const activeSession = () => (view.tab === "today" ? view.today : view.tab === "topics" ? view.topic : null);

  /** Запис відповіді в коробки й серію. Повертає, що сталося з карткою. */
  function record(session, card, correct) {
    const today = dayNumber();
    let before;
    let after;
    recording = true;
    try {
      ctx.store.update((state) => {
        if (!isObject(state.quiz)) state.quiz = { boxes: {}, lastDay: null, streak: 0 };
        const q = state.quiz;
        if (!isObject(q.boxes)) q.boxes = {};
        before = Object.hasOwn(q.boxes, card.id) ? q.boxes[card.id] : undefined;
        after = answerCard(before, correct, today);
        q.boxes[card.id] = after;
        Object.assign(q, nextStreak(q, today));
      });
    } finally {
      recording = false;
    }
    const from = Number.isFinite(before?.box) ? Math.max(1, Math.min(5, before.box)) : 0;
    const result = { id: card.id, topic: card.topic, correct, from, to: after.box, due: after.due, today };
    session.results.push(result);
    return result;
  }

  function choose(index) {
    const session = activeSession();
    const card = session?.cards[session.index];
    if (!card || card.kind !== "mcq" || session.phase !== "question") return false;
    if (index < 0 || index >= card.options.length) return false;
    const result = record(session, card, index === card.answer);
    session.phase = "answered";
    session.choice = index;
    render("next");
    announce(
      result.correct
        ? `Правильно. ${moveText(result)}.`
        : `Неправильно. Правильна відповідь ${card.answer + 1}: ${card.options[card.answer]}. ${moveText(result)}.`,
    );
    return true;
  }

  function reveal() {
    const session = activeSession();
    const card = session?.cards[session.index];
    if (!card || card.kind !== "flash" || session.phase !== "question") return false;
    session.phase = "revealed";
    // Фокус на відповідь: скрінрідер одразу її прочитає.
    render("answer");
    return true;
  }

  function rate(knew) {
    const session = activeSession();
    const card = session?.cards[session.index];
    if (!card || card.kind !== "flash" || session.phase !== "revealed") return false;
    const result = record(session, card, knew);
    const done = advance(session);
    announce(`Записано: ${knew ? "знав" : "не знав"}. ${moveText(result)}.${done ? ` ${summaryText(session)}` : ""}`);
    return true;
  }

  function next() {
    const session = activeSession();
    if (!session || session.phase !== "answered") return false;
    if (advance(session)) announce(summaryText(session));
    return true;
  }

  /** Наступна картка або підсумок. Повертає true, якщо сесія завершилась. */
  function advance(session) {
    session.index += 1;
    session.choice = null;
    session.phase = session.index >= session.cards.length ? "done" : "question";
    render(session.phase === "done" ? "summary" : "card");
    return session.phase === "done";
  }

  function summaryText(session) {
    const right = session.results.filter((r) => r.correct).length;
    return `Сесію завершено: ${right} з ${session.results.length} правильних.`;
  }

  /** Цифра з клавіатури: варіант тесту або самооцінка усної картки (1 — знав, 2 — не знав). */
  function pick(index) {
    const session = activeSession();
    const card = session?.cards[session.index];
    if (!card) return false;
    if (card.kind === "mcq") return choose(index);
    if (session.phase === "revealed" && index <= 1) return rate(index === 0);
    return false;
  }

  /** Enter / Space: «Далі» після тесту або «Показати відповідь» на усній картці. */
  function primary() {
    return next() || reveal();
  }

  // --- вкладки ---

  function currentParams() {
    return view.tab === "topics" && view.topic ? { tab: "topics", topic: view.topic.topic } : { tab: view.tab };
  }

  function selectTab(id) {
    view.tab = TAB_IDS.includes(id) ? id : "today";
    if (view.tab === "today") ensureToday();
    ctx.setParams(currentParams());
    render();
  }

  function updateTabs() {
    for (const [id, node] of tabNodes) {
      const selected = id === view.tab;
      node.setAttribute("aria-selected", String(selected));
      node.tabIndex = selected ? 0 : -1;
    }
    const due = todayDue();
    badge.textContent = String(due);
    badge.hidden = due === 0;
    const today = tabNodes.get("today");
    const label = due ? `Сьогодні: до повтору ${cardsText(due)}` : "Сьогодні: усе повторено";
    today.setAttribute("aria-label", label);
    today.title = label;
    panel.setAttribute("aria-labelledby", tabNodes.get(view.tab).id);
    root.dataset.tab = view.tab;
  }

  // --- малювання ---

  function render(focusKey = null) {
    updateTabs();
    const active = document.activeElement;
    const keep = !focusKey && active && panel.contains(active) ? active.dataset?.focusKey : null;
    panel.replaceChildren(buildPanel());
    const key = focusKey ?? keep;
    if (key) focusByKey(key);
  }

  function focusByKey(key) {
    const node = [...panel.querySelectorAll("[data-focus-key]")].find((item) => item.dataset.focusKey === key);
    if (!node) return false;
    node.focus({ preventScroll: true });
    const rect = node.getBoundingClientRect();
    // Після «Далі» внизу довгого розбору нова картка може опинитися вище екрана.
    if (rect.top < 0 || rect.top > window.innerHeight - 40) {
      node.scrollIntoView({ block: node.tagName === "BUTTON" ? "nearest" : "start" });
    }
    return true;
  }

  function buildPanel() {
    if (view.tab === "stats") return renderStats();
    if (view.tab === "topics") return view.topic ? renderSession(view.topic) : renderTopics();
    return view.today.cards.length ? renderSession(view.today) : renderEmpty();
  }

  function renderSession(session) {
    const stage = el("div", "quiz__stage");
    if (session.kind === "topic") {
      const crumbs = el("div", "quiz__crumbs");
      const back = button("← Усі теми", { variant: "ghost", onClick: leaveTopic });
      back.classList.add("quiz__back");
      crumbs.append(back, el("span", "quiz__crumb", `Практика: ${topicTitle(session.topic)}`));
      stage.append(crumbs);
    }
    if (session.phase === "done") {
      stage.append(renderSummary(session));
      return stage;
    }
    const card = session.cards[session.index];
    stage.append(renderProgress(session), renderCard(session, card), renderHint(session, card));
    return stage;
  }

  function renderProgress(session) {
    const total = session.cards.length;
    const done = session.index + (session.phase === "answered" ? 1 : 0);
    const right = session.results.filter((r) => r.correct).length;

    const bar = el("div", "quiz__progress");
    const counter = el("span", "quiz__counter", `${session.index + 1} / ${total}`);
    counter.setAttribute("aria-label", `Картка ${session.index + 1} з ${total}`);
    const track = el("div", "quiz__track");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", "Прогрес сесії");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", String(total));
    track.setAttribute("aria-valuenow", String(done));
    const fill = el("div", "quiz__fill");
    fill.style.width = `${(done / total) * 100}%`;
    track.append(fill);
    const tally = el("span", "quiz__tally", `✓ ${right}`);
    tally.title = "Правильних відповідей у цій сесії";
    tally.setAttribute("aria-label", `Правильних: ${right}`);
    bar.append(counter, track, tally);
    return bar;
  }

  function renderCard(session, card) {
    const result = session.phase === "answered" ? session.results.at(-1) : null;
    const questionId = `${prefix}-q-${session.index}`;

    const root = el("article", "panel quiz__card");
    root.dataset.kind = card.kind;
    root.dataset.phase = session.phase;
    root.dataset.state = result ? (result.correct ? "correct" : "wrong") : "idle";
    root.dataset.focusKey = "card";
    root.tabIndex = -1;
    root.setAttribute("aria-labelledby", questionId);

    const meta = el("div", "quiz__meta");
    meta.append(chip(topicTitle(card.topic)), boxChip(result ? result.from : boxOf(card.id)));
    meta.append(el("span", "quiz__kind", card.kind === "mcq" ? "Тест" : "Усно"));

    const question = el("h2", "quiz__question", card.kind === "mcq" ? card.q : card.front);
    question.id = questionId;
    root.append(meta, question);

    if (card.kind === "mcq") renderMcq(root, session, card, result);
    else renderFlash(root, session, card);
    return root;
  }

  function renderMcq(root, session, card, result) {
    const list = el("ol", "quiz__options");
    list.setAttribute("aria-label", "Варіанти відповіді");
    card.options.forEach((option, i) => {
      const item = el("li", "quiz__item");
      const node = el("button", "quiz__option");
      node.type = "button";
      const key = el("span", "quiz__key", String(i + 1));
      key.setAttribute("aria-hidden", "true");
      node.append(key, el("span", "quiz__option-text", option));
      node.dataset.state = "idle";
      if (result) {
        node.disabled = true;
        if (i === card.answer) {
          node.dataset.state = "correct";
          key.textContent = "✓";
          node.append(el("span", "visually-hidden", " — правильна відповідь"));
        } else if (i === session.choice) {
          node.dataset.state = "wrong";
          key.textContent = "✗";
          node.append(el("span", "visually-hidden", " — ваша відповідь"));
        } else node.dataset.state = "dim";
      } else {
        node.addEventListener("click", () => choose(i));
      }
      item.append(node);
      list.append(item);
    });
    root.append(list);

    if (!result) return;

    const feedback = el("div", "quiz__feedback");
    feedback.dataset.state = result.correct ? "correct" : "wrong";
    const verdict = el("p", "quiz__verdict");
    const mark = el("span", "quiz__mark", result.correct ? "✓" : "✗");
    mark.setAttribute("aria-hidden", "true");
    verdict.append(mark, result.correct ? "Правильно!" : `Ні. Правильна відповідь — ${card.answer + 1}.`);
    feedback.append(verdict, el("p", "quiz__move", moveText(result)), ...paragraphs(card.explain, "text quiz__explain"));
    root.append(feedback);

    const last = session.index === session.cards.length - 1;
    const read = button("Читати в довіднику", { variant: "ghost", onClick: () => ctx.openCodex(card.topic) });
    const go = button(last ? "До підсумку" : "Далі", { variant: "primary", onClick: next });
    go.dataset.focusKey = "next";
    const actions = el("div", "quiz__actions");
    actions.append(read, go);
    root.append(actions);
  }

  function renderFlash(root, session, card) {
    const actions = el("div", "quiz__actions");
    if (session.phase === "question") {
      root.append(el("p", "quiz__note", "Спершу скажіть відповідь уголос, як на співбесіді, — а тоді звірте."));
      const show = button("Показати відповідь", { variant: "primary", onClick: reveal });
      show.dataset.focusKey = "reveal";
      actions.append(show);
    } else {
      const answer = el("div", "quiz__answer");
      answer.tabIndex = -1;
      answer.dataset.focusKey = "answer";
      answer.setAttribute("role", "region");
      answer.setAttribute("aria-label", "Відповідь");
      answer.append(el("p", "quiz__answer-label", "Відповідь"), ...paragraphs(card.back));
      root.append(answer);

      const read = button("Читати в довіднику", { variant: "ghost", onClick: () => ctx.openCodex(card.topic) });
      const knew = button("Знав", { onClick: () => rate(true) });
      knew.classList.add("quiz__rate");
      knew.dataset.tone = "good";
      const missed = button("Не знав", { onClick: () => rate(false) });
      missed.classList.add("quiz__rate");
      missed.dataset.tone = "bad";
      // У DOM «Не знав» перед «Знав»: на телефоні column-reverse ставить «Знав» найближче до пальця.
      actions.append(read, missed, knew);
    }
    root.append(actions);
  }

  function renderHint(session, card) {
    if (card.kind === "mcq") return hintLine(session.phase === "answered" ? [["Enter", "далі"]] : [["1–4", "обрати варіант"]]);
    return hintLine(session.phase === "revealed" ? [["1", "знав"], ["2", "не знав"]] : [["Enter", "показати відповідь"]]);
  }

  /** Коли наступна сесія: найближчий день з повторами або завтрашні нові. */
  function nextSessionLine() {
    const today = dayNumber();
    const table = boxes();
    const upcoming = nextDue(table, QUIZ, today);
    const unseen = boxStats(table, QUIZ).new;
    const day = unseen > 0 ? Math.min(today + 1, upcoming?.day ?? Infinity) : upcoming?.day;
    if (!Number.isFinite(day)) return "Розкладу поки немає.";
    const parts = [];
    if (upcoming?.day === day) parts.push(`${cardsText(upcoming.count)} на повтор`);
    if (unseen > 0 && day === today + 1) parts.push(`до ${Math.min(unseen, NEW_PER_DAY)} нових`);
    return `Наступна сесія — ${whenText(day - today)} (${dayDate(day)}): ${parts.join(" і ")}.`;
  }

  function renderSummary(session) {
    const { results } = session;
    const total = results.length;
    const right = results.filter((r) => r.correct).length;
    const promoted = results.filter((r) => r.correct && r.to > Math.max(1, r.from)).length;
    const demoted = results.filter((r) => !r.correct && r.from > 1).length;
    const learned = results.filter((r) => r.from === 0).length;

    const root = el("article", "panel quiz__card quiz__summary");
    root.dataset.state = total > 0 && right === total ? "correct" : "idle";
    root.dataset.focusKey = "summary";
    root.tabIndex = -1;

    const title = session.kind === "topic" ? `Тему «${topicTitle(session.topic)}» пройдено` : "Сесію завершено";
    const heading = el("h2", "quiz__title", title);
    heading.id = `${prefix}-summary`;
    root.setAttribute("aria-labelledby", heading.id);

    const score = el("div", "quiz__score");
    const mood =
      right === total ? "Бездоганно!" : right / total >= 0.7 ? "Добрий результат." : "Помилки — частина методу: ці картки повернуться вже сьогодні.";
    score.append(el("span", "quiz__score-num", `${right} / ${total}`), el("span", "", `правильних. ${mood}`));

    const facts = el("ul", "quiz__facts");
    for (const [value, label] of [
      [promoted, "піднялися у вищі коробки"],
      [demoted, "повернулися в коробку 1"],
      [learned, "нових карток"],
    ]) {
      const item = el("li", "quiz__fact");
      item.append(el("span", "quiz__fact-value", String(value)), el("span", "quiz__fact-label", label));
      facts.append(item);
    }

    const left = todayDue();
    const nextLine = el("p", "quiz__next");
    nextLine.textContent =
      left > 0 ? `Ще ${cardsText(left)} ${plural(left, "чекає", "чекають", "чекають")} уже сьогодні. ${nextSessionLine()}` : nextSessionLine();

    root.append(heading, score, facts, nextLine);

    const wrongTopics = [...new Set(results.filter((r) => !r.correct).map((r) => r.topic))];
    if (wrongTopics.length) {
      const reread = el("div", "quiz__reread");
      reread.append(el("span", "muted", "Варто перечитати:"));
      for (const topic of wrongTopics) reread.append(button(topicTitle(topic), { variant: "ghost", onClick: () => ctx.openCodex(topic) }));
      root.append(reread);
    }

    const actions = el("div", "quiz__actions");
    actions.append(button("Статистика", { variant: "ghost", onClick: () => selectTab("stats") }));
    if (session.kind === "topic") {
      actions.append(
        button("Інша тема", { onClick: leaveTopic }),
        button("Ще раз", { variant: "primary", onClick: () => startTopic(session.topic) }),
      );
    } else if (left > 0) {
      actions.append(
        button(`Ще сесія (${left})`, {
          variant: "primary",
          onClick: () => {
            view.today = buildToday();
            render(view.today.cards.length ? "card" : null);
          },
        }),
      );
    } else {
      actions.append(button("Потренувати тему", { variant: "primary", onClick: () => selectTab("topics") }));
    }
    root.append(actions);
    return root;
  }

  /** Теми для порожнього дня: розпочаті й недовчені першими, далі — ще не бачені. */
  function suggestTopics(limit = 3) {
    const table = boxes();
    const rows = CODEX_IDS.filter((id) => CARDS_BY_TOPIC.has(id)).map((id, order) => ({
      id,
      order,
      ...topicProgress(table, CARDS_BY_TOPIC.get(id), id),
    }));
    const started = rows
      .filter((row) => row.seen > 0 && row.mastered < row.total)
      .sort((a, b) => a.mastered / a.total - b.mastered / b.total || a.order - b.order);
    const fresh = rows.filter((row) => row.seen === 0);
    return [...started, ...fresh].slice(0, limit);
  }

  function renderEmpty() {
    const table = boxes();
    const unseen = boxStats(table, QUIZ).new;

    const stage = el("div", "quiz__stage");
    const root = el("article", "panel quiz__card quiz__empty");
    root.dataset.focusKey = "card";
    root.tabIndex = -1;
    const seal = el("span", "quiz__seal", "✓");
    seal.setAttribute("aria-hidden", "true");
    root.append(
      seal,
      el("h2", "quiz__title", "На сьогодні все"),
      el(
        "p",
        "text",
        unseen > 0
          ? `Повтори зроблено, денну порцію з ${NEW_PER_DAY} нових карток теж. Пам'ять краще закріплюється з перервами, ніж за один довгий присід.`
          : "Уся колода вже в коробках, і жодна картка сьогодні не чекає повтору.",
      ),
      el("p", "text", nextSessionLine()),
    );

    const suggestions = suggestTopics();
    if (suggestions.length) {
      root.append(el("p", "text muted", "Поки чекаєте — потренуйте тему. Відповіді теж підуть у коробки."));
      const list = el("div", "quiz__suggest");
      for (const row of suggestions) {
        const node = button(`${topicTitle(row.id)} · ${row.mastered}/${row.total}`, { onClick: () => startTopic(row.id) });
        node.title = `Опановано ${row.mastered} з ${row.total}`;
        list.append(node);
      }
      root.append(list);
    }
    const all = button("Усі теми", { variant: "ghost", onClick: () => selectTab("topics") });
    root.append(all);
    stage.append(root);
    return stage;
  }

  function renderTopics() {
    const table = boxes();
    const wrap = el("div", "quiz__topics-view");
    wrap.append(el("p", "quiz__lead", "Оберіть тему: у практиці будуть усі її картки, а відповіді підуть у ті самі коробки, що й щоденна сесія."));

    const groups = el("div", "quiz__groups");
    for (const { group, topics } of GROUPS) {
      const rows = topics.map((id) => ({ id, ...topicProgress(table, CARDS_BY_TOPIC.get(id), id) }));
      const mastered = rows.reduce((sum, row) => sum + row.mastered, 0);
      const total = rows.reduce((sum, row) => sum + row.total, 0);

      const section = el("section", "panel quiz__group");
      const headId = `${prefix}-group-${groups.childElementCount}`;
      section.setAttribute("aria-labelledby", headId);
      const groupHead = el("div", "quiz__group-head");
      const title = el("h3", "section__title", group);
      title.id = headId;
      groupHead.append(title, el("span", "quiz__group-sum", `опановано ${mastered} з ${total}`));

      const list = el("ul", "quiz__topics");
      for (const row of rows) {
        const item = el("li", "quiz__topics-item");
        const node = el("button", "quiz__topic");
        node.type = "button";
        node.dataset.level = levelOf(row);
        node.dataset.focusKey = `topic:${row.id}`;
        node.title = `Бачили ${row.seen} з ${row.total}, опановано ${row.mastered}`;
        const count = el("span", "quiz__topic-count");
        count.append(el("span", "visually-hidden", "опановано "), `${row.mastered}/${row.total}`);
        node.append(el("span", "quiz__topic-title", topicTitle(row.id)), count, miniBar(row.total ? row.mastered / row.total : 0));
        node.addEventListener("click", () => startTopic(row.id));
        item.append(node);
        list.append(item);
      }
      section.append(groupHead, list);
      groups.append(section);
    }
    wrap.append(groups);
    return wrap;
  }

  function renderStats() {
    const today = dayNumber();
    const q = quiz();
    const table = boxes();
    const stats = boxStats(table, QUIZ);
    const total = stats.new + stats.boxes.reduce((sum, n) => sum + n, 0);

    let seen = 0;
    let correct = 0;
    for (const card of QUIZ) {
      const entry = Object.hasOwn(table, card.id) ? table[card.id] : null;
      if (!isObject(entry)) continue;
      seen += Number.isFinite(entry.seen) ? entry.seen : 0;
      correct += Number.isFinite(entry.correct) ? entry.correct : 0;
    }

    const wrap = el("div", "quiz__stats");

    // Гістограма коробок.
    const boxesPanel = el("section", "panel quiz__boxes");
    boxesPanel.append(el("h3", "section__title", "Коробки"));
    const columns = [
      { key: "new", label: "Нові", sub: "—", value: stats.new, name: "Нові картки" },
      ...stats.boxes.map((value, i) => ({
        key: String(i + 1),
        label: String(i + 1),
        sub: `${INTERVALS[i]} д`,
        value,
        name: `Коробка ${i + 1}, повтор через ${daysText(INTERVALS[i])}`,
      })),
    ];
    const peak = Math.max(1, ...columns.map((col) => col.value));
    const hist = el("ul", "quiz__hist");
    for (const col of columns) {
      const item = el("li", "quiz__col");
      item.dataset.box = col.key;
      item.setAttribute("aria-label", `${col.name}: ${cardsText(col.value)}`);
      const plot = el("div", "quiz__col-plot");
      plot.setAttribute("aria-hidden", "true");
      const bar = el("div", "quiz__col-bar");
      bar.style.height = `${(col.value / peak) * 100}%`;
      bar.dataset.empty = String(col.value === 0);
      plot.append(bar);
      const value = el("span", "quiz__col-value", String(col.value));
      const label = el("span", "quiz__col-label", col.label);
      const sub = el("span", "quiz__col-sub", col.sub);
      for (const node of [value, label, sub]) node.setAttribute("aria-hidden", "true");
      item.append(value, plot, label, sub);
      hist.append(item);
    }
    boxesPanel.append(
      hist,
      el("p", "quiz__caption", "Під номером коробки — інтервал повтору в днях. Правильна відповідь піднімає картку на коробку вище, помилка — повертає в першу."),
    );

    // Плитки.
    const streak = currentStreak(q, today);
    const streakNote =
      streak === 0 ? "Відповідайте щодня, щоб серія росла." : q.lastDay === today ? "Сьогодні вже зараховано." : "Відповідайте сьогодні, щоб не обірвати.";
    const tilesPanel = el("section", "panel quiz__summary-tiles");
    tilesPanel.append(el("h3", "section__title", "Підсумок"));
    const tiles = el("div", "quiz__tiles");
    const tile = (value, label, note) => {
      const node = el("div", "quiz__tile");
      node.append(el("span", "quiz__tile-value", value), el("span", "quiz__tile-label", label));
      if (note) node.append(el("span", "quiz__tile-note", note));
      return node;
    };
    tiles.append(
      tile(daysText(streak), "серія днів", streakNote),
      tile(`${stats.mastered} / ${total}`, "опановано", total ? `${fmtPct(stats.mastered / total, 0)} колоди — коробки 4–5` : null),
      tile(String(todayDue(today)), "чекає сьогодні", null),
      tile(seen ? fmtPct(correct / seen, 0) : "—", "точність", seen ? `${correct} з ${seen} відповідей` : "Ще жодної відповіді"),
    );
    tilesPanel.append(tiles);

    // Опанованість за групами довідника.
    const groupsPanel = el("section", "panel quiz__stats-wide");
    groupsPanel.append(el("h3", "section__title", "За групами"));
    const rows = el("ul", "quiz__rows");
    for (const { group, topics } of GROUPS) {
      let groupTotal = 0;
      let groupMastered = 0;
      let groupSeen = 0;
      for (const id of topics) {
        const progress = topicProgress(table, CARDS_BY_TOPIC.get(id), id);
        groupTotal += progress.total;
        groupMastered += progress.mastered;
        groupSeen += progress.seen;
      }
      const row = el("li", "quiz__row");
      row.dataset.level = levelOf({ total: groupTotal, seen: groupSeen, mastered: groupMastered });
      row.append(
        el("span", "quiz__row-label", group),
        miniBar(groupTotal ? groupMastered / groupTotal : 0),
        el("span", "quiz__row-value", `${groupMastered} / ${groupTotal}`),
      );
      rows.append(row);
    }
    groupsPanel.append(rows);

    wrap.append(boxesPanel, tilesPanel, groupsPanel);
    return wrap;
  }

  // --- клавіатура ---

  function onKeyDown(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;

    // Стрілки між вкладками — стандартна поведінка ARIA tablist.
    if (target?.getAttribute("role") === "tab" && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      const current = TAB_IDS.indexOf(view.tab);
      const last = TAB_IDS.length - 1;
      const step = event.key === "ArrowRight" ? 1 : -1;
      const index = event.key === "Home" ? 0 : event.key === "End" ? last : (current + step + TAB_IDS.length) % TAB_IDS.length;
      selectTab(TAB_IDS[index]);
      tabNodes.get(TAB_IDS[index]).focus();
      event.preventDefault();
      return;
    }

    const session = activeSession();
    if (!session || session.phase === "done") return;

    if (/^[1-9]$/.test(event.key)) {
      if (pick(Number(event.key) - 1)) event.preventDefault();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      // Затиснутий Enter інакше пролетів би всю сесію, не даючи прочитати розбір.
      if (event.repeat) {
        event.preventDefault();
        return;
      }
      // На кнопці браузер сам натисне саме її — не дублюємо дію.
      if (target?.closest("button, a")) return;
      if (primary()) event.preventDefault();
    }
  }

  // --- старт ---

  const wanted =
    typeof params.topic === "string" && CARDS_BY_TOPIC.has(params.topic) && (params.tab == null || params.tab === "topics")
      ? params.topic
      : null;
  if (wanted) {
    view.tab = "topics";
    view.topic = newSession("topic", CARDS_BY_TOPIC.get(wanted).slice(), wanted);
  } else {
    view.tab = TAB_IDS.includes(params.tab) ? params.tab : "today";
  }
  ensureToday();

  root.addEventListener("keydown", onKeyDown);
  const unsubscribe = ctx.store.subscribe(() => {
    // Власні відповіді перемалюємо самі одразу після запису.
    if (recording) return;
    updateTabs();
    // Зовнішня зміна (скидання прогресу, інша вкладка) — оновлюємо лише «пасивні» вигляди,
    // щоб не збити фокус посеред картки чи в модальному вікні довідника.
    if (view.tab === "stats" || (view.tab === "topics" && !view.topic)) render();
  });

  host.append(root);
  render();

  // Фокус у корінь, щоб цифри й Enter працювали одразу, — але не відбираємо його в модалки чи поля вводу.
  const active = document.activeElement;
  if (!active?.closest?.(".modal__overlay, input, textarea, select, [contenteditable]")) {
    if (!focusByKey("card")) root.focus({ preventScroll: true });
  }

  return {
    unmount() {
      root.removeEventListener("keydown", onKeyDown);
      unsubscribe();
      clearTimeout(liveTimer);
      root.remove();
    },
  };
}
