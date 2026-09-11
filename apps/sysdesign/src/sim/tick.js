/**
 * Одна хвилина моделі.
 *
 * Порядок роботи:
 *   1. prepare   — стан вузлів на цю хвилину: скільки інстансів живі, яке
 *                  влучання в кеш, що відкидає лімітер, хто в failover.
 *   2. propagate — потоки req/s від користувачів униз по плану маршрутів
 *                  (з повторами retry), завантаження ρ і помилки кожного вузла.
 *   3. evaluate  — знизу вгору: частка успіху й суміш латентностей для
 *                  кожного вузла й класу, з таймаутами й circuit breaker.
 *   4. feedback  — те, що замикає петлю: потоки app зайняті очікуванням
 *                  (закон Літтла), повтори залежать від помилок, черга —
 *                  від успіху воркерів. Кроки 2–4 повторюються до збіжності.
 *
 * Модель рахує потоки, а не окремі запити: так вона детермінована, швидка
 * (весь прогін — десятки мілісекунд) і при цьому показує саме те, що
 * питають на співбесіді: де вузьке місце і що буде при відмові.
 */

import { workOf, baseMsOf } from "../data/components.js";
import {
  SIZES,
  CLASSES,
  USER_RTT,
  EDGE_RTT,
  SATURATED_MS,
  TICK_SEC,
  AUTOSCALE_TARGET,
  AUTOSCALE_DELAY_TICKS,
  loadBand,
} from "../data/constants.js";
import { waitMs, point, shift, seq, mix, quantile, meanOf, cappedMean, cutAt } from "./queueing.js";

const ITERATIONS = 6;
/** Вузли, які не живуть в одному регіоні: відмова регіону їх не зачіпає. */
const GLOBAL_TYPES = new Set(["client", "dns", "cdn", "objstore", "external"]);
/** Класи, з яких рахується доступність. Атака — не користувачі. */
export const AVAIL_CLASSES = ["read", "write", "static", "query"];

const zero = () => ({ read: 0, write: 0, static: 0, query: 0, conn: 0, abuse: 0 });

// ─────────────────────────── стан між хвилинами ───────────────────────────

export function initCarry(plan) {
  const carry = {
    warmth: {},
    instances: {},
    desired: {},
    backlog: {},
    pending: {},
    replLag: {},
    breaker: {},
    rpoDone: new Set(),
    history: {},
    prev: { err: {}, edgeFail: {}, threadRho: {}, subtreeOk: {} },
  };
  for (const node of Object.values(plan.nodes)) {
    const start = node.cfg.instances ?? 1;
    carry.warmth[node.id] = 1;
    carry.instances[node.id] = start;
    // Рішення, ухвалене наприкінці хвилини t, діє з хвилини t + AUTOSCALE_DELAY_TICKS.
    carry.desired[node.id] = Array(Math.max(0, AUTOSCALE_DELAY_TICKS - 1)).fill(start);
    carry.backlog[node.id] = 0;
    carry.pending[node.id] = 0;
    carry.replLag[node.id] = 0;
    carry.history[node.id] = [];
  }
  return carry;
}

// ─────────────────────────── головний цикл ───────────────────────────

export function solveTick(plan, env, carry, t, rng) {
  const offered = offeredTraffic(plan, env, rng);
  const st = prepare(plan, env, carry, offered, t);

  let prev = carry.prev;
  let flows = null;
  let results = null;
  for (let i = 0; i < ITERATIONS; i += 1) {
    flows = propagate(plan, st, offered, prev, carry);
    results = evaluate(plan, st, carry);
    const next = feedback(plan, st, results, prev);
    const delta = maxDelta(prev, next);
    prev = next;
    if (i > 0 && delta < 0.002) break;
  }
  carry.prev = prev;

  const metrics = collect(plan, st, flows, results, offered, env, carry, t);
  advanceCarry(plan, st, results, carry, env);
  return metrics;
}

function offeredTraffic(plan, env, rng) {
  const { traffic, data = {} } = plan.level;
  const noiseAmp = traffic.noise ?? 0.03;
  const noise = 1 + (rng.next() * 2 - 1) * noiseAmp;
  const offered = zero();
  for (const [cls, share] of Object.entries(traffic.mix ?? {})) {
    offered[cls] = traffic.rps * share * (env.mult[cls] ?? 1) * noise;
  }
  if (data.conns) offered.conn = (data.conns / (data.sessionSec ?? 1800)) * (env.mult.conn ?? 1);
  offered.abuse = env.abuseRps;
  return offered;
}

// ─────────────────────────── 1. prepare ───────────────────────────

