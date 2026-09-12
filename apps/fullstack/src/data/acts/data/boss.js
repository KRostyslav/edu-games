/**
 * Бос акту «Дані»: Чорна п'ятниця. Перемога — підвищення до Middle Fullstack.
 *
 * Вивід EXPLAIN ANALYZE у фазі index — справжній прогін PGlite (Postgres 18)
 * на таблиці з 3,25 млн використань купонів, 1,85 млн із них — BF2024.
 */

const COUPON_EXPLAIN = [
  "prod-replica=> EXPLAIN (ANALYZE, BUFFERS)",
  "  SELECT count(*) FROM coupon_redemptions WHERE coupon_id = 1 AND user_id = 48213;",
  "                                QUERY PLAN",
  "---------------------------------------------------------------------------",
  "Aggregate  (cost=71887.19..71887.20 rows=1 width=8) (actual time=190.710..190.713 rows=1.00 loops=1)",
  "  Buffers: shared hit=15164",
  "  ->  Bitmap Heap Scan on coupon_redemptions  (cost=20188.68..71887.19 rows=1 width=0) (actual time=155.719..190.609 rows=1.00 loops=1)",
  "        Recheck Cond: (coupon_id = 1)",
  "        Filter: (user_id = 48213)",
  "        Rows Removed by Filter: 1849999",
  "        Heap Blocks: exact=13604",
  "        Buffers: shared hit=15164",
  "        ->  Bitmap Index Scan on coupon_redemptions_coupon_id_idx  (cost=0.00..20188.68 rows=1853367 width=0) (actual time=32.542..32.542 rows=1850000.00 loops=1)",
  "              Index Cond: (coupon_id = 1)",
  "              Index Searches: 1",
  "              Buffers: shared hit=1560",
  "Planning:",
  "  Buffers: shared hit=2 read=1 written=1",
  "Planning Time: 0.131 ms",
  "Execution Time: 190.742 ms",
  "(16 rows)",
].join("\n");

