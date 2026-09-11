/**
 * Задачі тренажера back-of-the-envelope оцінок.
 *
 * Кожна задача — фабрика з власними константами-припущеннями. Константи
 * підставляються і в текст assumptions, і в answer, тому гравець бачить рівно
 * ті числа, з яких рахується еталон: жодної «магії», яку не можна відтворити
 * на дошці.
 *
 * answer(g) повертає значення в одиниці запитання (TB, Gbps, req/s…), тобто
 * саме те число, яке гравець має ввести. Точні розрахунки йдуть із 86 400 с
 * на добу, а в steps поряд показано «дошкове» округлення до 10^5: так гравець
 * бачить, що грубе наближення лишається в межах допуску.
 *
 * Масив упорядкований від легших задач до складніших.
 */

import { formatNumber as num, formatUnit as unit } from "../progress/estimate.js";

// ───────────────────────────── СПІЛЬНІ ОДИНИЦІ ─────────────────────────────

const DAY = 86_400;
const DAYS_IN_YEAR = 365;
const DAYS_IN_MONTH = 30;
const BITS_PER_BYTE = 8;
const MS_PER_SECOND = 1_000;

// Десяткові одиниці, як у мережевого обладнання, дисків і хмарних прайсів.
const KB = 1e3;
const MB = 1e6;
const GB = 1e9;
const TB = 1e12;
const PB = 1e15;
const MBPS = 1e6;
const GBPS = 1e9;

const DAY_ASSUMPTION = "1 доба = 86 400 с ≈ 10^5 с";
const BYTE_ASSUMPTION = "1 B = 8 біт; 1 MB = 10^6 B, 1 GB = 10^9 B (десяткові одиниці, як у мережі й хмарах)";

const perSecond = (perDay) => perDay / DAY;
const bytesToGbps = (bytesPerSecond) => (bytesPerSecond * BITS_PER_BYTE) / GBPS;
const pct = (share) => `${num(share * 100)}%`;

/** Типовий рядок розбору: точне ділення на 86 400 і «дошкове» — на 10^5. */
const dayToSecond = (perDay, suffix) =>
  `${num(perDay)} / 86 400 с ≈ ${num(perSecond(perDay))} ${suffix} (на дошці: ${num(perDay)} / 10^5 ≈ ${num(perDay / 1e5)})`;

/**
 * Кількість машин чи шардів — ціле вгору. Допуск відсікає шум рухомої коми:
 * 6 TB / 50 GB має дати рівно 120 шардів, а не 121.
 */
const ceilCount = (value) => Math.ceil(value - 1e-9);

const groupDigits = (text) => text.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/**
 * Точне значення для кроку округлення: «1,8 тис → 1,8 тис» нічого не пояснює,
 * а «1 808,4 → 1 809» — пояснює.
 */
const exact = (value) =>
  value < 100 ? num(value) : groupDigits(value.toFixed(1)).replace(".", ",").replace(/,0$/, "");

/** Округлення вгору показуємо лише тоді, коли воно справді щось змінює. */
const roundUp = (value) => {
  const count = ceilCount(value);
  if (Math.abs(value - count) < 1e-9) return exact(count);
  return `${exact(value)} → округлюємо вгору до ${exact(count)}`;
};

// ───────────────────────────── РІВЕНЬ 1 ─────────────────────────────

function urlShortener() {
  const PEAK = 2;
  const RECORD_BYTES = 500;
  const YEARS = 5;
  const CODE_LENGTH = 7;
  const ALPHABET = 62;

  const linksPerDay = (g) => g.dau * g.linksPerUser;
  const writeQps = (g) => perSecond(linksPerDay(g));
  const avgReadQps = (g) => writeQps(g) * g.readRatio;
  const peakReadQps = (g) => avgReadQps(g) * PEAK;
  const totalLinks = (g) => linksPerDay(g) * DAYS_IN_YEAR * YEARS;
  const storageBytes = (g) => totalLinks(g) * RECORD_BYTES;

  return {
    id: "est-url",
    title: "Скорочувач посилань: навантаження й сховище",
    codexRef: "url-shortener",
    difficulty: 1,
    given: { dau: [10e6, 50e6, 100e6], linksPerUser: [0.1, 0.2], readRatio: [10, 100] },
    prompt: (g) =>
      `Сервіс коротких посилань має ${num(g.dau)} DAU. Кожен користувач у середньому створює ${num(g.linksPerUser)} посилання на добу, а на одне створення припадає ${num(g.readRatio)} переходів за коротким посиланням. Оцініть навантаження на запис і читання та обсяг сховища.`,
    assumptions: [
      DAY_ASSUMPTION,
      `Пік = ${PEAK}× середнього`,
      `Запис (довгий URL, короткий код, метадані) ≈ ${RECORD_BYTES} B`,
      `Посилання зберігаються ${YEARS} років по ${DAYS_IN_YEAR} днів`,
      `Короткий код — ${CODE_LENGTH} символів base62 (a–z, A–Z, 0–9)`,
    ],
    asks: [
      { id: "wqps", label: "Середній write QPS", unit: "req/s", answer: writeQps, tolerance: 2 },
      { id: "rqps", label: "Піковий read QPS", unit: "req/s", answer: peakReadQps, tolerance: 2 },
      { id: "storage", label: `Сховище за ${YEARS} років`, unit: "TB", answer: (g) => storageBytes(g) / TB, tolerance: 2 },
    ],
    steps: (g) => [
      `Нових посилань за добу: ${num(g.dau)} × ${num(g.linksPerUser)} = ${num(linksPerDay(g))}.`,
      `Write QPS: ${dayToSecond(linksPerDay(g), "req/s")}.`,
      `Read QPS: ${num(writeQps(g))} × ${num(g.readRatio)} ≈ ${num(avgReadQps(g))} req/s у середньому; у піку ×${PEAK} ≈ ${num(peakReadQps(g))} req/s.`,
      `Посилань за ${YEARS} років: ${num(linksPerDay(g))} × ${DAYS_IN_YEAR} × ${YEARS} ≈ ${num(totalLinks(g))}.`,
      `Сховище: ${num(totalLinks(g))} × ${RECORD_BYTES} B ≈ ${unit(storageBytes(g), "B")} без реплік та індексів.`,
      `Простір кодів: ${ALPHABET}^${CODE_LENGTH} ≈ ${num(ALPHABET ** CODE_LENGTH)}, а посилань за ${YEARS} років лише ${num(totalLinks(g))}, тож вичерпання кодів не загрожує.`,
    ],
    takeaway:
      "Write QPS мізерний — із записом упорається одна БД, а читань у 10–100 разів більше, тож редиректи треба віддавати з кешу; кілька десятків TB за п'ять років — це невеликий кластер, а не проблема.",
  };
}

