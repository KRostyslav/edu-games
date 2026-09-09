/**
 * Довідник. Відкривається як з топбару, так і з будь-якої картки дії —
 * гравець потрапляє сюди в момент, коли в нього виникло питання, а не тоді,
 * коли гра вирішила його повчити.
 */

import { el, modal } from "@edu/pixel-ui";
import { CODEX, CODEX_GROUPS } from "../data/encyclopedia.js";

export function openCodex(focusId = null) {
  const box = modal({ title: "Довідник", wide: true });
  const layout = el("div", "codex");

  const nav = el("nav", "codex__nav");
  const article = el("article", "codex__article");
  layout.append(nav, article);

  const links = new Map();

  for (const group of CODEX_GROUPS) {
    nav.append(el("h3", "codex__group", group));
    const list = el("ul", "codex__list");

    for (const [id, entry] of Object.entries(CODEX)) {
      if (entry.group !== group) continue;
      const item = el("li");
      const link = el("button", "codex__link", entry.title);
      link.type = "button";
      link.addEventListener("click", () => show(id));
      item.append(link);
      list.append(item);
      links.set(id, link);
    }
    nav.append(list);
  }

  function show(id) {
    const entry = CODEX[id];
    if (!entry) return;

    for (const [key, link] of links) {
      link.dataset.active = String(key === id);
    }

    article.replaceChildren();
    article.append(el("h2", "codex__title", entry.title));

    for (const paragraph of entry.text.split("\n\n")) {
      article.append(el("p", "codex__text", paragraph));
    }

    if (entry.see?.length) {
      const related = el("div", "codex__see");
      related.append(el("h4", "codex__see-title", "Пов'язане"));
      const row = el("div", "codex__see-row");
      for (const ref of entry.see) {
        if (!CODEX[ref]) continue;
        const link = el("button", "btn btn--ghost btn--small", CODEX[ref].title);
        link.type = "button";
        link.addEventListener("click", () => show(ref));
        row.append(link);
      }
      related.append(row);
      article.append(related);
    }

    article.scrollTop = 0;
  }

  show(focusId && CODEX[focusId] ? focusId : Object.keys(CODEX)[0]);

  box.body.append(layout);
  box.show();
  return box;
}
