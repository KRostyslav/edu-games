/**
 * Назви показників для навчальних панелей.
 *
 * Шлях ефекту виглядає як `plants.habanero.pot.salinity`, а гравцеві треба
 * побачити «Хабанеро · Засолення субстрату». Розбираємо шлях, а не тримаємо
 * сто з гаком записів руками: інакше додавання п'ятої рослини вимагало б
 * переписати весь словник.
 */

import { CULTIVARS } from "../data/plants.data.js";
import { parseSource } from "../game/source.js";
import { ACTIONS_BY_ID } from "../data/actions.data.js";

/** Показники рослини — ключі без префікса горщика. */
export const PLANT_STAT_NAMES = {
  alive: "Життя рослини",
  age: "Вік куща",
  vigor: "Сила росту",
  leaf: "Листовий апарат",
  reserves: "Запас у стеблі",
  woody: "Здерев'яніння",
  dormancy: "Глибина спокою",
  buds: "Точки росту",
  damage: "Пошкодження",
  roots: "Стан коріння",
  rootFill: "Заповненість горщика",
  "pot.volume": "Об'єм горщика",
  "pot.moisture": "Волога субстрату",
  "pot.drainage": "Повітроємність субстрату",
  "pot.salinity": "Засолення субстрату",
  "pot.nitrogen": "Азот",
  "pot.pk": "Фосфор і калій",
  "pot.calcium": "Кальцій",
  "pot.magnesium": "Магній",
  flowers: "Квітки",
  fruitSet: "Зав'язь",
  fruitFill: "Налив плодів",
  ripeness: "Визрівання",
  pungency: "Гострота",
  mites: "Павутинний кліщ",
  pests: "Комахи-шкідники",
};

export const BALCONY_STAT_NAMES = {
  "balcony.tempAir": "Температура повітря",
  "balcony.tempFloor": "Температура в горщику",
  "balcony.light": "Освітленість",
  "balcony.humidity": "Вологість повітря",
  "balcony.airflow": "Рух повітря",
  "balcony.mitePressure": "Фон кліща на балконі",
  "equipment.lamp": "Фітолампа",
  "equipment.insulation": "Утеплення скління",
  "equipment.potStand": "Підставки під горщики",
  "equipment.humidifier": "Зволожувач",
  "equipment.heater": "Обігрівач",
  "equipment.fan": "Вентилятор",
  "equipment.thermometer": "Термометр",
  "flags.hardenedOff": "Загартування",
  "flags.outdoorMode": "Відкритий балкон",
  "flags.ventilated": "Провітрювання",
};

/** Розбирає шлях ефекту на рослину й показник. */
export function describeTarget(path) {
  if (path.startsWith("plants.")) {
    const [, plantId, ...rest] = path.split(".");
    const key = rest.join(".");
    return {
      plantId,
      plant: CULTIVARS[plantId]?.name ?? plantId,
      stat: PLANT_STAT_NAMES[key] ?? key,
    };
  }
  return { plantId: null, plant: null, stat: BALCONY_STAT_NAMES[path] ?? path };
}

/** Підпис ефекту одним рядком: для списків, де рослина вже відома з контексту. */
export function statNameOf(path) {
  return describeTarget(path).stat;
}

/** Підпис із рослиною — для спільних списків, де все впереміш. */
export function fullNameOf(path) {
  const { plant, stat } = describeTarget(path);
  return plant ? `${plant} · ${stat}` : stat;
}

/** Людський підпис джерела ефекту. */
export function describeSource(source) {
  const { kind, id, plantId } = parseSource(source);
  const plant = plantId ? CULTIVARS[plantId]?.name : null;

  if (kind === "action") {
    const label = ACTIONS_BY_ID[id]?.label ?? id;
    return { kind, label, plant, plantId };
  }
  if (kind === "climate") return { kind, label: "Клімат балкона", plant: null, plantId: null };
  if (kind === "natural") return { kind, label: "Рослина живе сама", plant, plantId };
  if (kind === "event") return { kind, label: "Подія", plant, plantId };
  if (kind === "death") return { kind, label: "Загибель рослини", plant, plantId };
  return { kind, label: kind, plant, plantId };
}
