/** Задачі JS-пісочниці акту «Мережа та HTTP» (рівні й фаза боса). */

// ─────────────────────────── спільні хелпери тестів ───────────────────────────

const APP = "https://app.shop.ua";
const ADMIN = "https://admin.shop.ua";
const EVIL = "https://evil.example";

/** Проганяє CORS-middleware на одному запиті й повертає і результат middleware, і відповідь. */
async function throughCors(mod, http, options, { method = "GET", headers = {} } = {}) {
  const req = http.createRequest({ method, url: "/api/orders", headers });
  const res = http.createResponse();
  const out = await http.runMiddleware(mod.cors(options), req, res, { timeoutMs: 100 });
  return { ...res.result(), next: out.next, hung: out.hung };
}

const lower = (value) => String(value ?? "").toLowerCase();
const listHas = (header, item) =>
  lower(header)
    .split(",")
    .map((part) => part.trim())
    .includes(item.toLowerCase());

async function cached(mod, http, data, { headers = {}, maxAge } = {}) {
  const req = http.createRequest({ method: "GET", url: "/api/cart", headers });
  const res = http.createResponse();
  await mod.sendCached(req, res, data, maxAge === undefined ? undefined : { maxAge });
  return res.result();
}

/** Фейковий платіжний хендлер: рахує виклики, за бажанням «думає» і падає. */
function payments({ delayMs = 0, failFirst = 0 } = {}) {
  const calls = [];
  const handler = async (req) => {
    calls.push(req.body);
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (calls.length <= failFirst) throw new Error("card processor timeout");
    return { status: 201, body: { id: `pay_${calls.length}`, amount: req.body.amount } };
  };
  return { calls, handler };
}

async function pay(mod, http, redis, handler, { key, body = { amount: 420, card: "tok_visa" } } = {}) {
  const headers = key ? { "Idempotency-Key": key } : {};
  const req = http.createRequest({ method: "POST", url: "/payments", headers, body });
  const res = http.createResponse();
  await mod.idempotent(redis, handler)(req, res);
  return res.result();
}

/** Запускає проміс під фейковим годинником і повертає { value } або { error }. */
async function drive(clock, promise) {
  const settled = Promise.resolve(promise).then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await clock.runAll();
  return settled;
}

/** Фейковий upstream: віддає відповіді по черзі й записує, коли його смикали. */
function upstream(clock, script) {
  const times = [];
  const fn = async () => {
    times.push(clock.now());
    const step = script[Math.min(times.length - 1, script.length - 1)];
    if (step instanceof Error) throw step;
    return typeof step === "number" ? { status: step, headers: {} } : step;
  };
  return { fn, times };
}

// ─────────────────────────── задачі ───────────────────────────

