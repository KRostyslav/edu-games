/**
 * Інтервальне повторення за системою Leitner: п'ять коробок, у кожної свій
 * інтервал. Правильна відповідь пересуває картку на коробку вище (рідше
 * бачимо), помилка — повертає в першу (бачимо сьогодні ж).
 *
 * Модуль чистий: жодного DOM, дат чи Math.random. День — ціле число з
 * `dayNumber()`, тож тести можуть «прожити» місяць за мілісекунди, а однакові
 * вхідні дані завжди дають однакову сесію — інакше не відтворити баг гравця.
 *
 * Дані на вході вважаємо ворожими: `repairProgress` уже чистить сховище, але
 * картку можуть прибрати з колоди, а запис — зіпсувати руками в DevTools.
 * Кожна функція мовчки пропускає незрозуміле замість того, щоб кидати.
 */

/** Інтервал у днях для коробок 1..5: індекс = box − 1. */
export const INTERVALS = [0, 1, 3, 7, 14];
export const MAX_BOX = INTERVALS.length;
/** З цієї коробки картку вважаємо опанованою: вона витримала повтор через тиждень. */
export const MASTERED_BOX = 4;
/** Скільки карток бере одна сесія: більше за 20 підряд — уже втома, а не пам'ять. */
export const SESSION_LIMIT = 20;
/** Скільки нових карток на день: нові одразу ж породжують повтори наступних днів. */
export const NEW_PER_DAY = 8;

const isObject = (value) => value != null && typeof value === "object" && !Array.isArray(value);

