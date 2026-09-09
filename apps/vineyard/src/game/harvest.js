import { loadFactor } from "./model.js";

/**
 * Розрахунок урожаю.
 *
 * Формула розкладена на іменовані множники навмисно: кожен із них
 * показується гравцеві окремим рядком у звіті. Число без пояснення нічого
 * не вчить, тому разом із множником рахується і його причина.
 */

// Потенціал дорослого куща за ідеальних умов. Кожен множник лежить у межах
// 0…1, тому це справді стеля, а не орієнтовне число.
const BASE_YIELD_KG = 10;

export function calculateHarvest(state) {
  const factors = [];

  const buds = state.vine.budsAlive / 100;
  factors.push({
    key: "buds",
    label: "Живі вічка",
    value: buds,
    detail: `${Math.round(state.vine.budsAlive)}% вічок пережили зиму й весну`,
    why:
      buds > 0.85
        ? "Зимівля пройшла добре — кущ реалізував закладене восени навантаження."
        : "Втрачені вічка — це грона, яких просто не буде. Причину шукайте в зимівлі та весняних заморозках.",
  });

  const load = loadFactor(state.vine.load);
  factors.push({
    key: "load",
    label: "Навантаження",
    value: load,
    detail: `Навантаження ${Math.round(state.vine.load)} при оптимумі 55`,
    why:
      load > 0.9
        ? "Навантаження близьке до оптимального — кущ прогодував усі грона."
        : state.vine.load > 55
          ? "Кущ перевантажений: він не встиг налити всі грона, і це ще вдарить наступного року."
          : "Кущ недовантажений: сила пішла в зелену масу замість грон.",
  });

  const size = 0.45 + (state.crop.berrySize / 100) * 0.55;
  factors.push({
    key: "size",
    label: "Розмір ягоди",
    value: size,
    detail: `Налив ягоди ${Math.round(state.crop.berrySize)}/100`,
    why:
      state.crop.berrySize > 55
        ? "Вологи в липні вистачило — ягода налилася."
        : "Ягода дрібна. Розмір визначається поливом у липні й пізніше не виправляється.",
  });

  const set = 0.5 + (state.crop.setRate / 100) * 0.5;
  factors.push({
    key: "set",
    label: "Зав'язування",
    value: set,
    detail: `Зав'язалося ${Math.round(state.crop.setRate)}% квіток`,
    why:
      state.crop.setRate > 55
        ? "Цвітіння пройшло вдало — квітки запліднилися."
        : "Багато квіток обсипалося. Це вирішувалося в червні: прищипування, бор і погода.",
  });

  const health = 0.35 + (state.crop.sanitary / 100) * 0.65;
  factors.push({
    key: "health",
    label: "Санітарний стан",
    value: health,
    detail: `Стан грон ${Math.round(state.crop.sanitary)}/100`,
    why:
      state.crop.sanitary > 65
        ? "Грона чисті — захист спрацював."
        : "Частина врожаю втрачена через хвороби й пошкодження ягід.",
  });

  const total = factors.reduce((acc, f) => acc * f.value, BASE_YIELD_KG);
  const kg = Math.max(0, Math.round(total * 10) / 10);

  // Цукор: накопичене за сезон плюс регіональна база.
  const brix = Math.round((10 + state.crop.sugar * 0.16) * 10) / 10;

  return {
    kg,
    brix,
    sanitary: Math.round(state.crop.sanitary),
    factors,
    grade: gradeOf(kg, brix, state.crop.sanitary),
  };
}

function gradeOf(kg, brix, sanitary) {
  // Пороги підібрані під реальну стелю моделі: бездоганний сезон при доброму
  // році дає близько 7.5–8 кг, тому «відмінний» вимагає і врожаю, і якості.
  if (kg >= 7.5 && brix >= 20 && sanitary >= 85) {
    return { label: "Відмінний урожай", tone: "good", note: "І кількість, і якість — на рівні." };
  }
  if (kg >= 5 && brix >= 16.5) {
    return { label: "Добрий урожай", tone: "good", note: "Основне зроблено правильно, є куди рости." };
  }
  if (kg >= 3.5) {
    return {
      label: "Посередній урожай",
      tone: "warn",
      note: "Врожай є, але помітно нижчий за потенціал куща.",
    };
  }
  return {
    label: "Слабкий урожай",
    tone: "bad",
    note: "Щось пішло не так у ключові моменти сезону — розбір нижче покаже, де саме.",
  };
}
