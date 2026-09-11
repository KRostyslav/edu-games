/**
 * Екран рівня: бриф, конструктор, прогін і розбір.
 *
 * Чернетка схеми зберігається після кожної зміни: рівень можна кинути на
 * півдорозі й повернутися за тиждень. Зірки лише ростуть — невдалий
 * експеримент не забирає вже заробленого, тож пробувати не страшно.
 *
 * Розбір після прогону будується з цифр саме цього прогону: «p99 312 мс при
 * SLO 250» і «хв 21–30: база на 140%» вчать більше за загальні поради.
 */

import "./level.css";
import { el, modal, barChart } from "@edu/pixel-ui";
import { LEVELS, CHAPTERS } from "../data/levels.js";
import { LEVEL_ORDER } from "../data/order.js";
import { COMPONENTS } from "../data/components.js";
import { CLASS_LABELS, REGIONS } from "../data/constants.js";
import { INCIDENT_TYPES } from "../data/incidents.js";
import { CODEX } from "../data/codex/index.js";
import { createGraph, normalizeGraph, cloneGraph } from "../sim/graph.js";
import { isLevelOpen, levelStars } from "../progress/unlock.js";
import { createBuilder } from "./builder/builder.js";
import { button, starsEl, chip, paragraphs, fmtMoney, fmtPct, fmtRps } from "./widgets.js";

