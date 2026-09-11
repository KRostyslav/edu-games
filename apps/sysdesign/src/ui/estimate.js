import "./estimate.css";

/**
 * Екран «Оцінки на серветці»: тренажер back-of-the-envelope розрахунків.
 *
 * Два стани в одному екрані — список задач і сама задача — перемикаються
 * локальним перерендером, а hash лише тихо синхронізується через ctx.setParams:
 * так повернення до списку не перебудовує шпаргалку й не губить прокрутку.
 *
 * Уся логіка без DOM (форматування latency, формулювання відхилення, перевірка
 * відповідей, облік спроб) винесена в експортовані чисті функції: їх можна
 * тестувати голим Node, а DOM-частина лише розкладає готові результати.
 *
 * Спроба закінчується перевіркою: після неї поля блокуються, бо, побачивши
 * еталон, легко «виправити» відповідь і зібрати зірки, яких не заробив.
 * Нова спроба — новий варіант умови.
 */

import { ESTIMATES } from "../data/estimation.js";
import { CHEATSHEET } from "../data/cheatsheet.js";
import { CODEX } from "../data/codex/index.js";
import {
  parseNumber,
  gradeAnswer,
  pickVariant,
  formatNumber,
  formatUnit,
  problemStars,
} from "../progress/estimate.js";
import { el, button, starsEl, chip, section } from "./widgets.js";

// ───────────────────────────── ДОВІДКОВІ ДАНІ ЕКРАНА ─────────────────────────────

const MAX_STARS = 3;
const DESKTOP_QUERY = "(min-width: 900px)";
const INTRO_CODEX = "back-of-envelope";
const FORMAT_HINT = "Напр.: 1,2 млн · 3e6 · 40 тис";
const FORMAT_EXAMPLES = "1,2 млн · 3e6 · 40 тис · 2·10^5";

const DIFFICULTIES = [
  {
    level: 1,
    title: "Розминка",
    tag: "розминка",
    tone: "good",
    lead: "Один-два кроки: множимо користувачів на дії й ділимо на добу.",
  },
  {
    level: 2,
    title: "Середні",
    tag: "середня",
    tone: "warn",
    lead: "Кеш, з'єднання, fan-out: кілька кроків і правила великого пальця.",
  },
  {
    level: 3,
    title: "Складні",
    tag: "складна",
    tone: "bad",
    lead: "Трафік, сховище й розмір кластера в одній задачі — тут найлегше загубити одиниці.",
  },
];

const VERDICTS = {
  3: "Відмінно: кожна відповідь майже збігається з еталоном.",
  2: "Добре: усі відповіді в межах допуску задачі.",
  1: "Порядок величини правильний, але десь помітний промах — звірте свої кроки з розбором.",
  0: "Щонайменше одна відповідь промахнулася більш ніж на порядок. Пройдіть розбір і спробуйте інший варіант.",
};

// ───────────────────────────── ЧИСТІ ФУНКЦІЇ ─────────────────────────────

/**
 * Українська множина за останніми цифрами: 1 раз, 2 рази, 5 разів, 11 разів, 21 раз.
 * forms = [одна, кілька, багато].
 */
