/**
 * Логіка тренажера back-of-the-envelope оцінок: розбір введення, оцінювання,
 * вибір варіанта задачі й людський формат чисел.
 *
 * На співбесіді цінують порядок величини, а не цифру після коми, тому
 * оцінювання йде за відношенням «у скільки разів помилився», а не за різницею:
 * промах у 2× на 10 req/s і на 10 млн req/s — однаково добрий результат.
 *
 * Гравець пише числа так, як пише на дошці: «2 млн», «1,5k», «3·10^6». Парсер
 * навмисно суворий (усе незрозуміле → null): краще попросити виправити введення,
 * ніж мовчки порахувати зірки за число, якого гравець не мав на увазі.
 *
 * Модуль чистий — без DOM і залежностей, — щоб його можна було тестувати голим Node.
 */

// ───────────────────────────── РОЗБІР ВВЕДЕННЯ ─────────────────────────────

/**
 * Суфікси зберігаються як степені десяти, а не множники: так «3.2M»
 * перетворюється на рядок «3.2e6» і парситься без похибки множення з рухомою комою.
 */
const SUFFIX_POWERS = {
  k: 3, "к": 3, "тис": 3,
  m: 6, "м": 6, "млн": 6,
  b: 9, g: 9, "млрд": 9,
  t: 12, "трлн": 12,
};

const SUFFIX_RE = /^(.*?)\s*(k|к|тис|m|м|млн|b|g|млрд|t|трлн)\.?$/u;

// Пробіл між цифрами дозволений лише як роздільник тисяч: «12 000», але не «1 2».
const INT = String.raw`(?:\d{1,3}(?:\s\d{3})+|\d+)`;
const NUM = String.raw`(?:${INT}(?:[.,]\d+)?|[.,]\d+)`;
const EXP = String.raw`([+-]?\d+)`;
const PLAIN_RE = new RegExp(String.raw`^(${NUM})(?:\s*e\s*${EXP})?$`, "u");
const POWER_RE = new RegExp(String.raw`^(?:(${NUM})\s*[·⋅∙*×x]\s*)?10\s*\^\s*${EXP}$`, "u");

/** «12 000,5» → «12000.5»: у нашій мові кома — десятковий роздільник. */
const normalizeMantissa = (text) => text.replace(/\s/gu, "").replace(",", ".");

/** Відокремлює словесний суфікс і повертає ядро числа та степінь суфікса. */
function splitSuffix(text) {
  const match = SUFFIX_RE.exec(text);
  if (!match) return { core: text, power: 0 };
  return { core: match[1], power: SUFFIX_POWERS[match[2]] };
}

/** Розбирає ядро без суфікса на мантису й показник степеня десяти. */
function parseCore(core) {
  const plain = PLAIN_RE.exec(core);
  if (plain) return { mantissa: normalizeMantissa(plain[1]), exponent: Number(plain[2] ?? 0) };

  const power = POWER_RE.exec(core);
  if (power) return { mantissa: power[1] ? normalizeMantissa(power[1]) : "1", exponent: Number(power[2]) };

  return null;
}

/**
 * Перетворює введений гравцем текст на число або null.
 * Від'ємні значення не підтримуються: оцінки навантаження завжди додатні,
 * а мінус найчастіше означає друкарську помилку.
 */
export function parseNumber(text) {
  if (typeof text === "number") return Number.isFinite(text) && text >= 0 ? text : null;
  if (typeof text !== "string") return null;

  const cleaned = text.trim().toLowerCase();
  if (cleaned === "") return null;

  const { core, power } = splitSuffix(cleaned);
  const parsed = parseCore(core.trim());
  if (!parsed) return null;

  const value = Number(`${parsed.mantissa}e${parsed.exponent + power}`);
  return Number.isFinite(value) ? value : null;
}

// ───────────────────────────── ОЦІНЮВАННЯ ─────────────────────────────

/** Запас на похибку рухомої коми: 1.3 × 100 має дати рівно три зірки. */
const EPSILON = 1e-9;
const EXACT_RATIO = 1.3;
const ORDER_RATIO = 10;

/**
 * Оцінює відповідь за відношенням до еталона.
 * 3★ — майже точно, 2★ — у межах допуску задачі, 1★ — правильний порядок.
 */
export function gradeAnswer(given, expected, tolerance = 2) {
  const invalid = typeof given !== "number" || !Number.isFinite(given) || given <= 0
    || typeof expected !== "number" || !Number.isFinite(expected) || expected <= 0;
  if (invalid) return { stars: 0, ratio: Infinity };

  const ratio = Math.max(given / expected, expected / given);
  return { stars: starsForRatio(ratio, tolerance), ratio };
}

function starsForRatio(ratio, tolerance) {
  if (ratio <= EXACT_RATIO + EPSILON) return 3;
  if (ratio <= tolerance + EPSILON) return 2;
  if (ratio <= ORDER_RATIO + EPSILON) return 1;
  return 0;
}

