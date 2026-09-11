/**
 * Тести тренажера оцінок: парсер введення, межі зірок, детермінізм варіантів,
 * людський формат чисел та інваріанти контенту.
 *
 * Інваріант контенту перебирає ВСІ комбінації given, а не випадкову вибірку:
 * помилка в задачі зазвичай ховається в одному рідкісному варіанті (забутий
 * ключ, ділення на нуль), і гравець натрапить на неї раніше за нас.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  formatNumber,
  formatUnit,
  gradeAnswer,
  parseNumber,
  pickVariant,
  problemStars,
} from "../src/progress/estimate.js";
import { ESTIMATES } from "../src/data/estimation.js";
import { CHEATSHEET } from "../src/data/cheatsheet.js";

const ALLOWED_CODEX = new Set([
  "back-of-envelope", "url-shortener", "news-feed", "chat", "rate-limiter-design",
  "video-streaming", "object-storage", "caching", "cdn", "sharding", "cloud-services",
  "message-queues", "realtime", "autoscaling", "latency-numbers",
]);
const ALLOWED_UNITS = new Set([
  "req/s", "B", "KB", "MB", "GB", "TB", "PB", "Gbps", "Mbps", "серверів", "$/міс", "з'єднань", "шт",
]);
const REQUIRED_IDS = ["est-url", "est-feed", "est-chat", "est-video", "est-ratelimit"];
const BROKEN_TEXT = /undefined|NaN|Infinity|\[object /;

/** Декартів добуток усіх значень given — кожен варіант, який може випасти гравцю. */
function allVariants(given) {
  return Object.keys(given).sort().reduce(
    (combos, key) => combos.flatMap((combo) => given[key].map((value) => ({ ...combo, [key]: value }))),
    [{}],
  );
}

// ───────────────────────────── parseNumber ─────────────────────────────

describe("parseNumber", () => {
  const valid = [
    ["12 000", 12_000],
    ["12\u00a0000", 12_000],
    ["12\u202f000", 12_000],
    ["1 234 567", 1_234_567],
    ["1,5", 1.5],
    ["1.5", 1.5],
    ["1,234", 1.234],
    ["12 000,5", 12_000.5],
    ["3e6", 3e6],
    ["3E6", 3e6],
    ["3·10^6", 3e6],
    ["3*10^6", 3e6],
    ["3 × 10^6", 3e6],
    ["10^5", 1e5],
    ["2,5·10^-3", 0.0025],
    ["1,5k", 1_500],
    ["1,5К", 1_500],
    ["2 млн", 2e6],
    ["2 МЛН", 2e6],
    ["3.2M", 3.2e6],
    ["5м", 5e6],
    ["40 тис.", 40_000],
    ["40 тис", 40_000],
    ["1b", 1e9],
    ["1G", 1e9],
    ["2 млрд", 2e9],
    ["1t", 1e12],
    ["3 трлн", 3e12],
    ["  42  ", 42],
    ["0", 0],
  ];
  for (const [text, expected] of valid) {
    test(`«${text}» → ${expected}`, () => assert.equal(parseNumber(text), expected));
  }

  const invalid = ["", "   ", "abc", "1,2,3", "--5", "-5", "+5", "1 2", "12 00", "5 req/s", "k", "1..5", "1e", "10^", "1e999"];
  for (const text of invalid) {
    test(`«${text}» → null`, () => assert.equal(parseNumber(text), null));
  }

  test("не рядок → null", () => {
    assert.equal(parseNumber(null), null);
    assert.equal(parseNumber(undefined), null);
    assert.equal(parseNumber({}), null);
  });
});

// ───────────────────────────── gradeAnswer ─────────────────────────────

