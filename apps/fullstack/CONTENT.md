# Як писати контент для «По той бік API»

Посібник для автора нового акту (чи рівня в наявному). Уся механіка вже є —
акт складається лише з даних. Зразок, на який варто рівнятися стилем і
глибиною, — пролог: `src/data/acts/prologue/`.

## Куди що класти

Кожен акт — тека `src/data/acts/<act>/`, яка нічого не знає про інші акти:

| Файл | Експорт | Що всередині |
| --- | --- | --- |
| `levels.js` | `LEVELS` | масив рівнів у порядку проходження |
| `boss.js` | `BOSS` | бос акту (у прологу — `null`) |
| `codex.js` | `CODEX` | статті довідника `{ [id]: article }` |
| `cards.js` | `CARDS` | картки стендапу, по 3 на статтю |
| `skills.js` | `SKILLS` | вузли дерева навичок |
| `code.js` | `CODE` | задачі JS-пісочниці `{ [taskId]: task }` |
| `sql.js` | `DATASETS`, `SQL` | лише акти з PGlite |
| `labs.js` | `LABS` | лише акти з MVCC-лабораторією |
| `index.js` | `CONTENT` | збирає перші п'ять — не чіпати |

Новий акт: створити теку, підключити в `src/data/content.js`, `src/data/code.js`
(і `sql.js`/`labs.js`, якщо треба), прибрати `soon: true` в `src/data/acts.js` і
дописати там `boss: "<id>"`.

## Мова і стиль

- Українська, технічні терміни й ідентифікатори — в оригіналі (event loop, backpressure, EXPLAIN).
- Рядки в подвійних лапках: апострофи (`з'єднання`) не треба екранувати. Лапки в тексті — «ялинки».
- Тон — старший колега на рев'ю: конкретно, з цифрами, без води й без маркетингу.
- Кожне пояснення відповідає на «чому», а не лише «що». Хибні варіанти пояснюють, чому вони хибні.
- Читач — сильний React-розробник. Поле `frontendBridge` пов'язує тему з тим, що він уже знає
  (браузерний event loop, DevTools, fetch, React Query, стан, рендеринг). Це фірмова риса гри.
- Факти мають бути правильними для Node 22 і Postgres 16–18. Сумнівне — не писати.

## Рівень

```js
{
  id: "rt-microtasks",            // слаг, унікальний у грі; префікс акту (pro-, rt-, net-, db-)
  act: "runtime",
  kind: "predict",                // predict | order | review | incident | decision | codeQuest | sqlQuest | isolationLab
  title: "Хто перший: nextTick чи Promise?",
  teaser: "Один рядок для мапи",
  brief: "Вступ: ситуація й завдання. Абзаци через \n\n.",
  codexRefs: ["microtasks"],      // ≥ 1, статті мають існувати
  hints: ["м'яка", "точніша", "майже відповідь"],   // рівно 3, від загальної до конкретної
  bonus: { type: "tests", text: "…" },   // лише для codeQuest ("tests") і sqlQuest ("check"); інакше не писати
  debrief: {
    lesson: "Головний висновок — чому це важливо на проді",
    interview: "Як це питають на співбесіді і що відповідає сильний кандидат",
    frontendBridge: "Зв'язок із React/браузером",
  },
  payload: { /* за типом, див. нижче */ },
}
```

Зірки: ★ пройдено · ★★ без підказок · ★★★ бонус (для задач із вибором — без жодної помилки).

### predict — «передбач вивід»

```js
payload: {
  code: "…",            // CommonJS! Жодних import і top-level await — ESM змінює порядок nextTick/Promise
  context: "main",      // або "io": код усередині I/O-колбека, напр. require("node:fs").stat(".", () => { … })
  expected: ["A", "B"], // рядки stdout у правильному порядку, кожен унікальний
  expectedExit: 0,      // необов'язково; напр. 1 для unhandled rejection
  distractors: [{ text: "C: …", why: "чому цей рядок не надрукується" }],  // необов'язково: рядки з коду, які НЕ виводяться
  explain: "Покрокове пояснення черг",
}
```

Пастки-`distractors` у predict — рядки, які є в коді, але до виводу не доходять
(catch, що не спрацює; таймер після падіння процесу). Тест перевіряє справжнім
Node, що їх справді немає у stdout.

Тест запускає сніпет **справжнім Node** 6 разів (3 з них — з busy-wait) і вимагає
однакового виводу. Тому `setTimeout(0)` проти `setImmediate` — лише всередині
I/O-колбека (`context: "io"`), жодних гонок таймерів з I/O, жодних worker_threads.

