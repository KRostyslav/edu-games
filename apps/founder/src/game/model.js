/**
 * Стан бізнесу та межі показників.
 *
 * Шари стану:
 *   founder  — ви самі: години, енергія, навички, борг тікетів;
 *   product  — що ви зробили;
 *   market   — кому ви це продаєте і що ринок про вас знає;
 *   channels — активи залучення, кожен зі своєю інерцією;
 *   funnel   — потоки цього місяця (не накопичуються, перераховуються заново);
 *   biz      — запаси: гроші, клієнти, ціна;
 *   metrics  — похідні числа, які нічим не керують, а лише описують.
 *
 * Розділення `funnel` і `biz` навмисне: відвідувачі — це подія місяця,
 * клієнти — це залишок. Плутати потік із запасом — головна помилка в читанні
 * будь-якого дашборда.
 */

import { SCENARIOS } from "../data/scenarios.js";
import { INFRA, SUPPORT_HOURS_PER_CUSTOMER, SUPPORT_MAX_SHARE } from "../data/economics.js";

/** Нормалізація показника 0..100 у частку 0..1 — найчастіша операція в моделі. */
export const n = (value) => value / 100;

/**
 * Межі. Генеруються з групових таблиць, а не пишуться плоским літералом:
 * шляхів під сотню, і забути хоч один означає мовчки отримати `[0, 100]`.
 *
 * Найнебезпечніший рядок тут — `biz.cash`. Без від'ємної нижньої межі гроші
 * впиралися б у нуль, і банкрутство стало б недосяжним: гра просто не мала б
 * одного з трьох фіналів, і ніде б про це не сказала.
 */
const FOUNDER = {
  energy: [0, 100],
  hoursBase: [0, 300],
  supportBacklog: [0, 100],
  skillProduct: [0, 100],
  skillMarketing: [0, 100],
  skillSales: [0, 100],
};

const PRODUCT = {
  mvpProgress: [0, 100],
  fit: [0, 100],
  depth: [0, 100],
  polish: [0, 100],
  onboarding: [0, 100],
  selfServe: [0, 100],
  techDebt: [0, 100],
  bugs: [0, 100],
};

const MARKET = {
  icpClarity: [0, 100],
  interviews: [0, 500],
  positioning: [0, 100],
  trust: [0, 100],
  awareness: [0, 100],
  competition: [0, 100],
  tam: [10, 100],
  anchorPrice: [3, 600],
};

const CHANNELS = {
  seoAsset: [0, 100],
  seoMature: [0, 100],
  seoMonths: [0, 60],
  communityRep: [0, 100],
  listings: [0, 100],
  listSize: [0, 200000],
  adsSkill: [0, 100],
  launchCharge: [0, 100],
};

/** Потоки місяця. Верхні межі щедрі: це кількість людей, а не бали. */
const FUNNEL = {
  visitors: [0, 500000],
  visSeo: [0, 500000],
  visCommunity: [0, 500000],
  visListings: [0, 500000],
  visReferral: [0, 500000],
  visDirect: [0, 500000],
  visAds: [0, 500000],
  visLaunch: [0, 500000],
  trials: [0, 100000],
  newCustomers: [0, 50000],
  churnedCustomers: [0, 50000],
};

const BIZ = {
  // Єдиний показник із від'ємною межею — і саме він вирішує долю гри.
  cash: [-30000, 3000000],
  customers: [0, 200000],
  mrr: [0, 500000],
  arpu: [0, 2000],
  price: [0, 999],
  annualShare: [0, 100],
  adSpend: [0, 20000],
  toolCost: [0, 5000],
  infraCost: [0, 50000],
  personalBurn: [0, 30000],
  outsideIncome: [0, 30000],
  salaryTarget: [0, 30000],
  netProfit: [-30000, 500000],
  ramenMonths: [0, 60],
  salaryMonths: [0, 60],
  cumNew: [0, 200000],
  cumChurned: [0, 200000],
  cumSpend: [0, 2000000],
};