function apiServers() {
  const PEAK = 3;
  const CORES = 16;
  const TARGET_UTIL = 0.6;

  const requestsPerDay = (g) => g.dau * g.requestsPerUser;
  const peakQps = (g) => perSecond(requestsPerDay(g)) * PEAK;
  const busyCores = (g) => (peakQps(g) * g.cpuMs) / MS_PER_SECOND;
  const usableCores = CORES * TARGET_UTIL;
  const servers = (g) => ceilCount(busyCores(g) / usableCores);

  return {
    id: "est-servers",
    title: "Скільки серверів API витримає пік",
    codexRef: "autoscaling",
    difficulty: 1,
    given: { dau: [5e6, 20e6, 100e6], requestsPerUser: [20, 50, 100], cpuMs: [10, 50] },
    prompt: (g) =>
      `Мобільний застосунок має ${num(g.dau)} DAU, кожен користувач робить у середньому ${num(g.requestsPerUser)} API-запитів на добу. Профілювання показує ${num(g.cpuMs)} мс CPU-часу на запит. Скільки stateless-серверів API потрібно, щоб пережити вечірній пік?`,
    assumptions: [
      DAY_ASSUMPTION,
      `Пік = ${PEAK}× середнього (вечірній максимум)`,
      `Сервер — ${CORES} ядер`,
      `Цільове завантаження CPU у піку — ${pct(TARGET_UTIL)}: решта — запас на сплески й відмову сусідньої машини`,
      "Очікування I/O ядро не займає: рахуємо лише CPU-час",
    ],
    asks: [
      { id: "peak", label: "Піковий QPS", unit: "req/s", answer: peakQps, tolerance: 2 },
      { id: "cores", label: "Ядер CPU, зайнятих у піку", unit: "шт", answer: busyCores, tolerance: 2 },
      { id: "servers", label: "Серверів із запасом", unit: "серверів", answer: servers, tolerance: 2 },
    ],
    steps: (g) => [
      `Запитів за добу: ${num(g.dau)} × ${num(g.requestsPerUser)} = ${num(requestsPerDay(g))}.`,
      `Середній QPS: ${dayToSecond(requestsPerDay(g), "req/s")}; у піку ×${PEAK} ≈ ${num(peakQps(g))} req/s.`,
      `Одне ядро дає 1 000 мс CPU за секунду, тобто встигає ${num(MS_PER_SECOND / g.cpuMs)} запитів за секунду.`,
      `Зайнятих ядер: ${num(peakQps(g))} × ${num(g.cpuMs)} мс / 1 000 мс ≈ ${num(busyCores(g))}.`,
      `Корисних ядер на сервер: ${CORES} × ${pct(TARGET_UTIL)} = ${num(usableCores)}.`,
      `Серверів: ${num(busyCores(g))} / ${num(usableCores)} ≈ ${roundUp(busyCores(g) / usableCores)}.`,
    ],
    takeaway:
      "Сервери рахують від піку й CPU-часу на запит, а не від середнього: запас до 60% завантаження — не марнотратство, а гарантія, що сплеск чи падіння однієї машини не покладуть решту.",
  };
}

function photoHosting() {
  const PEAK = 2;
  const DERIVATIVES = 0.2;

  const dailyBytes = (g) => g.uploadsPerDay * g.photoMB * MB;
  const avgIngressGbps = (g) => bytesToGbps(perSecond(dailyBytes(g)));
  const peakIngressGbps = (g) => avgIngressGbps(g) * PEAK;
  const dailyStoredBytes = (g) => dailyBytes(g) * (1 + DERIVATIVES);
  const yearlyBytes = (g) => dailyStoredBytes(g) * DAYS_IN_YEAR;

  return {
    id: "est-photo",
    title: "Фотохостинг: завантаження, трафік і сховище",
    codexRef: "object-storage",
    difficulty: 1,
    given: { uploadsPerDay: [2e6, 10e6, 50e6], photoMB: [1, 2, 3] },
    prompt: (g) =>
      `Фотохостинг приймає ${num(g.uploadsPerDay)} нових фото на добу. Середнє фото після стиснення на клієнті важить ${num(g.photoMB)} MB. Оцініть навантаження на завантаження, вхідний трафік і приріст сховища.`,
    assumptions: [
      DAY_ASSUMPTION,
      BYTE_ASSUMPTION,
      `Пік = ${PEAK}× середнього`,
      `Мініатюри й прев'ю кількох розмірів додають ≈ ${pct(DERIVATIVES)} до оригіналу`,
      `Рік = ${DAYS_IN_YEAR} днів`,
      "Внутрішню реплікацію object storage не рахуємо: вона входить у ціну сервісу",
    ],
    asks: [
      { id: "qps", label: "Середній upload QPS", unit: "req/s", answer: (g) => perSecond(g.uploadsPerDay), tolerance: 2 },
      { id: "ingress", label: "Піковий вхідний трафік", unit: "Gbps", answer: peakIngressGbps, tolerance: 2 },
      { id: "storage", label: "Сховище за рік", unit: "PB", answer: (g) => yearlyBytes(g) / PB, tolerance: 2 },
    ],
    steps: (g) => [
      `Upload QPS: ${dayToSecond(g.uploadsPerDay, "req/s")}.`,
      `Оригіналів за добу: ${num(g.uploadsPerDay)} × ${num(g.photoMB)} MB = ${unit(dailyBytes(g), "B")}.`,
      `Середній потік: ${unit(dailyBytes(g), "B")} / 86 400 с ≈ ${unit(perSecond(dailyBytes(g)), "B")}/s × 8 біт ≈ ${num(avgIngressGbps(g))} Gbps; у піку ×${PEAK} ≈ ${num(peakIngressGbps(g))} Gbps.`,
      `З мініатюрами: ${unit(dailyBytes(g), "B")} × ${num(1 + DERIVATIVES)} ≈ ${unit(dailyStoredBytes(g), "B")} на добу.`,
      `За рік: ${unit(dailyStoredBytes(g), "B")} × ${DAYS_IN_YEAR} ≈ ${unit(yearlyBytes(g), "B")}.`,
    ],
    takeaway:
      "Бінарні файли не кладуть у БД: фото йдуть в object storage, у базі лишаються метадані й ключ об'єкта, а сотні терабайт на рік дешевше тримати з автоматичним переходом старих фото в холодний клас.",
  };
}

