/**
 * SQL-задачі (PGlite) і датасети акту «Дані».
 *
 * Сід — лише арифметика: множення на прості числа за модулем дає
 * «перемішані», але відтворювані дані. Жодного random() і now() у сіді:
 * план і результат мають бути однаковими в кожного гравця.
 */

const SHOP_SETUP = `
CREATE TABLE users (
  id         int PRIMARY KEY,
  email      text NOT NULL,
  name       text NOT NULL,
  country    text NOT NULL,
  created_at timestamptz NOT NULL
);
INSERT INTO users
SELECT i,
       CASE WHEN i % 9 = 0 THEN 'User' || i || '@Shop.ua' ELSE 'user' || i || '@shop.ua' END,
       (ARRAY['Олена','Андрій','Марія','Тарас','Ірина','Богдан','Софія','Дмитро','Юлія','Максим'])[1 + i % 10] || ' ' ||
       (ARRAY['Коваль','Шевченко','Бондар','Мельник','Ткаченко','Кравець','Олійник','Лисенко','Руденко'])[1 + (i / 10) % 9],
       (ARRAY['UA','UA','PL','UA','DE','UA','CZ','UA','PL','UA'])[1 + (i * 7) % 10],
       timestamptz '2024-01-01 00:00' + (i - 1) * interval '25 minutes'
FROM generate_series(1, 20000) AS i;

CREATE TABLE products (
  id       int PRIMARY KEY,
  name     text NOT NULL,
  category text NOT NULL,
  price    numeric(10,2) NOT NULL CHECK (price > 0)
);
INSERT INTO products
SELECT i,
       (ARRAY['Ноутбук','Смартфон','Навушники','Консоль','Монітор','Книга','Кава','Настільна гра','Велосипед','Рюкзак'])[1 + (i - 1) % 10]
         || ' ' || chr(65 + (i * 7) % 26) || (100 + i),
       (ARRAY['Ноутбуки','Смартфони','Навушники','Консолі','Монітори','Книги','Кава','Настільні ігри','Велосипеди','Рюкзаки'])[1 + (i - 1) % 10],
       ((ARRAY[32000, 18000, 2500, 21000, 9000, 450, 380, 1200, 15000, 1800])[1 + (i - 1) % 10] * (80 + (i * 13) % 41) / 100)::numeric - 0.01
FROM generate_series(1, 500) AS i;

CREATE TABLE order_items (
  id         int PRIMARY KEY,
  order_id   int NOT NULL,
  product_id int NOT NULL REFERENCES products (id),
  qty        int NOT NULL CHECK (qty > 0),
  price      numeric(10,2) NOT NULL
);
INSERT INTO order_items
SELECT j, 1 + (j - 1) % 20000, p.id,
       CASE WHEN j % 11 = 0 THEN 3 WHEN j % 4 = 0 THEN 2 ELSE 1 END,
       p.price
FROM generate_series(1, 30000) AS j
JOIN products p ON p.id = 1 + (j * 7919) % 500;

CREATE TABLE orders (
  id         int PRIMARY KEY,
  user_id    int NOT NULL REFERENCES users (id),
  status     text NOT NULL CHECK (status IN ('paid', 'shipped', 'delivered', 'cancelled')),
  total      numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL
);
INSERT INTO orders
SELECT o,
       1 + ((o * 7919) % 400) * 2,
       (ARRAY['delivered','paid','delivered','shipped','cancelled','delivered','delivered','paid','shipped','delivered'])[1 + (o / 3) % 10],
       t.total,
       timestamptz '2024-02-01 00:00' + ((o * 7919) % 20000) * interval '23 minutes'
FROM generate_series(1, 20000) AS o
JOIN (SELECT order_id, sum(qty * price) AS total FROM order_items GROUP BY order_id) AS t ON t.order_id = o;
ALTER TABLE order_items ADD FOREIGN KEY (order_id) REFERENCES orders (id);

CREATE FUNCTION probe(VARIADIC stmts text[]) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  stmt text;
BEGIN
  BEGIN
    FOREACH stmt IN ARRAY stmts LOOP
      EXECUTE stmt;
    END LOOP;
    RAISE SQLSTATE 'PROBE';
  EXCEPTION
    WHEN SQLSTATE 'PROBE' THEN RETURN 'ok';
    WHEN OTHERS THEN RETURN SQLSTATE;
  END;
END
$$;

ANALYZE;
`;

