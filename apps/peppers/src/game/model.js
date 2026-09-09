/**
 * Стан балкона і межі показників.
 *
 * Стан має три шари, і поділ між ними — сам по собі модель:
 *
 *   balcony    — середовище, спільне для всіх чотирьох горщиків. Вимкнути
 *                опалення для одного хабанеро неможливо;
 *   equipment  — обладнання. Купується один раз і живе між роками, на відміну
 *                від сезонних прапорців: лампа не зникає в новому році;
 *   plants     — чотири рослини. Усе, що можна зробити з окремою рослиною,
 *                живе тут.
 */

import { CULTIVARS, PLANT_IDS } from "../data/plants.data.js";
import { BALCONY_PHASE } from "../data/calendar.js";

export { PLANT_IDS };

/** Шлях до показника горщика — єдине місце, де збирається цей рядок. */
export const plantPath = (plantId, key) => `plants.${plantId}.${key}`;

/**
 * Префіксер, прив'язаний до рослини. Його отримує кожна дія зі scope "plant",
 * тому в самих діях шляхи пишуться коротко: P("pot.moisture").
 */
export const pathFor = (plantId) => (key) => plantPath(plantId, key);

/**
 * Показники однієї рослини та їхні межі.
 *
 * Звідси генеруються межі для всіх чотирьох горщиків. Писати 104 ключі руками
 * не можна: `applyEffects` при відсутньому ключі мовчки бере [0, 100], і
 * помилка не впаде, а тихо спотворить модель.
 */
const PLANT_STATS = {
  alive: [0, 1],
  age: [0, 12],

  // ── Кущ ──
  vigor: [0, 100],
  leaf: [0, 100],
  reserves: [0, 100],
  woody: [0, 100],
  dormancy: [0, 100],
  buds: [0, 100],
  damage: [0, 100],

  // ── Коріння й горщик ──
  roots: [0, 100],
  rootFill: [0, 100],
  "pot.volume": [0, 25],
  "pot.moisture": [0, 100],
  "pot.drainage": [0, 100],
  "pot.salinity": [0, 100],
  "pot.nitrogen": [0, 100],
  "pot.pk": [0, 100],
  "pot.calcium": [0, 100],
  "pot.magnesium": [0, 100],

  // ── Урожай ──
  flowers: [0, 100],
  fruitSet: [0, 100],
  fruitFill: [0, 100],
  ripeness: [0, 100],
  pungency: [0, 100],

  // ── Шкідники ──
  // Кліщ окремо від комах: це павукоподібний, на нього не діють інсектициди,
  // і бореться з ним гравець зовсім іншими діями.
  mites: [0, 100],
  pests: [0, 100],
};

const EQUIPMENT = ["lamp", "insulation", "potStand", "humidifier", "heater", "fan", "thermometer"];
const SEASON_FLAGS = ["hardenedOff", "outdoorMode", "ventilated"];

const binary = (group, keys) =>
  Object.fromEntries(keys.map((key) => [`${group}.${key}`, [0, 1]]));

export const LIMITS = {
  year: [1, 99],
  month: [1, 12],

  // Температура — єдині показники з від'ємною межею. Забути їх тут означає,
  // що будь-який мінус мовчки перетвориться на 0 і зима зникне з моделі.
  "balcony.tempAir": [-15, 45],
  "balcony.tempFloor": [-17, 42],
  "balcony.light": [0, 100],
  "balcony.humidity": [0, 100],
  "balcony.airflow": [0, 100],
  "balcony.mitePressure": [0, 100],

  ...binary("equipment", EQUIPMENT),
  ...binary("flags", SEASON_FLAGS),

  ...Object.fromEntries(
    PLANT_IDS.flatMap((id) =>
      Object.entries(PLANT_STATS).map(([key, range]) => [plantPath(id, key), range]),
    ),
  ),
};

/**
 * Початковий стан: жовтень, чотири кущі, вирощені з насіння цього року й уже
 * віддали перший урожай.
 *
 * Значення навмисно середні — гравець має простір і покращити, і зіпсувати.
 * Головне, чого тут немає: обладнання. Балкон порожній, і перша зима стане
 * перевіркою того, чи гравець зрозумів, що саме на ньому потрібно.
 */
export function createInitialState() {
  return {
    year: 1,
    month: 10,

    balcony: {
      tempAir: 14,
      tempFloor: 11,
      light: 38,
      humidity: 55,
      airflow: 40,
      mitePressure: 12,
    },

    equipment: Object.fromEntries(EQUIPMENT.map((key) => [key, 0])),
    flags: Object.fromEntries(SEASON_FLAGS.map((key) => [key, 0])),

    plants: Object.fromEntries(PLANT_IDS.map((id) => [id, makePlant(id)])),

    // Не показники, а журнали: що відбувалося й чим це скінчилося.
    seasonLog: [],
    seasonEffects: [],
    harvests: [],
    deaths: [],
  };
}

export function makePlant(id) {
  const c = CULTIVARS[id];
  return {
    alive: 1,
    // 1 — сіянець цього року, 2 — перезимований, 3+ — дорослий кущ.
    // Це головна змінна гри: вік дає більший множник урожаю, ніж будь-яка дія.
    age: 1,

    vigor: c.startVigor,
    leaf: 55,
    // Запас у здерев'янілому стеблі. Саме він годує кущ навесні, коли листя
    // ще немає, — і саме він витрачається за зиму, якщо кущ не обрізали.
    reserves: 45,
    woody: c.startWoody,
    dormancy: 0,
    buds: 40,
    damage: 0,

    roots: 70,
    rootFill: c.startRootFill,
    pot: {
      volume: c.startPotL,
      moisture: 50,
      drainage: 60,
      // Засолення від добрив — проблема саме контейнера: у відкритому ґрунті
      // солі йдуть углиб, у горщику їм подітися нікуди.
      salinity: 20,
      nitrogen: 35,
      pk: 30,
      calcium: 40,
      magnesium: 40,
    },

    flowers: 0,
    fruitSet: 0,
    fruitFill: 0,
    ripeness: 0,
    pungency: c.basePungency,

    mites: 5,
    pests: 5,

    // Не показники: журнал перетнутих порогів і вирок. Ефектами не змінюються.
    journal: [],
    death: null,
  };
}

/** Живі горщики — цикл по них іде в кожній фазі. */
export function livePlantIds(state) {
  return PLANT_IDS.filter((id) => state.plants[id].alive > 0);
}

/**
 * Бюджет годин догляду на місяць — спільний на всі чотири горщики.
 *
 * Саме він робить колекцію колекцією: годин ніколи не вистачає на все, і
 * гравець мусить вирішувати, кого доглянути цього місяця, а кого лишити.
 */
export function hoursFor(state, month) {
  const base = BALCONY_PHASE[month].hours;
  // Мертвий горщик не потребує догляду — час вивільняється. Втішного тут мало,
  // але модель має бути чесною.
  const lost = PLANT_IDS.length - livePlantIds(state).length;
  return base + (lost > 2 ? 1 : 0);
}

/** Наскільки об'єм горщика відповідає потребі сорту. 1 — досить, менше — тісно. */
export function potFactor(plant, cultivar) {
  return Math.min(1, plant.pot.volume / cultivar.needL);
}