function notifications() {
  const WORKER_RATE = 1_000;
  const PAYLOAD_BYTES = 1_000;
  const SECONDS_PER_MINUTE = 60;

  const transactionalPerDay = (g) => g.devices * g.pushPerDevice;
  const avgQps = (g) => perSecond(transactionalPerDay(g));
  const campaignSeconds = (g) => g.campaignMinutes * SECONDS_PER_MINUTE;
  const campaignQps = (g) => g.devices / campaignSeconds(g);
  const workers = (g) => ceilCount(campaignQps(g) / WORKER_RATE);

  return {
    id: "est-notify",
    title: "Push-нотифікації: звичайний потік і кампанія",
    codexRef: "message-queues",
    difficulty: 1,
    given: { devices: [10e6, 50e6, 200e6], pushPerDevice: [2, 5, 10], campaignMinutes: [10, 30] },
    prompt: (g) =>
      `Застосунок має ${num(g.devices)} активних пристроїв. Транзакційних пушів (статус замовлення, нове повідомлення) у середньому ${num(g.pushPerDevice)} на пристрій за добу. Маркетинг хоче розіслати акцію на всі пристрої за ${num(g.campaignMinutes)} хвилин. Оцініть звичайне навантаження, пік кампанії й кількість воркерів.`,
    assumptions: [
      DAY_ASSUMPTION,
      `Один воркер відправляє ≈ ${num(WORKER_RATE)} пушів/с (асинхронний HTTP/2 до APNs і FCM)`,
      `Пуш у черзі (токен пристрою, текст, метадані) ≈ ${unit(PAYLOAD_BYTES, "B")}`,
      "Транзакційні пуші йдуть окремою чергою й окремими воркерами, тож кампанія їх не затримує",
    ],
    asks: [
      { id: "avg", label: "Середній QPS транзакційних пушів", unit: "req/s", answer: avgQps, tolerance: 2 },
      { id: "campaign", label: "QPS під час кампанії", unit: "req/s", answer: campaignQps, tolerance: 2 },
      { id: "workers", label: "Воркерів для кампанії", unit: "серверів", answer: workers, tolerance: 2 },
    ],
    steps: (g) => [
      `Транзакційних пушів за добу: ${num(g.devices)} × ${num(g.pushPerDevice)} = ${num(transactionalPerDay(g))}.`,
      `Середній QPS: ${dayToSecond(transactionalPerDay(g), "req/s")}.`,
      `Кампанія: ${num(g.campaignMinutes)} хв = ${num(campaignSeconds(g))} с, тож ${num(g.devices)} / ${num(campaignSeconds(g))} с ≈ ${num(campaignQps(g))} req/s.`,
      `Пік кампанії відносно звичайного потоку: ×${num(campaignQps(g) / avgQps(g))}.`,
      `Воркерів: ${num(campaignQps(g))} / ${num(WORKER_RATE)} ≈ ${roundUp(campaignQps(g) / WORKER_RATE)}.`,
      `Черга на старті кампанії: ${num(g.devices)} × ${unit(PAYLOAD_BYTES, "B")} ≈ ${unit(g.devices * PAYLOAD_BYTES, "B")} — для Kafka чи SQS це дрібниця.`,
    ],
    takeaway:
      "Середній потік нотифікацій скромний, але кампанія на всіх дає пік у рази, а то й у десятки разів вищий — розсилку кладуть у чергу, воркери масштабують під кампанію, а транзакційні пуші відділяють, щоб акція не затримала код підтвердження.",
  };
}

// ───────────────────────────── РІВЕНЬ 2 ─────────────────────────────

function hotSetCache() {
  const HOT_SHARE = 0.2;
  const HIT_RATE = 0.8;
  const KEY_OVERHEAD_BYTES = 100;
  const NODE_GB = 50;

  const hotObjects = (g) => g.objects * HOT_SHARE;
  const entryBytes = (g) => g.objectKB * KB + KEY_OVERHEAD_BYTES;
  const hotBytes = (g) => hotObjects(g) * entryBytes(g);
  const nodes = (g) => ceilCount(hotBytes(g) / GB / NODE_GB);
  const dbQps = (g) => g.readQps * (1 - HIT_RATE);

  return {
    id: "est-cache",
    title: "Кеш під гарячі дані: правило 80/20",
    codexRef: "caching",
    difficulty: 2,
    given: { objects: [100e6, 500e6, 1e9], objectKB: [1, 5, 10], readQps: [50e3, 200e3, 1e6] },
    prompt: (g) =>
      `Каталог має ${num(g.objects)} об'єктів (картки товарів, профілі) по ${num(g.objectKB)} KB у середньому. Сервіс обробляє ${num(g.readQps)} читань на секунду. Спроєктуйте кеш у Redis перед базою даних: скільки пам'яті й вузлів потрібно та що дійде до БД?`,
    assumptions: [
      `Правило 80/20: ${pct(HOT_SHARE)} об'єктів отримують ${pct(HIT_RATE)} читань`,
      `Кешуємо лише гарячий набір, тож hit rate ≈ ${pct(HIT_RATE)}`,
      `Накладні витрати Redis ≈ ${KEY_OVERHEAD_BYTES} B на ключ`,
      `Redis-вузол: 64 GB RAM, під дані ≈ ${NODE_GB} GB (решта — на fork під час snapshot і фрагментацію)`,
      "1 KB = 1 000 B",
    ],
    asks: [
      { id: "memory", label: "Пам'ять під гарячий набір", unit: "GB", answer: (g) => hotBytes(g) / GB, tolerance: 2 },
      { id: "nodes", label: "Redis-вузлів", unit: "серверів", answer: nodes, tolerance: 2 },
      { id: "dbqps", label: "QPS, що доходить до БД", unit: "req/s", answer: dbQps, tolerance: 2 },
    ],
    steps: (g) => [
      `Гарячих об'єктів: ${num(g.objects)} × ${pct(HOT_SHARE)} = ${num(hotObjects(g))}.`,
      `Один запис у кеші: ${num(g.objectKB)} KB + ${KEY_OVERHEAD_BYTES} B ≈ ${unit(entryBytes(g), "B")}.`,
      `Пам'ять: ${num(hotObjects(g))} × ${unit(entryBytes(g), "B")} ≈ ${unit(hotBytes(g), "B")}.`,
      `Вузлів: ${unit(hotBytes(g), "B")} / ${NODE_GB} GB ≈ ${roundUp(hotBytes(g) / GB / NODE_GB)}.`,
      `До БД доходять лише промахи: ${num(g.readQps)} × ${pct(1 - HIT_RATE)} = ${num(dbQps(g))} req/s.`,
    ],
    takeaway:
      "Кешувати весь каталог не треба: гарячі 20% вміщуються в кілька вузлів Redis і знімають 80% читань, тож БД бачить уп'ятеро менше запитів; але холодний старт кешу вдарить по базі повним навантаженням.",
  };
}

