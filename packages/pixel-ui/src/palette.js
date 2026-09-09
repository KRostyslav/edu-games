/**
 * Фіксована палітра. Обмежений набір кольорів — головна ознака піксель-арту:
 * усе, що малюється, бере колір звідси, і сцена автоматично лишається цілісною.
 */
export const PALETTE = {
  // ґрунт і земля
  soilDark: "#3b2415",
  soil: "#5a3a22",
  soilLight: "#7a5334",
  soilWet: "#2f1c10",

  // деревина й лоза
  woodDark: "#4a3120",
  wood: "#6b4a2f",
  vineYoung: "#8fae4a",
  vineRipe: "#a9743c",

  // листя за сезонами
  leafSpring: "#7fc24a",
  leafSummer: "#3f8f30",
  leafAutumn: "#c8912e",
  leafSick: "#b9a83c",
  leafDead: "#6e5a2a",

  // грона
  berryUnripe: "#78a352",
  berry: "#6a3b7a",
  berryRipe: "#4d2559",
  berryHighlight: "#9a5fb0",

  // небо за сезонами
  skyWinter: "#9fb4c8",
  skySpring: "#8fc4e8",
  skySummer: "#6fb2e8",
  skyAutumn: "#a8b8c4",
  skyStorm: "#5c6b7a",

  // зимові й службові
  snow: "#e8eef2",
  snowShade: "#c4d2dc",
  cover: "#8a7a5c",
  mulch: "#4a3a26",
  frost: "#bcd8e8",

  // UI
  ink: "#1b1610",
  paper: "#e6dcc4",
  paperDark: "#c9bb9a",
  accent: "#c05a2a",
  good: "#4a9a3a",
  warn: "#d4941f",
  bad: "#b83a2a",
  shadow: "#2a2018",
};

/** Колір неба за місяцем (1–12) — сцена мусить читатися як пора року з першого погляду. */
export function skyForMonth(month) {
  if (month === 12 || month <= 2) return PALETTE.skyWinter;
  if (month <= 5) return PALETTE.skySpring;
  if (month <= 8) return PALETTE.skySummer;
  return PALETTE.skyAutumn;
}

/** Колір листя за місяцем — від молодого весняного до осіннього. */
export function leafForMonth(month) {
  if (month >= 4 && month <= 5) return PALETTE.leafSpring;
  if (month >= 6 && month <= 8) return PALETTE.leafSummer;
  if (month >= 9 && month <= 10) return PALETTE.leafAutumn;
  return PALETTE.leafDead;
}