function prepare(plan, env, carry, offered, t) {
  const level = plan.level;
  const data = level.data ?? {};
  const st = {};
  const blackhole = env.region ? env.region.since < blackholeTicks(plan) : false;
  const localCacheOn = Object.values(plan.nodes).some((node) => node.type === "app" && node.cfg.localCache);

  for (const node of Object.values(plan.nodes)) {
    const { def, cfg, type } = node;
    const s = {
      live: 1,
      instances: def.clustered ? carry.instances[node.id] : 1,
      sizeCap: def.sized ? SIZES[cfg.size ?? "M"].cap : 1,
      classErr: {},
      extraErr: 0,
      extraMs: {},
      hit: {},
      drop: {},
      outMult: {},
      workMult: {},
      imbalance: 1,
      err: zero(),
      forward: zero(),
      region: "home",
      notes: [],
      serviceMs: baseMsOf(def, "read"),
    };
    st[node.id] = s;
    if (type === "client") continue;

    if (env.scaleOut[node.id]) s.instances += env.scaleOut[node.id].count;

    // Відмови: інстанси, зона, регіон.
    let downFrac = 0;
    let failSince = null;
    for (const event of env.events[node.id] ?? []) {
      const count = event.count === "all" ? s.instances : Math.min(s.instances, event.count);
      downFrac = Math.max(downFrac, def.clustered ? count / Math.max(1, s.instances) : 1);
      failSince = event.since;
    }
    if (env.zone && !def.managed && !GLOBAL_TYPES.has(type)) {
      const zoneFrac = zoneLoss(node);
      if (zoneFrac > downFrac) {
        downFrac = zoneFrac;
        failSince = env.zone.since;
      }
    }
    if (env.region && !GLOBAL_TYPES.has(type)) {
      if (!cfg.drRegion || blackhole) {
        downFrac = 1;
        s.unreachable = Boolean(cfg.drRegion) || blackhole;
      } else {
        s.region = "dr";
      }
    }
    if (type === "sql") {
      // У бази відмова primary — не «мінус інстанс», а failover зі своєю логікою.
      s.sqlFail = sqlFailure(node, env, blackhole, carry);
      downFrac = s.sqlFail?.mode === "down" ? 1 : 0;
      if (s.sqlFail?.rpo && !carry.rpoDone.has(s.sqlFail.rpoKey)) {
        s.rpoLost = s.sqlFail.rpo * offered.write;
        carry.rpoDone.add(s.sqlFail.rpoKey);
      }
      if (cfg.standby || (cfg.replicas > 0 && cfg.replication === "sync")) s.extraMs.write = 2;
    }
    s.live = 1 - downFrac;
    s.failSince = failSince;

    // Балансування, сесії, health checks.
    if (["app", "wsgateway"].includes(type) && s.instances > 1) {
      // Внутрішні виклики (WS → app, воркер → app) ходять через service discovery
      // з health checks. Сліпий розподіл — лише DNS round-robin від користувачів.
      const viaDns = node.in.some((id) => plan.nodes[id].type === "dns");
      if (viaDns) {
        s.noHealthCheck = true;
        s.imbalance = 1.3;
        // Без health check трафік і далі йде на мертві інстанси.
        s.extraErr = 1 - (1 - s.extraErr) * (1 - downFrac);
      }
    }
    if (type === "app" && data.sessions && s.instances > 1) {
      const share = data.sessions;
      if (cfg.sessions === "local") {
        s.extraErr = 1 - (1 - s.extraErr) * (1 - share * (1 - 1 / s.instances));
        s.sessionsBroken = true;
      } else if (cfg.sessions === "sticky") {
        s.imbalance *= 1.25;
        if (downFrac > 0 && failSince != null && failSince < 2) {
          s.extraErr = 1 - (1 - s.extraErr) * (1 - share * downFrac);
          s.sessionsLost = true;
        }
      } else if (cfg.sessions === "shared") {
        s.extraMsAll = 1;
      }
    }

    // Влучання: кеш, CDN, локальний кеш застосунку.
    if (type === "cache") {
      s.hot = (env.hot[node.id] ?? 0) * (localCacheOn ? 0.1 : 1);
      s.hit.read = cacheHit(node, s, carry, data);
      s.hit.abuse = 0; // скрейпери ходять по довгому хвосту — у кеш не влучають
    }
    if (type === "cdn") {
      const ttl = cfg.ttlSec ?? 3600;
      s.hit.static = (data.cdnHitMax ?? 0.99) * (ttl / (ttl + (data.cdnMissWindowSec ?? 1800)));
    }
    if (type === "app" && cfg.localCache) {
      s.hit.read = Math.min(0.9, 0.1 + env.hotShare);
      s.localCache = true;
    }

    // Fan-out стрічки: скільки роботи породжує один пост чи одне читання.
    if (plan.globals.fanout && data.fanout) {
      const f = data.fanout;
      const mode = plan.globals.fanout;
      if (type === "app" && mode === "read") s.outMult.read = f.following / 10;
      if (type === "app" && mode === "hybrid") s.outMult.read = 1 + (f.celebsFollowed ?? 5) / 10;
      if (type === "worker") {
        const perPost = mode === "write" ? f.avgFollowers : mode === "hybrid" ? f.avgFollowers * (f.hybridShare ?? 0.7) : 1;
        s.outMult.write = perPost;
        s.workMult.write = 1 + perPost * 0.01;
      }
    }

    // Лімітери: частка, яку відкидає ліміт, окремо для атаки й звичайних клієнтів.
    if (type === "ratelimiter" || (type === "gateway" && cfg.rateLimit > 0)) {
      const algorithm = type === "gateway" ? "token" : cfg.algorithm;
      const limit = type === "gateway" ? cfg.rateLimit : cfg.limit;
      const burst = type === "gateway" ? 5 : cfg.burst ?? 1;
      const drops = limiterDrops(algorithm, limit, burst, data, env);
      for (const cls of CLASSES) s.drop[cls] = cls === "abuse" ? drops.abuse : drops.legit;
      s.limiter = drops;
    }

    if (type === "nosql") prepareNosql(node, s, env, data, downFrac);

    if (type === "external") {
      s.baseMs = { write: env.depMs ?? data.externalMs ?? def.baseMs };
      s.fastFail = true;
      s.capOverride = data.externalCap ?? def.cap;
      if (env.depDown) s.live = 0;
    }

    if (type === "wsgateway") {
      const wsCount = Object.values(plan.nodes).filter((item) => item.type === "wsgateway").length;
      s.heldConns = ((data.conns ?? 0) * (env.mult.conn ?? 1)) / Math.max(1, wsCount);
      s.jitter = Boolean(cfg.reconnectJitter);
      const lostNow = failSince === 0 ? s.heldConns * downFrac : 0;
      s.pendingIn = carry.pending[node.id] + lostNow;
    }

    if (type === "sql") {
      s.hot = env.hot[node.id] ?? 0;
      // Без потрібних індексів звіт — це full scan: не мілісекунди, а секунди.
      if ((cfg.indexes ?? 0) < (data.queryIndexes ?? 1)) s.baseMs = { query: 800 };
    }

    // Деякі сервіси дешевші за «середній» app: редирект чи роутинг повідомлень.
    if (type === "app" && data.appWork) {
      for (const cls of CLASSES) s.workMult[cls] = data.appWork;
    }

    if (type === "queue") {
      s.maxDepth = cfg.maxDepth;
      s.backlogIn = carry.backlog[node.id];
      if (env.celebrityPosts && plan.globals.fanout === "write" && data.fanout) {
        // Пост зірки при push-моделі — це мільйони вставок у чужі стрічки одразу.
        s.burstJobs = env.celebrityPosts / data.fanout.avgFollowers;
      }
    }
  }

  // Потужність споживачів черги відома лише після підготовки воркерів.
  for (const node of Object.values(plan.nodes)) {
    if (node.type !== "queue") continue;
    const s = st[node.id];
    s.consumerCap = 0;
    for (const group of plan.routes[node.id].write.groups) {
      for (const edge of group) {
        const ws = st[edge.to];
        const def = plan.nodes[edge.to].def;
        const perJob = ws.workMult.write ?? 1;
        s.consumerCap += (ws.instances * ws.live * def.cap) / perJob;
      }
    }
  }

  return st;
}

