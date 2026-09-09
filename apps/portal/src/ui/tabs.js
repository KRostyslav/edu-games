import { el } from "@edu/pixel-ui";

/**
 * Смуга вкладок категорій. Вкладки приходять ззовні готовим списком —
 * портал ніде не знає назв категорій напам'ять.
 */
export function createTabs({ tabs, onSelect }) {
  const root = el("div", "tabs__bar");
  root.setAttribute("role", "tablist");
  const buttons = new Map();

  for (const tab of tabs) {
    const button = el("button", "tabs__tab", tab.title);
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", "false");
    button.addEventListener("click", () => select(tab.id));
    buttons.set(tab.id, button);
    root.append(button);
  }

  /** Невідомий id (наприклад, чужий hash у посиланні) тихо падає на першу вкладку. */
  function select(id) {
    const target = buttons.has(id) ? id : tabs[0].id;
    for (const [key, button] of buttons) {
      button.setAttribute("aria-selected", String(key === target));
    }
    onSelect(target);
  }

  return { root, select };
}
