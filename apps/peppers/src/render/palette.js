/**
 * Кольори, специфічні для балкона й перців.
 *
 * Спільна палітра @edu/pixel-ui зібрана під виноградник просто неба: у ній є
 * ґрунт, лоза й небо, але немає бетону, скла й пластикових горщиків. Додаємо
 * бракуюче тут, а не в пакеті: це предметні кольори одного застосунку.
 */

import { PALETTE } from "@edu/pixel-ui";

export const LOCAL = {
  // ── Приміщення ──
  concrete: "#8d8577",
  concreteDark: "#6e675c",
  concreteLight: "#a49b8b",
  tile: "#7b7266",
  tileSeam: "#645c52",
  glass: "#b8cfdc",
  glassFrame: "#cfc7b4",
  glassShade: "#9db4c2",
  metal: "#9a9a94",
  wall: "#c2b8a2",
  wallShade: "#a89e88",

  // ── Обладнання ──
  lampBody: "#5a5450",
  lampGrow: "#d86fb0",
  lampGlow: "#e8a8cc",
  foam: "#eae4d2",
  potPlastic: "#8a5a44",
  potPlasticDark: "#6b4433",
  potRim: "#a06a50",

  // ── Рослина ──
  stemWoody: "#6b5334",
  stemGreen: "#4f8f3a",
  stemEtiolated: "#a8c48a",
  leafHealthy: "#3f8f30",
  leafYoung: "#68b544",
  leafChlorotic: "#c2c247",
  leafBurn: "#9a7038",
  leafDead: "#6e5a2a",
  web: "#d8d8cc",
  miteSpeck: "#e0e0d0",
  flower: "#f0efe4",
  flowerCore: "#d8d070",

  // ── Плоди за сортами ──
  podGreen: "#4e8c3a",
  podJalapeno: "#b8342a",
  podHabanero: "#e07820",
  podLimo: "#e8c22c",
  podEasterViolet: "#8a6ab0",
  podEasterYellow: "#e0cc58",
  podEasterOrange: "#dd8a3a",
};

/** Кольори плодів сорту: [незрілий, стиглий] або кілька стиглих для декоративних. */
export const POD_COLORS = {
  jalapeno: { unripe: LOCAL.podGreen, ripe: [LOCAL.podJalapeno] },
  habanero: { unripe: LOCAL.podGreen, ripe: [LOCAL.podHabanero] },
  ajiLimo: { unripe: LOCAL.podGreen, ripe: [LOCAL.podLimo] },
  // NuMex Easter несе кілька кольорів одночасно на одному кущі — саме через це
  // його й тримають на балконі.
  numexEaster: {
    unripe: LOCAL.podGreen,
    ripe: [LOCAL.podEasterViolet, LOCAL.podEasterYellow, LOCAL.podEasterOrange],
  },
};

/**
 * Колір листя за станом рослини, а не за календарем.
 *
 * У винограднику листя жовтіє восени за розкладом. Перець вічнозелений: його
 * листя змінює колір лише тоді, коли з рослиною щось не так.
 */
export function leafColor(plant) {
  if (plant.alive <= 0) return LOCAL.leafDead;
  if (plant.damage > 35) return LOCAL.leafBurn;
  if (plant.pot.magnesium < 25) return LOCAL.leafChlorotic;
  if (plant.mites > 50) return LOCAL.leafChlorotic;
  if (plant.dormancy > 45) return PALETTE.leafSick;
  return plant.vigor > 65 ? LOCAL.leafYoung : LOCAL.leafHealthy;
}

/** Колір неба за склом. Взимку балкон дивиться в сіре, влітку — у синє. */
export function skyBehindGlass(month) {
  if (month === 12 || month <= 2) return "#a8b6c2";
  if (month <= 5) return "#9cc6e0";
  if (month <= 8) return "#7fbce4";
  return "#a8b4bc";
}
