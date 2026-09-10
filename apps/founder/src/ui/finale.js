/**
 * Фінал партії — окремий екран замість гри.
 *
 * Порядок секцій: вирок → арифметика → похвала → провина → як лагодити.
 * Похвала перед провиною навмисно: читач, який відчув напад, перестає читати,
 * а секція провини — головна.
 */

import { el, createPixelCanvas } from "@edu/pixel-ui";
import { buildReview, money } from "../game/review.js";
import { CATEGORY_LABELS, ACTIONS_BY_ID } from "../data/actions.data.js";
import { timeline } from "./widgets.js";
import { openCodex } from "./codex.js";
import { buildAftermath } from "./finaleAftermath.js";
import { drawArc, ARC } from "../render/arc.js";

const VERDICT_TONE = { win: "good", partial: "warn", loss: "bad" };

export function mountFinale({ root, state, onRestart }) {
  const review = buildReview(state);

  root.dataset.mode = "finale";
  root.replaceChildren(buildScreen(review, state, onRestart));
  window.scrollTo(0, 0);
  return review;
}

function buildScreen(review, state, onRestart) {
  const page = el("div", "finale");
  const { headline } = review;

  // ── 1. Вирок ──
  const head = el("header", "finale__head");
  head.dataset.kind = headline.kind;
  head.append(el("h1", "finale__title", headline.cause));
  head.append(
    el(
      "p",
      "finale__stamp",
      headline.finishedEarly
        ? `Ви зупинилися на ${headline.endedAt}-му місяці${headline.goal.reachedAt ? `, досягнувши мети на ${headline.goal.reachedAt}-му` : ""}.`
        : `Місяць ${headline.endedAt} з 36. Сценарій: ${headline.scenario.name}.`,
    ),
  );
  head.append(el("p", "finale__lead", headline.reason));
  page.append(head);

  // ── 2. Числа ──
  const numbers = el("section", "finale__numbers");
  for (const cell of headline.numbers) {
    const node = el("div", "finale__number");
    node.append(el("span", "finale__number-label", cell.label));
    node.append(el("span", "finale__number-value", cell.value));
    numbers.append(node);
  }
  page.append(numbers);

  // ── 3. Дуга ──
  page.append(buildArcSection(headline));

  // ── 4. Оцінки ──
  page.append(buildGrades(review.grades));

  // ── 5. Етапи ──
  page.append(buildStages(review.stages));

  // ── 6. Години ──
  page.append(buildHours(review.hours));

  // ── 7–8. Похвала й провина ──
  page.append(buildItems("Що ви робили добре", review.strengths, "good"));
  page.append(buildItems("Де помилилися", review.mistakes, "bad"));

  // ── 9–12. Хронологія, невидиме, моменти, контрфактуал ──
  page.append(buildMoments(review.moments));
  buildAftermath({ page, state, review });

  const foot = el("footer", "finale__foot");
  const again = el("button", "btn btn--primary", "Почати заново");
  again.type = "button";
  again.addEventListener("click", () => onRestart?.());
  const codex = el("button", "btn", "Довідник");
  codex.type = "button";
  codex.addEventListener("click", () => openCodex());
  foot.append(again, codex);
  page.append(foot);

  return page;
}

// ─────────────────────────── дуга ───────────────────────────

function buildArcSection(headline) {
  const box = section("Три роки однією картинкою");
  box.append(
    el(
      "p",
      "finale__note",
      `Стовпчики — MRR за місяцями, пунктири — ваші витрати (${money(headline.goal.burn)}) і ціль (${money(headline.goal.target)}). Тонка смуга внизу — ваші сили.`,
    ),
  );

  const host = el("div", "finale__arc");
  box.append(host);

  const view = createPixelCanvas({ width: ARC.width, height: ARC.height, parent: host, maxScale: 4 });
  drawArc(view.ctx, headline);
  view.fit();

  // Підписи років мусять стояти під роздільниками, а не розтягуватися на всю
  // секцію, тому ширину беремо в самої канви — вона вже відома після fit().
  const legend = el("div", "finale__arc-legend");
  legend.append(el("span", "", "рік 1"), el("span", "", "рік 2"), el("span", "", "рік 3"));
  const syncWidth = () => {
    legend.style.width = view.canvas.style.width;
  };
  syncWidth();
  new ResizeObserver(syncWidth).observe(host);
  box.append(legend);

  if (headline.goal.reachedAt) {
    box.append(
      el(
        "p",
        "finale__note",
        `Серія «продукт замінює зарплату» завершилася на ${headline.goal.reachedAt}-му місяці. Місяців вище цілі за всю партію: ${headline.goal.monthsAbove}.`,
      ),
    );
  }
  return box;
}

