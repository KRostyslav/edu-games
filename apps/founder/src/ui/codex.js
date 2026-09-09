import { el, modal } from "@edu/pixel-ui";
import { CODEX, CODEX_GROUPS, CODEX_IDS } from "../data/encyclopedia.js";

/** Довідник. Відкривається будь-коли — знання ніколи не в тумані війни. */
export function openCodex(focusId) {
  const dialog = modal({ title: "Довідник", wide: true });

  const layout = el("div", "codex");
  const nav = el("nav", "codex__nav");
  const article = el("article", "codex__article");
  layout.append(nav, article);
  dialog.body.append(layout);

  const buttons = new Map();
  for (const group of CODEX_GROUPS) {
    nav.append(el("h4", "codex__group", group));
    for (const id of CODEX_IDS.filter((key) => CODEX[key].group === group)) {
      const button = el("button", "codex__link", CODEX[id].title);
      button.type = "button";
      button.addEventListener("click", () => show(id));
      buttons.set(id, button);
      nav.append(button);
    }
  }

  function show(id) {
    const entry = CODEX[id];
    if (!entry) return;

    for (const [key, button] of buttons) button.dataset.active = String(key === id);

    article.replaceChildren();
    article.append(el("h3", "codex__title", entry.title));
    for (const paragraph of entry.text.split("\n\n")) {
      article.append(el("p", "codex__text", paragraph));
    }

    if (entry.see?.length) {
      const related = el("div", "codex__related");
      related.append(el("span", "codex__related-label", "Пов'язане:"));
      for (const ref of entry.see) {
        if (!CODEX[ref]) continue;
        const link = el("button", "btn btn--ghost", CODEX[ref].title);
        link.type = "button";
        link.addEventListener("click", () => show(ref));
        related.append(link);
      }
      article.append(related);
    }

    article.scrollTop = 0;
  }

  show(focusId && CODEX[focusId] ? focusId : CODEX_IDS[0]);
  dialog.show();
}
