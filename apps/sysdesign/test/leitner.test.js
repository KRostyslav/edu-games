/**
 * Тести інтервального повторення: переходи коробок, розклад, ліміти сесії,
 * детермінізм перемішування, серія днів і стійкість до сміття у сховищі.
 *
 * Картки тут синтетичні: логіка Leitner не повинна залежати від змісту
 * колоди. Реальний QUIZ з'являється лише в одному тесті — щоб переконатися,
 * що перша сесія новачка справді починається з основ.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  INTERVALS,
  MAX_BOX,
  NEW_PER_DAY,
  SESSION_LIMIT,
  answerCard,
  boxStats,
  currentStreak,
  dueCards,
  dueCount,
  newCardsLeft,
  nextDue,
  nextStreak,
  topicProgress,
} from "../src/progress/leitner.js";
import { QUIZ } from "../src/data/quiz.js";

const TODAY = 20_000;

/** Колода з n карток: t0-1, t0-2, t0-3, t1-1… — по три на тему, як у справжній. */
function deck(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `t${Math.floor(i / 3)}-${(i % 3) + 1}`, topic: `t${Math.floor(i / 3)}` }));
}

const ids = (cards) => cards.map((card) => card.id);
const entry = (box, due, seen = 1, correct = 0) => ({ box, due, seen, correct });

describe("answerCard: переходи коробок", () => {
  test("нова картка: правильно → коробка 2, неправильно → коробка 1", () => {
    assert.deepEqual(answerCard(undefined, true, TODAY), { box: 2, due: TODAY + 1, seen: 1, correct: 1 });
    assert.deepEqual(answerCard(undefined, false, TODAY), { box: 1, due: TODAY, seen: 1, correct: 0 });
  });

  test("правильні відповіді ведуть до коробки 5 і там зупиняються", () => {
    let current;
    const path = [];
    for (let i = 0; i < 7; i += 1) {
      current = answerCard(current, true, TODAY);
      path.push(current.box);
    }
    assert.deepEqual(path, [2, 3, 4, 5, 5, 5, 5]);
    assert.equal(current.seen, 7);
    assert.equal(current.correct, 7);
  });

  test("помилка з будь-якої коробки повертає в 1", () => {
    for (let box = 1; box <= MAX_BOX; box += 1) {
      const next = answerCard(entry(box, TODAY, 5, 4), false, TODAY);
      assert.equal(next.box, 1);
      assert.equal(next.seen, 6);
      assert.equal(next.correct, 4);
    }
  });

  test("старий запис не мутується", () => {
    const before = entry(3, TODAY, 2, 2);
    const copy = { ...before };
    answerCard(before, true, TODAY);
    assert.deepEqual(before, copy);
  });

  test("зіпсований запис поводиться як нова картка або обрізається до меж", () => {
    assert.equal(answerCard(null, true, TODAY).box, 2);
    assert.equal(answerCard("box 3", true, TODAY).box, 2);
    assert.equal(answerCard({ box: 99, due: "x" }, true, TODAY).box, 5);
    assert.equal(answerCard({ box: -4 }, true, TODAY).box, 2);
    assert.deepEqual(answerCard({ box: NaN, seen: -3, correct: "7" }, false, TODAY), { box: 1, due: TODAY, seen: 1, correct: 0 });
  });
});

