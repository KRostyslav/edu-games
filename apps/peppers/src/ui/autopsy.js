/**
 * Розтин загиблої рослини.
 *
 * Головна ідея: безпосередня причина смерті майже завжди нецікава. Цікавий
 * момент, після якого результат був уже вирішений, — і він зазвичай стоїть на
 * два-три місяці раніше.
 *
 * Останній розділ — «чому інші вижили» — те, заради чого в грі взагалі чотири
 * рослини. Порівняння з сусіднім горщиком, що пережив ту саму зиму, пояснює
 * різницю видів переконливіше за будь-яку статтю довідника.
 */

import { el, modal } from "@edu/pixel-ui";
import { timeline } from "./widgets.js";
import { CULTIVARS, PLANT_IDS, speciesOf } from "../data/plants.data.js";
import { MONTH_NAMES } from "../data/calendar.js";
import { markerLabel } from "../game/verdict.js";
import { actionsForMonth } from "../data/actions.data.js";

export function openAutopsy({ state, plantId, onCodex }) {
  const plant = state.plants[plantId];
  const cultivar = CULTIVARS[plantId];
  const box = modal({ title: `Розтин: ${cultivar.name}`, wide: true });

  if (!plant.death) {
    box.body.append(el("p", "autopsy__text", "Ця рослина жива."));
    box.show();
    return box;
  }

  const death = plant.death;

  // ── Що сталося ──
  const head = el("section", "autopsy__head");
  head.append(
    // Без відмінювання назви місяця: «загинув у травень» різало б око, а
    // тягнути в гру таблицю відмінків заради одного рядка не варто.
    el("h3", "autopsy__cause", `${cultivar.name} загинув — ${MONTH_NAMES[death.month]}, ${death.year}-й рік`),
    el("p", "autopsy__label", `Причина: ${death.cause}`),
    el("p", "autopsy__text", death.reason),
  );
  box.body.append(head);

  // ── Коли це вирішилося ──
  const pivot = death.decidedAt;
  if (pivot) {
    const section = el("section", "autopsy__pivot");
    section.append(el("h4", "autopsy__title", "Коли це насправді вирішилося"));
    section.append(
      el(
        "p",
        "autopsy__pivot-when",
        `${markerLabel(pivot)} — за ${monthsBetween(pivot, death)} до загибелі`,
      ),
    );
    section.append(el("p", "autopsy__text", pivot.text));
    section.append(
      el(
        "p",
        "autopsy__pivot-note",
        "Із цього моменту рослина була приречена: далі кожен наступний місяць лише додавав до вже зробленого.",
      ),
    );
    box.body.append(section);
  }

  // ── Останній шанс ──
  if (death.lastChance && death.lastChance !== pivot) {
    const section = el("section", "autopsy__chance");
    section.append(el("h4", "autopsy__title", "Останній момент, коли ще можна було врятувати"));
    section.append(el("p", "autopsy__pivot-when", markerLabel(death.lastChance)));
    section.append(el("p", "autopsy__text", death.lastChance.text));
    box.body.append(section);
  }

  // ── Хронологія ──
  if (death.chain.length) {
    const section = el("section", "autopsy__chain");
    section.append(el("h4", "autopsy__title", "Хронологія"));
    section.append(
      timeline({
        items: death.chain.map((marker, index) => ({
          // Згорнутий відрізок підписується діапазоном: «Листопад — Квітень».
          when: marker.until
            ? `${markerLabel(marker)} — ${markerLabel(marker.until)}`
            : markerLabel(marker),
          text:
            marker.count > 1
              ? `${marker.text} Так тривало ${marker.count} ${monthsWord(marker.count)} поспіль.`
              : marker.text,
          tone: marker.tone,
          pivot: index === 0,
          tag: index === 0 ? "початок" : null,
        })),
      }),
    );
    box.body.append(section);
  } else {
    box.body.append(
      el(
        "p",
        "autopsy__text",
        "Попереджень у журналі немає: загибель настала швидше, ніж показники встигли перетнути пороги.",
      ),
    );
  }

  // ── Що треба було зробити ──
  const remedies = remediesFor(death.code);
  if (remedies.length) {
    const section = el("section", "autopsy__remedy");
    section.append(el("h4", "autopsy__title", "Що треба було зробити"));
    for (const action of remedies) {
      const item = el("div", "autopsy__remedy-item");
      item.append(el("h5", "autopsy__remedy-name", action.label), el("p", "autopsy__text", action.why));
      if (action.codexRef && onCodex) {
        const link = el("button", "btn btn--ghost btn--small", "Довідник");
        link.type = "button";
        link.addEventListener("click", () => onCodex(action.codexRef));
        item.append(link);
      }
      section.append(item);
    }
    box.body.append(section);
  }

  // ── Чому інші вижили ──
  const comparison = compareWithSurvivors(state, plantId, death);
  if (comparison) {
    const section = el("section", "autopsy__compare");
    section.append(el("h4", "autopsy__title", "Чому інші вижили"));
    section.append(el("p", "autopsy__text", comparison));
    box.body.append(section);
  }

  const close = el("button", "btn btn--primary", "Зрозуміло");
  close.type = "button";
  close.addEventListener("click", () => box.hide());
  box.foot.append(close);

  box.show();
  return box;
}

