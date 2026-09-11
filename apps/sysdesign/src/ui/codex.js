import "./codex.css";

/**
 * Довідник: стаття, модалка зі статтею й повноекранний довідник із глосарієм.
 *
 * Логіка без DOM (групування, пошук, лічильники прочитаного, історія модалки,
 * параметри hash) винесена в чисті експортовані функції нагорі файлу: їх можна
 * перевірити в Node без браузера, а рендер нижче лише розкладає готову модель
 * по елементах. Так помилка в підрахунку «прочитано» не ховається за DOM.
 *
 * Одна `renderArticle` обслуговує і модалку, і повний довідник: стаття має
 * виглядати однаково, звідки б гравець її не відкрив, інакше «та сама» тема
 * в двох місцях читається як дві різні.
 */

import { modal } from "@edu/pixel-ui";
import { el, button, chip, section, paragraphs } from "./widgets.js";
import { CODEX, CODEX_GROUPS, CODEX_IDS, GLOSSARY, searchCodex, searchGlossary } from "../data/codex/index.js";

// ─────────────────────────── чиста логіка ───────────────────────────

/**
 * Чи є така стаття. `CODEX[id]` не годиться: id приходить із hash, і
 * «constructor» чи «__proto__» знайшлися б у прототипі об'єкта.
 */
export function hasArticle(id) {
  return typeof id === "string" && Object.hasOwn(CODEX, id);
}

/** Id статей кожної групи в порядку показу — рахуємо раз, бо контент статичний. */
const GROUP_IDS = new Map(CODEX_GROUPS.map((group) => [group, CODEX_IDS.filter((id) => CODEX[id].group === group)]));

/**
 * Рядок trade-off → знак, тон і текст без знака. Дефіс приймаємо як мінус:
 * автори контенту їх плутають, а гравець не має бачити «зламаний» пункт.
 */
export function tradeoffParts(line) {
  const text = String(line ?? "");
  const match = /^([+−-])\s*/.exec(text);
  if (!match) return { sign: null, tone: null, text: text.trim() };
  const sign = match[1] === "+" ? "+" : "−";
  return { sign, tone: sign === "+" ? "good" : "bad", text: text.slice(match[0].length).trim() };
}

/**
 * Розкладає id по групах у порядку `CODEX_GROUPS`, зберігаючи порядок id
 * всередині групи. Для пошуку це порядок релевантності, для порожнього
 * запиту — порядок довідника. Порожні групи викидаються.
 */
export function groupIds(ids, codex = CODEX, groups = CODEX_GROUPS) {
  return groups
    .map((group) => ({ group, ids: ids.filter((id) => Object.hasOwn(codex, id) && codex[id].group === group) }))
    .filter((entry) => entry.ids.length > 0);
}

/** Групи навігації під пошуковий запит. */
export function navGroups(query = "") {
  return groupIds(searchCodex(String(query ?? "")));
}

/**
 * Скільки з `ids` прочитано. Рахуємо по відомих id, а не по ключах `read`:
 * у збереженні можуть лишитися id видалених статей, і тоді вийшло б «49 / 48».
 */
export function countRead(read, ids = CODEX_IDS) {
  const map = read ?? {};
  return ids.reduce((sum, id) => sum + (map[id] === true ? 1 : 0), 0);
}

/** Прогрес по кожній групі — завжди по всій групі, незалежно від пошуку. */
export function groupProgress(read) {
  return CODEX_GROUPS.map((group) => {
    const ids = GROUP_IDS.get(group);
    const done = countRead(read, ids);
    return { group, read: done, total: ids.length, complete: ids.length > 0 && done === ids.length };
  });
}

/** Перші статті груп: з них вступ радить починати, бо решта на них спирається. */
export function starterIds() {
  return CODEX_GROUPS.map((group) => GROUP_IDS.get(group)[0]).filter(Boolean);
}

/** Перша непрочитана стаття в порядку довідника або null, якщо прочитано все. */
export function nextUnread(read) {
  const map = read ?? {};
  return CODEX_IDS.find((id) => map[id] !== true) ?? null;
}

