/**
 * MVCC-лабораторія: дві транзакції над маленькою таблицею, крок за кроком,
 * із семантикою Postgres. PGlite однокористувацький — двох паралельних сесій
 * у ньому не відкрити, тому конкурентність моделюємо тут, навмисно вузько:
 *
 *  - READ COMMITTED: кожна інструкція бачить останні закомічені дані. UPDATE
 *    рядка, заблокованого іншою транзакцією, чекає; після її коміту
 *    перечитує свіжу версію рядка (EvalPlanQual). `SET qty = qty - 1`
 *    тоді коректний, а `SET qty = <значення, прочитане раніше в застосунку>` —
 *    ні: це і є lost update.
 *  - REPEATABLE READ: знімок береться на першій інструкції (не на BEGIN).
 *    Спроба змінити чи заблокувати рядок, який після знімка змінила
 *    закомічена паралельна транзакція, → ERROR: could not serialize access
 *    due to concurrent update. Write skew (різні рядки) проходить.
 *  - SERIALIZABLE (SSI): як RR, плюс відстеження rw-залежностей, зокрема
 *    предикатних читань. Якщо дві транзакції читали те, що змінила інша, —
 *    друга з тих, що комітяться, отримує serialization failure.
 *  - FOR UPDATE блокує рядки; дедлок — цикл очікування, одну з транзакцій
 *    Postgres перериває з ERROR: deadlock detected.
 *  - READ UNCOMMITTED у Postgres поводиться як READ COMMITTED.
 *
 * Операції програм:
 *   { op: "begin" } | { op: "commit" } | { op: "rollback" }
 *   { op: "read", id, col, as }                  SELECT col … WHERE id = ?
 *   { op: "readForUpdate", id, col, as }         … FOR UPDATE
 *   { op: "count", where: { col, eq }, as }      SELECT count(*) … WHERE col = eq
 *   { op: "countForUpdate", where, as }          … FOR UPDATE
 *   { op: "update", id, col, value, if? }        value: { self, add } | { var, add } | { const }
 *   if: { var, gt | gte | lt | eq } — умова застосунку (виконати UPDATE лише якщо…)
 */

export const ISOLATION = {
  RC: "READ COMMITTED",
  RR: "REPEATABLE READ",
  SER: "SERIALIZABLE",
};

const SERIALIZE_UPDATE = "ERROR: could not serialize access due to concurrent update";
const SERIALIZE_SSI = "ERROR: could not serialize access due to read/write dependencies among transactions";
const DEADLOCK = "ERROR: deadlock detected";

// ─────────────────────────── SQL для показу ───────────────────────────

function valueSql(value, col) {
  if ("const" in value) return JSON.stringify(value.const).replaceAll('"', "'");
  const add = value.add ?? 0;
  const tail = add === 0 ? "" : add > 0 ? ` + ${add}` : ` - ${-add}`;
  if (value.self) return `${col}${tail}`;
  return `:${value.var}${tail}`;
}

function whereSql(where) {
  const v = typeof where.eq === "string" ? `'${where.eq}'` : String(where.eq);
  return `${where.col} = ${v}`;
}

function condSql(cond) {
  const [op, n] = Object.entries(cond).find(([key]) => key !== "var");
  const sign = { gt: ">", gte: ">=", lt: "<", eq: "=" }[op];
  return `${cond.var} ${sign} ${n}`;
}

/** Текст SQL операції, як його написав би застосунок. */
export function sqlOf(op, table, iso) {
  switch (op.op) {
    case "begin":
      return `BEGIN ISOLATION LEVEL ${ISOLATION[iso] ?? "READ COMMITTED"};`;
    case "commit":
      return "COMMIT;";
    case "rollback":
      return "ROLLBACK;";
    case "read":
      return `SELECT ${op.col} FROM ${table.name} WHERE id = ${op.id};`;
    case "readForUpdate":
      return `SELECT ${op.col} FROM ${table.name} WHERE id = ${op.id} FOR UPDATE;`;
    case "count":
      return `SELECT count(*) FROM ${table.name} WHERE ${whereSql(op.where)};`;
    case "countForUpdate":
      return `SELECT id FROM ${table.name} WHERE ${whereSql(op.where)} FOR UPDATE;`;
    case "update": {
      const sql = `UPDATE ${table.name} SET ${op.col} = ${valueSql(op.value, op.col)} WHERE id = ${op.id};`;
      return op.if ? `-- якщо ${condSql(op.if)}:\n${sql}` : sql;
    }
    default:
      return `-- ${op.op}`;
  }
}

