import { el, statBar, actionCard } from "@edu/pixel-ui";
import { actionsForMonth } from "../data/actions.data.js";
import { MONTH_NAMES, PHENOLOGY, QUIET_MONTHS } from "../data/calendar.js";
import { laborFor } from "../game/model.js";
import { openCodex } from "./codex.js";

/**
 * Панель місяця: фенофаза, показники куща й вибір дій.
 *
 * Показники згруповані так само, як їх мислить виноградар (кущ / ґрунт /
 * хвороби / урожай), а не за структурою даних.
 */
export function createMonthPanel({ root, onAdvance }) {
  const header = el("header", "panel__header");
  const monthTitle = el("h2", "panel__month");
  const phase = el("p", "panel__phase");
  const phaseText = el("p", "panel__phase-text");
  header.append(monthTitle, phase, phaseText);

  const stats = el("div", "panel__stats");
  const actionsWrap = el("div", "panel__actions");
  const actionsHead = el("div", "panel__actions-head");
  const actionsTitle = el("h3", "panel__actions-title", "Що робимо цього місяця");
  const laborBadge = el("span", "panel__labor");
  actionsHead.append(actionsTitle, laborBadge);
  const grid = el("div", "actions-grid");
  const advance = el("button", "btn btn--primary panel__advance", "Прожити місяць →");
  advance.type = "button";
  actionsWrap.append(actionsHead, grid, advance);

  root.append(header, stats, actionsWrap);

  const bars = buildStatGroups(stats);
  let selected = [];
  let cards = [];
  let current = null;
  // Попередній стан потрібен лише для стрілок «що змінилося з минулого місяця».
  let previous = null;

  advance.addEventListener("click", () => onAdvance(selected));

  function render(state, region) {
    current = state;
    const month = state.month;
    const pheno = PHENOLOGY[month];

    monthTitle.textContent = `${MONTH_NAMES[month]}, рік ${state.year}`;
    phase.textContent = pheno.phase;
    phaseText.textContent = pheno.description;

    updateStats(bars, state, previous);
    previous = structuredClone(state);

    // ── Дії ──
    selected = [];
    cards = [];
    grid.replaceChildren();

    const available = actionsForMonth(month, region);
    const maxLabor = laborFor(state, pheno.labor);

    if (available.length === 0) {
      grid.append(
        el(
          "p",
          "panel__empty",
          "Цього місяця робити нічого. Кущ у глибокому спокої — усе, що можна було зробити, зроблено восени.",
        ),
      );
    }

    for (const action of available) {
      const blocked = action.requires?.(state);
      const card = actionCard({
        action,
        disabled: Boolean(blocked),
        disabledReason: blocked ?? "",
        onCodex: (ref) => openCodex(ref),
        onToggle: (chosen, isOn) => {
          if (isOn) selected.push(chosen);
          else selected = selected.filter((a) => a.id !== chosen.id);
          syncAvailability(maxLabor);
        },
      });
      cards.push({ card, action });
      grid.append(card.root);
    }

    syncAvailability(maxLabor);
    updateLaborBadge(maxLabor);

    if (QUIET_MONTHS.includes(month)) {
      advance.textContent = "Перечекати місяць →";
    } else {
      advance.textContent = "Прожити місяць →";
    }
  }

  /** Блокує те, на що вже не вистачає трудоднів, і взаємовиключні варіанти. */
  function syncAvailability(maxLabor) {
    const spent = selected.reduce((sum, a) => sum + a.laborCost, 0);
    const chosenGroups = new Set(selected.filter((a) => a.exclusiveGroup).map((a) => a.exclusiveGroup));

    for (const { card, action } of cards) {
      if (card.selected) {
        card.setDisabled(false);
        continue;
      }
      const blocked = action.requires?.(current);
      if (blocked) {
        card.setDisabled(true, blocked);
        continue;
      }
      if (action.exclusiveGroup && chosenGroups.has(action.exclusiveGroup)) {
        card.setDisabled(true, "Ви вже обрали інший варіант цієї роботи");
        continue;
      }
      if (spent + action.laborCost > maxLabor) {
        card.setDisabled(true, "Не вистачає трудоднів цього місяця");
        continue;
      }
      card.setDisabled(false);
    }
    updateLaborBadge(maxLabor, spent);
  }

  function updateLaborBadge(maxLabor, spent = 0) {
    laborBadge.textContent = `Трудодні: ${maxLabor - spent} з ${maxLabor}`;
    laborBadge.dataset.empty = String(maxLabor - spent === 0);
  }

  return {
    render,
    /** Новий рік — порівнювати з груднем попереднього немає сенсу. */
    resetDeltas: () => {
      previous = null;
    },
  };
}

