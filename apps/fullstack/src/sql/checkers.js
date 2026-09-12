/**
 * Перевірка SQL-задач. Чиста логіка поверх будь-якого адаптера з методами
 * `reset(datasetId)` і `exec(sql)` — у браузері це RPC до воркера з PGlite,
 * у тестах — PGlite напряму.
 *
 * Очікуваний результат не зберігається в даних задачі, а щоразу
 * обчислюється еталонним розв'язком на свіжому датасеті: так задача не
 * «протухне», якщо змінити сід.
 */

export const ROW_LIMIT = 200;

// ─────────────────────────── нормалізація ───────────────────────────

/** Значення, порівнянні між собою: numeric-рядки → числа, дати → ISO, JSON → рядок. */
export function normalizeValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return Number.isInteger(value) ? value : Math.round(value * 1e6) / 1e6;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) return normalizeValue(Number(value));
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

const rowKey = (row) => JSON.stringify(row);

export function normalizeRows(result) {
  return result.rows.map((row) => row.map(normalizeValue));
}

/** Останній результат, що має колонки (тобто SELECT або RETURNING). */
export function lastSelect(results) {
  for (let i = results.length - 1; i >= 0; i -= 1) if (results[i].fields.length) return results[i];
  return null;
}

/** Порівняння за значеннями й порядком колонок, без назв: `AS total` і `AS sum` рівноправні. */
export function compareResults(actual, expected, { ordered = false, orderHint = true } = {}) {
  const a = normalizeRows(actual);
  const e = normalizeRows(expected);
  if (actual.fields.length !== expected.fields.length) {
    return {
      ok: false,
      reason: `У результаті ${actual.fields.length} колонок (${actual.fields.join(", ")}), а очікували ${expected.fields.length} (${expected.fields.join(", ")}).`,
    };
  }
  if (a.length !== e.length) return { ok: false, reason: `Рядків ${a.length}, а очікували ${e.length}.` };
  const left = ordered ? a : [...a].sort((x, y) => rowKey(x).localeCompare(rowKey(y)));
  const right = ordered ? e : [...e].sort((x, y) => rowKey(x).localeCompare(rowKey(y)));
  for (let i = 0; i < left.length; i += 1) {
    if (rowKey(left[i]) !== rowKey(right[i])) {
      return {
        ok: false,
        reason: ordered
          ? `Рядок ${i + 1} не збігається: ${rowKey(left[i])} замість ${rowKey(right[i])}.${orderHint ? " Перевірте і значення, і порядок сортування." : ""}`
          : `Набір рядків не збігається: наприклад, ${rowKey(left[i])} замість ${rowKey(right[i])}.`,
      };
    }
  }
  return { ok: true, reason: "" };
}

// ─────────────────────────── план запиту ───────────────────────────

/** Плаский список вузлів плану з EXPLAIN (FORMAT JSON). */
export function planNodes(explainResult) {
  const cell = explainResult.rows[0]?.[0];
  const json = typeof cell === "string" ? JSON.parse(cell) : cell;
  const root = Array.isArray(json) ? json[0]?.Plan : json?.Plan;
  const out = [];
  const walk = (node, depth) => {
    if (!node) return;
    out.push({
      type: node["Node Type"],
      relation: node["Relation Name"] ?? null,
      index: node["Index Name"] ?? null,
      cost: node["Total Cost"],
      rows: node["Plan Rows"],
      depth,
    });
    for (const child of node.Plans ?? []) walk(child, depth + 1);
  };
  walk(root, 0);
  return out;
}

/** Людський рядок плану: «Seq Scan on orders», «Index Scan using orders_pkey». */
export function describeNode(node) {
  const on = node.relation ? ` on ${node.relation}` : "";
  const using = node.index ? ` using ${node.index}` : "";
  return `${node.type}${on}${using}`;
}

/**
 * expect: { anyOf?: [{ node, relation? }] | ["Index Scan", …],
 *           forbid?: [{ node, relation? }], maxCost? }
 */
export function evaluatePlan(nodes, expect = {}) {
  const matches = (node, rule) => {
    const spec = typeof rule === "string" ? { node: rule } : rule;
    return node.type === spec.node && (!spec.relation || node.relation === spec.relation);
  };
  for (const rule of expect.forbid ?? []) {
    const hit = nodes.find((node) => matches(node, rule));
    if (hit) return { ok: false, reason: `У плані досі є «${describeNode(hit)}».` };
  }
  if (expect.anyOf?.length && !nodes.some((node) => expect.anyOf.some((rule) => matches(node, rule)))) {
    const wanted = expect.anyOf.map((rule) => (typeof rule === "string" ? rule : rule.node)).join(" / ");
    return { ok: false, reason: `У плані немає очікуваного вузла (${wanted}).` };
  }
  if (Number.isFinite(expect.maxCost) && nodes[0] && nodes[0].cost > expect.maxCost) {
    return { ok: false, reason: `Оцінка вартості ${nodes[0].cost}, а треба не більше ${expect.maxCost}.` };
  }
  return { ok: true, reason: "" };
}

