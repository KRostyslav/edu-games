import "@edu/pixel-ui/pixel.css";
import "./portal.css";

import { GAMES, matchesCategory, showcaseOrder, usedCategories } from "@edu/catalog";
import { el } from "@edu/pixel-ui";
import { createTabs } from "./ui/tabs.js";
import { createGameRow } from "./ui/gameRow.js";

const tabHost = document.getElementById("tabs");
const listHost = document.getElementById("list");
const emptyNote = document.getElementById("empty");
const foot = document.getElementById("foot");

const games = showcaseOrder(GAMES);

// Рядки будуються один раз. Перемальовувати мініатюри на кожен клік по вкладці —
// зайва робота й мигтіння; фільтр лише ховає вже готові вузли.
const rows = games.map((game) => ({ game, node: createGameRow(game) }));
listHost.append(...rows.map((row) => row.node));

const tabs = createTabs({ tabs: buildTabs(), onSelect: apply });
tabHost.append(tabs.root);

// Вкладка живе в hash: посилання можна надіслати, і вибір переживає перезавантаження.
window.addEventListener("hashchange", () => tabs.select(currentCategory()));
tabs.select(currentCategory());

foot.append(el("span", "portal__count", `Ігор у каталозі: ${games.length}`));

/**
 * «Усі» + лише ті категорії, у яких реально є гри, + «Незабаром», якщо анонси є.
 * Список будується з даних, тому нова категорія з'являється сама — щойно перша
 * гра її отримає, без жодної правки в порталі.
 */
function buildTabs() {
  const list = [{ id: "all", title: "Усі ігри" }, ...usedCategories(games)];
  if (games.some((game) => game.status === "upcoming")) {
    list.push({ id: "soon", title: "Незабаром" });
  }
  return list;
}

function apply(categoryId) {
  let visible = 0;
  for (const { game, node } of rows) {
    const show = categoryId === "soon" ? game.status === "upcoming" : matchesCategory(game, categoryId);
    node.hidden = !show;
    if (show) visible += 1;
  }
  emptyNote.hidden = visible > 0;

  const hash = categoryId === "all" ? "" : `#${categoryId}`;
  if (location.hash !== hash) {
    history.replaceState(null, "", hash || location.pathname + location.search);
  }
}

function currentCategory() {
  return location.hash.slice(1) || "all";
}