/** Групи показників у тому вигляді, як про них думає виноградар. */
function buildStatGroups(root) {
  const groups = [
    {
      title: "Кущ",
      items: [
        ["vine.reserves", "Запас поживних речовин", "Накопичене восени. З цього кущ стартує навесні."],
        ["vine.woodRipeness", "Визрівання лози", "Здерев'яніла лоза переносить мороз, зелена — ні."],
        ["vine.hardiness", "Морозостійкість", "Тримається лише в стані спокою, навесні обнуляється."],
        ["vine.budsAlive", "Живі вічка", "Скільки вічок пережило зиму. Це майбутні грона."],
        ["vine.load", "Навантаження", "Оптимум — близько 55. Гірше і мало, і забагато."],
        ["vine.canopy", "Листовий апарат", "Листя годує грона. Надлишок — розсадник хвороб."],
      ],
    },
    {
      title: "Ґрунт",
      items: [
        ["soil.moisture", "Волога", "Ключова в липні: саме тоді визначається розмір ягоди."],
        ["soil.nitrogen", "Азот", "Потрібен навесні, шкідливий у другій половині літа."],
        ["soil.potassium", "Калій", "Визрівання лози й морозостійкість."],
        ["soil.phosphorus", "Фосфор", "Коріння й закладка суцвіть."],
        ["soil.organic", "Органіка", "Живить ґрунт, а не кущ. Виснажується щороку."],
        ["soil.structure", "Структура", "Пухкий ґрунт дає корінню повітря."],
      ],
    },
    {
      title: "Хвороби і шкідники",
      items: [
        ["disease.mildew", "Мілдью", "Потребує води. Спалахи йдуть за дощами."],
        ["disease.oidium", "Оїдіум", "Навпаки, любить спеку й задуху."],
        ["disease.rot", "Сіра гниль", "Заходить лише через пошкоджену шкірку."],
        ["disease.pests", "Оси й шкідники", "Загроза наприкінці сезону."],
      ],
      invert: true,
    },
    {
      title: "Урожай",
      items: [
        ["crop.setRate", "Зав'язування", "Скільки квіток стало ягодами. Вирішується в червні."],
        ["crop.berrySize", "Налив ягоди", "Визначається поливом у липні."],
        ["crop.sugar", "Цукор", "Чеканка, освітлення грон і припинення поливу."],
        ["crop.sanitary", "Стан грон", "Результат усього захисту за сезон."],
      ],
    },
  ];

  const bars = new Map();
  for (const group of groups) {
    const section = el("section", "stats__group");
    section.append(el("h3", "stats__title", group.title));
    for (const [path, label, hint] of group.items) {
      const bar = statBar({ label, hint });
      if (group.invert) bar.root.dataset.invert = "true";
      section.append(bar.root);
      bars.set(path, bar);
    }
    root.append(section);
  }
  return bars;
}

function updateStats(bars, state, previous) {
  for (const [path, bar] of bars) {
    const value = path.split(".").reduce((n, k) => n[k], state);
    const before = previous ? path.split(".").reduce((n, k) => n?.[k], previous) : null;
    bar.update(value, before == null ? null : value - before);
  }
}
