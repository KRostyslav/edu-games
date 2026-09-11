/**
 * Перевірки «як на співбесіді» — третя зірка.
 *
 * SLO відповідає на питання «чи працює», а ці перевірки — «чи так би це
 * побудував сильний кандидат». Наприклад, у спокійну годину без відмов
 * зайвий інстанс не потрібен, але інтерв'юер однаково спитає: «а що, як
 * цей вузол впаде?». Кожна перевірка — окрема ідея з довідника.
 */

const REDUNDANT_ALWAYS = new Set(["client", "dns", "lb", "cdn", "objstore", "external", "queue"]);

function usedNodes(plan, run) {
  const base = run.ticks?.[0]?.nodes ?? {};
  return Object.values(plan.nodes).filter((node) => node.type !== "client" && (base[node.id]?.rps ?? 0) > 0);
}

function listFailures(nodes, predicate) {
  const bad = nodes.filter((node) => !predicate(node));
  return { ok: bad.length === 0, detail: bad.length ? `Не виконано: ${bad.map((node) => node.label).join(", ")}` : "" };
}

function redundant(node) {
  if (REDUNDANT_ALWAYS.has(node.type)) return true;
  if (node.type === "server") return false;
  if (node.type === "sql") return Boolean(node.cfg.standby) || (node.cfg.replicas ?? 0) > 0;
  if (node.type === "nosql") return node.cfg.rf >= 2;
  if (node.def.clustered) return (node.cfg.instances ?? 1) >= 2;
  return true;
}

