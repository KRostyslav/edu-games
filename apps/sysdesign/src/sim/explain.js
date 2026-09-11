/**
 * Розбір прогону людською мовою.
 *
 * Кожна хвилина має список приміток «що пішло не так і чому». Тут вони
 * склеюються в епізоди: «хв 21–30: база на 140% — …» читається як історія
 * інциденту, а не як шістдесят однакових рядків.
 */

const TONE_RANK = { bad: 0, warn: 1, info: 2 };

export function explain(series) {
  const episodes = new Map();
  for (const tick of series) {
    const seen = new Set();
    for (const note of tick.notes) {
      const key = `${note.nodeId}|${note.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = episodes.get(key) ?? { ...note, ticks: [] };
      entry.ticks.push(tick.t);
      // Текст беремо з найгіршої хвилини — там найбільші числа.
      if (note.tone === "bad" || !entry.worstText) entry.worstText = note.text;
      episodes.set(key, entry);
    }
  }
  return [...episodes.values()]
    .map((entry) => ({ ...entry, text: entry.worstText, range: formatRange(entry.ticks) }))
    .sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || a.ticks[0] - b.ticks[0]);
}

/** [3,4,5,9] → «хв 3–5, 9». Хвилини рахуються з нуля, як на осі графіків. */
export function formatRange(ticks) {
  const parts = [];
  let start = ticks[0];
  let prev = ticks[0];
  for (let i = 1; i <= ticks.length; i += 1) {
    const t = ticks[i];
    if (t === prev + 1) {
      prev = t;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = t;
    prev = t;
  }
  return `хв ${parts.join(", ")}`;
}