function blackholeTicks(plan) {
  const dns = Object.values(plan.nodes).find((node) => node.type === "dns");
  if (!dns || dns.cfg.policy !== "failover") return Infinity;
  return Math.ceil((dns.cfg.ttlSec ?? 300) / TICK_SEC);
}

/** Яка частка вузла зникає разом із зоною доступності. */
function zoneLoss(node) {
  const { type, def, cfg } = node;
  if (type === "sql") return 0; // окремо, через failover
  if (type === "queue") return 0; // керована черга реплікує партиції між AZ
  if (type === "nosql") return 1 / 3; // вузли кластера рознесені по трьох AZ
  if (def.clustered) return 1 / Math.max(1, cfg.zones ?? 1);
  return 1;
}

function sqlFailure(node, env, blackhole, carry) {
  const { cfg } = node;
  if (env.region) {
    if (!cfg.drRegion || blackhole) return { mode: "down" };
    if (env.region.since < 1) return { mode: "down" };
    // Міжрегіональна репліка асинхронна: кілька секунд записів губляться.
    return { mode: "dr", rpo: 2 + (carry.replLag[node.id] ?? 0), rpoKey: `${node.id}:region` };
  }
  const event = (env.events[node.id] ?? [])[0] ?? (env.zone ? { kind: "az", since: env.zone.since } : null);
  if (!event) return null;
  const key = `${node.id}:${event.kind}`;
  if (cfg.standby) return event.since < 1 ? { mode: "failover", key } : null;
  if ((cfg.replicas ?? 0) > 0) {
    if (event.since < 2) return { mode: "failover", key };
    const rpo = cfg.replication === "sync" ? 0 : 1 + (carry.replLag[node.id] ?? 0);
    return { mode: "promoted", rpo, rpoKey: `${key}:promote` };
  }
  return { mode: "down", key };
}

function cacheHit(node, s, carry, data) {
  if (s.live <= 0) return 0;
  const { cfg } = node;
  const liveShards = s.instances * s.live;
  const coverage = 1 - Math.exp((-3 * liveShards * cfg.sizeGb) / (data.hotSetGb ?? 10));
  const ttl = cfg.ttlSec;
  const ttlFactor = ttl / (ttl + (data.missWindowSec ?? 20));
  const warmth = carry.warmth[node.id];
  const hit = (data.cacheable ?? 0.95) * coverage * ttlFactor * warmth;
  // Coalescing схлопує одночасні промахи по гарячих ключах — рятує саме холодний кеш.
  const missFactor = cfg.coalescing ? 1 - 0.85 * (1 - warmth) : 1;
  return 1 - (1 - hit) * missFactor;
}

function limiterDrops(algorithm, limit, burst, data, env) {
  const clientRps = data.clientRps ?? 1;
  const abusePer = env.abuseRps > 0 ? env.abuseRps / env.abuseClients : 0;
  const passAbuse = algorithm === "fixed" ? Math.min(abusePer, 2 * limit) : Math.min(abusePer, limit);
  const allowed = algorithm === "token" ? limit * burst : limit;
  let legit = clientRps > allowed ? 1 - allowed / clientRps : 0;
  if (env.legitPeak && env.legitPeak > allowed) {
    const share = data.burstShare ?? 0.5;
    legit = Math.max(legit, share * (1 - allowed / env.legitPeak));
  }
  return { abuse: abusePer > 0 ? 1 - passAbuse / abusePer : 0, legit };
}

function consistencyCount(level, rf) {
  if (level === "ALL") return rf;
  if (level === "QUORUM") return Math.floor(rf / 2) + 1;
  return 1;
}

function prepareNosql(node, s, env, data, downFrac) {
  const { cfg } = node;
  const rf = Math.min(cfg.rf, s.instances);
  const k = consistencyCount(cfg.consistency, rf);
  s.rf = rf;
  s.k = k;
  s.extraMs.read = 3 * 0.3 * (k - 1);
  s.extraMs.write = 3 * 0.3 * (k - 1);
  s.keySkew = Math.max(data.partitionKeys?.[cfg.partitionKey] ?? 0, env.hot[node.id] ?? 0);

  if (downFrac > 0) {
    const affected = env.zone ? (rf >= 3 ? 1 : rf / 3) : Math.min(1, (downFrac * s.instances * rf) / s.instances);
    const alive = rf - 1;
    if (alive < k) {
      s.classErr.read = affected;
      s.classErr.abuse = affected;
      s.classErr.write = affected;
    }
  }

  const scale = env.scaleOut[node.id];
  if (scale && scale.since < 5) {
    const before = cfg.instances;
    const moved = cfg.hashing === "consistent" ? scale.count / (before + scale.count) : before / (before + scale.count);
    // Переїзд даних між вузлами — повноцінне читання й запис кожного ключа.
    s.rebalance = moved;
  }
}

// ─────────────────────────── 2. propagate ───────────────────────────

function propagate(plan, st, offered, prev, carry) {
  const inflow = {};
  const edgeFlow = {};
  for (const id of Object.keys(plan.nodes)) inflow[id] = zero();
  Object.assign(inflow[plan.clientId], offered);

  const add = (edge, cls, rate) => {
    inflow[edge.to][cls] += rate;
    edgeFlow[edge.id] = (edgeFlow[edge.id] ?? 0) + rate;
  };

  const sendVia = (edge, cls, rate) => {
    if (!(rate > 0)) return;
    // Розімкнений breaker не пропускає нічого, напіввідкритий — лише пробні запити.
    const probe = breakerProbe(carry, edge.id);
    if (probe != null) {
      add(edge, cls, rate * probe);
      return;
    }
    const fail = prev.edgeFail[`${edge.id}|${cls}`] ?? 0;
    let extra = 0;
    for (let k = 1; k <= edge.policy.retries; k += 1) extra += fail ** k;
    if (edge.policy.backoff) extra *= 0.35;
    add(edge, cls, rate * (1 + extra));
  };

  for (const id of plan.order) {
    const node = plan.nodes[id];
    const s = st[id];
    computeLoad(plan, node, s, inflow[id], prev, carry);

    for (const cls of CLASSES) {
      let out = s.forward[cls];
      if (!(out > 0)) continue;
      const route = plan.routes[id][cls];
      if (route.terminal) continue;
      out *= s.outMult[cls] ?? 1;

      for (const edge of route.chain) {
        add(edge, cls, out);
        const cs = st[edge.to];
        out *= 1 - (cs.hit[cls] ?? 0) * (1 - (prev.err[edge.to]?.[cls] ?? 0));
      }
      for (const group of route.groups) {
        const weights = splitWeights(group, st);
        group.forEach((edge, i) => sendVia(edge, cls, out * weights[i]));
      }
    }
  }
  return { inflow, edgeFlow };
}