### order — упорядкувати кроки

```js
payload: {
  prompt: "Що зробити",
  items: ["крок 1", "крок 2", "крок 3"],        // у ПРАВИЛЬНОМУ порядку; UI сам перемішає
  distractors: [{ text: "зайвий крок", why: "чому так не буває" }],  // необов'язково, 0–3
  explain: "Чому саме такий порядок",
}
```

### review — знайти рядки з проблемами

```js
payload: {
  prompt: "Знайдіть три рядки, які блокують мердж.",
  lang: "js",                                   // js | ts | sql | text
  code: "рядки через \n",
  bad: [{ line: 2, why: "у чому проблема і як правильно" }],   // номери з 1
  fine: { 4: "чому цей підозрілий рядок насправді ок" },        // необов'язково; пояснення хибних кліків
}
```

### incident — розслідування

```js
payload: {
  alert: "PagerDuty: p99 /api/checkout > 3 s протягом 10 хв",
  signals: [
    { kind: "metric", title: "Event loop lag", unit: "мс", values: [4, 5, 5, 900, 950], mark: 3, threshold: 100 },
    { kind: "log", title: "app.log", lines: ["…", "…"] },
    { kind: "trace", title: "GET /api/checkout", spans: [{ name: "handler", start: 0, dur: 3100, depth: 0 }, { name: "pg query", start: 20, dur: 12, depth: 1 }] },
    { kind: "note", title: "Що змінилося", lines: ["14:02 — деплой v2.31"] },
  ],
  steps: [   // гіпотеза → дія → перевірка; у кожному кроці рівно один correct
    { q: "Що найімовірніше?", options: [{ text: "…", correct: true, why: "…" }, { text: "…", why: "що станеться, якщо так вирішити" }] },
  ],
}
```

### decision — архітектурний trade-off

```js
payload: {
  scenario: "Ситуація й обмеження",
  stats: [{ id: "latency", label: "Затримка", value: 50, invert: true }, { id: "cost", label: "Вартість", value: 40, invert: true }],
  options: [
    { text: "…", correct: true, why: "…", effects: [{ target: "latency", delta: -20, reason: "чому саме так" }] },
    { text: "…", why: "…", effects: [{ target: "cost", delta: 30, reason: "…" }] },
  ],
}
```

`value` — 0–100; `invert: true` — більше значить гірше. Кожен варіант має ефекти
з поясненням `reason`: гравець бачить наслідки й хибних варіантів.

### codeQuest / sqlQuest / isolationLab

`payload: { task: "<id>" }` / `{ task: "<id>" }` / `{ lab: "<id>" }` — посилання на реєстри.

## Задача JS-пісочниці (`code.js`)

```js
"rt-retry": {
  title: "…",
  brief: "Вимоги списком. Показується поруч із редактором.",
  exports: ["retry"],              // імена, які має оголосити гравець
  shims: ["clock"],                // необов'язково: фейковий час (setTimeout, Date у коді гравця)
  starter: "заготовка — мусить ПАДАТИ на тестах",
  reference: "еталон — проходить усі тести й бонусні",
  naive: "правдоподібний, але хибний розв'язок — мусить падати (ловить головну пастку)",
  tests: [{ name: "що перевіряємо", run: async ({ mod, assert, clock, redis, http, EventEmitter, once, Writable, tick, logs }) => { … } }],  // ≥ 3
  bonusTests: [ … ],               // ≥ 1
}
```

- `assert`: `ok`, `equal`, `notEqual`, `deepEqual`, `throws(fn, matcher)`, `rejects(promiseOrFn, matcher)`, `fail`.
- `http`: `createRequest({ method, url, headers, body, ip })`, `createResponse()` → `res` як у node:http
  (`statusCode`, `setHeader`, `getHeader`, `writeHead`, `write`, `end`, `result()` → `{ status, headers, body, json, ended }`),
  `runMiddleware(mw, req, res, { timeoutMs })` → `{ next, error, ended, hung }`.
- `clock` (якщо `shims: ["clock"]`): `await clock.advance(ms)`, `await clock.runAll()`, `clock.now()`, `clock.pending()`.
- `redis`: `get`, `set(key, value, { EX, PX, NX, XX })`, `del`, `exists`, `incr`, `incrby`, `expire`, `pexpire`, `ttl`, `pttl`, `stats.calls`. Час — з `clock`, якщо він є.
- У коді гравця доступні `require("node:events")`, `require("node:stream")`, `console`, таймери,
  `process.nextTick`, `URL`, `TextEncoder`, `crypto.randomUUID()`. **Немає `Buffer`**: код і тести
  виконуються ще й у браузерному воркері.
