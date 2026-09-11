/**
 * Інциденти — те, що перетворює «схема виглядає правильно» на «схема працює».
 *
 * Рівень описує інциденти даними: `{ at, dur, type, ...параметри, title }`.
 * Тут — їхні підписи для UI і перетворення списку інцидентів на стан
 * середовища для конкретної хвилини (`env`), який читає модель.
 *
 * Час кожного інциденту гравець дізнається лише під час прогону: на
 * співбесіді теж не кажуть, коли саме впаде зона, — питають, чи ви це переживете.
 */

export const INCIDENT_TYPES = {
  spike: { label: "Сплеск трафіку", icon: "▲" },
  nodeFail: { label: "Відмова вузла", icon: "✕" },
  cacheRestart: { label: "Рестарт кешу", icon: "❄" },
  hotKey: { label: "Hot key", icon: "✹" },
  abuse: { label: "Зловживання API", icon: "☠" },
  legitBurst: { label: "Сплеск звичайних клієнтів", icon: "⇈" },
  depSlow: { label: "Залежність гальмує", icon: "⌛" },
  depDown: { label: "Залежність лежить", icon: "✕" },
  azOutage: { label: "Відмова зони доступності", icon: "⚡" },
  regionOutage: { label: "Відмова регіону", icon: "⚡" },
  scaleOut: { label: "Додали вузол", icon: "+" },
  celebrity: { label: "Пост зірки", icon: "★" },
};

export function isActive(incident, t) {
  return t >= incident.at && t < incident.at + (incident.dur ?? 1);
}

/**
 * Ідентифікатори вузлів, у які б'є інцидент. Ціль задається типом, а не id,
 * бо гравець сам вирішує, скільки кешів і як їх назвати.
 */
export function resolveTargets(incident, graph) {
  const target = incident.target;
  if (!target) return [];
  if (target.id) return graph.nodes.some((node) => node.id === target.id) ? [target.id] : [];
  const matches = graph.nodes.filter((node) => node.type === target.type).map((node) => node.id);
  return target.all ? matches : matches.slice(0, 1);
}

/** Стан середовища на хвилині `t`. */
export function buildEnv(level, plan, t) {
  const env = {
    mult: {},
    abuseRps: 0,
    abuseClients: 1,
    legitPeak: level.data?.clientPeak ?? null,
    events: {},
    hot: {},
    hotShare: 0,
    restart: new Set(),
    depMs: null,
    depDown: false,
    zone: null,
    region: null,
    scaleOut: {},
    celebrityPosts: 0,
    active: [],
  };

  level.incidents?.forEach((incident, index) => {
    const targets = plan.incidentTargets[index] ?? [];
    const since = t - incident.at;
    const active = isActive(incident, t);

    // Додавання вузла — постійна зміна: після інциденту вузол лишається.
    if (incident.type === "scaleOut" && since >= 0) {
      for (const id of targets) env.scaleOut[id] = { since, count: incident.count ?? 1 };
    }
    if (!active) return;
    env.active.push(index);

    switch (incident.type) {
      case "spike": {
        // Живий трафік розганяється за кілька хвилин, а не стрибає миттєво.
        const ramp = incident.ramp ?? 1;
        const mult = 1 + (incident.mult - 1) * Math.min(1, (since + 1) / ramp);
        for (const cls of incident.classes ?? ["read", "write", "static", "query", "conn"]) {
          env.mult[cls] = (env.mult[cls] ?? 1) * mult;
        }
        break;
      }
      case "nodeFail":
        for (const id of targets) pushEvent(env, id, { kind: "fail", since, count: incident.count ?? "all" });
        break;
      case "cacheRestart":
        for (const id of targets) {
          pushEvent(env, id, { kind: "fail", since, count: "all" });
          env.restart.add(id);
        }
        break;
      case "hotKey":
        env.hotShare = Math.max(env.hotShare, incident.share);
        for (const id of targets) env.hot[id] = Math.max(env.hot[id] ?? 0, incident.share);
        if (incident.mult) for (const cls of ["read"]) env.mult[cls] = (env.mult[cls] ?? 1) * incident.mult;
        break;
      case "abuse":
        env.abuseRps += incident.rps;
        env.abuseClients = Math.max(1, incident.clients ?? 1);
        break;
      case "legitBurst":
        env.legitPeak = incident.peak;
        if (incident.mult) {
          for (const cls of ["read", "write"]) env.mult[cls] = (env.mult[cls] ?? 1) * incident.mult;
        }
        break;
      case "depSlow":
        env.depMs = incident.latencyMs;
        break;
      case "depDown":
        env.depDown = true;
        break;
      case "azOutage":
        env.zone = { since };
        break;
      case "regionOutage":
        env.region = { since };
        break;
      case "celebrity":
        if (since === 0) env.celebrityPosts += incident.followers;
        break;
      default:
        break;
    }
  });

  return env;
}

function pushEvent(env, id, event) {
  (env.events[id] ??= []).push(event);
}