const BLACKFRIDAY_SETUP = `
CREATE TABLE coupons (
  id      int PRIMARY KEY,
  code    text NOT NULL UNIQUE,
  percent int NOT NULL CHECK (percent BETWEEN 1 AND 90)
);
INSERT INTO coupons VALUES
  (1, 'BF2024', 30), (2, 'WELCOME10', 10), (3, 'SPRING15', 15), (4, 'STUDENT', 12), (5, 'COFFEE5', 5), (6, 'BOOKS20', 20),
  (7, 'BIKE10', 10), (8, 'GAMER15', 15), (9, 'LOYAL25', 25), (10, 'APP7', 7), (11, 'BIRTHDAY', 20), (12, 'REVIEW5', 5);

CREATE TABLE coupon_redemptions (
  id          int PRIMARY KEY,
  coupon_id   int NOT NULL REFERENCES coupons (id),
  user_id     int NOT NULL,
  order_id    int NOT NULL,
  redeemed_at timestamptz NOT NULL
);
INSERT INTO coupon_redemptions
SELECT i,
       CASE WHEN i <= 18000 THEN 1 ELSE 2 + i % 11 END,
       CASE WHEN i <= 18000 THEN 1 + (i * 7919) % 20000 ELSE 1 + (i * 7907) % 20000 END,
       100000 + i,
       timestamptz '2024-11-29 00:00' + i * interval '2 seconds'
FROM generate_series(1, 30000) AS i;
CREATE INDEX coupon_redemptions_coupon_id_idx ON coupon_redemptions (coupon_id);

ANALYZE;
`;

export const DATASETS = {
  shop: {
    title: "Інтернет-магазин",
    tables: [
      { name: "users", columns: "id, email, name, country, created_at — 20 000 покупців; email у різному регістрі" },
      { name: "products", columns: "id, name, category, price — 500 товарів у 10 категоріях" },
      { name: "orders", columns: "id, user_id → users, status (paid | shipped | delivered | cancelled), total, created_at — 20 000 замовлень" },
      { name: "order_items", columns: "id, order_id → orders, product_id → products, qty, price (ціна на момент покупки) — 30 000 позицій" },
      { name: "probe(VARIADIC text[])", columns: "функція-помічник: виконує інструкції, відкочує їх і повертає 'ok' або SQLSTATE помилки" },
    ],
    setup: SHOP_SETUP,
  },
  blackfriday: {
    title: "Checkout у Чорну п'ятницю",
    tables: [
      { name: "coupons", columns: "id, code, percent — 12 купонів; BF2024 — id 1" },
      {
        name: "coupon_redemptions",
        columns: "id, coupon_id → coupons, user_id, order_id, redeemed_at — 30 000 використань, 60 % із них — BF2024; індекс лише на coupon_id",
      },
    ],
    setup: BLACKFRIDAY_SETUP,
  },
};

const COMPOSITE_QUERY =
  "SELECT id, status, total, created_at FROM orders WHERE user_id = 301 AND created_at > '2024-06-01' ORDER BY created_at DESC LIMIT 20";
const LOGIN_QUERY = "SELECT id, name FROM users WHERE lower(email) = lower('user4509@shop.ua')";
const COUPON_QUERY = "SELECT count(*) FROM coupon_redemptions WHERE coupon_id = 1 AND user_id = 4242";
const cart = (values) => `$$INSERT INTO cart_items (user_id, product_id, qty) VALUES (${values})$$`;

