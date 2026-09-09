/**
 * Туман війни над числами.
 *
 * Модель ЗАВЖДИ рахує все. Приховується не розрахунок, а видимість — тому
 * симуляція ніколи не розходиться з тим, що бачить гравець, і жодне число
 * не «з'являється» від встановлення лічильника.
 *
 * Головне, що ховається на нульовому рівні, — це не конверсії, а розділення
 * нових і втрачених клієнтів. Гравець бачить «було 40, стало 43» і не знає,
 * це «прийшло 12, пішло 9» чи «прийшло 4, пішов 1». Ці два місяці вимагають
 * протилежних дій, і саме нездатність їх розрізнити — те, заради чого
 * аналітику й ставлять.
 *
 * Довідник не в тумані ніколи: туман над наслідками, а не над знаннями.
 */

export const LEVELS = [
  {
    level: 0,
    name: "Банківська виписка",
    summary: "Видно гроші й кількість клієнтів. Більше нічого.",
  },
  {
    level: 1,
    name: "Базова аналітика",
    summary: "Видно відвідувачів, тріали, окремо нових і окремо тих, хто пішов, і відтік.",
  },
  {
    level: 2,
    name: "Події воронки",
    summary: "Видно конверсії кожного кроку, вартість залучення й стелю MRR.",
  },
  {
    level: 3,
    name: "Когорти й атрибуція",
    summary: "Видно LTV, окупність і те, який канал приносить клієнтів, що лишаються.",
  },
];

/** Мінімальний рівень аналітики, за якого показник узагалі видно. */
const REQUIRED_LEVEL = {
  "biz.cash": 0,
  "biz.customers": 0,
  "biz.mrr": 0,
  "biz.price": 0,
  "biz.netProfit": 0,
  "biz.arpu": 0,
  "founder.energy": 0,
  "metrics.runwayMonths": 0,

  "funnel.visitors": 1,
  "funnel.visSeo": 1,
  "funnel.visCommunity": 1,
  "funnel.visListings": 1,
  "funnel.visReferral": 1,
  "funnel.visDirect": 1,
  "funnel.visAds": 1,
  "funnel.visLaunch": 1,
  "funnel.trials": 1,
  "funnel.newCustomers": 1,
  "funnel.churnedCustomers": 1,
  "metrics.churnPct": 1,

  "metrics.visitorTrialPct": 2,
  "metrics.trialPaidPct": 2,
  "metrics.cac": 2,
  "metrics.mrrCeiling": 2,
  "metrics.topCustomerShare": 2,

  "metrics.ltv": 3,
  "metrics.ltvCac": 3,
  "metrics.paybackMonths": 3,
};

/** Чи видно цей показник за поточного рівня аналітики. */
export function isVisible(path, level) {
  const required = REQUIRED_LEVEL[path];
  // Усе, що не описане тут, — це показники вашого власного продукту й вас
  // самих. Їх видно завжди: ви й так знаєте, скільки у вас багів і сил.
  if (required === undefined) return true;
  return level >= required;
}

/** Рівень, потрібний, щоб побачити показник. */
export function levelFor(path) {
  return REQUIRED_LEVEL[path] ?? 0;
}

/**
 * Ефекти, які гравець має право побачити в розборі місяця.
 *
 * Прихований ефект не зникає — він замінюється заглушкою з назвою показника
 * й підказкою, якого рівня бракує. Порожнє місце нічого не вчить, а рядок
 * «Конверсія у тріал — ? (потрібна базова аналітика)» вчить дуже багато.
 */
export function redactEffects(effects, level) {
  return effects.map((effect) =>
    isVisible(effect.target, level)
      ? effect
      : {
          ...effect,
          hidden: true,
          needsLevel: levelFor(effect.target),
          reason: `Це число існує, але ви його не бачите: потрібен рівень «${
            LEVELS[levelFor(effect.target)].name
          }».`,
        },
  );
}
