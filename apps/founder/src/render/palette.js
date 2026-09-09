/**
 * Кольори цього застосунку. Спільна палітра @edu/pixel-ui зібрана під сад і
 * балкон — тут потрібні стіни, екран і лампа, тож предметні кольори живуть
 * локально, а пакет лишається незмінним для сусідніх ігор.
 */
import { PALETTE } from "@edu/pixel-ui";

export const ROOM = {
  wall: "#3b3550",
  wallDark: "#2e2940",
  wallLight: "#4a4364",
  floor: "#4a3a2c",
  floorDark: "#3a2c20",

  desk: "#6b4a2f",
  deskEdge: "#4a3120",

  monitor: "#1b2230",
  monitorFrame: "#20202c",
  screen: "#101a26",
  screenGlow: "#2a4a6a",

  chart: "#4fd18b",
  chartDim: "#2d7a52",
  grid: "#1c2c3c",

  skin: "#d9a173",
  hair: "#3a2a1c",
  shirt: "#4a6a8f",
  shirtTired: "#5a5560",

  lamp: "#f2c14e",
  lampGlow: "#7a5f2a",

  box: "#8a6a44",
  boxDark: "#5c452c",

  customer: "#6fd3e8",
  customerDim: "#3a7f92",

  night: "#141a2a",
  ink: PALETTE.ink,
};

/** Небо у вікні за місяцем — рік має бути видно, не читаючи підпис. */
export function skyFor(month) {
  if (month === 12 || month <= 2) return "#8a9ab0";
  if (month <= 5) return "#8fc4e8";
  if (month <= 8) return "#6fb2e8";
  return "#a8907c";
}