/**
 * Частка трафіку, яку пропускає breaker: null — замкнений (пропускає все),
 * 0 — розімкнений, 0.05 — напіввідкритий (пробні запити перевіряють, чи
 * залежність ожила, і не кладуть потоки, якщо ні).
 */
function breakerProbe(carry, edgeId) {
  if ((carry.breaker[edgeId] ?? 0) > 0) return 0;
  if (carry.halfOpen?.[edgeId]) return 0.05;
  return null;
}

/** Роутер ділить трафік пропорційно живій потужності дочірніх вузлів. */
function splitWeights(group, st) {
  if (group.length === 1) return [1];
  const caps = group.map((edge) => {
    const s = st[edge.to];
    return Math.max(0, s.live) * Math.max(1, s.instances);
  });
  const total = caps.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return group.map(() => 1 / group.length);
  return caps.map((value) => value / total);
}

function computeLoad(plan, node, s, inflow, prev, carry) {
  s.inflow = inflow;
  s.forward = zero();
  if (node.type === "client") {
    Object.assign(s.forward, inflow);
    s.rho = 0;
    return;
  }
  const loader = LOADERS[node.type] ?? genericLoad;
  loader(plan, node, s, inflow, prev, carry);
}

function passedOf(s, inflow) {
  const passed = zero();
  for (const cls of CLASSES) passed[cls] = inflow[cls] * (1 - (s.drop[cls] ?? 0));
  return passed;
}

function finishLoad(s, rho, passed, servers, errRho = rho) {
  s.rho = rho;
  // Пік за ітерації хвилини: під час каскаду першопричина (гарячий шард)
  // встигає перевантажитися, а потім її ховає обвал вузла вище за течією.
  // Розбір має назвати і причину, і наслідок.
  s.peakRho = Math.max(s.peakRho ?? 0, rho);
  s.down = s.live <= 0;
  s.saturated = rho >= 1 && !s.down;
  s.wait = waitMs(s.serviceMs, rho, servers);
  const eOver = errRho > 1 ? 1 - 1 / errRho : 0;
  for (const cls of CLASSES) {
    const e = s.down ? 1 : 1 - (1 - eOver) * (1 - (s.classErr[cls] ?? 0)) * (1 - s.extraErr);
    s.err[cls] = e;
    s.forward[cls] = passed[cls] * (1 - (s.hit[cls] ?? 0)) * (1 - e);
  }
}

function genericLoad(plan, node, s, inflow, prev) {
  const { def, cfg } = node;
  const passed = passedOf(s, inflow);
  let work = 0;
  for (const cls of CLASSES) {
    if (passed[cls] > 0) work += passed[cls] * workOf(def, cls, cfg, plan.level) * (s.workMult[cls] ?? 1);
  }
  s.work = work;
  const capInst = (s.capOverride ?? def.cap) * s.sizeCap;
  const liveInst = s.instances * s.live;
  let rho = 0;
  if (Number.isFinite(capInst)) {
    if (s.noHealthCheck) rho = (work * s.imbalance) / (Math.max(1, s.instances) * capInst);
    else if (liveInst > 0) rho = (work * s.imbalance) / (liveInst * capInst);
    else rho = work > 0 ? Infinity : 0;
  }
  s.cpuRho = rho;
  if (node.type === "app") {
    s.threadRho = prev.threadRho[node.id] ?? 0;
    rho = Math.max(rho, s.threadRho);
  }
  finishLoad(s, rho, passed, Math.max(1, liveInst));
}

function sqlLoad(plan, node, s, inflow) {
  const { def, cfg } = node;
  const level = plan.level;
  const passed = passedOf(s, inflow);
  const shards = cfg.shards ?? 1;
  const replicas = cfg.replicas ?? 0;
  const fail = s.sqlFail;

  let readers = 1 + replicas;
  if (fail?.mode === "failover") {
    s.classErr.write = 1;
    readers = replicas;
    if (replicas === 0) {
      s.classErr.read = 1;
      s.classErr.query = 1;
      s.classErr.abuse = 1;
    }
  } else if (fail?.mode === "promoted") {
    readers = Math.max(1, replicas);
  }

  const writeWork = passed.write * workOf(def, "write", cfg, level);
  const readWork = passed.read + passed.abuse + passed.query * workOf(def, "query", cfg, level);
  s.work = writeWork + readWork;
  const skew = hotFactor(s.hot ?? 0, shards);
  const perNode = ((writeWork + readWork / Math.max(1, readers)) / shards) * skew;
  const cap = def.cap * s.sizeCap;
  const rho = s.live > 0 ? perNode / cap : perNode > 0 ? Infinity : 0;
  finishLoad(s, rho, passed, 1);

  // Лаг асинхронних реплік росте, коли вони не встигають застосовувати записи.
  if (replicas > 0 && cfg.replication !== "sync") {
    s.replLag = rho < 0.9 ? 0.5 : rho < 1 ? 0.5 + (rho - 0.9) * 50 : null;
  } else {
    s.replLag = 0;
  }
}

function hotFactor(share, n) {
  return n * share + 1 - share;
}

function nosqlLoad(plan, node, s, inflow) {
  const { def } = node;
  const passed = passedOf(s, inflow);
  const liveN = s.instances * s.live;
  const reads = passed.read + passed.abuse;
  const writes = passed.write;
  const total = writes * s.rf + reads * s.k;
  const hot = s.keySkew;
  let hottest = liveN > 0 ? (total * (1 - hot)) / liveN + writes * hot + (reads * hot * s.k) / s.rf : Infinity;
  if (s.rebalance) hottest += (s.rebalance * total) / Math.max(1, liveN);
  s.work = total;
  const rho = liveN > 0 ? hottest / def.cap : total > 0 ? Infinity : 0;
  finishLoad(s, rho, passed, 1);
}