export const CHECKS = {
  noSpof: {
    label: "Жодної єдиної точки відмови на шляху запитів",
    codexRef: "sla-slo-sli",
    test: (plan, run) => listFailures(usedNodes(plan, run), redundant),
  },

  multiZone: {
    label: "Обчислення рознесені щонайменше по двох AZ, база — Multi-AZ",
    codexRef: "cloud-regions",
    test: (plan, run) =>
      listFailures(usedNodes(plan, run), (node) => {
        if (node.type === "sql") return Boolean(node.cfg.standby);
        if (["app", "cache", "worker", "wsgateway", "gateway", "ratelimiter"].includes(node.type)) return (node.cfg.zones ?? 1) >= 2;
        return true;
      }),
  },

  writesViaQueue: {
    label: "Записи йдуть у базу через чергу, а не напряму з app",
    codexRef: "message-queues",
    test: (plan) => {
      const direct = Object.values(plan.nodes).filter(
        (node) =>
          node.type === "app" &&
          plan.routes[node.id].write.groups.some((group) => group.some((edge) => ["sql", "nosql"].includes(plan.nodes[edge.to].type))),
      );
      const hasQueue = Object.values(plan.nodes).some((node) => node.type === "queue");
      return {
        ok: hasQueue && direct.length === 0,
        detail: !hasQueue ? "Черги немає." : direct.length ? `Напряму пише: ${direct.map((node) => node.label).join(", ")}` : "",
      };
    },
  },

  idempotent: {
    label: "Воркери обробляють повідомлення ідемпотентно",
    codexRef: "idempotency",
    test: (plan) => listFailures(Object.values(plan.nodes).filter((node) => node.type === "worker"), (node) => node.cfg.idempotent),
  },

  breakerOnExternal: {
    label: "Виклики зовнішнього сервісу — з таймаутом ≤ 3 с і circuit breaker",
    codexRef: "circuit-breaker",
    test: (plan) => {
      const edges = [];
      for (const node of Object.values(plan.nodes)) {
        for (const edge of node.out) if (plan.nodes[edge.to].type === "external") edges.push({ node, edge });
      }
      const bad = edges.filter(({ edge }) => !(edge.policy.breaker && edge.policy.timeoutMs <= 3000));
      return {
        ok: edges.length > 0 && bad.length === 0,
        detail: bad.length ? `Без захисту: ${bad.map(({ node }) => node.label).join(", ")}` : "",
      };
    },
  },

  noRetryStorm: {
    label: "Повтори — лише з exponential backoff і jitter",
    codexRef: "retries-backoff",
    test: (plan) => {
      const bad = [];
      for (const node of Object.values(plan.nodes)) {
        for (const edge of node.out) if (edge.policy.retries > 0 && !edge.policy.backoff) bad.push(node.label);
      }
      return { ok: bad.length === 0, detail: bad.length ? `Retry без backoff: ${bad.join(", ")}` : "" };
    },
  },

  quorum: {
    label: "R + W > N: QUORUM при RF = 3",
    codexRef: "consistency-models",
    test: (plan) =>
      listFailures(Object.values(plan.nodes).filter((node) => node.type === "nosql"), (node) => node.cfg.rf >= 3 && node.cfg.consistency === "QUORUM"),
  },

  rpoZero: {
    label: "Failover бази без втрати записів (RPO = 0)",
    codexRef: "replication",
    test: (plan, run) => {
      const sqls = Object.values(plan.nodes).filter((node) => node.type === "sql");
      const safe = sqls.every((node) => node.cfg.standby || ((node.cfg.replicas ?? 0) > 0 && node.cfg.replication === "sync"));
      const lost = Math.round(run.summary?.rpoLost ?? 0);
      return { ok: safe && lost === 0, detail: lost ? `Загублено ~${lost} записів.` : safe ? "" : "Немає синхронної копії primary." };
    },
  },

  cdnForStatic: {
    label: "Статика йде через CDN",
    codexRef: "cdn",
    test: (plan, run) => {
      const cdn = usedNodes(plan, run).some((node) => node.type === "cdn");
      return { ok: cdn, detail: cdn ? "" : "Статику віддає origin." };
    },
  },

  statelessApp: {
    label: "App без стану: сесії у спільному сховищі",
    codexRef: "stateless",
    test: (plan) => listFailures(Object.values(plan.nodes).filter((node) => node.type === "app"), (node) => node.cfg.sessions === "shared"),
  },

  drReady: {
    label: "Резерв в іншому регіоні для всього критичного шляху + DNS failover",
    codexRef: "multi-region",
    test: (plan, run) => {
      const dns = Object.values(plan.nodes).find((node) => node.type === "dns");
      const needsDr = usedNodes(plan, run).filter((node) => !["dns", "cdn", "objstore", "external"].includes(node.type));
      const bad = needsDr.filter((node) => !node.cfg.drRegion);
      const dnsOk = dns?.cfg.policy === "failover";
      const parts = [];
      if (!dnsOk) parts.push("DNS без failover");
      if (bad.length) parts.push(`без резерву: ${bad.map((node) => node.label).join(", ")}`);
      return { ok: dnsOk && bad.length === 0, detail: parts.join("; ") };
    },
  },

  reconnectJitter: {
    label: "Клієнти перепідключаються з backoff і jitter",
    codexRef: "retries-backoff",
    test: (plan) =>
      listFailures(Object.values(plan.nodes).filter((node) => node.type === "wsgateway"), (node) => node.cfg.reconnectJitter),
  },

  hybridFanout: {
    label: "Hybrid fan-out: пости зірок не розсилаються в мільйони стрічок",
    codexRef: "news-feed",
    test: (plan) => ({ ok: plan.globals.fanout === "hybrid", detail: plan.globals.fanout === "hybrid" ? "" : `Зараз: ${plan.globals.fanout}` }),
  },

  consistentHashing: {
    label: "Consistent hashing для розподілених сховищ",
    codexRef: "consistent-hashing",
    test: (plan) =>
      listFailures(
        Object.values(plan.nodes).filter((node) => ["nosql", "cache"].includes(node.type) && (node.cfg.instances ?? 1) > 1),
        (node) => node.cfg.hashing === "consistent",
      ),
  },

  goodShardKey: {
    label: "Partition key рівномірно розкладає записи",
    codexRef: "sharding",
    test: (plan) => {
      const keys = plan.level.data?.partitionKeys ?? {};
      const best = Math.min(...Object.values(keys));
      return listFailures(Object.values(plan.nodes).filter((node) => node.type === "nosql"), (node) => keys[node.cfg.partitionKey] === best);
    },
  },

  indexesMatch: {
    label: "Рівно стільки індексів, скільки потрібно запитам",
    codexRef: "indexes",
    test: (plan) => {
      const need = plan.level.data?.queryIndexes ?? 0;
      return listFailures(Object.values(plan.nodes).filter((node) => node.type === "sql"), (node) => node.cfg.indexes === need);
    },
  },

  limiterFirst: {
    label: "Лімітер відсікає трафік до того, як він дійде до app",
    codexRef: "rate-limiting",
    test: (plan) => {
      const limits = (node) => node.type === "ratelimiter" || (node.type === "gateway" && node.cfg.rateLimit > 0);
      // Чи можна дійти до app, не пройшовши крізь лімітер.
      const seen = new Set();
      const stack = [plan.clientId];
      let leak = false;
      while (stack.length) {
        const id = stack.pop();
        if (seen.has(id)) continue;
        seen.add(id);
        const node = plan.nodes[id];
        if (limits(node)) continue;
        if (node.type === "app") leak = true;
        for (const edge of node.out) stack.push(edge.to);
      }
      return { ok: !leak, detail: leak ? "Є шлях до app повз лімітер." : "" };
    },
  },

  stampedeSafe: {
    label: "Кеш захищений від cache stampede (request coalescing)",
    codexRef: "cache-invalidation",
    test: (plan) => listFailures(Object.values(plan.nodes).filter((node) => node.type === "cache"), (node) => node.cfg.coalescing),
  },
};