export function plural(n, [one, few, many]) {
  const abs = Math.abs(Math.trunc(n));
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

/** Дробове число вимагає родового відмінка однини: «у 1,6 раза», а не «у 1,6 рази». */
function timesWord(n) {
  return Number.isInteger(n) ? plural(n, ["раз", "рази", "разів"]) : "раза";
}

const groupDigits = (text) => text.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Показує множник як на дошці: одна десяткова до 10, далі ціле з групуванням. */
function formatFactor(n) {
  return Number.isInteger(n) ? groupDigits(String(n)) : String(n).replace(".", ",");
}

const DURATION_UNITS = [
  { name: "ns", scale: 1 },
  { name: "µs", scale: 1e3 },
  { name: "ms", scale: 1e6 },
  { name: "s", scale: 1e9 },
];

/**
 * Наносекунди → людська одиниця (ns, µs, ms, s): найбільша, у якій значення ≥ 1.
 * Таблиця latency вчить відчувати порядки, а «150 000 000 ns» читається гірше
 * за «150 ms».
 */
export function formatDuration(ns) {
  if (typeof ns !== "number" || !Number.isFinite(ns) || ns < 0) return "—";
  if (ns === 0) return "0 ns";

  let index = 0;
  while (index < DURATION_UNITS.length - 1 && ns >= DURATION_UNITS[index + 1].scale) index += 1;
  // Округлення до трьох значущих може перенести 999,96 µs у «1000 µs» — це вже 1 ms.
  const top = DURATION_UNITS.length - 1;
  if (index < top && Number((ns / DURATION_UNITS[index].scale).toPrecision(3)) >= 1000) index += 1;

  const { name, scale } = DURATION_UNITS[index];
  const value = ns / scale;
  // Тисячі секунд formatNumber назвав би «3,6 тис s» — ціле з пробілами зрозуміліше.
  const text = value >= 1000 ? groupDigits(String(Math.round(value))) : formatNumber(value);
  return `${text} ${name}`;
}

/**
 * Словесне відхилення відповіді від еталона: «у 1,6 раза більше», «у 3 рази менше»,
 * «на 4 порядки більше». Напрям важливий не менше за величину: систематичне
 * «менше» зазвичай означає забутий пік чи репліки, «більше» — зайве множення.
 *
 * Повертає { dir: "over" | "under" | "exact" | "none", text }.
 */
export function describeDeviation(given, expected) {
  const valid = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
  if (!valid(given) || !valid(expected)) return { dir: "none", text: "" };

  const over = given >= expected;
  const ratio = over ? given / expected : expected / given;
  if (ratio <= 1 + 1e-9) return { dir: "exact", text: "точно як еталон" };

  const word = over ? "більше" : "менше";
  const dir = over ? "over" : "under";
  // Спершу округлюємо, потім обираємо форму: 9,96 має стати «у 10 разів», а не «у 10 раза».
  const shown = ratio < 9.95 ? Math.round(ratio * 10) / 10 : Math.round(ratio);

  if (shown === 1) return { dir: "exact", text: "майже точно: різниця менша за 5%" };
  if (shown >= 1000) {
    // «У 12 345 разів» не читається; для таких промахів важить лише кількість порядків.
    const orders = Math.round(Math.log10(ratio));
    return { dir, text: `на ${orders} ${plural(orders, ["порядок", "порядки", "порядків"])} ${word}` };
  }
  return { dir, text: `у ${formatFactor(shown)} ${timesWord(shown)} ${word}` };
}

/**
 * Групує задачі за складністю в порядку «Розминка → Середні → Складні».
 * Порожні групи пропускає, а невідому складність не губить, а виносить у
 * власну групу — щоб нова задача з помилкою в даних усе одно була видна.
 */
export function groupByDifficulty(problems) {
  const byLevel = new Map();
  for (const problem of problems) {
    const level = problem.difficulty;
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level).push(problem);
  }

  const known = DIFFICULTIES.filter((d) => byLevel.has(d.level)).map((d) => ({ ...d, problems: byLevel.get(d.level) }));
  const knownLevels = new Set(DIFFICULTIES.map((d) => d.level));
  const unknown = [...byLevel.keys()]
    .filter((level) => !knownLevels.has(level))
    .sort((a, b) => Number(a) - Number(b))
    .map((level) => ({ level, title: `Рівень ${level}`, tag: `рівень ${level}`, tone: "info", lead: "", problems: byLevel.get(level) }));
  return [...known, ...unknown];
}

/** Метадані складності для однієї задачі (для чипа на картці й у заголовку). */
export function difficultyOf(problem) {
  return DIFFICULTIES.find((d) => d.level === problem.difficulty) ?? { level: problem.difficulty, tag: `рівень ${problem.difficulty}`, tone: "info" };
}

