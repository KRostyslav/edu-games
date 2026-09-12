/**
 * Акти кампанії — регіони мапи. Порядок масиву — порядок проходження.
 *
 * Акти з `soon: true` видно на мапі одразу: людина, що йде з фронтенду,
 * має бачити всю дорогу до Staff, а не лише найближчий поворот. `topics`
 * у них — чесний план того, що там буде, а не маркетинг.
 */

export const ACTS = [
  {
    id: "prologue",
    no: 0,
    title: "Після fetch()",
    subtitle: "Міст із React: куди насправді йде запит",
    lead: "Ви тисячу разів писали fetch(). Час подивитися, що відбувається по той бік: мережа, сервер, база — і як усе це повертається JSON-ом у ваш useEffect.",
    color: "#c9a14a",
  },
  {
    id: "runtime",
    no: 1,
    title: "Рантайм",
    subtitle: "Node.js зсередини: event loop, потоки, пам'ять",
    lead: "Той самий JavaScript, але без вкладки браузера: один потік обслуговує тисячі запитів. Хто розуміє event loop, той не блокує сервер одним JSON.parse.",
    color: "#3c873a",
    boss: "boss-runtime",
  },
  {
    id: "http",
    no: 2,
    title: "Мережа та HTTP",
    subtitle: "TCP, TLS, CORS, кешування, ідемпотентність",
    lead: "На фронті мережа — це «запит пішов, відповідь прийшла». На бекенді — це таймаути, з'єднання, повтори й заголовки, від яких залежить, чи переживе сервіс ретраї мобільного клієнта.",
    color: "#2f6f8f",
    boss: "boss-http",
  },
  {
    id: "data",
    no: 3,
    title: "Дані",
    subtitle: "Postgres: SQL, індекси, транзакції, міграції",
    lead: "Справжній Postgres прямо в браузері. Запити, плани, індекси, рівні ізоляції — і та сама різниця між «працює на моїх 10 рядках» і «лягло на 10 мільйонах».",
    color: "#7a4fb0",
    boss: "boss-data",
  },
  {
    id: "nest",
    no: 4,
    title: "NestJS і архітектура застосунку",
    subtitle: "Скоро",
    soon: true,
    color: "#b83a5a",
    topics: [
      "Модулі, провайдери й DI-контейнер — і чому це не магія",
      "Життєвий цикл запиту: middleware → guards → interceptors → pipes → handler → filters",
      "Валідація DTO, серіалізація, конфігурація",
      "Шари, hexagonal, межі модулів; тестування з TestingModule",
    ],
  },
  {
    id: "cache",
    no: 5,
    title: "Кеш",
    subtitle: "Скоро",
    soon: true,
    color: "#c05a2a",
    topics: ["Cache-aside, write-through, TTL та інвалідація", "Cache stampede і захист від нього", "Redis: структури даних, eviction", "HTTP-кеш і CDN"],
  },
  {
    id: "queues",
    no: 6,
    title: "Черги й асинхронність",
    subtitle: "Скоро",
    soon: true,
    color: "#4a7a8c",
    topics: ["At-least-once і ідемпотентні консюмери", "Transactional outbox", "Retry, DLQ, poison messages", "Саги й eventual consistency"],
  },
  {
    id: "security",
    no: 7,
    title: "Безпека",
    subtitle: "Скоро",
    soon: true,
    color: "#8c3a3a",
    topics: ["AuthN vs AuthZ, сесії vs JWT", "OAuth2 + PKCE, OIDC", "OWASP Top 10: IDOR, SSRF, ін'єкції", "Хешування паролів, секрети, rate limiting"],
  },
  {
    id: "ops",
    no: 8,
    title: "Надійність і експлуатація",
    subtitle: "Скоро",
    soon: true,
    color: "#5a6a3a",
    topics: ["Логи, метрики, трейси, OpenTelemetry", "SLI/SLO й error budget", "Graceful shutdown, health checks", "Docker, CI/CD, canary і blue-green"],
  },
  {
    id: "distributed",
    no: 9,
    title: "Розподілені системи",
    subtitle: "Скоро",
    soon: true,
    color: "#3a4a8c",
    topics: ["CAP і PACELC без міфів", "Реплікація, шардування, консистентність", "Модульний моноліт vs мікросервіси", "BFF і GraphQL для фронтенду"],
    related: "sysdesign",
  },
  {
    id: "staff",
    no: 10,
    title: "Staff",
    subtitle: "Скоро",
    soon: true,
    color: "#a08a3a",
    topics: ["RFC і ADR: рішення, які переживають авторів", "Trade-offs і їхня комунікація", "Міграції в масштабі компанії", "Вплив без формальної влади"],
  },
];

export const ACTS_BY_ID = Object.fromEntries(ACTS.map((act) => [act.id, act]));

/** Акти, для яких уже є контент. */
export const PLAYABLE_ACTS = ACTS.filter((act) => !act.soon);