describe("розклад due", () => {
  test("due = today + INTERVALS[box − 1] для кожної коробки", () => {
    assert.deepEqual(INTERVALS, [0, 1, 3, 7, 14]);
    for (let from = 0; from < MAX_BOX; from += 1) {
      const prev = from === 0 ? undefined : entry(from, TODAY);
      const next = answerCard(prev, true, TODAY);
      assert.equal(next.due, TODAY + INTERVALS[next.box - 1], `з коробки ${from}`);
    }
  });

  test("помилкова картка чекає вже сьогодні, правильна — не раніше завтра", () => {
    const cards = deck(2);
    const boxes = {
      [cards[0].id]: answerCard(undefined, false, TODAY),
      [cards[1].id]: answerCard(undefined, true, TODAY),
    };
    assert.deepEqual(ids(dueCards(boxes, cards, TODAY, { newLimit: 0 })), [cards[0].id]);
    assert.deepEqual(ids(dueCards(boxes, cards, TODAY + 1, { newLimit: 0 })).sort(), ids(cards).sort());
  });

  test("місяць ідеальних відповідей: картка доходить до коробки 5 за 1+3+7 днів", () => {
    const cards = deck(1);
    let boxes = {};
    const answeredOn = [];
    for (let day = TODAY; day < TODAY + 30; day += 1) {
      for (const card of dueCards(boxes, cards, day)) {
        boxes = { ...boxes, [card.id]: answerCard(boxes[card.id], true, day) };
        answeredOn.push(day - TODAY);
      }
    }
    // день 0: 1→2, день 1: 2→3, день 4: 3→4, день 11: 4→5, день 25: 5→5.
    assert.deepEqual(answeredOn, [0, 1, 4, 11, 25]);
    assert.equal(boxes[cards[0].id].box, 5);
  });

  test("nextDue знаходить найближчий день після сьогодні", () => {
    const cards = deck(4);
    const boxes = {
      [cards[0].id]: entry(1, TODAY),
      [cards[1].id]: entry(3, TODAY + 3),
      [cards[2].id]: entry(2, TODAY + 1),
      [cards[3].id]: entry(2, TODAY + 1),
    };
    assert.deepEqual(nextDue(boxes, cards, TODAY), { day: TODAY + 1, count: 2 });
    assert.equal(nextDue({}, cards, TODAY), null);
  });
});

describe("dueCards: порядок і ліміти сесії", () => {
  const cards = deck(30);
  // 0..5 — прострочені в коробках 3,1,2,1,5,4; 6..9 — ще не час; 10..29 — нові.
  const boxes = {
    [cards[0].id]: entry(3, TODAY - 2),
    [cards[1].id]: entry(1, TODAY),
    [cards[2].id]: entry(2, TODAY - 1),
    [cards[3].id]: entry(1, TODAY - 5),
    [cards[4].id]: entry(5, TODAY),
    [cards[5].id]: entry(4, TODAY - 1),
    [cards[6].id]: entry(1, TODAY + 1),
    [cards[7].id]: entry(2, TODAY + 1),
    [cards[8].id]: entry(4, TODAY + 7),
    [cards[9].id]: entry(5, TODAY + 14),
  };

  test("спершу прострочені від нижчої коробки до вищої, потім нові", () => {
    const session = dueCards(boxes, cards, TODAY);
    const boxOf = (card) => boxes[card.id]?.box ?? 0;
    const reviews = session.slice(0, 6);
    assert.deepEqual(reviews.map(boxOf), [1, 1, 2, 3, 4, 5]);
    assert.ok(session.slice(6).every((card) => !boxes[card.id]), "після повторів — лише нові");
  });

  test("картки, яким ще не час, не потрапляють у сесію", () => {
    const session = ids(dueCards(boxes, cards, TODAY, { newLimit: 0 }));
    for (const id of ids(cards.slice(6, 10))) assert.ok(!session.includes(id), id);
  });

  test("нових не більше newLimit і беруться з початку колоди", () => {
    const session = dueCards(boxes, cards, TODAY, { newLimit: 5 });
    const fresh = ids(session.filter((card) => !boxes[card.id]));
    assert.equal(fresh.length, 5);
    assert.deepEqual(fresh.slice().sort(), ids(cards.slice(10, 15)).sort());
    assert.equal(dueCards(boxes, cards, TODAY).length, 6 + NEW_PER_DAY);
  });

  test("загальний limit обрізає спершу нові, потім повтори", () => {
    assert.equal(dueCards(boxes, cards, TODAY, { limit: 8, newLimit: 8 }).length, 8);
    const tight = dueCards(boxes, cards, TODAY, { limit: 4 });
    assert.equal(tight.length, 4);
    assert.ok(tight.every((card) => boxes[card.id]), "борг повторів важливіший за нові");
    assert.deepEqual(dueCards(boxes, cards, TODAY, { limit: 0 }), []);
  });

  test("типовий ліміт — SESSION_LIMIT навіть при великому боргу", () => {
    const big = deck(60);
    const allDue = Object.fromEntries(big.map((card) => [card.id, entry(1, TODAY - 1)]));
    assert.equal(dueCards(allDue, big, TODAY).length, SESSION_LIMIT);
    // А лічильник показує весь борг, щоб бейдж не брехав.
    assert.equal(dueCount(allDue, big, TODAY), 60);
  });

  test("dueCount = прострочені + нові до newLimit", () => {
    assert.equal(dueCount(boxes, cards, TODAY), 6 + NEW_PER_DAY);
    assert.equal(dueCount(boxes, cards, TODAY, { newLimit: 0 }), 6);
    assert.equal(dueCount(boxes, cards, TODAY, { newLimit: 100 }), 6 + 20);
    assert.equal(dueCount(boxes, cards, TODAY, { newLimit: 3 }), dueCards(boxes, cards, TODAY, { newLimit: 3 }).length);
  });

  test("вхідні масиви не змінюються", () => {
    const before = ids(cards);
    dueCards(boxes, cards, TODAY);
    assert.deepEqual(ids(cards), before);
  });
});