/**
 * Перевіряє введення гравця для варіанта g.
 * Спершу розбираються всі поля; якщо хоч одне не розібране — оцінювання не
 * відбувається взагалі (report.valid = false), щоб друкарська помилка не
 * з'їла спробу. Нуль теж відхиляємо: відношення до еталона для нього
 * нескінченне, а на практиці це недописане число.
 *
 * raw — { askId: текст із поля }.
 */
export function checkAnswers(problem, g, raw) {
  const errors = {};
  const values = {};
  for (const ask of problem.asks) {
    const text = String(raw?.[ask.id] ?? "").trim();
    const value = parseNumber(text);
    if (text === "") errors[ask.id] = "empty";
    else if (value == null) errors[ask.id] = "format";
    else if (value <= 0) errors[ask.id] = "nonpositive";
    else values[ask.id] = value;
  }
  if (Object.keys(errors).length > 0) return { valid: false, errors };

  const answers = {};
  for (const ask of problem.asks) {
    const value = values[ask.id];
    const expected = ask.answer(g);
    const { stars, ratio } = gradeAnswer(value, expected, ask.tolerance);
    answers[ask.id] = { value, expected, stars, ratio, deviation: describeDeviation(value, expected) };
  }
  return { valid: true, answers, stars: problemStars(answers) };
}

/** Текст інлайн-помилки під полем — завжди з прикладами правильного запису. */
export function inputErrorMessage(kind, text = "") {
  if (kind === "empty") return `Введіть оцінку. Приклади: ${FORMAT_EXAMPLES}.`;
  if (kind === "nonpositive") return `Оцінка має бути більшою за нуль. Приклади: ${FORMAT_EXAMPLES}.`;
  return `Не вдалося розібрати «${text}». Пишіть як на дошці: ${FORMAT_EXAMPLES}.`;
}

/** Новий запис прогресу після спроби: спроби +1, рекорд — найкращий із двох. */
export function recordAttempt(entry, stars) {
  const prevBest = Number.isFinite(entry?.bestStars) ? entry.bestStars : 0;
  const prevAttempts = Number.isFinite(entry?.attempts) ? entry.attempts : 0;
  return { bestStars: Math.max(prevBest, stars), attempts: prevAttempts + 1 };
}

const variantKey = (variant) => JSON.stringify(variant);

/**
 * Seed наступної спроби: Date.now(), але якщо він дає ту саму умову, що й
 * попередня, беремо наступні числа. Кнопка «Інший варіант», яка показує ті
 * самі цифри, виглядає зламаною, а у задач лише 12–18 комбінацій, тож збіг
 * трапляється помітно часто. Для задачі з одним варіантом просто повертає seed.
 */
export function nextSeed(problem, prevSeed, now = Date.now()) {
  if (prevSeed == null) return now;
  const prevKey = variantKey(pickVariant(problem, prevSeed));
  let seed = Math.max(now, prevSeed + 1);
  for (let tries = 0; tries < 64 && variantKey(pickVariant(problem, seed)) === prevKey; tries += 1) seed += 1;
  return seed;
}

// ───────────────────────────── DOM-ПОМІЧНИКИ ─────────────────────────────

let uidCounter = 0;
/** Унікальні id для зв'язок label/aria-* навіть якщо екран змонтовано двічі. */
const uid = (prefix) => `est-${prefix}-${++uidCounter}`;

function entryFor(store, id) {
  const entry = store.state.estimate?.[id];
  return { bestStars: entry?.bestStars ?? 0, attempts: entry?.attempts ?? 0 };
}

/** Стан картки для кольорової смуги: нова, пробували, розв'язана, на три зірки. */
function cardStatus({ bestStars, attempts }) {
  if (bestStars >= MAX_STARS) return "mastered";
  if (bestStars > 0) return "solved";
  return attempts > 0 ? "tried" : "new";
}

function attemptsText(attempts) {
  return attempts > 0 ? `Спроб: ${attempts}` : "Ще не пробували";
}