describe("gradeAnswer", () => {
  const stars = (given, expected, tolerance) => gradeAnswer(given, expected, tolerance).stars;

  test("точна відповідь — 3★ і ratio 1", () => {
    assert.deepEqual(gradeAnswer(100, 100), { stars: 3, ratio: 1 });
  });

  test("межа 1.3 включна в обидва боки", () => {
    assert.equal(stars(130, 100), 3);
    assert.equal(stars(100, 130), 3);
    assert.equal(stars(131, 100), 2);
  });

  test("межа допуску за замовчуванням (2) включна", () => {
    assert.equal(stars(200, 100), 2);
    assert.equal(stars(50, 100), 2);
    assert.equal(stars(201, 100), 1);
  });

  test("правильний порядок — до 10× включно", () => {
    assert.equal(stars(1_000, 100), 1);
    assert.equal(stars(10, 100), 1);
    assert.equal(stars(1_001, 100), 0);
    assert.equal(stars(9.99, 100), 0);
  });

  test("власний допуск задачі", () => {
    assert.equal(stars(250, 100, 3), 2);
    assert.equal(stars(160, 100, 1.5), 1);
  });

  test("ratio симетричний", () => {
    assert.equal(gradeAnswer(400, 100).ratio, 4);
    assert.equal(gradeAnswer(25, 100).ratio, 4);
  });

  test("невалідна відповідь — 0★ і ratio Infinity", () => {
    for (const given of [0, -5, NaN, Infinity, "100", null, undefined]) {
      assert.deepEqual(gradeAnswer(given, 100), { stars: 0, ratio: Infinity });
    }
  });
});

describe("problemStars", () => {
  test("мінімум серед asks у будь-якій формі", () => {
    assert.equal(problemStars([3, 2, 3]), 2);
    assert.equal(problemStars([{ stars: 3 }, { stars: 1 }]), 1);
    assert.equal(problemStars({ wqps: { stars: 2 }, storage: { stars: 3 } }), 2);
    assert.equal(problemStars([gradeAnswer(100, 100), gradeAnswer(0, 100)]), 0);
  });

  test("порожньо — 0★", () => {
    assert.equal(problemStars([]), 0);
    assert.equal(problemStars(undefined), 0);
  });
});

// ───────────────────────────── pickVariant ─────────────────────────────

describe("pickVariant", () => {
  const problem = ESTIMATES.find((p) => p.id === "est-url");

  test("однаковий seed — однаковий варіант", () => {
    for (const seed of [0, 1, 42, "daily-2026-09-10"]) {
      assert.deepEqual(pickVariant(problem, seed), pickVariant(problem, seed));
    }
  });

  test("ключі відсортовані, значення — з масивів given", () => {
    const variant = pickVariant(problem, 7);
    assert.deepEqual(Object.keys(variant), Object.keys(problem.given).sort());
    for (const [key, value] of Object.entries(variant)) {
      assert.ok(problem.given[key].includes(value), `${key}=${value}`);
    }
  });

  test("різні seed покривають усі значення кожного ключа", () => {
    const variants = Array.from({ length: 200 }, (_, seed) => pickVariant(problem, seed));
    for (const [key, options] of Object.entries(problem.given)) {
      const seen = new Set(variants.map((v) => v[key]));
      assert.equal(seen.size, options.length, key);
    }
    const combos = new Set(variants.map((v) => JSON.stringify(v)));
    assert.equal(combos.size, allVariants(problem.given).length);
  });

  test("скаляр у given проходить як є", () => {
    assert.deepEqual(pickVariant({ id: "x", given: { a: 5, b: [1] } }, 3), { a: 5, b: 1 });
  });
});

// ───────────────────────────── формат ─────────────────────────────

describe("formatNumber", () => {
  const cases = [
    [0, "0"],
    [0.35, "0,35"],
    [0.0123, "0,0123"],
    [11.574, "11,6"],
    [12, "12"],
    [231.48, "231"],
    [850, "850"],
    [999.96, "1 тис"],
    [1_157, "1,2 тис"],
    [86_400, "86,4 тис"],
    [999_999, "1 млн"],
    [1.2e6, "1,2 млн"],
    [2e6, "2 млн"],
    [3.5e9, "3,5 млрд"],
    [1e12, "1 трлн"],
    [5e15, "5 000 трлн"],
    [0.001, "1·10^-3"],
    [0.0025, "2,5·10^-3"],
    [-1_500, "-1,5 тис"],
    [NaN, "—"],
  ];
  for (const [n, expected] of cases) {
    test(`${n} → «${expected}»`, () => assert.equal(formatNumber(n), expected));
  }

  test("наукову нотацію розуміє parseNumber", () => {
    assert.equal(parseNumber(formatNumber(0.0025)), 0.0025);
  });
});