- Кожен тест — до 1 с. Справжні затримки тримайте ≤ 50 мс або беріть `clock`.
- Пастка з фейковим часом: якщо тест створює проміс, а `await`-ить його лише після
  `await clock.runAll()`, відхилення встигає стати unhandled rejection — і Node валить
  весь процес тестів замість того, щоб тест просто впав. Одразу чіпляйте обробник:
  `const p = mod.retry(…); p.catch(() => {});` і лише потім рухайте годинник.

## SQL-задача (`sql.js`)

```js
export const DATASETS = {
  shop: {
    title: "Інтернет-магазин",
    tables: [{ name: "users", columns: "id, email, country, created_at" }],
    setup: "CREATE TABLE …; INSERT … SELECT … FROM generate_series(1, 20000) i; ANALYZE;",
  },
};
export const SQL = {
  "db-index": {
    title: "…", dataset: "shop", brief: "…",
    starter: "-- SQL гравця", reference: "еталон", naive: "хибний розв'язок",
    check: { type: "plan", query: "SELECT …", expect: { forbid: [{ node: "Seq Scan", relation: "orders" }] } },
    bonus: { type: "plan", query: "SELECT …", expect: { anyOf: ["Index Only Scan"] } },
  },
};
```

- Сід — лише арифметика (`(i * 7919) % 1000`), **без `random()`**, ≤ 30 000 рядків у таблиці, `ANALYZE` наприкінці.
- `check.type`: `result` (порівняння з еталоном, `ordered: true` — якщо важить порядок) ·
  `plan` (`expect: { anyOf, forbid, maxCost }`; запит мусить повертати те саме, що й до оптимізації) ·
  `state` (`verify` + очікувані `rows`) · `error` (`probe` мусить впасти з `sqlstate`).
- Перед перевіркою плану виконується `RESET ALL` — `SET enable_seqscan = off` не допоможе.

## Бос (`boss.js`)

```js
export const BOSS = {
  id: "boss-runtime", act: "runtime",
  title: "Блокатор", subtitle: "…",
  alert: "Текст алерту, з якого все починається",
  intro: "Сюжет інциденту, абзаци через \n\n",
  sprite: "blocker",           // ключ процедурного спрайта (render/bossArt.js)
  budget: 5,                   // бюджет помилок: хибна відповідь −1, підказка −1
  codexRefs: ["…"],
  reward: { title: "Приборкувач event loop" },
  phases: [                    // 3–5 фаз, щонайменше 3 різні kind
    {
      id: "triage", title: "…", story: "Що відбувається зараз",
      kind: "incident", payload: { … },          // той самий формат, що в рівнях
      hints: ["…"],                              // 0–2
      tools: { flamegraph: "ASCII-вивід інструмента" },   // reveal-інструменти: flamegraph | curl | explain
    },
  ],
  postmortem: {
    summary: "…", rootCause: "…",
    contributing: ["…", "…"], actionItems: ["…", "…", "…"],
    staffView: "Як на це подивився б Staff: системний висновок",
  },
};
```

## Стаття довідника (`codex.js`)

```js
"event-loop": {
  title: "…", aliases: ["…"],
  summary: "1–2 речення",
  how: "Суть, 2–4 абзаци через \n\n",
  code: [{ lang: "js", caption: "…", src: "…" }],   // необов'язково
  tradeoffs: ["+ …", "− …"], numbers: ["…"], interview: ["…"],
  frontendBridge: "…",
  see: ["інші-статті"],        // лише існуючі id
}
```

## Картки (`cards.js`)

Рівно 3 на кожну статтю акту: 2 `mcq` + 1 `flash`, id — `<стаття>-1..3`.

```js
{ id: "event-loop-1", topic: "event-loop", kind: "mcq", q: "…", options: ["…", "…", "…", "…"], answer: 2, explain: "чому це, а не інше" }
{ id: "event-loop-3", topic: "event-loop", kind: "flash", front: "…", back: "…" }
```

Правильні відповіді розподіляйте між позиціями 0–3 рівномірно, а варіанти
тримайте однієї довжини — щоб відповідь не вгадувалась за формою.

## Навичка (`skills.js`)

```js
{ id: "rt-loop", act: "runtime", title: "Event loop", summary: "…", levels: ["rt-event-loop", "rt-microtasks"], topics: ["event-loop", "microtasks"] }
```

Кожен рівень акту (крім прологу) має входити хоча б в одну навичку.

## Перевірка

```bash
node --test test/content.test.js test/code.test.js test/predict.test.js test/sql.test.js test/mvcc.test.js
```
