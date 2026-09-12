/** Картки стендапу акту «Дані»: по три на статтю (2 mcq + 1 flash). */

export const CARDS = [
  {
    id: "constraints-1",
    topic: "constraints",
    kind: "mcq",
    q: "У таблиці є `qty int CHECK (qty > 0)`. Що станеться з INSERT, де qty = NULL?",
    options: [
      "Помилка 23514: CHECK не пропускає NULL",
      "Вставка пройде: для NULL умова невідома, а CHECK відкидає лише хибну",
      "Помилка 23502: CHECK неявно додає NOT NULL",
      "Postgres підставить 0, і вставка впаде на CHECK",
    ],
    answer: 1,
    explain:
      "CHECK порушено, лише коли умова дорівнює FALSE. NULL > 0 дає NULL — і рядок проходить. Обов'язковість задає тільки NOT NULL (його код — 23502), і CHECK його не додає. Замість NULL Postgres нічого не підставляє: DEFAULT спрацьовує, лише коли колонку не вказано взагалі.",
  },
  {
    id: "constraints-2",
    topic: "constraints",
    kind: "mcq",
    q: "orders.user_id має REFERENCES users(id). `DELETE FROM users WHERE id = 42` на 10 млн замовлень іде 2 секунди. Чому?",
    options: [
      "FOREIGN KEY блокує всю таблицю orders на час видалення",
      "Postgres перераховує статистику users після кожного DELETE",
      "Видалення з таблиці з первинним ключем завжди повільне",
      "Щоб перевірити FK, Postgres шукає рядки orders за user_id, а індексу немає",
    ],
    answer: 3,
    explain:
      "FK вимагає унікального індексу лише на users.id; індекс на orders.user_id треба створити самому. Без нього кожна перевірка «чи немає дочірніх рядків» — Seq Scan по orders. Всю таблицю FK не блокує, а статистика після DELETE не перераховується.",
  },
  {
    id: "constraints-3",
    topic: "constraints",
    kind: "flash",
    front: "Які SQLSTATE в порушень NOT NULL, FOREIGN KEY, UNIQUE і CHECK — і як їх віддавати в HTTP?",
    back:
      "23502 — NOT NULL, 23503 — FK, 23505 — UNIQUE, 23514 — CHECK. Зазвичай 23505 → 409 Conflict («такий email уже є»), 23502/23503/23514 → 422 або 400. Текст помилки бази — лише в лог, назовні — зрозуміле повідомлення.",
  },

  {
    id: "sql-joins-1",
    topic: "sql-joins",
    kind: "mcq",
    q: "Звіт `users LEFT JOIN orders o ON o.user_id = u.id WHERE o.status = 'paid'` перестав показувати користувачів без замовлень. Чому?",
    options: [
      "Умова на o.status у WHERE відкидає рядки з NULL — LEFT JOIN став фактично INNER",
      "LEFT JOIN у Postgres не повертає рядків без пари, якщо в запиті є WHERE",
      "Порівняння тексту з NULL у WHERE завершується помилкою й рядок пропускається",
      "Планувальник замінив LEFT JOIN на Hash Join, який губить рядки без пари",
    ],
    answer: 0,
    explain:
      "Для користувача без замовлень o.status = NULL, а NULL = 'paid' — не TRUE, тож WHERE його відкидає. Умову на праву таблицю переносять в ON. Сам по собі WHERE LEFT JOIN не ламає, порівняння з NULL не падає, а Hash Join — лише спосіб виконання, семантику він не змінює.",
  },
  {
    id: "sql-joins-2",
    topic: "sql-joins",
    kind: "mcq",
    q: "`SELECT u.id, count(*) FROM users u LEFT JOIN orders o ON o.user_id = u.id GROUP BY u.id` — що буде для користувача без замовлень?",
    options: [
      "0 — замовлень немає",
      "NULL — рахувати нема чого",
      "1 — рахується сам рядок користувача з NULL замість замовлення",
      "Користувача не буде в результаті",
    ],
    answer: 2,
    explain:
      "LEFT JOIN дає для нього один рядок з o.* = NULL, а count(*) рахує рядки. count(o.id) пропускає NULL і дасть 0. NULL на порожній множині повертають sum і avg, а не count; зникнути користувач міг би лише з INNER JOIN.",
  },
  {
    id: "sql-joins-3",
    topic: "sql-joins",
    kind: "flash",
    front: "Як знайти користувачів без жодного замовлення і чому не через NOT IN?",
    back:
      "Anti-join: `WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id)` або `LEFT JOIN … WHERE o.id IS NULL`. `NOT IN (SELECT user_id …)` повертає порожній результат, якщо в підзапиті є хоч один NULL: `x NOT IN (1, NULL)` — це NULL, а не TRUE.",
  },

  {
    id: "window-functions-1",
    topic: "window-functions",
    kind: "mcq",
    q: "Виручка товарів: 100, 90, 90, 80. Що поверне `rank() OVER (ORDER BY revenue DESC)`?",
    options: ["1, 2, 3, 4", "1, 2, 2, 3", "1, 2, 2, 4", "1, 1, 2, 3"],
    answer: 2,
    explain:
      "rank() дає рівним однакове місце й пропускає наступне: 1, 2, 2, 4. dense_rank() — без пропуску (1, 2, 2, 3), row_number() — унікальні номери (1, 2, 3, 4) з довільним порядком серед рівних, якщо немає тай-брейкера. Варіант 1, 1, 2, 3 не дає жодна з функцій.",
  },
  {
    id: "window-functions-2",
    topic: "window-functions",
    kind: "mcq",
    q: "Чому `SELECT *, row_number() OVER (…) AS rn FROM t WHERE rn <= 3` не працює?",
    options: [
      "row_number працює лише разом із GROUP BY",
      "Вікна рахуються після WHERE, тож фільтр за rn — лише в CTE чи підзапиті",
      "У Postgres для цього є QUALIFY, а WHERE тут заборонений",
      "Бракує зовнішнього ORDER BY — без нього rn не обчислюється",
    ],
    answer: 1,
    explain:
      "Логічний порядок: FROM → WHERE → GROUP BY → HAVING → вікна → SELECT → ORDER BY. На момент WHERE вікон ще немає. QUALIFY є в Snowflake, BigQuery і DuckDB, але не в Postgres; ні GROUP BY, ні зовнішній ORDER BY віконним функціям не потрібні.",
  },
  {
    id: "window-functions-3",
    topic: "window-functions",
    kind: "flash",
    front: "Чим небезпечна накопичувальна сума `sum(x) OVER (ORDER BY day)`, якщо за день кілька рядків?",
    back:
      "З ORDER BY рамка за замовчуванням — RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW: усі рядки з тим самим day «рівні» й потрапляють у суму разом, тож сума стрибає одразу на весь день. Для покрокової суми — ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW і тай-брейкер в ORDER BY.",
  },

  {
    id: "indexes-btree-1",
    topic: "indexes-btree",
    kind: "mcq",
    q: "Є індекс на users(email). Чому `WHERE lower(email) = 'olena@shop.ua'` робить Seq Scan?",
    options: [
      "Індекси B-tree не підтримують текстові колонки",
      "Потрібно спершу виконати ANALYZE — і індекс підхопиться",
      "lower() — volatile-функція, її результат не можна індексувати",
      "Індекс збудовано за email, а умова — за lower(email); потрібен індекс на вираз",
    ],
    answer: 3,
    explain:
      "Планувальник зіставляє умову з тим, за чим побудовано індекс. Для lower(email) потрібен `CREATE INDEX … ON users (lower(email))`. B-tree чудово індексує текст, lower() — immutable і індексується, а ANALYZE не змусить використати індекс, що не підходить до виразу.",
  },
  {
    id: "indexes-btree-2",
    topic: "indexes-btree",
    kind: "mcq",
    q: "Запит вибирає 40 % рядків orders за status. Індекс на status є, але в плані Seq Scan. Що це означає?",
    options: [
      "Найімовірніше, планувальник правий: читати таблицю підряд дешевше за тисячі переходів з індексу",
      "Індекс пошкоджений — потрібен REINDEX",
      "Статистика застаріла: Seq Scan ніколи не буває кращим за індекс",
      "Треба виставити SET enable_seqscan = off для цього запиту в коді",
    ],
    answer: 0,
    explain:
      "Коли умова вибирає значну частку таблиці, послідовне читання сторінок дешевше за випадкові переходи з індексу, і Seq Scan тут оптимальний. REINDEX лікує зовсім інше, «Seq Scan ніколи не кращий» — міф, а enable_seqscan = off у проді — милиця, що ламає інші плани.",
  },
  {
    id: "indexes-btree-3",
    topic: "indexes-btree",
    kind: "flash",
    front: "Що таке Index Only Scan і що йому потрібно?",
    back:
      "Відповідь на запит із самого індексу, без читання таблиці. Потрібно, щоб усі колонки запиту були в індексі (у ключі або в INCLUDE) і щоб сторінки таблиці були позначені all-visible у visibility map — її оновлює VACUUM. Інакше в плані ростуть Heap Fetches.",
  },

  {
    id: "composite-indexes-1",
    topic: "composite-indexes",
    kind: "mcq",
    q: "Який індекс найкраще обслужить `WHERE user_id = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 20`?",
    options: ["(created_at, user_id)", "(user_id, created_at)", "Два окремі: (user_id) і (created_at)", "(created_at) INCLUDE (user_id)"],
    answer: 1,
    explain:
      "Спершу рівність, потім діапазон і сортування: у (user_id, created_at) замовлення користувача лежать поруч і вже впорядковані за часом — Index Scan Backward і Limit без Sort. Індекси, що починаються з created_at, змушують пройти замовлення всіх користувачів після дати; два окремі індекси дадуть щонайбільше BitmapAnd без впорядкування, тобто з Sort.",
  },
  {
    id: "composite-indexes-2",
    topic: "composite-indexes",
    kind: "mcq",
    q: "Є індекс (a, b). Який запит він обслуговує найгірше?",
    options: ["WHERE a = 1", "WHERE a = 1 AND b > 10", "WHERE b = 10", "WHERE a = 1 ORDER BY b"],
    answer: 2,
    explain:
      "Правило лівого префікса: індекс відсортований спершу за a, тож умова лише на b не дає діапазону — у кращому разі skip scan (Postgres 18, якщо в a мало різних значень), у гіршому — повний прохід. Решта запитів фіксують a й отримують готовий відсортований діапазон.",
  },
  {
    id: "composite-indexes-3",
    topic: "composite-indexes",
    kind: "flash",
    front: "Навіщо INCLUDE у CREATE INDEX і чим він відрізняється від ще однієї колонки ключа?",
    back:
      "INCLUDE кладе колонки лише в листя індексу: вони не впливають на сортування й унікальність, але дають Index Only Scan. `(user_id, created_at) INCLUDE (status, total)` — пошук і сортування за ключем, а status і total віддаються без походу в таблицю.",
  },

  {
    id: "explain-1",
    topic: "explain",
    kind: "mcq",
    q: "Внутрішній вузол Nested Loop: `actual time=0.001..0.002 rows=2 loops=120000`. Скільки часу він забрав загалом?",
    options: [
      "Близько 240 мс: час показано на один loop, тож 0,002 мс × 120 000",
      "0,002 мс — стільки виконувався вузол",
      "Не визначити без cost: actual time — лише відносна оцінка",
      "120 мс: loops — це кількість мілісекунд очікування",
    ],
    answer: 0,
    explain:
      "actual time і rows в EXPLAIN ANALYZE — середні на одне виконання вузла. Внутрішня сторона Nested Loop виконалась 120 000 разів: 0,002 × 120 000 ≈ 240 мс і 240 000 рядків. cost — умовні одиниці планувальника, а не час; loops — кількість виконань, а не мілісекунди.",
  },
  {
    id: "explain-2",
    topic: "explain",
    kind: "mcq",
    q: "Для Index Scan оцінка `rows=1`, а фактично `rows=120000`. Що перевіряти першим?",
    options: [
      "Чи не пошкоджений індекс — зробити REINDEX",
      "Чи вистачає work_mem для сортування",
      "Чи не треба збільшити shared_buffers",
      "Статистику: коли був ANALYZE і чи не було масового завантаження",
    ],
    answer: 3,
    explain:
      "Розбіжність оцінки й факту на порядки — майже завжди застаріла чи неточна статистика: після COPY autoanalyze ще не відпрацював. ANALYZE таблиці виправляє оцінку, і планувальник обирає інший план. REINDEX, work_mem і shared_buffers на оцінку rows не впливають.",
  },
  {
    id: "explain-3",
    topic: "explain",
    kind: "flash",
    front: "Що означають числа в `cost=0.29..8.30 rows=1 width=30`?",
    back:
      "cost — оцінка в умовних одиницях (послідовне читання сторінки = 1): 0.29 — до першого рядка, 8.30 — до останнього. rows — очікувана кількість рядків, width — середня ширина рядка в байтах. Це прогноз планувальника, а не час; фактичне показує лише EXPLAIN ANALYZE.",
  },

  {
    id: "n-plus-one-1",
    topic: "n-plus-one",
    kind: "mcq",
    q: "Ендпоінт бере 50 замовлень і для кожного в циклі робить `await db.user.findUnique(…)`. Скільки запитів і як виправити?",
    options: [
      "1 запит — ORM сам об'єднує виклики в циклі",
      "50 запитів — обгорнути в Promise.all, і проблема зникне",
      "51 запит; користувачів — одним запитом через include або WHERE id = ANY($1)",
      "2 запити — findUnique кешується після першого виклику",
    ],
    answer: 2,
    explain:
      "1 запит за списком + 50 — по одному на рядок. Promise.all прибирає послідовне очікування, але запитів лишається 51, і всі вони одночасно просять з'єднання з пулу. Автоматично об'єднувати виклики з циклу ORM не вміє (це робить DataLoader), кешу між findUnique за замовчуванням немає.",
  },
  {
    id: "n-plus-one-2",
    topic: "n-plus-one",
    kind: "mcq",
    q: "Як DataLoader прибирає N+1 у GraphQL-резолверах?",
    options: [
      "Кешує відповіді бази на 5 хвилин для всіх користувачів",
      "Збирає всі load(id) за один тік event loop і робить один пакетний запит",
      "Перетворює кожен запит на JOIN на рівні драйвера бази",
      "Запускає запити в окремих worker_threads паралельно",
    ],
    answer: 1,
    explain:
      "DataLoader відкладає виконання до кінця поточного тіку, збирає всі id і викликає batch-функцію один раз (WHERE id = ANY($1)). Кеш у нього є, але в межах одного запиту — спільний для всіх користувачів він був би джерелом витоку даних. JOIN і потоки тут ні до чого.",
  },
  {
    id: "n-plus-one-3",
    topic: "n-plus-one",
    kind: "flash",
    front: "Які проблеми зазвичай живуть поруч із N+1 у коді списку на ORM?",
    back:
      "1) Немає пагінації: findMany без take через рік повертає сотні тисяч рядків у JSON. 2) SELECT *: зайві широкі колонки й витік полів на кшталт passwordHash. 3) Запити в циклі. Лікування: take + keyset-курсор, явний select, зв'язки через include, JOIN чи ANY($1).",
  },

  {
    id: "transactions-acid-1",
    topic: "transactions-acid",
    kind: "mcq",
    q: 'node-postgres: `await pool.query("BEGIN"); await pool.query("UPDATE …"); await pool.query("COMMIT")`. Що не так?',
    options: [
      "Нічого: pool.query сам утримує транзакцію до COMMIT",
      "Бракує SAVEPOINT одразу після BEGIN",
      "BEGIN у Postgres не можна передавати через query()",
      "Кожен pool.query може піти в інше з'єднання — транзакція розсипається",
    ],
    answer: 3,
    explain:
      "Транзакція живе в одному з'єднанні, а pool.query щоразу бере будь-яке вільне. Потрібно `const client = await pool.connect()`, усе — на client, ROLLBACK у catch і release() у finally. SAVEPOINT для звичайної транзакції не потрібен, а BEGIN через query() — нормальна практика, коли це один клієнт.",
  },
  {
    id: "transactions-acid-2",
    topic: "transactions-acid",
    kind: "mcq",
    q: "У checkout усередині транзакції викликається платіжний API, що відповідає 2–30 секунд. Чим це небезпечно?",
    options: [
      "Поки чекаємо мережу, транзакція тримає блокування рядків і з'єднання з пулу",
      "Postgres автоматично відкотить транзакцію через 5 секунд",
      "Платіжний API відмовить, бачачи відкриту транзакцію",
      "Нічим, якщо рівень ізоляції — READ COMMITTED",
    ],
    answer: 0,
    explain:
      "Поки платіжка думає, змінені рядки заблоковано для інших покупців, а з'єднання вилучене з пулу; під навантаженням пул вичерпується за секунди. Автовідкату за 5 с немає (лише налаштовані statement_timeout чи idle_in_transaction_session_timeout), зовнішній API про транзакцію не знає, а рівень ізоляції не знімає блокувань записаних рядків.",
  },
  {
    id: "transactions-acid-3",
    topic: "transactions-acid",
    kind: "flash",
    front: "Розшифруйте ACID — по реченню на літеру.",
    back:
      "Atomicity — усе або нічого. Consistency — після коміту виконуються всі обмеження схеми. Isolation — паралельні транзакції не бачать проміжного стану одна одної (у межах рівня ізоляції). Durability — закомічене переживе падіння, бо до відповіді на COMMIT його записано й скинуто на диск у WAL.",
  },

  {
    id: "isolation-levels-1",
    topic: "isolation-levels",
    kind: "mcq",
    q: "Який рівень ізоляції в Postgres за замовчуванням і яку аномалію він допускає в «прочитав — порахував — записав»?",
    options: [
      "REPEATABLE READ; фантомні читання",
      "READ COMMITTED; lost update",
      "SERIALIZABLE; write skew",
      "READ UNCOMMITTED; брудне читання",
    ],
    answer: 1,
    explain:
      "За замовчуванням — READ COMMITTED: значення, прочитане в застосунку до чужого коміту, перезапише чужу зміну. REPEATABLE READ у Postgres фантомів не допускає, SERIALIZABLE не допускає write skew, а брудних читань у Postgres немає на жодному рівні.",
  },
  {
    id: "isolation-levels-2",
    topic: "isolation-levels",
    kind: "mcq",
    q: "Транзакція на REPEATABLE READ отримала SQLSTATE 40001. Що має зробити застосунок?",
    options: [
      "Повернути користувачу 500 — дані могли зіпсуватися",
      "Повторити лише останню інструкцію UPDATE",
      "Повторити всю транзакцію з початку, бажано з невеликою паузою",
      "Перейти на READ UNCOMMITTED, щоб конфліктів не було",
    ],
    answer: 2,
    explain:
      "40001 означає: транзакцію відкочено, бо її не узгодити з паралельною, — даних не зіпсовано. Повторювати треба цілком, з новим знімком, бо всі попередні читання вже застаріли. Окрема інструкція в перерваній транзакції не виконається, а READ UNCOMMITTED у Postgres — той самий READ COMMITTED.",
  },
  {
    id: "isolation-levels-3",
    topic: "isolation-levels",
    kind: "flash",
    front: "Що таке write skew і як його прибрати в Postgres?",
    back:
      "Дві транзакції читають спільну умову («чергових двоє»), кожна вирішує, що може змінити свій рядок, — і разом вони порушують правило. REPEATABLE READ це пропускає. Рішення: SERIALIZABLE з ретраями, SELECT … FOR UPDATE по всьому предикату або обмеження в схемі.",
  },

  {
    id: "mvcc-1",
    topic: "mvcc",
    kind: "mcq",
    q: "Звіт читає таблицю orders 10 хвилин. Що в цей час відбувається з UPDATE цих рядків?",
    options: [
      "Виконуються без очікування: UPDATE пише нові версії, а звіт бачить старі зі свого знімка",
      "Чекають, доки звіт закінчить читання",
      "Падають із serialization failure",
      "Звіт бачить частину старих і частину нових значень",
    ],
    answer: 0,
    explain:
      "У MVCC читачі не блокують писачів: UPDATE створює нову версію рядка, а звіт і далі читає версії, видимі в його знімку. Очікування й serialization failure бувають лише при конфлікті записів, а змішаного знімка в межах однієї інструкції Postgres не допускає.",
  },
  {
    id: "mvcc-2",
    topic: "mvcc",
    kind: "mcq",
    q: "Таблиця з частими UPDATE росте на диску, хоча кількість рядків не змінюється. Найімовірніша причина?",
    options: [
      "Postgres узагалі не перевикористовує звільнене місце",
      "На таблиці забагато індексів",
      "Рядки зберігаються стиснутими, і UPDATE їх розтискає",
      "Мертві версії не прибираються: autovacuum відстає або його тримає довга транзакція",
    ],
    answer: 3,
    explain:
      "Кожен UPDATE лишає мертву версію, а місце звільняє VACUUM. Якщо autovacuum не встигає або довга транзакція (навіть idle in transaction) тримає горизонт, версії накопичуються — це bloat. Позначене VACUUM місце Postgres перевикористовує, а індекси й стиснення тут не першопричина.",
  },
  {
    id: "mvcc-3",
    topic: "mvcc",
    kind: "flash",
    front: "Навіщо Postgres зберігає кілька версій одного рядка?",
    back:
      "Щоб читачі не чекали на писачів: кожна транзакція бачить версії, видимі в її знімку (за xmin і xmax), а UPDATE створює нову версію замість перезапису. Ціна — мертві версії, які прибирає VACUUM, тому autovacuum не можна вимикати.",
  },

  {
    id: "locks-deadlocks-1",
    topic: "locks-deadlocks",
    kind: "mcq",
    q: "Два перекази назустріч отримують `ERROR: deadlock detected`. Який фікс надійний?",
    options: [
      "Збільшити deadlock_timeout до 10 секунд",
      "Перейти на рівень ізоляції SERIALIZABLE",
      "Блокувати рахунки завжди в одному порядку — за зростанням id",
      "Прибрати транзакцію й виконувати два UPDATE окремо",
    ],
    answer: 2,
    explain:
      "Дедлок — цикл очікувань; однаковий порядок захоплення робить цикл неможливим. Довший таймаут лише відкладе ту саму помилку, SERIALIZABLE дедлоків не прибирає (і додає 40001), а два UPDATE без транзакції ламають атомарність переказу.",
  },
  {
    id: "locks-deadlocks-2",
    topic: "locks-deadlocks",
    kind: "mcq",
    q: "`ALTER TABLE orders ADD COLUMN note text` виконується за мілісекунди, але сервіс лежав хвилину. Що сталося?",
    options: [
      "ADD COLUMN переписав усю таблицю",
      "ALTER чекав ACCESS EXCLUSIVE за довгим запитом, а нові запити стали в чергу за ним",
      "Колонка text без дефолту вимагає VACUUM FULL",
      "Postgres перебудовував усі індекси таблиці",
    ],
    answer: 1,
    explain:
      "Nullable ADD COLUMN — лише зміна каталогу, але їй потрібне ACCESS EXCLUSIVE. Якщо таблицю читає довгий звіт, ALTER чекає, а черга блокувань FIFO: кожен новий SELECT стає за ALTER. Звідси SET lock_timeout = '5s' і повтор. Перезапису таблиці, VACUUM FULL чи перебудови індексів тут немає.",
  },
  {
    id: "locks-deadlocks-3",
    topic: "locks-deadlocks",
    kind: "flash",
    front: "Як кілька воркерів беруть завдання з таблиці jobs, не чекаючи одне на одного?",
    back:
      "`SELECT … WHERE status = 'queued' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`: кожен воркер блокує своє завдання й пропускає вже заблоковані іншими. Статус оновлюють і комітять у тій самій транзакції.",
  },

  {
    id: "zero-downtime-migrations-1",
    topic: "zero-downtime-migrations",
    kind: "mcq",
    q: "Чому не можна перейменувати колонку через RENAME COLUMN у тому ж релізі, що й новий код?",
    options: [
      "RENAME COLUMN переписує таблицю й блокує її на години",
      "Postgres не підтримує перейменування колонок",
      "Після RENAME зникають усі індекси колонки",
      "Під час rolling deploy старі поди звертаються до старої назви й падають, а відкотитися нікуди",
    ],
    answer: 3,
    explain:
      "RENAME — швидка зміна каталогу, індекси зберігаються. Проблема в сумісності: кілька хвилин старий і новий код працюють разом, і стара версія отримує 42703 (column does not exist). Відкат коду вже не допоможе — схема інша. Звідси expand/contract.",
  },
  {
    id: "zero-downtime-migrations-2",
    topic: "zero-downtime-migrations",
    kind: "mcq",
    q: "Чому backfill нової колонки запускають після релізу з dual write, а не до нього?",
    options: [
      "Інакше рядки, змінені між backfill і релізом, лишаться з застарілим значенням",
      "Бо до релізу нової колонки ще не існує в схемі",
      "Бо реліз із dual write сам запускає backfill",
      "Бо без нового коду backfill блокує всю таблицю",
    ],
    answer: 0,
    explain:
      "Поки код пише лише в стару колонку, кожна зміна після копіювання розходиться з новою. Коли dual write уже працює, нові записи йдуть в обидві, і backfill лише наздоганяє історію. Колонку додають ще раніше (expand), сам собою backfill не запускається, а блокування залежить від розміру пачок, а не від коду.",
  },
  {
    id: "zero-downtime-migrations-3",
    topic: "zero-downtime-migrations",
    kind: "flash",
    front: "Що таке CREATE INDEX CONCURRENTLY і які в нього обмеження?",
    back:
      "Побудова індексу без блокування запису (звичайний CREATE INDEX бере SHARE і зупиняє INSERT/UPDATE/DELETE до кінця побудови). Працює довше, двічі сканує таблицю, не виконується всередині транзакції, а при збої лишає INVALID-індекс, який треба видалити й збудувати знову.",
  },

  {
    id: "connection-pooling-1",
    topic: "connection-pooling",
    kind: "mcq",
    q: "20 подів, пул по 20 з'єднань, max_connections = 100. Що побачать поди після автоскейлу?",
    options: [
      "Нічого страшного — Postgres поставить зайві з'єднання в чергу",
      "Частина подів отримає FATAL: sorry, too many clients already",
      "Postgres сам збільшить max_connections під навантаження",
      "Кожен под автоматично отримає по 5 з'єднань замість 20",
    ],
    answer: 1,
    explain:
      "20 × 20 = 400 бажаних з'єднань проти 100 доступних (мінус резерв суперкористувача). Понад ліміт Postgres відхиляє з'єднання з SQLSTATE 53300. Черги на боці бази немає, max_connections змінюється лише з перезапуском, а ділити ліміт між подами Postgres не вміє — це робить PgBouncer.",
  },
  {
    id: "connection-pooling-2",
    topic: "connection-pooling",
    kind: "mcq",
    q: "p99 виріс з 80 мс до 4 с, у пулі waiting = 150, а головний SQL-запит сповільнився з 5 до 200 мс. Що робити першим?",
    options: [
      "Збільшити пул на кожному поді вдвічі",
      "Підняти max_connections у Postgres",
      "Лікувати запит: пул вичерпано, бо кожне з'єднання зайняте в 40 разів довше",
      "Додати ще подів, щоб розподілити навантаження",
    ],
    answer: 2,
    explain:
      "За законом Літтла потреба в з'єднаннях = запити/с × час запиту: запит у 40 разів довший — у 40 разів більше з'єднань. Більший пул, більше подів чи max_connections лише подадуть у базу більше повільних запитів одночасно. Спершу — EXPLAIN і індекс, плюс таймаути, щоб падати швидко.",
  },
  {
    id: "connection-pooling-3",
    topic: "connection-pooling",
    kind: "flash",
    front: "Що перестає працювати з PgBouncer у режимі transaction pooling?",
    back:
      "Усе, що прив'язане до сесії, а не до транзакції: сесійний SET (замість нього — SET LOCAL), сесійні advisory locks, LISTEN/NOTIFY, тимчасові таблиці між транзакціями, курсори WITH HOLD. Prepared statements — лише з PgBouncer 1.21+ і max_prepared_statements.",
  },
];
