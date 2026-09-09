import { el, modal } from "@edu/pixel-ui";
import { ACTIONS_BY_ID } from "../data/actions.data.js";
import { MONTH_NAMES } from "../data/calendar.js";
import { openCodex } from "./codex.js";

/**
 * Розбір місяця — головний навчальний екран гри.
 *
 * Показує три речі, і саме в такому порядку:
 *   що зробили і що це дало (з числами й причиною),
 *   що зробила погода,
 *   що пропустили і чим це загрожує.
 *
 * Усі рядки будуються з логу ефектів, тому пояснення завжди відповідає
 * реальному розрахунку, а не окремо написаному тексту.
 */
export function openDebrief({ result, onContinue }) {
  const { month, effects, weather, missed } = result;
  const dialog = modal({ title: `${MONTH_NAMES[month]}: що сталося`, wide: true });

  const grid = el("div", "debrief");

  // ── Колонка 1: дії гравця ──
  const done = el("section", "debrief__col");
  done.append(el("h3", "debrief__heading", "Ваші дії"));

  const byAction = groupBySource(effects.filter((e) => ACTIONS_BY_ID[e.source]));
  if (byAction.size === 0) {
    done.append(
      el("p", "debrief__empty", "Цього місяця ви нічого не робили. Іноді це правильно — але не завжди."),
    );
  }
  for (const [actionId, list] of byAction) {
    const action = ACTIONS_BY_ID[actionId];
    const block = el("div", "debrief__block");
    block.append(el("h4", "debrief__block-title", action.label));
    block.append(effectList(list));
    if (action.codexRef) block.append(codexLink(action.codexRef));
    done.append(block);
  }

  // ── Колонка 2: природа й погода ──
  const nature = el("section", "debrief__col");
  nature.append(el("h3", "debrief__heading", "Погода і природні процеси"));

  const weatherBox = el("div", "debrief__block debrief__block--weather");
  weatherBox.append(el("h4", "debrief__block-title", weather.label));
  weatherBox.append(el("p", "debrief__weather-text", weather.description));
  const weatherEffects = effects.filter((e) => String(e.source).startsWith("weather:"));
  if (weatherEffects.length) weatherBox.append(effectList(weatherEffects));
  nature.append(weatherBox);

  const naturalEffects = effects.filter((e) => e.source === "natural");
  if (naturalEffects.length) {
    const block = el("div", "debrief__block");
    block.append(el("h4", "debrief__block-title", "Кущ живе сам"));
    block.append(effectList(naturalEffects));
    nature.append(block);
  }

  grid.append(done, nature);
  dialog.body.append(grid);

  // ── Пропущене — на всю ширину, бо це найважливіше ──
  if (missed.length) {
    const warn = el("section", "debrief__missed");
    warn.append(el("h3", "debrief__heading", "Що ви пропустили"));
    for (const action of missed) {
      const item = el("div", "debrief__miss");
      item.append(el("h4", "debrief__block-title", action.label));
      item.append(el("p", "debrief__miss-text", action.missed));
      item.append(el("p", "debrief__miss-why", action.risk));
      if (action.codexRef) item.append(codexLink(action.codexRef));
      warn.append(item);
    }
    dialog.body.append(warn);
  }

  const next = el("button", "btn btn--primary", "Далі");
  next.type = "button";
  next.addEventListener("click", () => {
    dialog.hide();
    onContinue?.();
  });
  dialog.foot.append(next);

  dialog.show();
  next.focus();
}

function groupBySource(effects) {
  const map = new Map();
  for (const effect of effects) {
    if (!map.has(effect.source)) map.set(effect.source, []);
    map.get(effect.source).push(effect);
  }
  return map;
}

/** Рядок ефекту: показник, зміна в числах і — обов'язково — причина. */
function effectList(effects) {
  const list = el("ul", "effects");
  for (const effect of effects) {
    const delta = effect.actualDelta ?? effect.delta;
    const item = el("li", "effects__item");
    item.dataset.tone = effect.tone;

    const head = el("div", "effects__head");
    head.append(el("span", "effects__name", STAT_NAMES[effect.target] ?? effect.target));
    if (Math.abs(delta) >= 1) {
      head.append(el("span", "effects__delta", `${delta > 0 ? "+" : ""}${Math.round(delta)}`));
    } else if (isFlag(effect.target)) {
      head.append(el("span", "effects__delta", delta > 0 ? "так" : "знято"));
    } else {
      head.append(el("span", "effects__delta", "без змін"));
    }
    item.append(head);
    item.append(el("p", "effects__reason", effect.reason));
    list.append(item);
  }
  return list;
}

function isFlag(target) {
  return target.startsWith("flags.");
}

function codexLink(ref) {
  const link = el("button", "btn btn--ghost", "Як це працює →");
  link.type = "button";
  link.addEventListener("click", () => openCodex(ref));
  return link;
}

export const STAT_NAMES = {
  "vine.reserves": "Запас поживних речовин",
  "vine.woodRipeness": "Визрівання лози",
  "vine.hardiness": "Морозостійкість",
  "vine.budsAlive": "Живі вічка",
  "vine.load": "Навантаження куща",
  "vine.vigor": "Сила росту",
  "vine.canopy": "Листовий апарат",
  "soil.moisture": "Волога ґрунту",
  "soil.nitrogen": "Азот",
  "soil.phosphorus": "Фосфор",
  "soil.potassium": "Калій",
  "soil.organic": "Органіка",
  "soil.structure": "Структура ґрунту",
  "disease.mildew": "Мілдью",
  "disease.oidium": "Оїдіум",
  "disease.rot": "Сіра гниль",
  "disease.pests": "Шкідники",
  "crop.setRate": "Зав'язування ягід",
  "crop.berrySize": "Розмір ягоди",
  "crop.sugar": "Цукор",
  "crop.sanitary": "Стан грон",
  "flags.covered": "Укриття",
  "flags.toolsReady": "Готовність інструменту",
  "flags.frostGuard": "Захист від заморозків",
  "flags.wateringStopped": "Полив припинено",
  "flags.measured": "Замір стиглості",
  "flags.pruned": "Обрізка виконана",
};
