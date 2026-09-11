/**
 * Валідація схеми до прогону.
 *
 * Помилки (error) блокують запуск: без маршруту до бази симулювати нічого.
 * Попередження (warn) запуск дозволяють — модель чесно покаже наслідки,
 * а текст заздалегідь підкаже, чого чекати. Кожна проблема несе посилання
 * в довідник, бо «щось не так» без «чому» нічого не вчить.
 */

import { COMPONENTS } from "../data/components.js";
import { CLASS_LABELS } from "../data/constants.js";
import { isUnlocked } from "../data/order.js";
import { compile, levelClasses } from "./compile.js";

const SERVERS_OF = {
  read: "базу даних (SQL/NoSQL) або сервер «все-в-одному»",
  write: "базу даних або чергу з воркерами",
  static: "об'єктне сховище, app-сервер чи сервер «все-в-одному»",
  query: "SQL-базу (NoSQL не вміє ad-hoc звітів)",
  conn: "WebSocket gateway",
};

export function validate(graph, level, plan = compile(graph, level)) {
  const issues = [];
  const push = (severity, code, text, extra = {}) => issues.push({ severity, code, text, ...extra });
  const context = level.unlockContext ?? level.id;

  if (plan.cyclic) push("error", "E-CYCLE", "У схемі є цикл: запит ходив би по колу вічно.", { codexRef: "what-happens-url" });

  for (const node of graph.nodes) {
    const def = COMPONENTS[node.type];
    if (!def || def.fixed) continue;
    const allowed = level.palette === "all" || level.palette?.includes(node.type);
    if (!allowed || !isUnlocked(def.unlock, context)) {
      push("error", "E-PALETTE", `${def?.label ?? node.type} недоступний на цьому рівні — приберіть вузол.`, {
        nodeId: node.id,
        codexRef: def?.codexRef,
      });
    }
  }

  for (const edge of graph.edges) {
    const from = plan.nodes[edge.from];
    const to = plan.nodes[edge.to];
    if (!from || !to || !from.def.connectsTo.includes(to.type)) {
      push("error", "E-EDGE", `Зв'язок ${edge.from} → ${edge.to} неможливий.`, { edgeId: edge.id });
    }
  }

  for (const type of level.required ?? []) {
    if (!graph.nodes.some((node) => node.type === type)) {
      push("error", "E-REQUIRED", `Рівень вимагає компонент «${COMPONENTS[type].label}».`, {
        codexRef: COMPONENTS[type].codexRef,
      });
    }
  }

  for (const cls of levelClasses(level)) {
    if (!plan.full[plan.clientId]?.has(cls)) {
      push(
        "error",
        "E-ROUTE",
        `Запити «${CLASS_LABELS[cls]}» не мають шляху від користувачів до вузла, що їх обслуговує. Потрібен шлях до: ${SERVERS_OF[cls]}.`,
        { cls, codexRef: "what-happens-url" },
      );
    }
  }

  for (const node of Object.values(plan.nodes)) {
    if (node.type === "client") continue;
    if (!plan.reach.has(node.id)) {
      const severity = node.def.fixed ? "error" : "warn";
      push(
        severity,
        "W-ORPHAN",
        node.def.fixed
          ? `${node.label} ні з чим не з'єднаний, а без нього цей рівень не має сенсу — під'єднайте його.`
          : `${node.label} недосяжний від користувачів: за нього платять, а він нічого не робить.`,
        { nodeId: node.id },
      );
    }

    const instances = node.cfg.instances ?? 1;
    const viaDns = node.in.some((id) => plan.nodes[id].type === "dns");
    if (node.def.clustered && ["app", "wsgateway"].includes(node.type) && instances > 1 && viaDns) {
      push(
        "warn",
        "W-NOLB",
        `${node.label}: ${instances} інстанси без балансувальника. DNS round-robin не знає, який інстанс живий, і ділить трафік нерівно.`,
        { nodeId: node.id, codexRef: "load-balancer" },
      );
    }

    if (node.type === "app" && level.data?.sessions && instances > 1 && node.cfg.sessions === "local") {
      push(
        "warn",
        "W-SESSIONS",
        `${node.label}: сесії в пам'яті інстансу при ${instances} інстансах — наступний запит потрапить на інший інстанс, і користувача «розлогінить».`,
        { nodeId: node.id, codexRef: "stateless" },
      );
    }

    if (node.type === "queue" && node.cfg.mode !== "pubsub" && !node.out.length) {
      push("error", "E-ROUTE", `${node.label} без воркерів: повідомлення накопичуються, і їх ніхто не обробляє.`, {
        nodeId: node.id,
        codexRef: "message-queues",
      });
    }
  }

  return issues;
}

export function hasErrors(issues) {
  return issues.some((issue) => issue.severity === "error");
}
