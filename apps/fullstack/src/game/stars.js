/**
 * Зірки рівня: ★ пройдено · ★★ без підказок · ★★★ бонус-ціль.
 *
 * Бонус-ціль залежить від типу рівня: для задач із вибором — «з першої
 * спроби», для коду — прихований бонусний тест, для SQL — додаткова умова
 * на план запиту. Зірки лише ростуть: переграш не може їх забрати.
 */

export function bonusType(level) {
  return level.bonus?.type ?? "firstTry";
}

export function bonusMet(level, result) {
  if (bonusType(level) === "firstTry") return (result.mistakes ?? 0) === 0;
  return result.bonus === true;
}

export function starsFor(level, result, hintsUsed) {
  return 1 + (hintsUsed === 0 ? 1 : 0) + (bonusMet(level, result) ? 1 : 0);
}

/** Текст бонус-цілі для брифу рівня. */
export function bonusText(level) {
  if (level.bonus?.text) return level.bonus.text;
  return "Без жодної помилки";
}