// ───────────────────────────── ШПАРГАЛКА ─────────────────────────────

/** Комірка з основним текстом і приміткою під ним: так таблиця лишається двоколонковою й влазить у бічну панель. */
function fillCell(node, cell) {
  const spec = typeof cell === "object" && cell !== null ? cell : { text: cell };
  node.append(el("span", "est__cell-main", spec.text));
  if (spec.note) node.append(el("span", "est__note", spec.note));
}

function sheetTable(labelledBy, columns, rows) {
  // Контейнер прокрутки фокусований: інакше з клавіатури широку таблицю не догорнути.
  const wrap = el("div", "est__table-wrap");
  wrap.tabIndex = 0;
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-labelledby", labelledBy);

  const table = el("table", "est__table");
  const thead = el("thead");
  const headRow = el("tr");
  for (const column of columns) {
    const th = el("th", column.num ? "est__num" : "", column.title);
    th.scope = "col";
    headRow.append(th);
  }
  thead.append(headRow);

  const tbody = el("tbody");
  for (const [first, ...rest] of rows) {
    const tr = el("tr");
    const th = el("th");
    th.scope = "row";
    fillCell(th, first);
    tr.append(th);
    rest.forEach((cell, i) => {
      const td = el("td", columns[i + 1]?.num ? "est__num" : "");
      fillCell(td, cell);
      tr.append(td);
    });
    tbody.append(tr);
  }
  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

function sheetSection(title, build) {
  const node = section(title, "est__sheet-section");
  const heading = node.firstChild;
  heading.id = uid("sheet");
  node.append(build(heading.id));
  return node;
}

function buildCheatsheetBody() {
  const body = el("div", "est__sheet-body");
  body.append(
    sheetSection("Latency numbers", (id) =>
      sheetTable(
        id,
        [{ title: "Операція" }, { title: "Час", num: true }],
        CHEATSHEET.latency.map((row) => [{ text: row.op, note: row.note }, formatDuration(row.ns)]),
      ),
    ),
    sheetSection("Степені двійки", (id) =>
      sheetTable(
        id,
        [{ title: "2^n" }, { title: "Точно", num: true }, { title: "Наближено" }],
        CHEATSHEET.powers.map((row) => [
          `2^${row.power}`,
          groupDigits(String(row.value)),
          { text: `${row.approx} · ${row.unit} · ${row.name}`, note: row.note },
        ]),
      ),
    ),
    sheetSection("Час і QPS", (id) =>
      sheetTable(
        id,
        [{ title: "Що" }, { title: "Точно", num: true }, { title: "На дошці", num: true }],
        CHEATSHEET.time.map((row) => [{ text: row.what, note: row.note }, row.value, row.approx]),
      ),
    ),
    sheetSection("Типові розміри", (id) =>
      sheetTable(
        id,
        [{ title: "Що" }, { title: "Розмір", num: true }],
        CHEATSHEET.sizes.map((row) => [{ text: row.item, note: row.note }, row.size]),
      ),
    ),
    sheetSection("Правила великого пальця", () => {
      const list = el("ul", "est__rules");
      for (const row of CHEATSHEET.rules) {
        const li = el("li", "est__rule");
        li.append(el("strong", "est__rule-title", row.rule), el("span", "est__note", row.note));
        list.append(li);
      }
      return list;
    }),
  );
  return body;
}

/**
 * Одна й та сама розмітка — і бічна панель, і розгортуваний блок: <details>
 * на десктопі примусово відкритий, а клік по summary гаситься. Дублювати DOM
 * для двох режимів не хочеться: скрінрідер і пошук по сторінці бачили б
 * шпаргалку двічі.
 */
function buildCheatsheet() {
  const aside = el("aside", "est__sheet");
  aside.setAttribute("aria-label", "Шпаргалка");
  const details = el("details", "est__sheet-box");
  const summary = el("summary", "est__sheet-summary", "Шпаргалка");
  summary.append(el("span", "est__sheet-sub", "latency · степені двійки · розміри"));
  details.append(summary, buildCheatsheetBody());
  aside.append(details);

  const media = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DESKTOP_QUERY)
    : null;

  const apply = () => {
    const side = media ? media.matches : false;
    aside.dataset.mode = side ? "side" : "drawer";
    details.open = side;
    // У режимі панелі summary — лише заголовок: не тримаємо зайву зупинку табуляції.
    if (side) summary.tabIndex = -1;
    else summary.removeAttribute("tabindex");
  };

  summary.addEventListener("click", (event) => {
    if (aside.dataset.mode === "side") event.preventDefault();
  });
  media?.addEventListener("change", apply);
  apply();

  return { root: aside, destroy: () => media?.removeEventListener("change", apply) };
}