/** Літера-розділ глосарія; цифри — окремий розділ, щоб «2PC» не губився серед латиниці. */
export function glossaryLetter(term) {
  const first = String(term ?? "").trim().charAt(0);
  if (!first) return "#";
  if (/\d/.test(first)) return "0–9";
  return first.toLocaleUpperCase("uk");
}

/**
 * Розділи глосарія за першою літерою. Не сортуємо: `GLOSSARY` уже впорядкований
 * через localeCompare("uk"), а результати пошуку зберігають цей порядок.
 */
export function glossarySections(entries = GLOSSARY) {
  const sections = new Map();
  for (const entry of entries) {
    const letter = glossaryLetter(entry.term);
    if (!sections.has(letter)) sections.set(letter, []);
    sections.get(letter).push(entry);
  }
  return [...sections].map(([letter, items]) => ({ letter, items }));
}

/** Параметри маршруту → стан довідника. Невідомий id — це вступ, а не порожній екран. */
export function normalizeCodexParams(params) {
  const id = hasArticle(params?.id) ? params.id : null;
  const tab = params?.tab === "glossary" ? "glossary" : "articles";
  return { tab, id };
}

/**
 * Стан довідника → параметри hash. Вкладка статей — типова, тож її не пишемо,
 * а id лишаємо й для глосарія: після перезавантаження повернеться та сама стаття.
 */
export function codexParams(tab, id) {
  const params = {};
  if (tab === "glossary") params.tab = "glossary";
  if (hasArticle(id)) params.id = id;
  return params;
}

