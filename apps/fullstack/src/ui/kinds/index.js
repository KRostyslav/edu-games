/**
 * Реєстр міні-ігор. Кожна — функція mount(host, options) → { unmount, assist? }.
 *
 * options: { payload, seed, ctx, context: "level" | "boss",
 *            onMistake(text), onSolved({ bonus }) }
 *
 * Одні й ті самі компоненти працюють і як рівень, і як фаза боса: різниця
 * лише в тому, хто рахує помилки (зірки рівня чи бюджет боса).
 * `assist()` — дія «Гумової качки»: відкриває одну частину відповіді й
 * повертає текст про те, що саме, або null, якщо допомогти нічим.
 */

import "./kinds.css";
import { mountSequence } from "./sequence.js";
import { mountReview } from "./review.js";
import { mountIncident } from "./incident.js";
import { mountDecision } from "./decision.js";
import { mountCodeQuest } from "./codeQuest.js";
import { mountSqlQuest } from "./sqlQuest.js";
import { mountIsolationLab } from "./isolationLab.js";

const KINDS = {
  predict: (host, options) => mountSequence(host, { ...options, mode: "predict" }),
  order: (host, options) => mountSequence(host, { ...options, mode: "order" }),
  review: mountReview,
  incident: mountIncident,
  decision: mountDecision,
  codeQuest: mountCodeQuest,
  sqlQuest: mountSqlQuest,
  isolationLab: mountIsolationLab,
};

export function mountKind(kind, host, options) {
  const mount = KINDS[kind];
  if (!mount) throw new Error(`Невідомий тип рівня: ${kind}`);
  return mount(host, options);
}
