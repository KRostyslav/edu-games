import { el, modal } from "@edu/pixel-ui";
import { CODEX, CODEX_GROUPS } from "../data/encyclopedia.js";

/**
 * Довідник. Доступний будь-коли, незалежно від місяця — знання не мусить
 * бути прив'язаним до моменту, коли воно знадобилося.
 */
export function openCodex(articleId = null) {
  const dialog = modal({ title: "Довідник виноградаря", wide: true });

  const layout = el("div", "codex");
  const nav = el("nav", "codex__nav");
  const view = el("article", "codex__view");
  layout.append(nav, view);
  dialog.body.append(layout);

  const links = new Map();

  for (const group of CODEX_GROUPS) {
    nav.append(el("h3", "codex__group", group));
    const list = el("ul", "codex__list");
    for (const [id, article] of Object.entries(CODEX)) {
      if (article.group !== group) continue;
      const item = el("li");
      const link = el("button", "codex__link", article.title);
      link.type = "button";
      link.addEventListener("click", () => show(id));
      item.append(link);
      list.append(item);
      links.set(id, link);
    }
    nav.append(list);
  }

  function show(id) {
    const article = CODEX[id];
    if (!article) return;
    view.replaceChildren();
    for (const link of links.values()) link.removeAttribute("data-active");
    links.get(id)?.setAttribute("data-active", "true");

    view.append(el("h3", "codex__title", article.title));
    for (const paragraph of article.text) {
      view.append(el("p", "codex__text", paragraph));
    }

    if (article.see?.length) {
      const related = el("div", "codex__see");
      related.append(el("span", "codex__see-label", "Пов'язане:"));
      for (const refId of article.see) {
        if (!CODEX[refId]) continue;
        const link = el("button", "codex__ref", CODEX[refId].title);
        link.type = "button";
        link.addEventListener("click", () => show(refId));
        related.append(link);
      }
      view.append(related);
    }
    view.scrollTop = 0;
  }

  show(articleId && CODEX[articleId] ? articleId : Object.keys(CODEX)[0]);

  const close = el("button", "btn", "Закрити");
  close.type = "button";
  close.addEventListener("click", dialog.hide);
  dialog.foot.append(close);

  dialog.show();
  return dialog;
}
