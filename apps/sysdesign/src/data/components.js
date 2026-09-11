/**
 * Каталог компонентів конструктора.
 *
 * Кожен запис — це і опис для гравця (назва, пояснення, посилання в довідник),
 * і параметри моделі (потужність, базова латентність, вартість, які класи
 * запитів компонент обслуговує). Логіку тримаємо поруч із даними свідомо:
 * коли число в моделі змінюється, пояснення поруч змінюється разом із ним.
 *
 * Ролі компонента щодо класу запиту:
 *   serve  — обслуговує сам і завершує запит (база, об'єктне сховище);
 *   pass   — передає далі дочірнім вузлам (балансувальник, app);
 *   absorb — частину обслуговує сам (влучання в кеш), решту передає далі;
 *   limit  — частину відкидає (rate limiter), решту передає далі;
 *   async  — підтверджує одразу, а обробку віддає споживачам (черга).
 *
 * Потужність `cap` — одиниць роботи на секунду на інстанс розміру M.
 * Одиниця роботи — «одне просте читання»; запис, звіт чи статика коштують
 * інакше (див. `work`). Так одна формула ρ = робота / потужність працює
 * для всіх компонентів.
 */

import { SIZES, SIZE_ORDER, APP_THREADS } from "./constants.js";

// ─────────────────────────── спільні налаштування ───────────────────────────

const sizeKnob = (unlock) => ({
  type: "select",
  label: "Розмір інстансу",
  options: SIZE_ORDER,
  default: "M",
  unlock,
  codexRef: "vertical-horizontal",
  hint: "Більший інстанс — більше CPU і RAM, але ціна росте швидше за потужність, а XL — стеля.",
});

const instancesKnob = ({ label = "Інстанси", min = 1, max = 20, def = 1, unlock, hint } = {}) => ({
  type: "int",
  label,
  min,
  max,
  default: def,
  unlock,
  codexRef: "vertical-horizontal",
  hint: hint ?? "Горизонтальне масштабування: навантаження ділиться між однаковими копіями.",
});

const zonesKnob = {
  type: "int",
  label: "Зони доступності (AZ)",
  min: 1,
  max: 3,
  default: 1,
  unlock: "l4-4",
  codexRef: "cloud-regions",
  hint: "Інстанси розкладаються по кількох AZ. Відмова однієї зони забирає лише її частку потужності.",
};

const drKnob = {
  type: "toggle",
  label: "Резерв в іншому регіоні",
  default: false,
  unlock: "l4-4",
  codexRef: "multi-region",
  hint: "Warm standby в іншому регіоні (+50% вартості). Рятує від відмови регіону, якщо DNS уміє failover.",
};

const autoscaleKnob = {
  type: "toggle",
  label: "Автоскейлінг",
  default: false,
  unlock: "l4-2",
  codexRef: "autoscaling",
  hint: "Кількість інстансів підлаштовується під навантаження (ціль — 60% CPU). Нові піднімаються ~2 хв.",
};

const maxInstancesKnob = {
  type: "int",
  label: "Максимум інстансів",
  min: 2,
  max: 60,
  default: 10,
  unlock: "l4-2",
  codexRef: "autoscaling",
  when: (_level, cfg) => cfg.autoscale,
  hint: "Стеля автоскейлера — захист бюджету від нескінченного масштабування.",
};

const hashingKnob = {
  type: "select",
  label: "Розподіл ключів",
  options: ["mod", "consistent"],
  labels: { mod: "hash(key) mod N", consistent: "Consistent hashing" },
  default: "mod",
  unlock: "l3-3",
  codexRef: "consistent-hashing",
  hint: "Коли кількість вузлів змінюється, mod N переносить майже всі ключі, кільце — лише ~1/N.",
};

const ALL_PASS = { read: "pass", write: "pass", static: "pass", query: "pass", conn: "pass", abuse: "pass" };

/** Множник вартості резерву в іншому регіоні. */
const dr = (cfg) => (cfg.drRegion ? 1.5 : 1);
const sizeCost = (cfg) => SIZES[cfg.size ?? "M"].cost;

// ─────────────────────────── компоненти ───────────────────────────