export const CODE = {
  "net-cors": {
    title: "CORS middleware",
    brief:
      "Напишіть `cors({ origins, credentials = false, maxAge = 600, exposeHeaders = [] })` — фабрику middleware `(req, res, next)`.\n\n" +
      "• Preflight — це `OPTIONS` з `Origin` і `Access-Control-Request-Method`. Для дозволеного origin: 204, `Access-Control-Allow-Origin` (точно цей origin), `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers` (дзеркало `Access-Control-Request-Headers`), `Access-Control-Max-Age`, `Vary: Origin`. next() не викликати.\n" +
      "• Звичайний запит із дозволеним Origin: `Access-Control-Allow-Origin`, `Vary: Origin`, далі next().\n" +
      "• `credentials: true` → `Access-Control-Allow-Credentials: true`. Тоді «*» в Allow-Origin заборонено — браузер відкине відповідь.\n" +
      "• Origin не зі списку: жодних CORS-заголовків. Preflight завершити без них (браузер сам заблокує запит), звичайний запит — пропустити в next().\n" +
      "• Немає Origin (curl, сервер-сервер) → просто next().\n\n" +
      "Заголовки запиту в `req.headers` — у нижньому регістрі, як у node:http.",
    exports: ["cors"],
    starter: [
      "function cors({ origins = [], credentials = false, maxAge = 600, exposeHeaders = [] } = {}) {",
      "  return (req, res, next) => {",
      "    // req.headers.origin, req.headers[\"access-control-request-method\"]",
      "    // res.setHeader(name, value); res.statusCode = 204; res.end()",
      "    next();",
      "  };",
      "}",
      "",
    ].join("\n"),
    reference: [
      'const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];',
      "",
      "/** Додає поле у Vary, не затираючи те, що там уже є. */",
      "function appendVary(res, field) {",
      "  const current = res.getHeader(\"Vary\");",
      "  const list = current ? String(current).split(\",\").map((part) => part.trim()).filter(Boolean) : [];",
      "  if (!list.some((part) => part.toLowerCase() === field.toLowerCase())) list.push(field);",
      "  res.setHeader(\"Vary\", list.join(\", \"));",
      "}",
      "",
      "function cors({ origins = [], credentials = false, maxAge = 600, exposeHeaders = [], methods = METHODS } = {}) {",
      "  const allowed = new Set(origins);",
      "  return (req, res, next) => {",
      "    const origin = req.headers.origin;",
      "    if (!origin) return next();",
      "",
      "    // Відповідь тепер залежить від Origin — кеші (CDN, браузер) мусять це знати.",
      '    appendVary(res, "Origin");',
      '    const preflight = req.method === "OPTIONS" && req.headers["access-control-request-method"] !== undefined;',
      "",
      "    if (!allowed.has(origin)) {",
      "      // Жодних CORS-заголовків: браузер сам не віддасть відповідь сторінці.",
      "      // Але це не авторизація — curl і сервери CORS не перевіряють.",
      "      if (preflight) {",
      "        res.statusCode = 204;",
      "        return res.end();",
      "      }",
      "      return next();",
      "    }",
      "",
      '    res.setHeader("Access-Control-Allow-Origin", origin);',
      '    if (credentials) res.setHeader("Access-Control-Allow-Credentials", "true");',
      "",
      "    if (preflight) {",
      '      res.setHeader("Access-Control-Allow-Methods", methods.join(", "));',
      '      const requested = req.headers["access-control-request-headers"];',
      "      if (requested) {",
      '        res.setHeader("Access-Control-Allow-Headers", requested);',
      '        appendVary(res, "Access-Control-Request-Headers");',
      "      }",
      '      res.setHeader("Access-Control-Max-Age", String(maxAge));',
      "      res.statusCode = 204;",
      "      return res.end();",
      "    }",
      "",
      '    if (exposeHeaders.length) res.setHeader("Access-Control-Expose-Headers", exposeHeaders.join(", "));',
      "    next();",
      "  };",
      "}",
      "",
    ].join("\n"),
    naive: [
      "// «Дозволимо той origin, що прийшов» — працює з будь-якого фронтенду.",
      "function cors({ credentials = false, maxAge = 600 } = {}) {",
      "  return (req, res, next) => {",
      "    const origin = req.headers.origin;",
      "    if (origin) {",
      '      res.setHeader("Access-Control-Allow-Origin", origin);',
      '      if (credentials) res.setHeader("Access-Control-Allow-Credentials", "true");',
      "    }",
      '    if (req.method === "OPTIONS") {',
      '      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE");',
      '      res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "");',
      '      res.setHeader("Access-Control-Max-Age", String(maxAge));',
      "      res.statusCode = 204;",
      "      return res.end();",
      "    }",
      "    next();",
      "  };",
      "}",
      "",
    ].join("\n"),
    tests: [
      {
        name: "preflight із дозволеного origin → 204 з усіма Access-Control-* і без next()",
        run: async ({ mod, http, assert }) => {
          const r = await throughCors(mod, http, { origins: [APP, ADMIN], credentials: true, maxAge: 600 }, {
            method: "OPTIONS",
            headers: { Origin: APP, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type, authorization" },
          });
          assert.equal(r.next, false, "preflight — відповідь самого middleware, до хендлера він не доходить");
          assert.equal(r.status, 204, "статус preflight");
          assert.equal(r.headers["access-control-allow-origin"], APP, "Allow-Origin");
          assert.ok(listHas(r.headers["access-control-allow-methods"], "PUT"), "Allow-Methods має містити запитаний метод PUT");
          const allowHeaders = r.headers["access-control-allow-headers"];
          assert.ok(listHas(allowHeaders, "content-type") && listHas(allowHeaders, "authorization"), "Allow-Headers має дозволити content-type і authorization");
          assert.equal(String(r.headers["access-control-max-age"]), "600", "Max-Age");
          assert.ok(listHas(r.headers.vary, "origin"), "Vary: Origin — інакше CDN віддасть відповідь для одного origin іншому");
        },
      },
      {
        name: "credentials: Allow-Origin — точний origin (не «*») і Allow-Credentials: true",
        run: async ({ mod, http, assert }) => {
          const r = await throughCors(mod, http, { origins: [APP, ADMIN], credentials: true }, { headers: { Origin: ADMIN, Cookie: "sid=abc" } });
          assert.equal(r.next, true, "звичайний запит має дійти до хендлера");
          assert.equal(r.headers["access-control-allow-origin"], ADMIN, "з credentials браузер приймає лише точний origin");
          assert.equal(String(r.headers["access-control-allow-credentials"]), "true", "Allow-Credentials");
          assert.ok(listHas(r.headers.vary, "origin"), "Vary: Origin");
        },
      },
      {
        name: "чужий origin: жодних CORS-заголовків, але GET усе одно доходить до хендлера",
        run: async ({ mod, http, assert }) => {
          const r = await throughCors(mod, http, { origins: [APP], credentials: true }, { headers: { Origin: EVIL } });
          assert.equal(r.headers["access-control-allow-origin"], undefined, "evil.example не має отримати Allow-Origin — інакше він читатиме дані користувача");
          assert.equal(r.headers["access-control-allow-credentials"], undefined, "і Allow-Credentials теж");
          assert.equal(r.next, true, "CORS не авторизація: запит доходить до сервера, браузер лише ховає відповідь від сторінки");
        },
      },
      {
        name: "preflight із чужого origin завершується без Allow-Origin і не доходить до хендлера",
        run: async ({ mod, http, assert }) => {
          const r = await throughCors(mod, http, { origins: [APP], credentials: true }, {
            method: "OPTIONS",
            headers: { Origin: EVIL, "Access-Control-Request-Method": "DELETE" },
          });
          assert.equal(r.headers["access-control-allow-origin"], undefined, "Allow-Origin для чужого origin");
          assert.equal(r.next, false, "preflight не повинен потрапляти в роутер");
          assert.equal(r.hung, false, "запит не повинен зависнути — відповідь треба завершити");
        },
      },
      {
        name: "без Origin (curl, сервер-сервер) — просто next() без CORS-заголовків",
        run: async ({ mod, http, assert }) => {
          const r = await throughCors(mod, http, { origins: [APP], credentials: true }, { headers: { "User-Agent": "curl/8.5.0" } });
          assert.equal(r.next, true, "next()");
          assert.equal(r.headers["access-control-allow-origin"], undefined, "без Origin CORS-заголовки не потрібні");
        },
      },
    ],
    bonusTests: [
      {
        name: "exposeHeaders: JS бачить ETag і X-Request-Id лише після Access-Control-Expose-Headers",
        run: async ({ mod, http, assert }) => {
          const r = await throughCors(mod, http, { origins: [APP], exposeHeaders: ["ETag", "X-Request-Id"] }, { headers: { Origin: APP } });
          const exposed = r.headers["access-control-expose-headers"];
          assert.ok(listHas(exposed, "etag") && listHas(exposed, "x-request-id"), "Access-Control-Expose-Headers");
          assert.equal(r.headers["access-control-allow-credentials"], undefined, "credentials не ввімкнено — Allow-Credentials не потрібен");
        },
      },
      {
        name: "OPTIONS без Access-Control-Request-Method — не preflight, а звичайний запит: next()",
        run: async ({ mod, http, assert }) => {
          const r = await throughCors(mod, http, { origins: [APP] }, { method: "OPTIONS", headers: { Origin: APP } });
          assert.equal(r.next, true, "звичайний OPTIONS має дійти до хендлера (наприклад, щоб віддати Allow)");
          assert.equal(r.headers["access-control-allow-origin"], APP, "Allow-Origin");
        },
      },
    ],
  },

  "net-caching": {
    title: "Умовний GET: ETag і 304",
    brief:
      "Напишіть `sendCached(req, res, data, { maxAge = 60 })` — віддає `data` як JSON і вміє умовний GET.\n\n" +
      "• Content-Type: application/json.\n" +
      "• `ETag` — сильний (`\"…\"`) і обчислений із вмісту: ті самі дані → той самий ETag, будь-яка зміна → інший. Buffer і crypto немає — візьміть простий хеш, напр. FNV-1a (32 біти, `Math.imul`).\n" +
      "• `Cache-Control: private, max-age=<maxAge>`; якщо `maxAge` дорівнює 0 — `private, no-cache` (зберігати можна, але щоразу перепитувати сервер).\n" +
      "• `If-None-Match` збігається з поточним ETag → 304 без тіла, але з тими самими `ETag` і `Cache-Control`.\n" +
      "• `If-None-Match` буває списком: `\"a1\", \"b2\"`.\n" +
      "• Не збігається → 200 з повним тілом.",
    exports: ["sendCached"],
    starter: [
      "function sendCached(req, res, data, { maxAge = 60 } = {}) {",
      "  const body = JSON.stringify(data);",
      '  res.setHeader("Content-Type", "application/json");',
      "  res.end(body);",
      "}",
      "",
    ].join("\n"),
    reference: [
      "/** FNV-1a, 32 біти: швидкий некриптографічний хеш по байтах UTF-8. */",
      "function fnv1a(text) {",
      "  let hash = 0x811c9dc5;",
      "  for (const byte of new TextEncoder().encode(text)) {",
      "    hash ^= byte;",
      "    hash = Math.imul(hash, 0x01000193) >>> 0;",
      "  }",
      '  return hash.toString(16).padStart(8, "0");',
      "}",
      "",
      "/** If-None-Match порівнює слабко (RFC 9110): W/\"x\" і \"x\" — той самий тег. */",
      "function matches(header, etag) {",
      "  if (!header) return false;",
      '  if (header.trim() === "*") return true;',
      '  const opaque = (tag) => tag.replace(/^W\\//, "");',
      "  const tags = header.match(/(?:W\\/)?\"[^\"]*\"/g) ?? [];",
      "  return tags.some((tag) => opaque(tag) === opaque(etag));",
      "}",
      "",
      "function sendCached(req, res, data, { maxAge = 60 } = {}) {",
      "  const body = JSON.stringify(data);",
      "  // Довжина + хеш, як у Express: колізія мусить збігтися і за довжиною.",
      "  const etag = `\"${body.length.toString(16)}-${fnv1a(body)}\"`;",
      '  res.setHeader("ETag", etag);',
      '  res.setHeader("Cache-Control", maxAge > 0 ? `private, max-age=${maxAge}` : "private, no-cache");',
      "",
      '  if (matches(req.headers["if-none-match"], etag)) {',
      "    res.statusCode = 304; // у клієнта вже є ці байти — тіло не шлемо",
      "    return res.end();",
      "  }",
      '  res.setHeader("Content-Type", "application/json; charset=utf-8");',
      "  res.statusCode = 200;",
      "  res.end(body);",
      "}",
      "",
    ].join("\n"),
    naive: [
      "function sendCached(req, res, data, { maxAge = 60 } = {}) {",
      "  const body = JSON.stringify(data);",
      "  const etag = `\"${body.length}\"`; // дешево і «майже унікально»",
      '  res.setHeader("Content-Type", "application/json");',
      '  res.setHeader("Cache-Control", `private, max-age=${maxAge}`);',
      '  res.setHeader("ETag", etag);',
      '  if (req.headers["if-none-match"] === etag) {',
      "    res.statusCode = 304;",
      "    return res.end();",
      "  }",
      "  res.end(body);",
      "}",
      "",
    ].join("\n"),
    tests: [
      {
        name: "200: JSON-тіло, сильний ETag і Cache-Control: private, max-age",
        run: async ({ mod, http, assert }) => {
          const r = await cached(mod, http, { items: [{ sku: "A-1", qty: 2 }], total: 420 });
          assert.equal(r.status, 200, "статус");
          assert.ok(lower(r.headers["content-type"]).includes("application/json"), "Content-Type");
          assert.deepEqual(r.json, { items: [{ sku: "A-1", qty: 2 }], total: 420 }, "тіло");
          assert.ok(/^"[^"]+"$/.test(String(r.headers.etag ?? "")), `ETag має бути сильним тегом у лапках, а він ${r.headers.etag}`);
          const cc = lower(r.headers["cache-control"]);
          assert.ok(cc.includes("private") && cc.includes("max-age=60"), `Cache-Control: ${r.headers["cache-control"]}`);
        },
      },
      {
        name: "ETag залежить лише від вмісту: ті самі дані — той самий тег, інші дані тієї ж довжини — інший",
        run: async ({ mod, http, assert }) => {
          const a = await cached(mod, http, { id: 1, total: 420 });
          const again = await cached(mod, http, { id: 1, total: 420 });
          const b = await cached(mod, http, { id: 1, total: 421 });
          const c = await cached(mod, http, { id: 2, total: 420 });
          assert.equal(again.headers.etag, a.headers.etag, "той самий вміст мусить давати той самий ETag — інакше 304 не буде ніколи");
          assert.notEqual(b.headers.etag, a.headers.etag, "total змінився, довжина та сама — ETag мусить змінитися, інакше клієнт залишиться зі старими даними");
          assert.notEqual(c.headers.etag, a.headers.etag, "id змінився — ETag мусить змінитися");
        },
      },
      {
        name: "If-None-Match з актуальним ETag → 304 без тіла, але з ETag і Cache-Control",
        run: async ({ mod, http, assert }) => {
          const data = { items: [], total: 0 };
          const first = await cached(mod, http, data);
          const r = await cached(mod, http, data, { headers: { "If-None-Match": first.headers.etag } });
          assert.equal(r.status, 304, "статус");
          assert.equal(r.body, "", "304 не має тіла — у цьому весь сенс");
          assert.equal(r.headers.etag, first.headers.etag, "304 мусить нести той самий ETag");
          assert.ok(lower(r.headers["cache-control"]).includes("max-age"), "304 оновлює свіжість у кеші — Cache-Control потрібен і тут");
        },
      },
      {
        name: "дані змінились → старий ETag не збігається, 200 з новим тілом",
        run: async ({ mod, http, assert }) => {
          const old = await cached(mod, http, { total: 100 });
          const r = await cached(mod, http, { total: 250 }, { headers: { "If-None-Match": old.headers.etag } });
          assert.equal(r.status, 200, "статус");
          assert.deepEqual(r.json, { total: 250 }, "тіло");
          assert.notEqual(r.headers.etag, old.headers.etag, "новий ETag");
        },
      },
      {
        name: "If-None-Match зі списком ETag-ів → 304, якщо поточний є серед них",
        run: async ({ mod, http, assert }) => {
          const data = { total: 42 };
          const first = await cached(mod, http, data);
          const r = await cached(mod, http, data, { headers: { "If-None-Match": `"deadbeef", ${first.headers.etag}` } });
          assert.equal(r.status, 304, "список розділено комами — кожен тег порівнюється окремо");
        },
      },
      {
        name: "maxAge: 0 → private, no-cache (а не no-store)",
        run: async ({ mod, http, assert }) => {
          const r = await cached(mod, http, { total: 1 }, { maxAge: 0 });
          const cc = lower(r.headers["cache-control"]);
          assert.ok(cc.includes("no-cache"), `Cache-Control: ${r.headers["cache-control"]}`);
          assert.ok(!cc.includes("no-store"), "no-store заборонить зберігати відповідь — і умовного GET не буде зовсім");
          assert.ok(/^"[^"]+"$/.test(String(r.headers.etag ?? "")), "ETag потрібен і тут: no-cache означає «перепитай», а перепитують саме з If-None-Match");
        },
      },
    ],
    bonusTests: [
      {
        name: "слабке порівняння: If-None-Match: W/\"…\" теж дає 304",
        run: async ({ mod, http, assert }) => {
          const data = { total: 7 };
          const first = await cached(mod, http, data);
          const r = await cached(mod, http, data, { headers: { "If-None-Match": `W/${first.headers.etag}` } });
          assert.equal(r.status, 304, "If-None-Match використовує слабке порівняння (RFC 9110): W/ ігнорується");
        },
      },
      {
        name: "If-None-Match: * → 304, коли ресурс існує",
        run: async ({ mod, http, assert }) => {
          const r = await cached(mod, http, { total: 7 }, { headers: { "If-None-Match": "*" } });
          assert.equal(r.status, 304, "* збігається з будь-яким поточним представленням");
        },
      },
    ],
  },

  "net-idempotency": {
    title: "Idempotency-Key для платежів",
    brief:
      "Напишіть `idempotent(redis, handler, { ttlSec = 86400, lockMs = 30000 })` → `async (req, res)` для `POST /payments`.\n\n" +
      "`await handler(req)` проводить платіж і повертає `{ status, body }`. Вважаємо його атомарним: або платіж пройшов, або кинуто помилку й нічого не списано.\n\n" +
      "• Немає заголовка `Idempotency-Key` → 400, хендлер не викликаємо.\n" +
      "• Перший запит із ключем: хендлер рівно один раз, його відповідь клієнту, а `status` + `body` — у Redis на `ttlSec`.\n" +
      "• Повтор із тим самим ключем і тим самим тілом → та сама відповідь (статус і тіло) із заголовком `Idempotent-Replayed: true`; хендлер не викликається.\n" +
      "• Той самий ключ, поки перший запит ще виконується → 409.\n" +
      "• Той самий ключ з іншим тілом → 422: ключ уже належить іншій операції.\n" +
      "• Усі відповіді — JSON.\n\n" +
      "Redis: `get`, `del`, `set(key, value, { NX: true, PX: ms })` → `\"OK\"` або `null`, якщо ключ уже існує. Кожен виклик — мережевий roundtrip: між двома вашими викликами встигає втрутитися інший запит.",
    exports: ["idempotent"],
    starter: [
      "function idempotent(redis, handler, { ttlSec = 86400, lockMs = 30000 } = {}) {",
      "  return async (req, res) => {",
      '    const key = req.headers["idempotency-key"];',
      "    const result = await handler(req);",
      "    res.statusCode = result.status;",
      '    res.setHeader("Content-Type", "application/json");',
      "    res.end(JSON.stringify(result.body));",
      "  };",
      "}",
      "",
    ].join("\n"),
    reference: [
      "function idempotent(redis, handler, { ttlSec = 86400, lockMs = 30000 } = {}) {",
      "  return async (req, res) => {",
      "    const send = (status, body, headers = {}) => {",
      "      res.statusCode = status;",
      '      res.setHeader("Content-Type", "application/json");',
      "      for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);",
      "      res.end(JSON.stringify(body));",
      "    };",
      "",
      '    const key = req.headers["idempotency-key"];',
      '    if (!key) return send(400, { error: "Потрібен заголовок Idempotency-Key" });',
      "",
      "    const slot = `idem:${key}`;",
      "    const fingerprint = JSON.stringify(req.body ?? null);",
      "",
      "    // Один атомарний SET NX: з двох одночасних запитів ключ «застовпить» рівно один.",
      "    // PX — страховка: якщо процес помре посеред платежу, ключ звільниться сам.",
      '    const claimed = await redis.set(slot, JSON.stringify({ state: "running", fingerprint }), { NX: true, PX: lockMs });',
      "",
      "    if (!claimed) {",
      "      const raw = await redis.get(slot);",
      '      if (raw === null) return send(409, { error: "Запит із цим ключем щойно завершився невдало — повторіть" });',
      "      const record = JSON.parse(raw);",
      "      if (record.fingerprint !== fingerprint) {",
      '        return send(422, { error: "Idempotency-Key уже використано з іншим тілом запиту" });',
      "      }",
      '      if (record.state === "running") return send(409, { error: "Запит із цим ключем ще виконується" });',
      '      return send(record.status, record.body, { "Idempotent-Replayed": "true" });',
      "    }",
      "",
      "    let result;",
      "    try {",
      "      result = await handler(req);",
      "    } catch {",
      "      // Хендлер атомарний: помилка = нічого не списано. Звільняємо ключ,",
      "      // щоб повтор клієнта виконався, а не бився в 409 до кінця lockMs.",
      "      await redis.del(slot);",
      '      return send(500, { error: "Платіж не проведено, спробуйте ще раз" });',
      "    }",
      "",
      "    const done = { state: \"done\", fingerprint, status: result.status, body: result.body };",
      "    await redis.set(slot, JSON.stringify(done), { EX: ttlSec });",
      "    send(result.status, result.body);",
      "  };",
      "}",
      "",
    ].join("\n"),
    naive: [
      "function idempotent(redis, handler, { ttlSec = 86400, lockMs = 30000 } = {}) {",
      "  return async (req, res) => {",
      "    const send = (status, body, headers = {}) => {",
      "      res.statusCode = status;",
      '      res.setHeader("Content-Type", "application/json");',
      "      for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);",
      "      res.end(JSON.stringify(body));",
      "    };",
      '    const key = req.headers["idempotency-key"];',
      '    if (!key) return send(400, { error: "Потрібен Idempotency-Key" });',
      "    const fingerprint = JSON.stringify(req.body ?? null);",
      "",
      "    const saved = await redis.get(`idem:${key}`);",
      "    if (saved) {",
      "      const record = JSON.parse(saved);",
      '      if (record.fingerprint !== fingerprint) return send(422, { error: "Інше тіло" });',
      '      return send(record.status, record.body, { "Idempotent-Replayed": "true" });',
      "    }",
      "    // «Блокування»: перевірили, що вільно, — і зайняли.",
      '    if (await redis.get(`lock:${key}`)) return send(409, { error: "Виконується" });',
      '    await redis.set(`lock:${key}`, "1", { PX: lockMs });',
      "",
      "    const result = await handler(req);",
      "    await redis.set(`idem:${key}`, JSON.stringify({ fingerprint, ...result }), { EX: ttlSec });",
      "    await redis.del(`lock:${key}`);",
      "    send(result.status, result.body);",
      "  };",
      "}",
      "",
    ].join("\n"),
    tests: [
      {
        name: "без Idempotency-Key → 400, платіж не проводимо",
        run: async ({ mod, http, redis, assert }) => {
          const { calls, handler } = payments();
          const r = await pay(mod, http, redis, handler, {});
          assert.equal(r.status, 400, "статус");
          assert.equal(calls.length, 0, "хендлер не мав викликатися");
        },
      },
      {
        name: "повтор із тим самим ключем повертає збережену відповідь, платіж — один",
        run: async ({ mod, http, redis, assert }) => {
          const { calls, handler } = payments();
          const first = await pay(mod, http, redis, handler, { key: "k-1" });
          const retry = await pay(mod, http, redis, handler, { key: "k-1" });
          assert.equal(first.status, 201, "перший запит");
          assert.equal(retry.status, 201, "повтор має отримати той самий статус");
          assert.deepEqual(retry.json, first.json, "повтор має отримати те саме тіло (той самий pay_id)");
          assert.equal(String(retry.headers["idempotent-replayed"]), "true", "заголовок Idempotent-Replayed: true");
          assert.equal(calls.length, 1, "картку списано двічі");
          assert.ok(redis.size() >= 1, "результат має жити в Redis: пам'ять процесу не бачать інші інстанси за балансувальником");
        },
      },
      {
        name: "два одночасні запити з одним ключем: платіж один, другий отримує 409",
        run: async ({ mod, http, redis, assert }) => {
          const { calls, handler } = payments({ delayMs: 10 });
          const results = await Promise.all([pay(mod, http, redis, handler, { key: "k-2" }), pay(mod, http, redis, handler, { key: "k-2" })]);
          assert.equal(calls.length, 1, "два конкурентні запити провели два платежі — перевірка й запис не атомарні");
          assert.deepEqual(results.map((r) => r.status).sort(), [201, 409], "статуси");
        },
      },
      {
        name: "той самий ключ з іншим тілом → 422, другий платіж не проводиться",
        run: async ({ mod, http, redis, assert }) => {
          const { calls, handler } = payments();
          await pay(mod, http, redis, handler, { key: "k-3", body: { amount: 420, card: "tok_visa" } });
          const r = await pay(mod, http, redis, handler, { key: "k-3", body: { amount: 9000, card: "tok_visa" } });
          assert.equal(r.status, 422, "статус");
          assert.equal(calls.length, 1, "хендлер не мав викликатися вдруге");
        },
      },
      {
        name: "різні ключі — різні платежі",
        run: async ({ mod, http, redis, assert }) => {
          const { calls, handler } = payments();
          const a = await pay(mod, http, redis, handler, { key: "k-a" });
          const b = await pay(mod, http, redis, handler, { key: "k-b" });
          assert.equal(calls.length, 2, "дві операції — два виклики");
          assert.notEqual(a.json?.id, b.json?.id, "різні платежі");
          assert.equal(b.headers["idempotent-replayed"], undefined, "це не повтор");
        },
      },
    ],
    bonusTests: [
      {
        name: "хендлер упав → 500 і ключ звільнено: повтор клієнта проводить платіж, а не отримує 409",
        run: async ({ mod, http, redis, assert }) => {
          const { calls, handler } = payments({ failFirst: 1 });
          const first = await pay(mod, http, redis, handler, { key: "k-5" });
          assert.equal(first.status, 500, "перша спроба");
          const retry = await pay(mod, http, redis, handler, { key: "k-5" });
          assert.equal(retry.status, 201, "повтор після збою має виконатися");
          assert.equal(calls.length, 2, "хендлер викликано вдруге");
        },
      },
    ],
  },

  "boss-http-retry": {
    title: "retryFetch без шторму",
    brief:
      "Напишіть `retryFetch(fn, { retries = 3, baseMs = 100, maxMs = 2000, method = \"GET\", idempotencyKey, random = Math.random })`.\n\n" +
      "`await fn(attempt)` робить одну спробу (attempt = 1, 2, …) і повертає `{ status, headers }` (імена заголовків у нижньому регістрі) або кидає помилку мережі.\n\n" +
      "• Повторюємо, лише якщо це безпечно: метод GET, HEAD, PUT, DELETE чи OPTIONS — або передано `idempotencyKey`. POST без ключа — рівно одна спроба.\n" +
      "• Лише тимчасові збої: статус 429, 502, 503, 504 або кинута помилка мережі. Решту (200, 400, 500…) повертаємо одразу.\n" +
      "• Не більше `retries` повторів, тобто до `retries + 1` викликів. Коли спроби скінчились — повернути останню відповідь або кинути останню помилку.\n" +
      "• Пауза перед повтором №k — full jitter: `random() * Math.min(maxMs, baseMs * 2 ** (k - 1))`.\n" +
      "• Є `retry-after` у секундах — чекати рівно стільки, без jitter: сервер знає краще.\n" +
      "• Чекати через `setTimeout` — у тестах час фейковий.",
    exports: ["retryFetch"],
    shims: ["clock"],
    starter: [
      "async function retryFetch(fn, { retries = 3, baseMs = 100, maxMs = 2000, method = \"GET\", idempotencyKey, random = Math.random } = {}) {",
      "  return fn(1);",
      "}",
      "",
    ].join("\n"),
    reference: [
      'const SAFE_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]);',
      "const TRANSIENT = new Set([429, 502, 503, 504]);",
      "const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
      "",
      "/** Retry-After: або ціле число секунд, або HTTP-дата. */",
      "function retryAfterMs(value) {",
      "  if (value == null) return null;",
      "  const text = String(value).trim();",
      "  if (/^\\d+$/.test(text)) return Number(text) * 1000;",
      "  const at = Date.parse(text);",
      "  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());",
      "}",
      "",
      "async function retryFetch(fn, { retries = 3, baseMs = 100, maxMs = 2000, method = \"GET\", idempotencyKey, random = Math.random } = {}) {",
      "  // POST без ключа повторювати не можна: перша спроба могла дійти й списати гроші.",
      "  const safe = SAFE_METHODS.has(String(method).toUpperCase()) || Boolean(idempotencyKey);",
      "",
      "  for (let attempt = 1; ; attempt += 1) {",
      "    let response;",
      "    let failure = null;",
      "    try {",
      "      response = await fn(attempt);",
      "    } catch (error) {",
      "      failure = { error };",
      "    }",
      "",
      "    const transient = failure !== null || TRANSIENT.has(response.status);",
      "    if (!transient || !safe || attempt > retries) {",
      "      if (failure) throw failure.error;",
      "      return response;",
      "    }",
      "",
      '    const hinted = failure ? null : retryAfterMs(response.headers?.["retry-after"]);',
      "    // Full jitter: клієнти, що впали одночасно, повертаються в різний час.",
      "    const backoff = random() * Math.min(maxMs, baseMs * 2 ** (attempt - 1));",
      "    await sleep(hinted ?? backoff);",
      "  }",
      "}",
      "",
    ].join("\n"),
    naive: [
      "async function retryFetch(fn, { retries = 3, baseMs = 100 } = {}) {",
      "  for (let attempt = 1; ; attempt += 1) {",
      "    try {",
      "      const response = await fn(attempt);",
      "      if (response.status < 500 || attempt > retries) return response;",
      "    } catch (error) {",
      "      if (attempt > retries) throw error;",
      "    }",
      "    // Класичний експоненційний backoff: 100, 200, 400 мс.",
      "    await new Promise((resolve) => setTimeout(resolve, baseMs * 2 ** (attempt - 1)));",
      "  }",
      "}",
      "",
    ].join("\n"),
    tests: [
      {
        name: "503 → повтори з full jitter: при random() = 0.5 паузи 50, 100, 200 мс, далі — остання відповідь",
        run: async ({ mod, clock, assert }) => {
          const { fn, times } = upstream(clock, [503]);
          const out = await drive(clock, mod.retryFetch(fn, { retries: 3, baseMs: 100, maxMs: 10_000, random: () => 0.5 }));
          assert.equal(out.error, undefined, "503 після всіх спроб — це відповідь, а не виняток");
          assert.equal(out.value?.status, 503, "повернути останню відповідь");
          assert.deepEqual(times, [0, 50, 150, 350], "моменти спроб (мс): пауза = random() × min(maxMs, baseMs × 2^(k−1))");
        },
      },
      {
        name: "успіх після двох збоїв повертає 200, зайвих спроб немає",
        run: async ({ mod, clock, assert }) => {
          const { fn, times } = upstream(clock, [502, 504, { status: 200, headers: {} }]);
          const out = await drive(clock, mod.retryFetch(fn, { random: () => 0.5 }));
          assert.equal(out.value?.status, 200, "статус");
          assert.equal(times.length, 3, "кількість спроб");
        },
      },
      {
        name: "пауза не перевищує maxMs",
        run: async ({ mod, clock, assert }) => {
          const { fn, times } = upstream(clock, [503]);
          await drive(clock, mod.retryFetch(fn, { retries: 3, baseMs: 100, maxMs: 150, random: () => 0.5 }));
          assert.deepEqual(times, [0, 50, 125, 200], "паузи 50, 75, 75: стеля min(maxMs, …) — до множення на random()");
        },
      },
      {
        name: "POST без idempotencyKey не повторюється — ні на 503, ні на обриві",
        run: async ({ mod, clock, assert }) => {
          const a = upstream(clock, [503, { status: 201, headers: {} }]);
          const out = await drive(clock, mod.retryFetch(a.fn, { method: "POST", random: () => 0.5 }));
          assert.equal(a.times.length, 1, "POST повторено: перша спроба могла вже створити замовлення");
          assert.equal(out.value?.status, 503, "віддати 503 як є");

          const b = upstream(clock, [new TypeError("fetch failed"), { status: 201, headers: {} }]);
          const failed = await drive(clock, mod.retryFetch(b.fn, { method: "POST", random: () => 0.5 }));
          assert.equal(b.times.length, 1, "обрив після відправлення POST — не привід слати його вдруге");
          assert.ok(failed.error instanceof TypeError, "помилку мережі — нагору");
        },
      },
      {
        name: "POST з idempotencyKey повторювати можна",
        run: async ({ mod, clock, assert }) => {
          const { fn, times } = upstream(clock, [503, { status: 201, headers: {} }]);
          const out = await drive(clock, mod.retryFetch(fn, { method: "POST", idempotencyKey: "order-7f3a", random: () => 0.5 }));
          assert.equal(out.value?.status, 201, "статус");
          assert.equal(times.length, 2, "кількість спроб");
        },
      },
      {
        name: "400 і 500 не повторюються: такий самий запит отримає таку саму відмову",
        run: async ({ mod, clock, assert }) => {
          for (const status of [400, 500]) {
            const { fn, times } = upstream(clock, [status, { status: 200, headers: {} }]);
            const out = await drive(clock, mod.retryFetch(fn, { random: () => 0.5 }));
            assert.equal(times.length, 1, `${status} повторено`);
            assert.equal(out.value?.status, status, "повернути як є");
          }
        },
      },
      {
        name: "429 з Retry-After: 2 → наступна спроба рівно через 2000 мс",
        run: async ({ mod, clock, assert }) => {
          const { fn, times } = upstream(clock, [{ status: 429, headers: { "retry-after": "2" } }, { status: 200, headers: {} }]);
          const out = await drive(clock, mod.retryFetch(fn, { baseMs: 100, maxMs: 1000, random: () => 0.5 }));
          assert.equal(out.value?.status, 200, "статус");
          assert.deepEqual(times, [0, 2000], "Retry-After у секундах важливіший за власний backoff");
        },
      },
      {
        name: "обрив мережі повторюється; після останньої спроби помилка летить нагору",
        run: async ({ mod, clock, assert }) => {
          const reset = new TypeError("fetch failed");
          const { fn, times } = upstream(clock, [reset]);
          const out = await drive(clock, mod.retryFetch(fn, { retries: 2, random: () => 0.5 }));
          assert.equal(out.error, reset, "кинути саме останню помилку");
          assert.equal(times.length, 3, "1 спроба + 2 повтори");
        },
      },
    ],
    bonusTests: [
      {
        name: "Retry-After у форматі HTTP-дати → чекати до цієї миті",
        run: async ({ mod, clock, assert }) => {
          const until = new Date(3000).toUTCString(); // "Thu, 01 Jan 1970 00:00:03 GMT"
          const { fn, times } = upstream(clock, [{ status: 503, headers: { "retry-after": until } }, { status: 200, headers: {} }]);
          const out = await drive(clock, mod.retryFetch(fn, { random: () => 0.5 }));
          assert.equal(out.value?.status, 200, "статус");
          assert.deepEqual(times, [0, 3000], "Retry-After може бути датою: чекати до неї за Date.now()");
        },
      },
    ],
  },
};