const METRICS = {
  churnPct: [0, 100],
  visitorTrialPct: [0, 100],
  trialPaidPct: [0, 100],
  cac: [0, 200000],
  ltv: [0, 2000000],
  ltvCac: [0, 200],
  paybackMonths: [0, 600],
  runwayMonths: [0, 600],
  mrrCeiling: [0, 5000000],
  topCustomerShare: [0, 100],
};

/** Прапорці-стани: булеві за змістом, тому 0..1. */
const BOOL_FLAGS = [
  "hasLanding",
  "hasProduct",
  "hasBilling",
  "hasAnnual",
  "communityActive",
  "rested",
  "quitJob",
  "launchedPH",
  "launchedHN",
  "processorRisk",
];

/** Числові прапорці «на наступний місяць» — їх скидає playMonth. */
const NUMERIC_FLAGS = {
  trafficSpike: [0, 100000],
  hoursPenaltyPct: [0, 100],
  heldPayout: [0, 500000],
  holdMonths: [0, 6],
  priceShock: [0, 100],
};

const prefix = (group, table) =>
  Object.fromEntries(Object.entries(table).map(([key, range]) => [`${group}.${key}`, range]));

export const LIMITS = {
  month: [1, 12],
  year: [1, 9],
  monthIndex: [1, 60],

  ...prefix("founder", FOUNDER),
  ...prefix("product", PRODUCT),
  ...prefix("market", MARKET),
  ...prefix("channels", CHANNELS),
  ...prefix("funnel", FUNNEL),
  ...prefix("biz", BIZ),
  ...prefix("metrics", METRICS),
  ...prefix("flags", NUMERIC_FLAGS),
  ...Object.fromEntries(BOOL_FLAGS.map((key) => [`flags.${key}`, [0, 1]])),

  "analytics.level": [0, 3],
};

/** Гра триває три роки. Далі вирок остаточний. */
export const TOTAL_MONTHS = 36;

/**
 * Початковий стан.
 *
 * Продукту немає, клієнтів немає, про ринок ви не знаєте майже нічого —
 * `icpClarity: 5` означає «є здогадка, кому це треба». Навички розробки високі,
 * маркетингу й продажів — ні: це і є типовий старт розробника, і саме звідси
 * береться спокуса робити те, що вмієш, замість того, що потрібно.
 */
export function createInitialState(scenario, seed = 1) {
  return {
    scenarioId: scenario.id,
    // Сід зберігається, щоб екран вироку міг переграти ТУ САМУ партію.
    startSeed: seed,
    year: 1,
    month: 1,
    monthIndex: 1,

    founder: {
      energy: 80,
      hoursBase: scenario.hoursBase,
      supportBacklog: 0,
      skillProduct: 60,
      skillMarketing: 15,
      skillSales: 10,
    },

    product: {
      mvpProgress: 0,
      fit: 0,
      depth: 0,
      polish: 0,
      onboarding: 0,
      selfServe: 0,
      techDebt: 0,
      bugs: 0,
    },

    market: {
      icpClarity: 5,
      interviews: 0,
      positioning: 5,
      trust: 0,
      awareness: 2,
      competition: 30,
      tam: 55,
      anchorPrice: 19,
    },

    channels: {
      seoAsset: 0,
      seoMature: 0,
      seoMonths: 0,
      communityRep: 0,
      listings: 0,
      listSize: 0,
      adsSkill: 0,
      launchCharge: 0,
    },

    funnel: {
      visitors: 0,
      visSeo: 0,
      visCommunity: 0,
      visListings: 0,
      visReferral: 0,
      visDirect: 0,
      visAds: 0,
      visLaunch: 0,
      trials: 0,
      newCustomers: 0,
      churnedCustomers: 0,
    },

    biz: {
      cash: scenario.cash,
      customers: 0,
      mrr: 0,
      arpu: 0,
      price: 19,
      annualShare: 0,
      adSpend: 0,
      toolCost: 0,
      infraCost: INFRA.base,
      personalBurn: scenario.personalBurn,
      outsideIncome: scenario.outsideIncome,
      salaryTarget: scenario.salaryTarget,
      netProfit: 0,
      ramenMonths: 0,
      salaryMonths: 0,
      cumNew: 0,
      cumChurned: 0,
      cumSpend: 0,
    },

    metrics: {
      churnPct: 0,
      visitorTrialPct: 0,
      trialPaidPct: 0,
      cac: 0,
      ltv: 0,
      ltvCac: 0,
      paybackMonths: 0,
      runwayMonths: 600,
      mrrCeiling: 0,
      topCustomerShare: 0,
    },

    analytics: { level: 0 },

    flags: {
      hasLanding: 0,
      hasProduct: 0,
      hasBilling: 0,
      hasAnnual: 0,
      communityActive: 0,
      rested: 0,
      quitJob: 0,
      launchedPH: 0,
      launchedHN: 0,
      processorRisk: 0,
      trafficSpike: 0,
      hoursPenaltyPct: 0,
      heldPayout: 0,
      holdMonths: 0,
      priceShock: 0,
    },

    // Не показники, а журнали: що відбувалося й чим це скінчилося.
    journal: [],
    monthLog: [],
    history: [],
    usedOnce: [],
    pending: null,
    verdict: null,
  };
}

