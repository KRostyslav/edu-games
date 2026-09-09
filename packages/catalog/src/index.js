/**
 * Реєстр ігор монорепи — єдине джерело правди про те, які симуляції існують.
 *
 * Навмисно без жодної зовнішньої залежності: цей модуль читає і портал (через
 * bundler), і Node-скрипт складання сайту. Залежність на браузерний код зламала б
 * другий сценарій, тому графіка мініатюр живе окремо, в `apps/portal/src/thumbs`.
 */
import { assertCatalog } from "./validate.js";

/**
 * Категорії в порядку показу вкладок. Вкладка з'являється на порталі лише тоді,
 * коли в категорії є хоч одна гра, — порожніх розділів користувач не бачить.
 */
export const CATEGORIES = [
  { id: "nature", title: "Природа й агро" },
  { id: "tech", title: "Технічні" },
  { id: "hobby", title: "Хобі" },
];

/**
 * Одна гра.
 *
 * @typedef {object} Game
 * @property {string}   id          Ідентифікатор і водночас підшлях: /games/<id>/
 * @property {string}   dir         Тека застосунку від кореня монорепи
 * @property {string}   pkg         Ім'я пакета у workspace
 * @property {string}   title       Коротка назва для картки
 * @property {string}   subtitle    Один рядок під назвою
 * @property {string}   description Опис для сторінки й мета-тегів
 * @property {string}   category    Ключ із CATEGORIES
 * @property {string[]} tags        Теги в стилі крамниці ігор
 * @property {"released"|"beta"|"upcoming"} status
 * @property {string}   released    ISO-дата (YYYY-MM-DD)
 * @property {string}   emoji       Іконка-фолбек і favicon
 * @property {string}   accent      Акцентний колір картки
 * @property {number}   devPort     Фіксований порт vite dev-сервера
 */

/** @type {Game[]} */
export const GAMES = [
  {
    id: "vineyard",
    dir: "apps/vineyard",
    pkg: "@edu/vineyard",
    title: "Виноградник",
    subtitle: "Рік за роком, місяць за місяцем",
    description:
      "Піксельна навчальна гра про догляд за виноградом: рік за роком, місяць за місяцем, " +
      "з поясненням впливу кожної дії на врожай.",
    category: "nature",
    tags: ["Симуляція", "Агрономія", "Покрокова", "Піксель-арт"],
    status: "released",
    released: "2026-09-09",
    emoji: "🍇",
    accent: "#6a3b7a",
    devPort: 5181,
  },
  {
    id: "peppers",
    dir: "apps/peppers",
    pkg: "@edu/peppers",
    title: "Гострий балкон",
    subtitle: "Перці на заскленому балконі, три роки поспіль",
    description:
      "Піксельна навчальна гра про догляд за гострими перцями на заскленому балконі: " +
      "перезимівля, підсвітка, підживлення й ручне запилення з поясненням впливу кожної дії на врожай.",
    category: "nature",
    tags: ["Симуляція", "Ботаніка", "Покрокова", "Піксель-арт"],
    status: "released",
    released: "2026-09-09",
    emoji: "🌶️",
    accent: "#b83a2a",
    devPort: 5182,
  },
];

// Реєстр перевіряється на імпорті, а не окремим тестом: зламаний каталог має
// впасти в найпершому споживачі — байдуже, портал це чи збірка сайту.
assertCatalog(CATEGORIES, GAMES);

/** Гра за ідентифікатором або `undefined`. */
export function findGame(id) {
  return GAMES.find((game) => game.id === id);
}

/**
 * Категорії, у яких реально є ігри, у порядку з CATEGORIES.
 * Портал будує вкладки саме звідси, тому нова категорія з'являється сама —
 * щойно перша гра її отримає, без правок у коді порталу.
 */
export function usedCategories(games = GAMES) {
  return CATEGORIES.filter((category) => games.some((game) => game.category === category.id));
}

/**
 * Порядок вітрини: спершу те, у що вже можна грати, всередині — новіше вгорі.
 */
const RANK = { released: 0, beta: 1, upcoming: 2 };

export function showcaseOrder(games = GAMES) {
  return [...games].sort(
    (a, b) =>
      RANK[a.status] - RANK[b.status] ||
      b.released.localeCompare(a.released) ||
      a.title.localeCompare(b.title, "uk"),
  );
}

/**
 * Належність гри до вкладки. Винесено в функцію навмисно: якщо колись гра
 * має потрапити одразу в кілька категорій, зміниться лише це місце.
 */
export function matchesCategory(game, categoryId) {
  return categoryId === "all" || game.category === categoryId;
}
