/**
 * Випадкові події з умовними ймовірностями.
 *
 * Подія описується так:
 *   { id, label, weight, when: (ctx) => boolean, effects: (ctx) => Effect[] }
 * `when` дозволяє прив'язати подію до контексту (місяць, регіон, стан куща),
 * тому град не випадає в січні, а випрівання вічок можливе лише під укриттям.
 */
export function rollEvent(table, context, rng) {
  const eligible = table.filter((event) => (event.when ? event.when(context) : true));
  if (eligible.length === 0) return null;

  const total = eligible.reduce((sum, e) => sum + e.weight, 0);
  // Порожня вага добирає ймовірність «нічого не сталося», щоб події
  // не траплялися щомісяця — інакше гравець перестає їх помічати.
  const idleWeight = Math.max(0, (context.idleWeight ?? 1) - total);
  let roll = rng.next() * (total + idleWeight);

  for (const event of eligible) {
    roll -= event.weight;
    if (roll <= 0) return event;
  }
  return null;
}

/** Розігрує кілька незалежних подій (напр. погода + шкідники). */
export function rollEvents(table, context, rng, count = 1) {
  const picked = [];
  const remaining = [...table];
  for (let i = 0; i < count; i += 1) {
    const event = rollEvent(remaining, context, rng);
    if (!event) break;
    picked.push(event);
    remaining.splice(remaining.indexOf(event), 1);
  }
  return picked;
}
