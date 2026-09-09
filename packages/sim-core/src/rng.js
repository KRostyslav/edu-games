/**
 * Детермінований генератор (mulberry32).
 *
 * Випадковість мусить бути відтворюваною: інакше розбір «чому врожай упав»
 * перетворюється на здогадки. З фіксованим seed той самий сезон із тими самими
 * діями завжди дає той самий результат, і навчальний розбір є чесним.
 */
export function createRng(seed) {
  let state = seed >>> 0;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    /** Ціле в [min, max]. */
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    /** Дійсне в [min, max). */
    range: (min, max) => next() * (max - min) + min,
    /** true з імовірністю p. */
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    /** Вибір за вагами: [{ weight, ... }]. */
    weighted(list) {
      const total = list.reduce((sum, item) => sum + item.weight, 0);
      if (total <= 0) return null;
      let roll = next() * total;
      for (const item of list) {
        roll -= item.weight;
        if (roll <= 0) return item;
      }
      return list[list.length - 1];
    },
    get seed() {
      return state;
    },
    setSeed(value) {
      state = value >>> 0;
    },
  };
}