/** Українська множина: pluralUk(3, ["стаття", "статті", "статей"]) → "статті". */
export function pluralUk(n, [one, few, many]) {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Історія переходів у модалці. Стек обмежений: хтось може годину ходити
 * по «Пов'язаному», а «Назад» потрібен на кілька кроків, не на сотні.
 */
export function createArticleHistory(first, limit = 50) {
  const stack = [];
  let current = first;
  return {
    get current() {
      return current;
    },
    get canBack() {
      return stack.length > 0;
    },
    get depth() {
      return stack.length;
    },
    /** Перехід на нову статтю; повторний клік на поточну не засмічує стек. */
    open(id) {
      if (id === current) return false;
      stack.push(current);
      if (stack.length > limit) stack.shift();
      current = id;
      return true;
    },
    back() {
      if (!stack.length) return null;
      current = stack.pop();
      return current;
    },
  };
}

/** Прочитані статті зі стану; стан міг прийти битим, тож без довіри до форми. */
export function readMapOf(store) {
  const read = store?.state?.codex?.read;
  return read && typeof read === "object" ? read : {};
}

/**
 * Позначає статтю прочитаною. Уже прочитану не чіпаємо: `update` будить
 * підписників і планує запис у localStorage, а зміни тут немає.
 */
export function markRead(store, id) {
  if (!store?.update || !hasArticle(id) || readMapOf(store)[id] === true) return false;
  store.update((state) => {
    if (!state.codex || typeof state.codex !== "object") state.codex = { read: {} };
    if (!state.codex.read || typeof state.codex.read !== "object") state.codex.read = {};
    state.codex.read[id] = true;
  });
  return true;
}

// ─────────────────────────── стаття ───────────────────────────

let seq = 0;
/** Унікальні id для зв'язок label/aria: довідник і модалка можуть бути відкриті одночасно. */
const uid = (prefix) => `${prefix}-${++seq}`;

function relatedList(refs, onLink) {
  const list = el("ul", "codex__related-list");
  for (const ref of refs) {
    const item = el("li", "codex__related-item");
    const link = button(CODEX[ref].title, { variant: "ghost", onClick: () => onLink(ref) });
    link.classList.add("codex__related-link");
    item.append(link);
    list.append(item);
  }
  return list;
}

function relatedRefs(id) {
  return hasArticle(id) ? (CODEX[id].see ?? []).filter(hasArticle) : [];
}

function bulletList(items, className) {
  const list = el("ul", className);
  for (const text of items) list.append(el("li", "codex__bullet", text));
  return list;
}

/**
 * Стаття довідника. `compact` — для модалки: заголовок там уже в шапці вікна
 * (тож тут він лишається тільки для скрінрідера), а «Пов'язане» модалка
 * виносить у футер, щоб переходи були під рукою без прокрутки до кінця.
 */
export function renderArticle(id, { onLink, compact = false } = {}) {
  const root = el("article", "codex__article");
  root.dataset.compact = String(Boolean(compact));

  if (!hasArticle(id)) {
    root.dataset.missing = "true";
    const note = el("p", "notice", `Статті «${id ?? ""}» у довіднику немає. Спробуйте знайти тему пошуком.`);
    note.dataset.tone = "warn";
    root.append(note);
    return root;
  }

  const entry = CODEX[id];
  root.dataset.id = id;

  const head = el("header", "codex__head");
  const title = el("h2", compact ? "codex__title visually-hidden" : "codex__title", entry.title);
  // Фокус сюди переводить довідник після вибору статті: клавіатурний
  // користувач і скрінрідер опиняються на початку нового тексту.
  title.tabIndex = -1;
  head.append(title, chip(entry.group, "info"));
  root.append(head, el("p", "codex__lead", entry.summary));

  if (entry.diagram) {
    const figure = el("figure", "codex__figure");
    const pre = el("pre", "codex__diagram", entry.diagram);
    // Схема ширша за телефон і прокручується вбік — фокус дає зробити це з клавіатури.
    pre.tabIndex = 0;
    figure.append(el("figcaption", "codex__caption", "Схема"), pre);
    root.append(figure);
  }

  if (entry.how) {
    const how = section("Як це працює", "codex__block");
    how.append(...paragraphs(entry.how, "text codex__text"));
    root.append(how);
  }

  if (entry.tradeoffs?.length) {
    const block = section("Trade-offs", "codex__block");
    const list = el("ul", "codex__tradeoffs");
    for (const line of entry.tradeoffs) {
      const { sign, tone, text } = tradeoffParts(line);
      const item = el("li", "codex__tradeoff");
      if (tone) item.dataset.tone = tone;
      // Знак — окремий квадратик із символом: колір лише підсилює, а не
      // несе сенс, тож плюси й мінуси розрізняє і дальтонік, і скрінрідер.
      const mark = el("span", "codex__mark", sign ?? "•");
      mark.setAttribute("aria-hidden", "true");
      item.append(mark);
      if (sign) item.append(el("span", "visually-hidden", sign === "+" ? "Плюс: " : "Мінус: "));
      item.append(el("span", "codex__tradeoff-text", text));
      list.append(item);
    }
    block.append(list);
    root.append(block);
  }

  if (entry.numbers?.length) {
    const block = section("Цифри, які варто пам'ятати", "codex__block");
    block.append(bulletList(entry.numbers, "codex__numbers"));
    root.append(block);
  }

  if (entry.interview?.length) {
    const block = section("На співбесіді", "codex__block codex__callout");
    block.dataset.kind = "interview";
    block.append(bulletList(entry.interview, "codex__points"));
    root.append(block);
  }

  if (entry.inGame) {
    const block = section("У грі", "codex__block codex__callout");
    block.dataset.kind = "game";
    block.append(...paragraphs(entry.inGame, "text codex__text"));
    root.append(block);
  }

  // Без обробника кнопки нікуди б не вели — краще не показувати їх зовсім.
  const refs = relatedRefs(id);
  if (!compact && onLink && refs.length) {
    const block = section("Пов'язане", "codex__block codex__related");
    block.append(relatedList(refs, onLink));
    root.append(block);
  }

  return root;
}

// ─────────────────────────── модалка ───────────────────────────

/**
 * Стаття поверх гри: гравець не втрачає схему, яку будує. Переходи
 * «Пов'язаного» лишаються всередині вікна, а «Назад» повертає ланцюжком.
 */
export function openCodexModal(id, ctx = {}) {
  const history = createArticleHistory(id);
  const dialog = modal({ title: hasArticle(id) ? CODEX[id].title : "Довідник", wide: true });

  // pixel-ui не ставить ролей діалогу — додаємо, щоб скрінрідер знав, де він.
  dialog.box.classList.add("codex__modal");
  dialog.box.setAttribute("role", "dialog");
  dialog.box.setAttribute("aria-modal", "true");
  dialog.heading.id = uid("codex-modal-title");
  dialog.box.setAttribute("aria-labelledby", dialog.heading.id);
  dialog.box.tabIndex = -1;
  dialog.foot.classList.add("codex__modal-foot");

  const related = el("div", "codex__foot-related");
  const back = button("← Назад", {
    variant: "ghost",
    title: "До попередньої статті",
    onClick: () => {
      const prev = history.back();
      if (prev) show(prev, { refocus: true });
    },
  });
  const full = button("Відкрити в довіднику", {
    variant: "primary",
    onClick: () => {
      const current = history.current;
      dialog.hide();
      ctx.go?.("codex", { id: current });
    },
  });
  const actions = el("div", "codex__foot-actions");
  actions.append(back, full);
  dialog.foot.append(related, actions);

  function follow(ref) {
    if (history.open(ref)) show(ref, { refocus: true });
  }

  function show(articleId, { refocus = false } = {}) {
    const known = hasArticle(articleId);
    dialog.heading.textContent = known ? CODEX[articleId].title : "Довідник";
    dialog.body.replaceChildren(renderArticle(articleId, { onLink: follow, compact: true }));

    const refs = relatedRefs(articleId);
    related.replaceChildren();
    if (refs.length) related.append(el("span", "codex__related-label", "Пов'язане:"), relatedList(refs, follow));
    related.hidden = refs.length === 0;

    back.hidden = !history.canBack;
    full.disabled = !known;
    dialog.body.scrollTop = 0;
    markRead(ctx.store, articleId);
    // Натиснута кнопка щойно зникла разом зі старим футером — без цього фокус
    // випав би на <body>, і Tab повів би клавіатуру під модалку.
    if (refocus) dialog.box.focus({ preventScroll: true });
  }

  show(history.current);
  dialog.show();
  return dialog;
}

// ─────────────────────────── повний довідник ───────────────────────────

const TABS = [
  ["articles", "Статті"],
  ["glossary", "Глосарій"],
];

/**
 * Повноекранний довідник: вкладки «Статті» й «Глосарій».
 *
 * Навігацію будуємо заново лише при зміні пошуку, а вибір статті й позначки
 * прочитаного оновлюють наявні кнопки на місці: інакше список стрибав би,
 * а прокрутка й фокус губилися б на кожному кліку.
 */
export function mountCodex(host, ctx = {}, params = {}) {
  const start = normalizeCodexParams(params);
  const state = { tab: start.tab, id: start.id, query: "", glossaryQuery: "" };
  const total = CODEX_IDS.length;
  const readMap = () => readMapOf(ctx.store);

  const root = el("div", "page codex");

  // --- шапка з прогресом ---
  const head = el("header", "page__head codex__page-head");
  const heading = el("div", "codex__heading");
  heading.append(
    el("h1", "page__title", "Довідник"),
    el("p", "page__lead", "Механізми, trade-offs і цифри, про які питають на System Design-співбесідах."),
  );
  const progress = el("div", "codex__progress");
  const progressText = el("span", "codex__progress-text");
  progressText.id = uid("codex-progress");
  const track = el("div", "codex__progress-track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", String(total));
  track.setAttribute("aria-labelledby", progressText.id);
  const fill = el("div", "codex__progress-fill");
  track.append(fill);
  progress.append(progressText, track);
  head.append(heading, progress);

  // --- вкладки ---
  const tablist = el("div", "tabs codex__tabs");
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", "Розділи довідника");
  const tabs = {};
  const panels = {};
  for (const [key, label] of TABS) {
    const tab = el("button", "tabs__tab codex__tab", label);
    tab.type = "button";
    tab.id = uid(`codex-tab-${key}`);
    tab.setAttribute("role", "tab");
    const panel = el("div", "codex__tabpanel");
    panel.id = uid(`codex-panel-${key}`);
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    tab.setAttribute("aria-controls", panel.id);
    tab.addEventListener("click", () => setTab(key));
    tab.addEventListener("keydown", onTabKey);
    tabs[key] = tab;
    panels[key] = panel;
    tablist.append(tab);
  }

  // --- вкладка «Статті»: навігація + стаття ---
  const layout = el("div", "codex__layout");
  const side = el("aside", "codex__side panel");
  const sideBody = el("div", "codex__side-body");
  sideBody.id = uid("codex-toc");

  // На широкому екрані кнопка схована стилями, і навігація видна завжди;
  // на вузькому вона згортає зміст, щоб стаття не опинялася під 48 пунктами.
  const toggle = el("button", "codex__toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-controls", sideBody.id);
  const toggleLabel = el("span", "codex__toggle-label");
  const toggleCount = el("span", "codex__toggle-count");
  toggle.append(toggleLabel, toggleCount);
  toggle.addEventListener("click", () => setOpen(side.dataset.open !== "true"));

  const home = el("button", "codex__link codex__home");
  home.type = "button";
  home.append(el("span", "codex__check", "?"), el("span", "codex__link-title", "Як користуватися"));
  home.firstChild.setAttribute("aria-hidden", "true");
  home.addEventListener("click", () => select(null, { user: true }));

  const searchBox = el("div", "codex__search");
  searchBox.setAttribute("role", "search");
  const searchInput = searchField(searchBox, "Пошук статей", "кеш, Kafka, CAP…");
  const found = el("p", "codex__found muted");
  found.setAttribute("aria-live", "polite");

  const nav = el("nav", "codex__nav");
  nav.setAttribute("aria-label", "Статті довідника");

  sideBody.append(searchBox, found, home, nav);
  side.append(toggle, sideBody);

  const main = el("div", "codex__main panel");
  layout.append(side, main);
  panels.articles.append(layout);

  // --- вкладка «Глосарій» ---
  const glossary = el("section", "codex__glossary panel");
  const glossaryHead = el("div", "codex__glossary-head");
  glossaryHead.append(
    el("h2", "codex__title", "Глосарій"),
    el("p", "codex__lead", "Коротко про терміни, які звучать на співбесіді. За механізмом і trade-offs — кнопка «→ стаття»."),
  );
  const glossarySearch = el("div", "codex__search codex__search--glossary");
  glossarySearch.setAttribute("role", "search");
  const glossaryInput = searchField(glossarySearch, "Пошук у глосарії", "idempotency, шард, p99…");
  const glossaryCount = el("p", "codex__found muted");
  glossaryCount.setAttribute("aria-live", "polite");
  const alphabet = el("nav", "codex__alphabet");
  alphabet.setAttribute("aria-label", "Літери глосарія");
  const glossaryList = el("div", "codex__letters");
  glossary.append(glossaryHead, glossarySearch, glossaryCount, alphabet, glossaryList);
  panels.glossary.append(glossary);

  root.append(head, tablist, panels.articles, panels.glossary);

  // --- навігація ---
  const links = new Map();
  const groupEls = new Map();
  let starters = [];

  function renderNav() {
    links.clear();
    groupEls.clear();
    const groups = navGroups(state.query);
    const blocks = groups.map(({ group, ids }) => {
      const block = el("section", "codex__group");
      const title = el("h2", "codex__group-title");
      const count = el("span", "codex__group-count");
      title.append(el("span", "codex__group-name", group), count);
      const list = el("ul", "codex__list");
      for (const id of ids) {
        const link = el("button", "codex__link");
        link.type = "button";
        const check = el("span", "codex__check");
        check.setAttribute("aria-hidden", "true");
        const status = el("span", "visually-hidden");
        link.append(check, el("span", "codex__link-title", CODEX[id].title), status);
        link.addEventListener("click", () => select(id, { user: true }));
        links.set(id, { link, check, status });
        const item = el("li", "codex__item");
        item.append(link);
        list.append(item);
      }
      block.append(title, list);
      groupEls.set(group, { block, count });
      return block;
    });
    nav.replaceChildren(...blocks);

    const query = state.query.trim();
    const hits = groups.reduce((sum, entry) => sum + entry.ids.length, 0);
    found.textContent = query ? `Знайдено ${hits} ${pluralUk(hits, ["статтю", "статті", "статей"])}` : "";
    home.hidden = Boolean(query);
    if (query && !hits) nav.append(emptyArticles(query));
    syncNav();
  }

  /** Порожній пошук не має бути глухим кутом: термін міг жити лише в глосарії. */
  function emptyArticles(query) {
    const box = el("div", "codex__empty");
    box.append(el("p", "codex__empty-text", `За «${query}» статей немає.`));
    const terms = searchGlossary(query).length;
    if (terms) {
      box.append(
        button(`Шукати в глосарії (${terms})`, {
          variant: "ghost",
          onClick: () => {
            glossaryInput.value = query;
            state.glossaryQuery = query;
            renderGlossary();
            setTab("glossary");
            glossaryInput.focus();
          },
        }),
      );
    }
    return box;
  }

  /** Позначки активної й прочитаних статей, лічильники груп і загальний прогрес. */
  function syncNav() {
    const read = readMap();
    for (const [id, refs] of links) {
      const isRead = read[id] === true;
      const active = id === state.id;
      refs.link.dataset.read = String(isRead);
      refs.link.dataset.active = String(active);
      if (active) refs.link.setAttribute("aria-current", "page");
      else refs.link.removeAttribute("aria-current");
      refs.check.textContent = isRead ? "✓" : "";
      refs.status.textContent = isRead ? " (прочитано)" : "";
    }
    for (const { group, read: done, total: size, complete } of groupProgress(read)) {
      const refs = groupEls.get(group);
      if (!refs) continue;
      refs.count.textContent = `${done}/${size}`;
      refs.count.title = `Прочитано ${done} з ${size}`;
      refs.block.dataset.complete = String(complete);
    }
    const introActive = !state.id;
    home.dataset.active = String(introActive);
    if (introActive) home.setAttribute("aria-current", "page");
    else home.removeAttribute("aria-current");

    for (const { id, node, check } of starters) {
      const isRead = read[id] === true;
      node.dataset.read = String(isRead);
      check.textContent = isRead ? " ✓ прочитано" : "";
    }

    const done = countRead(read);
    progressText.textContent = `Прочитано ${done} / ${total}`;
    fill.style.width = `${total ? (done / total) * 100 : 0}%`;
    track.setAttribute("aria-valuenow", String(done));
    toggleCount.textContent = `${done}/${total}`;
  }

  function setOpen(open) {
    side.dataset.open = String(open);
    toggle.setAttribute("aria-expanded", String(open));
    toggleLabel.textContent = `${open ? "▾" : "▸"} Зміст`;
  }

  // --- основна колонка ---
  function renderMain() {
    starters = [];
    if (state.id) main.replaceChildren(renderArticle(state.id, { onLink: (ref) => select(ref, { user: true }) }));
    else main.replaceChildren(renderIntro());
  }

  function renderIntro() {
    const box = el("div", "codex__intro");
    const title = el("h2", "codex__title", "Як користуватися довідником");
    title.tabIndex = -1;
    box.append(
      title,
      el(
        "p",
        "codex__lead",
        `${total} коротких статей про те, з чого складається System Design-співбесіда: від DNS до шардування й розбору типових задач.`,
      ),
    );

    const steps = el("ol", "codex__steps");
    for (const text of [
      "Кожна стаття побудована однаково: суть в одному абзаці, схема, як це працює, trade-offs, цифри для оцінок і що казати на співбесіді.",
      "Шукайте за назвою або синонімом — «кеш», «Kafka», «SPOF»: пошук дивиться і в aliases, і в короткий опис.",
      "Статті відкриваються й просто з гри — з палітри компонентів, інспектора, брифу рівня, розбору, карток і співбесіди.",
      "Прочитане позначається ✓, прогрес видно вгорі й біля кожної групи.",
      `Глосарій — для швидкого «що це означало?»: ${GLOSSARY.length} ${pluralUk(GLOSSARY.length, ["термін", "терміни", "термінів"])} по 1–2 речення з переходом до статті.`,
    ]) {
      steps.append(el("li", "codex__step", text));
    }
    box.append(steps);

    const read = readMap();
    const next = nextUnread(read);
    if (next && countRead(read) > 0) {
      const resume = el("p", "notice codex__resume");
      resume.append(
        el("span", "codex__resume-text", "Далі за списком: "),
        button(CODEX[next].title, { variant: "primary", onClick: () => select(next, { user: true }) }),
      );
      box.append(resume);
    }

    const start = section("З чого почати", "codex__block");
    start.append(el("p", "text codex__text", "Перша стаття кожної групи — фундамент, на який спираються решта статей групи."));
    const list = el("ul", "codex__starters");
    for (const id of starterIds()) {
      const entry = CODEX[id];
      const node = el("button", "codex__starter");
      node.type = "button";
      const groupLine = el("span", "codex__starter-group", entry.group);
      const check = el("span", "codex__starter-check");
      groupLine.append(check);
      node.append(groupLine, el("span", "codex__starter-title", entry.title), el("span", "codex__starter-summary", entry.summary));
      node.addEventListener("click", () => select(id, { user: true }));
      starters.push({ id, node, check });
      const item = el("li", "codex__starter-item");
      item.append(node);
      list.append(item);
    }
    start.append(list);
    box.append(start);
    return box;
  }

  /** Вибір статті (null — вступ). `user` — дія людини: тоді оновлюємо hash, скрол і фокус. */
  function select(id, { user = false } = {}) {
    if (id != null && !hasArticle(id)) return;
    state.id = id;
    renderMain();
    if (state.tab === "articles" && id) markRead(ctx.store, id);
    syncNav();
    if (!user) return;
    ctx.setParams?.(codexParams("articles", id));
    setOpen(false);
    revealMain();
  }

  /** Початок статті — у видиму зону, а фокус — на її заголовок. */
  function revealMain() {
    const top = main.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight / 2) main.scrollIntoView({ block: "start" });
    main.querySelector(".codex__title")?.focus({ preventScroll: true });
  }

  // --- вкладки ---
  function setTab(tab, { silent = false } = {}) {
    state.tab = tab;
    root.dataset.tab = tab;
    for (const [key, node] of Object.entries(tabs)) {
      const on = key === tab;
      node.setAttribute("aria-selected", String(on));
      // Roving tabindex: Tab заходить лише на активну вкладку, стрілки — між ними.
      node.tabIndex = on ? 0 : -1;
      panels[key].hidden = !on;
    }
    // Статтю, відкриту з hash разом із глосарієм, зараховуємо, лише коли її справді показали.
    if (tab === "articles" && state.id && markRead(ctx.store, state.id)) syncNav();
    if (!silent) ctx.setParams?.(codexParams(tab, state.id));
  }

  function onTabKey(event) {
    const keys = TABS.map(([key]) => key);
    const index = keys.indexOf(state.tab);
    let next = null;
    if (event.key === "ArrowRight") next = keys[(index + 1) % keys.length];
    else if (event.key === "ArrowLeft") next = keys[(index - 1 + keys.length) % keys.length];
    else if (event.key === "Home") next = keys[0];
    else if (event.key === "End") next = keys[keys.length - 1];
    if (!next) return;
    event.preventDefault();
    setTab(next);
    tabs[next].focus();
  }

  // --- глосарій ---
  function renderGlossary() {
    const query = state.glossaryQuery.trim();
    const items = searchGlossary(query);
    const sections = glossarySections(items);

    glossaryCount.textContent = query
      ? `Знайдено ${items.length} ${pluralUk(items.length, ["термін", "терміни", "термінів"])}`
      : `${items.length} ${pluralUk(items.length, ["термін", "терміни", "термінів"])}`;

    alphabet.replaceChildren();
    glossaryList.replaceChildren();
    if (!items.length) {
      alphabet.hidden = true;
      glossaryList.append(el("p", "codex__empty-text", `За «${query}» у глосарії нічого немає. Спробуйте пошук статей.`));
      return;
    }

    for (const { letter, items: entries } of sections) {
      const block = el("section", "codex__letter-block");
      const title = el("h3", "codex__letter", letter);
      title.id = uid("codex-letter");
      title.tabIndex = -1;
      block.setAttribute("aria-labelledby", title.id);

      const jump = el("button", "codex__alphabet-link", letter);
      jump.type = "button";
      jump.title = `Терміни на «${letter}»`;
      jump.addEventListener("click", () => {
        title.scrollIntoView({ block: "start" });
        title.focus({ preventScroll: true });
      });
      alphabet.append(jump);

      const list = el("dl", "codex__terms");
      for (const entry of entries) {
        const row = el("div", "codex__term");
        const def = el("dd", "codex__term-def");
        def.append(el("span", "codex__term-text", entry.def));
        if (hasArticle(entry.ref)) {
          const ref = entry.ref;
          const link = button("→ стаття", { variant: "ghost", title: `Стаття «${CODEX[ref].title}»`, onClick: () => openFromGlossary(ref) });
          link.classList.add("codex__term-ref");
          // Видимий текст однаковий у всіх рядках — назва статті потрібна скрінрідеру.
          link.append(el("span", "visually-hidden", `: ${CODEX[ref].title}`));
          def.append(" ", link);
        }
        row.append(el("dt", "codex__term-name", entry.term), def);
        list.append(row);
      }
      block.append(title, list);
      glossaryList.append(block);
    }
    // Абетка потрібна лише на довгому списку; на кількох знахідках вона — шум.
    alphabet.hidden = sections.length < 4;
  }

  function openFromGlossary(ref) {
    setTab("articles", { silent: true });
    select(ref, { user: true });
  }

  // --- пошук ---
  searchInput.addEventListener("input", () => {
    state.query = searchInput.value;
    renderNav();
  });
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      // Enter відкриває найрелевантнішу статтю — як у будь-якому пошуку документації.
      const first = searchCodex(state.query)[0];
      if (first && state.query.trim()) {
        event.preventDefault();
        select(first, { user: true });
      }
    } else if (event.key === "Escape" && searchInput.value) {
      event.preventDefault();
      searchInput.value = "";
      state.query = "";
      renderNav();
    }
  });
  glossaryInput.addEventListener("input", () => {
    state.glossaryQuery = glossaryInput.value;
    renderGlossary();
  });
  glossaryInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && glossaryInput.value) {
      event.preventDefault();
      glossaryInput.value = "";
      state.glossaryQuery = "";
      renderGlossary();
    }
  });

  // Прочитане може змінитися й поза довідником (модалка поверх нього) — тримаємо позначки свіжими.
  const unsubscribe = ctx.store?.subscribe?.(() => syncNav());

  renderNav();
  renderMain();
  renderGlossary();
  // Із вступу зміст корисніший відкритим; зі статті на телефоні — згорнутим над нею.
  setOpen(!state.id);
  setTab(state.tab, { silent: true });
  syncNav();
  host.append(root);

  return {
    unmount() {
      if (typeof unsubscribe === "function") unsubscribe();
      root.remove();
    },
  };
}

/** Поле пошуку з видимим <label>: плейсхолдер не підпис, він зникає при введенні. */
function searchField(container, label, placeholder) {
  const input = el("input", "codex__input");
  input.type = "search";
  input.id = uid("codex-search");
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.spellcheck = false;
  const caption = el("label", "codex__label", label);
  caption.htmlFor = input.id;
  container.append(caption, input);
  return input;
}