// ─────────────────────────── оцінки ───────────────────────────

function buildGrades(grades) {
  const box = section("Оцінки");
  const grid = el("div", "grades");

  for (const grade of grades) {
    const card = el("div", "grade");
    card.dataset.tone = grade.tone ?? "na";
    card.append(el("h3", "grade__label", grade.label));

    if (grade.na) {
      card.append(el("span", "grade__letter", "—"));
      card.append(el("p", "grade__na", grade.na));
    } else {
      card.append(el("span", "grade__letter", grade.letter));
      card.append(el("span", "grade__score", `${grade.score}/100`));

      const details = el("details", "grade__parts");
      details.append(el("summary", "", "З чого складається"));
      const list = el("ul", "grade__list");
      for (const part of [...grade.parts].sort((a, b) => a.got / a.max - b.got / b.max)) {
        const row = el("li", "grade__part");
        row.append(el("span", "grade__part-label", part.label));
        row.append(el("span", "grade__part-value", `${part.got}/${part.max}`));
        row.append(el("p", "grade__part-why", part.why));
        list.append(row);
      }
      details.append(list);
      card.append(details);
    }
    grid.append(card);
  }

  box.append(grid);
  return box;
}

// ─────────────────────────── етапи ───────────────────────────

const STAGE_VERDICT = {
  good: { label: "вийшло", tone: "good" },
  mixed: { label: "наполовину", tone: "warn" },
  failed: { label: "не вийшло", tone: "bad" },
};

function buildStages(stages) {
  const box = section("Чотири етапи");
  box.append(
    el(
      "p",
      "finale__note",
      "Межі етапів не вигадані: кожна збігається з порогом, який гра використовує в підказках і попередженнях.",
    ),
  );

  for (const stage of stages) {
    const node = el("article", "stage");
    node.dataset.verdict = stage.verdict ?? "none";

    const header = el("header", "stage__head");
    header.append(el("span", "stage__range", `${stage.from}–${stage.to} міс.`));
    header.append(el("h3", "stage__label", stage.label));
    if (stage.verdict) {
      const chip = el("span", "stage__chip", STAGE_VERDICT[stage.verdict].label);
      chip.dataset.tone = STAGE_VERDICT[stage.verdict].tone;
      header.append(chip);
    }
    node.append(header);
    node.append(el("p", "stage__purpose", stage.purpose));

    if (!stage.played) {
      node.append(el("p", "stage__unplayed", "До цього етапу партія не дійшла."));
      box.append(node);
      continue;
    }

    if (stage.facts.length) {
      const facts = el("div", "stage__facts");
      for (const fact of stage.facts) {
        const cell = el("div", "stage__fact");
        cell.append(el("span", "stage__fact-label", fact.label));
        cell.append(el("span", "stage__fact-value", fact.value));
        facts.append(cell);
      }
      node.append(facts);
    }

    node.append(el("p", "stage__criterion", stage.criterion));

    if (stage.hours?.top?.length) {
      const bar = el("p", "stage__hours");
      bar.textContent = `Години етапу: ${stage.hours.spent} — ${stage.hours.top
        .map((row) => `${row.label} ${row.sharePct}%`)
        .join(", ")}.`;
      node.append(bar);
    }

    if (stage.oneThing) {
      const advice = el("div", "stage__advice");
      advice.append(el("h4", "stage__advice-title", `Варто було: ${stage.oneThing.label}`));
      if (stage.oneThing.months?.length) {
        advice.append(
          el(
            "p",
            "stage__advice-months",
            `Гра позначала це важливим ${stage.oneThing.months.length} міс. цього етапу (${stage.oneThing.months.join(", ")}).`,
          ),
        );
      }
      advice.append(el("p", "stage__advice-text", stage.oneThing.detail));
      advice.append(el("p", "stage__advice-why", stage.oneThing.why));
      if (stage.oneThing.codexRef) advice.append(codexLink(stage.oneThing.codexRef));
      node.append(advice);
    }

    box.append(node);
  }
  return box;
}