function rateLimiter() {
  const COUNTER_BYTES = 100;
  const LOG_ENTRY_BYTES = 64;
  const NODE_GB = 50;

  const counters = (g) => g.clients * g.rules;
  const counterBytes = (g) => counters(g) * COUNTER_BYTES;
  const logEntries = (g) => g.clients * g.limitPerMinute;
  const logBytes = (g) => logEntries(g) * LOG_ENTRY_BYTES;
  const logNodes = (g) => ceilCount(logBytes(g) / GB / NODE_GB);

  return {
    id: "est-ratelimit",
    title: "Rate limiter: пам'ять під лічильники",
    codexRef: "rate-limiter-design",
    difficulty: 2,
    given: { clients: [1e6, 10e6, 50e6], rules: [2, 3], limitPerMinute: [60, 100, 600] },
    prompt: (g) =>
      `API-шлюз обмежує запити для ${num(g.clients)} активних клієнтів. На кожного клієнта діють ${num(g.rules)} правила з різними вікнами (секунда, хвилина, година), а хвилинний ліміт — ${num(g.limitPerMinute)} запитів. Скільки пам'яті в Redis займуть fixed window лічильники, а скільки — точний sliding window log?`,
    assumptions: [
      `Лічильник fixed window (ключ «клієнт:правило:вікно», значення, TTL, накладні витрати Redis) ≈ ${COUNTER_BYTES} B`,
      `Елемент sorted set у sliding window log (мітка часу й накладні витрати Redis) ≈ ${LOG_ENTRY_BYTES} B`,
      "Sliding window log рахуємо лише для хвилинного правила й для найгіршого випадку: кожен клієнт вибрав ліміт повністю",
      "Ключі з TTL зникають самі, тож у пам'яті лише клієнти, активні в поточному вікні",
      `Redis-вузол: 64 GB RAM, під дані ≈ ${NODE_GB} GB`,
    ],
    asks: [
      { id: "counters", label: "Пам'ять під fixed window лічильники", unit: "GB", answer: (g) => counterBytes(g) / GB, tolerance: 2 },
      { id: "log", label: "Пам'ять під sliding window log", unit: "GB", answer: (g) => logBytes(g) / GB, tolerance: 2 },
      { id: "nodes", label: "Redis-вузлів під sliding window log", unit: "серверів", answer: logNodes, tolerance: 2 },
    ],
    steps: (g) => [
      `Лічильників: ${num(g.clients)} × ${num(g.rules)} = ${num(counters(g))}.`,
      `Пам'ять лічильників: ${num(counters(g))} × ${COUNTER_BYTES} B ≈ ${unit(counterBytes(g), "B")} — вміщується в один вузол.`,
      `Sliding window log зберігає мітку часу кожного запиту у вікні: до ${num(g.limitPerMinute)} елементів на клієнта.`,
      `Пам'ять log: ${num(g.clients)} × ${num(g.limitPerMinute)} × ${LOG_ENTRY_BYTES} B ≈ ${unit(logBytes(g), "B")}.`,
      `Вузлів під log: ${unit(logBytes(g), "B")} / ${NODE_GB} GB ≈ ${roundUp(logBytes(g) / GB / NODE_GB)}.`,
      `Log потребує ×${num(logBytes(g) / counterBytes(g))} пам'яті порівняно з лічильниками.`,
    ],
    takeaway:
      "Лічильники вміщуються в один Redis навіть для десятків мільйонів клієнтів, а точний sliding window log роздуває пам'ять у десятки–сотні разів — тому на практиці беруть fixed або sliding window counter.",
  };
}

function connectionPool() {
  const RTT_MS = 0.5;
  const ACTIVE_PER_REPLICA = 100;

  const dbQps = (g) => g.qps * g.queriesPerRequest;
  const holdMs = (g) => RTT_MS + g.queryMs;
  const connections = (g) => (dbQps(g) * holdMs(g)) / MS_PER_SECOND;
  const replicas = (g) => ceilCount(connections(g) / ACTIVE_PER_REPLICA);

  return {
    id: "est-pool",
    title: "Закон Літтла: з'єднання до бази",
    codexRef: "latency-numbers",
    difficulty: 2,
    given: { qps: [2e3, 10e3, 50e3], queriesPerRequest: [3, 5, 10], queryMs: [1, 2, 5] },
    prompt: (g) =>
      `API у піку обробляє ${num(g.qps)} req/s. Кожен API-запит послідовно звертається до PostgreSQL у тому ж дата-центрі; кількість звернень на запит — ${num(g.queriesPerRequest)}, і кожне виконується на сервері БД ${num(g.queryMs)} мс. Скільки з'єднань зайнято одночасно і скільки реплік потрібно?`,
    assumptions: [
      `Round trip усередині дата-центру ≈ ${num(RTT_MS)} мс (latency numbers)`,
      "З'єднання зайняте на весь round trip і час виконання запиту",
      "Закон Літтла: одночасно зайнятих з'єднань = QPS × час утримання з'єднання",
      "Усі звернення — читання, тож їх можна розносити по репліках",
      `Одна репліка Postgres ефективно обслуговує ≈ ${ACTIVE_PER_REPLICA} одночасно активних запитів (кілька × кількість ядер); решту з'єднань тримає пулер на кшталт PgBouncer`,
    ],
    asks: [
      { id: "dbqps", label: "QPS до бази", unit: "req/s", answer: dbQps, tolerance: 2 },
      { id: "connections", label: "Одночасно зайнятих з'єднань", unit: "з'єднань", answer: connections, tolerance: 2 },
      { id: "replicas", label: "Реплік БД", unit: "серверів", answer: replicas, tolerance: 2 },
    ],
    steps: (g) => [
      `Звернень до БД: ${num(g.qps)} × ${num(g.queriesPerRequest)} = ${num(dbQps(g))} req/s.`,
      `Одне звернення тримає з'єднання ${num(RTT_MS)} + ${num(g.queryMs)} = ${num(holdMs(g))} мс.`,
      `Закон Літтла: ${num(dbQps(g))} req/s × ${num(holdMs(g))} мс / 1 000 ≈ ${num(connections(g))} з'єднань.`,
      `Реплік: ${num(connections(g))} / ${ACTIVE_PER_REPLICA} ≈ ${roundUp(connections(g) / ACTIVE_PER_REPLICA)}.`,
      `Бонус: сам API-запит проводить у базі ${num(g.queriesPerRequest)} × ${num(holdMs(g))} мс ≈ ${num(g.queriesPerRequest * holdMs(g))} мс — послідовні звернення напряму додаються до latency.`,
    ],
    takeaway:
      "Кількість з'єднань визначає не QPS сам по собі, а QPS × час утримання: скоротити кількість чи тривалість звернень так само ефективно, як додати репліки, а тисячі з'єднань без пулера на кшталт PgBouncer покладуть Postgres.",
  };
}

