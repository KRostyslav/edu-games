/**
 * Палітра компонентів.
 *
 * Показує лише те, що дозволено на рівні: у першій главі два компоненти, а не
 * чотирнадцять. Закриті компоненти теж видно — тьмяними і з поясненням, коли
 * вони відкриються, щоб гравець бачив, куди рухається кампанія.
 *
 * Компонент можна перетягнути на дошку або натиснути й потім вибрати клітинку —
 * другий шлях потрібен на телефоні, де drag-and-drop незручний.
 */

import { el } from "@edu/pixel-ui";
import { COMPONENTS, PALETTE_ORDER, COMPONENT_CATEGORIES } from "../../data/components.js";
import { LEVEL_ORDER, isUnlocked } from "../../data/order.js";
import { iconImg } from "../../render/icons.js";

export function createPalette({ level, onPick, onDrop, onCodex }) {
  const root = el("div", "pal");
  root.setAttribute("aria-label", "Компоненти");
  const context = level.unlockContext ?? level.id;
  const allowed = (type) => level.palette === "all" || level.palette?.includes(type);
  let active = null;

  const items = new Map();
  for (const category of COMPONENT_CATEGORIES) {
    const types = PALETTE_ORDER.filter((type) => COMPONENTS[type].category === category.id && allowed(type));
    if (!types.length) continue;
    const group = el("div", "pal__group");
    group.append(el("h4", "pal__title", category.label));
    for (const type of types) {
      const item = buildItem(type);
      items.set(type, item);
      group.append(item);
    }
    root.append(group);
  }

  const later = PALETTE_ORDER.filter((type) => !allowed(type) && !isUnlocked(COMPONENTS[type].unlock, context));
  if (later.length) {
    const note = el("details", "pal__later");
    note.append(el("summary", "", `Ще не відкрито: ${later.length}`));
    const list = el("ul", "pal__later-list");
    for (const type of later) {
      const chapter = LEVEL_ORDER.indexOf(COMPONENTS[type].unlock);
      const levelNo = chapter >= 0 ? ` — рівень ${chapter + 1}` : "";
      list.append(el("li", "", `${COMPONENTS[type].label}${levelNo}`));
    }
    note.append(list);
    root.append(note);
  }

  function buildItem(type) {
    const def = COMPONENTS[type];
    const item = el("div", "pal__item");
    const main = el("button", "pal__pick");
    main.type = "button";
    main.dataset.type = type;
    main.title = def.blurb;
    main.append(iconImg(type, "pal__icon"), el("span", "pal__label", def.label));
    const info = el("button", "pal__info", "?");
    info.type = "button";
    info.title = `Що таке «${def.label}»`;
    info.setAttribute("aria-label", `Довідник: ${def.label}`);
    info.addEventListener("click", () => onCodex?.(def.codexRef));
    item.append(main, info);

    // Перетягування на вказівниках: і миша, і дотик, без HTML5 DnD,
    // який на мобільних майже не працює.
    main.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const start = { x: event.clientX, y: event.clientY };
      let ghost = null;
      const move = (moveEvent) => {
        if (!ghost && Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) > 8) {
          ghost = iconImg(type, "pal__ghost");
          document.body.append(ghost);
        }
        if (ghost) {
          ghost.style.left = `${moveEvent.clientX - 16}px`;
          ghost.style.top = `${moveEvent.clientY - 16}px`;
        }
      };
      const up = (upEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (ghost) {
          ghost.remove();
          onDrop?.(type, upEvent.clientX, upEvent.clientY);
        } else {
          setActive(active === type ? null : type);
          onPick?.(active);
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
    return item;
  }

  function setActive(type) {
    active = type;
    for (const [key, item] of items) item.dataset.active = String(key === type);
  }

  return { root, setActive };
}
