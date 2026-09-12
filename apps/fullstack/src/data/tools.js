/**
 * Інструменти героя — справжні утиліти, якими бекендер користується під час
 * інциденту. У бою з босом кожен одноразовий за спробу.
 *
 * Інструменти не зберігаються в прогресі: набір обчислюється з того, що
 * гравець уже вміє (зірки, серія стендапів). Так їх неможливо «загубити», а
 * здобути — лише навчившись.
 *
 * effect:
 *   assist  — компонент фази сам відкриває одну частину відповіді
 *   reveal  — показує вивід інструмента, якщо фаза його передбачила (phase.tools[id])
 *   budget  — +1 до бюджету помилок
 */

export const TOOLS = [
  {
    id: "duck",
    title: "Гумова качка",
    icon: "🦆",
    effect: "assist",
    summary: "Пояснюєте проблему вголос качці — і одна частина відповіді раптом стає очевидною.",
    unlock: { type: "act", act: "prologue" },
    unlockText: "Пройдіть пролог",
  },
  {
    id: "flamegraph",
    title: "Flame graph",
    icon: "🔥",
    effect: "reveal",
    summary: "Профіль CPU: широка «полиця» — функція, у якій процес проводить найбільше часу.",
    unlock: { type: "level", level: "rt-blocking", stars: 3 },
    unlockText: "★★★ на рівні про блокування event loop",
    codexRef: "profiling",
  },
  {
    id: "curl",
    title: "curl -v",
    icon: "📡",
    effect: "reveal",
    summary: "Сирий HTTP-обмін без браузера: рукостискання, заголовки запиту й відповіді.",
    unlock: { type: "level", level: "net-cors", stars: 3 },
    unlockText: "★★★ на рівні про CORS",
    codexRef: "http-anatomy",
  },
  {
    id: "explain",
    title: "EXPLAIN ANALYZE",
    icon: "🔍",
    effect: "reveal",
    summary: "Справжній план запиту з фактичним часом кожного вузла.",
    unlock: { type: "level", level: "db-index", stars: 3 },
    unlockText: "★★★ на рівні про індекси",
    codexRef: "explain",
  },
  {
    id: "coffee",
    title: "Кава",
    icon: "☕",
    effect: "budget",
    summary: "Ще одна спроба до ескалації: +1 до бюджету помилок.",
    unlock: { type: "streak", days: 3 },
    unlockText: "Серія стендапів із 3 днів поспіль",
  },
];

export const TOOLS_BY_ID = Object.fromEntries(TOOLS.map((tool) => [tool.id, tool]));
