/**
 * Сценарії MVCC-лабораторії. У кожного варіанта є `expect` — що має
 * показати симуляція. test/mvcc.test.js звіряє це з реальним прогоном
 * симулятора, тож текст пояснення не може розійтися з поведінкою.
 *
 * Формат запитання — як у картки: options + одна правильна відповідь.
 */

const decrement = (as) => [
  { op: "begin" },
  { op: "read", id: 1, col: "qty", as },
  { op: "update", id: 1, col: "qty", value: { var: as, add: -1 } },
  { op: "commit" },
];

const atomicDecrement = [{ op: "begin" }, { op: "update", id: 1, col: "qty", value: { self: true, add: -1 } }, { op: "commit" }];

const lockedDecrement = (as) => [
  { op: "begin" },
  { op: "readForUpdate", id: 1, col: "qty", as },
  { op: "update", id: 1, col: "qty", value: { var: as, add: -1 } },
  { op: "commit" },
];

export const LABS = {
  "lab-lost-update": {
    title: "Два списання одного товару",
    story:
      "Два покупці одночасно купують останні одиниці товару. Застосунок робить класичне «прочитав — порахував — записав»: читає залишок, віднімає одиницю в JavaScript і пише результат назад.",
    table: { name: "items", columns: ["id", "qty"], rows: [{ id: 1, qty: 10 }] },
    t1: decrement("x"),
    t2: decrement("y"),
    schedule: ["T1", "T2", "T1", "T2", "T1", "T2", "T1", "T2"],
    invariant: {
      type: "sumOfCommitted",
      id: 1,
      col: "qty",
      start: 10,
      perCommit: -1,
      text: "Кожне закомічене списання має зменшити залишок",
    },
    variants: [
      {
        id: "rc",
        label: "READ COMMITTED, read-modify-write у застосунку",
        iso: "RC",
        expect: { anomaly: true, aborted: [] },
        note: "T2 чекає на блокування T1, але потім записує y − 1 = 9 — значення, прочитане ДО коміту T1. Одне списання зникло: це lost update.",
      },
      {
        id: "atomic",
        label: "READ COMMITTED, атомарний UPDATE qty = qty − 1",
        iso: "RC",
        t1: atomicDecrement,
        t2: atomicDecrement,
        expect: { anomaly: false, aborted: [] },
        note: "Postgres після очікування перечитує свіжу версію рядка й віднімає від 9. Арифметика в SQL, а не в застосунку, — найпростіший фікс.",
      },
      {
        id: "for-update",
        label: "READ COMMITTED + SELECT … FOR UPDATE",
        iso: "RC",
        t1: lockedDecrement("x"),
        t2: lockedDecrement("y"),
        expect: { anomaly: false, aborted: [] },
        note: "T2 чекає вже на читанні й отримує свіжий залишок 9. Корисно, коли між читанням і записом є логіка застосунку.",
      },
      {
        id: "rr",
        label: "REPEATABLE READ",
        iso: "RR",
        expect: { anomaly: false, aborted: ["T2"] },
        note: "T2 намагається змінити рядок, який змінила закомічена паралельна транзакція, і отримує serialization error. Даних не втрачено, але застосунок мусить повторити транзакцію.",
      },
    ],
    question: {
      q: "Чому у варіанті READ COMMITTED з read-modify-write загубилося списання, хоча T2 чекала на блокування?",
      options: [
        "Блокування в READ COMMITTED не працюють для UPDATE",
        "T2 записала значення, обчислене в застосунку з даних, прочитаних до коміту T1",
        "Postgres відкотив коміт T1, коли T2 розблокувалась",
        "Лічильник qty не проіндексовано, тож UPDATE пропустив рядок",
      ],
      answer: 1,
      explain:
        "UPDATE справді чекав і справді перечитав свіжу версію рядка — але вираз `SET qty = :y - 1` не залежить від неї: y прочитано раніше. Тому або рахувати в SQL (`qty = qty - 1`), або блокувати на читанні (`FOR UPDATE`), або брати REPEATABLE READ з ретраями.",
    },
  },

  "lab-write-skew": {
    title: "Черговий лікар",
    story:
      "Правило лікарні: на чергуванні завжди хоча б один лікар. Двоє чергових одночасно тиснуть «Піти з чергування». Застосунок перевіряє, що чергових більше одного, і лише тоді знімає свого лікаря.",
    table: {
      name: "doctors",
      columns: ["id", "name", "on_call"],
      rows: [
        { id: 1, name: "Аліса", on_call: true },
        { id: 2, name: "Богдан", on_call: true },
      ],
    },
    t1: [
      { op: "begin" },
      { op: "count", where: { col: "on_call", eq: true }, as: "n" },
      { op: "update", id: 1, col: "on_call", value: { const: false }, if: { var: "n", gt: 1 } },
      { op: "commit" },
    ],
    t2: [
      { op: "begin" },
      { op: "count", where: { col: "on_call", eq: true }, as: "m" },
      { op: "update", id: 2, col: "on_call", value: { const: false }, if: { var: "m", gt: 1 } },
      { op: "commit" },
    ],
    schedule: ["T1", "T2", "T1", "T2", "T1", "T2", "T1", "T2"],
    invariant: { type: "minCount", where: { col: "on_call", eq: true }, min: 1, text: "Хоча б один лікар на чергуванні" },
    variants: [
      {
        id: "rc",
        label: "READ COMMITTED",
        iso: "RC",
        expect: { anomaly: true, aborted: [] },
        note: "Обидві транзакції бачать двох чергових і змінюють різні рядки — блокування не конфліктують. Чергових лишається нуль.",
      },
      {
        id: "rr",
        label: "REPEATABLE READ",
        iso: "RR",
        expect: { anomaly: true, aborted: [] },
        note: "Snapshot isolation не рятує: кожна транзакція пише власний рядок, і конфлікту оновлень немає. Це write skew — аномалія, яку RR у Postgres допускає.",
      },
      {
        id: "ser",
        label: "SERIALIZABLE",
        iso: "SER",
        expect: { anomaly: false, aborted: ["T2"] },
        note: "SSI помічає, що кожна транзакція прочитала те, що змінила інша, і перериває другу при коміті. Потрібен ретрай на рівні застосунку.",
      },
      {
        id: "for-update",
        label: "READ COMMITTED + SELECT … FOR UPDATE по предикату",
        iso: "RC",
        t1: [
          { op: "begin" },
          { op: "countForUpdate", where: { col: "on_call", eq: true }, as: "n" },
          { op: "update", id: 1, col: "on_call", value: { const: false }, if: { var: "n", gt: 1 } },
          { op: "commit" },
        ],
        t2: [
          { op: "begin" },
          { op: "countForUpdate", where: { col: "on_call", eq: true }, as: "m" },
          { op: "update", id: 2, col: "on_call", value: { const: false }, if: { var: "m", gt: 1 } },
          { op: "commit" },
        ],
        expect: { anomaly: false, aborted: [] },
        note: "T2 чекає на блокування рядків, які тримає T1, а після її коміту бачить лише одного чергового — і нічого не змінює.",
      },
    ],
    question: {
      q: "Який найменший рівень ізоляції Postgres сам, без явних блокувань, не допустить цієї аномалії?",
      options: ["READ UNCOMMITTED", "READ COMMITTED", "REPEATABLE READ", "SERIALIZABLE"],
      answer: 3,
      explain:
        "Write skew — транзакції читають спільний предикат і пишуть різні рядки. REPEATABLE READ у Postgres — це snapshot isolation, і він такий сценарій пропускає. Лише SERIALIZABLE (SSI) відстежує rw-залежності й перериває одну з транзакцій. Альтернатива на нижчих рівнях — явне FOR UPDATE або обмеження в схемі.",
    },
  },

  "lab-deadlock": {
    title: "Переказ назустріч",
    story:
      "Аліса переказує Богдану, а Богдан — Алісі, одночасно. Кожна транзакція спершу списує з рахунку відправника, потім зараховує отримувачу.",
    table: {
      name: "accounts",
      columns: ["id", "balance"],
      rows: [
        { id: 1, balance: 100 },
        { id: 2, balance: 100 },
      ],
    },
    t1: [
      { op: "begin" },
      { op: "update", id: 1, col: "balance", value: { self: true, add: -30 } },
      { op: "update", id: 2, col: "balance", value: { self: true, add: 30 } },
      { op: "commit" },
    ],
    t2: [
      { op: "begin" },
      { op: "update", id: 2, col: "balance", value: { self: true, add: -50 } },
      { op: "update", id: 1, col: "balance", value: { self: true, add: 50 } },
      { op: "commit" },
    ],
    schedule: ["T1", "T2", "T1", "T2", "T1", "T2", "T1", "T2"],
    invariant: { type: "total", col: "balance", equals: 200, text: "Гроші не зникають і не з'являються" },
    variants: [
      {
        id: "naive",
        label: "Кожен блокує спершу свій рахунок",
        iso: "RC",
        expect: { anomaly: false, aborted: ["T2"], deadlock: true },
        note: "T1 тримає рахунок 1 і чекає рахунок 2; T2 тримає 2 і чекає 1. Цикл очікування — Postgres за deadlock_timeout перериває одну з транзакцій.",
      },
      {
        id: "ordered",
        label: "Обидві блокують рахунки в порядку id",
        iso: "RC",
        t2: [
          { op: "begin" },
          { op: "update", id: 1, col: "balance", value: { self: true, add: 50 } },
          { op: "update", id: 2, col: "balance", value: { self: true, add: -50 } },
          { op: "commit" },
        ],
        expect: { anomaly: false, aborted: [], deadlock: false },
        note: "Однаковий порядок захоплення блокувань прибирає цикл: T2 просто чекає, доки T1 закомітить.",
      },
    ],
    question: {
      q: "Як прибрати цей дедлок, не змінюючи рівень ізоляції?",
      options: [
        "Збільшити deadlock_timeout, щоб Postgres чекав довше",
        "Оновлювати рахунки завжди в одному порядку, наприклад за зростанням id",
        "Перейти з UPDATE на SELECT … FOR SHARE",
        "Прибрати транзакцію й робити два окремі UPDATE",
      ],
      answer: 1,
      explain:
        "Дедлок — це цикл у графі очікувань. Єдиний порядок захоплення ресурсів робить цикл неможливим. Довший таймаут лише відкладе помилку, а два UPDATE без транзакції зламають атомарність переказу.",
    },
  },

  "lab-oversell": {
    title: "Остання PlayStation",
    story:
      "Чорна п'ятниця, на складі 1 консоль. Checkout перевіряє залишок і, якщо він додатний, списує одиницю — усе в застосунку, на READ COMMITTED. Двоє покупців натискають «Купити» в ту саму мить.",
    table: { name: "stock", columns: ["id", "qty"], rows: [{ id: 1, qty: 1 }] },
    t1: [
      { op: "begin" },
      { op: "read", id: 1, col: "qty", as: "x" },
      { op: "update", id: 1, col: "qty", value: { var: "x", add: -1 }, if: { var: "x", gt: 0 } },
      { op: "commit" },
    ],
    t2: [
      { op: "begin" },
      { op: "read", id: 1, col: "qty", as: "y" },
      { op: "update", id: 1, col: "qty", value: { var: "y", add: -1 }, if: { var: "y", gt: 0 } },
      { op: "commit" },
    ],
    schedule: ["T1", "T2", "T1", "T2", "T1", "T2", "T1", "T2"],
    invariant: { type: "sumOfCommitted", id: 1, col: "qty", start: 1, perCommit: -1, text: "Скільки продали — стільки й списали" },
    variants: [
      {
        id: "rc",
        label: "Як зараз у проді",
        iso: "RC",
        expect: { anomaly: true, aborted: [] },
        note: "Обидві транзакції побачили qty = 1 і обидві «продали». Одну консоль продано двічі.",
      },
      {
        id: "for-update",
        label: "SELECT … FOR UPDATE перед перевіркою",
        iso: "RC",
        t1: [
          { op: "begin" },
          { op: "readForUpdate", id: 1, col: "qty", as: "x" },
          { op: "update", id: 1, col: "qty", value: { var: "x", add: -1 }, if: { var: "x", gt: 0 } },
          { op: "commit" },
        ],
        t2: [
          { op: "begin" },
          { op: "readForUpdate", id: 1, col: "qty", as: "y" },
          { op: "update", id: 1, col: "qty", value: { var: "y", add: -1 }, if: { var: "y", gt: 0 } },
          { op: "commit" },
        ],
        expect: { anomaly: false, aborted: [] },
        note: "Друга транзакція чекає на читанні, бачить qty = 0 і не продає.",
      },
    ],
    question: {
      q: "Який фікс checkout прибирає overselling і не вимагає ретраїв у застосунку?",
      options: [
        "Перейти на REPEATABLE READ",
        "Перевіряти залишок двічі — до й після UPDATE",
        "Читати залишок через SELECT … FOR UPDATE (або UPDATE … WHERE qty > 0 RETURNING)",
        "Кешувати залишок у Redis на 5 секунд",
      ],
      answer: 2,
      explain:
        "FOR UPDATE серіалізує покупців на рядку товару: другий чекає й бачить уже нульовий залишок. Ще коротше — умовний атомарний UPDATE stock SET qty = qty − 1 WHERE id = 1 AND qty > 0 і перевірка кількості змінених рядків. REPEATABLE READ теж не дасть продати двічі, але друга транзакція впаде з serialization error, і її доведеться повторювати.",
    },
  },
};