export const BOSS = {
  id: "boss-data",
  act: "data",
  sprite: "blackfriday",
  title: "Чорна п'ятниця",
  subtitle: "Checkout падає на піку продажів, і кожна хвилина коштує грошей",
  alert: "PagerDuty P1: p99 POST /api/checkout = 11,8 с, 5xx = 23 %, Postgres — 200 з 200 з'єднань",
  intro:
    "00:00, Чорна п'ятниця. Маркетинг розіслав push «−30 % з купоном BF2024» двом мільйонам користувачів, і за три хвилини трафік на checkout виріс ввосьмеро. Автоскейл підняв поди з 6 до 20 — і стало тільки гірше.\n\n" +
    "У чаті інциденту — продакт, що щохвилини рахує втрачену виручку, і черговий DBA, який уже тягнеться до кнопки «збільшити інстанс». Ви — інженер, якому треба знайти справжню причину, а не найбільший молоток.\n\n" +
    "Бюджет помилок невеликий: кожна хибна гіпотеза — ще кілька хвилин простою.",
  budget: 6,
  codexRefs: ["connection-pooling", "explain", "composite-indexes", "isolation-levels", "n-plus-one", "transactions-acid"],
  reward: { title: "Приборкувач Чорної п'ятниці" },
  phases: [
    {
      id: "triage",
      title: "Хто з'їв з'єднання",
      story:
        "Поди повідомляють про дві різні біди: одні не можуть з'єднатися з базою взагалі, інші годинами чекають вільного з'єднання в пулі. DBA каже, що база просто не витримує такого трафіку. Перш ніж щось міняти, розберіться, що тут причина, а що — наслідок.",
      kind: "incident",
      hints: [
        "Порахуйте, яку частку часу бази з'їдає кожен рядок pg_stat_statements.",
        "Трейс показує, де checkout проводить 10 секунд, — і це не SQL.",
      ],
      payload: {
        alert: "p99 POST /api/checkout 11,8 с; частина подів — FATAL: sorry, too many clients already",
        signals: [
          { kind: "metric", title: "p99 POST /api/checkout", unit: "мс", values: [180, 190, 210, 2400, 7900, 11800], mark: 3, threshold: 1000 },
          { kind: "metric", title: "Запити, що чекають з'єднання в пулі (сума по подах)", unit: "шт.", values: [0, 0, 2, 340, 1210, 2650], mark: 3, threshold: 50 },
          {
            kind: "log",
            title: "postgresql.log",
            lines: [
              "00:03:10 FATAL:  sorry, too many clients already",
              "00:03:11 LOG:  duration: 1843.221 ms  execute <unnamed>: SELECT count(*) FROM coupon_redemptions WHERE coupon_id = $1 AND user_id = $2",
              "00:03:11 DETAIL:  parameters: $1 = '1', $2 = '48213'",
              "00:03:11 LOG:  duration: 1790.004 ms  execute <unnamed>: SELECT count(*) FROM coupon_redemptions WHERE coupon_id = $1 AND user_id = $2",
              "00:03:12 FATAL:  sorry, too many clients already",
            ],
          },
          {
            kind: "note",
            title: "pg_stat_statements, топ за total_exec_time з 00:00 до 00:05",
            lines: [
              "calls 36 900 · mean 1 540 ms · total 56 826 s — SELECT count(*) FROM coupon_redemptions WHERE coupon_id = $1 AND user_id = $2",
              "calls 118 000 · mean 2,9 ms · total 342 s — SELECT * FROM products WHERE id = $1",
              "calls 9 800 · mean 6,1 ms · total 60 s — INSERT INTO orders (user_id, total, charge_id) VALUES ($1, $2, $3)",
            ],
          },
          {
            kind: "trace",
            title: "POST /api/checkout — повільний запит",
            spans: [
              { name: "POST /api/checkout", start: 0, dur: 11800, depth: 0 },
              { name: "pool.connect() — очікування з'єднання", start: 5, dur: 9950, depth: 1 },
              { name: "SELECT count(*) FROM coupon_redemptions", start: 9960, dur: 1610, depth: 1 },
              { name: "SELECT * FROM products × 12", start: 11575, dur: 180, depth: 1 },
              { name: "INSERT INTO orders", start: 11760, dur: 30, depth: 1 },
            ],
          },
        ],
        steps: [
          {
            q: "Що тут первинне, а що — наслідок?",
            options: [
              {
                text: "Повільний запит до coupon_redemptions тримає кожне з'єднання ~1,5 с; пули й max_connections вичерпуються як наслідок",
                correct: true,
                why: "Один запит — 95 % часу бази. За законом Літтла 1 400 checkout/с × 1,5 с ≈ 2 100 одночасних з'єднань — такого не витримає жоден пул. 10 секунд очікування в pool.connect() у трейсі — симптом, а не причина.",
              },
              {
                text: "Postgres замалий для такого трафіку — потрібен інстанс удвічі більший",
                why: "Вертикальне масштабування — хвилини простою на перемикання і вдвічі більше ядер для того самого запиту, який читає 1,85 млн рядків, щоб знайти один. Причина не в розмірі, а в плані.",
              },
              {
                text: "Автоскейл підняв забагато подів — треба повернути 6",
                why: "Поки запит повільний, 6 подів теж вичерпають пули, просто з іншою помилкою: замість too many clients — таймаути в черзі. Кількість подів — підсилювач, а не причина.",
              },
              {
                text: "Перевантажена мережа між подами й базою",
                why: "Мережа не пояснює, чому запит у pg_stat_statements виконується 1,5 с усередині самої бази — там, де мережі вже немає.",
              },
            ],
          },
          {
            q: "DBA пропонує негайно підняти max_connections з 200 до 1 000. Ваша реакція?",
            options: [
              {
                text: "Погодитися: поди отримають з'єднання, і помилки FATAL зникнуть",
                why: "FATAL зникне, але в базі стане тисяча одночасних копій повільного запиту на тих самих ядрах: CPU і так на межі, кожен запит стане ще повільнішим. До того ж max_connections змінюється лише з рестартом Postgres — на піку продажів.",
              },
              {
                text: "Відмовити: більше з'єднань — більше паралельних повільних запитів на тих самих ядрах; спершу треба зробити запит дешевим",
                correct: true,
                why: "Пропускну здатність бази обмежують ядра й диски, а не кількість з'єднань. Лікувати треба запит; пул і max_connections — лише бюджет, який має відповідати можливостям бази.",
              },
              {
                text: "Погодитися, і ще підняти пул на подах з 50 до 100",
                why: "Обидві зміни подають у базу ще більше одночасних повільних запитів. Черга просто переїде з пулу в Postgres, де вона дорожча: кожне з'єднання — окремий процес.",
              },
              {
                text: "Перезапустити всі поди, щоб звільнити завислі з'єднання",
                why: "Рестарт скине чергу на секунди — і за секунди вона збереться знову, бо запит той самий. А незавершені checkout'и отримають помилки.",
              },
            ],
          },
          {
            q: "Як підтвердити гіпотезу, перш ніж щось міняти?",
            options: [
              {
                text: "EXPLAIN (ANALYZE, BUFFERS) топ-запиту з реальними параметрами — на репліці",
                correct: true,
                why: "Це дасть фактичний план, кількість прочитаних рядків і сторінок. На репліці — щоб не додавати навантаження праймеру; запит лише читає, тож ANALYZE безпечний.",
              },
              {
                text: "Увімкнути log_statement = 'all', щоб бачити всі запити",
                why: "На 1 400 checkout/с це гігабайти логів за хвилини й додаткове навантаження на диск — посеред інциденту. Топ запитів уже дав pg_stat_statements.",
              },
              {
                text: "Відтворити на локальній базі з тестовими даними",
                why: "На локальній базі з тисячею рядків план буде іншим: ні статистика, ні частка BF2024 не збігаються з продом.",
              },
              {
                text: "Подивитися на CPU подів у Grafana",
                why: "Поди простоюють в очікуванні з'єднання, їхній CPU низький — він нічого не скаже про план запиту в базі.",
              },
            ],
          },
        ],
      },
    },
    {
      id: "index",
      title: "Купон, що з'їв базу",
      story:
        "EXPLAIN на репліці підтвердив гіпотезу: для BF2024 індекс на coupon_id віддає 1,85 млн адрес, і всі вони відсіюються за user_id, щоб знайти один рядок. У вас копія таблиці зі staging — 30 000 рядків, 60 % із них BF2024. Виправте так, щоб перевірка купона стала дешевою.",
      kind: "sqlQuest",
      hints: [
        "Індекс має відповідати на запитання цілком: і купон, і користувач.",
        "Правило «одне використання купона на користувача» можна зробити обмеженням UNIQUE (coupon_id, user_id) — тоді індекс ще й захистить від подвійного використання.",
      ],
      tools: { explain: COUPON_EXPLAIN },
      payload: { task: "boss-data-coupon" },
    },
    {
      id: "oversell",
      title: "Остання PlayStation",
      story:
        "Індекс додано: p99 checkout — 240 мс, з'єднань вистачає. Але служба підтримки пише, що двоє покупців отримали підтвердження на останню PS5 зі складу в Києві. Запустіть лабораторію з тією самою логікою списання залишку.",
      kind: "isolationLab",
      hints: [
        "Обидві транзакції читають qty ще до того, як інша щось записала.",
        "Друга транзакція має або чекати вже на читанні, або перевіряти умову в самому UPDATE.",
      ],
      payload: { lab: "lab-oversell" },
    },
    {
      id: "review",
      title: "Рев'ю хотфіксу",
      story:
        "02:10, усе стабільно. Колега відкриває PR «checkout: hotfix after BF» і просить подивитися, чи нічого не пропущено. Знайдіть три рядки, які покладуть checkout на наступному піку, навіть з новим індексом.",
      kind: "review",
      hints: [
        "Порахуйте бюджет з'єднань: 20 подів і max_connections = 200.",
        "Що відбувається з з'єднанням і заблокованими рядками, поки ми чекаємо на зовнішній сервіс?",
      ],
      payload: {
        prompt: "Знайдіть три рядки, які покладуть checkout на наступному піку.",
        lang: "js",
        code: [
          "// db.js",
          "export const pool = new pg.Pool({ max: 50, connectionTimeoutMillis: 0 });",
          "",
          "// checkout.js",
          "export async function checkout(userId, cartId, couponId) {",
          "  const client = await pool.connect();",
          "  try {",
          '    await client.query("BEGIN");',
          '    const { rows: items } = await client.query("SELECT product_id, qty FROM cart_items WHERE cart_id = $1", [cartId]);',
          "    for (const item of items) {",
          '      const { rows } = await client.query("SELECT * FROM products WHERE id = $1", [item.product_id]);',
          "      item.price = rows[0].price;",
          "    }",
          "    const total = await priceWithCoupon(client, items, userId, couponId);",
          "    const charge = await payments.charge({ userId, amount: total, idempotencyKey: cartId });",
          "    const { rows: [order] } = await client.query(",
          '      "INSERT INTO orders (user_id, total, charge_id) VALUES ($1, $2, $3) RETURNING id",',
          "      [userId, total, charge.id],",
          "    );",
          '    await client.query("COMMIT");',
          "    return order;",
          "  } catch (err) {",
          '    await client.query("ROLLBACK");',
          "    throw err;",
          "  } finally {",
          "    client.release();",
          "  }",
          "}",
        ].join("\n"),
        bad: [
          {
            line: 2,
            why: "20 подів × 50 = 1 000 з'єднань при max_connections = 200 — на першому ж піку частина подів отримає 53300. А connectionTimeoutMillis: 0 означає чекати вільного з'єднання вічно: запит висить до таймауту балансувальника замість швидкої 503. Потрібно: пул за бюджетом (≈ 8 на под або PgBouncer у transaction mode), connectionTimeoutMillis ~2 с і statement_timeout.",
          },
          {
            line: 11,
            why: "N+1: окремий запит на кожну позицію кошика — 12 позицій = 12 round-trip'ів усередині відкритої транзакції (ті самі 118 000 викликів у pg_stat_statements). І SELECT * тягне опис і фото товару заради ціни. Один запит: SELECT id, price FROM products WHERE id = ANY($1).",
          },
          {
            line: 15,
            why: "Платіжний API всередині транзакції: від пів секунди до 30 с мережі, поки з'єднання вилучене з пулу, а змінені рядки заблоковані. Під навантаженням це вичерпує пул незалежно від індексів. Спершу зарезервувати замовлення й закомітити, потім платіж з idempotency key, потім окрема транзакція з підтвердженням.",
          },
        ],
        fine: {
          6: "pool.connect() і один client на всю транзакцію — правильно: BEGIN, запити й COMMIT мають іти через одне з'єднання.",
          9: "Параметризований запит, ін'єкції немає; позиції кошика потрібні саме так.",
          23: "ROLLBACK у catch — правильно: інакше з'єднання повернеться в пул з перерваною транзакцією.",
          26: "release() у finally — правильно: з'єднання повертається в пул за будь-якого результату.",
        },
      },
    },
  ],
  postmortem: {
    summary:
      "З 00:00 до 02:10 Чорної п'ятниці checkout працював із p99 до 12 с і до 23 % помилок; близько 18 % спроб оформлення не завершились. Після виправлення індексу з'ясувалось, що двоє покупців отримали підтвердження на ту саму останню одиницю товару.",
    rootCause:
      "Перевірка «чи використовував покупець купон» спиралась на індекс лише за coupon_id. Для BF2024, що став більшістю таблиці, індекс віддавав 1,85 млн адрес, і запит перебирав їх усі, щоб знайти один рядок: ~190 мс в ізоляції й 1,5 с під навантаженням. Кожне з'єднання було зайняте в десятки разів довше, пули вичерпались, а автоскейл лише додав з'єднань до бази, що вже була на межі.",
    contributing: [
      "Бюджет з'єднань ніхто не рахував: 20 подів × пул 50 = 1 000 проти max_connections = 200 — автоскейл перетворив повільність на FATAL: too many clients.",
      "connectionTimeoutMillis = 0: запити чекали з'єднання вічно, тож замість швидких 503 з ретраями клієнти висіли до таймауту балансувальника.",
      "Виклик платіжного API і N+1 по товарах усередині відкритої транзакції подовжували життя кожного з'єднання.",
      "Залишок перевірявся в застосунку на READ COMMITTED — під конкуренцією останні одиниці продались двічі.",
      "Навантажувальний тест ганяли на даних без домінантного купона: план на staging був зовсім іншим, ніж на проді в пік.",
    ],
    actionItems: [
      "UNIQUE (coupon_id, user_id) — і дешевий Index Only Scan, і гарантія «одне використання купона» на рівні бази.",
      "PgBouncer у transaction mode і бюджет з'єднань на дашборді: поди × пул ≤ 80 % max_connections; алерт на waiting > 0 довше хвилини.",
      "connectionTimeoutMillis = 2 000 і statement_timeout = 2 с для ролі checkout: падати швидко, а не накопичувати чергу.",
      "Списання залишку — умовним атомарним UPDATE … WHERE qty >= $1 RETURNING; платіж — поза транзакцією, з idempotency key.",
      "Регулярне рев'ю топу pg_stat_statements, auto_explain для запитів довших за 500 мс і навантажувальний тест на копії проду за маркетинговим сценарієм.",
    ],
    staffView:
      "Жоден окремий компонент не зламався: індекс був, пул був, автоскейл спрацював. Зламалось припущення, що дані завтра розподілені так само, як учора, і що кожен шар можна масштабувати незалежно. Staff-висновок не «додати індекс», а зробити межі явними: бюджет з'єднань — контракт між платформою і сервісами; маркетингова подія на два мільйони людей — вхід для капасіті-планування; бізнес-інваріанти (одне використання купона, не продати більше, ніж є) — у схемі бази, а не в пам'яті розробника.",
  },
};
