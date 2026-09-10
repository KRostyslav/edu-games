/**
 * Ризики, вирок і розтин.
 *
 * `risksFor` — єдине джерело правди про небезпеку. З нього будуються і
 * попередження в панелі, і маркери в журналі, і фінальний вирок. Тому панель
 * фізично не може обіцяти одне, коли вирок рахує інше.
 *
 * Провал у цій грі ніколи не буває раптовим. Він вирішується за багато місяців
 * до того, як стає видимим, і головне питання розтину — не «що сталося»,
 * а «коли це насправді вирішилося».
 */

import { BENCHMARKS } from "../data/economics.js";
import { ACTIONS_BY_ID } from "../data/actions.data.js";
import { TOTAL_MONTHS } from "./model.js";

/**
 * Небезпеки поточного стану.
 *
 * `chainFor` прив'язує ризик до фіналу, у який він веде: саме за цим полем
 * розтин збирає ланцюг подій, що привів до кінця.
 *
 * `needsLevel` — рівень аналітики, за якого гравець узагалі міг би побачити
 * число, що стоїть за цим ризиком. Нуль означає «видно завжди».
 */
export function risksFor(state) {
  const risks = [];
  const { product, market, biz, founder, metrics, channels, analytics, flags, monthIndex } = state;

  if (flags.hasProduct && market.icpClarity < 30) {
    risks.push({
      code: "building_blind",
      chainFor: "no_fit",
      severity: "bad",
      needsLevel: 0,
      text: "Ви будуєте продукт, майже не знаючи, кому він потрібен. Кожен наступний місяць розробки збільшує ставку на здогадку.",
    });
  }

  if (!flags.hasProduct && market.icpClarity < 30 && monthIndex >= 4) {
    risks.push({
      code: "no_validation",
      chainFor: "no_fit",
      severity: "warn",
      needsLevel: 0,
      text: "Четвертий місяць, а розуміння аудиторії майже не зросло. Валідація дешевша до розробки, ніж після.",
    });
  }

  if (monthIndex >= 10 && biz.customers < 3) {
    risks.push({
      code: "no_customers",
      chainFor: "no_fit",
      severity: "bad",
      needsLevel: 0,
      text: "Десятий місяць і менше трьох клієнтів. Проблема майже напевно не в продукті, а в тому, що він вирішує не ту задачу або не для тих.",
    });
  }

  const distribution =
    channels.seoAsset + channels.communityRep + channels.listings + channels.listSize / 50;
  if (monthIndex >= 8 && distribution < 25) {
    risks.push({
      code: "no_distribution",
      chainFor: "no_growth",
      severity: monthIndex >= 14 ? "bad" : "warn",
      needsLevel: 0,
      text: "Каналів залучення практично немає. Продукт може бути яким завгодно добрим — про нього нікому дізнатися.",
    });
  }

  if (analytics.level === 0 && monthIndex >= 6) {
    risks.push({
      code: "flying_blind",
      chainFor: "no_growth",
      severity: "warn",
      needsLevel: 0,
      text: "Пів року без аналітики. Ви бачите лише підсумок і не можете відрізнити «до мене не доходять» від «доходять, але не платять».",
    });
  }

  if (metrics.churnPct > BENCHMARKS.churnBad + 4) {
    risks.push({
      code: "churn_critical",
      chainFor: "leaky_bucket",
      severity: "bad",
      needsLevel: 1,
      text: `Відтік ${Math.round(metrics.churnPct)}% на місяць — це відро без дна. Скільки не наливай, витікає швидше, ніж набирається.`,
    });
  } else if (metrics.churnPct > BENCHMARKS.churnOk + 2) {
    risks.push({
      code: "churn_high",
      chainFor: "leaky_bucket",
      severity: "warn",
      needsLevel: 1,
      text: `Відтік ${Math.round(metrics.churnPct)}% вище здорової норми. Кожен новий клієнт наполовину лише замінює втраченого.`,
    });
  }

  if (metrics.topCustomerShare > 20 && biz.customers >= 10) {
    risks.push({
      code: "concentration",
      chainFor: "leaky_bucket",
      severity: "warn",
      needsLevel: 1,
      text: "Занадто велика частка виручки припадає на кількох клієнтів. Втрата одного відкине вас на місяці назад.",
    });
  }

  if (metrics.runwayMonths < 2) {
    risks.push({
      code: "runway_critical",
      chainFor: "bankruptcy",
      severity: "bad",
      needsLevel: 0,
      text: "Грошей менше ніж на два місяці. Далі — або дохід, або підробіток, або кінець.",
    });
  } else if (metrics.runwayMonths < 4) {
    risks.push({
      code: "runway_short",
      chainFor: "bankruptcy",
      severity: "warn",
      needsLevel: 0,
      text: "Грошей лишилося менше ніж на чотири місяці. Рішення краще приймати зараз, а не коли лишиться один.",
    });
  }

  if (product.techDebt > 55) {
    risks.push({
      code: "debt_tax",
      chainFor: "stall",
      // Вище 70 борг з'їдає чверть бюджету годин — це вже не попередження,
      // а причина, через яку партія стоїть на місці. Без цього переходу
      // родина `stall` не мала б жодного маркера, і поради до неї були б недосяжні.
      severity: product.techDebt > 70 ? "bad" : "warn",
      needsLevel: 0,
      text: `Технічний борг ${Math.round(product.techDebt)}/100 з'їдає помітну частину бюджету годин. Ви працюєте стільки ж і робите менше.`,
    });
  }

  if (founder.supportBacklog > 45) {
    risks.push({
      code: "support_drowning",
      chainFor: "burnout",
      severity: "bad",
      needsLevel: 0,
      text: "Ви тонете в підтримці. Ріст сам створює навантаження, яке з'їдає години, потрібні для росту.",
    });
  }

  if (founder.energy < 20) {
    risks.push({
      code: "energy_critical",
      chainFor: "burnout",
      severity: "bad",
      needsLevel: 0,
      text: "Сил майже не лишилося. Це не настрій — це множник до всіх ваших годин, і він близький до нуля.",
    });
  } else if (founder.energy < 35) {
    risks.push({
      code: "energy_low",
      chainFor: "burnout",
      severity: "warn",
      needsLevel: 0,
      text: "Енергія низька. Спіраль «мало сил → мало зроблено → нема результату → ще менше сил» затягується сама.",
    });
  }

  if (product.fit >= 60 && biz.price < 0.6 * market.anchorPrice && biz.customers >= 10) {
    risks.push({
      code: "too_cheap",
      chainFor: null,
      severity: "warn",
      needsLevel: 0,
      text: `Ціна $${Math.round(biz.price)} помітно нижча за те, що ця аудиторія вважає нормальним ($${Math.round(market.anchorPrice)}). Продукт має фіт — ви просто віддаєте гроші.`,
    });
  }

  return risks;
}