export const COMPONENTS = {
  client: {
    id: "client",
    label: "Користувачі",
    short: "USR",
    category: "edge",
    fixed: true,
    blurb: "Звідси йде весь трафік рівня. Будь-який шлях починається з DNS-запиту.",
    codexRef: "what-happens-url",
    cap: Infinity,
    baseMs: 0,
    availability: 1,
    roles: {},
    connectsTo: ["dns"],
    knobs: {},
    cost: () => 0,
  },

  dns: {
    id: "dns",
    label: "DNS",
    short: "DNS",
    category: "edge",
    unlock: "l1-1",
    managed: true,
    router: true,
    blurb: "Перетворює домен на IP-адресу. Кешується клієнтами на час TTL, тому майже не додає латентності.",
    codexRef: "dns",
    cap: Infinity,
    baseMs: 1,
    availability: 0.99999,
    roles: ALL_PASS,
    connectsTo: ["cdn", "lb", "gateway", "ratelimiter", "server", "app", "wsgateway"],
    knobs: {
      policy: {
        type: "select",
        label: "Політика маршрутизації",
        options: ["simple", "failover"],
        labels: { simple: "Проста", failover: "Failover з health check" },
        default: "simple",
        unlock: "l4-4",
        codexRef: "multi-region",
        hint: "Failover перемикає домен на резервний регіон, коли health check основного падає.",
      },
      ttlSec: {
        type: "select",
        label: "TTL запису",
        options: [30, 60, 300, 3600],
        default: 300,
        unlock: "l4-4",
        codexRef: "dns",
        hint: "Скільки клієнти тримають стару IP-адресу. Короткий TTL — швидший failover.",
      },
    },
    cost: () => 1,
    hints: { down: "DNS недоступний — клієнти не можуть знайти жодного сервера." },
  },

  server: {
    id: "server",
    label: "Сервер «все-в-одному»",
    short: "SRV",
    category: "compute",
    unlock: "l1-1",
    sized: true,
    blurb: "Одна машина: і код, і база, і файли. Найпростіший старт — і єдина точка відмови.",
    codexRef: "vertical-horizontal",
    cap: 400,
    baseMs: { read: 15, write: 25, static: 5, query: 250, abuse: 15 },
    work: { read: 1, write: 3, static: 0.3, query: 25, abuse: 1 },
    availability: 0.995,
    roles: { read: "serve", write: "serve", static: "serve", query: "serve", abuse: "serve" },
    connectsTo: [],
    knobs: { size: sizeKnob("l1-1") },
    cost: ({ cfg }) => 80 * sizeCost(cfg),
    hints: {
      over: "Одна машина впирається в CPU: і код, і база ділять ті самі ядра. Більший розмір — або розділіть код і дані.",
      down: "Сервер упав — а він єдиний. Це і є single point of failure.",
    },
  },

  app: {
    id: "app",
    label: "App-сервер",
    short: "APP",
    category: "compute",
    unlock: "l1-2",
    sized: true,
    clustered: true,
    fanout: true,
    blurb: "Код застосунку без стану. Масштабується додаванням інстансів за балансувальником.",
    codexRef: "stateless",
    cap: 1000,
    threads: APP_THREADS,
    baseMs: { read: 8, write: 10, static: 3, query: 10, abuse: 8 },
    work: { read: 1, write: 1.5, static: 0.3, query: 1, abuse: 1 },
    availability: 0.995,
    roles: { read: "pass", write: "pass", static: "pass", query: "pass", abuse: "pass" },
    // Статику app віддає з власного диска, якщо нема кому її передати.
    selfServe: ["static"],
    connectsTo: ["sql", "nosql", "cache", "objstore", "queue", "external"],
    knobs: {
      size: sizeKnob("l1-2"),
      instances: instancesKnob({ max: 40, unlock: "l2-1" }),
      sessions: {
        type: "select",
        label: "Де живуть сесії",
        options: ["local", "sticky", "shared"],
        labels: { local: "У пам'яті інстансу", sticky: "Sticky sessions на LB", shared: "Спільне сховище" },
        default: "local",
        unlock: "l2-1",
        codexRef: "stateless",
        when: (level) => Boolean(level.data?.sessions),
        hint: "Сесія в пам'яті одного інстансу не видна іншим: LB відправить наступний запит деінде — і користувача «розлогінить».",
      },
      autoscale: autoscaleKnob,
      maxInstances: maxInstancesKnob,
      localCache: {
        type: "toggle",
        label: "Локальний кеш у пам'яті",
        default: false,
        unlock: "l5-1",
        codexRef: "caching",
        hint: "In-process кеш найгарячіших ключів: знімає hot key з Redis ціною кількох секунд застарілості.",
      },
      fanout: {
        type: "select",
        label: "Fan-out стрічки",
        options: ["write", "read", "hybrid"],
        labels: { write: "On write (push)", read: "On read (pull)", hybrid: "Hybrid" },
        default: "write",
        unlock: "l5-2",
        codexRef: "news-feed",
        when: (level) => Boolean(level.data?.fanout),
        hint: "Push розкладає пост у стрічки підписників одразу, pull збирає стрічку під час читання, hybrid — push для всіх, крім зірок.",
      },
      zones: zonesKnob,
      drRegion: drKnob,
    },
    cost: ({ cfg, avgInstances }) => 70 * sizeCost(cfg) * (avgInstances ?? cfg.instances) * dr(cfg),
    hints: {
      over: "App-сервери не встигають. Додайте інстанси (горизонтально) або візьміть більший розмір.",
      threads: "Потоки app зайняті очікуванням повільної залежності (закон Літтла): CPU вільний, а нові запити нікому взяти.",
      down: "Усі інстанси app недоступні.",
    },
  },

  sql: {
    id: "sql",
    label: "SQL-база",
    short: "SQL",
    category: "data",
    unlock: "l1-2",
    sized: true,
    blurb: "Реляційна БД (PostgreSQL/MySQL): транзакції, JOIN, індекси. Читання масштабуються репліками, запис — лише шардингом.",
    codexRef: "sql-vs-nosql",
    cap: 3000,
    baseMs: { read: 3, write: 6, query: 30, abuse: 3 },
    work: (cls, cfg, level) => {
      const indexes = cfg.indexes ?? 0;
      if (cls === "write") return (level.data?.writeWork ?? 4) * (1 + 0.15 * indexes);
      if (cls === "query") return indexes >= (level.data?.queryIndexes ?? 1) ? 4 : 80;
      return 1;
    },
    availability: 0.999,
    roles: { read: "serve", write: "serve", query: "serve", abuse: "serve" },
    connectsTo: [],
    knobs: {
      size: sizeKnob("l1-2"),
      replicas: {
        type: "int",
        label: "Read-репліки",
        min: 0,
        max: 5,
        default: 0,
        unlock: "l3-1",
        codexRef: "replication",
        hint: "Репліки забирають читання, але кожна сама застосовує всі записи — запис вони не розвантажують.",
      },
      replication: {
        type: "select",
        label: "Реплікація",
        options: ["async", "sync"],
        labels: { async: "Асинхронна", sync: "Синхронна" },
        default: "async",
        unlock: "l3-1",
        codexRef: "replication",
        when: (_level, cfg) => cfg.replicas > 0,
        hint: "Синхронна не губить записів при failover, але кожен запис чекає підтвердження репліки.",
      },
      standby: {
        type: "toggle",
        label: "Standby в іншій AZ (Multi-AZ)",
        default: false,
        unlock: "l3-1",
        codexRef: "replication",
        hint: "Синхронна копія primary, яка не обслуговує трафік, але за хвилину стає новим primary без втрати даних.",
      },
      indexes: {
        type: "int",
        label: "Вторинні індекси",
        min: 0,
        max: 6,
        default: 0,
        unlock: "l3-2",
        codexRef: "indexes",
        hint: "Індекс перетворює full scan на пошук за ключем, але кожен індекс робить запис дорожчим (write amplification).",
      },
      shards: {
        type: "int",
        label: "Шарди",
        min: 1,
        max: 8,
        default: 1,
        unlock: "l3-3",
        codexRef: "sharding",
        hint: "Кожен шард — окремий primary зі своєю часткою ключів. Єдиний спосіб масштабувати запис у SQL.",
      },
      drRegion: drKnob,
    },
    cost: ({ cfg }) => {
      const perShard = 1 + (cfg.replicas ?? 0) + (cfg.standby ? 1 : 0) + (cfg.drRegion ? 1 : 0);
      return 250 * sizeCost(cfg) * (cfg.shards ?? 1) * perShard;
    },
    hints: {
      over: "База не встигає. Читання — у кеш чи репліки, запис — у чергу або шарди, звіти — індекси.",
      down: "Primary бази недоступний, а резерву немає — записи падають, доки його не піднімуть.",
    },
  },

  nosql: {
    id: "nosql",
    label: "NoSQL (wide-column)",
    short: "NSQ",
    category: "data",
    unlock: "l3-3",
    clustered: true,
    blurb: "Cassandra/DynamoDB-подібне сховище: запис масштабується вузлами, дані розкладені за partition key. Без JOIN і ad-hoc звітів.",
    codexRef: "sql-vs-nosql",
    cap: 10000,
    baseMs: { read: 3, write: 3, abuse: 3 },
    availability: 0.999,
    roles: { read: "serve", write: "serve", abuse: "serve" },
    connectsTo: [],
    knobs: {
      instances: instancesKnob({ label: "Вузли", min: 3, max: 40, def: 3, unlock: "l3-3" }),
      rf: {
        type: "int",
        label: "Replication factor",
        min: 1,
        max: 3,
        default: 3,
        unlock: "l3-3",
        codexRef: "replication",
        hint: "Скільки копій кожного ключа. Кожна копія — ще один запис на диск.",
      },
      consistency: {
        type: "select",
        label: "Consistency level",
        options: ["ONE", "QUORUM", "ALL"],
        default: "ONE",
        unlock: "l3-3",
        codexRef: "consistency-models",
        hint: "Скільки реплік мають відповісти. QUORUM при RF=3 переживає втрату вузла і дає R+W>N.",
      },
      partitionKey: {
        type: "select",
        label: "Partition key",
        options: (level) => Object.keys(level.data?.partitionKeys ?? { id: 0 }),
        labels: (level) => level.data?.partitionKeyLabels ?? {},
        default: (level) => Object.keys(level.data?.partitionKeys ?? { id: 0 })[0],
        unlock: "l3-3",
        codexRef: "sharding",
        hint: "Ключ, за яким рядки розкладаються по вузлах. Поганий ключ звалює весь трафік на одну партицію.",
      },
      hashing: hashingKnob,
    },
    cost: ({ cfg }) => 180 * cfg.instances,
    hints: {
      over: "Найгарячіший вузол NoSQL не встигає. Перевірте partition key і кількість вузлів.",
      down: "Частина ключів недоступна: їхні репліки на впалих вузлах.",
    },
  },

  lb: {
    id: "lb",
    label: "Load balancer",
    short: "LB",
    category: "edge",
    unlock: "l2-1",
    managed: true,
    router: true,
    blurb: "Розподіляє запити між інстансами й прибирає з ротації ті, що не проходять health check. Керований сервіс — сам розкладений по AZ.",
    codexRef: "load-balancer",
    cap: 100_000,
    baseMs: 1,
    availability: 0.9999,
    roles: ALL_PASS,
    connectsTo: ["app", "server", "gateway", "ratelimiter", "wsgateway"],
    knobs: { drRegion: drKnob },
    cost: ({ cfg }) => 25 * dr(cfg),
    hints: { over: "Навіть керований балансувальник має межу — розділіть трафік.", down: "Балансувальник недоступний." },
  },

  cache: {
    id: "cache",
    label: "Кеш (Redis)",
    short: "RDS",
    category: "data",
    unlock: "l2-2",
    clustered: true,
    blurb: "Гарячі дані в RAM, відповідь за ~1 мс. Знімає читання з бази — поки кеш теплий і достатньо великий.",
    codexRef: "caching",
    cap: 25_000,
    baseMs: 1,
    availability: 0.999,
    roles: { read: "absorb", write: "pass", query: "pass", abuse: "absorb" },
    connectsTo: ["sql", "nosql"],
    knobs: {
      instances: instancesKnob({ label: "Шарди", max: 12, unlock: "l2-2" }),
      sizeGb: {
        type: "select",
        label: "RAM на шард, ГБ",
        options: [1, 2, 4, 8, 16, 32, 64],
        default: 4,
        unlock: "l2-2",
        codexRef: "caching",
        hint: "Якщо гарячий набір даних не влазить у пам'ять, частина читань промахується й іде в базу.",
      },
      ttlSec: {
        type: "select",
        label: "TTL",
        options: [10, 30, 60, 300, 3600],
        default: 300,
        unlock: "l2-2",
        codexRef: "cache-invalidation",
        hint: "Довгий TTL — більше влучань, але дані можуть бути застарілими рівно на стільки.",
      },
      coalescing: {
        type: "toggle",
        label: "Request coalescing",
        default: false,
        unlock: "l2-2",
        codexRef: "cache-invalidation",
        hint: "Коли ключа нема в кеші, в базу йде один запит замість тисячі одночасних (захист від cache stampede).",
      },
      hashing: hashingKnob,
      zones: zonesKnob,
      drRegion: drKnob,
    },
    cost: ({ cfg }) => cfg.instances * (15 + 5 * cfg.sizeGb) * dr(cfg),
    hints: {
      over: "Шард кешу не встигає — найчастіше через hot key: один ключ б'є в один шард, скільки б їх не було.",
      down: "Кеш недоступний — усі читання летять у базу.",
      cold: "Кеш холодний: після рестарту чи решардингу ключів ще нема, і промахи летять у базу.",
    },
  },

  cdn: {
    id: "cdn",
    label: "CDN",
    short: "CDN",
    category: "edge",
    unlock: "l2-3",
    managed: true,
    edge: true,
    blurb: "Мережа edge-серверів біля користувачів. Віддає статику з кешу за ~10 мс, а в origin іде лише за промахами.",
    codexRef: "cdn",
    cap: Infinity,
    baseMs: 2,
    availability: 0.99999,
    roles: { static: "absorb" },
    connectsTo: ["objstore", "lb", "app", "server", "gateway"],
    knobs: {
      ttlSec: {
        type: "select",
        label: "TTL на edge",
        options: [60, 3600, 86400],
        default: 3600,
        unlock: "l2-3",
        codexRef: "cdn",
        hint: "Для незмінних файлів (версійовані URL) TTL може бути добою й більше — hit ratio росте.",
      },
    },
    // Egress CDN дешевший за egress origin лише на великих обсягах — у грі обсяги саме такі.
    cost: ({ load, level }) => 20 + gbPerMonth(load.static ?? 0, level) * 0.02,
    hints: { down: "CDN недоступна." },
  },

  objstore: {
    id: "objstore",
    label: "Об'єктне сховище (S3)",
    short: "S3",
    category: "data",
    unlock: "l2-3",
    managed: true,
    blurb: "Файли за ключем: фото, відео, бекапи. Практично безмежна ємність і 11 дев'яток durability, але ~30 мс на запит.",
    codexRef: "object-storage",
    cap: Infinity,
    baseMs: 30,
    availability: 0.9999,
    roles: { static: "serve" },
    connectsTo: [],
    knobs: {},
    cost: ({ load, level }) => (level.data?.totalGb ?? 100) * 0.023 + gbPerMonth(load.static ?? 0, level) * 0.09,
    hints: { down: "Об'єктне сховище недоступне." },
  },

  gateway: {
    id: "gateway",
    label: "API gateway",
    short: "API",
    category: "edge",
    unlock: "l4-1",
    router: true,
    clustered: true,
    blurb: "Єдина точка входу для API: автентифікація, маршрутизація, ліміти на клієнта.",
    codexRef: "api-gateway",
    cap: 20_000,
    baseMs: 3,
    availability: 0.9995,
    roles: ALL_PASS,
    connectsTo: ["app", "lb", "wsgateway"],
    knobs: {
      instances: instancesKnob({ max: 8, unlock: "l4-1" }),
      rateLimit: {
        type: "select",
        label: "Ліміт на клієнта, req/s",
        options: [0, 10, 20, 50, 100, 500],
        labels: { 0: "вимкнено" },
        default: 0,
        unlock: "l4-1",
        codexRef: "rate-limiting",
        hint: "Вбудований token bucket із запасом на сплеск ×5.",
      },
      zones: zonesKnob,
      drRegion: drKnob,
    },
    cost: ({ cfg }) => 60 * cfg.instances * dr(cfg),
    hints: { over: "Gateway не встигає — додайте інстанси.", down: "Gateway недоступний." },
  },

  ratelimiter: {
    id: "ratelimiter",
    label: "Rate limiter",
    short: "LIM",
    category: "edge",
    unlock: "l4-1",
    router: true,
    clustered: true,
    blurb: "Рахує запити кожного клієнта й відповідає 429 тим, хто перевищив ліміт, — до того, як вони дійдуть до дорогих вузлів.",
    codexRef: "rate-limiting",
    cap: 50_000,
    baseMs: 1,
    availability: 0.9995,
    roles: { read: "limit", write: "limit", static: "limit", query: "limit", conn: "limit", abuse: "limit" },
    connectsTo: ["lb", "app", "gateway", "server", "wsgateway"],
    knobs: {
      algorithm: {
        type: "select",
        label: "Алгоритм",
        options: ["fixed", "sliding", "token"],
        labels: { fixed: "Fixed window", sliding: "Sliding window", token: "Token bucket" },
        default: "fixed",
        unlock: "l4-1",
        codexRef: "rate-limiting",
        hint: "Fixed window на межі вікон пропускає до 2× ліміту; token bucket дозволяє короткі сплески в межах запасу.",
      },
      limit: {
        type: "select",
        label: "Ліміт на клієнта, req/s",
        options: [5, 10, 20, 50, 100, 500],
        default: 100,
        unlock: "l4-1",
        codexRef: "rate-limiting",
        hint: "Нижче за піки звичайних клієнтів — false positives, вище за атаку — ліміту наче й нема.",
      },
      burst: {
        type: "select",
        label: "Запас на сплеск",
        options: [1, 2, 5, 10],
        labels: { 1: "×1", 2: "×2", 5: "×5", 10: "×10" },
        default: 1,
        unlock: "l4-1",
        codexRef: "rate-limiting",
        when: (_level, cfg) => cfg.algorithm === "token",
        hint: "Місткість відра в секундах ліміту. Дозволяє коротку зливу, не підвищуючи середнього ліміту.",
      },
      instances: instancesKnob({ max: 4, unlock: "l4-1" }),
      zones: zonesKnob,
      drRegion: drKnob,
    },
    cost: ({ cfg }) => 30 * cfg.instances * dr(cfg),
    hints: { over: "Лімітер сам став вузьким місцем — додайте інстанси.", down: "Лімітер недоступний." },
  },

  queue: {
    id: "queue",
    label: "Черга повідомлень",
    short: "MQ",
    category: "async",
    unlock: "l4-2",
    clustered: true,
    blurb: "Приймає запис миттєво, а обробку віддає воркерам у їхньому темпі. Сплеск перетворюється на чергу, а не на помилки.",
    codexRef: "message-queues",
    cap: 20_000,
    baseMs: 3,
    availability: 0.9995,
    roles: { write: "async" },
    connectsTo: ["worker"],
    knobs: {
      instances: instancesKnob({ label: "Партиції", max: 32, def: 2, unlock: "l4-2", hint: "Партиції ділять пропускну здатність і дозволяють паралельних споживачів." }),
      maxDepth: {
        type: "select",
        label: "Максимальна глибина",
        options: [10_000, 100_000, 1_000_000, 10_000_000],
        labels: { 10000: "10 тис", 100000: "100 тис", 1000000: "1 млн", 10000000: "10 млн" },
        default: 100_000,
        unlock: "l4-2",
        codexRef: "backpressure",
        hint: "Коли черга заповнена, нові повідомлення відкидаються — це backpressure, а не баг.",
      },
      mode: {
        type: "select",
        label: "Режим",
        options: ["queue", "pubsub"],
        labels: { queue: "Черга (воркери)", pubsub: "Pub/sub (доставка підписникам)" },
        default: "queue",
        unlock: "l5-3",
        codexRef: "message-queues",
        hint: "Pub/sub розсилає кожне повідомлення всім підписникам — так WS-вузли дізнаються про нові повідомлення.",
      },
    },
    cost: ({ cfg }) => 30 + 8 * cfg.instances,
    hints: {
      over: "Черга не встигає приймати — додайте партиції.",
      full: "Черга заповнена до краю: нові повідомлення відкидаються.",
      lag: "Воркери не встигають розібрати чергу — росте затримка обробки.",
    },
  },

  worker: {
    id: "worker",
    label: "Воркери",
    short: "WRK",
    category: "async",
    unlock: "l4-2",
    clustered: true,
    fanout: true,
    blurb: "Фонові обробники повідомлень з черги. Їхня кількість — це ручка backpressure: скільки тиску дійде до бази.",
    codexRef: "backpressure",
    cap: 300,
    baseMs: 20,
    availability: 0.995,
    roles: { write: "pass" },
    connectsTo: ["sql", "nosql", "cache", "objstore", "external"],
    knobs: {
      instances: instancesKnob({ max: 40, unlock: "l4-2" }),
      autoscale: autoscaleKnob,
      maxInstances: maxInstancesKnob,
      idempotent: {
        type: "toggle",
        label: "Ідемпотентна обробка",
        default: false,
        unlock: "l4-2",
        codexRef: "idempotency",
        hint: "Черги гарантують at-least-once: те саме повідомлення може прийти двічі. Idempotency key рятує від подвійного списання.",
      },
      zones: zonesKnob,
      drRegion: drKnob,
    },
    cost: ({ cfg, avgInstances }) => 60 * (avgInstances ?? cfg.instances) * dr(cfg),
    hints: { over: "Воркери не встигають — черга росте.", down: "Воркери недоступні — черга лише накопичується." },
  },

  external: {
    id: "external",
    label: "Зовнішній сервіс",
    short: "EXT",
    category: "external",
    fixed: true,
    blurb: "Чужий API, який ви не контролюєте: його латентність і відмови — ваш ризик.",
    codexRef: "circuit-breaker",
    cap: 500,
    baseMs: 250,
    availability: 0.999,
    roles: { write: "serve" },
    connectsTo: [],
    knobs: {},
    cost: () => 0,
    hints: {
      over: "Зовнішній сервіс відповідає 429: ви перевищили його ліміт (часто — власними retry).",
      slow: "Зовнішній сервіс відповідає повільно — без таймаутів ваші потоки чекають разом із ним.",
      down: "Зовнішній сервіс лежить.",
    },
  },

  wsgateway: {
    id: "wsgateway",
    label: "WebSocket gateway",
    short: "WS",
    category: "compute",
    unlock: "l5-3",
    clustered: true,
    fanout: true,
    blurb: "Тримає постійні з'єднання з клієнтами й доставляє повідомлення в реальному часі.",
    codexRef: "realtime",
    cap: 20_000,
    conns: 50_000,
    // TLS-handshake і автентифікація — найдорожча частина з'єднання.
    handshakes: 500,
    baseMs: 2,
    availability: 0.995,
    roles: { conn: "serve", write: "pass", read: "pass" },
    connectsTo: ["app", "queue", "cache"],
    knobs: {
      instances: instancesKnob({ max: 20, unlock: "l5-3" }),
      reconnectJitter: {
        type: "toggle",
        label: "Reconnect з backoff і jitter",
        default: false,
        unlock: "l5-3",
        codexRef: "retries-backoff",
        hint: "Без jitter усі відключені клієнти перепідключаються в ту саму секунду — reconnect storm.",
      },
      zones: zonesKnob,
      drRegion: drKnob,
    },
    cost: ({ cfg }) => 90 * cfg.instances * dr(cfg),
    hints: {
      over: "WS-вузли не встигають: або з'єднань більше, ніж вони тримають, або шторм перепідключень.",
      down: "WS-вузол упав — його клієнти відключені й одночасно перепідключаються.",
    },
  },
};