// ─────────────────────────── симуляція ───────────────────────────

function matchesWhere(values, where) {
  return values != null && values[where.col] === where.eq;
}

function holds(cond, vars) {
  const value = vars[cond.var];
  if ("gt" in cond) return value > cond.gt;
  if ("gte" in cond) return value >= cond.gte;
  if ("lt" in cond) return value < cond.lt;
  if ("eq" in cond) return value === cond.eq;
  return true;
}

/**
 * @param lab      { table: { name, columns, rows }, t1: ops[], t2: ops[], schedule: ["T1","T2",…], invariant }
 * @param options  { iso: "RC"|"RR"|"SER", t1?, t2?, schedule? } — варіант може підмінити програми
 * @returns { events, final, txs, verdict }
 */
export function runLab(lab, { iso = "RC", t1, t2, schedule } = {}) {
  const table = lab.table;
  const history = new Map(table.rows.map((row) => [row.id, [{ values: { ...row }, seq: 0 }]]));
  const programs = { T1: t1 ?? lab.t1, T2: t2 ?? lab.t2 };
  const order = schedule ?? lab.schedule;
  const lockOwner = new Map();
  const events = [];
  let seq = 0;

  const txs = {};
  for (const id of ["T1", "T2"]) {
    txs[id] = {
      id,
      pc: 0,
      status: "idle",
      snapshot: null,
      startSeq: null,
      writes: new Map(),
      written: new Map(),
      locks: new Set(),
      reads: new Set(),
      predicates: [],
      vars: {},
      waitingFor: null,
      error: null,
      commitSeq: null,
    };
  }
  const other = (tx) => txs[tx.id === "T1" ? "T2" : "T1"];

  const latest = (id) => history.get(id)?.at(-1) ?? null;
  const visibleAt = (id, snap) => {
    const versions = history.get(id) ?? [];
    for (let i = versions.length - 1; i >= 0; i -= 1) if (versions[i].seq <= snap) return versions[i];
    return null;
  };
  const statementSnapshot = (tx) => (iso === "RC" ? seq : tx.snapshot);
  const readValues = (tx, id) => tx.writes.get(id) ?? visibleAt(id, statementSnapshot(tx))?.values ?? null;
  const currentValues = (tx, id) => tx.writes.get(id) ?? latest(id)?.values ?? null;
  const changedSinceSnapshot = (tx, id) => {
    const version = latest(id);
    return iso !== "RC" && !tx.writes.has(id) && version && version.seq > tx.snapshot;
  };

  const log = (tx, kind, sql, text = "") => events.push({ i: events.length, tx: tx.id, kind, sql, text, table: tableNow() });
  const tableNow = () => [...history.keys()].map((id) => ({ ...latest(id).values }));

  function tryLock(tx, ids) {
    for (const id of ids) {
      const owner = lockOwner.get(id);
      if (owner && owner !== tx.id) {
        tx.waitingFor = owner;
        return false;
      }
    }
    for (const id of ids) {
      lockOwner.set(id, tx.id);
      tx.locks.add(id);
    }
    return true;
  }

  function release(tx) {
    for (const id of tx.locks) if (lockOwner.get(id) === tx.id) lockOwner.delete(id);
    tx.locks.clear();
    const waiter = other(tx);
    if (waiter.waitingFor === tx.id) {
      waiter.waitingFor = null;
      step(waiter, { woken: true });
    }
  }

  function abort(tx, message, sql) {
    tx.status = "aborted";
    tx.error = message;
    tx.writes.clear();
    log(tx, "error", sql, message);
    release(tx);
  }

  function beginStatement(tx) {
    if (tx.status === "idle") tx.status = "active";
    if (tx.startSeq === null) tx.startSeq = seq;
    if (tx.snapshot === null && iso !== "RC") tx.snapshot = seq;
  }

  /** Чи читала транзакція `a` щось, що змінила `b` (rw-залежність для SSI). */
  function rwEdge(a, b) {
    for (const [id, values] of b.written) {
      if (a.reads.has(id)) return true;
      const seen = visibleAt(id, a.snapshot ?? 0)?.values;
      if (a.predicates.some((where) => matchesWhere(seen, where) || matchesWhere(values, where))) return true;
    }
    return false;
  }

  /** Виконує операцію. → "done" | "blocked" | "aborted" */
  function execute(tx, op) {
    const sql = sqlOf(op, table, iso);
    switch (op.op) {
      case "begin":
        tx.status = "active";
        log(tx, "ok", sql);
        return "done";
      case "read": {
        beginStatement(tx);
        const value = readValues(tx, op.id)?.[op.col] ?? null;
        tx.vars[op.as] = value;
        tx.reads.add(op.id);
        log(tx, "ok", sql, `${op.as} = ${value}`);
        return "done";
      }
      case "readForUpdate": {
        beginStatement(tx);
        if (!tryLock(tx, [op.id])) return "blocked";
        if (changedSinceSnapshot(tx, op.id)) {
          abort(tx, SERIALIZE_UPDATE, sql);
          return "aborted";
        }
        const value = (iso === "RC" ? currentValues(tx, op.id) : readValues(tx, op.id))?.[op.col] ?? null;
        tx.vars[op.as] = value;
        tx.reads.add(op.id);
        log(tx, "ok", sql, `${op.as} = ${value}`);
        return "done";
      }
      case "count": {
        beginStatement(tx);
        const n = [...history.keys()].filter((id) => matchesWhere(readValues(tx, id), op.where)).length;
        tx.vars[op.as] = n;
        tx.predicates.push(op.where);
        log(tx, "ok", sql, `${op.as} = ${n}`);
        return "done";
      }
      case "countForUpdate": {
        beginStatement(tx);
        const candidates = [...history.keys()].filter((id) => matchesWhere(readValues(tx, id), op.where));
        if (!tryLock(tx, candidates)) return "blocked";
        if (candidates.some((id) => changedSinceSnapshot(tx, id))) {
          abort(tx, SERIALIZE_UPDATE, sql);
          return "aborted";
        }
        // READ COMMITTED перевіряє умову на свіжій версії заблокованих рядків.
        const still = iso === "RC" ? candidates.filter((id) => matchesWhere(currentValues(tx, id), op.where)) : candidates;
        tx.vars[op.as] = still.length;
        tx.predicates.push(op.where);
        log(tx, "ok", sql, `${op.as} = ${still.length}`);
        return "done";
      }
      case "update": {
        beginStatement(tx);
        if (op.if && !holds(op.if, tx.vars)) {
          log(tx, "skip", sql, `Умова ${condSql(op.if)} не виконалась — застосунок нічого не змінює`);
          return "done";
        }
        if (!tryLock(tx, [op.id])) return "blocked";
        if (changedSinceSnapshot(tx, op.id)) {
          abort(tx, SERIALIZE_UPDATE, sql);
          return "aborted";
        }
        const base = currentValues(tx, op.id);
        const value = op.value;
        let next;
        if ("const" in value) next = value.const;
        else if (value.self) next = base[op.col] + (value.add ?? 0);
        else next = tx.vars[value.var] + (value.add ?? 0);
        const row = { ...base, [op.col]: next };
        tx.writes.set(op.id, row);
        tx.written.set(op.id, row);
        log(tx, "ok", sql, `${op.col}: ${base[op.col]} → ${next}`);
        return "done";
      }
      case "commit": {
        const peer = other(tx);
        const concurrent = peer.startSeq !== null && (peer.commitSeq === null || peer.commitSeq > (tx.startSeq ?? 0));
        if (iso === "SER" && peer.status === "committed" && concurrent && rwEdge(tx, peer) && rwEdge(peer, tx)) {
          abort(tx, SERIALIZE_SSI, sql);
          return "aborted";
        }
        if (tx.writes.size) {
          seq += 1;
          for (const [id, values] of tx.writes) history.get(id).push({ values: { ...values }, seq });
        }
        tx.commitSeq = seq;
        tx.status = "committed";
        tx.writes.clear();
        log(tx, "commit", sql);
        release(tx);
        return "done";
      }
      case "rollback":
        tx.status = "aborted";
        tx.writes.clear();
        log(tx, "ok", sql, "Зміни скасовано");
        release(tx);
        return "done";
      default:
        throw new Error(`Невідома операція лабораторії: ${op.op}`);
    }
  }

  function step(tx, { woken = false } = {}) {
    if (tx.status === "committed" || tx.status === "aborted") return;
    if (tx.waitingFor) {
      if (!woken) log(tx, "wait", "", `${tx.id} досі чекає на ${tx.waitingFor}`);
      return;
    }
    const op = programs[tx.id][tx.pc];
    if (!op) return;
    if (woken) log(tx, "info", "", `${tx.id} розблоковано — інструкція виконується далі`);
    const outcome = execute(tx, op);
    if (outcome === "blocked") {
      const holder = txs[tx.waitingFor];
      log(tx, "wait", sqlOf(op, table, iso), `Рядок заблоковано транзакцією ${holder.id} — ${tx.id} чекає`);
      if (holder.waitingFor === tx.id) {
        tx.waitingFor = null;
        abort(tx, DEADLOCK, sqlOf(op, table, iso));
      }
      return;
    }
    if (outcome === "done") tx.pc += 1;
  }

  for (const id of order) step(txs[id]);
  // Решта інструкцій — по черзі, доки є що виконувати.
  for (let guard = 0; guard < 200; guard += 1) {
    const runnable = Object.values(txs).filter(
      (tx) => (tx.status === "idle" || tx.status === "active") && !tx.waitingFor && tx.pc < programs[tx.id].length,
    );
    if (!runnable.length) break;
    for (const tx of runnable) step(tx);
  }

  const final = tableNow();
  const summary = Object.fromEntries(
    Object.values(txs).map((tx) => [tx.id, { status: tx.status, error: tx.error, wrote: [...tx.written.keys()], vars: { ...tx.vars } }]),
  );
  return { events, final, txs: summary, verdict: checkInvariant(lab, final, summary) };
}

