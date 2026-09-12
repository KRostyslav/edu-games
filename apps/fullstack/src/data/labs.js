/** Реєстр сценаріїв MVCC-лабораторії (рівні ізоляції Postgres). */

import { LABS as dataLabs } from "./acts/data/labs.js";

export const LABS = Object.fromEntries(Object.entries(dataLabs).map(([id, lab]) => [id, { ...lab, id }]));