// ─────────────────────────── години ───────────────────────────

function buildHours(hours) {
  const box = section("Куди пішли ваші години");
  box.append(
    el(
      "p",
      "finale__note",
      `Витрачено ${hours.spent} годин, ще ${hours.idle} лишилися невитраченими (${hours.idlePct}%). Еталон — смуга ±7 пунктів, а не ціль: відхилення в межах смуги нічого не означає.`,
    ),
  );

  const table = el("div", "hours");
  for (const row of hours.rows) {
    const line = el("div", "hours__row");
    line.dataset.status = row.status;
    line.append(el("span", "hours__label", row.label));

    const track = el("div", "hours__track");
    const fill = el("div", "hours__fill");
    fill.style.width = `${Math.min(100, row.sharePct)}%`;
    const mark = el("div", "hours__mark");
    mark.style.left = `${Math.min(100, row.referencePct)}%`;
    mark.title = `Еталон ${row.referencePct}%`;
    track.append(fill, mark);
    line.append(track);

    line.append(el("span", "hours__value", `${row.hours} год · ${row.sharePct}%`));
    table.append(line);
  }

  const idle = el("div", "hours__row hours__row--idle");
  idle.append(el("span", "hours__label", "Не витрачено"));
  const idleTrack = el("div", "hours__track");
  const idleFill = el("div", "hours__fill");
  idleFill.style.width = `${Math.min(100, hours.idlePct)}%`;
  idleTrack.append(idleFill);
  idle.append(idleTrack, el("span", "hours__value", `${hours.idle} год · ${hours.idlePct}%`));
  table.append(idle);

  box.append(table);

  if (hours.worst) {
    box.append(
      el(
        "p",
        "finale__highlight",
        hours.worst.status === "high"
          ? `Головний перекіс: ${hours.worst.label} — ${hours.worst.sharePct}% замість ${hours.worst.referencePct}%.`
          : `Головний провал: ${hours.worst.label} — лише ${hours.worst.sharePct}% замість ${hours.worst.referencePct}%.`,
      ),
    );
  }
  return box;
}

// ─────────────────────────── пункти ───────────────────────────

function buildItems(title, items, tone) {
  const box = section(title);
  const render = (found) => {
    const node = el("article", "finding");
    node.dataset.tone = tone;
    node.append(el("h3", "finding__title", found.title));
    node.append(el("p", "finding__evidence", found.evidence));
    if (found.detail) node.append(el("p", "finding__detail", found.detail));
    if (found.cost) node.append(el("p", "finding__cost", `Ціна: ${found.cost.text}`));

    for (const id of found.actionIds ?? []) {
      const action = ACTIONS_BY_ID[id];
      if (!action) continue;
      node.append(el("p", "finding__action", `${action.label}: ${action.why}`));
    }
    if (found.codexRef) node.append(codexLink(found.codexRef));
    return node;
  };

  for (const found of items.slice(0, 5)) box.append(render(found));

  if (items.length > 5) {
    const more = el("details", "finale__more");
    more.append(el("summary", "", `Показати решту (${items.length - 5})`));
    for (const found of items.slice(5)) more.append(render(found));
    box.append(more);
  }
  return box;
}

// ─────────────────────────── моменти ───────────────────────────

function buildMoments(moments) {
  const box = section("Ключові моменти");
  box.append(
    timeline({
      items: moments.map((moment) => ({
        when: `міс. ${moment.monthIndex}`,
        text: `${moment.label}. ${moment.text}`,
        tone: moment.tone,
        pivot: moment.kind === "salary" || moment.kind === "worst_drop",
      })),
    }),
  );
  return box;
}

// ─────────────────────────── дрібне ───────────────────────────

function section(title) {
  const box = el("section", "finale__section");
  box.append(el("h2", "finale__heading", title));
  return box;
}

function codexLink(ref) {
  const link = el("button", "btn btn--ghost", "Довідник →");
  link.type = "button";
  link.addEventListener("click", () => openCodex(ref));
  return link;
}

export { CATEGORY_LABELS };