describe("formatUnit", () => {
  const cases = [
    [[1_500, "GB"], "1,5 TB"],
    [[0.5, "TB"], "500 GB"],
    [[2_048, "B"], "2,05 KB"],
    [[18.25e12, "B"], "18,3 TB"],
    [[999.6, "GB"], "1 TB"],
    [[0.9125, "TB"], "913 GB"],
    [[3_000, "PB"], "3 000 PB"],
    [[0.5, "B"], "0,5 B"],
    [[12, "req/s"], "12 req/s"],
    [[46_300, "req/s"], "46,3 тис req/s"],
    [[12_345, "$/міс"], "12,3 тис $/міс"],
    [[0.19, "Gbps"], "0,19 Gbps"],
  ];
  for (const [[n, unitName], expected] of cases) {
    test(`${n} ${unitName} → «${expected}»`, () => assert.equal(formatUnit(n, unitName), expected));
  }
});

// ───────────────────────────── контент ─────────────────────────────

describe("ESTIMATES", () => {
  test("14 задач з унікальними id і всіма обов'язковими", () => {
    assert.equal(ESTIMATES.length, 14);
    const ids = ESTIMATES.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of REQUIRED_IDS) assert.ok(ids.includes(id), id);
  });

  test("упорядковані від легших до складніших", () => {
    const levels = ESTIMATES.map((p) => p.difficulty);
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
    for (const level of levels) assert.ok([1, 2, 3].includes(level));
  });

  for (const problem of ESTIMATES) {
    describe(problem.id, () => {
      test("метадані й структура", () => {
        assert.ok(ALLOWED_CODEX.has(problem.codexRef), problem.codexRef);
        for (const field of ["title", "takeaway"]) {
          assert.equal(typeof problem[field], "string");
          assert.ok(problem[field].trim().length > 0, field);
        }
        assert.ok(Array.isArray(problem.assumptions) && problem.assumptions.length > 0);
        for (const line of problem.assumptions) {
          assert.ok(typeof line === "string" && line.trim().length > 0);
          assert.doesNotMatch(line, BROKEN_TEXT);
        }
        assert.ok(problem.asks.length >= 2 && problem.asks.length <= 4, "2–4 asks");
        const askIds = problem.asks.map((a) => a.id);
        assert.equal(new Set(askIds).size, askIds.length, "унікальні id asks");
        for (const ask of problem.asks) {
          assert.ok(ALLOWED_UNITS.has(ask.unit), `${ask.id}: ${ask.unit}`);
          assert.ok(typeof ask.label === "string" && ask.label.length > 0);
          assert.equal(typeof ask.answer, "function");
          assert.ok(ask.tolerance === undefined || ask.tolerance > 1);
        }
        for (const [key, options] of Object.entries(problem.given)) {
          assert.ok(Array.isArray(options) && options.length > 0, key);
          for (const value of options) assert.ok(Number.isFinite(value) && value > 0, `${key}=${value}`);
        }
      });

      test("кожна комбінація given дає скінченні додатні відповіді й чистий текст", () => {
        for (const g of allVariants(problem.given)) {
          const label = JSON.stringify(g);
          for (const ask of problem.asks) {
            const value = ask.answer(g);
            assert.ok(Number.isFinite(value) && value > 0, `${ask.id} ${label}: ${value}`);
          }

          const prompt = problem.prompt(g);
          assert.ok(typeof prompt === "string" && prompt.trim().length > 0, label);
          assert.doesNotMatch(prompt, BROKEN_TEXT, label);

          const steps = problem.steps(g);
          assert.ok(Array.isArray(steps) && steps.length > 0, label);
          for (const step of steps) {
            assert.ok(typeof step === "string" && step.trim().length > 0, label);
            assert.doesNotMatch(step, BROKEN_TEXT, `${label}: ${step}`);
          }
        }
      });

      test("pickVariant видає одну з комбінацій", () => {
        const combos = new Set(allVariants(problem.given).map((g) => JSON.stringify(g)));
        for (const seed of [0, 1, 2, 99]) assert.ok(combos.has(JSON.stringify(pickVariant(problem, seed))));
      });
    });
  }
});

describe("CHEATSHEET", () => {
  test("latency упорядковано від найшвидшого", () => {
    const ns = CHEATSHEET.latency.map((row) => row.ns);
    assert.ok(ns.length >= 12);
    assert.deepEqual(ns, [...ns].sort((a, b) => a - b));
  });

  test("усі розділи заповнені", () => {
    assert.deepEqual(CHEATSHEET.powers.map((p) => p.power), [10, 20, 30, 40, 50]);
    for (const section of ["time", "sizes"]) assert.ok(CHEATSHEET[section].length > 0, section);
    assert.ok(CHEATSHEET.rules.length >= 6 && CHEATSHEET.rules.length <= 10);
  });
});