// ───────────────────────────── ЕКРАН ─────────────────────────────

export function mountEstimate(host, ctx, params = {}) {
  const state = {
    problemId: null,
    // Seed живе тут, а не рахується в render: перерендер не має міняти умову.
    seed: null,
    // Куди повернути фокус у списку після «До списку».
    lastProblemId: null,
    missingId: null,
  };

  const root = el("div", "page est");
  const head = el("header", "page__head est__head");
  const headText = el("div", "est__head-text");
  headText.append(
    el("h1", "page__title", "Оцінки на серветці"),
    el("p", "page__lead", "Навантаження, трафік і сховище — порахуйте так, як на дошці на співбесіді: порядок величини важливіший за третю цифру."),
  );
  head.append(headText);

  const layout = el("div", "est__layout");
  const main = el("div", "est__main");
  const sheet = buildCheatsheet();
  // Шпаргалка стоїть першою в DOM: на мобільному згорнутий рядок угорі не заважає,
  // а на десктопі сітка переносить її праворуч.
  layout.append(sheet.root, main);
  root.append(head, layout);
  host.append(root);

  const findProblem = (id) => ESTIMATES.find((p) => p.id === id) ?? null;

  function render({ focus = false } = {}) {
    const problem = findProblem(state.problemId);
    root.dataset.view = problem ? "problem" : "list";
    const view = problem ? renderProblem(problem) : renderList();
    main.replaceChildren(...view.nodes);
    if (focus && view.focusTarget) view.focusTarget.focus();
  }

  function openProblem(id) {
    const problem = findProblem(id);
    if (!problem) return;
    state.problemId = id;
    state.seed = nextSeed(problem, null, Date.now());
    ctx.setParams({ id });
    render({ focus: true });
  }

  function showList() {
    state.lastProblemId = state.problemId;
    state.problemId = null;
    state.seed = null;
    ctx.setParams({});
    render({ focus: true });
  }

  function anotherVariant(problem) {
    state.seed = nextSeed(problem, state.seed, Date.now());
    render({ focus: true });
  }

  function codexButton(id, label) {
    const article = CODEX[id];
    return button(label, {
      variant: "ghost",
      title: article ? `Довідник: ${article.title}` : "Статті ще немає в довіднику",
      disabled: !article,
      onClick: () => ctx.openCodex(id),
    });
  }

  // ─────────── список ───────────

  function renderIntro() {
    const intro = el("section", "panel est__intro");
    const titleId = uid("intro");
    intro.setAttribute("aria-labelledby", titleId);
    const title = el("h2", "est__intro-title", "Як рахувати на серветці");
    title.id = titleId;

    const tips = el("ul", "est__tips");
    for (const tip of [
      "Округлюйте сміливо: 86 400 ≈ 10^5, 1 024 ≈ 10^3. На співбесіді оцінюють порядок, а не точність до цифри.",
      "1 доба ≈ 10^5 с: мільйон подій на добу — це лише ≈ 10 req/s.",
      "Пік ≈ 2× середнього. Проєктуйте на пік, а не на середнє.",
      "Пишіть одиниці на кожному кроці: половина промахів — це GB замість TB чи біти замість байтів.",
    ]) {
      tips.append(el("li", "", tip));
    }

    const scale = el("p", "text muted est__intro-scale",
      "Зірки ставимо за відношенням до еталона, а не за різницею: промах у 2× на 10 req/s і на 10 млн req/s однаково добрий.");
    const foot = el("div", "est__intro-foot");
    foot.append(codexButton(INTRO_CODEX, "Техніка оцінок у довіднику →"));
    intro.append(title, tips, scale, foot);
    return intro;
  }

  function renderCard(problem) {
    const entry = entryFor(ctx.store, problem.id);
    const card = el("article", "est__card");
    card.dataset.status = cardStatus(entry);
    const titleId = uid("card");
    card.setAttribute("aria-labelledby", titleId);

    const top = el("div", "est__card-top");
    const level = difficultyOf(problem);
    top.append(
      chip(level.tag, level.tone),
      chip(`${problem.asks.length} ${plural(problem.asks.length, ["запитання", "запитання", "запитань"])}`),
    );

    const title = el("h3", "est__card-title", problem.title);
    title.id = titleId;

    const stats = el("div", "est__card-stats");
    stats.append(starsEl(entry.bestStars, MAX_STARS), el("span", "est__attempts", attemptsText(entry.attempts)));

    const solve = button("Розв'язати", { variant: "primary", onClick: () => openProblem(problem.id) });
    // Однакові «Розв'язати» на кожній картці скрінрідер не розрізнить — додаємо назву задачі.
    solve.setAttribute("aria-label", `Розв'язати: ${problem.title}`);
    solve.dataset.problem = problem.id;
    const foot = el("div", "est__card-foot");
    foot.append(solve);

    card.append(top, title, stats, foot);
    return { card, solve };
  }

  function renderList() {
    const nodes = [];
    let focusTarget = null;

    if (state.missingId) {
      const notice = el("p", "notice est__missing", `Задачу «${state.missingId}» не знайдено — оберіть іншу зі списку.`);
      notice.dataset.tone = "warn";
      nodes.push(notice);
      state.missingId = null;
    }

    nodes.push(renderIntro());

    for (const group of groupByDifficulty(ESTIMATES)) {
      const block = el("section", "est__group");
      block.dataset.level = String(group.level);
      const titleId = uid("group");
      block.setAttribute("aria-labelledby", titleId);

      const earned = group.problems.reduce((sum, p) => sum + entryFor(ctx.store, p.id).bestStars, 0);
      const total = group.problems.length * MAX_STARS;
      const groupHead = el("div", "est__group-head");
      const title = el("h2", "est__group-title", group.title);
      title.id = titleId;
      const score = el("span", "est__group-score", `★ ${earned}/${total}`);
      score.setAttribute("aria-label", `Зібрано ${earned} з ${total} зірок`);
      groupHead.append(title, score);
      block.append(groupHead);
      if (group.lead) block.append(el("p", "est__group-lead", group.lead));

      const grid = el("div", "grid-cards est__cards");
      for (const problem of group.problems) {
        const { card, solve } = renderCard(problem);
        if (problem.id === state.lastProblemId) focusTarget = solve;
        grid.append(card);
      }
      block.append(grid);
      nodes.push(block);
    }

    return { nodes, focusTarget };
  }

  // ─────────── задача ───────────

  function renderMeta(container, problem) {
    const entry = entryFor(ctx.store, problem.id);
    const level = difficultyOf(problem);
    const best = el("span", "est__best");
    best.append(el("span", "est__best-label", "Рекорд:"), starsEl(entry.bestStars, MAX_STARS));
    container.replaceChildren(chip(level.tag, level.tone), best, el("span", "est__attempts", attemptsText(entry.attempts)));
  }

  function buildField(ask) {
    const field = el("div", "est__field");
    field.dataset.state = "idle";
    field.dataset.ask = ask.id;

    const inputId = uid("ask");
    const hintId = uid("hint");
    const errorId = uid("err");

    const label = el("label", "est__label", ask.label);
    label.htmlFor = inputId;

    const control = el("div", "est__control");
    const input = el("input", "est__input");
    input.id = inputId;
    input.type = "text";
    input.name = ask.id;
    input.setAttribute("inputmode", "decimal");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("spellcheck", "false");
    input.setAttribute("aria-describedby", hintId);
    const unit = el("span", "est__unit", ask.unit);
    // Одиниця вже озвучена в підказці, тож тег біля поля для скрінрідера зайвий.
    unit.setAttribute("aria-hidden", "true");
    control.append(input, unit);

    const hint = el("p", "est__hint", `${FORMAT_HINT}; одиниця — ${ask.unit}`);
    hint.id = hintId;
    const error = el("p", "est__error");
    error.id = errorId;
    error.hidden = true;
    const verdict = el("div", "est__verdict");
    verdict.hidden = true;

    field.append(label, control, hint, error, verdict);

    function clearError() {
      if (field.dataset.state !== "invalid") return;
      field.dataset.state = "idle";
      error.hidden = true;
      error.textContent = "";
      input.removeAttribute("aria-invalid");
      input.setAttribute("aria-describedby", hintId);
    }

    function showError(kind) {
      field.dataset.state = "invalid";
      error.textContent = inputErrorMessage(kind, input.value.trim());
      error.hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", `${errorId} ${hintId}`);
    }

    function showVerdict(result) {
      clearError();
      field.dataset.state = "graded";
      field.dataset.stars = String(result.stars);
      input.readOnly = true;

      const line = el("div", "est__verdict-line");
      const dev = el("span", "est__dev", result.deviation.text);
      dev.dataset.dir = result.deviation.dir;
      line.append(starsEl(result.stars, MAX_STARS), dev);

      const compare = el("dl", "est__compare");
      compare.append(
        el("dt", "", "Ваше"),
        el("dd", "", formatUnit(result.value, ask.unit)),
        el("dt", "", "Еталон"),
        el("dd", "", formatUnit(result.expected, ask.unit)),
      );
      verdict.replaceChildren(line, compare);
      if (result.stars === 0) {
        verdict.append(el("p", "est__miss", "Промах більш ніж на порядок: звірте одиниці й крок із добою."));
      }
      verdict.hidden = false;
    }

    input.addEventListener("input", clearError);
    return { ask, field, input, showError, clearError, showVerdict };
  }

  function renderProblem(problem) {
    const g = pickVariant(problem, state.seed);
    const article = el("article", "est__problem");
    article.dataset.phase = "input";
    const titleId = uid("problem");
    article.setAttribute("aria-labelledby", titleId);

    // ── умова ──
    const task = el("section", "panel est__task");
    const top = el("div", "est__task-top");
    const back = button("← До списку", { variant: "ghost", onClick: showList });
    const meta = el("div", "est__meta");
    renderMeta(meta, problem);
    top.append(back, meta);

    const title = el("h2", "est__title", problem.title);
    title.id = titleId;
    title.tabIndex = -1;

    const prompt = el("p", "est__prompt", problem.prompt(g));
    const assumptions = section("Припущення", "est__assumptions");
    const list = el("ul", "est__assumption-list");
    for (const item of problem.assumptions) list.append(el("li", "", item));
    assumptions.append(list);
    task.append(top, title, prompt, assumptions);

    // ── форма ──
    const form = el("form", "panel est__form");
    form.noValidate = true;
    form.setAttribute("aria-label", "Ваші оцінки");
    const formTitle = el("h3", "section__title", "Ваші оцінки");
    const tolerances = [...new Set(problem.asks.map((a) => a.tolerance))].map((t) => `${formatNumber(t)}×`).join(" / ");
    const scale = el("p", "est__scale muted",
      `★★★ — майже точно, ★★ — у межах допуску (до ${tolerances}), ★ — правильний порядок. Оцінка за задачу — за найслабшою відповіддю.`);

    const fields = problem.asks.map(buildField);
    const fieldsBox = el("div", "est__fields");
    fieldsBox.append(...fields.map((f) => f.field));

    const actions = el("div", "est__actions");
    const check = button("Перевірити", { variant: "primary", type: "submit" });
    // Постійний live-регіон: повідомлення в елементі, що щойно з'явився, скрінрідери часто пропускають.
    const status = el("p", "est__status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    actions.append(check, status);
    form.append(formTitle, scale, fieldsBox, actions);

    // ── результат ──
    const result = el("section", "panel est__result");
    result.hidden = true;
    result.tabIndex = -1;
    const resultTitleId = uid("result");
    result.setAttribute("aria-labelledby", resultTitleId);
    // aria-live на самій панелі не ставимо: вона з'являється з hidden, і такі
    // регіони озвучуються ненадійно, а разом із переходом фокусу — ще й двічі.
    // Підсумок озвучує постійний status, а подробиці — фокус на панелі.

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (article.dataset.phase === "checked") return;

      const raw = Object.fromEntries(fields.map((f) => [f.ask.id, f.input.value]));
      const report = checkAnswers(problem, g, raw);

      if (!report.valid) {
        let firstInvalid = null;
        for (const f of fields) {
          const kind = report.errors[f.ask.id];
          if (kind) {
            f.showError(kind);
            firstInvalid ??= f.input;
          } else {
            f.clearError();
          }
        }
        const count = Object.keys(report.errors).length;
        status.textContent = `${count} ${plural(count, ["поле потребує", "поля потребують", "полів потребують"])} виправлення — перевірку не зараховано.`;
        firstInvalid?.focus();
        return;
      }

      const prevBest = entryFor(ctx.store, problem.id).bestStars;
      ctx.store.update((progress) => {
        progress.estimate ??= {};
        progress.estimate[problem.id] = recordAttempt(progress.estimate[problem.id], report.stars);
      });

      article.dataset.phase = "checked";
      for (const f of fields) f.showVerdict(report.answers[f.ask.id]);
      check.hidden = true;
      renderMeta(meta, problem);
      fillResult(result, resultTitleId, problem, g, report, report.stars > prevBest);
      result.hidden = false;
      status.textContent = `Перевірено: ${report.stars} з ${MAX_STARS} зірок.`;
      result.focus();
    });

    article.append(task, form, result);
    return { nodes: [article], focusTarget: title };
  }

  function fillResult(result, titleId, problem, g, report, isRecord) {
    const headRow = el("div", "est__result-head");
    const title = el("h3", "est__result-title", "Результат");
    title.id = titleId;
    headRow.append(title, starsEl(report.stars, MAX_STARS));
    if (isRecord) headRow.append(chip("Новий рекорд", "good"));

    const summary = el("p", "est__summary", VERDICTS[report.stars] ?? VERDICTS[0]);

    const steps = section("Розбір", "est__breakdown");
    const list = el("ol", "est__steps");
    for (const step of problem.steps(g)) list.append(el("li", "est__step", step));
    steps.append(list);

    const takeaway = el("div", "notice est__takeaway");
    takeaway.append(el("strong", "est__takeaway-label", "Висновок. "), document.createTextNode(problem.takeaway));

    const actions = el("div", "est__actions est__result-actions");
    actions.append(
      button("Інший варіант", { variant: "primary", onClick: () => anotherVariant(problem) }),
      button("До списку", { onClick: showList }),
      codexButton(problem.codexRef, "Читати в довіднику"),
    );

    result.dataset.stars = String(report.stars);
    result.replaceChildren(headRow, summary, steps, takeaway, actions);
  }

  // ─────────── старт ───────────

  const initialId = params?.id;
  if (initialId) {
    const problem = findProblem(initialId);
    if (problem) {
      state.problemId = initialId;
      state.seed = nextSeed(problem, null, Date.now());
    } else {
      state.missingId = initialId;
      ctx.setParams({});
    }
  }
  // Під час першого монтування фокус не чіпаємо: його має право ставити роутер.
  render();

  return {
    unmount() {
      sheet.destroy();
      root.remove();
    },
  };
}