export function scenarioOf(state) {
  return SCENARIOS[state.scenarioId];
}

/**
 * Скільки годин підтримки вимагають клієнти.
 *
 * Росте не лише з кількістю клієнтів, а й із сирістю продукту: сира річ
 * породжує питання. Документація зменшує саме попит, а не вашу швидкість
 * відповідей — тому вона й окупається, хоч і не одразу.
 */
export function supportDemand(state) {
  const { customers } = state.biz;
  const { polish, bugs, selfServe } = state.product;
  return (
    customers *
    SUPPORT_HOURS_PER_CUSTOMER *
    (2 - n(polish)) *
    (1 + bugs / 60) *
    (1 - 0.35 * n(selfServe))
  );
}

/**
 * Скільки годин у вас реально є цього місяця.
 *
 * Три відрахування, і жодне з них ви не обирали:
 *   підтримка — плата за те, що клієнти вже є;
 *   технічний борг — плата за швидкість, узяту в кредит раніше;
 *   енергія — плата за те, що ви жива людина.
 *
 * Борг оподатковує години квадратично: 40 — це 8% бюджету, 70 — 24%, 90 — 40%.
 * Він нешкідливий, поки раптом не стає нестерпним, і саме так це відчувається.
 */
export function hoursFor(state) {
  const base = state.founder.hoursBase;
  const demand = supportDemand(state);
  const supportPaid = Math.min(demand, SUPPORT_MAX_SHARE * base);
  const debtHours = base * n(state.product.techDebt) ** 2 * 0.5;
  const energyMult = 0.55 + 0.55 * n(state.founder.energy);
  const penalty = 1 - state.flags.hoursPenaltyPct / 100;

  return Math.max(4, Math.round((base - supportPaid - debtHours) * energyMult * penalty));
}

/** Розклад бюджету годин для панелі — гравець мусить бачити, куди вони поділися. */
export function hoursBreakdown(state) {
  const base = state.founder.hoursBase;
  const demand = supportDemand(state);
  const supportPaid = Math.min(demand, SUPPORT_MAX_SHARE * base);
  const debtHours = base * n(state.product.techDebt) ** 2 * 0.5;
  const energyMult = 0.55 + 0.55 * n(state.founder.energy);

  return {
    base,
    support: Math.round(supportPaid),
    debt: Math.round(debtHours),
    energyMult,
    penaltyPct: state.flags.hoursPenaltyPct,
    available: hoursFor(state),
    unanswered: Math.max(0, demand - supportPaid),
  };
}

/**
 * Стохастичне округлення.
 *
 * Клієнти — цілі люди, але 7 клієнтів × 5% відтоку = 0.35 людини. Звичайне
 * округлення дало б нуль щомісяця, відтік зник би на малих числах, і кожен
 * ранній прогін виглядав би значно кращим, ніж він є. Тому дробову частину
 * розігруємо як імовірність.
 */
export function roundStochastic(value, rng) {
  const floor = Math.floor(value);
  return floor + (rng.next() < value - floor ? 1 : 0);
}
