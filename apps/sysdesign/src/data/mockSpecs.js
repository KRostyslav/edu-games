/**
 * Крок high-level design у mock interview: умови для конструктора й еталонна схема.
 *
 * Чотири задачі беруть вимоги з відповідних рівнів кампанії — так схема, яку
 * гравець малює на співбесіді, проганяється тією самою чесною моделлю й
 * тими самими інцидентами. Відмінність одна: палітра відкрита повністю,
 * бо на справжній співбесіді ніхто не підказує, які компоненти знадобляться.
 */

import { LEVELS } from "./levels.js";
import { SOLUTIONS } from "./solutions.js";

const sandbox = (levelId, overrides = {}) => ({ ...LEVELS[levelId], ...overrides, palette: "all", unlockContext: "all" });

const VIDEO_SPEC = {
  id: "mock-video",
  chapter: 5,
  title: "Відеостримінг",
  teaser: "Upload, транскодування, CDN",
  traffic: { rps: 6000, mix: { static: 0.93, read: 0.05, write: 0.02 }, geo: { eu: 0.4, us: 0.4, asia: 0.2 } },
  data: {
    writeWork: 4,
    staticKb: 500,
    totalGb: 2_000_000,
    cdnHitMax: 0.98,
    cdnMissWindowSec: 3600,
    hotSetGb: 20,
    cacheable: 0.9,
    missWindowSec: 60,
  },
  slo: { p99Ms: { static: 200, read: 450 }, availability: 0.99, graceTicks: 1, maxLagSec: 900 },
  budget: null,
  palette: "all",
  unlockContext: "all",
  required: ["dns"],
  incidents: [
    { at: 20, dur: 12, type: "spike", mult: 4, classes: ["static"], title: "Відео стало вірусним" },
    { at: 40, dur: 10, type: "spike", mult: 3, classes: ["write"], ramp: 3, title: "Хвиля завантажень" },
  ],
  checks: [{ id: "cdnForStatic" }, { id: "writesViaQueue" }],
  hints: [],
  codexRefs: ["video-streaming", "cdn", "object-storage", "message-queues"],
  debrief: { lesson: "", interview: "" },
};

const VIDEO_REFERENCE = {
  nodes: [
    ["dns-1", "dns", 2, 3],
    ["cdn-1", "cdn", 4, 1, { ttlSec: 86_400 }],
    ["s3-1", "objstore", 8, 1],
    ["lb-1", "lb", 4, 4],
    ["app-1", "app", 6, 4, { instances: 3 }],
    ["cache-1", "cache", 8, 3],
    ["sql-1", "sql", 10, 4, { size: "M", standby: true }],
    ["mq-1", "queue", 7, 6],
    ["wrk-1", "worker", 9, 6, { instances: 4, autoscale: true, maxInstances: 12, idempotent: true }],
  ],
  edges: [
    ["client", "dns-1"],
    ["dns-1", "cdn-1"],
    ["cdn-1", "s3-1"],
    ["dns-1", "lb-1"],
    ["lb-1", "app-1"],
    ["app-1", "cache-1"],
    ["app-1", "sql-1"],
    ["app-1", "mq-1"],
    ["mq-1", "wrk-1"],
    ["wrk-1", "sql-1"],
  ],
};

export const MOCK_SPECS = {
  "mock-url": { spec: sandbox("l5-1", { id: "mock-url" }), reference: SOLUTIONS["l5-1"].reference },
  "mock-feed": { spec: sandbox("l5-2", { id: "mock-feed" }), reference: SOLUTIONS["l5-2"].reference },
  "mock-chat": { spec: sandbox("l5-3", { id: "mock-chat" }), reference: SOLUTIONS["l5-3"].reference },
  "mock-ratelimit": { spec: sandbox("l4-1", { id: "mock-ratelimit" }), reference: SOLUTIONS["l4-1"].reference },
  "mock-video": { spec: VIDEO_SPEC, reference: VIDEO_REFERENCE },
};