function taxiLocations() {
  const UPDATE_BYTES = 100;
  const GEO_ENTRY_BYTES = 100;
  const AVG_ONLINE_SHARE = 0.5;

  const peakUpdates = (g) => g.drivers / g.updateSec;
  const ingressMbps = (g) => (peakUpdates(g) * UPDATE_BYTES * BITS_PER_BYTE) / MBPS;
  const geoBytes = (g) => g.drivers * GEO_ENTRY_BYTES;
  const avgUpdates = (g) => peakUpdates(g) * AVG_ONLINE_SHARE;
  const historyBytes = (g) => avgUpdates(g) * UPDATE_BYTES * DAY;

  return {
    id: "est-taxi",
    title: "Таксі: потік геопозицій водіїв",
    codexRef: "realtime",
    difficulty: 2,
    given: { drivers: [100e3, 500e3, 1e6], updateSec: [3, 5, 10] },
    prompt: (g) =>
      `У піку в сервісі таксі онлайн ${num(g.drivers)} водіїв. Застосунок водія надсилає свою геопозицію раз на ${num(g.updateSec)} с. Оцініть потік оновлень, вхідний трафік, пам'ять під поточні позиції та обсяг історії треків за добу.`,
    assumptions: [
      DAY_ASSUMPTION,
      BYTE_ASSUMPTION,
      `Оновлення (id водія, координати, час, швидкість, курс, заголовки протоколу) ≈ ${UPDATE_BYTES} B`,
      `Поточна позиція в geo-індексі (Redis GEO) ≈ ${GEO_ENTRY_BYTES} B на водія`,
      `У середньому за добу онлайн ${pct(AVG_ONLINE_SHARE)} від пікової кількості водіїв`,
    ],
    asks: [
      { id: "updates", label: "Оновлень геопозиції на секунду в піку", unit: "req/s", answer: peakUpdates, tolerance: 2 },
      { id: "ingress", label: "Вхідний трафік у піку", unit: "Mbps", answer: ingressMbps, tolerance: 2 },
      { id: "geo", label: "Пам'ять під поточні позиції", unit: "MB", answer: (g) => geoBytes(g) / MB, tolerance: 2 },
      { id: "history", label: "Історія треків за добу", unit: "GB", answer: (g) => historyBytes(g) / GB, tolerance: 2 },
    ],
    steps: (g) => [
      `Оновлень у піку: ${num(g.drivers)} / ${num(g.updateSec)} с ≈ ${num(peakUpdates(g))} req/s.`,
      `Трафік: ${num(peakUpdates(g))} × ${UPDATE_BYTES} B ≈ ${unit(peakUpdates(g) * UPDATE_BYTES, "B")}/s × 8 біт ≈ ${num(ingressMbps(g))} Mbps.`,
      `Поточні позиції: ${num(g.drivers)} × ${GEO_ENTRY_BYTES} B ≈ ${unit(geoBytes(g), "B")} — вміщується в пам'ять одного вузла.`,
      `Середній потік за добу: ${num(peakUpdates(g))} × ${pct(AVG_ONLINE_SHARE)} ≈ ${num(avgUpdates(g))} оновлень/с.`,
      `Історія: ${num(avgUpdates(g))} × ${UPDATE_BYTES} B × 86 400 с ≈ ${unit(historyBytes(g), "B")} за добу (на дошці: × 10^5 ≈ ${unit(avgUpdates(g) * UPDATE_BYTES * 1e5, "B")}).`,
    ],
    takeaway:
      "Сотні тисяч дрібних оновлень на секунду — це навантаження на запис, а не на обсяг: поточні позиції вміщуються в RAM одного вузла, тож гарячий geo-індекс тримають у пам'яті, а історію треків пишуть пакетами в дешеве сховище.",
  };
}

function chat() {
  const PEAK = 2;
  const MESSAGE_BYTES = 200;
  const CONNS_PER_SERVER = 50_000;

  const messagesPerDay = (g) => g.dau * g.messagesPerUser;
  const peakQps = (g) => perSecond(messagesPerDay(g)) * PEAK;
  const yearlyBytes = (g) => messagesPerDay(g) * MESSAGE_BYTES * DAYS_IN_YEAR;
  const connections = (g) => g.dau * g.onlineShare;
  const gateways = (g) => ceilCount(connections(g) / CONNS_PER_SERVER);

  return {
    id: "est-chat",
    title: "Месенджер: повідомлення, історія, з'єднання",
    codexRef: "chat",
    difficulty: 2,
    given: { dau: [50e6, 200e6, 500e6], messagesPerUser: [20, 40, 100], onlineShare: [0.1, 0.2] },
    prompt: (g) =>
      `Месенджер має ${num(g.dau)} DAU; кожен надсилає в середньому ${num(g.messagesPerUser)} повідомлень на добу. У піку одночасно онлайн ${pct(g.onlineShare)} DAU, і кожен тримає WebSocket-з'єднання. Оцініть потік повідомлень, історію за рік і кількість gateway-серверів.`,
    assumptions: [
      DAY_ASSUMPTION,
      `Пік = ${PEAK}× середнього`,
      `Повідомлення з метаданими (id, відправник, чат, час) ≈ ${MESSAGE_BYTES} B; медіа лежать окремо в object storage`,
      `Історію зберігаємо рік (${DAYS_IN_YEAR} днів), репліки не рахуємо`,
      `Один gateway-сервер тримає ${num(CONNS_PER_SERVER)} WebSocket-з'єднань`,
      "Лише чати 1:1: групові розсилки не множать доставку",
    ],
    asks: [
      { id: "peak", label: "Піковий QPS повідомлень", unit: "req/s", answer: peakQps, tolerance: 2 },
      { id: "storage", label: "Історія за рік", unit: "TB", answer: (g) => yearlyBytes(g) / TB, tolerance: 2 },
      { id: "connections", label: "Одночасних з'єднань у піку", unit: "з'єднань", answer: connections, tolerance: 2 },
      { id: "gateways", label: "Gateway-серверів", unit: "серверів", answer: gateways, tolerance: 2 },
    ],
    steps: (g) => [
      `Повідомлень за добу: ${num(g.dau)} × ${num(g.messagesPerUser)} = ${num(messagesPerDay(g))}.`,
      `Середній QPS: ${dayToSecond(messagesPerDay(g), "req/s")}; у піку ×${PEAK} ≈ ${num(peakQps(g))} req/s.`,
      `Байтів за добу: ${num(messagesPerDay(g))} × ${MESSAGE_BYTES} B ≈ ${unit(messagesPerDay(g) * MESSAGE_BYTES, "B")}.`,
      `За рік: × ${DAYS_IN_YEAR} ≈ ${unit(yearlyBytes(g), "B")}.`,
      `З'єднань у піку: ${num(g.dau)} × ${pct(g.onlineShare)} = ${num(connections(g))}.`,
      `Gateway-серверів: ${num(connections(g))} / ${num(CONNS_PER_SERVER)} ≈ ${roundUp(connections(g) / CONNS_PER_SERVER)}.`,
    ],
    takeaway:
      "Кількість gateway-серверів визначають мільйони постійних з'єднань, а не QPS, а історія росте на сотні терабайт і петабайти за рік — потрібне горизонтально масштабоване сховище з шардуванням за chat_id.",
  };
}