export function mountLevel(host, ctx, params) {
  const { store } = ctx;
  const level = LEVELS[params.id];
  const page = el("div", "page lvl");
  host.append(page);

  if (!level || !isLevelOpen(store.state, level.id)) {
    page.append(
      el("h1", "page__title", level ? "Рівень ще закритий" : "Такого рівня немає"),
      el("p", "page__lead", "Пройдіть попередні рівні хоча б на одну зірку."),
      button("← До кампанії", { variant: "primary", onClick: () => ctx.go("campaign") }),
    );
    return { unmount() {} };
  }

  const index = LEVEL_ORDER.indexOf(level.id);
  const chapter = CHAPTERS.find((item) => item.id === level.chapter);
  const entry = () => (store.state.campaign[level.id] ??= { stars: 0, best: null, draft: null, solvedAt: null, hintsUsed: 0 });

  const draft = store.state.campaign[level.id]?.draft;
  const graph = draft ? normalizeGraph(draft, level) : createGraph(level);

  // ── шапка ──
  const head = el("div", "page__head lvl__head");
  const titles = el("div");
  const back = button("← Кампанія", { variant: "ghost", onClick: () => ctx.go("campaign") });
  back.classList.add("lvl__back");
  titles.append(
    back,
    el("span", "lvl__kicker", `Глава ${chapter.id} · ${chapter.title} · рівень ${index + 1} з ${LEVEL_ORDER.length}`),
    el("h1", "page__title", level.title),
  );
  const starsBox = el("div", "lvl__stars");
  const renderStars = () => starsBox.replaceChildren(starsEl(levelStars(store.state, level.id)));
  renderStars();
  head.append(titles, starsBox);
  page.append(head);

  const hintBtn = button("", { onClick: () => openHints() });
  const updateHintLabel = () => (hintBtn.textContent = `Підказки ${store.state.campaign[level.id]?.hintsUsed ?? 0}/${level.hints.length}`);
  updateHintLabel();
  const briefBtn = button("Бриф", { onClick: () => openBrief() });
  const resetBtn = button("Почати схему заново", {
    variant: "ghost",
    onClick: () =>
      ctx.confirm({
        title: "Почати заново?",
        text: "Поточна схема зникне. Зароблені зірки лишаться.",
        yes: "Очистити",
        onYes: () => {
          store.update((state) => {
            if (state.campaign[level.id]) state.campaign[level.id].draft = null;
          }, { immediate: true });
          ctx.go("level", { id: level.id });
        },
      }),
  });

  const builder = createBuilder({
    level,
    graph,
    ctx,
    seed: 1,
    toolbarExtra: [briefBtn, hintBtn, resetBtn],
    onGraphChange: (next) => store.update(() => (entry().draft = cloneGraph(next))),
    onRunComplete: (run, score) => finishRun(run, score),
  });
  page.append(builder.root);

  if (!draft && levelStars(store.state, level.id) === 0) queueMicrotask(openBrief);

  // ─────────────────────────── бриф ───────────────────────────

  function openBrief() {
    const dialog = modal({ title: level.title, wide: true });
    const body = dialog.body;
    body.classList.add("lvl__brief");
    body.append(el("p", "lvl__teaser", level.teaser), ...paragraphs(level.brief));

    const req = el("div", "lvl__req");
    req.append(el("h3", "section__title", "Вимоги"));
    const table = el("table", "lvl__table");
    const row = (name, value) => {
      const tr = el("tr");
      tr.append(el("th", "", name), el("td", "", value));
      table.append(tr);
    };
    row("Трафік", fmtRps(level.traffic.rps));
    row(
      "Склад запитів",
      Object.entries(level.traffic.mix)
        .map(([cls, share]) => `${CLASS_LABELS[cls]} ${Math.round(share * 100)}%`)
        .join(", "),
    );
    const geo = Object.entries(level.traffic.geo ?? {});
    if (geo.length > 1) row("Де користувачі", geo.map(([region, share]) => `${REGIONS[region]} ${Math.round(share * 100)}%`).join(", "));
    if (level.data?.conns) row("Одночасних з'єднань", level.data.conns.toLocaleString("uk-UA"));
    for (const [cls, limit] of Object.entries(level.slo?.p99Ms ?? {})) row(`p99 «${CLASS_LABELS[cls]}»`, `≤ ${limit} мс`);
    if (level.slo?.availability) row("Доступність за годину", `≥ ${fmtPct(level.slo.availability, 1)}`);
    if (level.slo?.maxLagSec) row("Затримка обробки", `≤ ${Math.round(level.slo.maxLagSec / 60)} хв`);
    if (level.slo?.maxStalenessSec) row("Свіжість даних", `≤ ${level.slo.maxStalenessSec} с`);
    if (level.slo?.maxOutageTicks) row("RTO", `≤ ${level.slo.maxOutageTicks} хв`);
    if (level.budget) row("Бюджет", `${fmtMoney(level.budget)} / міс`);
    req.append(table);
    body.append(req);

    const incidents = el("div", "lvl__incidents");
    incidents.append(el("h3", "section__title", "Що може статися"));
    const list = el("ul", "lvl__list");
    for (const incident of level.incidents ?? []) {
      list.append(el("li", "", `${INCIDENT_TYPES[incident.type]?.icon ?? "⚡"} ${incident.title}`));
    }
    incidents.append(list, el("p", "muted", "Коли саме — дізнаєтеся під час прогону. На співбесіді теж не кажуть, о котрій упаде зона."));
    body.append(incidents);

    const kit = el("div", "lvl__kit");
    kit.append(el("h3", "section__title", "Доступні компоненти"));
    const chips = el("div", "lvl__chips");
    for (const type of level.palette) chips.append(chip(COMPONENTS[type].label));
    kit.append(chips);
    body.append(kit);

    const read = el("div", "lvl__read");
    read.append(el("h3", "section__title", "Корисно прочитати"));
    const links = el("div", "lvl__chips");
    for (const id of level.codexRefs ?? []) {
      if (CODEX[id]) links.append(button(CODEX[id].title, { variant: "ghost", onClick: () => ctx.openCodex(id) }));
    }
    read.append(links);
    body.append(read);

    dialog.foot.append(button("До роботи", { variant: "primary", onClick: () => dialog.hide() }));
    dialog.show();
  }

  // ─────────────────────────── підказки ───────────────────────────

  function openHints() {
    const dialog = modal({ title: "Підказки" });
    const render = () => {
      dialog.body.replaceChildren();
      const used = store.state.campaign[level.id]?.hintsUsed ?? 0;
      if (!used) dialog.body.append(el("p", "muted", "Підказки відкриваються по одній — від натяку до майже готової відповіді."));
      level.hints.slice(0, used).forEach((hint, i) => {
        const item = el("div", "lvl__hint");
        item.append(el("strong", "", `${i + 1}.`), el("span", "", hint));
        dialog.body.append(item);
      });
      dialog.foot.replaceChildren();
      if (used < level.hints.length) {
        dialog.foot.append(
          button(used ? "Ще одну" : "Показати першу", {
            variant: "primary",
            onClick: () => {
              store.update(() => (entry().hintsUsed = Math.min(level.hints.length, used + 1)));
              updateHintLabel();
              render();
            },
          }),
        );
      }
      dialog.foot.append(button("Закрити", { onClick: () => dialog.hide() }));
    };
    render();
    dialog.show();
  }

  // ─────────────────────────── розбір ───────────────────────────

  function finishRun(run, score) {
    const before = levelStars(store.state, level.id);
    store.update(
      () => {
        const record = entry();
        if (score.stars >= record.stars) {
          record.stars = score.stars;
          record.best = { cost: run.summary.cost, availability: run.summary.availability };
        }
        if (score.stars > 0 && !record.solvedAt) record.solvedAt = Date.now();
      },
      { immediate: true },
    );
    renderStars();
    openDebrief(run, score, before);
  }

  function openDebrief(run, score, before) {
    const dialog = modal({ title: score.stars ? "Прогін завершено" : "Система не впоралася", wide: true });
    const body = dialog.body;
    body.classList.add("lvl__debrief");

    const top = el("div", "lvl__result");
    const big = starsEl(score.stars);
    big.classList.add("lvl__big-stars");
    top.append(big);
    if (score.stars > before) top.append(chip(before ? "Новий рекорд!" : "Рівень пройдено!", "good"));
    top.append(
      el(
        "p",
        "lvl__summary",
        `Доступність ${fmtPct(run.summary.availability, 2)} · вартість ${fmtMoney(run.summary.cost)}/міс${level.budget ? ` з ${fmtMoney(level.budget)}` : ""}`,
      ),
    );
    body.append(top);

    const tiers = [
      { tier: 1, title: "★ Працює" },
      { tier: 2, title: "★★ Тримає SLO під час інцидентів" },
      { tier: 3, title: "★★★ Як на співбесіді" },
    ];
    const grid = el("div", "lvl__criteria");
    for (const { tier, title } of tiers) {
      const items = score.criteria.filter((item) => item.tier === tier);
      if (!items.length) continue;
      const box = el("div", "lvl__tier");
      box.append(el("h3", "section__title", title));
      const list = el("ul", "lvl__checks");
      for (const item of items) {
        const li = el("li", "lvl__check");
        li.dataset.ok = String(item.ok);
        li.append(el("span", "lvl__mark", item.ok ? "✓" : "✗"), el("span", "lvl__check-label", item.label));
        if (item.detail) li.append(el("span", "lvl__check-detail", item.detail));
        if (item.codexRef && !item.ok) li.append(button("?", { variant: "ghost", title: "Довідник", onClick: () => ctx.openCodex(item.codexRef) }));
        list.append(li);
      }
      box.append(list);
      grid.append(box);
    }
    body.append(grid);

    const episodes = run.summary.bottlenecks.filter((note) => note.tone !== "info").slice(0, 5);
    if (episodes.length) {
      const story = el("div", "lvl__story");
      story.append(el("h3", "section__title", "Що сталося"));
      const list = el("ul", "lvl__episodes");
      for (const note of episodes) {
        const li = el("li", "lvl__episode");
        li.dataset.tone = note.tone;
        li.append(el("span", "lvl__range", note.range), el("span", "", note.text));
        list.append(li);
      }
      story.append(list);
      body.append(story);
    }

    const lesson = el("div", "lvl__lesson");
    lesson.append(el("h3", "section__title", "Урок"), el("p", "text", level.debrief.lesson));
    lesson.append(el("h3", "section__title", "На співбесіді"), el("p", "text lvl__interview", level.debrief.interview));
    body.append(lesson);

    const costs = run.cost.items.filter((item) => item.cost >= 1).slice(0, 6);
    if (costs.length) {
      const box = el("div", "lvl__costs");
      box.append(el("h3", "section__title", "Куди йдуть гроші, $/міс"));
      box.append(barChart({ items: costs.map((item) => ({ label: item.label.slice(0, 12), value: Math.round(item.cost) })), unit: "" }));
      body.append(box);
    }

    const nextId = LEVEL_ORDER[index + 1];
    if (score.stars >= 1 && nextId) {
      dialog.foot.append(
        button("Наступний рівень →", {
          variant: "primary",
          onClick: () => {
            dialog.hide();
            ctx.go("level", { id: nextId });
          },
        }),
      );
    } else if (score.stars >= 1) {
      dialog.foot.append(button("До кампанії", { variant: "primary", onClick: () => ctx.go("campaign") }));
    }
    dialog.foot.append(
      button("Доробити схему", {
        onClick: () => {
          dialog.hide();
          builder.exitPlayback();
        },
      }),
      button("Переглянути прогін", { variant: "ghost", onClick: () => dialog.hide() }),
    );
    dialog.show();
  }

  return {
    unmount() {
      builder.destroy();
      store.flush();
    },
  };
}