/**
 * Вирок.
 *
 * Функція повертає АБО фінал, АБО null. Проміжних станів тут немає за побудовою,
 * і це не стилістика: коли м'яка віха («мету досягнуто») поверталася тим самим
 * каналом, що й фінал, вона його заслоняла — партія, яка виграла, не закінчувалася
 * ніколи. М'які віхи тепер живуть в окремій `milestonesFor`.
 *
 * Порядок перевірок — це порядок невідворотності: скінчилися гроші, скінчилися
 * сили, а вже потім усе інше.
 */
export function judge(state) {
  const { biz, founder } = state;

  if (biz.cash < 0) {
    return {
      code: "bankruptcy",
      kind: "loss",
      cause: "Гроші закінчилися",
      reason:
        "Рахунок пішов у мінус. Продукт міг бути яким завгодно перспективним — бутстрап закінчується тоді, коли закінчуються гроші, а не тоді, коли закінчуються ідеї.",
      over: true,
    };
  }

  // Вигорання — це не мить, а стан. Нижче двадцяти п'яти людина фізично
  // перестає намагатися, і енергія перестає падати — спіраль стабілізується
  // біля дна замість того, щоб дійти до нуля. Тому чекати рівного нуля означало б
  // не мати цього фіналу взагалі: квартал на дні і є вигоранням.
  const tail = state.history.slice(-3);
  const flatlined = tail.length === 3 && tail.every((entry) => entry.energy < 18);

  if (founder.energy <= 0 || flatlined) {
    return {
      code: "burnout",
      kind: "loss",
      cause: "Вигорання",
      reason:
        "Сил не лишилося. Це найтихіший зі способів програти: жодного драматичного місяця, просто щоразу трохи менше зроблено, ніж попереднього — і в якийсь момент виявилося, що продукт живий, а ви ні.",
      over: true,
    };
  }

  if (state.soldFor) {
    return {
      code: "sold",
      kind: "win",
      cause: "Проєкт продано",
      reason: `Ви прийняли пропозицію й отримали $${Math.round(state.soldFor).toLocaleString("uk-UA")}. Це нормальний фінал, а не капітуляція: не кожен продукт мусить жити вічно, і те, що зроблене вами варте для когось конкретної суми, — цілком чесний результат трьох років.`,
      over: true,
    };
  }

  // Партія закінчується, коли зіграно всі місяці АБО коли гравець зупинився сам.
  // Рахуємо зіграні місяці, а не номер поточного: лічильник місяця впирається
  // в 36, тому порівняння з ним обірвало б партію на місяць раніше.
  const finished = state.monthLog.length >= TOTAL_MONTHS || state.finishedAt != null;
  if (finished) return outcomeOf(state);

  return null;
}