describe("детермінізм перемішування", () => {
  const cards = deck(24);
  const boxes = Object.fromEntries(cards.map((card, i) => [card.id, entry((i % 3) + 1, TODAY - 1)]));

  test("однакове зерно — однаковий порядок, без Math.random", () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error("Math.random заборонено");
    };
    try {
      const a = ids(dueCards(boxes, cards, TODAY));
      const b = ids(dueCards(boxes, cards, TODAY));
      const c = ids(dueCards(boxes, cards, TODAY + 5, { seed: TODAY }));
      assert.deepEqual(a, b);
      assert.deepEqual(a, c, "порядок залежить від seed, а не від дня");
    } finally {
      Math.random = original;
    }
  });

  test("різні зерна дають різний порядок, але той самий набір", () => {
    // Без ліміту: 24 картки > 20, і те, які з коробки 3 обріжуться, теж залежить від зерна.
    const orders = new Set();
    const base = ids(dueCards(boxes, cards, TODAY, { limit: Infinity })).sort();
    for (let seed = 0; seed < 10; seed += 1) {
      const session = ids(dueCards(boxes, cards, TODAY, { seed, limit: Infinity }));
      assert.deepEqual(session.slice().sort(), base);
      orders.add(session.join(","));
    }
    assert.ok(orders.size >= 8, `лише ${orders.size} різних порядків з 10`);
    // Рядкове зерно (наприклад, id теми) теж працює.
    assert.deepEqual(ids(dueCards(boxes, cards, TODAY, { seed: "http" })), ids(dueCards(boxes, cards, TODAY, { seed: "http" })));
  });

  test("перемішування не виходить за межі коробки", () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const boxesInOrder = dueCards(boxes, cards, TODAY, { seed }).map((card) => boxes[card.id].box);
      assert.deepEqual(boxesInOrder, boxesInOrder.slice().sort((a, b) => a - b));
    }
  });

  test("перемішування справді перемішує: не завжди порядок колоди", () => {
    const deckOrder = ids(cards.filter((card) => boxes[card.id].box === 1)).join(",");
    let shuffled = 0;
    for (let seed = 0; seed < 10; seed += 1) {
      const box1 = ids(dueCards(boxes, cards, TODAY, { seed }).filter((card) => boxes[card.id].box === 1));
      if (box1.join(",") !== deckOrder) shuffled += 1;
    }
    assert.ok(shuffled >= 8, `перемішано лише ${shuffled} з 10`);
  });
});

