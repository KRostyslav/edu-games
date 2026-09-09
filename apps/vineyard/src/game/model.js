/** Стан виноградника та межі показників. */

export const LIMITS = {
  "vine.reserves": [0, 100],
  "vine.woodRipeness": [0, 100],
  "vine.hardiness": [0, 100],
  "vine.budsAlive": [0, 100],
  "vine.load": [0, 100],
  "vine.vigor": [0, 100],
  "vine.canopy": [0, 100],
  "soil.moisture": [0, 100],
  "soil.nitrogen": [0, 100],
  "soil.phosphorus": [0, 100],
  "soil.potassium": [0, 100],
  "soil.organic": [0, 100],
  "soil.structure": [0, 100],
  "disease.mildew": [0, 100],
  "disease.oidium": [0, 100],
  "disease.rot": [0, 100],
  "disease.pests": [0, 100],
  "crop.setRate": [0, 100],
  "crop.berrySize": [0, 100],
  "crop.sugar": [0, 100],
  "crop.sanitary": [0, 100],
  // Прапорці — булеві за змістом, тому тримаються в межах 0..1.
  "flags.covered": [0, 1],
  "flags.toolsReady": [0, 1],
  "flags.frostGuard": [0, 1],
  "flags.wateringStopped": [0, 1],
  "flags.measured": [0, 1],
};

/**
 * Початковий стан: молодий, але вже плодоносний кущ одразу після першого збору.
 * Значення навмисно середні — гравець має простір і покращити, і зіпсувати.
 */
export function createInitialState(region) {
  return {
    year: 1,
    month: 10,
    regionId: region.id,

    vine: {
      reserves: 50,
      woodRipeness: 45,
      // Морозостійкості на старті немає й не може бути: у жовтні кущ ще не
      // загартувався. Вона набувається в листопаді й повністю зникає навесні.
      hardiness: 0,
      budsAlive: 90,
      load: 50,
      vigor: 55,
      canopy: 20,
    },

    soil: {
      moisture: 45,
      nitrogen: 40,
      phosphorus: 35,
      potassium: 30,
      organic: 40,
      structure: 45,
    },

    disease: {
      mildew: 25,
      oidium: 20,
      rot: 15,
      pests: 10,
    },

    crop: {
      setRate: 0,
      berrySize: 0,
      sugar: 0,
      sanitary: 0,
    },

    flags: {
      covered: 0,
      toolsReady: 0,
      frostGuard: 0,
      wateringStopped: 0,
      measured: 0,
      pruned: 0,
    },

    // Не показники, а журнал: що гравець робив і що з цього вийшло.
    seasonLog: [],
    seasonEffects: [],
    harvests: [],
  };
}

/** Трудодні на місяць з поправкою на підготовлений інструмент. */
export function laborFor(state, monthLabor) {
  return monthLabor + (state.flags.toolsReady ? 1 : 0);
}

/** Наскільки навантаження близьке до оптимуму (55). 1 — ідеал, 0 — катастрофа. */
export function loadFactor(load) {
  const deviation = Math.abs(load - 55);
  if (deviation <= 8) return 1;
  // Перевантаження карається сильніше за недовантаження: недовантажений кущ
  // просто дає менше, а перевантажений ще й псує наступний рік.
  const penalty = load > 55 ? deviation / 55 : deviation / 85;
  return Math.max(0.25, 1 - penalty);
}