/**
 * Який саме фінал, коли партія дійшла до кінця живою.
 *
 * Дивиться на `achieved`, а не на поточні серії: досягти мети один раз — це факт
 * про партію. Гравець, який виграв на 20-му місяці, грав далі й дав серії
 * зламатися, все одно завершує перемогою — а розбір показує, коли саме вона
 * зламалася і чому.
 */
function outcomeOf(state) {
  const { achieved, biz } = state;

  if (achieved?.salary) {
    return {
      code: "win_salary",
      kind: "win",
      cause: "Продукт замінив зарплату",
      reason:
        "Шість місяців поспіль продукт приносив більше за вашу зарплату — після комісій платіжної системи, податків, інфраструктури та реклами. Саме це, а не разовий пік, і означає «вийшло».",
      over: true,
    };
  }

  if (achieved?.ramen) {
    return {
      code: "win_ramen",
      kind: "partial",
      cause: "Продукт годує, але зарплати не замінив",
      reason:
        "Пів року поспіль продукт покривав ваші витрати — ви пройшли точку, за якою він перестав бути хобі. Зарплати він не замінив, і це найчастіший реальний результат трьох років: бізнес є, свободи ще немає.",
      over: true,
    };
  }

  if (biz.mrr > 0 && biz.ramenMonths >= 3) {
    return {
      code: "stalled_growing",
      kind: "partial",
      cause: "Три роки: продукт живий",
      reason:
        "Зарплату замінити не встигли, але продукт працює, приносить гроші й росте. Це не поразка — це середина шляху, до якої більшість не доходить.",
      over: true,
    };
  }

  return {
    code: "stalled",
    kind: "loss",
    cause: "Три роки: продукт не злетів",
    reason:
      "Тридцять шість місяців минуло, зарплати продукт не замінив. Найкорисніше тут — не втішитися й не засмутитися, а подивитися, у якому саме місяці все вирішилося.",
    over: true,
  };
}

/**
 * М'які віхи — те, що сталося, але партію не завершує.
 *
 * Окремий канал від `judge` саме тому, що колись вони йшли одним і віха
 * заслоняла фінал.
 */
export function milestonesFor(state) {
  const out = [];
  if (state.biz.salaryMonths >= 6) out.push({ code: "goal_reached", monthIndex: state.monthIndex });
  if (state.biz.ramenMonths >= 6) out.push({ code: "ramen_reached", monthIndex: state.monthIndex });
  return out;
}

/** Кілька однакових маркерів поспіль — це один період, а не шість подій. */
function collapseRuns(markers) {
  const out = [];
  for (const marker of markers) {
    const last = out[out.length - 1];
    if (last && last.code === marker.code) {
      last.until = marker.monthIndex;
      last.count = (last.count ?? 1) + 1;
    } else {
      out.push({ ...marker, count: 1 });
    }
  }
  return out;
}

/**
 * Розтин.
 *
 * Заголовок — не причина, а місяць, у якому все вирішилося. Причина зазвичай
 * очевидна заднім числом; цінність має саме відстань між моментом рішення
 * і моментом наслідку.
 */