describe("серія днів", () => {
  test("вчора → +1", () => {
    assert.deepEqual(nextStreak({ lastDay: TODAY - 1, streak: 4 }, TODAY), { streak: 5, lastDay: TODAY });
  });

  test("сьогодні → без змін (ідемпотентно в межах дня)", () => {
    const quiz = { lastDay: TODAY, streak: 4 };
    assert.deepEqual(nextStreak(quiz, TODAY), { streak: 4, lastDay: TODAY });
    assert.deepEqual(nextStreak(nextStreak(quiz, TODAY), TODAY), { streak: 4, lastDay: TODAY });
  });

  test("пропуск дня → 1", () => {
    assert.deepEqual(nextStreak({ lastDay: TODAY - 2, streak: 30 }, TODAY), { streak: 1, lastDay: TODAY });
  });

  test("перша відповідь у житті → 1", () => {
    assert.deepEqual(nextStreak({ lastDay: null, streak: 0 }, TODAY), { streak: 1, lastDay: TODAY });
    assert.deepEqual(nextStreak(undefined, TODAY), { streak: 1, lastDay: TODAY });
    assert.deepEqual(nextStreak({ lastDay: "вчора", streak: "5" }, TODAY), { streak: 1, lastDay: TODAY });
  });

  test("годинник відкотився назад — серію не ламаємо", () => {
    assert.deepEqual(nextStreak({ lastDay: TODAY + 1, streak: 3 }, TODAY), { streak: 3, lastDay: TODAY + 1 });
  });

  test("тиждень поспіль, потім пропуск", () => {
    let quiz = { lastDay: null, streak: 0 };
    for (let day = TODAY; day < TODAY + 7; day += 1) {
      quiz = nextStreak(quiz, day);
      quiz = nextStreak(quiz, day); // друга відповідь того ж дня
    }
    assert.equal(quiz.streak, 7);
    assert.equal(nextStreak(quiz, TODAY + 9).streak, 1);
  });

  test("currentStreak обнуляє обірвану серію лише для показу", () => {
    assert.equal(currentStreak({ lastDay: TODAY, streak: 3 }, TODAY), 3);
    assert.equal(currentStreak({ lastDay: TODAY - 1, streak: 3 }, TODAY), 3);
    assert.equal(currentStreak({ lastDay: TODAY - 2, streak: 3 }, TODAY), 0);
    assert.equal(currentStreak({ lastDay: null, streak: 0 }, TODAY), 0);
    assert.equal(currentStreak(undefined, TODAY), 0);
  });
});