function cacheLoad(plan, node, s, inflow) {
  const { def } = node;
  const passed = passedOf(s, inflow);
  const ops = passed.read + passed.abuse + passed.write;
  const liveN = s.instances * s.live;
  const share = s.hot ?? 0;
  const hottest = liveN > 0 ? ops * (share + (1 - share) / liveN) : ops;
  s.work = ops;
  const rho = liveN > 0 ? hottest / def.cap : ops > 0 ? Infinity : 0;
  finishLoad(s, rho, passed, Math.max(1, liveN));
}

function queueLoad(plan, node, s, inflow) {
  const { def, cfg } = node;
  const passed = passedOf(s, inflow);
  const incoming = passed.write;
  const cap = s.instances * s.live * def.cap;
  const rho = cap > 0 ? incoming / cap : incoming > 0 ? Infinity : 0;
  const eEnqueue = rho > 1 ? 1 - 1 / rho : 0;
  const accepted = incoming * (1 - eEnqueue) * (s.live > 0 ? 1 : 0);
  s.work = incoming;

  if (cfg.mode === "pubsub") {
    finishLoad(s, rho, passed, 1);
    s.forward.write = 0;
    return;
  }

  const backlog = s.backlogIn + (s.burstJobs ?? 0);
  const demand = backlog / TICK_SEC + accepted;
  const drain = Math.min(demand, s.consumerCap);
  const processed = drain * (s.okShare ?? 1);
  let next = Math.max(0, backlog + (accepted - processed) * TICK_SEC);
  const overflow = Math.max(0, next - s.maxDepth);
  next -= overflow;
  s.queue = {
    backlog: next,
    processed,
    overflow,
    demand,
    lagSec: next > 0 ? next / Math.max(1, processed) : 0,
  };
  s.classErr.write = incoming > 0 ? Math.min(1, overflow / TICK_SEC / incoming) : 0;
  finishLoad(s, rho, passed, 1);
  s.forward.write = drain;
}

function wsLoad(plan, node, s, inflow) {
  const { def } = node;
  const passed = passedOf(s, inflow);
  const liveInst = s.instances * s.live;
  const held = s.heldConns;
  const connCap = liveInst * def.conns;
  const pending = s.pendingIn;
  // Без jitter усі відключені б'ють у той самий момент (~5 с), з jitter — розмазані по хвилині.
  const attemptRate = s.jitter ? pending / TICK_SEC : pending / 5;
  const hsCap = liveInst * def.handshakes;
  const hsRho = hsCap > 0 ? (passed.conn + attemptRate) / hsCap : Infinity;
  const accept = hsRho > 1 ? 1 / hsRho : 1;
  let pendingAfter = pending * (1 - accept);
  const connected = Math.max(0, Math.min(held - pendingAfter, connCap));
  pendingAfter = Math.max(0, held - connected);
  const connRho = connCap > 0 ? held / connCap : held > 0 ? Infinity : 0;
  const msgRho = liveInst > 0 ? (passed.write + passed.read) / (liveInst * def.cap) : Infinity;
  const offline = held > 0 ? pendingAfter / held : 0;
  s.classErr.write = offline;
  s.classErr.read = offline;
  s.classErr.conn = 1 - accept;
  s.ws = { held, connected, pendingAfter, hsRho, connRho };
  s.work = passed.write + passed.read;
  const rho = Math.max(connRho, hsRho, msgRho);
  finishLoad(s, rho, passed, Math.max(1, liveInst), msgRho);
}

const LOADERS = {
  sql: sqlLoad,
  nosql: nosqlLoad,
  cache: cacheLoad,
  queue: queueLoad,
  wsgateway: wsLoad,
};

// ─────────────────────────── 3. evaluate ───────────────────────────

