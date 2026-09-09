/**
 * Річний звіт.
 *
 * Найважливіше число тут — не врожай, а кількість зелених плодів: саме воно
 * пояснює, чому C. chinense в українському кліматі має сенс перезимовувати, а
 * не сіяти щороку.
 *
 * Множники сортуються за зростанням: найнижчий з них і обмежив урожай, тому
 * він має стояти першим — це і є відповідь на питання «що робити наступного
 * року».
 */

import { el, modal, barChart } from "@edu/pixel-ui";
import { CULTIVARS, PLANT_IDS } from "../data/plants.data.js";
import { ageFactor } from "../game/harvest.js";

export function openYearReport({ state, harvest, notes, onNextYear, onAutopsy }) {
  const box = modal({ title: `Підсумок ${state.year}-го року`, wide: true });

  // ── Головні числа ──
  const summary = el("section", "report__summary");
  const total = el("div", "report__total");
  total.append(
    el("span", "report__total-value", `${harvest.totalGrams} г`),
    el("span", "report__total-label", `разом · ${harvest.totalRipe} стиглих плодів`),
  );
  if (harvest.totalGreen > 0) {
    total.append(
      el("span", "report__total-green", `+ ${harvest.totalGreen} зелених, що не встигли визріти`),
    );
  }
  summary.append(total);
  box.body.append(summary);

  // ── Головний висновок року ──
  const lesson = el("section", "report__lesson");
  lesson.append(el("h3", "report__lesson-title", "Головне цього року"));
  lesson.append(el("p", "report__lesson-text", harvest.lesson));
  box.body.append(lesson);

  // ── Картки рослин ──
  const grid = el("section", "report__grid");
  for (const result of harvest.plants) {
    grid.append(plantCard(result, onAutopsy));
  }
  box.body.append(grid);

  // ── Порівняння років ──
  const history = [...state.harvests, { year: state.year, ...harvest }];
  if (history.length > 1) {
    const section = el("section", "report__history");
    section.append(el("h3", "report__title", "Порівняння років"));

    const charts = el("div", "report__charts");
    for (const id of PLANT_IDS) {
      const wrap = el("div", "report__chart");
      wrap.append(el("h4", "report__chart-title", CULTIVARS[id].name));
      wrap.append(
        barChart({
          items: history.map((entry) => {
            const plant = entry.plants.find((p) => p.id === id);
            return {
              label: `Рік ${entry.year}`,
              value: plant?.grams ?? 0,
              tone: plant?.alive ? (plant.grams > 0 ? "good" : "warn") : "bad",
            };
          }),
          unit: " г",
        }),
      );
      charts.append(wrap);
    }
    section.append(charts);

    const totals = el("div", "report__chart report__chart--wide");
    totals.append(el("h4", "report__chart-title", "Разом за балкон"));
    totals.append(
      barChart({
        items: history.map((entry) => ({
          label: `Рік ${entry.year}`,
          value: entry.totalGrams,
          tone: "good",
        })),
        unit: " г",
      }),
    );
    section.append(totals);
    box.body.append(section);
  }

  // ── Що переходить у наступний рік ──
  if (notes?.length) {
    const section = el("section", "report__notes");
    section.append(el("h3", "report__title", "Що переходить у наступний рік"));
    for (const note of notes) {
      const item = el("p", "report__note", note.text);
      item.dataset.tone = note.tone;
      section.append(item);
    }
    box.body.append(section);
  }

  const next = el("button", "btn btn--primary", `Почати ${state.year + 1}-й рік →`);
  next.type = "button";
  next.addEventListener("click", () => {
    box.hide();
    onNextYear();
  });
  box.foot.append(next);

  box.show();
  return box;
}

function plantCard(result, onAutopsy) {
  const card = el("article", "report__plant");
  card.dataset.tone = result.grade.tone;

  const head = el("header", "report__plant-head");
  head.append(el("h4", "report__plant-name", result.name));
  head.append(el("span", "report__plant-grade", result.grade.label));
  card.append(head);

  if (!result.alive) {
    card.append(el("p", "report__plant-dead", result.grade.note));
    if (result.death && onAutopsy) {
      const button = el("button", "btn btn--ghost btn--small", "Розтин");
      button.type = "button";
      button.addEventListener("click", () => onAutopsy(result.id));
      card.append(button);
    }
    return card;
  }

  const numbers = el("div", "report__numbers");
  numbers.append(
    el("span", "report__grams", `${result.grams} г`),
    el("span", "report__count", `${result.ripeCount} стиглих`),
  );
  if (result.greenCount > 0) {
    numbers.append(el("span", "report__green", `+${result.greenCount} зелених`));
  }
  card.append(numbers);

  card.append(
    el(
      "p",
      "report__plant-meta",
      `${result.age}-й рік · ${result.species} · гострота близько ${formatShu(result.pungency)} SHU`,
    ),
  );

  if (result.ripeNote) {
    card.append(el("p", "report__ripe-note", result.ripeNote));
  }
  card.append(el("p", "report__plant-note", result.grade.note));

  // Множники за зростанням: найнижчий обмежив урожай і стоїть першим.
  const details = el("details", "report__factors");
  details.append(el("summary", "report__factors-summary", "З чого склався врожай"));

  const sorted = [...result.factors].sort((a, b) => a.value - b.value);
  for (const factor of sorted) {
    const row = el("div", "factor");
    if (factor.key === "age") row.dataset.key = "age";
    const head = el("div", "factor__head");
    head.append(
      el("span", "factor__label", factor.label),
      el("span", "factor__value", `×${factor.value.toFixed(2)}`),
    );
    row.append(head, el("p", "factor__detail", factor.detail), el("p", "factor__why", factor.why));
    details.append(row);
  }

  // Показуємо, чого коштував би ще один рік — це головний важіль гри.
  const nextAge = ageFactor(result.age + 1);
  const nowAge = ageFactor(result.age);
  if (nextAge > nowAge) {
    details.append(
      el(
        "p",
        "report__forecast",
        `Якщо цей кущ переживе зиму, наступного року множник віку зросте з ×${nowAge.toFixed(2)} ` +
          `до ×${nextAge.toFixed(2)} — приблизно ${Math.round((nextAge / nowAge) * 100 - 100)}% врожаю ` +
          `тільки за те, що рослина стала старшою.`,
      ),
    );
  }

  card.append(details);
  return card;
}

function formatShu(value) {
  if (value >= 1000) return `${Math.round(value / 1000)} тис.`;
  return String(value);
}