/**
 * Зірки за задачу — мінімум серед її запитань: оцінка сильна настільки,
 * наскільки сильна її найслабша ланка. Приймає масив результатів gradeAnswer,
 * масив чисел або об'єкт { askId: результат }.
 */
export function problemStars(results) {
  const list = Array.isArray(results) ? results : Object.values(results ?? {});
  if (list.length === 0) return 0;

  const stars = list.map((r) => (typeof r === "number" ? r : r?.stars ?? 0));
  return Math.max(0, Math.min(3, ...stars));
}

// ───────────────────────────── ВАРІАНТИ ЗАДАЧ ─────────────────────────────

/** FNV-1a: короткий і стабільний між запусками, на відміну від Math.random. */
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Фіналізатор murmur3: у сирого FNV молодші біти погано перемішані,
 * а саме вони визначають індекс при діленні на 2–3 варіанти.
 */
function avalanche(hash) {
  let h = hash;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const hashString = (text) => avalanche(fnv1a(text));

/**
 * Детерміновано обирає по одному значенню з кожного масиву problem.given.
 * id задачі входить у хеш, щоб один seed не давав усім задачам «перший варіант»
 * одночасно; кожен ключ хешується окремо, тож новий ключ не зсуває наявні.
 */
export function pickVariant(problem, seed) {
  const given = problem?.given ?? {};
  const variant = {};
  for (const key of Object.keys(given).sort()) {
    const options = given[key];
    variant[key] = Array.isArray(options)
      ? options[hashString(`${seed}:${problem.id ?? ""}:${key}`) % options.length]
      : options;
  }
  return variant;
}

// ───────────────────────────── ФОРМАТ ЧИСЕЛ ─────────────────────────────

const SCALE_NAMES = ["", "тис", "млн", "млрд", "трлн"];
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

const withComma = (text) => text.replace(".", ",");

/** Групує цілу частину пробілами: «5 000», як пишуть українською. */
function groupThousands(integerText) {
  return integerText.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** До трьох значущих цифр без хвостових нулів: 0.35 → «0,35», 231.48 → «231». */
function significant3(value) {
  return withComma(String(Number(value.toPrecision(3))));
}

/** Одна десяткова без «,0» у кінці: «86,4», «2», «1 234,5». */
function oneDecimal(value) {
  const [integer, fraction] = (Math.round(value * 10) / 10).toFixed(1).split(".");
  const grouped = groupThousands(integer);
  return fraction === "0" ? grouped : `${grouped},${fraction}`;
}

/** Наукова нотація для крихітних значень, у форматі, який розуміє parseNumber. */
function scientific(value) {
  let exponent = Math.floor(Math.log10(value));
  let mantissa = Number((value / 10 ** exponent).toPrecision(2));
  if (mantissa >= 10) {
    mantissa /= 10;
    exponent += 1;
  }
  return `${withComma(String(mantissa))}·10^${exponent}`;
}

/** Обирає тис/млн/млрд/трлн так, щоб число перед назвою було меншим за 1000. */
function scaled(value) {
  let scale = Math.min(SCALE_NAMES.length - 1, Math.max(1, Math.floor(Math.log10(value) / 3)));
  // Округлення може перенести 999,96 тис у «1000 тис» — тоді це вже 1 млн.
  if (Math.round((value / 1000 ** scale) * 10) / 10 >= 1000 && scale < SCALE_NAMES.length - 1) scale += 1;
  return `${oneDecimal(value / 1000 ** scale)} ${SCALE_NAMES[scale]}`;
}

/** Людський формат українською: «0,35», «850», «86,4 тис», «1,2 млн», «1,2·10^-3». */
export function formatNumber(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  if (n < 0) return `-${formatNumber(-n)}`;
  if (n < 0.01) return scientific(n);
  if (Number(n.toPrecision(3)) < 1000) return significant3(n);
  return scaled(n);
}

/** Значення одиниці байтів: 3 значущі цифри, а понад 1000 PB — ціле з групуванням. */
function byteValue(value) {
  return value >= 1000 ? groupThousands(String(Math.round(value))) : formatNumber(value);
}

/**
 * Байтові одиниці нормалізує до найзручнішої (крок 1000, як у дисків і хмар):
 * «1 500 GB» читається гірше за «1,5 TB». Решту одиниць лишає як є.
 */
export function formatUnit(n, unit) {
  const index = BYTE_UNITS.indexOf(unit);
  if (index === -1 || typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    return `${formatNumber(n)} ${unit}`;
  }

  const bytes = n * 1000 ** index;
  let target = 0;
  while (target < BYTE_UNITS.length - 1 && Number((bytes / 1000 ** (target + 1)).toPrecision(3)) >= 1) {
    target += 1;
  }
  return `${byteValue(bytes / 1000 ** target)} ${BYTE_UNITS[target]}`;
}