function newsFeed() {
  const PEAK = 3;
  const PAGE_POSTS = 20;
  const POST_BYTES = 1_000;

  const viewsPerDay = (g) => g.dau * g.feedViews;
  const peakReadQps = (g) => perSecond(viewsPerDay(g)) * PEAK;
  const postsPerDay = (g) => g.dau * g.postsPerUser;
  const postQps = (g) => perSecond(postsPerDay(g));
  const fanoutWrites = (g) => postQps(g) * g.followers;
  const pageBytes = PAGE_POSTS * POST_BYTES;
  const peakEgressGbps = (g) => bytesToGbps(peakReadQps(g) * pageBytes);

  return {
    id: "est-feed",
    title: "Стрічка новин: читання й fan-out",
    codexRef: "news-feed",
    difficulty: 2,
    given: { dau: [100e6, 300e6, 500e6], feedViews: [5, 10, 20], postsPerUser: [0.1, 0.5], followers: [100, 300] },
    prompt: (g) =>
      `Соцмережа має ${num(g.dau)} DAU. Кожен відкриває стрічку в середньому ${num(g.feedViews)} разів на добу й публікує ${num(g.postsPerUser)} поста на добу; у середнього автора ${num(g.followers)} підписників. Стрічку будуємо через fan-out on write: новий пост одразу дописується в кешовані стрічки всіх підписників. Оцініть читання, запис, fan-out і трафік.`,
    assumptions: [
      DAY_ASSUMPTION,
      BYTE_ASSUMPTION,
      `Пік = ${PEAK}× середнього (вечірній прайм-тайм)`,
      `Одна сторінка стрічки — ${PAGE_POSTS} постів`,
      `Пост у стрічці (текст, автор, лічильники; без медіа) ≈ ${unit(POST_BYTES, "B")}`,
      "Медіа віддає CDN, тому вони не входять у трафік стрічки",
    ],
    asks: [
      { id: "read", label: "Піковий QPS читання стрічки", unit: "req/s", answer: peakReadQps, tolerance: 2 },
      { id: "posts", label: "Середній QPS нових постів", unit: "req/s", answer: postQps, tolerance: 2 },
      { id: "fanout", label: "Записів у кеш стрічок (fan-out)", unit: "req/s", answer: fanoutWrites, tolerance: 2 },
      { id: "egress", label: "Піковий трафік стрічки", unit: "Gbps", answer: peakEgressGbps, tolerance: 2 },
    ],
    steps: (g) => [
      `Переглядів стрічки за добу: ${num(g.dau)} × ${num(g.feedViews)} = ${num(viewsPerDay(g))}.`,
      `Читання: ${dayToSecond(viewsPerDay(g), "req/s")}; у піку ×${PEAK} ≈ ${num(peakReadQps(g))} req/s.`,
      `Постів за добу: ${num(g.dau)} × ${num(g.postsPerUser)} = ${num(postsPerDay(g))}; ${dayToSecond(postsPerDay(g), "req/s")}.`,
      `Fan-out: ${num(postQps(g))} × ${num(g.followers)} підписників ≈ ${num(fanoutWrites(g))} записів/с у кеш стрічок.`,
      `Сторінка стрічки: ${PAGE_POSTS} × ${unit(POST_BYTES, "B")} = ${unit(pageBytes, "B")}.`,
      `Трафік у піку: ${num(peakReadQps(g))} × ${unit(pageBytes, "B")} ≈ ${unit(peakReadQps(g) * pageBytes, "B")}/s × 8 біт ≈ ${num(peakEgressGbps(g))} Gbps.`,
    ],
    takeaway:
      "Fan-out on write множить кожен пост на сотні записів — для звичайних авторів це окупається миттєвим читанням із кешу, а для знаменитостей із мільйонами підписників пост підтягують під час читання (fan-out on read).",
  };
}

// ───────────────────────────── РІВЕНЬ 3 ─────────────────────────────

function logIngest() {
  const RETENTION_DAYS = 30;
  const COMPRESSION = 10;
  const KAFKA_REPLICATION = 3;
  const BROKER_MB_PER_SEC = 100;
  const MIN_BROKERS = 3;

  const eventsPerSec = (g) => g.hosts * g.linesPerSecond;
  const bytesPerSec = (g) => eventsPerSec(g) * g.lineBytes;
  const storedBytes = (g) => (bytesPerSec(g) * DAY * RETENTION_DAYS) / COMPRESSION;
  const kafkaWriteBytes = (g) => bytesPerSec(g) * KAFKA_REPLICATION;
  const brokers = (g) => Math.max(MIN_BROKERS, ceilCount(kafkaWriteBytes(g) / (BROKER_MB_PER_SEC * MB)));

  return {
    id: "est-logs",
    title: "Логи: ingest, зберігання, Kafka",
    codexRef: "message-queues",
    difficulty: 3,
    given: { hosts: [1e3, 5e3, 20e3], linesPerSecond: [50, 200, 1e3], lineBytes: [200, 500] },
    prompt: (g) =>
      `Флот із ${num(g.hosts)} хостів пише логи: у середньому ${num(g.linesPerSecond)} рядків на секунду з хоста, рядок — ${num(g.lineBytes)} B. Агенти відправляють логи в Kafka, а звідти вони потрапляють у сховище з пошуком. Оцініть потік подій і байтів, сховище та розмір кластера Kafka.`,
    assumptions: [
      DAY_ASSUMPTION,
      BYTE_ASSUMPTION,
      `Гарячий шар зберігає логи ${RETENTION_DAYS} днів`,
      `Сховище логів (ClickHouse, Loki) стискає текст ≈ ${COMPRESSION}×`,
      `Kafka: replication factor ${KAFKA_REPLICATION}, тобто кожен байт пишеться на ${KAFKA_REPLICATION} брокери`,
      `Брокер стабільно приймає ≈ ${BROKER_MB_PER_SEC} MB/s запису разом із репліками`,
      `Мінімум ${MIN_BROKERS} брокери, інакше replication factor ${KAFKA_REPLICATION} неможливий`,
    ],
    asks: [
      { id: "events", label: "Подій логів на секунду", unit: "req/s", answer: eventsPerSec, tolerance: 2 },
      { id: "ingest", label: "Вхідний потік", unit: "Gbps", answer: (g) => bytesToGbps(bytesPerSec(g)), tolerance: 2 },
      { id: "storage", label: `Сховище за ${RETENTION_DAYS} днів після стиснення`, unit: "TB", answer: (g) => storedBytes(g) / TB, tolerance: 2 },
      { id: "brokers", label: "Kafka-брокерів", unit: "серверів", answer: brokers, tolerance: 2 },
    ],
    steps: (g) => [
      `Подій: ${num(g.hosts)} × ${num(g.linesPerSecond)} = ${num(eventsPerSec(g))} на секунду.`,
      `Байтів: ${num(eventsPerSec(g))} × ${num(g.lineBytes)} B ≈ ${unit(bytesPerSec(g), "B")}/s × 8 біт ≈ ${num(bytesToGbps(bytesPerSec(g)))} Gbps.`,
      `За добу: ${unit(bytesPerSec(g), "B")}/s × 86 400 с ≈ ${unit(bytesPerSec(g) * DAY, "B")} сирих логів.`,
      `За ${RETENTION_DAYS} днів зі стисненням ${COMPRESSION}×: ${unit(bytesPerSec(g) * DAY, "B")} × ${RETENTION_DAYS} / ${COMPRESSION} ≈ ${unit(storedBytes(g), "B")}.`,
      `Запис у Kafka з репліками: ${unit(bytesPerSec(g), "B")}/s × ${KAFKA_REPLICATION} ≈ ${unit(kafkaWriteBytes(g), "B")}/s.`,
      `Брокерів: ${unit(kafkaWriteBytes(g), "B")}/s / ${BROKER_MB_PER_SEC} MB/s ≈ ${num(kafkaWriteBytes(g) / (BROKER_MB_PER_SEC * MB))}, але не менше ${MIN_BROKERS} → ${num(brokers(g))}.`,
    ],
    takeaway:
      "Логи часто пишуть більше байтів, ніж сам продукт: без стиснення, семплювання й короткої ретенції гарячого шару вони з'їдять бюджет, а Kafka між агентами й сховищем гасить сплески й дозволяє перечитати потік.",
  };
}

