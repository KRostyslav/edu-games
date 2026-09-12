/**
 * Реєстр SQL-задач і датасетів для PGlite.
 *
 * Датасет: { id, title, setup: "SQL", tables: [{ name, columns: "опис" }] }.
 * Сід генерується арифметикою (жодного random()) і не більше 30 000 рядків у
 * таблиці: ANALYZE тоді бачить таблицю цілком, і план запиту детермінований.
 *
 * Задача:
 *   { id, title, dataset, brief, starter, reference, naive,
 *     check: { type: "result", ordered? } | { type: "plan", query, expect: { anyOf?, forbid? } }
 *          | { type: "state", verify, rows } | { type: "error", probe, sqlstate },
 *     bonus?: { ...той самий формат check } }
 */

import { DATASETS as dataSets, SQL as dataSql } from "./acts/data/sql.js";

export const DATASETS = { ...dataSets };

export const SQL_TASKS = Object.fromEntries(Object.entries(dataSql).map(([id, task]) => [id, { ...task, id }]));