describe("денний ліміт нових", () => {
  test("картки, вперше побачені сьогодні, займають місця нових", () => {
    const cards = deck(20);
    const boxes = {
      [cards[0].id]: answerCard(undefined, true, TODAY), // нова сьогодні, правильно
      [cards[1].id]: answerCard(undefined, false, TODAY), // нова сьогодні, помилка
      [cards[2].id]: answerCard(undefined, true, TODAY - 1), // вчорашня
      [cards[3].id]: answerCard(undefined, false, TODAY - 3), // давня помилка
      [cards[4].id]: entry(3, TODAY + 2, 4, 3), // стара знайома
    };
    assert.equal(newCardsLeft(boxes, cards, TODAY), NEW_PER_DAY - 2);
    assert.equal(newCardsLeft(boxes, cards, TODAY + 1), NEW_PER_DAY);
    assert.equal(newCardsLeft(boxes, cards, TODAY, 1), 0);
    assert.equal(newCardsLeft({}, cards, TODAY), NEW_PER_DAY);
  });

  test("виправлена сьогодні помилка не звільняє місце для нової", () => {
    const cards = deck(20);
    const id = cards[0].id;
    let boxes = { [id]: answerCard(undefined, false, TODAY) };
    assert.equal(newCardsLeft(boxes, cards, TODAY), NEW_PER_DAY - 1);
    boxes = { [id]: answerCard(boxes[id], false, TODAY) }; // ще раз помилка
    assert.equal(newCardsLeft(boxes, cards, TODAY), NEW_PER_DAY - 1);
    boxes = { [id]: answerCard(boxes[id], true, TODAY) }; // нарешті правильно
    assert.equal(newCardsLeft(boxes, cards, TODAY), NEW_PER_DAY - 1);
    // Наступного дня це вже звичайний повтор.
    assert.equal(newCardsLeft(boxes, cards, TODAY + 1), NEW_PER_DAY);
  });

  test("гравець, що тисне «Ще сесія» й помиляється, все одно отримує ≤ NEW_PER_DAY нових", () => {
    const cards = deck(60);
    let boxes = {};
    const fresh = new Set();
    for (let round = 0; round < 30; round += 1) {
      const session = dueCards(boxes, cards, TODAY, { newLimit: newCardsLeft(boxes, cards, TODAY) });
      if (!session.length) break;
      for (const [i, card] of session.entries()) {
        if (!boxes[card.id]) fresh.add(card.id);
        boxes = { ...boxes, [card.id]: answerCard(boxes[card.id], (i + round) % 2 === 0, TODAY) };
      }
    }
    assert.equal(fresh.size, NEW_PER_DAY);
  });

  test("стара знайома, на яку щойно помилились, не займає місця нових", () => {
    const cards = deck(5);
    const boxes = { [cards[0].id]: answerCard(entry(3, TODAY, 4, 3), false, TODAY) };
    assert.equal(newCardsLeft(boxes, cards, TODAY), NEW_PER_DAY);
  });

  test("після денної порції нових «Сьогодні» порожніє, якщо все правильно", () => {
    const cards = deck(30);
    let boxes = {};
    for (const card of dueCards(boxes, cards, TODAY, { newLimit: newCardsLeft(boxes, cards, TODAY) })) {
      boxes = { ...boxes, [card.id]: answerCard(boxes[card.id], true, TODAY) };
    }
    assert.equal(Object.keys(boxes).length, NEW_PER_DAY);
    const left = newCardsLeft(boxes, cards, TODAY);
    assert.equal(left, 0);
    assert.equal(dueCount(boxes, cards, TODAY, { newLimit: left }), 0);
    assert.deepEqual(dueCards(boxes, cards, TODAY, { newLimit: left }), []);
  });
});

describe("статистика", () => {
  const cards = deck(9);
  const boxes = {
    [cards[0].id]: entry(1, TODAY),
    [cards[1].id]: entry(4, TODAY),
    [cards[2].id]: entry(5, TODAY),
    [cards[3].id]: entry(2, TODAY),
    [cards[4].id]: entry(4, TODAY),
  };

  test("boxStats рахує нові, коробки й опановані", () => {
    assert.deepEqual(boxStats(boxes, cards), { new: 4, boxes: [1, 1, 0, 2, 1], mastered: 3 });
    assert.deepEqual(boxStats({}, []), { new: 0, boxes: [0, 0, 0, 0, 0], mastered: 0 });
  });

  test("topicProgress по темі", () => {
    assert.deepEqual(topicProgress(boxes, cards, "t0"), { total: 3, seen: 3, mastered: 2 });
    assert.deepEqual(topicProgress(boxes, cards, "t1"), { total: 3, seen: 2, mastered: 1 });
    assert.deepEqual(topicProgress(boxes, cards, "t2"), { total: 3, seen: 0, mastered: 0 });
    assert.deepEqual(topicProgress(boxes, cards, "немає-такої"), { total: 0, seen: 0, mastered: 0 });
  });
});