function videoStreaming() {
  const LADDER_MBPS = 10;
  const REPLICATION = 3;
  const VIEW_MBPS = 3;
  const PEAK = 2;
  const MINUTES_PER_DAY = 1_440;
  const SECONDS_PER_HOUR = 3_600;
  const SECONDS_PER_MINUTE = 60;

  const hoursPerDay = (g) => g.uploadHoursPerMinute * MINUTES_PER_DAY;
  const videoSeconds = (g) => hoursPerDay(g) * SECONDS_PER_HOUR;
  const ladderBytesPerSec = (LADDER_MBPS * MBPS) / BITS_PER_BYTE;
  const rawBytes = (g) => videoSeconds(g) * ladderBytesPerSec;
  const storedBytes = (g) => rawBytes(g) * REPLICATION;
  const watchMinutesPerDay = (g) => g.dau * g.watchMinutes;
  const concurrentViews = (g) => (watchMinutesPerDay(g) * SECONDS_PER_MINUTE) / DAY;
  const avgEgressGbps = (g) => (concurrentViews(g) * VIEW_MBPS * MBPS) / GBPS;
  const peakEgressGbps = (g) => avgEgressGbps(g) * PEAK;

  return {
    id: "est-video",
    title: "Відеостримінг: сховище й egress",
    codexRef: "video-streaming",
    difficulty: 3,
    given: { uploadHoursPerMinute: [20, 100, 500], dau: [10e6, 50e6, 100e6], watchMinutes: [30, 60, 90] },
    prompt: (g) =>
      `Відеоплатформа щохвилини отримує ${num(g.uploadHoursPerMinute)} годин нового відео. ${num(g.dau)} DAU дивляться в середньому по ${num(g.watchMinutes)} хвилин на добу. Оцініть щодобовий приріст сховища, кількість одночасних переглядів і піковий egress.`,
    assumptions: [
      DAY_ASSUMPTION,
      BYTE_ASSUMPTION,
      `Кожне відео транскодуємо в набір якостей 240p–1080p; сумарний бітрейт усіх версій ≈ ${LADDER_MBPS} Mbps (сам 1080p ≈ 5 Mbps)`,
      "Оригінал після транскодування не зберігаємо",
      `Кожен файл зберігається в ${REPLICATION} копіях`,
      `Середній бітрейт перегляду ≈ ${VIEW_MBPS} Mbps (мікс якостей, багато мобільних)`,
      `Пік = ${PEAK}× середнього`,
    ],
    asks: [
      { id: "storage", label: "Нове сховище за добу (з копіями)", unit: "PB", answer: (g) => storedBytes(g) / PB, tolerance: 2 },
      { id: "concurrent", label: "Одночасних переглядів у середньому", unit: "з'єднань", answer: concurrentViews, tolerance: 2 },
      { id: "egress", label: "Піковий egress", unit: "Gbps", answer: peakEgressGbps, tolerance: 2 },
    ],
    steps: (g) => [
      `Нового відео за добу: ${num(g.uploadHoursPerMinute)} год/хв × 1 440 хв = ${num(hoursPerDay(g))} год ≈ ${num(videoSeconds(g))} с.`,
      `Секунда відео в усіх якостях: ${LADDER_MBPS} Mbps / 8 = ${unit(ladderBytesPerSec, "B")}.`,
      `За добу: ${num(videoSeconds(g))} с × ${unit(ladderBytesPerSec, "B")} ≈ ${unit(rawBytes(g), "B")}; з ${REPLICATION} копіями ≈ ${unit(storedBytes(g), "B")}.`,
      `Хвилин перегляду за добу: ${num(g.dau)} × ${num(g.watchMinutes)} = ${num(watchMinutesPerDay(g))}.`,
      `Одночасних переглядів: ${num(watchMinutesPerDay(g))} × 60 с / 86 400 с ≈ ${num(concurrentViews(g))}.`,
      `Середній egress: ${num(concurrentViews(g))} × ${VIEW_MBPS} Mbps ≈ ${num(avgEgressGbps(g))} Gbps; у піку ×${PEAK} ≈ ${num(peakEgressGbps(g))} Gbps (≈ ${num(peakEgressGbps(g) / 1_000)} Tbps).`,
    ],
    takeaway:
      "Відео — задача пропускної здатності, а не QPS: терабіти на секунду може віддати лише CDN із кешем на краю мережі, а сховище росте на петабайти й потребує дешевого object storage з холодними класами для рідко переглядуваних відео.",
  };
}

