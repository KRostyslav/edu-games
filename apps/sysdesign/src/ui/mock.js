/**
 * Mock interview: 45 хвилин, сім кроків, як на справжній співбесіді.
 *
 * Таймер іде в реальному часі й переживає перезавантаження: на співбесіді
 * час не зупиняється, поки ви думаєте. Він лише інформує — червоніє після
 * ліміту, але нічого не блокує, бо мета — навчитися розподіляти час, а не
 * програти через нього.
 *
 * Еталон кожного кроку відкривається кнопкою, а не показується одразу:
 * спершу відтворити самому, потім порівняти. Наприкінці — самооцінка за
 * rubric, де підказкою служить покриття чеклістів.
 */

import "./mock.css";
import { el, modal } from "@edu/pixel-ui";
import { INTERVIEWS, RUBRIC } from "../data/interviews.js";
import { MOCK_SPECS } from "../data/mockSpecs.js";
import { ESTIMATES } from "../data/estimation.js";
import { CODEX } from "../data/codex/index.js";
import { pickVariant } from "../progress/estimate.js";
import { MAX_MOCKS } from "../progress/store.js";
import { createGraph, normalizeGraph, cloneGraph } from "../sim/graph.js";
import { buildSolution } from "../data/solutions.js";
import { createBuilder } from "./builder/builder.js";
import { button, chip, starsEl, paragraphs } from "./widgets.js";

/** Які кроки підтверджують який критерій rubric — для підказки самооцінки. */
const RUBRIC_STEPS = {
  requirements: ["req"],
  estimation: ["est"],
  "api-data": ["api", "data"],
  design: ["hld"],
  depth: ["deep"],
  tradeoffs: ["deep", "wrap"],
};

const LEVEL_LABEL = { middle: "middle", senior: "senior" };