function evaluate(plan, st, carry) {
  const level = plan.level;
  const home = level.home ?? "eu";
  const drRegion = level.drRegion ?? "us";
  const memo = new Map();
  const fwdMemo = new Map();
  const edgeFail = {};

  const regionOf = (s) => (s.region === "dr" ? drRegion : home);

  function own(node, s, cls) {
    if (node.type === "client") return point(0);
    if (s.saturated && !s.fastFail) return point(SATURATED_MS);
    let d = s.baseMs?.[cls] ?? baseMsOf(node.def, cls);
    d += (s.extraMs[cls] ?? 0) + (s.extraMsAll ?? 0);
    return [[1, d, s.fastFail ? 0 : s.wait ?? 0]];
  }

  function hop(parent, child, cs, r) {
    if (parent.type === "dns") return child.def.edge ? EDGE_RTT : USER_RTT[r][regionOf(cs)];
    if (parent.def.edge) return USER_RTT[r][regionOf(cs)];
    return 0;
  }

  function R(id, cls, r) {
    const key = `${id}|${cls}|${r}`;
    if (memo.has(key)) return memo.get(key);
    const node = plan.nodes[id];
    const s = st[id];
    const e = s.err[cls] ?? 0;
    const drop = s.drop[cls] ?? 0;
    const h = s.hit[cls] ?? 0;
    const route = plan.routes[id][cls];
    const mine = own(node, s, cls);
    let result;
    const isAsync = node.type === "queue" && cls === "write";
    if (route.terminal || isAsync || route.broken) {
      result = { s: route.broken ? 0 : (1 - e) * (1 - drop), deg: 0, comps: mine, hold: meanOf(mine) };
    } else {
      const fwd = forward(id, cls, r);
      const through = (1 - h) * fwd.s;
      result = {
        s: (1 - e) * (1 - drop) * (h + through),
        deg: (1 - h) * fwd.deg,
        comps: mix([
          { w: h, comps: mine },
          { w: through, comps: seq(mine, fwd.comps) },
        ]),
        hold: meanOf(mine) + (1 - h) * fwd.hold,
      };
    }
    memo.set(key, result);
    return result;
  }

  function forward(id, cls, r) {
    const key = `${id}|${cls}|${r}`;
    if (fwdMemo.has(key)) return fwdMemo.get(key);
    const node = plan.nodes[id];
    const route = plan.routes[id][cls];

    let G = { s: 1, deg: 0, comps: point(0), hold: 0 };
    for (const group of route.groups) {
      const weights = splitWeights(group, st);
      let gs = 0;
      let gdeg = 0;
      let ghold = 0;
      const parts = [];
      group.forEach((edge, i) => {
        const w = weights[i];
        if (!(w > 0)) return;
        const v = via(node, edge, cls, r);
        gs += w * v.s;
        gdeg += w * v.deg;
        ghold += w * v.hold;
        parts.push({ w: w * v.s, comps: v.comps });
      });
      G = {
        s: G.s * gs,
        deg: 1 - (1 - G.deg) * (1 - gdeg),
        comps: seq(G.comps, mix(parts)),
        hold: G.hold + ghold,
      };
    }

    let result = G;
    if (route.chain.length) {
      let reach = 1;
      let lookup = point(0);
      let total = 0;
      let hold = 0;
      const parts = [];
      for (const edge of route.chain) {
        const cn = plan.nodes[edge.to];
        const cs = st[edge.to];
        const hp = (cs.hit[cls] ?? 0) * (1 - (cs.err[cls] ?? 0));
        const step = own(cn, cs, cls);
        lookup = seq(lookup, step);
        hold += reach * meanOf(step);
        parts.push({ w: reach * hp, comps: lookup });
        total += reach * hp;
        reach *= 1 - hp;
      }
      parts.push({ w: reach * G.s, comps: seq(lookup, G.comps) });
      total += reach * G.s;
      result = { s: total, deg: reach * G.deg, comps: mix(parts), hold: hold + reach * G.hold };
    }
    fwdMemo.set(key, result);
    return result;
  }

  function via(parent, edge, cls, r) {
    const child = plan.nodes[edge.to];
    const cs = st[edge.to];
    const res = R(edge.to, cls, r);
    const comps = shift(res.comps, hop(parent, child, cs, r));
    const policy = edge.policy;
    const key = `${edge.id}|${cls}`;
    const fallback = policy.fallback === "degrade" && child.type === "external";
    const attempt = callWithPolicy(res, comps, policy, fallback, key);

    const probe = breakerProbe(carry, edge.id);
    if (probe == null) return attempt;
    // Breaker відповідає одразу: або fallback, або швидка помилка — без очікування.
    const fast = fallback ? { s: 1, deg: 1, comps: point(2), hold: 2 } : { s: 0, deg: 0, comps: [], hold: 1 };
    if (probe === 0) return fast;
    const s = probe * attempt.s + (1 - probe) * fast.s;
    return {
      s,
      deg: s > 0 ? (probe * attempt.s * attempt.deg + (1 - probe) * fast.s * fast.deg) / s : 0,
      comps: mix([
        { w: probe * attempt.s, comps: attempt.comps },
        { w: (1 - probe) * fast.s, comps: fast.comps },
      ]),
      hold: probe * attempt.hold + (1 - probe) * fast.hold,
    };
  }

  function callWithPolicy(res, comps, policy, fallback, key) {
    const cap = policy.timeoutMs;
    const cut = cutAt(comps, cap);
    const s1 = res.s * (1 - cut.lost);
    edgeFail[key] = Math.max(edgeFail[key] ?? 0, 1 - s1);
    const failFast = 1 - res.s;
    const failSlow = res.s * cut.lost;
    const failDelay = 1 - s1 > 1e-9 ? (failFast * 5 + failSlow * cap) / (1 - s1) : 0;
    const retries = policy.retries;
    const sR = 1 - (1 - s1) ** (retries + 1);
    const parts = [{ w: s1, comps: cut.comps }];
    if (sR - s1 > 1e-9) {
      parts.push({ w: sR - s1, comps: seq(point(failDelay + (policy.backoff ? 100 : 0)), cut.comps) });
    }
    let attempts = 1;
    for (let k = 1; k <= retries; k += 1) attempts += (1 - s1) ** k;
    const hold = cappedMean(comps.length ? comps : point(failDelay), cap) * attempts + (policy.backoff ? 100 * (attempts - 1) : 0);

    if (fallback && sR < 1) {
      parts.push({ w: 1 - sR, comps: point(failDelay * (retries + 1)) });
      return { s: 1, deg: 1 - sR, comps: mix(parts), hold };
    }
    return { s: sR, deg: res.deg, comps: mix(parts), hold };
  }

  return { R, forward, edgeFail, home };
}

// ─────────────────────────── 4. feedback ───────────────────────────

function feedback(plan, st, results, prev) {
  const next = { err: {}, edgeFail: results.edgeFail, threadRho: {}, subtreeOk: {} };
  for (const node of Object.values(plan.nodes)) {
    const s = st[node.id];
    next.err[node.id] = { ...s.err };

    if (node.type === "app") {
      // Закон Літтла: одночасних запитів = потік × час, який кожен тримає потік.
      let inflight = 0;
      for (const cls of CLASSES) {
        const rate = s.inflow[cls] * (1 - (s.drop[cls] ?? 0));
        if (!(rate > 0)) continue;
        const route = plan.routes[node.id][cls];
        const downstream = route.terminal ? 0 : results.forward(node.id, cls, results.home).hold;
        const holdMs = baseMsOf(node.def, cls) + (1 - (s.hit[cls] ?? 0)) * downstream;
        inflight += (rate * holdMs) / 1000;
      }
      const threads = s.instances * s.live * node.def.threads * s.sizeCap;
      const tr = threads > 0 ? inflight / threads : 0;
      s.inflight = inflight;
      s.threads = threads;
      next.threadRho[node.id] = 0.5 * (prev.threadRho[node.id] ?? 0) + 0.5 * tr;
    }

    if (node.type === "queue" && node.cfg.mode !== "pubsub") {
      let ok = 1;
      for (const group of plan.routes[node.id].write.groups) {
        const weights = splitWeights(group, st);
        let gs = 0;
        group.forEach((edge, i) => {
          gs += weights[i] * results.R(edge.to, "write", results.home).s;
        });
        ok *= gs;
      }
      next.subtreeOk[node.id] = ok;
      s.okShare = ok;
    }
  }
  return next;
}

function maxDelta(prev, next) {
  let delta = 0;
  for (const [id, value] of Object.entries(next.threadRho)) delta = Math.max(delta, Math.abs(value - (prev.threadRho[id] ?? 0)));
  for (const [key, value] of Object.entries(next.edgeFail)) delta = Math.max(delta, Math.abs(value - (prev.edgeFail[key] ?? 0)));
  for (const [id, value] of Object.entries(next.subtreeOk)) delta = Math.max(delta, Math.abs(value - (prev.subtreeOk[id] ?? 1)));
  return delta;
}

// ─────────────────────────── метрики хвилини ───────────────────────────