function cdnEgress() {
  const PEAK = 2;
  const CDN_PRICE_PER_GB = 0.02;
  const CLOUD_PRICE_PER_GB = 0.09;

  const dailyBytes = (g) => g.pageViewsPerDay * g.pageMB * MB;
  const avgEgressGbps = (g) => bytesToGbps(perSecond(dailyBytes(g)));
  const peakEgressGbps = (g) => avgEgressGbps(g) * PEAK;
  const monthlyBytes = (g) => dailyBytes(g) * DAYS_IN_MONTH;
  const originBytes = (g) => monthlyBytes(g) * (1 - g.hitRatio);
  const cdnBill = (g) => (monthlyBytes(g) / GB) * CDN_PRICE_PER_GB;
  const cloudBill = (g) => (monthlyBytes(g) / GB) * CLOUD_PRICE_PER_GB;

  return {
    id: "est-cdn",
    title: "CDN: egress і рахунок за трафік",
    codexRef: "cdn",
    difficulty: 3,
    given: { pageViewsPerDay: [10e6, 50e6, 200e6], pageMB: [1, 2, 3], hitRatio: [0.9, 0.95] },
    prompt: (g) =>
      `Медіасайт має ${num(g.pageViewsPerDay)} переглядів сторінок на добу; сторінка разом із зображеннями, JS і CSS важить ${num(g.pageMB)} MB. Статику віддає CDN із hit ratio ${pct(g.hitRatio)}. Оцініть піковий egress, місячний трафік, навантаження на origin і рахунок за CDN.`,
    assumptions: [
      DAY_ASSUMPTION,
      BYTE_ASSUMPTION,
      `Пік = ${PEAK}× середнього`,
      `Місяць = ${DAYS_IN_MONTH} днів`,
      "Кеш браузера не враховуємо: кожен перегляд тягне сторінку повністю (консервативна оцінка)",
      `CDN на такому обсязі ≈ ${num(CDN_PRICE_PER_GB)} $/GB`,
      `Прямий egress із хмари в інтернет ≈ ${num(CLOUD_PRICE_PER_GB)} $/GB`,
    ],
    asks: [
      { id: "peak", label: "Піковий egress з CDN", unit: "Gbps", answer: peakEgressGbps, tolerance: 2 },
      { id: "monthly", label: "Трафік за місяць", unit: "TB", answer: (g) => monthlyBytes(g) / TB, tolerance: 2 },
      { id: "origin", label: "Трафік до origin за місяць (промахи CDN)", unit: "TB", answer: (g) => originBytes(g) / TB, tolerance: 2 },
      { id: "bill", label: "Рахунок за CDN", unit: "$/міс", answer: cdnBill, tolerance: 2 },
    ],
    steps: (g) => [
      `Трафік за добу: ${num(g.pageViewsPerDay)} × ${num(g.pageMB)} MB = ${unit(dailyBytes(g), "B")}.`,
      `Середній egress: ${unit(dailyBytes(g), "B")} / 86 400 с ≈ ${unit(perSecond(dailyBytes(g)), "B")}/s × 8 біт ≈ ${num(avgEgressGbps(g))} Gbps; у піку ×${PEAK} ≈ ${num(peakEgressGbps(g))} Gbps.`,
      `За місяць: ${unit(dailyBytes(g), "B")} × ${DAYS_IN_MONTH} = ${unit(monthlyBytes(g), "B")}.`,
      `До origin доходять промахи: ${unit(monthlyBytes(g), "B")} × ${pct(1 - g.hitRatio)} ≈ ${unit(originBytes(g), "B")}.`,
      `Рахунок CDN: ${num(monthlyBytes(g) / GB)} GB × ${num(CDN_PRICE_PER_GB)} $ ≈ ${num(cdnBill(g))} $/міс.`,
      `Для порівняння: той самий трафік прямо з хмари коштував би ≈ ${num(cloudBill(g))} $/міс.`,
    ],
    takeaway:
      "На такому обсязі egress — головна стаття рахунку: hit ratio CDN вирішує, скільки трафіку дійде до origin, а різниця між ціною CDN і прямим egress хмари множить суму в рази.",
  };
}

function searchIndex() {
  const INDEX_RATIO = 0.3;
  const COPIES = 2;
  const SHARD_GB = 50;

  const rawBytes = (g) => g.documents * g.documentKB * KB;
  const primaryIndexBytes = (g) => rawBytes(g) * INDEX_RATIO;
  const totalIndexBytes = (g) => primaryIndexBytes(g) * COPIES;
  const shards = (g) => ceilCount(primaryIndexBytes(g) / GB / SHARD_GB);
  const shardQps = (g) => g.searchQps * shards(g);

  return {
    id: "est-search",
    title: "Пошуковий індекс: розмір і шарди",
    codexRef: "sharding",
    difficulty: 3,
    given: { documents: [100e6, 1e9, 5e9], documentKB: [5, 20], searchQps: [1e3, 10e3, 50e3] },
    prompt: (g) =>
      `Потрібен пошук серед ${num(g.documents)} документів із середнім розміром тексту ${num(g.documentKB)} KB; у піку надходить ${num(g.searchQps)} пошукових запитів на секунду. Індекс шардовано за документами, тож кожен запит іде на всі шарди (scatter-gather). Оцініть розмір індексу, кількість шардів і внутрішнє навантаження.`,
    assumptions: [
      "1 KB = 1 000 B",
      `Інвертований індекс без збережених полів ≈ ${pct(INDEX_RATIO)} від сирого тексту`,
      `Кожен шард має одну репліку: ${COPIES} копії індексу`,
      `Цільовий розмір primary-шарда ≈ ${SHARD_GB} GB (Elasticsearch і OpenSearch радять 10–50 GB)`,
    ],
    asks: [
      { id: "raw", label: "Сирий текст", unit: "TB", answer: (g) => rawBytes(g) / TB, tolerance: 2 },
      { id: "index", label: "Індекс разом із репліками", unit: "TB", answer: (g) => totalIndexBytes(g) / TB, tolerance: 2 },
      { id: "shards", label: "Primary-шардів", unit: "шт", answer: shards, tolerance: 2 },
      { id: "fanout", label: "Внутрішніх запитів до шардів", unit: "req/s", answer: shardQps, tolerance: 2 },
    ],
    steps: (g) => [
      `Сирий текст: ${num(g.documents)} × ${num(g.documentKB)} KB = ${unit(rawBytes(g), "B")}.`,
      `Primary-індекс: ${unit(rawBytes(g), "B")} × ${pct(INDEX_RATIO)} = ${unit(primaryIndexBytes(g), "B")}; з репліками ×${COPIES} = ${unit(totalIndexBytes(g), "B")}.`,
      `Шардів: ${unit(primaryIndexBytes(g), "B")} / ${SHARD_GB} GB ≈ ${roundUp(primaryIndexBytes(g) / GB / SHARD_GB)}.`,
      `Scatter-gather: ${num(g.searchQps)} req/s × ${num(shards(g))} шардів ≈ ${num(shardQps(g))} внутрішніх запитів/с.`,
      "Репліки ділять між собою читання, тож внутрішнє навантаження лягає на обидві копії кожного шарда.",
    ],
    takeaway:
      "Коли індекс шардовано за документами, кожен запит розлітається на всі шарди й вартість росте як QPS × кількість шардів — тому великі системи ділять індекс на рівні (гарячий і холодний) і маршрутизують запити, щоб не питати всіх.",
  };
}

export const ESTIMATES = [
  urlShortener(),
  apiServers(),
  photoHosting(),
  notifications(),
  hotSetCache(),
  rateLimiter(),
  connectionPool(),
  taxiLocations(),
  chat(),
  newsFeed(),
  logIngest(),
  videoStreaming(),
  cdnEgress(),
  searchIndex(),
];
