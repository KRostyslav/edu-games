/**
 * Розрахунок урожаю.
 *
 * Формула розкладена на іменовані множники навмисно: кожен показується гравцеві
 * окремим рядком у звіті разом із причиною. Число без пояснення нічого не вчить.
 *
 * Головна відмінність від виноградника — окреме число зелених плодів. Плід, що
 * зав'язався, але не встиг забарвитися, — це і є ціна пізнього старту, і саме
 * воно робить аргумент на користь перезимівлі наочним.
 */

import { CULTIVARS, PLANT_IDS, speciesOf } from "../data/plants.data.js";
import { potFactor } from "./model.js";

/**
 * Множник віку — єдиний, що буває більшим за одиницю.
 *
 * Це головне число гри: різниця між сіянцем і перезимованим кущем більша за
 * будь-яку суму правильних дій за сезон.
 */
export function ageFactor(age) {
  if (age <= 0) return 0.18;
  if (age === 1) return 0.35;
  if (age === 2) return 1.0;
  if (age === 3) return 1.25;
  return 1.15;
}

export function calculateHarvest(state) {
  const plants = PLANT_IDS.map((id) => harvestPlant(state, id));
  const alive = plants.filter((p) => p.alive);

  return {
    plants,
    totalGrams: plants.reduce((sum, p) => sum + p.grams, 0),
    totalRipe: plants.reduce((sum, p) => sum + p.ripeCount, 0),
    totalGreen: plants.reduce((sum, p) => sum + p.greenCount, 0),
    survived: alive.length,
    lesson: buildLesson(plants),
  };
}

function harvestPlant(state, id) {
  const plant = state.plants[id];
  const c = CULTIVARS[id];
  const sp = speciesOf(id);

  if (plant.alive <= 0) {
    return {
      id,
      name: c.name,
      alive: false,
      grams: 0,
      ripeCount: 0,
      greenCount: 0,
      pungency: 0,
      factors: [],
      death: plant.death,
      grade: {
        label: "Рослина загинула",
        tone: "bad",
        note: plant.death ? plant.death.cause : "Горщик порожній.",
      },
    };
  }

  const factors = [];

  const age = ageFactor(plant.age);
  factors.push({
    key: "age",
    label: "Вік куща",
    value: age,
    detail: `${plant.age}-й рік`,
    why:
      plant.age <= 1
        ? "Сіянець першого року половину сезону будує кущ і лише потім плодоносить. Це не помилка догляду — це вік."
        : "Перезимований кущ навесні стартує не з насінини, а з готового скелета, коріння й запасу в стеблі — тому цвіте на 6–8 тижнів раніше.",
  });

  const set = 0.15 + (plant.fruitSet / 100) * 0.85;
  factors.push({
    key: "set",
    label: "Зав'язування",
    value: set,
    detail: `Зав'язь ${Math.round(plant.fruitSet)}/100`,
    why:
      plant.fruitSet > 50
        ? "Квітки перетворилися на зав'язь — запилення спрацювало."
        : "Більшість квіток обсипалася. На закритому балконі немає ні вітру, ні комах: без ручного запилення це неминуче.",
  });

  const fill = 0.4 + (plant.fruitFill / 100) * 0.6;
  factors.push({
    key: "fill",
    label: "Налив плодів",
    value: fill,
    detail: `Налив ${Math.round(plant.fruitFill)}/100`,
    why:
      plant.fruitFill > 55
        ? "Води, калію й працюючого листя вистачило — плоди набрали розмір."
        : "Плоди дрібні. Розмір визначається водою й калієм під час наливу і пізніше не виправляється.",
  });

  const leaf = 0.35 + (plant.leaf / 100) * 0.65;
  factors.push({
    key: "leaf",
    label: "Листовий апарат",
    value: leaf,
    detail: `Листя ${Math.round(plant.leaf)}/100`,
    why:
      plant.leaf > 55
        ? "Кущ мав чим годувати плоди."
        : "Листя мало — плоди годувати нічим. Найчастіше це наслідок зимівлі без підсвітки.",
  });

  const health = Math.max(0.3, 1 - (plant.mites + plant.pests + plant.damage) / 300);
  factors.push({
    key: "health",
    label: "Здоров'я",
    value: health,
    detail: `Кліщ ${Math.round(plant.mites)}, комахи ${Math.round(plant.pests)}, пошкодження ${Math.round(plant.damage)}`,
    why:
      health > 0.8
        ? "Шкідники під контролем — рослина працювала на врожай, а не на виживання."
        : "Частина сили пішла на боротьбу зі шкідниками й відновлення пошкоджень.",
  });

  const pot = Math.max(0.35, potFactor(plant, c));
  factors.push({
    key: "pot",
    label: "Об'єм горщика",
    value: pot,
    detail: `${plant.pot.volume} л при потребі сорту ${c.needL} л`,
    why:
      pot >= 0.99
        ? "Горщика вистачає — врожай обмежений доглядом, а не посудом."
        : `Горщик замалий. Скільки не годуй, ${c.name} не віддасть більше, ніж дозволяє об'єм коріння.`,
  });

  const salt = Math.max(0.4, 1 - Math.max(0, plant.pot.salinity - 50) / 100);
  factors.push({
    key: "salt",
    label: "Засолення субстрату",
    value: salt,
    detail: `Засолення ${Math.round(plant.pot.salinity)}/100`,
    why:
      salt > 0.95
        ? "Солі в межах норми."
        : "Накопичені солі заважають корінню брати воду. У горщику їм нікуди подітися — рятує лише промивання чи пересадка.",
  });

  const potential = factors.reduce((acc, f) => acc * f.value, c.pods);

  // Скільки з того, що зав'язалося, встигло забарвитися.
  const ripeShare = Math.max(0, Math.min(1, plant.ripeness / 100));
  const ripeCount = Math.round(potential * ripeShare);
  const greenCount = Math.max(0, Math.round(potential) - ripeCount);
  const grams = Math.round(ripeCount * c.gram);
  const pungency = Math.round(c.baseSHU * (0.6 + (plant.pungency / 100) * 0.8));

  return {
    id,
    name: c.name,
    alive: true,
    age: plant.age,
    species: sp.label,
    factors,
    ripeCount,
    greenCount,
    grams,
    pungency,
    ripeShare,
    ripeNote:
      greenCount > ripeCount
        ? `${sp.label} потребує ${sp.ripenRate < 1 ? "90–120" : "60–80"} днів від зав'язі. ` +
          `Зав'язь пішла надто пізно, і ${greenCount} плодів залишилися зеленими.`
        : null,
    grade: gradeOf(grams, c, plant),
  };
}