export function buildAutopsy(state, verdict) {
  const families = CHAINS_FOR[verdict.code] ?? [];
  const bad = state.journal
    .filter((marker) => marker.chainFor)
    .sort((a, b) => a.monthIndex - b.monthIndex);

  // Групуємо за родиною й лишаємо тільки ті, що мають сенс для цього фіналу.
  const chains = families
    .map((family) => ({
      family,
      markers: collapseRuns(bad.filter((marker) => marker.chainFor === family)),
    }))
    .filter((entry) => entry.markers.length > 0);

  // Головна лінія — найдовша; за рівності виграє та, що почалася раніше.
  const primary = chains.reduce((best, entry) => {
    if (!best) return entry;
    if (entry.markers.length !== best.markers.length) {
      return entry.markers.length > best.markers.length ? entry : best;
    }
    return entry.markers[0].monthIndex < best.markers[0].monthIndex ? entry : best;
  }, null);

  const chain = primary?.markers ?? [];

  // Маркери, які спрацювали тоді, коли гравець фізично не міг побачити
  // число за ними. Це те, заради чого в грі є рівні аналітики.
  const invisible = collapseRuns(
    state.journal
      .filter((marker) => marker.needsLevel > marker.levelAtTime)
      .sort((a, b) => a.monthIndex - b.monthIndex),
  );

  return {
    ...verdict,
    endedAt: state.monthLog.length,
    early: state.monthLog.length < TOTAL_MONTHS,
    achieved: state.achieved ?? { ramen: null, salary: null },
    soldFor: state.soldFor ?? null,
    chains,
    chain,
    primaryFamily: primary?.family ?? null,
    decidedAt: chain[0] ?? null,
    lastChance: chain.length > 1 ? chain[chain.length - 2] : null,
    invisible,
    // Зберігаємо лише ідентифікатори: стан проходить через structuredClone,
    // а живі об'єкти дій несуть функції й клонуванню не піддаються.
    remedyIds: REMEDIES[primary?.family] ?? REMEDIES[verdict.code] ?? [],
  };
}

/**
 * Які лінії подій має сенс показувати для кожного фіналу.
 *
 * Раніше маркери шукалися за збігом `chainFor` із кодом вироку, але ці дві
 * множини майже не перетинаються: для звичайного фіналу на 36-му місяці
 * хронологія завжди виходила порожньою. Явна мапа прибирає цю мовчазну діру.
 */
const CHAINS_FOR = {
  bankruptcy: ["bankruptcy", "no_growth", "no_fit"],
  burnout: ["burnout"],
  stalled: ["no_fit", "no_growth", "leaky_bucket", "stall"],
  stalled_growing: ["leaky_bucket", "stall", "no_growth"],
  win_ramen: ["leaky_bucket", "stall", "no_growth"],
  // Навіть у виграшу є що показати: ціна перемоги видно саме тут.
  win_salary: ["burnout", "leaky_bucket"],
  sold: [],
};

export { CHAINS_FOR };

/**
 * Що треба було робити. Беремо живі об'єкти дій із реєстру, а не окремий текст,
 * щоб порада не могла розійтися з тим, що написано на картці.
 */
export const REMEDIES = {
  // Ключі — родини ланцюгів, а не коди фіналів: саме родина називає, ЩО пішло не так.
  no_fit: ["customer_interviews", "landing_smoke_test", "narrow_the_niche", "talk_to_churned"],
  no_growth: ["write_article", "community_presence", "cold_outreach", "install_analytics"],
  leaky_bucket: ["talk_to_churned", "fix_bugs", "support_sprint", "ship_requested_feature"],
  bankruptcy: ["raise_price", "add_annual_plan", "stop_ads", "take_client_project"],
  burnout: ["rest_week", "healthy_month", "write_docs", "support_sprint"],
  stall: ["refactor", "narrow_the_niche", "raise_price"],
  // Запасні ключі за кодом фіналу — коли жодна родина не набрала маркерів.
  stalled: ["customer_interviews", "cold_outreach", "raise_price"],
  stalled_growing: ["raise_price", "collect_testimonials", "write_article"],
  win_ramen: ["raise_price", "add_annual_plan", "collect_testimonials"],
  win_salary: [],
  sold: [],
};

export function remediesFor(code) {
  return (REMEDIES[code] ?? []).map((id) => ACTIONS_BY_ID[id]).filter(Boolean);
}
