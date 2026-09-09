import { el, modal, barChart } from "@edu/pixel-ui";
import { ACTIONS_BY_ID } from "../data/actions.data.js";
import { MONTH_NAMES } from "../data/calendar.js";
import { STAT_NAMES } from "./debrief.js";
import { openCodex } from "./codex.js";

/**
 * Річний звіт. Розбір місяця пояснює окремі кроки, а звіт — сезон як ціле:
 * з яких множників склався врожай, які рішення дали найбільше і чого забракло.
 */
export function openYearReport({ state, harvest, notes, onContinue }) {
  const dialog = modal({ title: `Рік ${state.year}: підсумок сезону`, wide: true });

  // ── Врожай ──
  const head = el("section", "report__head");
  head.dataset.tone = harvest.grade.tone;
  head.append(el("h3", "report__grade", harvest.grade.label));
  head.append(el("p", "report__grade-note", harvest.grade.note));

  const numbers = el("div", "report__numbers");
  numbers.append(
    bigNumber(`${harvest.kg}`, "кг з куща"),
    bigNumber(`${harvest.brix}`, "°Brix цукру"),
    bigNumber(`${harvest.sanitary}`, "стан грон зі 100"),
  );
  head.append(numbers);
  dialog.body.append(head);

  // ── З чого склався врожай ──
  const breakdown = el("section", "report__section");
  breakdown.append(el("h3", "report__heading", "З чого склався врожай"));
  breakdown.append(
    el(
      "p",
      "report__note",
      "Врожай — це добуток кількох множників. Найнижчий із них обмежує все інше: підтягувати треба саме його.",
    ),
  );

  const sorted = [...harvest.factors].sort((a, b) => a.value - b.value);
  for (const factor of sorted) {
    const row = el("div", "factor");
    row.dataset.tone = factor.value > 0.85 ? "good" : factor.value > 0.6 ? "warn" : "bad";
    const top = el("div", "factor__head");
    top.append(el("span", "factor__label", factor.label));
    top.append(el("span", "factor__value", `×${factor.value.toFixed(2)}`));
    const track = el("div", "factor__track");
    const fill = el("div", "factor__fill");
    fill.style.width = `${Math.min(100, factor.value * 80)}%`;
    track.append(fill);
    row.append(top, track, el("p", "factor__detail", factor.detail), el("p", "factor__why", factor.why));
    breakdown.append(row);
  }
  dialog.body.append(breakdown);

  // ── Топ рішень сезону ──
  const decisions = analyzeSeason(state);

  if (decisions.helped.length) {
    dialog.body.append(
      listSection("Що спрацювало найкраще", decisions.helped, "good"),
    );
  }
  if (decisions.hurt.length) {
    dialog.body.append(listSection("Що коштувало врожаю", decisions.hurt, "bad"));
  }
  if (decisions.skipped.length) {
    dialog.body.append(listSection("Що ви пропустили за сезон", decisions.skipped, "warn"));
  }

  // ── Наслідки на наступний рік ──
  if (notes?.length) {
    const carry = el("section", "report__section");
    carry.append(el("h3", "report__heading", "Що переходить у наступний рік"));
    for (const note of notes) {
      const item = el("p", "report__carry", note.text);
      item.dataset.tone = note.tone;
      carry.append(item);
    }
    dialog.body.append(carry);
  }

  // ── Порівняння років ──
  const history = [...state.harvests, { year: state.year, ...harvest }];
  if (history.length > 1) {
    const compare = el("section", "report__section");
    compare.append(el("h3", "report__heading", "Порівняння років"));
    compare.append(
      barChart({
        items: history.map((h) => ({
          label: `Рік ${h.year}`,
          value: h.kg,
          tone: h.kg >= 8 ? "good" : h.kg >= 4 ? undefined : "bad",
        })),
        unit: " кг",
      }),
    );
    dialog.body.append(compare);
  }

  const next = el("button", "btn btn--primary", `Почати рік ${state.year + 1}`);
  next.type = "button";
  next.addEventListener("click", () => {
    dialog.hide();
    onContinue?.();
  });
  const codex = el("button", "btn", "Довідник");
  codex.type = "button";
  codex.addEventListener("click", () => openCodex());
  dialog.foot.append(codex, next);

  dialog.show();
  next.focus();
}

function bigNumber(value, caption) {
  const box = el("div", "bignum");
  box.append(el("span", "bignum__value", value), el("span", "bignum__caption", caption));
  return box;
}

function listSection(title, items, tone) {
  const section = el("section", "report__section");
  section.append(el("h3", "report__heading", title));
  const list = el("ul", "report__list");
  for (const item of items) {
    const li = el("li", "report__item");
    li.dataset.tone = tone;
    li.append(el("strong", "report__item-title", item.title));
    li.append(el("span", "report__item-text", item.text));
    if (item.codexRef) {
      const link = el("button", "btn btn--ghost", "Як це працює →");
      link.type = "button";
      link.addEventListener("click", () => openCodex(item.codexRef));
      li.append(link);
    }
    list.append(li);
  }
  section.append(list);
  return section;
}

/**
 * Витягує з журналу сезону найвпливовіші рішення.
 * Аналіз іде по тому самому логу ефектів, що й місячні розбори, — тому звіт
 * не може розійтися з тим, що гравець бачив протягом року.
 */
function analyzeSeason(state) {
  const helped = [];
  const hurt = [];
  const skipped = [];

  for (const entry of state.seasonLog) {
    for (const id of entry.missed ?? []) {
      const action = ACTIONS_BY_ID[id];
      if (!action) continue;
      skipped.push({
        title: `${MONTH_NAMES[entry.month]}: ${action.label}`,
        text: action.missed,
        codexRef: action.codexRef,
      });
    }
  }

  const scores = new Map();
  for (const effect of state.seasonEffects ?? []) {
    const action = ACTIONS_BY_ID[effect.source];
    if (!action) continue;
    const weight = IMPACT_WEIGHT[effect.target] ?? 0.5;
    const score = (effect.actualDelta ?? effect.delta) * weight;
    if (Math.abs(score) < 1) continue;
    const current = scores.get(effect.source) ?? { action, score: 0, reasons: [] };
    current.score += score;
    current.reasons.push(effect.reason);
    scores.set(effect.source, current);
  }

  const ranked = [...scores.values()].sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  for (const entry of ranked) {
    const item = {
      title: entry.action.label,
      text: entry.reasons[0],
      codexRef: entry.action.codexRef,
    };
    if (entry.score > 0 && helped.length < 3) helped.push(item);
    if (entry.score < 0 && hurt.length < 3) hurt.push(item);
  }

  return { helped, hurt, skipped: skipped.slice(0, 6) };
}

/**
 * Вага показника у формуванні врожаю. Потрібна, щоб «+30 вологи ґрунту»
 * не виглядало важливішим за «+10 до зав'язування ягід».
 */
const IMPACT_WEIGHT = {
  "vine.budsAlive": 1.4,
  "vine.load": 1.2,
  "vine.woodRipeness": 1.1,
  "vine.hardiness": 1.0,
  "vine.reserves": 1.0,
  "crop.setRate": 1.4,
  "crop.berrySize": 1.3,
  "crop.sugar": 1.2,
  "crop.sanitary": 1.3,
  "disease.mildew": -0.9,
  "disease.oidium": -0.8,
  "disease.rot": -0.8,
  "disease.pests": -0.6,
  "soil.moisture": 0.35,
  "soil.potassium": 0.4,
  "soil.nitrogen": 0.3,
  "vine.canopy": 0.6,
};

export { STAT_NAMES };