function gradeOf(grams, cultivar, plant) {
  const ceiling = cultivar.pods * cultivar.gram;
  const share = grams / ceiling;

  if (share >= 0.45) {
    return { label: "Відмінний урожай", tone: "good", note: "Кущ віддав близько половини теоретичної стелі — для балкона це багато." };
  }
  if (share >= 0.22) {
    return { label: "Добрий урожай", tone: "good", note: "Основне зроблено правильно, є куди рости." };
  }
  if (share >= 0.08) {
    return {
      label: "Посередній урожай",
      tone: "warn",
      note: plant.age <= 1 ? "Для першого року нормально — головне попереду." : "Помітно нижче за потенціал куща.",
    };
  }
  return {
    label: "Слабкий урожай",
    tone: "bad",
    note: "Щось пішло не так у ключові місяці — розбір нижче покаже, де саме.",
  };
}

/**
 * Головний висновок року — одне порівняння, яке гравець має винести з сезону.
 *
 * Шукаємо найконтрастнішу пару: кущі різного віку в однакових умовах. Якщо
 * такої пари немає, беремо різницю між видами.
 */
function buildLesson(plants) {
  const alive = plants.filter((p) => p.alive);
  if (alive.length === 0) {
    return "Жодна рослина не пережила сезон. Розтини показують, у якому саме місяці це вирішилося.";
  }

  const byAge = [...alive].sort((a, b) => b.age - a.age);
  const oldest = byAge[0];
  const youngest = byAge[byAge.length - 1];

  if (oldest.age > youngest.age && oldest.grams > 0) {
    return (
      `${oldest.name} (${oldest.age}-й рік) дав ${oldest.grams} г, ` +
      `${youngest.name} (${youngest.age}-й рік) — ${youngest.grams} г. ` +
      `Обидва отримали однаковий догляд на одному балконі: різниця не в догляді, а у віці куща. ` +
      `Саме заради цієї різниці перець перезимовують.`
    );
  }

  const green = alive.filter((p) => p.greenCount > p.ripeCount);
  if (green.length > 0) {
    const worst = green.sort((a, b) => b.greenCount - a.greenCount)[0];
    return (
      `${worst.name} зав'язав плоди, але ${worst.greenCount} з них залишилися зеленими. ` +
      `${worst.species} не встигає визріти за український сезон, якщо стартує пізно, — ` +
      `перезимований кущ починає цвісти на два місяці раніше й устигає.`
    );
  }

  return (
    `Найкращий результат року — ${oldest.name}, ${oldest.grams} г. ` +
    `Порівняйте множники в розборі: найнижчий із них і обмежив урожай.`
  );
}