/** Дії, які запобігли б саме цій смерті. */
function remediesFor(code) {
  const wanted = {
    freeze: ["insulate_pots", "seal_windows", "heater_on", "thermometer"],
    root_rot: ["water_dormant", "repot_fresh"],
    drought: ["water_normal", "water_dormant", "repot_fresh"],
    salinity: ["autumn_flush", "repot_fresh"],
    mites: ["mite_prevention", "mite_treatment", "humidifier_on"],
    exhaustion: ["grow_light", "winter_prune"],
  }[code];

  if (!wanted) return [];

  // Беремо описи з реєстру дій, а не пишемо окремі тексти: інакше порада
  // в розтині розійдеться з тим, що написано на картці.
  const all = new Map();
  for (let month = 1; month <= 12; month += 1) {
    for (const action of actionsForMonth(month)) all.set(action.id, action);
  }
  return wanted.map((id) => all.get(id)).filter(Boolean);
}

/**
 * Порівняння з тими, хто пережив ту саму зиму на тому самому балконі.
 *
 * Якщо вижив кущ іншого виду — це найсильніший урок гри. Якщо того самого,
 * різниця в догляді, і це теж треба сказати прямо.
 */
function compareWithSurvivors(state, deadId, death) {
  const deadSpecies = speciesOf(deadId);
  const survivors = PLANT_IDS.filter((id) => id !== deadId && state.plants[id].alive > 0);
  if (survivors.length === 0) return null;

  const otherSpecies = survivors.find((id) => speciesOf(id).id !== deadSpecies.id);
  const coldRelated = death.code === "freeze" || death.code === "root_rot";

  if (otherSpecies && coldRelated) {
    const sp = speciesOf(otherSpecies);
    return (
      `${CULTIVARS[otherSpecies].name} пережив ту саму зиму на тому самому балконі. ` +
      `Різниця не в догляді, а у виді: коріння ${sp.label} витримує ${sp.rootKillC} °C у грудці, ` +
      `а ${deadSpecies.label} гине вже при +${deadSpecies.rootKillC} °C. ` +
      `Зимівлю налаштовують під найвимогливішу рослину колекції, а не під найвитривалішу.`
    );
  }

  const sameSpecies = survivors.find((id) => speciesOf(id).id === deadSpecies.id);
  if (sameSpecies) {
    return (
      `${CULTIVARS[sameSpecies].name} — того самого виду й вижив у тих самих умовах. ` +
      `Отже справа не у виді, а в догляді за конкретним горщиком: об'єм, полив або пропущена обробка.`
    );
  }

  // Причини, не пов'язані з холодом, часто впираються в об'єм горщика: те саме
  // занедбання вбиває дволітровий горщик і не помічається в дванадцятилітровому.
  // Але казати це можна лише тоді, коли вижилий справді сидить у більшому.
  const deadVolume = state.plants[deadId].pot.volume;
  const roomier = survivors
    .map((id) => ({ id, volume: state.plants[id].pot.volume }))
    .sort((a, b) => b.volume - a.volume)
    .find((entry) => entry.volume > deadVolume);

  if (roomier) {
    return (
      `${CULTIVARS[roomier.id].name} пережив той самий місяць у ${roomier.volume} л проти ` +
      `${deadVolume} л у загиблого. Об'єм субстрату — це запас часу на вашу помилку: ` +
      `чим менший горщик, тим менше в нього права на пропущений полив.`
    );
  }

  return (
    `${CULTIVARS[survivors[0]].name} пережив той самий місяць у схожому горщику. ` +
    `Отже справа не в посуді й не у виді, а в догляді саме за цим горщиком.`
  );
}

function monthsBetween(marker, death) {
  const n = Math.abs((death.year - marker.year) * 12 + (death.month - marker.month));
  if (n <= 0) return "той самий місяць";
  if (n === 1) return "місяць";
  return `${n} ${monthsWord(n)}`;
}

/** Українська плюралізація місяців. */
function monthsWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "місяць";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "місяці";
  return "місяців";
}