// ─────────────────────────── виконання ───────────────────────────

export function describeSqlError(error) {
  const code = error?.code ? ` [${error.code}]` : "";
  return `${error?.message ?? String(error)}${code}`;
}

async function safeExec(db, sql) {
  try {
    return { results: await db.exec(sql), error: null };
  } catch (error) {
    return { results: [], error };
  }
}

async function explain(db, query) {
  const [result] = await db.exec(`EXPLAIN (FORMAT JSON) ${query}`);
  return planNodes(result);
}

/**
 * Одна умова після того, як SQL гравця вже виконано на свіжому датасеті.
 * `referenceQueryResult` потрібен лише для перевірки плану: запит мусить
 * повертати те саме, що й до оптимізації.
 */
async function evaluateCheck(db, check, { userResults, reference }) {
  switch (check.type) {
    case "result": {
      const actual = lastSelect(userResults);
      if (!actual) return { ok: false, reason: "Запит не повернув рядків — потрібен SELECT." };
      return compareResults(actual, reference.result, { ordered: check.ordered });
    }
    case "plan": {
      await db.exec("RESET ALL; SET TimeZone TO 'UTC';");
      const nodes = await explain(db, check.query);
      const verdict = evaluatePlan(nodes, check.expect);
      if (!verdict.ok) return { ...verdict, plan: nodes };
      const expected = reference.queries[check.query];
      if (expected) {
        const [now] = await db.exec(check.query);
        const same = compareResults(now, expected);
        if (!same.ok) return { ok: false, reason: `План добрий, але запит тепер повертає інше. ${same.reason}`, plan: nodes };
      }
      return { ok: true, reason: "", plan: nodes };
    }
    case "state": {
      const [result] = await db.exec(check.verify);
      const expected = { fields: result.fields, rows: check.rows };
      if (result.fields.length !== (check.rows[0]?.length ?? result.fields.length)) {
        return { ok: false, reason: "Перевірочний запит повернув іншу кількість колонок." };
      }
      const verdict = compareResults(result, expected, { ordered: true, orderHint: false });
      if (verdict.ok) return verdict;
      return { ok: false, reason: check.missText ?? `Стан бази після вашого SQL не такий, як треба. ${verdict.reason}` };
    }
    case "error": {
      try {
        await db.exec(check.probe);
      } catch (error) {
        if (!check.sqlstate || error?.code === check.sqlstate) return { ok: true, reason: "" };
        return { ok: false, reason: `Перевірка впала, але з іншою помилкою: ${describeSqlError(error)}.` };
      }
      return { ok: false, reason: check.missText ?? "Перевірочна інструкція пройшла — база її не зупинила." };
    }
    default:
      return { ok: false, reason: `Невідомий тип перевірки: ${check.type}` };
  }
}

/**
 * Прогін еталону на свіжому датасеті: звідти береться очікуваний результат.
 * Для перевірок плану запам'ятовуємо результат кожного їхнього запиту окремо —
 * бонус може перевіряти інший запит, ніж основна умова.
 */
async function referenceRun(db, task) {
  await db.reset(task.dataset);
  const results = await db.exec(task.reference);
  const out = { result: lastSelect(results), queries: {} };
  for (const check of [task.check, task.bonus]) {
    if (check?.type === "plan" && !Object.hasOwn(out.queries, check.query)) [out.queries[check.query]] = await db.exec(check.query);
  }
  return out;
}

/**
 * Повна перевірка: еталон → свіжий датасет → SQL гравця → умова задачі → бонус.
 * @returns {{ ok, reason, bonus, error, results, plan }}
 */
export async function checkTask(db, task, userSql) {
  const reference = await referenceRun(db, task);
  await db.reset(task.dataset);
  const run = await safeExec(db, userSql);
  if (run.error && task.check.type !== "error") {
    return { ok: false, bonus: false, reason: `Помилка SQL: ${describeSqlError(run.error)}`, error: run.error, results: [] };
  }
  const verdict = await evaluateCheck(db, task.check, { userResults: run.results, reference });
  let bonus = false;
  if (verdict.ok && task.bonus) bonus = (await evaluateCheck(db, task.bonus, { userResults: run.results, reference })).ok;
  return { ...verdict, bonus, error: null, results: run.results };
}

/** «Виконати» без перевірки: результати для таблиці, обрізані до ROW_LIMIT. */
export async function runSql(db, sql) {
  const run = await safeExec(db, sql);
  if (run.error) return { error: describeSqlError(run.error), results: [] };
  return {
    error: null,
    results: run.results.map((result) => ({
      ...result,
      total: result.rows.length,
      rows: result.rows.slice(0, ROW_LIMIT).map((row) => row.map(displayValue)),
    })),
  };
}

function displayValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().replace("T", " ").replace(/\.000Z$/, "Z");
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}