function collect(plan, st, flows, results, offered, env, carry, t) {
  const level = plan.level;
  const geo = normalizeGeo(level.traffic.geo);
  const regions = Object.keys(geo);
  const metrics = {
    t,
    offered: { ...offered },
    served: zero(),
    success: {},
    degraded: {},
    p99: {},
    p50: {},
    nodes: {},
    edges: {},
    notes: [],
    active: env.active,
  };

  for (const cls of CLASSES) {
    if (!(offered[cls] > 0)) continue;
    let success = 0;
    let degraded = 0;
    const parts = [];
    for (const r of regions) {
      const res = results.R(plan.clientId, cls, r);
      success += geo[r] * res.s;
      degraded += geo[r] * res.deg * res.s;
      parts.push({ w: geo[r] * res.s, comps: res.comps });
    }
    metrics.success[cls] = success;
    metrics.degraded[cls] = success > 0 ? degraded / success : 0;
    metrics.served[cls] = offered[cls] * success;
    if (cls !== "conn" && cls !== "abuse") {
      const comps = mix(parts);
      metrics.p99[cls] = comps.length ? quantile(comps, 0.99) : null;
      metrics.p50[cls] = comps.length ? quantile(comps, 0.5) : null;
    }
  }

  let legitOffered = 0;
  let legitServed = 0;
  for (const cls of AVAIL_CLASSES) {
    legitOffered += offered[cls];
    legitServed += metrics.served[cls];
  }
  metrics.availability = legitOffered > 0 ? legitServed / legitOffered : 1;

  let lagSec = 0;
  let staleness = 0;
  let rpoLost = 0;
  for (const node of Object.values(plan.nodes)) {
    const s = st[node.id];
    const inflowTotal = CLASSES.reduce((sum, cls) => sum + (s.inflow?.[cls] ?? 0), 0);
    const snapshot = {
      // Під час каскаду ρ злітає до сотень — для показу досить «999+%».
      rho: Math.min(s.rho ?? 0, 9.99),
      band: node.type === "client" ? "ok" : loadBand(s.rho ?? 0, s.down),
      down: Boolean(s.down),
      live: s.live,
      instances: s.instances,
      rps: inflowTotal,
      inflow: { ...(s.inflow ?? zero()) },
    };
    if (s.hit.read != null) snapshot.hit = s.hit.read;
    if (s.hit.static != null) snapshot.hit = s.hit.static;
    if (s.queue) Object.assign(snapshot, { backlog: s.queue.backlog, lagSec: s.queue.lagSec });
    if (s.threadRho != null) snapshot.threadRho = s.threadRho;
    if (s.ws) snapshot.pending = s.ws.pendingAfter;
    metrics.nodes[node.id] = snapshot;

    if (s.queue) lagSec = Math.max(lagSec, s.queue.lagSec);
    if (node.type === "cache" && inflowTotal > 0) staleness = Math.max(staleness, node.cfg.ttlSec);
    if (node.type === "app" && s.localCache) staleness = Math.max(staleness, 5);
    if (node.type === "sql" && (node.cfg.replicas ?? 0) > 0) {
      const lag = s.replLag == null ? (carry.replLag[node.id] ?? 0) + TICK_SEC : s.replLag;
      s.replLagNow = lag;
      staleness = Math.max(staleness, lag);
    }
    if (s.rpoLost) rpoLost += s.rpoLost;

    notesFor(plan, node, s, metrics.notes, level);
  }

  const isOpen = (id) => breakerProbe(carry, id) != null;
  for (const [id, rate] of Object.entries(flows.edgeFlow)) metrics.edges[id] = { rps: rate, open: isOpen(id) };
  for (const node of Object.values(plan.nodes)) {
    for (const edge of node.out) {
      if (!metrics.edges[edge.id]) metrics.edges[edge.id] = { rps: 0, open: isOpen(edge.id) };
      if (metrics.edges[edge.id].open) {
        metrics.notes.push({
          nodeId: node.id,
          kind: "breaker",
          tone: "info",
          codexRef: "circuit-breaker",
          text: `Circuit breaker ${node.label} → ${plan.nodes[edge.to].label} розімкнений: запити не чекають мертву залежність.`,
        });
      }
    }
  }

  const dns = Object.values(plan.nodes).find((node) => node.type === "dns");
  if (env.region && dns && env.region.since < blackholeTicks(plan)) {
    metrics.notes.push({
      nodeId: dns.id,
      kind: "dns",
      tone: "bad",
      codexRef: "dns",
      text:
        dns.cfg.policy === "failover"
          ? `Клієнти ще тримають у кеші IP мертвого регіону — чекаємо, поки спливе TTL ${dns.cfg.ttlSec} с.`
          : "DNS і далі віддає IP мертвого регіону: без failover-політики клієнти стукають у порожнечу.",
    });
  }

  metrics.lagSec = lagSec;
  metrics.staleness = staleness;
  metrics.rpoLost = rpoLost;
  return metrics;
}