describe("стійкість до порожніх і невідомих даних", () => {
  test("порожні й биті boxes — усі картки нові", () => {
    const cards = deck(5);
    for (const boxes of [undefined, null, {}, [], "boxes", 42]) {
      assert.equal(dueCards(boxes, cards, TODAY).length, 5, String(boxes));
      assert.equal(dueCount(boxes, cards, TODAY), 5);
      assert.deepEqual(boxStats(boxes, cards), { new: 5, boxes: [0, 0, 0, 0, 0], mastered: 0 });
      assert.equal(nextDue(boxes, cards, TODAY), null);
      assert.equal(newCardsLeft(boxes, cards, TODAY), NEW_PER_DAY);
    }
  });

  test("порожня або бита колода — порожня сесія", () => {
    for (const cards of [undefined, null, [], {}, "cards", [null, 1, "x", {}, { id: 7 }]]) {
      assert.deepEqual(dueCards({}, cards, TODAY), []);
      assert.equal(dueCount({}, cards, TODAY), 0);
      assert.deepEqual(boxStats({}, cards), { new: 0, boxes: [0, 0, 0, 0, 0], mastered: 0 });
      assert.deepEqual(topicProgress({}, cards, "t0"), { total: 0, seen: 0, mastered: 0 });
    }
  });

  test("записи для карток, яких уже немає в колоді, ігноруються", () => {
    const cards = deck(3);
    const boxes = { "видалена-1": entry(1, TODAY - 9), "видалена-2": entry(5, TODAY) };
    assert.equal(dueCards(boxes, cards, TODAY).length, 3);
    assert.ok(dueCards(boxes, cards, TODAY).every((card) => card.id !== "видалена-1"));
    assert.deepEqual(boxStats(boxes, cards).boxes, [0, 0, 0, 0, 0]);
  });

  test("дублікати id у колоді не подвоюють сесію", () => {
    const card = { id: "dup", topic: "t" };
    assert.equal(dueCards({}, [card, card, { ...card }], TODAY).length, 1);
    assert.equal(boxStats({}, [card, card]).new, 1);
  });

  test("id з прототипу Object не плутається з записом", () => {
    const cards = [{ id: "constructor", topic: "t" }, { id: "__proto__", topic: "t" }, { id: "toString", topic: "t" }];
    assert.equal(dueCards({}, cards, TODAY).length, 3);
    assert.equal(boxStats({}, cards).new, 3);
  });

  test("биті поля запису: прострочений розклад і обрізана коробка", () => {
    const cards = deck(3);
    const boxes = {
      [cards[0].id]: { box: 9, due: "завтра" },
      [cards[1].id]: { box: "x", due: TODAY + 100 },
      [cards[2].id]: "не запис",
    };
    // [0]: due-сміття → прострочена; [1]: коробка-сміття → 1, але до повтору ще 100 днів; [2]: нова.
    const session = dueCards(boxes, cards, TODAY);
    assert.deepEqual(ids(session), [cards[0].id, cards[2].id]);
    assert.deepEqual(boxStats(boxes, cards), { new: 1, boxes: [1, 0, 0, 0, 1], mastered: 1 });
  });

  test("биті ліміти падають до типових, від'ємні — до нуля", () => {
    const cards = deck(30);
    assert.equal(dueCards({}, cards, TODAY, { limit: NaN, newLimit: "багато" }).length, NEW_PER_DAY);
    assert.equal(dueCards({}, cards, TODAY, { newLimit: -5 }).length, 0);
    assert.equal(dueCards({}, cards, TODAY, { limit: Infinity, newLimit: Infinity }).length, 30);
  });
});

describe("реальна колода", () => {
  test("перша сесія новачка — нові картки з першого розділу", () => {
    const session = dueCards({}, QUIZ, TODAY);
    assert.equal(session.length, NEW_PER_DAY);
    const firstIds = new Set(ids(QUIZ.slice(0, NEW_PER_DAY)));
    assert.ok(session.every((card) => firstIds.has(card.id)));
  });
});
