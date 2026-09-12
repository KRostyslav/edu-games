/**
 * Інваріанти контенту: посилання цілі, форми payload коректні, обсяг і
 * різноманіття актів достатні. Контент пишеться руками й додаватиметься
 * роками — цей тест не дає йому тихо зламатися.
 *
 * Тести згенеровано окремо на кожен рівень, боса й акт: помилка в одному
 * акті не ховає помилки в іншому, а назва тесту одразу каже, де шукати.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ACTS, PLAYABLE_ACTS } from "../src/data/acts.js";
import { GRADES } from "../src/data/grades.js";
import { TOOLS } from "../src/data/tools.js";
import { LEVEL_LIST, LEVELS, BOSS_LIST, SKILLS, CARDS, levelsOfAct, bossOfAct } from "../src/data/content.js";
import { CODEX, CODEX_IDS } from "../src/data/codex.js";
import { CODE_TASKS } from "../src/data/code.js";
import { SQL_TASKS, DATASETS } from "../src/data/sql.js";
import { LABS } from "../src/data/labs.js";
import { answerSpread } from "../src/game/grade.js";
import { payloadProblems, KINDS } from "../src/data/validate.js";

const text = (value) => typeof value === "string" && value.trim().length > 0;

// ─────────────────────────── рівні ───────────────────────────

test("id рівнів унікальні", () => {
  const seen = new Set();
  for (const level of LEVEL_LIST) {
    assert.ok(!seen.has(level.id), `дубль ${level.id}`);
    seen.add(level.id);
  }
});

for (const level of LEVEL_LIST) {
  test(`рівень ${level.id}: поля, дебриф, payload і бонус`, () => {
    assert.match(level.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(PLAYABLE_ACTS.some((act) => act.id === level.act), `акт ${level.act}`);
    assert.ok(KINDS.includes(level.kind), `kind ${level.kind}`);
    for (const key of ["title", "teaser", "brief"]) assert.ok(text(level[key]), `немає ${key}`);
    assert.equal(level.hints?.length, 3, "рівно 3 підказки");
    assert.ok(level.hints.every(text), "порожня підказка");
    for (const key of ["lesson", "interview", "frontendBridge"]) assert.ok(text(level.debrief?.[key]), `дебриф без ${key}`);
    assert.ok(level.codexRefs?.length >= 1, "немає codexRefs");
    for (const ref of level.codexRefs) assert.ok(CODEX[ref], `немає статті ${ref}`);
    assert.deepEqual(payloadProblems(level.kind, level.payload, level.id), []);

    const type = level.bonus?.type ?? "firstTry";
    if (level.kind === "codeQuest") {
      assert.equal(type, "tests", "для коду бонус — прихований тест");
      assert.ok(CODE_TASKS[level.payload.task]?.bonusTests?.length, "у задачі немає bonusTests");
      assert.ok(text(level.bonus?.text), "опишіть бонус-ціль");
    } else if (level.kind === "sqlQuest") {
      assert.equal(type, "check", "для SQL бонус — додаткова умова");
      assert.ok(SQL_TASKS[level.payload.task]?.bonus, "у задачі немає bonus");
      assert.ok(text(level.bonus?.text), "опишіть бонус-ціль");
    } else {
      assert.equal(type, "firstTry", "для задач із вибором бонус — з першої спроби");
    }
  });
}

// ─────────────────────────── боси ───────────────────────────

const REVEAL_TOOLS = new Set(TOOLS.filter((tool) => tool.effect === "reveal").map((tool) => tool.id));

for (const boss of BOSS_LIST) {
  test(`бос ${boss.id}: фази, бюджет, інструменти, постмортем`, () => {
    for (const key of ["title", "subtitle", "intro", "alert"]) assert.ok(text(boss[key]), `немає ${key}`);
    assert.ok(boss.budget >= 3 && boss.budget <= 8, `бюджет ${boss.budget}`);
    assert.ok(boss.phases.length >= 3 && boss.phases.length <= 5, `фаз ${boss.phases.length}`);
    const phaseIds = new Set();
    for (const phase of boss.phases) {
      assert.ok(!phaseIds.has(phase.id), `дубль фази ${phase.id}`);
      phaseIds.add(phase.id);
      assert.ok(text(phase.title) && text(phase.story), `${phase.id}: title/story`);
      assert.deepEqual(payloadProblems(phase.kind, phase.payload, `${boss.id}/${phase.id}`), []);
      assert.ok((phase.hints ?? []).length <= 2 && (phase.hints ?? []).every(text), `${phase.id}: підказки`);
      for (const key of Object.keys(phase.tools ?? {})) assert.ok(REVEAL_TOOLS.has(key), `${phase.id}: інструмент ${key}`);
    }
    assert.ok(new Set(boss.phases.map((phase) => phase.kind)).size >= 3, "фази мають бути щонайменше трьох різних типів");
    assert.ok(boss.phases.some((phase) => Object.keys(phase.tools ?? {}).length > 0), "хоч одна фаза має вивід reveal-інструмента");
    const pm = boss.postmortem ?? {};
    for (const key of ["summary", "rootCause", "staffView"]) assert.ok(text(pm[key]), `постмортем без ${key}`);
    assert.ok(pm.contributing?.length >= 2 && pm.actionItems?.length >= 3, "постмортем: contributing ≥ 2, actionItems ≥ 3");
    assert.ok(text(boss.reward?.title), "немає титулу");
    assert.ok(boss.codexRefs?.length >= 1, "немає codexRefs");
    for (const ref of boss.codexRefs) assert.ok(CODEX[ref], `немає статті ${ref}`);
  });
}

// ─────────────────────────── акти ───────────────────────────

for (const act of PLAYABLE_ACTS) {
  test(`акт ${act.id}: обсяг, різноманіття, бос`, () => {
    const levels = levelsOfAct(act.id);
    const min = act.id === "prologue" ? 2 : 8;
    assert.ok(levels.length >= min, `рівнів ${levels.length}, мінімум ${min}`);
    if (act.id === "prologue") return;
    const kinds = new Set(levels.map((level) => level.kind));
    assert.ok(kinds.size >= 4, `лише ${kinds.size} типів рівнів`);
    assert.ok(bossOfAct(act.id), "немає боса");
    assert.equal(act.boss, bossOfAct(act.id).id, "acts.js вказує не на того боса");
  });

  test(`акт ${act.id}: довідник і по 3 картки (2 mcq + 1 flash) на статтю`, () => {
    const ids = CODEX_IDS.filter((id) => CODEX[id].groupId === act.id);
    const min = act.id === "prologue" ? 3 : 10;
    assert.ok(ids.length >= min, `статей ${ids.length}, мінімум ${min}`);
    for (const id of ids) {
      const cards = CARDS.filter((card) => card.topic === id);
      assert.equal(cards.length, 3, `${id}: карток ${cards.length}`);
      assert.equal(cards.filter((card) => card.kind === "mcq").length, 2, `${id}: треба 2 mcq + 1 flash`);
    }
  });

  test(`акт ${act.id}: правильні відповіді карток не збиваються на одній позиції`, () => {
    const ids = new Set(CODEX_IDS.filter((id) => CODEX[id].groupId === act.id));
    const answers = CARDS.filter((card) => ids.has(card.topic) && card.kind === "mcq" && card.options.length === 4).map((c) => c.answer);
    if (answers.length < 12) return;
    const spread = answerSpread(answers);
    for (const [position, count] of spread.entries()) {
      const share = count / answers.length;
      assert.ok(share >= 0.12 && share <= 0.4, `позиція ${position}: ${Math.round(share * 100)}% (${spread.join("/")})`);
    }
  });
}

// ─────────────────────────── довідник, картки, навички ───────────────────────────

test("довідник: цілі посилання й заповнені поля", () => {
  for (const id of CODEX_IDS) {
    const article = CODEX[id];
    for (const key of ["title", "summary", "how"]) assert.ok(text(article[key]), `${id}: немає ${key}`);
    for (const ref of article.see ?? []) assert.ok(CODEX[ref], `${id}: see → ${ref}`);
    for (const sample of article.code ?? []) assert.ok(text(sample.src) && text(sample.lang), `${id}: код без src/lang`);
  }
});

test("картки: унікальні id за темою, коректні відповіді", () => {
  const ids = new Set();
  for (const card of CARDS) {
    assert.ok(!ids.has(card.id), `дубль картки ${card.id}`);
    ids.add(card.id);
    assert.ok(CODEX[card.topic], `${card.id}: тема ${card.topic}`);
    assert.match(card.id, new RegExp(`^${card.topic}-\\d+$`), card.id);
    if (card.kind === "mcq") {
      assert.ok(text(card.q) && card.options?.length >= 3 && card.options.length <= 5, `${card.id}: q/options`);
      assert.ok(card.answer >= 0 && card.answer < card.options.length, `${card.id}: answer`);
      assert.ok(text(card.explain), `${card.id}: explain`);
    } else {
      assert.equal(card.kind, "flash", card.id);
      assert.ok(text(card.front) && text(card.back), `${card.id}: front/back`);
    }
  }
});

test("навички: рівні з того самого акту, теми — статті; кожен рівень актів 1+ покрито", () => {
  const ids = new Set();
  for (const skill of SKILLS) {
    assert.ok(!ids.has(skill.id), `дубль навички ${skill.id}`);
    ids.add(skill.id);
    assert.ok(text(skill.title) && text(skill.summary), `${skill.id}: title/summary`);
    assert.ok(skill.levels.length >= 1 && skill.topics.length >= 1, `${skill.id}: levels/topics`);
    for (const id of skill.levels) assert.equal(LEVELS[id]?.act, skill.act, `${skill.id}: рівень ${id}`);
    for (const topic of skill.topics) assert.ok(CODEX[topic], `${skill.id}: тема ${topic}`);
  }
  const covered = new Set(SKILLS.flatMap((skill) => skill.levels));
  for (const level of LEVEL_LIST) if (level.act !== "prologue") assert.ok(covered.has(level.id), `${level.id} не входить у жодну навичку`);
});

test("грейди посилаються на існуючі акти, інструменти — на існуючі рівні й статті", () => {
  for (const grade of GRADES.slice(1)) assert.ok(ACTS.some((act) => act.id === grade.act), grade.id);
  for (const tool of TOOLS) {
    if (tool.unlock.type === "level") assert.ok(LEVELS[tool.unlock.level], `${tool.id}: немає рівня ${tool.unlock.level}`);
    if (tool.codexRef) assert.ok(CODEX[tool.codexRef], `${tool.id}: немає статті ${tool.codexRef}`);
  }
});

test("кожна задача пісочниці, SQL-задача і лабораторія десь використовується", () => {
  const phases = BOSS_LIST.flatMap((boss) => boss.phases);
  const used = (kind, key) => new Set([...LEVEL_LIST, ...phases].filter((item) => item.kind === kind).map((item) => item.payload[key]));
  const code = used("codeQuest", "task");
  const sql = used("sqlQuest", "task");
  const labs = used("isolationLab", "lab");
  for (const id of Object.keys(CODE_TASKS)) assert.ok(code.has(id), `задача ${id} ніде не використана`);
  for (const id of Object.keys(SQL_TASKS)) assert.ok(sql.has(id), `SQL-задача ${id} ніде не використана`);
  for (const id of Object.keys(LABS)) assert.ok(labs.has(id), `лабораторія ${id} ніде не використана`);
  for (const task of Object.values(SQL_TASKS)) assert.ok(DATASETS[task.dataset], `${task.id}: датасет ${task.dataset}`);
});
