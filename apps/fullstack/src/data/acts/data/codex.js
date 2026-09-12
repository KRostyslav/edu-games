/** Статті довідника акту «Дані»: Postgres від схеми до пулу з'єднань. */

export const CODEX = {
  constraints: {
    title: "Схема й обмеження: база як останній рубіж",
    aliases: ["constraints", "NOT NULL", "CHECK", "UNIQUE", "FOREIGN KEY", "зовнішній ключ", "обмеження", "SQLSTATE 23505", "моделювання"],
    summary:
      "Валідація у формі й у коді — для зручності. Гарантію, що в таблиці не буде сміття, дають лише обмеження в схемі: вони спрацьовують для кожного запису, хоч би звідки він прийшов.",
    how:
      "Дані в таблицю пишуть не лише ваш ендпоінт, а й старий сервіс, скрипт міграції, адмінка й колега з psql о третій ночі. Перевірка в JavaScript захищає один шлях; обмеження в Postgres — усі. Базовий набір: `NOT NULL` (значення обов'язкове), `CHECK (qty > 0)` (довільна умова над рядком), `UNIQUE` (не повторюється), `FOREIGN KEY` (посилається на наявний рядок), `PRIMARY KEY` (UNIQUE + NOT NULL). Порушення — це помилка з чітким SQLSTATE: 23502 — NULL, 23514 — CHECK, 23505 — дублікат, 23503 — зовнішній ключ.\n\n" +
      "Кілька неочевидних правил. `CHECK` вважається виконаним, якщо умова дорівнює `NULL`, тож `CHECK (qty > 0)` пропускає `qty = NULL` — потрібен ще `NOT NULL`. `UNIQUE` за замовчуванням вважає всі NULL різними (з Postgres 15 можна `UNIQUE NULLS NOT DISTINCT`). Зовнішній ключ вимагає унікального індексу на тій таблиці, на яку посилаються, але НЕ створює індекс на колонці, яка посилається: `orders.user_id` доведеться індексувати самому, інакше кожен `DELETE FROM users` сканує всю `orders`.\n\n" +
      "`ON DELETE` вирішує, що буде з дочірніми рядками: `NO ACTION`/`RESTRICT` (за замовчуванням — не дати видалити), `CASCADE` (видалити разом), `SET NULL`. Кошик, що не має сенсу без користувача, — `CASCADE`; замовлення, яке потрібне бухгалтерії, — точно ні.\n\n" +
      "Унікальне обмеження ще й розв'язує гонки: два одночасні «зареєструватися» з тим самим email не пройдуть обидва, хоч би як ви перевіряли існування в коді. Звідси патерн `INSERT … ON CONFLICT (user_id, product_id) DO UPDATE` — «додати в кошик або збільшити кількість» одним атомарним запитом.",
    code: [
      {
        lang: "sql",
        caption: "Кошик: одна позиція на товар, кількість додатна, сміття не пройде",
        src: [
          "CREATE TABLE cart_items (",
          "  user_id    int NOT NULL REFERENCES users (id) ON DELETE CASCADE,",
          "  product_id int NOT NULL REFERENCES products (id),",
          "  qty        int NOT NULL CHECK (qty > 0),",
          "  added_at   timestamptz NOT NULL DEFAULT now(),",
          "  PRIMARY KEY (user_id, product_id)",
          ");",
          "",
          "-- «Додати в кошик» без гонок і без SELECT перед INSERT",
          "INSERT INTO cart_items (user_id, product_id, qty) VALUES ($1, $2, 1)",
          "ON CONFLICT (user_id, product_id) DO UPDATE SET qty = cart_items.qty + 1;",
        ].join("\n"),
      },
      {
        lang: "sql",
        caption: "Обмеження на великій живій таблиці — у два кроки",
        src: [
          "-- миттєво: нові рядки вже перевіряються, старі — ні",
          "ALTER TABLE orders ADD CONSTRAINT orders_total_positive CHECK (total > 0) NOT VALID;",
          "-- довго, але не блокує запис: перевіряє наявні рядки",
          "ALTER TABLE orders VALIDATE CONSTRAINT orders_total_positive;",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Одне місце правди для всіх клієнтів бази; помилка з SQLSTATE легко мапиться у 409 чи 422.",
      "+ UNIQUE і FK захищають від гонок, які код застосунку не бачить.",
      "− Кожне обмеження — перевірка на кожному записі; FK без індексу на дочірній колонці робить DELETE батьківського рядка повним скануванням.",
      "− Складні бізнес-правила (ліміт на суму за день, стан між таблицями) в CHECK не вмістити — там потрібні транзакції чи тригери.",
    ],
    numbers: [
      "SQLSTATE: 23502 NOT NULL · 23503 FK · 23505 UNIQUE · 23514 CHECK.",
      "ADD CONSTRAINT … NOT VALID — лише каталог, мілісекунди; VALIDATE на 50 млн рядків — хвилини, але без блокування запису.",
    ],
    interview: [
      "Навіщо обмеження в базі, якщо є валідація в DTO?",
      "Чи створює Postgres індекс для FOREIGN KEY? На якій стороні і чому це важливо?",
      "Як гарантувати унікальність email без урахування регістру?",
    ],
    frontendBridge:
      "Валідація форми через zod — це UX: людина бачить помилку до відправлення. Але fetch можна зробити з консолі в обхід форми. Обмеження в базі — як типи в TypeScript, тільки перевіряються в рантаймі для кожного, хто пише дані.",
    see: ["transactions-acid", "indexes-btree", "api-errors"],
  },

  "sql-joins": {
    title: "JOIN: INNER, LEFT і пастка WHERE",
    aliases: ["join", "left join", "inner join", "anti join", "not exists", "з'єднання таблиць", "coalesce"],
    summary:
      "INNER JOIN лишає лише пари, що знайшлися; LEFT JOIN — усі рядки лівої таблиці, доповнені NULL. Більшість багів у звітах — це LEFT JOIN, який тихо став INNER, або дубльовані суми.",
    how:
      "`FROM users u LEFT JOIN orders o ON o.user_id = u.id` дає кожного користувача стільки разів, скільки в нього замовлень, а тих, у кого замовлень немає, — один раз із `o.* = NULL`. Звідси три класичні пастки звітів.\n\n" +
      "Перша — умова на праву таблицю у `WHERE`: `WHERE o.status <> 'cancelled'` відкидає рядки, де `o.status` — NULL, тобто саме тих, у кого замовлень немає. LEFT JOIN непомітно перетворився на INNER. Фільтр правої таблиці має стояти в `ON`. Друга — `count(*)`: для користувача без замовлень це 1 (рядок є, хоч і з NULL). Рахуйте `count(o.id)` — агрегати пропускають NULL. З тієї ж причини `sum(o.total)` дає NULL, а не 0, — потрібен `COALESCE`.\n\n" +
      "Третя — розмноження рядків. Якщо з'єднати `orders` з `order_items` і порахувати `sum(orders.total)`, кожне замовлення врахується стільки разів, скільки в ньому позицій. Агрегуйте кожну гілку окремо (підзапит чи CTE) і лише потім з'єднуйте.\n\n" +
      "Для «кого немає» — anti-join: `WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id)`. Уникайте `NOT IN (SELECT …)`: якщо підзапит поверне хоч один NULL, умова не буде істинною для жодного рядка. Фізично Postgres виконує JOIN одним із трьох алгоритмів — Nested Loop, Hash Join чи Merge Join, — і вибір видно в EXPLAIN.",
    code: [
      {
        lang: "sql",
        caption: "Користувачі з кількістю й сумою нескасованих замовлень — включно з тими, хто нічого не купив",
        src: [
          "SELECT u.id, u.name,",
          "       count(o.id)                AS orders,   -- не count(*)",
          "       COALESCE(sum(o.total), 0)  AS revenue",
          "FROM users u",
          "LEFT JOIN orders o",
          "       ON o.user_id = u.id",
          "      AND o.status <> 'cancelled'            -- фільтр правої таблиці — в ON",
          "WHERE u.country = 'UA'                       -- фільтр лівої — у WHERE",
          "GROUP BY u.id, u.name;",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Один запит з JOIN замість кількох походів у базу й склеювання в коді.",
      "− JOIN двох «один-до-багатьох» гілок розмножує рядки: суми й count стають хибними без попередньої агрегації.",
    ],
    numbers: ["Hash Join будує хеш-таблицю з меншої сторони в пам'яті (у межах work_mem, за замовчуванням 4 МБ на операцію); не влізло — пише батчі на диск."],
    interview: [
      "Чим відрізняється умова в ON від умови в WHERE для LEFT JOIN?",
      "Чому NOT IN з підзапитом небезпечний і чим його замінити?",
      "Назвіть алгоритми JOIN у Postgres і коли кожен вигідний.",
    ],
    frontendBridge:
      "LEFT JOIN — це `users.map(u => ({ ...u, orders: byUser.get(u.id) ?? [] }))`, а INNER — той самий map із `.filter(u => byUser.has(u.id))`. Різниця лише в тому, що база робить це без передачі всіх рядків мережею.",
    see: ["window-functions", "explain", "n-plus-one"],
  },

  "window-functions": {
    title: "Віконні функції: top-N у групі й накопичувальні суми",
    aliases: ["window functions", "OVER", "PARTITION BY", "row_number", "rank", "dense_rank", "lag", "running total", "віконні функції"],
    summary:
      "Віконна функція рахує значення по групі рядків, але не згортає їх, як GROUP BY: кожен рядок лишається на місці й отримує свій номер, ранг чи накопичену суму.",
    how:
      "`row_number() OVER (PARTITION BY category ORDER BY revenue DESC)` нумерує рядки окремо в кожній категорії. `PARTITION BY` ділить на групи, `ORDER BY` задає порядок усередині вікна. Звідси класичний top-N у групі: пронумерувати в CTE, а потім відфільтрувати `WHERE rn <= 3`. Одразу в `WHERE` віконну функцію писати не можна: вікна рахуються після `WHERE`, `GROUP BY` і `HAVING` (`QUALIFY` у Postgres немає).\n\n" +
      "Три функції ранжування відрізняються на рівних значеннях. `row_number()` дає унікальні номери (1, 2, 3, 4) — порядок серед рівних довільний, якщо не додати тай-брейкер (`ORDER BY revenue DESC, id`). `rank()` дає рівним однаковий ранг із пропуском (1, 2, 2, 4), тож «top-3 через rank» може повернути чотири рядки. `dense_rank()` — без пропусків (1, 2, 2, 3).\n\n" +
      "Агрегати теж працюють як віконні: `sum(total) OVER (ORDER BY day)` — накопичувальна сума, `avg(total) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)` — ковзне середнє за 7 днів. Пастка: з `ORDER BY` рамка за замовчуванням — `RANGE … CURRENT ROW`, і рядки з однаковим ключем сортування потрапляють у суму разом (сума «стрибає»). Для покрокової суми пишіть `ROWS`. `lag(x)` і `lead(x)` дають значення з попереднього й наступного рядка — «зміна до вчора» без самоз'єднання.\n\n" +
      "`ORDER BY` усередині `OVER` не сортує результат — він лише задає порядок для обчислення. Порядок виводу — окремий зовнішній `ORDER BY`.",
    code: [
      {
        lang: "sql",
        caption: "Top-3 товари за виручкою в кожній категорії",
        src: [
          "WITH revenue AS (",
          "  SELECT p.category, p.id, p.name, sum(oi.qty * oi.price) AS revenue",
          "  FROM order_items oi JOIN products p ON p.id = oi.product_id",
          "  GROUP BY p.category, p.id, p.name",
          "), ranked AS (",
          "  SELECT *, row_number() OVER (PARTITION BY category ORDER BY revenue DESC, id) AS place",
          "  FROM revenue",
          ")",
          "SELECT category, name, revenue, place FROM ranked",
          "WHERE place <= 3",
          "ORDER BY category, place;",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Один прохід по даних замість самоз'єднань і корельованих підзапитів.",
      "− Вікно потребує відсортованих даних: без відповідного індексу — Sort у плані, на великих обсягах із диском.",
      "− Для «top-N кожного з небагатьох» по індексу швидше LATERAL-підзапит з LIMIT, ніж нумерація всієї таблиці.",
    ],
    interview: [
      "Як вибрати top-3 товари в кожній категорії одним запитом?",
      "Чим row_number відрізняється від rank і dense_rank?",
      "Чому віконну функцію не можна використати в WHERE?",
    ],
    frontendBridge:
      "Це `groupBy` + `sort` + `slice(0, 3)` для кожної групи, або `reduce` з накопичувачем для running total — тільки на боці бази, без завантаження 30 000 рядків у браузер. А зовнішній ORDER BY — як окремий `.sort()` після `map`: порядок обчислення й порядок показу — різні речі.",
    see: ["sql-joins", "explain"],
  },

  "indexes-btree": {
    title: "Індекси: B-tree і коли він справді допомагає",
    aliases: ["index", "індекс", "B-tree", "btree", "expression index", "partial index", "GIN", "BRIN", "selectivity", "селективність"],
    summary:
      "Індекс — окрема відсортована структура, яка дозволяє знайти рядки за O(log n) замість перегляду всієї таблиці. Він пришвидшує читання, але сповільнює кожен запис і допомагає лише тоді, коли запит вибирає малу частку рядків.",
    how:
      "B-tree — індекс за замовчуванням: збалансоване дерево, де листя містить значення ключа й адресу рядка в таблиці (TID). Навіть для десятків мільйонів рядків глибина — 3–4 рівні, тож пошук за рівністю — кілька сторінок замість сотень тисяч. B-tree обслуговує `=`, `<`, `>`, `BETWEEN`, `IN`, `IS NULL`, `ORDER BY` і `LIKE 'abc%'` (у не-C колації — з `text_pattern_ops`).\n\n" +
      "Індекс працює лише для того виразу, за яким побудований. `WHERE lower(email) = $1` не використає індекс на `email` — потрібен індекс на вираз `(lower(email))`. Той самий принцип для `date(created_at)`, `(data->>'status')` та приведення типів. Частковий індекс `WHERE status = 'pending'` індексує лише «гарячі» рядки — він малий і швидкий.\n\n" +
      "Чи піде планувальник у індекс, вирішує селективність: яку частку таблиці поверне умова. Знайти одного користувача з 20 000 — Index Scan. Вибрати 40 % замовлень — Seq Scan буде дешевшим: послідовне читання сторінок швидше за тисячі випадкових переходів з індексу в таблицю. Між ними — Bitmap Scan: спершу зібрати адреси з індексу, потім прочитати сторінки таблиці по порядку. Якщо всі потрібні колонки є в індексі, можливий Index Only Scan без походу в таблицю (поки сторінки позначені у visibility map як «усе видиме» — це підтримує VACUUM).\n\n" +
      "Ціна індексу — на записі: кожен INSERT оновлює всі індекси таблиці, а UPDATE індексованої колонки ще й вимикає HOT-оновлення. Інші типи для інших задач: GIN — jsonb, масиви, повнотекстовий пошук; GiST — діапазони й геодані; BRIN — величезні таблиці, що ростуть за часом.",
    code: [
      {
        lang: "sql",
        caption: "Логін без урахування регістру: індекс на вираз і водночас гарантія унікальності",
        src: [
          "CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));",
          "",
          "SELECT id, name FROM users WHERE lower(email) = lower($1);",
          "-- Index Scan using users_email_lower_key on users",
          "",
          "-- На великій живій таблиці — без блокування запису:",
          "CREATE UNIQUE INDEX CONCURRENTLY users_email_lower_key ON users (lower(email));",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Пошук за ключем — мілісекунди на будь-якому розмірі таблиці.",
      "+ Унікальний індекс — одночасно пришвидшення і бізнес-гарантія.",
      "− Кожен індекс сповільнює INSERT/UPDATE і займає місце; невикористані індекси видно в pg_stat_user_indexes (idx_scan = 0).",
      "− Низькоселективна колонка (status із 4 значеннями) майже ніколи не варта окремого індексу — хіба частковий.",
    ],
    numbers: [
      "Глибина B-tree для 100 млн рядків — зазвичай 4 рівні.",
      "Звичайний CREATE INDEX бере блокування SHARE: читати можна, писати — ні, доки індекс будується. CONCURRENTLY — довше, але без блокування запису.",
    ],
    interview: [
      "Чому запит з lower(email) не використовує індекс на email?",
      "Коли Seq Scan кращий за Index Scan?",
      "Що таке Index Only Scan і що йому заважає?",
    ],
    frontendBridge:
      "`orders.find(o => o.userId === id)` — це Seq Scan: O(n) на кожен виклик. `ordersByUser.get(id)` з заздалегідь побудованого `Map` — це індекс: будувати й оновлювати його коштує, зате пошук миттєвий. І так само, як Map за `id` не допоможе шукати за `email`, індекс допомагає лише тому виразу, за яким побудований.",
    see: ["composite-indexes", "explain", "constraints"],
  },

  "composite-indexes": {
    title: "Складені індекси: порядок колонок вирішує все",
    aliases: ["composite index", "складений індекс", "multicolumn index", "covering index", "INCLUDE", "leftmost prefix", "skip scan"],
    summary:
      "Індекс (a, b) відсортований спершу за a, а в межах однакового a — за b. Тому він чудово обслуговує `a = ? AND b > ?` і `ORDER BY b` для фіксованого a, але погано — умову лише на b.",
    how:
      "Уявіть телефонну книгу, відсортовану за прізвищем, а потім за ім'ям. Знайти всіх «Коваль Олена» — миттєво; всіх «Коваль» — теж; усіх «Олена» — лише переглянувши книгу цілком. Це правило лівого префікса: індекс (user_id, created_at) допомагає запитам, що фіксують user_id.\n\n" +
      "Звідси правило побудови: спершу колонки з рівністю, потім колонка з діапазоном або сортуванням. Для `WHERE user_id = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 20` індекс (user_id, created_at) дає діапазон, де рядки вже впорядковані за часом: Postgres іде по ньому назад і зупиняється на двадцятому рядку — без Sort і без читання решти замовлень. Індекс (created_at, user_id) змусить пройти всі замовлення всіх користувачів після дати й відсіяти чужі. Напрям (`DESC`) у простому випадку не важить — B-tree читається в обидва боки; він важливий для змішаного сортування на кшталт `ORDER BY a ASC, b DESC`.\n\n" +
      "`INCLUDE (status, total)` додає колонки в листя індексу, не роблячи їх частиною ключа: запит, якому вистачає цих колонок, стає Index Only Scan. Два окремі індекси (user_id) і (created_at) складений не замінять: Postgres може об'єднати їх через BitmapAnd, але впорядкованості це не дає — Sort лишиться. У Postgres 18 з'явився skip scan: індекс (status, user_id) може обслужити умову лише на user_id, якщо в status мало різних значень, — але це підстраховка, а не привід проєктувати індекси абияк.",
    code: [
      {
        lang: "sql",
        caption: "«Мої замовлення»: сторінка з 20 останніх — без Sort",
        src: [
          "CREATE INDEX orders_user_created_idx ON orders (user_id, created_at);",
          "",
          "EXPLAIN SELECT id, status, total, created_at FROM orders",
          "WHERE user_id = 301 AND created_at > '2024-06-01'",
          "ORDER BY created_at DESC LIMIT 20;",
          "-- Limit",
          "--   ->  Index Scan Backward using orders_user_created_idx on orders",
          "--         Index Cond: ((user_id = 301) AND (created_at > ...))",
        ].join("\n"),
      },
      {
        lang: "sql",
        caption: "Keyset-пагінація на тому ж індексі замість OFFSET",
        src: [
          "-- наступна сторінка: курсор — created_at і id останнього показаного рядка",
          "SELECT id, status, total, created_at FROM orders",
          "WHERE user_id = $1 AND (created_at, id) < ($2, $3)",
          "ORDER BY created_at DESC, id DESC LIMIT 20;",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Один правильний складений індекс закриває і фільтр, і сортування, і пагінацію.",
      "+ Індекс (a, b) робить окремий індекс (a) зайвим.",
      "− Кожен складений індекс більший за одноколонковий і сповільнює запис; не робіть індекс під кожен запит — робіть під гарячі.",
    ],
    numbers: ["OFFSET 100000 LIMIT 20 читає й відкидає 100 000 рядків; keyset-пагінація на індексі читає лише 20 — незалежно від номера сторінки."],
    interview: [
      "У якому порядку ставити колонки складеного індексу для WHERE a = ? AND b > ? ORDER BY b?",
      "Чи допоможе індекс (a, b) запиту WHERE b = ?",
      "Чим keyset-пагінація краща за OFFSET?",
    ],
    frontendBridge:
      "Складений індекс — це `Map<userId, Order[]>`, де масив кожного користувача вже відсортований за датою. Взяти 20 останніх замовлень одного користувача — `get(id).slice(-20)`. А знайти всі замовлення за дату без userId ця структура не вміє — треба обійти всі масиви.",
    see: ["indexes-btree", "explain"],
  },

  explain: {
    title: "EXPLAIN і EXPLAIN ANALYZE: як читати план запиту",
    aliases: ["explain", "explain analyze", "план запиту", "query plan", "Seq Scan", "Index Scan", "Bitmap Heap Scan", "Index Only Scan", "buffers", "planner", "статистика", "ANALYZE"],
    summary:
      "EXPLAIN показує, як Postgres збирається виконати запит і скільки це, на його думку, коштуватиме. EXPLAIN ANALYZE ще й виконує запит і показує, що сталося насправді. Уся діагностика — у розбіжностях між цими двома.",
    how:
      "План — дерево вузлів; читати його треба зсередини назовні: найглибші вузли (скани таблиць) віддають рядки батькам (Join, Sort, Aggregate, Limit). У кожного вузла `cost=0.29..8.30` — оцінка вартості в умовних одиницях (читання однієї сторінки послідовно = 1): перше число — до першого рядка, друге — до останнього. `rows` — скільки рядків очікує планувальник, `width` — середній розмір рядка в байтах. Вартість — не мілісекунди, а спосіб порівняти варіанти плану між собою.\n\n" +
      "`EXPLAIN (ANALYZE, BUFFERS)` виконує запит — для UPDATE/DELETE загорніть у `BEGIN; … ROLLBACK;`. До кожного вузла додається `actual time=0.05..0.37 rows=300 loops=1`: час до першого й останнього рядка в мілісекундах і реальна кількість рядків — на одне виконання вузла. Якщо `loops=120000`, множте: внутрішня сторона Nested Loop виконалась 120 тисяч разів. `Buffers: shared hit=133 read=2` — сторінки з кешу Postgres і з диска. У Postgres 18 BUFFERS увімкнено з ANALYZE за замовчуванням, а rows показуються з дробовою частиною (`rows=0.33` — середнє на loop).\n\n" +
      "Вузли доступу. **Seq Scan** — прочитати таблицю цілком (`Filter:` і `Rows Removed by Filter:` показують, скільки викинули даремно). **Index Scan** — пройти індексом і для кожного збігу сходити в таблицю. **Index Only Scan** — відповісти з самого індексу (`Heap Fetches:` — скільки разів таки довелося в таблицю). **Bitmap Index Scan + Bitmap Heap Scan** — зібрати адреси з індексу і прочитати сторінки таблиці по порядку; `Recheck Cond` перевіряє умову на сторінці. Далі — Nested Loop, Hash Join, Merge Join, Sort (`Sort Method: external merge Disk:` — не вистачило work_mem), HashAggregate, Limit.\n\n" +
      "Головний сигнал — `rows` оцінене проти фактичного. Оцінка 1, а насправді 120 000 — планувальник вибрав план для одного рядка (Nested Loop) і помилився на п'ять порядків. Причина майже завжди — статистика: після масового завантаження autovacuum ще не встиг зробити ANALYZE, або колонки корелюють (місто й країна), і тоді допомагає `CREATE STATISTICS`. І пам'ятайте: Seq Scan — не вирок. Для маленької таблиці чи умови, що вибирає значну частку рядків, він найдешевший, і планувальник правий.",
    code: [
      {
        lang: "text",
        caption: "Індекс є, але не той: 1 850 000 рядків прочитано, щоб знайти один",
        src: [
          "Bitmap Heap Scan on coupon_redemptions  (cost=20188.68..71887.19 rows=1 width=8) (actual time=156.381..194.827 rows=1.00 loops=1)",
          "  Recheck Cond: (coupon_id = 1)",
          "  Filter: (user_id = 48213)",
          "  Rows Removed by Filter: 1849999",
          "  Heap Blocks: exact=13604",
          "  Buffers: shared hit=15164",
          "  ->  Bitmap Index Scan on coupon_redemptions_coupon_id_idx  (cost=0.00..20188.68 rows=1853367 width=0) (actual time=33.513..33.513 rows=1850000.00 loops=1)",
          "        Index Cond: (coupon_id = 1)",
          "        Index Searches: 1",
          "        Buffers: shared hit=1560",
          "Planning Time: 0.114 ms",
          "Execution Time: 194.860 ms",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ EXPLAIN без ANALYZE безпечний і миттєвий — показує намір планувальника.",
      "− EXPLAIN ANALYZE справді виконує запит: DELETE видалить, повільний запит навантажить прод.",
      "− План на локальній базі з 1000 рядків нічого не каже про прод із 10 млн: статистика інша — і план інший.",
    ],
    numbers: [
      "Оцінка rows, що розходиться з фактом у 10+ разів, — привід перевірити статистику (pg_stats, last_autoanalyze у pg_stat_user_tables).",
      "Autoanalyze запускається, коли змінилося ~10 % таблиці (autovacuum_analyze_scale_factor = 0.1) плюс 50 рядків.",
    ],
    interview: [
      "Прочитайте план: де тут проблема і як ви її виправите?",
      "Чим cost відрізняється від actual time? Що означає loops?",
      "Чому Postgres ігнорує індекс і робить Seq Scan — і коли він правий?",
    ],
    frontendBridge:
      "EXPLAIN — як Lighthouse, що прогнозує; EXPLAIN ANALYZE — як запис у вкладці Performance, де видно, що сталося насправді. Дерево плану читається як flame chart: широкий (дорогий) вузол глибоко всередині — і є ваша проблема.",
    see: ["indexes-btree", "composite-indexes", "sql-joins", "postmortem"],
  },

  "n-plus-one": {
    title: "N+1 запитів і ORM",
    aliases: ["N+1", "n plus one", "ORM", "Prisma", "TypeORM", "DataLoader", "eager loading", "include", "lazy loading", "пагінація"],
    summary:
      "Один запит за списком і ще по одному на кожен елемент: 1 + N походів у базу. На локалці з 10 рядками непомітно, на проді з 500 рядками — пів тисячі мережевих round-trip'ів і вичерпаний пул.",
    how:
      "Типовий код: `const orders = await db.order.findMany()`, а потім у циклі `await db.user.findUnique({ where: { id: order.userId } })`. Кожен виклик — окремий запит, окремий round-trip і окрема черга до пулу з'єднань. Навіть якщо запит займає 1 мс у базі, мережа й драйвер додають ще 0,3–1 мс, а послідовний `await` у циклі перетворює N дрібних запитів на суму їхніх затримок.\n\n" +
      "Лікування — завантажувати зв'язки групою: JOIN, або один запит `WHERE id = ANY($1)` на всі id одразу (ORM роблять це через `include`/`relations` — зазвичай по одному запиту на рівень зв'язку, а не на рядок). У GraphQL та інших місцях, де N+1 виникає між незалежними резолверами, використовують DataLoader: він збирає всі `load(id)` за один тік event loop і робить один пакетний запит.\n\n" +
      "Поруч живуть ще дві проблеми того самого коду. Відсутня пагінація: `findMany()` без `take` сьогодні повертає 200 рядків, а через рік — 200 000, і сервер серіалізує їх у JSON, блокуючи event loop. І `SELECT *`: широкі рядки (описи, jsonb) тягнуться мережею даремно, а в JSON-відповідь потрапляють поля на кшталт passwordHash. Вибирайте явні колонки (`select`) — це і швидше, і безпечніше.\n\n" +
      "Як помітити: логування кількості запитів на HTTP-запит, трейси (APM показує «гребінку» однакових спанів), `calls` у pg_stat_statements, що росте в N разів швидше за кількість запитів.",
    code: [
      {
        lang: "ts",
        caption: "Було: 1 + 2N запитів. Стало: 3 запити на будь-яку кількість замовлень",
        src: [
          "// ❌ N+1",
          "for (const order of orders) {",
          "  order.user = await db.user.findUnique({ where: { id: order.userId } });",
          "}",
          "",
          "// ✅ зв'язки групою, явні поля, сторінка",
          "const orders = await db.order.findMany({",
          "  where: { status },",
          "  orderBy: [{ createdAt: \"desc\" }, { id: \"desc\" }],",
          "  take: 50,",
          "  select: { id: true, total: true, createdAt: true,",
          "            user: { select: { id: true, name: true } },",
          "            items: { select: { productId: true, qty: true } } },",
          "});",
          "",
          "// ✅ без ORM: один запит на всі id",
          "const { rows } = await pool.query(\"SELECT id, name FROM users WHERE id = ANY($1)\", [userIds]);",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Пакетне завантаження дає сталу кількість запитів незалежно від розміру сторінки.",
      "− Один гігантський JOIN з кількома «один-до-багатьох» розмножує рядки; інколи 2–3 окремі запити з ANY($1) швидші.",
      "− DataLoader кешує в межах запиту — не тримайте його екземпляр довше за HTTP-запит, інакше отримаєте застарілі дані між користувачами.",
    ],
    numbers: [
      "500 замовлень × 2 зв'язки × ~1 мс round-trip = ~1 с лише на очікування мережі.",
      "Той самий результат трьома запитами — 5–10 мс.",
    ],
    interview: [
      "Що таке N+1 і як ви його знайдете в проді?",
      "Як працює DataLoader і чому він прив'язаний до одного запиту?",
      "Чому OFFSET-пагінація деградує на великих сторінках?",
    ],
    frontendBridge:
      "Це водоспад fetch'ів із useEffect: список рендериться, кожен рядок сам вантажить автора — і в Network видно драбинку з 50 запитів. На фронті це лікують одним запитом за списком (або batch-ендпоінтом), на бекенді — JOIN, ANY($1) чи DataLoader. DataLoader, до речі, групує виклики за один тік — так само, як React групує setState в один рендер.",
    see: ["sql-joins", "connection-pooling", "request-lifecycle"],
  },

  "transactions-acid": {
    title: "Транзакції й ACID",
    aliases: ["transaction", "транзакція", "ACID", "BEGIN", "COMMIT", "ROLLBACK", "atomicity", "savepoint", "idle in transaction"],
    summary:
      "Транзакція — група інструкцій, що виконується як одне ціле: або всі зміни зберігаються, або жодна. ACID — чотири гарантії, що роблять це правдою навіть під час збою сервера.",
    how:
      "Atomicity — усе або нічого: переказ, що списав з одного рахунку й упав до зарахування на інший, відкотиться повністю. Consistency — після транзакції виконуються всі обмеження схеми. Isolation — паралельні транзакції не бачать проміжного стану одна одної (наскільки суворо — визначає рівень ізоляції). Durability — після COMMIT зміни переживуть падіння: Postgres спершу пише їх у WAL (журнал попереджувального запису) і скидає на диск.\n\n" +
      "Без явного BEGIN кожна інструкція — окрема транзакція (autocommit). Головна пастка в Node: транзакція живе в одному з'єднанні. `pool.query(\"BEGIN\")`, а потім `pool.query(\"UPDATE …\")` можуть піти в різні з'єднання пулу — «транзакція» тоді нічого не гарантує. Потрібно взяти клієнта (`const client = await pool.connect()`), виконати на ньому BEGIN … COMMIT, у catch — ROLLBACK, і у finally — `client.release()`. ORM роблять це за вас (`$transaction`, `manager.transaction`).\n\n" +
      "Транзакція має бути короткою. Поки вона відкрита, вона тримає блокування змінених рядків і з'єднання з пулу, а ще не дає VACUUM прибрати старі версії рядків. Ніколи не робіть усередині транзакції зовнішніх викликів — платіжного API, email, HTTP до іншого сервісу: мережа зависла на 30 секунд — і на 30 секунд заблоковано рядок товару й зайнято з'єднання. Статус `idle in transaction` у pg_stat_activity — саме такі «забуті» транзакції; `idle_in_transaction_session_timeout` їх примусово закриває.\n\n" +
      "Помилка всередині транзакції переводить її в стан aborted: будь-яка наступна інструкція дасть «current transaction is aborted», доки не буде ROLLBACK. Для часткового відкату є `SAVEPOINT`.",
    code: [
      {
        lang: "js",
        caption: "Транзакція в node-postgres: один клієнт від BEGIN до COMMIT",
        src: [
          "const client = await pool.connect();",
          "try {",
          '  await client.query("BEGIN");',
          '  await client.query("UPDATE accounts SET balance = balance - $1 WHERE id = $2", [amount, from]);',
          '  await client.query("UPDATE accounts SET balance = balance + $1 WHERE id = $2", [amount, to]);',
          '  await client.query("COMMIT");',
          "} catch (err) {",
          '  await client.query("ROLLBACK");',
          "  throw err;",
          "} finally {",
          "  client.release();",
          "}",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Атомарність знімає з коду цілий клас «напівзбережених» станів.",
      "− Довга транзакція тримає блокування, з'єднання й заважає VACUUM; зовнішні виклики — завжди поза нею.",
      "− Транзакція не перетинає межі сервісу: списати гроші в платіжці й створити замовлення в базі атомарно не вийде — потрібні ідемпотентність і outbox.",
    ],
    numbers: ["COMMIT з synchronous_commit = on чекає fsync WAL — зазвичай від сотень мікросекунд до кількох мілісекунд на SSD."],
    interview: [
      "Розшифруйте ACID. Яку з гарантій забезпечує WAL?",
      "Чому не можна викликати платіжний API всередині транзакції?",
      "Що не так із pool.query(\"BEGIN\") у node-postgres?",
    ],
    frontendBridge:
      "Оптимістичне оновлення в React Query — атомарність на клієнті: в onMutate ви змінюєте кеш, а в onError відкочуєте до знімка. У базі те саме робить ROLLBACK — тільки гарантовано, навіть якщо процес упав посеред операції.",
    see: ["isolation-levels", "mvcc", "locks-deadlocks", "connection-pooling"],
  },

  "isolation-levels": {
    title: "Рівні ізоляції в Postgres",
    aliases: ["isolation level", "рівень ізоляції", "READ COMMITTED", "REPEATABLE READ", "SERIALIZABLE", "SSI", "lost update", "write skew", "40001", "serialization failure"],
    summary:
      "Рівень ізоляції визначає, які аномалії паралельних транзакцій база допускає. У Postgres за замовчуванням READ COMMITTED — і він пропускає lost update та write skew, якщо код робить «прочитав — перевірив — записав».",
    how:
      "READ COMMITTED (за замовчуванням): кожна інструкція бачить дані, закомічені до її початку. Два SELECT в одній транзакції можуть побачити різне. UPDATE рядка, який змінює інша транзакція, чекає на її коміт, а потім перечитує свіжу версію рядка — тому `SET qty = qty - 1` безпечний, а `SET qty = <значення, прочитане раніше в JS>` — ні: це lost update.\n\n" +
      "REPEATABLE READ у Postgres — snapshot isolation: знімок береться на першій інструкції транзакції, і вся транзакція бачить лише його (фантомів теж немає, суворіше за стандарт SQL). Якщо транзакція намагається змінити рядок, який після її знімка змінила закомічена паралельна, — `ERROR: could not serialize access due to concurrent update` (SQLSTATE 40001). Даних не втрачено, але транзакцію треба повторити цілком. Write skew RR не ловить: дві транзакції читають спільну умову («чергових двоє»), а пишуть різні рядки — конфлікту записів немає.\n\n" +
      "SERIALIZABLE (SSI, serializable snapshot isolation) відстежує залежності «я прочитав те, що ти змінив» і перериває одну з транзакцій, якщо результат не відповідає жодному послідовному порядку. Ловить і write skew, ціною частіших 40001 і накладних витрат. READ UNCOMMITTED у Postgres поводиться як READ COMMITTED — брудних читань немає ніколи.\n\n" +
      "Альтернативи підвищенню рівня на READ COMMITTED: атомарний UPDATE з арифметикою в SQL, умовний `UPDATE … WHERE qty > 0` із перевіркою кількості змінених рядків, `SELECT … FOR UPDATE` перед рішенням, обмеження в схемі або версійна колонка (оптимістичне блокування: `UPDATE … WHERE id = $1 AND version = $2`). Хоч який рівень вище RC — застосунок зобов'язаний уміти повторювати транзакцію на 40001 і 40P01.",
    code: [
      {
        lang: "sql",
        caption: "Три способи не загубити списання",
        src: [
          "-- 1. Арифметика в SQL, перевірка в тому ж запиті (READ COMMITTED)",
          "UPDATE stock SET qty = qty - 1 WHERE id = $1 AND qty > 0 RETURNING qty;",
          "",
          "-- 2. Блокування на читанні, логіка — у застосунку",
          "BEGIN;",
          "SELECT qty FROM stock WHERE id = $1 FOR UPDATE;",
          "UPDATE stock SET qty = $2 WHERE id = $1;",
          "COMMIT;",
          "",
          "-- 3. Сильніший рівень + ретрай на SQLSTATE 40001",
          "BEGIN ISOLATION LEVEL SERIALIZABLE;",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ READ COMMITTED — найменше конфліктів і ретраїв; достатньо, якщо зміни атомарні або явно заблоковані.",
      "+ SERIALIZABLE дозволяє писати бізнес-логіку як для однієї транзакції — база сама гарантує коректність.",
      "− RR і SERIALIZABLE вимагають ретраїв у застосунку; без них користувач бачить 500 на кожному конфлікті.",
    ],
    numbers: ["SQLSTATE 40001 — serialization_failure, 40P01 — deadlock_detected: обидва безпечно повторювати цілою транзакцією."],
    interview: [
      "Який рівень ізоляції за замовчуванням у Postgres і які аномалії він допускає?",
      "Що таке write skew і чому REPEATABLE READ його не ловить?",
      "Як прибрати lost update, не змінюючи рівень ізоляції?",
    ],
    frontendBridge:
      "Дві вкладки редагують ту саму форму: обидві завантажили версію 1, обидві зберегли — друга затерла першу. Це lost update. Фронтенд лікує його ETag і If-Match (сервер відповідає 412 на застарілу версію) — той самий принцип, що й версійна колонка чи SERIALIZABLE у базі.",
    see: ["mvcc", "transactions-acid", "locks-deadlocks"],
  },

  mvcc: {
    title: "MVCC: версії рядків замість блокування читання",
    aliases: ["MVCC", "multiversion concurrency control", "snapshot", "знімок", "xmin", "xmax", "VACUUM", "bloat", "dead tuples", "autovacuum"],
    summary:
      "Postgres не перезаписує рядок на місці: UPDATE створює нову версію, а стара лишається для тих транзакцій, які її ще бачать. Тому читачі не блокують писачів — а VACUUM потім прибирає мертві версії.",
    how:
      "Кожна версія рядка (tuple) має приховані поля `xmin` — id транзакції, що її створила, і `xmax` — id транзакції, що її видалила чи замінила. Транзакція працює зі знімком: списком того, які транзакції вже закомічені. Версія видима, якщо її створила закомічена до знімка транзакція і ще ніхто видимий їй не видалив. UPDATE = позначити стару версію `xmax` + вставити нову; DELETE = лише позначити.\n\n" +
      "Наслідок перший: SELECT ніколи не чекає на UPDATE і навпаки — кожен бачить свою версію. Чекають лише писачі одного рядка: другий UPDATE тієї самої версії стає в чергу за першим. Наслідок другий: мертві версії накопичуються. Їх прибирає VACUUM (зазвичай autovacuum у фоні), позначаючи місце для повторного використання. Якщо autovacuum не встигає або йому заважає довга транзакція (її знімок ще «бачить» старі версії, тож прибирати їх не можна), таблиця й індекси роздуваються (bloat), і запити читають дедалі більше сторінок.\n\n" +
      "HOT-оновлення (heap-only tuple): якщо UPDATE не змінює індексованих колонок і на сторінці є місце, нова версія лягає поруч, а індекси не оновлюються — тому зайвий індекс на часто змінюваній колонці дорожчий, ніж здається. Ще одна причина, чому autovacuum не можна вимикати: id транзакцій 32-бітні, і VACUUM «заморожує» старі рядки, щоб лічильник міг безпечно прокрутитися по колу (transaction ID wraparound).",
    code: [
      {
        lang: "sql",
        caption: "Подивитися на версії й на тих, хто заважає VACUUM",
        src: [
          "SELECT xmin, xmax, id, qty FROM stock WHERE id = 1;",
          "",
          "-- мертві рядки й останній autovacuum",
          "SELECT relname, n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze",
          "FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 5;",
          "",
          "-- найстаріші відкриті транзакції",
          "SELECT pid, state, now() - xact_start AS age, left(query, 60)",
          "FROM pg_stat_activity WHERE xact_start IS NOT NULL ORDER BY xact_start LIMIT 5;",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Читання ніколи не блокує запис: звіт на 10 хвилин не зупиняє checkout.",
      "− Кожен UPDATE — нова версія рядка: таблиці з частими оновленнями потребують налаштованого autovacuum.",
      "− Довга транзакція (навіть idle in transaction) тримає горизонт VACUUM — bloat росте по всій базі.",
    ],
    numbers: ["Autovacuum запускається для таблиці, коли мертвих рядків більше за 50 + 20 % таблиці (autovacuum_vacuum_scale_factor = 0.2) — для таблиці на 100 млн рядків це 20 млн мертвих версій, тож великим таблицям поріг зменшують."],
    interview: [
      "Чому в Postgres читання не блокує запис?",
      "Звідки береться bloat і як його запобігти?",
      "Чим небезпечна транзакція, яка годину висить у стані idle in transaction?",
    ],
    frontendBridge:
      "Це іммутабельний стан у React: оновлення створює новий об'єкт, а компонент, що вже відрендерився зі старим, і далі бачить свою версію — як stale closure бачить стан свого рендеру. Старі об'єкти прибирає garbage collector, а старі версії рядків — VACUUM. І як витік пам'яті через забуту підписку, довга транзакція не дає прибрати сміття.",
    see: ["isolation-levels", "transactions-acid", "locks-deadlocks"],
  },

  "locks-deadlocks": {
    title: "Блокування й дедлоки",
    aliases: ["lock", "блокування", "deadlock", "дедлок", "FOR UPDATE", "SKIP LOCKED", "NOWAIT", "ACCESS EXCLUSIVE", "lock_timeout", "pg_locks", "40P01"],
    summary:
      "Рядки блокуються на запис до кінця транзакції, таблиці — на час DDL. Дедлок — цикл очікування: T1 чекає на T2, а T2 на T1; Postgres перериває одну з них. Лікується однаковим порядком захоплення, а не таймаутами.",
    how:
      "Рівень рядків: UPDATE, DELETE і `SELECT … FOR UPDATE` блокують рядок до COMMIT/ROLLBACK; другий писач того самого рядка чекає. Для черг завдань є `FOR UPDATE SKIP LOCKED` (взяти наступне незаблоковане) і `NOWAIT` (одразу помилка замість очікування). Слабші режими — `FOR NO KEY UPDATE`, `FOR SHARE`, `FOR KEY SHARE` (його бере перевірка зовнішнього ключа).\n\n" +
      "Рівень таблиць: SELECT бере ACCESS SHARE, INSERT/UPDATE/DELETE — ROW EXCLUSIVE, звичайний CREATE INDEX — SHARE (блокує запис), більшість ALTER TABLE і DROP — ACCESS EXCLUSIVE, яке конфліктує з усім, навіть із SELECT. Черга блокувань — FIFO: якщо ALTER TABLE чекає, доки завершиться довгий звіт, то всі нові SELECT стають у чергу за ALTER. Одна «миттєва» міграція за хвилину зупиняє весь сервіс. Тому для DDL — `SET lock_timeout = '5s'` і повтор.\n\n" +
      "Дедлок: T1 заблокувала рахунок 1 і хоче 2, T2 заблокувала 2 і хоче 1. Кожна чекає вічно — тому Postgres після `deadlock_timeout` (1 с за замовчуванням) шукає цикл у графі очікувань і перериває одну транзакцію з `ERROR: deadlock detected` (40P01). Друга завершується. Профілактика: захоплювати ресурси в однаковому порядку (за зростанням id), тримати транзакції короткими, оновлювати пачки рядків відсортованими. Ретрай на 40P01 обов'язковий, але це страховка, а не рішення.\n\n" +
      "Діагностика: `pg_blocking_pids(pid)` показує, хто блокує процес, `pg_locks` — усі блокування, `log_lock_waits = on` пише в лог очікування довші за deadlock_timeout.",
    code: [
      {
        lang: "sql",
        caption: "Переказ без дедлоку і черга завдань без конкуренції",
        src: [
          "-- блокувати рахунки завжди за зростанням id, хоч би хто кому переказував",
          "SELECT id FROM accounts WHERE id IN ($1, $2) ORDER BY id FOR UPDATE;",
          "",
          "-- кожен воркер бере своє завдання, не чекаючи на інших",
          "UPDATE jobs SET status = 'running', locked_at = now()",
          "WHERE id = (SELECT id FROM jobs WHERE status = 'queued'",
          "            ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)",
          "RETURNING id, payload;",
          "",
          "-- хто кого блокує",
          "SELECT pid, pg_blocking_pids(pid) AS blocked_by, wait_event_type, left(query, 60)",
          "FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) > 0;",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Явне FOR UPDATE робить логіку «перевірив — змінив» коректною на READ COMMITTED без ретраїв.",
      "− Кожне блокування — черга: гарячий рядок (лічильник, залишок популярного товару) серіалізує всі транзакції на ньому.",
      "− Більший deadlock_timeout лише відкладає помилку; менший — частіше витрачає CPU на пошук циклів.",
    ],
    numbers: ["deadlock_timeout = 1s за замовчуванням. lock_timeout і statement_timeout за замовчуванням вимкнені (0) — виставляйте їх для міграцій і для ролей застосунку."],
    interview: [
      "Що таке дедлок і як його уникнути?",
      "Чому ALTER TABLE, що виконується 10 мс, може покласти сервіс?",
      "Як кілька воркерів можуть брати завдання з однієї таблиці, не заважаючи одне одному?",
    ],
    frontendBridge:
      "Кнопка «Оплатити», яку ви блокуєте після першого кліку, — це м'ютекс на клієнті. Але два таби чи два пристрої обходять його, тож справжнє блокування живе на сервері, у базі. А дедлок — як два useEffect, кожен з яких чекає, поки інший оновить стан першим.",
    see: ["isolation-levels", "zero-downtime-migrations", "transactions-acid"],
  },

  "zero-downtime-migrations": {
    title: "Міграції без простою: expand/contract",
    aliases: ["migration", "міграція", "expand contract", "zero downtime", "rename column", "backfill", "CREATE INDEX CONCURRENTLY", "NOT VALID", "rolling deploy"],
    summary:
      "Під час rolling deploy старий і новий код працюють одночасно, тож кожна зміна схеми має бути сумісна з обома версіями. Звідси expand/contract: спершу розширити схему, перевести код, і лише потім прибрати старе.",
    how:
      "Перейменування колонки «в лоб» (`RENAME COLUMN` у тому ж релізі, що й новий код) ламає поди старої версії, які ще кілька хвилин обслуговують трафік і шукають стару назву, — а відкотити реліз уже нікуди. Безпечний шлях розтягнутий на кілька деплоїв. Expand: додати нову колонку (nullable, без дефолту — зміна лише каталогу). Потім код, що пише в обидві колонки (dual write), а читає ще стару. Backfill: скопіювати старі дані пачками по 1–10 тисяч рядків з паузами — один UPDATE на 40 млн рядків — це одна гігантська транзакція, подвоєна таблиця, сплеск WAL і відставання реплік. Потрібний індекс — `CREATE INDEX CONCURRENTLY`. Перевірити, що розбіжностей нуль. Перемкнути читання на нову колонку. Contract: перестати писати стару й окремою міграцією видалити її.\n\n" +
      "Що в Postgres небезпечно на великій таблиці: `ALTER COLUMN TYPE` з перезаписом таблиці (більшість змін типу), `ADD COLUMN … DEFAULT <volatile>` (наприклад, `DEFAULT gen_random_uuid()` — перезапис; константний дефолт з Postgres 11 — миттєвий), `SET NOT NULL` (сканує таблицю під ACCESS EXCLUSIVE — якщо заздалегідь не додати й не провалідувати `CHECK (col IS NOT NULL) NOT VALID`), звичайний `CREATE INDEX` (блокує запис на весь час побудови), новий FK без `NOT VALID`.\n\n" +
      "Навіть миттєвий DDL бере ACCESS EXCLUSIVE, і якщо в черзі перед ним стоїть довгий запит, усі наступні запити стають за ним. Тому в кожній міграції — `SET lock_timeout = '5s'` (краще впасти й повторити, ніж повісити прод) і `statement_timeout` для довгих кроків. `CREATE INDEX CONCURRENTLY` не можна виконати в транзакції, а якщо він упав — лишає невалідний індекс, який треба видалити й перебудувати.",
    code: [
      {
        lang: "sql",
        caption: "Перейменування users.name → full_name без простою",
        src: [
          "-- реліз 1: expand",
          "SET lock_timeout = '5s';",
          "ALTER TABLE users ADD COLUMN full_name text;",
          "-- реліз 2: код пише в обидві колонки; backfill пачками:",
          "UPDATE users SET full_name = name",
          "WHERE id BETWEEN $1 AND $1 + 9999 AND full_name IS NULL;",
          "CREATE INDEX CONCURRENTLY users_full_name_idx ON users (full_name);",
          "-- реліз 3: читання з full_name; реліз 4: стару колонку більше не пишемо",
          "-- реліз 5: contract",
          "ALTER TABLE users DROP COLUMN name;",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ Кожен крок окремо відкочується, і на жодному прод не лежить.",
      "− Замість однієї міграції — 4–5 релізів і тимчасовий код dual write, який треба не забути прибрати.",
    ],
    numbers: [
      "Backfill пачками по 5 000 рядків з паузою 100 мс: 40 млн рядків ≈ 8 000 пачок ≈ година-дві — зате без блокувань і відставання реплік.",
      "ADD COLUMN без дефолту чи з константним дефолтом — мілісекунди на будь-якому розмірі таблиці (Postgres 11+).",
    ],
    interview: [
      "Як перейменувати колонку в таблиці на 50 млн рядків без простою?",
      "Навіщо lock_timeout у міграції, яка виконується за 10 мс?",
      "Які ALTER TABLE в Postgres переписують таблицю?",
    ],
    frontendBridge:
      "Ви вже робили це в бібліотеці компонентів: додати новий проп `variant`, підтримувати поруч старий `primary`, з deprecation-warning перевести всі виклики, і лише в наступній мажорній версії видалити старий. Expand/contract — те саме, тільки «виклики» — це поди, які оновлюються не одночасно.",
    see: ["locks-deadlocks", "constraints", "indexes-btree"],
  },

  "connection-pooling": {
    title: "Пул з'єднань і PgBouncer",
    aliases: ["connection pool", "пул з'єднань", "PgBouncer", "max_connections", "too many clients", "transaction pooling", "pool size", "Little's law"],
    summary:
      "Кожне з'єднання з Postgres — окремий процес на сервері бази. Їх мало (max_connections = 100 за замовчуванням), тож застосунок тримає пул і позичає з'єднання на час запиту. Пул розміром «побільше» — не рішення: більше паралельних запитів, ніж ядер, лише сповільнює всіх.",
    how:
      "Відкрити нове з'єднання дорого: TCP, TLS, автентифікація, fork процесу backend — мілісекунди й кілька мегабайтів пам'яті. Тому драйвер (node-postgres Pool, Prisma, TypeORM) тримає пул відкритих з'єднань і видає їх запитам. Якщо всі зайняті — запит чекає в черзі пулу. Цей час очікування (pool wait) — окрема метрика, і часто саме вона, а не SQL, робить p99 великим.\n\n" +
      "Розмір рахують з двох боків. Потреба застосунку — закон Літтла: одночасних з'єднань ≈ запитів до бази за секунду × середній час запиту. 2 000 запитів/с × 5 мс = 10 з'єднань. Якщо запит сповільнився до 200 мс, потрібно вже 400 — пул вичерпується не через трафік, а через повільний запит. Можливості бази: реально паралельно працює приблизно стільки запитів, скільки ядер (з запасом на I/O — 2–4 на ядро); тисяча активних з'єднань на 16 ядрах — це черга всередині Postgres плюс витрати на перемикання й пам'ять.\n\n" +
      "Бюджет з'єднань: кількість подів × розмір пулу на под ≤ max_connections мінус резерв для адмінів, міграцій і реплікації. 20 подів × 20 = 400 при max_connections = 100 — частина подів отримує `FATAL: sorry, too many clients already` (SQLSTATE 53300), а автоскейл робить гірше. Рішення — PgBouncer (або Supavisor, RDS Proxy) у transaction pooling: застосунок відкриває скільки завгодно легких клієнтських з'єднань, а PgBouncer мультиплексує їх на кілька десятків справжніх, видаючи серверне з'єднання лише на час транзакції.\n\n" +
      "Ціна transaction pooling: між транзакціями ваше з'єднання може стати чужим. Не працюють сесійний `SET` (замість нього — `SET LOCAL` у транзакції), сесійні advisory locks, `LISTEN/NOTIFY`, тимчасові таблиці між транзакціями; prepared statements — лише з PgBouncer 1.21+ і `max_prepared_statements`. І завжди — таймаут очікування пулу (`connectionTimeoutMillis` у node-postgres за замовчуванням 0 — чекати вічно) та `statement_timeout`, щоб повільний запит не тримав з'єднання хвилинами.",
    code: [
      {
        lang: "js",
        caption: "node-postgres: пул, що падає швидко, а не висить",
        src: [
          'import pg from "pg";',
          "",
          "export const pool = new pg.Pool({",
          "  max: 10,                        // × кількість подів ≤ бюджет з'єднань",
          "  connectionTimeoutMillis: 2_000,  // не чекати вільного з'єднання вічно",
          "  idleTimeoutMillis: 30_000,",
          "  statement_timeout: 5_000,        // повільний запит не тримає з'єднання хвилинами",
          "});",
          "",
          "// метрики пулу — у дашборд поруч із p99",
          "setInterval(() => metrics.gauge(\"pg_pool\", {",
          "  total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount,",
          "}), 10_000);",
        ].join("\n"),
      },
    ],
    tradeoffs: [
      "+ PgBouncer у transaction mode тримає тисячі клієнтів на кількох десятках серверних з'єднань.",
      "− Transaction pooling ламає сесійний стан: SET, сесійні advisory locks, LISTEN/NOTIFY.",
      "− Більший пул ховає повільний запит на годину, а потім кладе базу: причину треба лікувати в SQL.",
    ],
    numbers: [
      "max_connections = 100 за замовчуванням; 3 з них зарезервовано для суперкористувача (superuser_reserved_connections).",
      "node-postgres Pool: max = 10, idleTimeoutMillis = 10 000, connectionTimeoutMillis = 0 (без таймауту) за замовчуванням.",
      "Закон Літтла: L = λ × W. 1 400 запитів/с × 0,19 с = 266 одночасних з'єднань.",
    ],
    interview: [
      "Як обрати розмір пулу з'єднань? Що зміниться з автоскейлом подів?",
      "Що таке PgBouncer transaction pooling і що з ним перестає працювати?",
      "Пул вичерпано: чому збільшити його — зазвичай погана ідея?",
    ],
    frontendBridge:
      "Браузер по HTTP/1.1 тримає не більше 6 з'єднань на домен — сьомий запит у DevTools висить у стані Queued/Stalled, хоча сервер вільний. Пул з'єднань до бази — те саме обмеження, тільки ліміт ставите ви, а черга росте всередині вашого Node-процесу.",
    see: ["n-plus-one", "transactions-acid", "request-lifecycle"],
  },
};
