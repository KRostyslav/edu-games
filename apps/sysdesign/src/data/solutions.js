/**
 * Еталонні й наївні рішення рівнів.
 *
 * Не для гравця, а для балансу: `scripts/simulate.mjs` проганяє кожне рішення
 * й перевіряє, що еталон бере три зірки на всіх seed, а наївне рішення —
 * те, що людина збирає, не знаючи уроку рівня, — не бере другої.
 * Так рівень гарантовано і розв'язний, і не тривіальний.
 *
 * Формат компактний: вузол — [id, тип, x, y, налаштування], ребро —
 * [звідки, куди, політика]. Користувачі (client) є в кожному графі завжди.
 */

import { createGraph, defaultConfig, connect } from "../sim/graph.js";

export const SOLUTIONS = {
  "l1-1": {
    reference: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["server-1", "server", 5, 3, { size: "M" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "server-1"]],
    },
    naive: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["server-1", "server", 5, 3, { size: "S" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "server-1"]],
    },
  },

  "l1-2": {
    reference: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["app-1", "app", 5, 3, { size: "L" }],
        ["sql-1", "sql", 8, 3, { size: "M" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "app-1"], ["app-1", "sql-1"]],
    },
    naive: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["server-1", "server", 5, 3, { size: "XL" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "server-1"]],
    },
  },

  "l2-1": {
    reference: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 6, sessions: "shared" }],
        ["sql-1", "sql", 9, 3, { size: "L" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "sql-1"]],
    },
    naive: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 6, sessions: "local" }],
        ["sql-1", "sql", 9, 3, { size: "L" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "sql-1"]],
    },
  },

  "l2-2": {
    reference: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 13 }],
        ["cache-1", "cache", 8, 1, { sizeGb: 16, ttlSec: 60, coalescing: true }],
        ["sql-1", "sql", 9, 4, { size: "M" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "cache-1"], ["app-1", "sql-1"]],
    },
    naive: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 13 }],
        ["cache-1", "cache", 8, 1, { sizeGb: 16, ttlSec: 60 }],
        ["sql-1", "sql", 9, 4, { size: "M" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "cache-1"], ["app-1", "sql-1"]],
    },
  },

  "l2-3": {
    reference: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["cdn-1", "cdn", 4, 1, { ttlSec: 86_400 }],
        ["s3-1", "objstore", 8, 1],
        ["lb-1", "lb", 4, 4],
        ["app-1", "app", 6, 4, { instances: 2 }],
        ["sql-1", "sql", 9, 4, { size: "M" }],
      ],
      edges: [
        ["client", "dns-1"],
        ["dns-1", "cdn-1"],
        ["cdn-1", "s3-1"],
        ["dns-1", "lb-1"],
        ["lb-1", "app-1"],
        ["app-1", "sql-1"],
      ],
    },
    naive: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 3 }],
        ["s3-1", "objstore", 9, 1],
        ["sql-1", "sql", 9, 4, { size: "M" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "s3-1"], ["app-1", "sql-1"]],
    },
  },

  "l3-1": {
    reference: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 8 }],
        ["cache-1", "cache", 8, 1, { sizeGb: 16 }],
        ["sql-1", "sql", 9, 4, { size: "M", replicas: 2, standby: true }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "cache-1"], ["app-1", "sql-1"]],
    },
    naive: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 8 }],
        ["cache-1", "cache", 8, 1, { sizeGb: 16 }],
        ["sql-1", "sql", 9, 4, { size: "L" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "cache-1"], ["app-1", "sql-1"]],
    },
  },

  "l3-2": {
    reference: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 2 }],
        ["sql-1", "sql", 9, 3, { size: "M", indexes: 2, replicas: 1 }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "sql-1"]],
    },
    naive: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 2 }],
        ["sql-1", "sql", 9, 3, { size: "L" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "sql-1"]],
    },
  },

  "l3-3": {
    reference: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 10 }],
        ["nosql-1", "nosql", 9, 3, { instances: 5, rf: 3, consistency: "QUORUM", partitionKey: "device", hashing: "consistent" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "nosql-1"]],
    },
    naive: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 10 }],
        ["nosql-1", "nosql", 9, 3, { instances: 5, rf: 3, consistency: "QUORUM", partitionKey: "timestamp" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "nosql-1"]],
    },
  },

  "l4-1": {
    reference: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lim-1", "ratelimiter", 3, 3, { algorithm: "token", limit: 20, burst: 5 }],
        ["lb-1", "lb", 5, 3],
        ["app-1", "app", 7, 3, { instances: 4 }],
        ["cache-1", "cache", 9, 1],
        ["sql-1", "sql", 10, 4, { size: "M" }],
      ],
      edges: [
        ["client", "dns-1"],
        ["dns-1", "lim-1"],
        ["lim-1", "lb-1"],
        ["lb-1", "app-1"],
        ["app-1", "cache-1"],
        ["app-1", "sql-1"],
      ],
    },
    naive: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 4 }],
        ["cache-1", "cache", 8, 1],
        ["sql-1", "sql", 9, 4, { size: "M" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "cache-1"], ["app-1", "sql-1"]],
    },
    alternatives: [
      {
        nodes: [
          ["dns-1", "dns", 2, 3],
          ["api-1", "gateway", 4, 3, { instances: 2, rateLimit: 20 }],
          ["app-1", "app", 7, 3, { instances: 4 }],
          ["cache-1", "cache", 9, 1],
          ["sql-1", "sql", 10, 4, { size: "M" }],
        ],
        edges: [["client", "dns-1"], ["dns-1", "api-1"], ["api-1", "app-1"], ["app-1", "cache-1"], ["app-1", "sql-1"]],
      },
    ],
  },

  "l4-2": {
    reference: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 5, autoscale: true, maxInstances: 12 }],
        ["cache-1", "cache", 8, 1],
        ["sql-1", "sql", 10, 3, { size: "L" }],
        ["mq-1", "queue", 7, 5, { maxDepth: 1_000_000 }],
        ["wrk-1", "worker", 9, 5, { instances: 3, idempotent: true }],
      ],
      edges: [
        ["client", "dns-1"],
        ["dns-1", "lb-1"],
        ["lb-1", "app-1"],
        ["app-1", "cache-1"],
        ["app-1", "sql-1"],
        ["app-1", "mq-1"],
        ["mq-1", "wrk-1"],
        ["wrk-1", "sql-1"],
      ],
    },
    naive: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 3, autoscale: true, maxInstances: 12 }],
        ["cache-1", "cache", 8, 1],
        ["sql-1", "sql", 10, 3, { size: "L" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "cache-1"], ["app-1", "sql-1"]],
    },
  },

  "l4-3": {
    reference: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 3 }],
        ["sql-1", "sql", 9, 4, { size: "M" }],
      ],
      edges: [
        ["client", "dns-1"],
        ["dns-1", "lb-1"],
        ["lb-1", "app-1"],
        ["app-1", "sql-1"],
        ["app-1", "pay", { timeoutMs: 1000, breaker: true, fallback: "degrade" }],
      ],
    },
    naive: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 3 }],
        ["sql-1", "sql", 9, 4, { size: "M" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "sql-1"], ["app-1", "pay"]],
    },
  },

  "l4-4": {
    reference: {
      nodes: [
        ["dns-1", "dns", 2, 3, { policy: "failover", ttlSec: 60 }],
        ["lb-1", "lb", 4, 3, { drRegion: true }],
        ["app-1", "app", 6, 3, { instances: 4, zones: 2, drRegion: true }],
        ["sql-1", "sql", 9, 3, { size: "M", replicas: 1, standby: true, drRegion: true }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "sql-1"]],
    },
    naive: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 4 }],
        ["sql-1", "sql", 9, 3, { size: "M", standby: true }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "sql-1"]],
    },
  },

  "l5-1": {
    reference: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 11, autoscale: true, maxInstances: 20, localCache: true }],
        ["cache-1", "cache", 8, 1, { instances: 3, sizeGb: 16, ttlSec: 3600, hashing: "consistent", coalescing: true }],
        ["kv-1", "nosql", 9, 4, { instances: 3, rf: 3, hashing: "consistent" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "cache-1"], ["app-1", "kv-1"]],
    },
    naive: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 11, autoscale: true, maxInstances: 20 }],
        ["cache-1", "cache", 8, 1, { instances: 3, sizeGb: 16, ttlSec: 3600, hashing: "consistent", coalescing: true }],
        ["kv-1", "nosql", 9, 4, { instances: 3, rf: 3, hashing: "consistent" }],
      ],
      edges: [["client", "dns-1"], ["dns-1", "lb-1"], ["lb-1", "app-1"], ["app-1", "cache-1"], ["app-1", "kv-1"]],
    },
  },

  "l5-2": {
    reference: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 6, fanout: "hybrid" }],
        ["cache-1", "cache", 8, 1, { instances: 2, sizeGb: 16 }],
        ["nosql-1", "nosql", 10, 3, { instances: 5 }],
        ["mq-1", "queue", 7, 5],
        ["wrk-1", "worker", 9, 5, { instances: 3, idempotent: true }],
      ],
      edges: [
        ["client", "dns-1"],
        ["dns-1", "lb-1"],
        ["lb-1", "app-1"],
        ["app-1", "cache-1"],
        ["app-1", "nosql-1"],
        ["app-1", "mq-1"],
        ["mq-1", "wrk-1"],
        ["wrk-1", "nosql-1"],
      ],
    },
    naive: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["app-1", "app", 6, 3, { instances: 6, fanout: "write" }],
        ["cache-1", "cache", 8, 1, { instances: 2, sizeGb: 16 }],
        ["nosql-1", "nosql", 10, 3, { instances: 5 }],
        ["mq-1", "queue", 7, 5],
        ["wrk-1", "worker", 9, 5, { instances: 3, idempotent: true }],
      ],
      edges: [
        ["client", "dns-1"],
        ["dns-1", "lb-1"],
        ["lb-1", "app-1"],
        ["app-1", "cache-1"],
        ["app-1", "nosql-1"],
        ["app-1", "mq-1"],
        ["mq-1", "wrk-1"],
        ["wrk-1", "nosql-1"],
      ],
    },
  },

  "l5-3": {
    reference: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["ws-1", "wsgateway", 6, 3, { instances: 11, reconnectJitter: true }],
        ["app-1", "app", 8, 3, { instances: 10 }],
        ["cache-1", "cache", 10, 1, { instances: 2, sizeGb: 16 }],
        ["nosql-1", "nosql", 11, 3, { instances: 6 }],
        ["mq-1", "queue", 10, 5, { instances: 2, mode: "pubsub" }],
      ],
      edges: [
        ["client", "dns-1"],
        ["dns-1", "lb-1"],
        ["lb-1", "ws-1"],
        ["ws-1", "app-1"],
        ["app-1", "cache-1"],
        ["app-1", "nosql-1"],
        ["app-1", "mq-1"],
      ],
    },
    naive: {
      nodes: [
        ["dns-1", "dns", 2, 3],
        ["lb-1", "lb", 4, 3],
        ["ws-1", "wsgateway", 6, 3, { instances: 9 }],
        ["app-1", "app", 8, 3, { instances: 10 }],
        ["cache-1", "cache", 10, 1, { instances: 2, sizeGb: 16 }],
        ["nosql-1", "nosql", 11, 3, { instances: 6 }],
        ["mq-1", "queue", 10, 5, { instances: 2, mode: "pubsub" }],
      ],
      edges: [
        ["client", "dns-1"],
        ["dns-1", "lb-1"],
        ["lb-1", "ws-1"],
        ["ws-1", "app-1"],
        ["app-1", "cache-1"],
        ["app-1", "nosql-1"],
        ["app-1", "mq-1"],
      ],
    },
  },
};

/** Будує граф рішення. Кидає виняток, якщо еталон порушує правила з'єднань. */
export function buildSolution(level, spec) {
  const graph = createGraph(level);
  for (const [id, type, x, y, config = {}] of spec.nodes) {
    graph.nodes.push({ id, type, x, y, config: { ...defaultConfig(type, level), ...config } });
  }
  for (const [from, to, policy] of spec.edges) {
    const result = connect(graph, from, to);
    if (!result.ok) throw new Error(`${level.id}: ${from} → ${to}: ${result.reason}`);
    if (policy) Object.assign(result.edge.policy, policy);
  }
  return graph;
}