/** Порядок у палітрі: від входу до даних, як читається схема зліва направо. */
export const PALETTE_ORDER = [
  "dns",
  "cdn",
  "lb",
  "gateway",
  "ratelimiter",
  "server",
  "app",
  "wsgateway",
  "cache",
  "sql",
  "nosql",
  "objstore",
  "queue",
  "worker",
];

export const COMPONENT_CATEGORIES = [
  { id: "edge", label: "Вхід" },
  { id: "compute", label: "Обчислення" },
  { id: "data", label: "Дані" },
  { id: "async", label: "Асинхронне" },
  { id: "external", label: "Зовнішнє" },
];

/**
 * Налаштування зв'язку. Таймаути, retry й circuit breaker — властивість
 * клієнта, що викликає, тому живуть на ребрі, а не на вузлі.
 */
export const EDGE_KNOBS = {
  timeoutMs: {
    type: "select",
    label: "Таймаут",
    options: [200, 500, 1000, 3000, 10_000, 30_000],
    labels: { 200: "200 мс", 500: "500 мс", 1000: "1 с", 3000: "3 с", 10000: "10 с", 30000: "30 с" },
    default: 30_000,
    unlock: "l4-3",
    codexRef: "retries-backoff",
    hint: "Скільки чекати відповіді. Довгий таймаут тримає потоки зайнятими, поки залежність повільна.",
  },
  retries: {
    type: "int",
    label: "Повтори (retry)",
    min: 0,
    max: 3,
    default: 0,
    unlock: "l4-3",
    codexRef: "retries-backoff",
    hint: "Повтор рятує від випадкової помилки, але множить навантаження на того, хто вже перевантажений.",
  },
  backoff: {
    type: "toggle",
    label: "Exponential backoff + jitter",
    default: false,
    unlock: "l4-3",
    codexRef: "retries-backoff",
    when: (_level, policy) => policy.retries > 0,
    hint: "Повтори розносяться в часі й не б'ють залежність одночасно.",
  },
  breaker: {
    type: "toggle",
    label: "Circuit breaker",
    default: false,
    unlock: "l4-3",
    codexRef: "circuit-breaker",
    hint: "Коли залежність сиплеться помилками, breaker перестає її кликати і відповідає одразу.",
  },
  fallback: {
    type: "select",
    label: "Fallback",
    options: ["none", "degrade"],
    labels: { none: "Немає", degrade: "Прийняти й обробити пізніше" },
    default: "none",
    unlock: "l4-3",
    codexRef: "circuit-breaker",
    onlyTo: ["external"],
    hint: "Graceful degradation: замовлення приймається, а оплата проводиться, коли провайдер оживе.",
  },
};

