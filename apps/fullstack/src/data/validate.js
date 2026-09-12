/**
 * Перевірка форми payload за типом рівня. Живе в src, а не в test/, бо
 * `node --test` запускає як тест кожен файл у test/, а цією функцією
 * користуються і контент-тести, і скрипт балансу.
 */

import { CODE_TASKS } from "./code.js";
import { SQL_TASKS } from "./sql.js";
import { LABS } from "./labs.js";

export const KINDS = ["predict", "order", "review", "incident", "decision", "codeQuest", "sqlQuest", "isolationLab"];

const text = (value) => typeof value === "string" && value.trim().length > 0;

/** Список проблем payload (порожній — усе гаразд). */
export function payloadProblems(kind, payload, where) {
  const out = [];
  const need = (cond, message) => cond || out.push(`${where}: ${message}`);
  if (!payload || typeof payload !== "object") return [`${where}: немає payload`];
  switch (kind) {
    case "predict":
      need(text(payload.code), "predict без code");
      need(Array.isArray(payload.expected) && payload.expected.length >= 2, "predict: expected ≥ 2 рядки");
      need(new Set(payload.expected ?? []).size === (payload.expected ?? []).length, "predict: рядки expected мають бути унікальні");
      need(["main", "io"].includes(payload.context ?? "main"), "predict: context — main або io");
      need(text(payload.explain), "predict без explain");
      need(!/^\s*import\s/m.test(payload.code ?? ""), "predict: без import (ESM змінює порядок черг)");
      for (const d of payload.distractors ?? []) {
        need(text(d.text) && text(d.why), "predict: distractor без text/why");
        need(!(payload.expected ?? []).includes(d.text), `predict: distractor «${d.text}» є серед expected`);
      }
      need(!/^await\s/m.test(payload.code ?? ""), "predict: без top-level await");
      break;
    case "order":
      need(Array.isArray(payload.items) && payload.items.length >= 3, "order: items ≥ 3");
      need(new Set(payload.items ?? []).size === (payload.items ?? []).length, "order: items унікальні");
      need(text(payload.prompt), "order без prompt");
      need(text(payload.explain), "order без explain");
      for (const d of payload.distractors ?? []) need(text(d.text) && text(d.why), "order: distractor без text/why");
      break;
    case "review": {
      need(text(payload.code) && text(payload.prompt), "review без code/prompt");
      const lines = (payload.code ?? "").split("\n").length;
      need(Array.isArray(payload.bad) && payload.bad.length >= 1, "review без bad");
      for (const b of payload.bad ?? []) {
        need(Number.isInteger(b.line) && b.line >= 1 && b.line <= lines && text(b.why), `review: bad рядок ${b.line} поза кодом або без why`);
      }
      need(new Set((payload.bad ?? []).map((b) => b.line)).size === (payload.bad ?? []).length, "review: рядки bad повторюються");
      for (const line of Object.keys(payload.fine ?? {})) need(Number(line) >= 1 && Number(line) <= lines, `review: fine рядок ${line} поза кодом`);
      for (const b of payload.bad ?? []) need(!Object.hasOwn(payload.fine ?? {}, String(b.line)), `review: рядок ${b.line} і в bad, і в fine`);
      break;
    }
    case "incident":
      need(text(payload.alert), "incident без alert");
      need(Array.isArray(payload.signals) && payload.signals.length >= 1, "incident без signals");
      for (const s of payload.signals ?? []) {
        need(["log", "metric", "trace", "note"].includes(s.kind) && text(s.title), "incident: сигнал без kind/title");
        if (s.kind === "log" || s.kind === "note") need(Array.isArray(s.lines) && s.lines.length > 0, "incident: log/note без lines");
        if (s.kind === "metric") need(Array.isArray(s.values) && s.values.length >= 4 && s.values.every(Number.isFinite), "incident: metric без values");
        if (s.kind === "trace") {
          need(Array.isArray(s.spans) && s.spans.length >= 2, "incident: trace без spans");
          for (const span of s.spans ?? []) need(text(span.name) && Number.isFinite(span.start) && Number.isFinite(span.dur), "incident: span без name/start/dur");
        }
      }
      need(Array.isArray(payload.steps) && payload.steps.length >= 1, "incident без steps");
      for (const step of payload.steps ?? []) {
        need(text(step.q) && step.options?.length >= 3, "incident: крок без q або з < 3 варіантами");
        need(step.options?.filter((o) => o.correct).length === 1, "incident: у кроку рівно одна правильна відповідь");
        for (const o of step.options ?? []) need(text(o.text) && text(o.why), "incident: варіант без text/why");
      }
      break;
    case "decision": {
      need(text(payload.scenario), "decision без scenario");
      need(Array.isArray(payload.stats) && payload.stats.length >= 2, "decision: stats ≥ 2");
      const ids = new Set((payload.stats ?? []).map((s) => s.id));
      need(payload.options?.length >= 3, "decision: варіантів ≥ 3");
      need(payload.options?.filter((o) => o.correct).length >= 1, "decision: хоч один правильний");
      for (const o of payload.options ?? []) {
        need(text(o.text) && text(o.why), "decision: варіант без text/why");
        need(Array.isArray(o.effects) && o.effects.length >= 1, "decision: у варіанта немає effects");
        for (const e of o.effects ?? []) need(ids.has(e.target) && Number.isFinite(e.delta) && text(e.reason), `decision: ефект ${e.target} некоректний`);
      }
      for (const s of payload.stats ?? []) need(text(s.id) && text(s.label) && Number.isFinite(s.value), "decision: stat без id/label/value");
      break;
    }
    case "codeQuest":
      need(Object.hasOwn(CODE_TASKS, payload.task), `codeQuest: немає задачі ${payload.task}`);
      break;
    case "sqlQuest":
      need(Object.hasOwn(SQL_TASKS, payload.task), `sqlQuest: немає задачі ${payload.task}`);
      break;
    case "isolationLab":
      need(Object.hasOwn(LABS, payload.lab), `isolationLab: немає лабораторії ${payload.lab}`);
      break;
    default:
      out.push(`${where}: невідомий kind ${kind}`);
  }
  return out;
}