/**
 * Інваріант бізнес-правила:
 *   { type: "sumOfCommitted", id, col, start, perCommit, text } — кожна закомічена зміна мусить бути врахована;
 *   { type: "minCount", where, min, text } — наприклад, «хоча б один лікар на чергуванні»;
 *   { type: "total", col, equals, text } — сума по колонці незмінна (гроші не зникають).
 */
export function checkInvariant(lab, final, txs) {
  const inv = lab.invariant;
  if (inv.type === "sumOfCommitted") {
    const committed = Object.values(txs).filter((tx) => tx.status === "committed" && tx.wrote.includes(inv.id)).length;
    const expected = inv.start + inv.perCommit * committed;
    const actual = final.find((row) => row.id === inv.id)?.[inv.col];
    return {
      ok: actual === expected,
      text:
        actual === expected
          ? `${inv.col} = ${actual}: усі ${committed} закомічені зміни враховано.`
          : `${inv.col} = ${actual}, а мало бути ${expected}: закомічено ${committed} змін, але частину втрачено.`,
    };
  }
  if (inv.type === "total") {
    const sum = final.reduce((acc, row) => acc + row[inv.col], 0);
    return {
      ok: sum === inv.equals,
      text: sum === inv.equals ? `Сума ${inv.col} = ${sum}: нічого не загубилось.` : `Сума ${inv.col} = ${sum}, а мала бути ${inv.equals}.`,
    };
  }
  if (inv.type === "minCount") {
    const n = final.filter((row) => matchesWhere(row, inv.where)).length;
    return {
      ok: n >= inv.min,
      text: n >= inv.min ? `Правило дотримано: ${n} ≥ ${inv.min}.` : `Правило порушено: лишилось ${n}, а мінімум — ${inv.min}.`,
    };
  }
  throw new Error(`Невідомий інваріант: ${inv.type}`);
}

/** Короткий підсумок варіанта для тестів і UI. */
export function outcomeOf(result) {
  return {
    anomaly: !result.verdict.ok,
    aborted: Object.entries(result.txs)
      .filter(([, tx]) => tx.status === "aborted" && tx.error)
      .map(([id]) => id),
    deadlock: result.events.some((event) => event.text === DEADLOCK),
  };
}