/** Невід'ємне ціле; Infinity дозволено — «без ліміту». */
function toCount(value, fallback) {
  if (value === Infinity) return Infinity;
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

/**
 * Запис коробки з таблиці. `Object.hasOwn` — бо id картки на кшталт
 * "constructor" інакше знайшов би метод прототипу замість «нової картки».
 */
function entryOf(boxes, id) {
  return isObject(boxes) && Object.hasOwn(boxes, id) ? normalizeEntry(boxes[id]) : null;
}

/** Запис у коректній формі або null, якщо це взагалі не запис. */
function normalizeEntry(raw) {
  if (!isObject(raw)) return null;
  const box = Number.isFinite(raw.box) ? Math.max(1, Math.min(MAX_BOX, Math.round(raw.box))) : 1;
  return {
    box,
    // Зіпсований розклад = прострочена картка: краще показати зайвий раз, ніж загубити назавжди.
    due: Number.isFinite(raw.due) ? raw.due : -Infinity,
    seen: toCount(raw.seen, 0),
    correct: toCount(raw.correct, 0),
  };
}

/** Лише справжні картки, кожна один раз — дубль id у колоді не має подвоювати сесію. */
function validCards(cards) {
  const out = [];
  const ids = new Set();
  for (const card of Array.isArray(cards) ? cards : []) {
    if (!isObject(card) || typeof card.id !== "string" || ids.has(card.id)) continue;
    ids.add(card.id);
    out.push(card);
  }
  return out;
}

// ─────────────────────────── детермінований випадок ───────────────────────────

/** FNV-1a: і число-день, і рядок-тема дають стабільне 32-бітне зерно. */
function hashSeed(seed) {
  const text = String(seed);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: крихітний PRNG, якого для перемішування десятка карток більш ніж досить. */
function prng(seed) {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Фішер — Єйтс на копії: вхідний масив не чіпаємо. */
function shuffle(items, rand) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ─────────────────────────── сесія ───────────────────────────

/**
 * Черга на сьогодні: спершу прострочені (нижчі коробки першими — їх забуваємо
 * найшвидше), потім нові до `newLimit`. Разом не більше `limit`; якщо боргу
 * більше за ліміт, нових не буде зовсім — спершу розгрібаємо повтори.
 *
 * Нові беремо в порядку колоди: вона йде за розділами довідника, тож новачок
 * починає з основ вебу, а не з шардування. Але саму порцію перемішуємо, щоб
 * три картки однієї теми не йшли підряд і не підказували одна одній.
 */
export function dueCards(boxes, cards, today, { limit = SESSION_LIMIT, newLimit = NEW_PER_DAY, seed = today } = {}) {
  const max = toCount(limit, SESSION_LIMIT);
  if (max === 0) return [];
  const byBox = Array.from({ length: MAX_BOX }, () => []);
  const fresh = [];
  for (const card of validCards(cards)) {
    const entry = entryOf(boxes, card.id);
    if (!entry) fresh.push(card);
    else if (entry.due <= today) byBox[entry.box - 1].push(card);
  }

  const rand = prng(seed);
  const picked = byBox.flatMap((group) => shuffle(group, rand)).slice(0, max);
  const room = Math.min(toCount(newLimit, NEW_PER_DAY), max - picked.length);
  if (room > 0) picked.push(...shuffle(fresh.slice(0, room), rand));
  return picked;
}

/**
 * Скільки карток чекає: увесь борг повторів плюс нові до `newLimit`.
 * На `limit` сесії навмисно не обрізаємо: бейдж має чесно показати 45
 * прострочених, навіть якщо сесія візьме з них лише 20.
 */
export function dueCount(boxes, cards, today, { newLimit = NEW_PER_DAY } = {}) {
  let overdue = 0;
  let fresh = 0;
  for (const card of validCards(cards)) {
    const entry = entryOf(boxes, card.id);
    if (!entry) fresh += 1;
    else if (entry.due <= today) overdue += 1;
  }
  return overdue + Math.min(fresh, toCount(newLimit, NEW_PER_DAY));
}

/**
 * Скільки нових карток ще можна показати сьогодні. Без денного ліміту
 * «Сьогодні» ніколи б не спорожніло, доки гравець не перегорне всю колоду.
 *
 * Лічильника «нових за день» у формі прогресу немає (і `repairProgress`
 * викинув би зайве поле), тож виводимо його з самих записів. Картка, яку
 * вчать сьогодні, у щоденній черзі проходить шлях «помилка × k, потім,
 * можливо, одна правильна»: тож вона лежить у коробці 1 з нулем правильних
 * або в коробці 2 з рівно однією правильною, і остання відповідь була
 * сьогодні (`due − INTERVALS[box − 1] === today`).
 *
 * Простіше правило «seen === 1» протікало: кожна виправлена помилка
 * звільняла місце, і на прогоні з кнопкою «Ще сесія» гравець отримував 18
 * нових за день замість 8. Нинішнє правило іноді рахує «новою» стару
 * картку, на яку гравець щоразу помилявся, — і це на краще: поки вона не
 * вивчена, нові зверху лише заважають.
 */
export function newCardsLeft(boxes, cards, today, perDay = NEW_PER_DAY) {
  let introduced = 0;
  for (const card of validCards(cards)) {
    const entry = entryOf(boxes, card.id);
    if (!entry || entry.box > 2 || entry.correct !== entry.box - 1) continue;
    if (entry.due - INTERVALS[entry.box - 1] === today) introduced += 1;
  }
  return Math.max(0, toCount(perDay, NEW_PER_DAY) - introduced);
}

/**
 * Відповідь на картку → новий запис (старий не мутуємо: його тримає стор).
 * Нова картка стартує з коробки 1, тож перша правильна відповідь кладе її в 2.
 */
export function answerCard(entry, correct, today) {
  const prev = normalizeEntry(entry);
  const box = correct ? Math.min(MAX_BOX, (prev?.box ?? 1) + 1) : 1;
  return {
    box,
    due: today + INTERVALS[box - 1],
    seen: (prev?.seen ?? 0) + 1,
    correct: (prev?.correct ?? 0) + (correct ? 1 : 0),
  };
}

/** Найближчий день після сьогодні, коли щось стане до повтору, і скільки саме. */
export function nextDue(boxes, cards, today) {
  let day = Infinity;
  let count = 0;
  for (const card of validCards(cards)) {
    const entry = entryOf(boxes, card.id);
    if (!entry || entry.due <= today) continue;
    if (entry.due < day) {
      day = entry.due;
      count = 1;
    } else if (entry.due === day) count += 1;
  }
  return count ? { day, count } : null;
}

// ─────────────────────────── статистика ───────────────────────────

/** Розподіл колоди: нові, коробки 1..5 і опановані (коробки 4–5). */
export function boxStats(boxes, cards) {
  const counts = Array(MAX_BOX).fill(0);
  let fresh = 0;
  for (const card of validCards(cards)) {
    const entry = entryOf(boxes, card.id);
    if (entry) counts[entry.box - 1] += 1;
    else fresh += 1;
  }
  const mastered = counts.slice(MASTERED_BOX - 1).reduce((sum, n) => sum + n, 0);
  return { new: fresh, boxes: counts, mastered };
}

/** Прогрес однієї теми довідника. */
export function topicProgress(boxes, cards, topic) {
  const out = { total: 0, seen: 0, mastered: 0 };
  for (const card of validCards(cards)) {
    if (card.topic !== topic) continue;
    out.total += 1;
    const entry = entryOf(boxes, card.id);
    if (!entry) continue;
    out.seen += 1;
    if (entry.box >= MASTERED_BOX) out.mastered += 1;
  }
  return out;
}

// ─────────────────────────── серія днів ───────────────────────────

/**
 * Серія після відповіді сьогодні. Викликається на кожній відповіді, тож має
 * бути ідемпотентною в межах дня: друга картка того ж дня серію не збільшує.
 * Якщо годинник відкотився (lastDay у майбутньому), серію не чіпаємо —
 * карати гравця за зміну часового поясу нечесно.
 */
export function nextStreak(quiz, today) {
  const lastDay = Number.isFinite(quiz?.lastDay) ? quiz.lastDay : null;
  const streak = toCount(quiz?.streak, 0);
  if (lastDay === null) return { streak: 1, lastDay: today };
  if (lastDay >= today) return { streak: Math.max(1, streak), lastDay };
  if (lastDay === today - 1) return { streak: streak + 1, lastDay: today };
  return { streak: 1, lastDay: today };
}

/** Серія для показу: якщо вчора й сьогодні не займалися — вона вже обірвалась. */
export function currentStreak(quiz, today) {
  const lastDay = Number.isFinite(quiz?.lastDay) ? quiz.lastDay : null;
  if (lastDay === null || lastDay < today - 1) return 0;
  return toCount(quiz?.streak, 0);
}