export function mountMock(host, ctx, params = {}) {
  const { store } = ctx;
  const page = el("div", "page mock");
  host.append(page);

  let builder = null;
  let clock = null;
  let view = "list";

  const findInterview = (id) => INTERVIEWS.find((item) => item.id === id);
  const session = () => store.state.activeMock;

  function clearDynamic() {
    builder?.destroy();
    builder = null;
    if (clock) clearInterval(clock);
    clock = null;
  }

  function route() {
    clearDynamic();
    page.replaceChildren();
    const active = session();
    if (active && findInterview(active.id) && (!params.id || params.id === active.id)) {
      if (active.finished) renderRubric(active);
      else renderSession(active);
      return;
    }
    renderList();
  }

  // ─────────────────────────── список задач ───────────────────────────

  function renderList() {
    view = "list";
    const head = el("div", "page__head");
    const titles = el("div");
    titles.append(
      el("h1", "page__title", "Mock interview"),
      el(
        "p",
        "page__lead",
        "45 хвилин, як на справжній System Design-співбесіді: уточнити вимоги, порахувати, описати API й дані, намалювати схему, заглибитися у два вузькі місця й підсумувати trade-offs.",
      ),
    );
    head.append(titles);
    page.append(head);

    const intro = el("div", "panel mock__intro");
    intro.append(
      el("p", "text", "Говоріть уголос або пишіть нотатки так, ніби інтерв'юер бачить вашу дошку. Чекліст на кожному кроці — те, що перевіряє інтерв'юер; еталон відкривайте лише після власної спроби."),
      button("Як проходить співбесіда →", { variant: "ghost", onClick: () => ctx.openCodex("interview-framework") }),
    );
    page.append(intro);

    const active = session();
    if (active && findInterview(active.id)) {
      const resume = el("div", "panel mock__resume");
      resume.append(
        el("strong", "", `Незавершена співбесіда: ${findInterview(active.id).title}`),
        el("span", "muted", `минуло ${formatClock(elapsedMs(active))}`),
        button("Продовжити", { variant: "primary", onClick: () => ctx.go("mock", { id: active.id }) }),
        button("Скинути", {
          variant: "ghost",
          onClick: () =>
            ctx.confirm({
              title: "Скинути співбесіду?",
              text: "Нотатки й схема цієї спроби зникнуть.",
              yes: "Скинути",
              onYes: () => {
                store.update((state) => (state.activeMock = null), { immediate: true });
                route();
              },
            }),
        }),
      );
      page.append(resume);
    }

    const grid = el("div", "grid-cards mock__grid");
    for (const interview of INTERVIEWS) {
      const history = store.state.mocks.filter((item) => item.id === interview.id);
      const best = history.reduce((max, item) => Math.max(max, item.average ?? 0), 0);
      const card = el("article", "panel mock__card");
      card.append(
        el("h2", "mock__card-title", interview.title),
        el("div", "mock__chips"),
        el("p", "mock__card-prompt", interview.prompt),
      );
      const chips = card.querySelector(".mock__chips");
      chips.append(chip(LEVEL_LABEL[interview.level] ?? interview.level, interview.level === "senior" ? "warn" : "info"), chip(`${interview.durationMin} хв`));
      if (history.length) chips.append(chip(`спроб: ${history.length} · найкраще ${best.toFixed(1)}/4`, "good"));
      const actions = el("div", "mock__actions");
      actions.append(
        button("Почати", { variant: "primary", onClick: () => start(interview) }),
        button("Розбір задачі", { variant: "ghost", onClick: () => ctx.openCodex(interview.codexRef) }),
      );
      card.append(actions);
      grid.append(card);
    }
    page.append(grid);

    if (store.state.mocks.length) {
      const past = el("section", "panel mock__history");
      past.append(el("h2", "section__title", "Попередні спроби"));
      const list = el("ul", "mock__history-list");
      for (const item of [...store.state.mocks].reverse().slice(0, 10)) {
        const interview = findInterview(item.id);
        const li = el("li", "mock__history-item");
        li.append(
          el("span", "", new Date(item.finishedAt).toLocaleDateString("uk-UA")),
          el("strong", "", interview?.title ?? item.id),
          el("span", "", `${(item.average ?? 0).toFixed(1)} / 4`),
          el("span", "muted", formatClock(item.elapsedMs ?? 0)),
        );
        list.append(li);
      }
      past.append(list);
      page.append(past);
    }
  }

  function start(interview) {
    const begin = () => {
      store.update(
        (state) =>
          (state.activeMock = {
            id: interview.id,
            startedAt: Date.now(),
            elapsedBefore: 0,
            runningSince: Date.now(),
            step: 0,
            checked: {},
            notes: {},
            revealed: {},
            topics: [],
            graph: null,
            seed: Date.now() % 100000,
            rubric: {},
            finished: false,
          }),
        { immediate: true },
      );
      ctx.go("mock", { id: interview.id });
    };
    if (session()) {
      ctx.confirm({ title: "Почати нову?", text: "Незавершена співбесіда буде скинута.", yes: "Почати нову", onYes: begin });
    } else {
      begin();
    }
  }

  // ─────────────────────────── сесія ───────────────────────────

  function renderSession(active) {
    view = "session";
    const interview = findInterview(active.id);
    const total = interview.durationMin * 60_000;

    const head = el("div", "page__head mock__head");
    const titles = el("div");
    const back = button("← Усі задачі", { variant: "ghost", onClick: () => ctx.go("mock") });
    back.classList.add("mock__back");
    titles.append(back, el("h1", "page__title", interview.title));
    const timerBox = el("div", "mock__timer");
    const timerText = el("span", "mock__clock");
    timerText.setAttribute("role", "timer");
    const planText = el("span", "mock__plan");
    const pause = button(active.runningSince ? "❚❚ Пауза" : "▶ Продовжити", { onClick: () => togglePause() });
    const finish = button("Завершити", { variant: "primary", onClick: () => finishSession() });
    timerBox.append(timerText, planText, pause, finish);
    head.append(titles, timerBox);
    page.append(head);

    const promptBox = el("details", "panel mock__prompt");
    promptBox.open = active.step === 0;
    promptBox.append(el("summary", "mock__prompt-title", "Задача від інтерв'юера"), ...paragraphs(interview.prompt));
    page.append(promptBox);

    const layout = el("div", "mock__layout");
    const nav = el("nav", "mock__steps");
    nav.setAttribute("aria-label", "Кроки співбесіди");
    const stepHost = el("section", "panel mock__step");
    layout.append(nav, stepHost);
    page.append(layout);

    const boundaries = [];
    let acc = 0;
    for (const step of interview.steps) {
      acc += step.minutes;
      boundaries.push(acc);
    }

    function renderNav() {
      nav.replaceChildren();
      interview.steps.forEach((step, index) => {
        const items = checklistOf(step, active);
        const done = items.filter((item) => active.checked[item.id]).length;
        const btn = el("button", "mock__step-btn");
        btn.type = "button";
        btn.dataset.active = String(index === active.step);
        btn.append(el("span", "mock__step-name", `${index + 1}. ${step.title}`), el("span", "mock__step-meta", `${step.minutes} хв · ${done}/${items.length}`));
        if (index === active.step) btn.setAttribute("aria-current", "step");
        btn.addEventListener("click", () => goStep(index));
        nav.append(btn);
      });
    }

    function tick() {
      const elapsed = elapsedMs(active);
      timerText.textContent = `${formatClock(elapsed)} / ${formatClock(total)}`;
      timerText.dataset.over = String(elapsed > total);
      const minute = elapsed / 60_000;
      const planned = boundaries.findIndex((limit) => minute < limit);
      const plannedStep = planned === -1 ? interview.steps.length - 1 : planned;
      planText.textContent = `за планом: ${interview.steps[plannedStep].title}`;
      planText.dataset.behind = String(plannedStep > active.step);
    }

    function togglePause() {
      store.update((state) => {
        const current = state.activeMock;
        if (current.runningSince) {
          current.elapsedBefore += Date.now() - current.runningSince;
          current.runningSince = null;
        } else {
          current.runningSince = Date.now();
        }
      });
      pause.textContent = session().runningSince ? "❚❚ Пауза" : "▶ Продовжити";
      tick();
    }

    function goStep(index) {
      builder?.destroy();
      builder = null;
      store.update((state) => (state.activeMock.step = index));
      renderNav();
      renderStep();
      stepHost.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }

    function renderStep() {
      const step = interview.steps[active.step];
      stepHost.replaceChildren();
      stepHost.dataset.step = step.id;
      const stepHead = el("header", "mock__step-head");
      stepHead.append(el("h2", "mock__step-title", step.title), chip(`${step.minutes} хв`));
      stepHost.append(stepHead, el("p", "mock__goal", step.goal));

      if (step.prompts?.length) {
        const box = el("div", "mock__block");
        box.append(el("h3", "section__title", "Що проговорити"));
        const list = el("ul", "mock__prompts");
        for (const prompt of step.prompts) list.append(el("li", "", prompt));
        box.append(list);
        stepHost.append(box);
      }

      if (step.id === "est") stepHost.append(estimateBlock(interview, active));
      if (step.id === "hld") stepHost.append(hldBlock(interview, active));

      if (step.topics) {
        stepHost.append(topicsBlock(step, active, () => renderNav()));
      } else {
        stepHost.append(checklistBlock(step.checklist ?? [], active, () => renderNav()));
        stepHost.append(notesBlock(step.id, active));
        if (step.reference) stepHost.append(referenceBlock(step.id, step.reference, active));
      }

      const pager = el("div", "mock__pager");
      if (active.step > 0) pager.append(button("← Назад", { onClick: () => goStep(active.step - 1) }));
      if (active.step < interview.steps.length - 1) {
        pager.append(button(`Далі: ${interview.steps[active.step + 1].title} →`, { variant: "primary", onClick: () => goStep(active.step + 1) }));
      } else {
        pager.append(button("Завершити й оцінити себе", { variant: "primary", onClick: () => finishSession() }));
      }
      stepHost.append(pager);
    }

    function finishSession() {
      store.update(
        (state) => {
          const current = state.activeMock;
          if (current.runningSince) current.elapsedBefore += Date.now() - current.runningSince;
          current.runningSince = null;
          current.finished = true;
        },
        { immediate: true },
      );
      route();
    }

    renderNav();
    renderStep();
    tick();
    clock = setInterval(tick, 1000);
  }

  // ─────────────────────────── блоки кроку ───────────────────────────

  function checklistOf(step, active) {
    if (!step.topics) return step.checklist ?? [];
    return step.topics.filter((topic) => active.topics.includes(topic.id)).flatMap((topic) => topic.checklist);
  }

  function checklistBlock(items, active, onToggle) {
    const box = el("div", "mock__block");
    box.append(el("h3", "section__title", "Чекліст інтерв'юера"));
    const list = el("ul", "mock__checklist");
    for (const item of items) {
      const li = el("li", "mock__check");
      const id = `mc-${item.id}`;
      const input = el("input");
      input.type = "checkbox";
      input.id = id;
      input.checked = Boolean(active.checked[item.id]);
      input.addEventListener("change", () => {
        store.update((state) => {
          if (input.checked) state.activeMock.checked[item.id] = true;
          else delete state.activeMock.checked[item.id];
        });
        onToggle?.();
      });
      const label = el("label", "", item.text);
      label.htmlFor = id;
      li.append(input, label);
      list.append(li);
    }
    box.append(list);
    return box;
  }

  function notesBlock(key, active) {
    const box = el("div", "mock__block");
    const id = `mn-${key}`;
    const label = el("label", "section__title", "Ваші нотатки (як на дошці)");
    label.htmlFor = id;
    const area = el("textarea", "mock__notes");
    area.id = id;
    area.rows = 5;
    area.value = active.notes[key] ?? "";
    area.addEventListener("input", () => store.update((state) => (state.activeMock.notes[key] = area.value)));
    box.append(label, area);
    return box;
  }

  function referenceBlock(key, text, active) {
    const box = el("div", "mock__block mock__reference");
    const pre = el("pre", "mock__reference-text", text);
    const show = () => {
      pre.hidden = false;
      toggle.hidden = true;
    };
    pre.hidden = !active.revealed[key];
    const toggle = button("Показати еталон", {
      onClick: () => {
        store.update((state) => (state.activeMock.revealed[key] = true));
        show();
      },
    });
    toggle.hidden = !pre.hidden;
    box.append(el("h3", "section__title", "Еталон"), el("p", "muted", "Спершу спробуйте самі — порівнювати корисніше, ніж читати."), toggle, pre);
    return box;
  }

  function estimateBlock(interview, active) {
    const problem = ESTIMATES.find((item) => item.id === interview.estimateId);
    const box = el("div", "mock__block mock__estimate");
    if (!problem) return box;
    const g = pickVariant(problem, active.seed);
    box.append(el("h3", "section__title", `Вправа: ${problem.title}`), el("p", "text", problem.prompt(g)));
    if (problem.assumptions?.length) {
      const list = el("ul", "mock__prompts");
      for (const item of problem.assumptions) list.append(el("li", "", item));
      box.append(list);
    }
    const details = el("details", "mock__solution");
    details.append(el("summary", "", "Розв'язок вправи"));
    const steps = el("ol", "mock__solution-steps");
    for (const line of problem.steps(g)) steps.append(el("li", "", line));
    details.append(steps);
    if (problem.takeaway) details.append(el("p", "text", problem.takeaway));
    box.append(details);
    return box;
  }

  function hldBlock(interview, active) {
    const mockSpec = MOCK_SPECS[interview.id];
    const box = el("div", "mock__block mock__hld");
    if (!mockSpec) return box;
    const spec = mockSpec.spec;
    box.append(
      el("h3", "section__title", "Схема в конструкторі"),
      el("p", "muted", "Усі компоненти відкриті — як на справжній співбесіді. Прогін покаже, чи схема тримає вимоги й інциденти задачі."),
    );
    const graph = active.graph ? normalizeGraph(active.graph, spec) : createGraph(spec);
    const result = el("div", "mock__run-result");
    builder = createBuilder({
      level: spec,
      graph,
      ctx,
      seed: 1,
      toolbarExtra: [button("Порівняти з еталоном", { variant: "ghost", onClick: () => openReference(interview) })],
      onGraphChange: (next) => store.update((state) => (state.activeMock.graph = cloneGraph(next))),
      onRunComplete: (_run, score) => {
        result.replaceChildren(starsEl(score.stars), el("span", "", ` ${score.criteria.filter((item) => item.ok).length} з ${score.criteria.length} критеріїв`));
        for (const item of score.criteria.filter((criterion) => !criterion.ok)) result.append(el("p", "mock__miss", `✗ ${item.label} — ${item.detail}`));
      },
    });
    box.append(builder.root, result);
    return box;
  }

  function openReference(interview) {
    const mockSpec = MOCK_SPECS[interview.id];
    const dialog = modal({ title: `Еталон: ${interview.title}`, wide: true });
    const graph = buildSolution(mockSpec.spec, mockSpec.reference);
    const viewer = createBuilder({ level: mockSpec.spec, graph, ctx, readOnly: true, seed: 1 });
    dialog.body.append(viewer.root, ...paragraphs(interview.referenceNotes));
    dialog.foot.append(button("Закрити", { onClick: () => dialog.hide() }));
    const close = dialog.hide;
    dialog.hide = () => {
      viewer.destroy();
      close();
    };
    dialog.show();
  }

  function topicsBlock(step, active, onToggle) {
    const box = el("div", "mock__block");
    box.append(el("h3", "section__title", `Оберіть ${step.pick} теми — як інтерв'юер обирає, куди копати`));
    const list = el("div", "mock__topics");
    for (const topic of step.topics) {
      const chosen = active.topics.includes(topic.id);
      const card = el("article", "mock__topic");
      card.dataset.chosen = String(chosen);
      const head = el("header", "mock__topic-head");
      const toggle = button(chosen ? "Прибрати" : "Обрати", {
        variant: chosen ? "" : "primary",
        disabled: !chosen && active.topics.length >= step.pick,
        onClick: () => {
          store.update((state) => {
            const topics = state.activeMock.topics;
            state.activeMock.topics = topics.includes(topic.id) ? topics.filter((id) => id !== topic.id) : [...topics, topic.id];
          });
          onToggle?.();
          box.replaceWith(topicsBlock(step, session(), onToggle));
        },
      });
      head.append(el("h4", "mock__topic-title", topic.title), toggle);
      card.append(head);
      if (chosen) {
        const questions = el("ul", "mock__prompts");
        for (const question of topic.questions) questions.append(el("li", "", question));
        card.append(questions, checklistBlock(topic.checklist, active, onToggle), notesBlock(`deep-${topic.id}`, active), referenceBlock(`deep-${topic.id}`, topic.reference, active));
        if (topic.codexRef && CODEX[topic.codexRef]) card.append(button("Довідник →", { variant: "ghost", onClick: () => ctx.openCodex(topic.codexRef) }));
      }
      list.append(card);
    }
    box.append(list);
    return box;
  }

  // ─────────────────────────── самооцінка ───────────────────────────

  function renderRubric(active) {
    view = "rubric";
    const interview = findInterview(active.id);
    const head = el("div", "page__head");
    const titles = el("div");
    titles.append(
      el("h1", "page__title", `Самооцінка: ${interview.title}`),
      el("p", "page__lead", `Час: ${formatClock(elapsedMs(active))} з ${interview.durationMin} хв. Оцініть кожен критерій так, як оцінив би інтерв'юер. Підказка — покриття ваших чеклістів.`),
    );
    head.append(titles);
    page.append(head);

    const form = el("form", "mock__rubric");
    for (const criterion of RUBRIC) {
      const coverage = coverageOf(interview, active, criterion.id);
      const suggested = Math.max(1, Math.min(4, 1 + Math.round(coverage * 3)));
      const fieldset = el("fieldset", "panel mock__criterion");
      fieldset.append(el("legend", "mock__criterion-title", criterion.label));
      fieldset.append(el("p", "muted", `Покриття чеклістів: ${Math.round(coverage * 100)}% → підказка ${suggested}/4`));
      if (interview.rubricNotes?.[criterion.id]) fieldset.append(el("p", "mock__note", interview.rubricNotes[criterion.id]));
      criterion.levels.forEach((text, index) => {
        const value = index + 1;
        const id = `rb-${criterion.id}-${value}`;
        const row = el("div", "mock__level");
        const input = el("input");
        input.type = "radio";
        input.name = criterion.id;
        input.id = id;
        input.value = String(value);
        input.checked = (active.rubric[criterion.id] ?? suggested) === value;
        input.addEventListener("change", () => store.update((state) => (state.activeMock.rubric[criterion.id] = value)));
        const label = el("label", "", text);
        label.htmlFor = id;
        row.append(input, label);
        fieldset.append(row);
      });
      form.append(fieldset);
    }
    page.append(form);

    if (interview.pitfalls?.length) {
      const box = el("section", "panel mock__pitfalls");
      box.append(el("h2", "section__title", "Типові помилки в цій задачі"));
      const list = el("ul", "mock__prompts");
      for (const item of interview.pitfalls) list.append(el("li", "", item));
      box.append(list);
      page.append(box);
    }
    const ref = el("section", "panel");
    ref.append(el("h2", "section__title", "Еталонне рішення"), ...paragraphs(interview.referenceNotes));
    page.append(ref);

    const actions = el("div", "mock__actions mock__actions--end");
    actions.append(
      button("Зберегти результат", {
        variant: "primary",
        onClick: () => {
          const rubric = {};
          for (const criterion of RUBRIC) {
            const coverage = coverageOf(interview, active, criterion.id);
            rubric[criterion.id] = active.rubric[criterion.id] ?? Math.max(1, Math.min(4, 1 + Math.round(coverage * 3)));
          }
          const values = Object.values(rubric);
          const average = values.reduce((sum, value) => sum + value, 0) / values.length;
          store.update(
            (state) => {
              state.mocks.push({ id: interview.id, finishedAt: Date.now(), elapsedMs: elapsedMs(active), rubric, average });
              state.mocks = state.mocks.slice(-MAX_MOCKS);
              state.activeMock = null;
            },
            { immediate: true },
          );
          ctx.go("mock");
        },
      }),
      button("Повернутися до кроків", {
        onClick: () => {
          store.update((state) => (state.activeMock.finished = false));
          route();
        },
      }),
    );
    page.append(actions);
  }

  function coverageOf(interview, active, criterionId) {
    const stepIds = RUBRIC_STEPS[criterionId] ?? [];
    const items = interview.steps.filter((step) => stepIds.includes(step.id)).flatMap((step) => checklistOf(step, active));
    if (!items.length) return 0;
    return items.filter((item) => active.checked[item.id]).length / items.length;
  }

  route();

  return {
    unmount() {
      clearDynamic();
      store.flush();
    },
  };
}

function elapsedMs(active) {
  return (active.elapsedBefore ?? 0) + (active.runningSince ? Date.now() - active.runningSince : 0);
}

function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