function notesFor(plan, node, s, notes, level) {
  if (node.type === "client") return;
  const def = node.def;
  const used = (s.inflow ? CLASSES.some((cls) => s.inflow[cls] > 0) : false) || s.down;
  if (!used) return;
  const push = (kind, tone, text, codexRef = def.codexRef) => notes.push({ nodeId: node.id, kind, tone, text, codexRef });
  const label = node.label;
  const pct = (s.rho ?? 0) >= 9.99 ? "999+" : Math.round((s.rho ?? 0) * 100);

  if (s.sqlFail?.mode === "failover") {
    push("failover", "warn", `${label}: primary недоступний, триває failover — записи падають.`, "replication");
  } else if (s.sqlFail?.mode === "promoted" || s.sqlFail?.mode === "dr") {
    push("failover", "info", `${label}: новий primary піднято з репліки.`, "replication");
  }
  if (s.rpoLost) push("rpo", "warn", `${label}: при failover загублено ~${Math.round(s.rpoLost)} записів, які не встигли на репліку (RPO > 0).`, "replication");

  if (s.down) {
    push("down", "bad", `${label}: ${def.hints?.down ?? "недоступний"}`);
    return;
  }
  if ((s.threadRho ?? 0) >= 1 && (s.cpuRho ?? 0) < 1) {
    const threadPct = s.threadRho >= 9.99 ? "999+" : Math.round(s.threadRho * 100);
    push("threads", "bad", `${label}: усі потоки зайняті (${threadPct}%). ${def.hints.threads}`, "circuit-breaker");
  } else if ((s.rho ?? 0) >= 1 || (s.peakRho ?? 0) >= 1) {
    const hot = (s.hot ?? 0) > 0.15 || (s.keySkew ?? 0) > 0.15;
    const peak = Math.max(s.rho ?? 0, s.peakRho ?? 0);
    const shown = peak >= 9.99 ? "999+" : Math.round(peak * 100);
    push(hot ? "hot" : "over", "bad", `${label} — ${shown}% навантаження. ${def.hints?.over ?? ""}`.trim(), hot ? "sharding" : def.codexRef);
  } else if ((s.rho ?? 0) >= 0.85) {
    push("warn", "warn", `${label} працює на межі (${pct}%): найменший сплеск — і черги ростуть.`);
  }
  if (node.type === "cache" && (s.hit.read ?? 1) < 0.5 && s.live > 0) {
    push("cold", "warn", `${label}: влучань лише ${Math.round(s.hit.read * 100)}%. ${def.hints.cold}`, "cache-invalidation");
  }
  if (s.queue?.overflow > 0) push("full", "bad", `${label}: ${def.hints.full}`, "backpressure");
  if (s.queue && s.queue.lagSec > (level.slo?.maxLagSec ?? 600)) {
    push("lag", "warn", `${label}: у черзі ${Math.round(s.queue.backlog).toLocaleString("uk-UA")} повідомлень. ${def.hints.lag}`, "message-queues");
  }
  if (s.limiter?.legit > 0.01) {
    push("falsepos", "warn", `${label} відкидає ${Math.round(s.limiter.legit * 100)}% звичайних клієнтів: ліміт нижчий за їхні легітимні піки.`, "rate-limiting");
  }
  if (node.type === "app" && s.inflow.abuse > 0 && s.inflow.abuse > 0.2 * (s.inflow.read + 1)) {
    push("abuse", "bad", `${label}: сюди доходить атака — ${Math.round(s.inflow.abuse).toLocaleString("uk-UA")} req/s від кількох клієнтів.`, "rate-limiting");
  }
  if (s.sessionsBroken) push("sessions", "bad", `${label}: сесії в пам'яті інстансу — частину користувачів «розлогінює» при кожному запиті.`, "stateless");
  if (s.sessionsLost) push("sessions", "warn", `${label}: sticky-сесії загинули разом з інстансом.`, "stateless");
  if (s.ws && s.ws.pendingAfter > 1) {
    push("storm", "bad", `${label}: ${Math.round(s.ws.pendingAfter).toLocaleString("uk-UA")} клієнтів не можуть перепідключитися.`, "retries-backoff");
  }
  if (node.type === "external" && s.baseMs.write > (level.data?.externalMs ?? def.baseMs) * 2) {
    push("dep", "warn", `${label} відповідає за ${s.baseMs.write} мс. ${def.hints.slow}`, "circuit-breaker");
  }
}

function normalizeGeo(geo) {
  const entries = Object.entries(geo ?? { eu: 1 }).filter(([, share]) => share > 0);
  const total = entries.reduce((sum, [, share]) => sum + share, 0);
  return Object.fromEntries(entries.map(([region, share]) => [region, share / total]));
}

// ─────────────────────────── перехід до наступної хвилини ───────────────────────────

function advanceCarry(plan, st, results, carry, env) {
  for (const node of Object.values(plan.nodes)) {
    const s = st[node.id];
    const { cfg, def } = node;
    carry.history[node.id].push(s.instances ?? 1);

    if (node.type === "cache") {
      let warmth = carry.warmth[node.id];
      if (s.live <= 0) warmth = 0;
      else warmth = Math.min(warmth, Math.max(s.live, 0));
      const scale = env.scaleOut[node.id];
      if (scale && scale.since === 0) {
        const before = cfg.instances;
        const moved = cfg.hashing === "consistent" ? scale.count / (before + scale.count) : before / (before + scale.count);
        warmth *= 1 - moved;
      }
      if (s.live > 0 && !env.restart.has(node.id)) warmth = Math.min(1, warmth + 0.2);
      carry.warmth[node.id] = warmth;
    }

    if (def.clustered && cfg.autoscale) {
      let need = cfg.instances;
      const capInst = def.cap * (s.sizeCap ?? 1);
      if (node.type === "worker") {
        const demandJobs = demandForWorker(plan, st, node.id);
        need = Math.ceil((demandJobs * (s.workMult.write ?? 1)) / (capInst * 0.9));
      } else {
        const byCpu = (s.work ?? 0) / (capInst * AUTOSCALE_TARGET);
        const perInstThreads = (def.threads ?? Infinity) * (s.sizeCap ?? 1);
        const byThreads = (s.inflight ?? 0) / (perInstThreads * AUTOSCALE_TARGET);
        need = Math.ceil(Math.max(byCpu, byThreads));
      }
      need = Math.max(cfg.instances, Math.min(cfg.maxInstances, need));
      carry.desired[node.id].push(need);
      carry.instances[node.id] = carry.desired[node.id].shift() ?? need;
    }

    if (s.queue) carry.backlog[node.id] = s.queue.backlog;
    if (s.ws) carry.pending[node.id] = s.ws.pendingAfter;
    if (node.type === "sql") carry.replLag[node.id] = s.replLagNow ?? 0;

    carry.halfOpen ??= {};
    for (const edge of node.out) {
      if (!edge.policy.breaker) continue;
      const open = carry.breaker[edge.id] ?? 0;
      if (open > 0) {
        carry.breaker[edge.id] = open - 1;
        // Відлік скінчився — наступна хвилина пробна (half-open).
        if (open === 1) carry.halfOpen[edge.id] = true;
        continue;
      }
      let fail = 0;
      for (const cls of CLASSES) fail = Math.max(fail, results.edgeFail[`${edge.id}|${cls}`] ?? 0);
      carry.halfOpen[edge.id] = false;
      if (fail > 0.5) carry.breaker[edge.id] = 3;
    }
  }
}

function demandForWorker(plan, st, workerId) {
  let demand = 0;
  for (const node of Object.values(plan.nodes)) {
    if (node.type !== "queue" || !st[node.id].queue) continue;
    for (const group of plan.routes[node.id].write.groups) {
      const weights = splitWeights(group, st);
      group.forEach((edge, i) => {
        if (edge.to === workerId) demand += st[node.id].queue.demand * weights[i];
      });
    }
  }
  return demand;
}