/** Ролі компонента щодо класу; атака маршрутизується так само, як читання. */
export function roleOf(def, cls) {
  const role = def.roles?.[cls];
  if (role) return role;
  if (cls === "abuse") return def.roles?.read ?? null;
  return null;
}

/** Робота на один запит класу `cls` в одиницях «простого читання». */
export function workOf(def, cls, cfg, level) {
  if (typeof def.work === "function") return def.work(cls, cfg, level);
  if (def.work && def.work[cls] != null) return def.work[cls];
  return 1;
}

/** Базова латентність обробки класу, мс. */
export function baseMsOf(def, cls) {
  if (typeof def.baseMs === "number") return def.baseMs;
  return def.baseMs?.[cls] ?? def.baseMs?.read ?? 1;
}

/** Опції й підписи налаштування (вони бувають залежні від рівня). */
export function knobOptions(knob, level) {
  return typeof knob.options === "function" ? knob.options(level) : knob.options;
}

export function knobDefault(knob, level) {
  return typeof knob.default === "function" ? knob.default(level) : knob.default;
}

export function knobLabel(knob, value, level) {
  const labels = typeof knob.labels === "function" ? knob.labels(level) : knob.labels;
  return labels?.[value] ?? String(value);
}

/** Трафік (req/s) у ГБ на місяць для статики з розміром level.data.staticKb. */
export function gbPerMonth(rps, level) {
  const kb = level.data?.staticKb ?? 100;
  return (rps * kb * 2_592_000) / 1_000_000;
}
