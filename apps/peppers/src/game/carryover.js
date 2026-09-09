/**
 * Перехід у наступний рік.
 *
 * Головна навчальна ідея гри живе саме тут: перець — багаторічна рослина, і
 * кущ, який пережив зиму, наступного року інший. Він старший, дерев'янистіший,
 * стартує раніше — але й тягне за собою все, чого ви не виправили: засолення
 * субстрату, тісний горщик, недобитого кліща.
 */

import { cloneState } from "@edu/sim-core";
import { CULTIVARS, PLANT_IDS } from "../data/plants.data.js";
import { potFactor } from "./model.js";

export function startNextYear(state, harvest) {
  const next = cloneState(state);
  const notes = [];

  next.year += 1;
  next.month = 10;

  for (const id of PLANT_IDS) {
    const plant = next.plants[id];
    const c = CULTIVARS[id];
    const result = harvest.plants.find((p) => p.id === id);

    if (plant.alive <= 0) {
      notes.push({
        tone: "warn",
        text:
          `Горщик ${c.name} вільний. У лютому в нього можна посіяти насіння, але сіянець першого року ` +
          `дасть приблизно третину того, що дав би перезимований кущ.`,
      });
      continue;
    }

    // ── Вік: головний множник наступного врожаю ──
    plant.age += 1;
    if (plant.age === 2) {
      notes.push({
        tone: "good",
        text:
          `${c.name} перезимував і йде у другий рік. Він стартує навесні з готового скелета й коріння, ` +
          `а не з насінини, — цвісти почне на 6–8 тижнів раніше.`,
      });
    }

    // ── Виснаження врожаєм ──
    const drain = Math.round((result?.grams ?? 0) * 0.05);
    if (drain > 0) {
      plant.reserves = clamp(plant.reserves - drain);
      if (drain > 12) {
        notes.push({
          tone: "warn",
          text: `${c.name} віддав ${result.grams} г і витратив на це ${drain} одиниць запасу стебла. Рекордний рік купується наступним.`,
        });
      }
    }

    // ── Кущ дерев'яніє й міцніє ──
    plant.woody = clamp(plant.woody + (plant.age <= 3 ? 10 : 5));
    if (plant.age >= 2 && plant.age <= 3) plant.vigor = clamp(plant.vigor + 4);

    // ── Горщик: те, що накопичується роками ──
    // Коренезв'язаність зростає щороку і рано чи пізно змусить пересадити.
    plant.rootFill = clamp(plant.rootFill + 25);
    plant.pot.drainage = clamp(plant.pot.drainage - 12);
    // Засолення практично не зникає само — це найдовший хвіст у грі.
    plant.pot.salinity = clamp(plant.pot.salinity * 0.9);

    if (plant.rootFill > 88) {
      notes.push({
        tone: "warn",
        text:
          `Коріння ${c.name} заповнило горщик (${Math.round(plant.rootFill)}). Наступної весни без пересадки ` +
          `кущ пересихатиме за день і не втримає врожай.`,
      });
    }
    if (plant.pot.salinity > 55) {
      notes.push({
        tone: "bad",
        text:
          `Засолення субстрату ${c.name} — ${Math.round(plant.pot.salinity)}. Солі не вимиваються самі: ` +
          `потрібне промивання або повна заміна субстрату.`,
      });
    }
    if (potFactor(plant, c) < 0.7) {
      notes.push({
        tone: "warn",
        text: `${c.name} сидить у ${plant.pot.volume} л при потребі ${c.needL} л — врожай обмежений посудом.`,
      });
    }

    // ── Живлення вимивається й витрачається ──
    plant.pot.nitrogen = clamp(plant.pot.nitrogen * 0.4);
    plant.pot.pk = clamp(plant.pot.pk * 0.5);
    plant.pot.calcium = clamp(plant.pot.calcium * 0.7);
    plant.pot.magnesium = clamp(plant.pot.magnesium * 0.6);

    // ── Шкідники живуть на кущі, а не в сезоні ──
    plant.mites = clamp(plant.mites * 0.7);
    plant.pests = clamp(plant.pests * 0.5);
    if (plant.mites > 30) {
      notes.push({
        tone: "warn",
        text: `Кліщ на ${c.name} не добитий (${Math.round(plant.mites)}) — він перезимує разом із кущем і навесні почне з готової колонії.`,
      });
    }

    // ── Скидання сезонного ──
    plant.flowers = 0;
    plant.fruitSet = 0;
    plant.fruitFill = 0;
    plant.ripeness = 0;
    plant.pungency = c.basePungency;
    plant.damage = clamp(plant.damage * 0.3);
    plant.dormancy = 0;

    // Листя НЕ обнуляється — і це принципова відмінність від листопадних культур.
    // Перець вічнозелений: він входить у новий рік із тим листям, яке в нього
    // реально лишилося після зими.
    if (plant.leaf < 20) {
      notes.push({
        tone: "warn",
        text:
          `${c.name} входить у новий рік майже голим (листя ${Math.round(plant.leaf)}). ` +
          `Перець не скидає листя за календарем — це наслідок зимівлі, і навесні кущ ` +
          `витратить місяць лише на відновлення крони.`,
      });
    }
  }

  next.flags = { hardenedOff: 0, outdoorMode: 0, ventilated: 0 };
  next.seasonLog = [];
  next.seasonEffects = [];
  next.harvests = [...state.harvests, { year: state.year, ...harvest }];

  return { state: next, notes };
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(v)));
}
