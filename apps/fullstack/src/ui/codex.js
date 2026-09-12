/**
 * Довідник: список за актами, пошук і стаття. Та сама стаття відкривається
 * повноекранно (#/codex/<id>) і модальним вікном просто з рівня чи боса —
 * щоб не губити контекст задачі.
 */

import "./codex.css";
import { modal } from "@edu/pixel-ui";
import { CODEX, CODEX_GROUPS, CODEX_IDS, searchCodex } from "../data/codex.js";
import { el, button, paragraphs, codeBlock, chip, section } from "./widgets.js";

export function markRead(store, id) {
  if (!CODEX[id] || store.state.codex.read[id]) return;
  store.update((state) => (state.codex.read[id] = true));
}

/** Стаття як DOM. `onLink(id)` — перехід на іншу статтю. */
export function renderArticle(id, { ctx, onLink }) {
  const article = CODEX[id];
  const root = el("article", "codex__article");
  if (!article) {
    root.append(el("p", "muted", "Такої статті немає."));
    return root;
  }
  root.append(el("span", "codex__group", article.group), el("h2", "codex__title", article.title));
  if (article.aliases?.length) {
    const aliases = el("div", "row codex__aliases");
    for (const alias of article.aliases) aliases.append(chip(alias));
    root.append(aliases);
  }
  root.append(el("p", "codex__summary", article.summary));
  root.append(...paragraphs(article.how));

  for (const sample of article.code ?? []) root.append(codeBlock(sample.src, { lang: sample.lang, caption: sample.caption }));

  const lists = [
    ["Компроміси", article.tradeoffs],
    ["Цифри", article.numbers],
    ["На співбесіді", article.interview],
  ];
  for (const [title, items] of lists) {
    if (!items?.length) continue;
    const block = section(title);
    const ul = el("ul", "codex__list");
    for (const item of items) ul.append(el("li", "", item));
    block.append(ul);
    root.append(block);
  }

  if (article.frontendBridge) {
    const bridge = section("Місток із фронтенду");
    bridge.classList.add("debrief__bridge");
    bridge.append(...paragraphs(article.frontendBridge));
    root.append(bridge);
  }

  if (article.inGame?.length) {
    const block = section("Де це в грі");
    const row = el("div", "row");
    for (const item of article.inGame) {
      row.append(
        button(`${item.type === "boss" ? "☠" : "▸"} ${item.title}`, {
          variant: "ghost",
          onClick: () => ctx.go(item.type === "boss" ? "boss" : "level", { id: item.id }),
        }),
      );
    }
    block.append(row);
    root.append(block);
  }

  if (article.see?.length) {
    const block = section("Дивіться також");
    const row = el("div", "row");
    for (const ref of article.see) if (CODEX[ref]) row.append(button(CODEX[ref].title, { onClick: () => onLink(ref) }));
    block.append(row);
    root.append(block);
  }
  return root;
}

/** Стаття в модальному вікні з власною історією «назад». */
export function openCodexModal(id, ctx) {
  const dialog = modal({ title: "Довідник", wide: true });
  const history = [];
  const back = button("← Назад", { onClick: () => history.length > 1 && (history.pop(), show(history.pop())) });
  const full = button("Відкрити в довіднику", { onClick: () => (dialog.hide(), ctx.go("codex", { id: history.at(-1) })) });
  dialog.foot.append(back, full, button("Закрити", { variant: "primary", onClick: () => dialog.hide() }));

  function show(target) {
    history.push(target);
    back.disabled = history.length < 2;
    markRead(ctx.store, target);
    dialog.body.replaceChildren(
      renderArticle(target, {
        ctx: {
          ...ctx,
          go: (...args) => {
            dialog.hide();
            ctx.go(...args);
          },
        },
        onLink: show,
      }),
    );
    dialog.body.scrollTop = 0;
  }
  show(id);
  dialog.show();
}

export function mountCodex(host, ctx, params) {
  const { store } = ctx;
  const page = el("div", "page codex");
  const layout = el("div", "codex__layout");
  const nav = el("nav", "panel codex__nav");
  const pane = el("div", "panel codex__pane");
  layout.append(nav, pane);

  const head = el("div", "page__head");
  const titles = el("div");
  titles.append(el("h1", "page__title", "Довідник"), el("p", "page__lead", "Усе, що трапляється в грі, — з поясненнями, цифрами, питаннями зі співбесід і містком із фронтенду."));
  head.append(titles);
  page.append(head, layout);
  host.append(page);

  const search = el("input", "codex__search");
  search.type = "search";
  search.placeholder = "Пошук: CORS, індекс, event loop…";
  search.setAttribute("aria-label", "Пошук у довіднику");
  const list = el("div", "codex__groups");
  nav.append(search, list);

  let selected = CODEX[params.id] ? params.id : CODEX_IDS[0];

  function item(id) {
    const node = button(`${store.state.codex.read[id] ? "✓ " : ""}${CODEX[id].title}`, { variant: "ghost", onClick: () => open(id) });
    node.classList.add("codex__item");
    if (id === selected) node.setAttribute("aria-current", "true");
    return node;
  }

  function drawList() {
    list.replaceChildren();
    const query = search.value.trim();
    if (query) {
      const found = searchCodex(query);
      list.append(el("p", "muted", found.length ? `Знайдено: ${found.length}` : "Нічого не знайдено"));
      for (const id of found) list.append(item(id));
      return;
    }
    for (const group of CODEX_GROUPS) {
      const read = group.ids.filter((id) => store.state.codex.read[id]).length;
      const details = el("details", "codex__group-box");
      details.open = group.ids.includes(selected);
      details.append(el("summary", "", `${group.title} · ${read}/${group.ids.length}`));
      for (const id of group.ids) details.append(item(id));
      list.append(details);
    }
  }

  function open(id) {
    selected = id;
    ctx.setParams({ id });
    markRead(store, id);
    pane.replaceChildren(renderArticle(id, { ctx, onLink: open }));
    drawList();
    if (window.matchMedia?.("(max-width: 900px)").matches) pane.scrollIntoView({ block: "start" });
  }

  search.addEventListener("input", drawList);
  open(selected);
  return { unmount() {} };
}