export const SQL = {
  "db-modeling": {
    title: "Кошик, у який не пролізе сміття",
    dataset: "shop",
    brief:
      "Перепишіть CREATE TABLE cart_items так, щоб база сама відкидала:\n" +
      "• позицію без кількості чи без користувача;\n" +
      "• кількість 0 і менше;\n" +
      "• другий рядок для тієї самої пари (user_id, product_id);\n" +
      "• неіснуючий товар чи користувача.\n\n" +
      "Вставка `INSERT INTO cart_items (user_id, product_id, qty) VALUES (1, 1, 2)` має проходити — інші колонки (id, added_at) заповнюються самі або їх немає.\n\n" +
      "Перевірка викликає probe() для семи вставок у такому порядку: qty NULL, qty 0, user_id NULL, дублікат пари, неіснуючий товар, неіснуючий користувач, коректна. Очікує 23502, 23514, 23502, 23505, 23503, 23503, ok. Спробуйте самі: `SELECT probe($$INSERT INTO cart_items (user_id, product_id, qty) VALUES (1, 1, 0)$$);`",
    starter: [
      "-- Таблиця кошика: зараз база приймає будь-що.",
      "CREATE TABLE cart_items (",
      "  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,",
      "  user_id    int,",
      "  product_id int,",
      "  qty        int,",
      "  added_at   timestamptz DEFAULT now()",
      ");",
    ].join("\n"),
    reference: [
      "CREATE TABLE cart_items (",
      "  user_id    int NOT NULL REFERENCES users (id) ON DELETE CASCADE,",
      "  product_id int NOT NULL REFERENCES products (id),",
      "  qty        int NOT NULL CHECK (qty > 0),",
      "  added_at   timestamptz NOT NULL DEFAULT now(),",
      "  PRIMARY KEY (user_id, product_id)",
      ");",
    ].join("\n"),
    naive: [
      "CREATE TABLE cart_items (",
      "  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,",
      "  user_id    int REFERENCES users (id),",
      "  product_id int REFERENCES products (id),",
      "  qty        int CHECK (qty > 0),",
      "  added_at   timestamptz DEFAULT now(),",
      "  UNIQUE (user_id, product_id)",
      ");",
    ].join("\n"),
    check: {
      type: "state",
      verify: [
        "SELECT",
        `  probe(${cart("1, 1, NULL")}) AS qty_null,`,
        `  probe(${cart("1, 1, 0")}) AS qty_zero,`,
        `  probe(${cart("NULL, 1, 1")}) AS user_null,`,
        `  probe(${cart("1, 1, 1")}, ${cart("1, 1, 2")}) AS duplicate,`,
        `  probe(${cart("1, 999999, 1")}) AS no_product,`,
        `  probe(${cart("999999, 1, 1")}) AS no_user,`,
        `  probe(${cart("1, 1, 2")}) AS valid`,
      ].join("\n"),
      rows: [["23502", "23514", "23502", "23505", "23503", "23503", "ok"]],
    },
    bonus: {
      type: "state",
      verify: [
        "SELECT probe(",
        "  $$INSERT INTO users (id, email, name, country, created_at) VALUES (20001, 'leaver@shop.ua', 'Тимчасовий Акаунт', 'UA', '2024-12-31')$$,",
        `  ${cart("20001, 1, 1")},`,
        "  $$DELETE FROM users WHERE id = 20001$$",
        ") AS delete_user_with_cart",
      ].join("\n"),
      rows: [["ok"]],
    },
  },

  "db-joins": {
    title: "Звіт для реактивації",
    dataset: "shop",
    brief:
      "Для кожного користувача з України (`country = 'UA'`), що зареєструвався 5–6 січня 2024 (`created_at >= '2024-01-05' AND created_at < '2024-01-07'`), виведіть чотири колонки: id, name, кількість нескасованих замовлень і їхню суму (`total`).\n\n" +
      "Скасовані — `status = 'cancelled'`, вони не рахуються ні в кількості, ні в сумі. Ті, хто не купив нічого, — теж у списку, з 0 і 0: лист пишеться саме для них.",
    starter: [
      "-- id, name, кількість нескасованих замовлень, їхня сума",
      "SELECT u.id, u.name",
      "FROM users u",
      "WHERE u.country = 'UA'",
      "  AND u.created_at >= '2024-01-05' AND u.created_at < '2024-01-07';",
    ].join("\n"),
    reference: [
      "SELECT u.id, u.name,",
      "       count(o.id)               AS orders,",
      "       COALESCE(sum(o.total), 0) AS revenue",
      "FROM users u",
      "LEFT JOIN orders o",
      "       ON o.user_id = u.id",
      "      AND o.status <> 'cancelled'",
      "WHERE u.country = 'UA'",
      "  AND u.created_at >= '2024-01-05' AND u.created_at < '2024-01-07'",
      "GROUP BY u.id, u.name",
      "ORDER BY revenue DESC, u.id;",
    ].join("\n"),
    naive: [
      "SELECT u.id, u.name, count(*) AS orders, COALESCE(sum(o.total), 0) AS revenue",
      "FROM users u",
      "LEFT JOIN orders o ON o.user_id = u.id",
      "WHERE u.country = 'UA'",
      "  AND u.created_at >= '2024-01-05' AND u.created_at < '2024-01-07'",
      "  AND o.status <> 'cancelled'",
      "GROUP BY u.id, u.name;",
    ].join("\n"),
    check: { type: "result" },
    bonus: { type: "result", ordered: true },
  },

  "db-window": {
    title: "Лідери продажів у кожній категорії",
    dataset: "shop",
    brief:
      "Для головної сторінки потрібні три найприбутковіші товари в кожній із 10 категорій. Виручка товару — `sum(qty * price)` з order_items, лише з нескасованих замовлень.\n\n" +
      "Колонки: category, name, revenue, place (1–3). Рівно три товари на категорію. Якщо виручка однакова, вище товар із меншим `products.id` — так місця не «стрибають» між оновленнями сторінки.",
    starter: [
      "-- Виручка кожного товару вже рахується, але LIMIT 3 бере трійку на весь магазин.",
      "SELECT p.category, p.name, sum(oi.qty * oi.price) AS revenue",
      "FROM order_items oi",
      "JOIN products p ON p.id = oi.product_id",
      "JOIN orders o ON o.id = oi.order_id",
      "WHERE o.status <> 'cancelled'",
      "GROUP BY p.category, p.id, p.name",
      "ORDER BY revenue DESC",
      "LIMIT 3;",
    ].join("\n"),
    reference: [
      "WITH revenue AS (",
      "  SELECT p.category, p.id, p.name, sum(oi.qty * oi.price) AS revenue",
      "  FROM order_items oi",
      "  JOIN products p ON p.id = oi.product_id",
      "  JOIN orders o ON o.id = oi.order_id",
      "  WHERE o.status <> 'cancelled'",
      "  GROUP BY p.category, p.id, p.name",
      "), ranked AS (",
      "  SELECT category, name, revenue,",
      "         row_number() OVER (PARTITION BY category ORDER BY revenue DESC, id) AS place",
      "  FROM revenue",
      ")",
      "SELECT category, name, revenue, place",
      "FROM ranked",
      "WHERE place <= 3",
      "ORDER BY category, place;",
    ].join("\n"),
    naive: [
      "WITH revenue AS (",
      "  SELECT p.category, p.id, p.name, sum(oi.qty * oi.price) AS revenue",
      "  FROM order_items oi",
      "  JOIN products p ON p.id = oi.product_id",
      "  JOIN orders o ON o.id = oi.order_id",
      "  WHERE o.status <> 'cancelled'",
      "  GROUP BY p.category, p.id, p.name",
      ")",
      "SELECT category, name, revenue, place",
      "FROM (SELECT *, rank() OVER (PARTITION BY category ORDER BY revenue DESC) AS place FROM revenue) r",
      "WHERE place <= 3;",
    ].join("\n"),
    check: { type: "result" },
    bonus: { type: "result", ordered: true },
  },

  "db-index": {
    title: "Логін, що читає всіх",
    dataset: "shop",
    brief:
      "Ендпоінт POST /api/login шукає користувача так:\n\n" +
      "`SELECT id, name FROM users WHERE lower(email) = lower($1)`\n\n" +
      "Створіть індекс, з яким цей запит перестане робити Seq Scan по users. Перевірка запускає EXPLAIN для `lower('user4509@shop.ua')` — у базі цей користувач збережений як User4509@Shop.ua.",
    starter: ["-- Подивіться на план до і після:", `EXPLAIN ${LOGIN_QUERY};`].join("\n"),
    reference: "CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));",
    naive: "CREATE INDEX users_email_idx ON users (email);",
    check: { type: "plan", query: LOGIN_QUERY, expect: { forbid: [{ node: "Seq Scan", relation: "users" }] } },
    bonus: {
      type: "error",
      probe: "INSERT INTO users (id, email, name, country, created_at) VALUES (20001, 'USER4509@SHOP.UA', 'Двійник', 'UA', '2024-12-31')",
      sqlstate: "23505",
    },
  },

  "db-composite": {
    title: "«Мої замовлення» без сортування",
    dataset: "shop",
    brief:
      "Сторінка «Мої замовлення» показує 20 останніх замовлень користувача за період:\n\n" +
      "`SELECT id, status, total, created_at FROM orders WHERE user_id = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 20`\n\n" +
      "Індексу на orders.user_id немає: FOREIGN KEY його не створює. Потрібен індекс, з яким план не робить Seq Scan по orders, а оцінка вартості — не більше 150. Перевірка — для user_id = 301 і дати '2024-06-01'.",
    starter: ["-- План зараз: Seq Scan + Sort. Подивіться, що зміниться:", `EXPLAIN ${COMPOSITE_QUERY};`].join("\n"),
    reference: "CREATE INDEX orders_user_created_idx ON orders (user_id, created_at);",
    naive: "CREATE INDEX orders_created_user_idx ON orders (created_at, user_id);",
    check: {
      type: "plan",
      query: COMPOSITE_QUERY,
      expect: { forbid: [{ node: "Seq Scan", relation: "orders" }], maxCost: 150 },
    },
    bonus: { type: "plan", query: COMPOSITE_QUERY, expect: { forbid: [{ node: "Sort" }, { node: "Seq Scan", relation: "orders" }], maxCost: 150 } },
  },

  "boss-data-coupon": {
    title: "Купон, що з'їв базу",
    dataset: "blackfriday",
    brief:
      "Checkout перед оплатою перевіряє, чи не використовував покупець купон раніше:\n\n" +
      "`SELECT count(*) FROM coupon_redemptions WHERE coupon_id = $1 AND user_id = $2`\n\n" +
      "Індекс на coupon_id є, але 60 % таблиці — BF2024. Зробіть так, щоб перевірка для BF2024 не робила Seq Scan і коштувала за оцінкою планувальника не більше 20. Перевірка — для coupon_id = 1 і user_id = 4242.",
    starter: ["-- План зараз: індекс на coupon_id + Filter по user_id.", `EXPLAIN ${COUPON_QUERY};`].join("\n"),
    reference: "ALTER TABLE coupon_redemptions ADD CONSTRAINT coupon_redemptions_once_per_user UNIQUE (coupon_id, user_id);",
    naive: "REINDEX INDEX coupon_redemptions_coupon_id_idx;",
    check: {
      type: "plan",
      query: COUPON_QUERY,
      expect: { forbid: [{ node: "Seq Scan", relation: "coupon_redemptions" }], maxCost: 20 },
    },
    bonus: {
      type: "error",
      probe: "INSERT INTO coupon_redemptions (id, coupon_id, user_id, order_id, redeemed_at) VALUES (30001, 1, 4242, 999999, '2024-11-29 12:00')",
      sqlstate: "23505",
    },
  },
};
