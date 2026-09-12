/** Номер дня за локальним часом — одиниця розкладу карток. */
export function dayNumber(date = new Date()) {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
}
