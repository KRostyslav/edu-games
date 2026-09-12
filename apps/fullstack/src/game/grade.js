/**
 * Оцінювання задач із вибором — чисті функції, без DOM.
 * UI рівнів і фаз боса лише викликає їх і показує пояснення.
 */

/** FNV-1a + mulberry32: однаковий рядок-зерно → однакове перемішування. */
function prng(seedText) {
  let hash = 0x811c9dc5;
  for (const ch of String(seedText)) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Детерміновано перемішані індекси 0..n-1, гарантовано не в правильному
 * порядку (інакше задача розв'язується одним кліком «як є»).
 */
export function shuffledIndices(n, seedText) {
  const rand = prng(seedText);
  const out = Array.from({ length: n }, (_, i) => i);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    for (let i = n - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (n < 2 || out.some((value, index) => value !== index)) return out;
  }
  return out.reverse();
}

/**
 * Порівняння послідовності гравця з еталоном.
 * @returns {{ ok, firstWrong: number, prefix: number }} firstWrong = -1, якщо все правильно
 */
export function checkSequence(expected, answer) {
  let prefix = 0;
  while (prefix < expected.length && answer[prefix] === expected[prefix]) prefix += 1;
  const ok = prefix === expected.length && answer.length === expected.length;
  return { ok, firstWrong: ok ? -1 : prefix, prefix };
}

/** Клік по рядку в code review: влучання в баг чи хибна тривога. */
export function reviewClick(payload, line) {
  const bad = payload.bad.find((item) => item.line === line);
  if (bad) return { hit: true, why: bad.why };
  return { hit: false, why: payload.fine?.[line] ?? "Цей рядок коректний — проблема деінде." };
}

/** Позиції правильних відповідей мають бути розподілені, а не завжди «B». */
export function answerSpread(answers, optionsCount = 4) {
  const counts = Array(optionsCount).fill(0);
  for (const answer of answers) if (answer >= 0 && answer < optionsCount) counts[answer] += 1;
  return counts;
}
