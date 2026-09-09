/** Людські назви показників. Розбір місяця показує їх замість шляхів у стані. */

export const STAT_NAMES = {
  "founder.energy": "Сили",
  "founder.hoursBase": "Годин на місяць",
  "founder.supportBacklog": "Незакриті звернення",
  "founder.skillProduct": "Навичка: розробка",
  "founder.skillMarketing": "Навичка: маркетинг",
  "founder.skillSales": "Навичка: продажі",

  "product.mvpProgress": "Готовність MVP",
  "product.fit": "Відповідність проблемі",
  "product.depth": "Глибина продукту",
  "product.polish": "Надійність",
  "product.onboarding": "Онбординг",
  "product.selfServe": "Документація",
  "product.techDebt": "Технічний борг",
  "product.bugs": "Баги",

  "market.icpClarity": "Розуміння ЦА",
  "market.interviews": "Проведено інтерв'ю",
  "market.positioning": "Ясність позиціонування",
  "market.trust": "Довіра",
  "market.awareness": "Упізнаваність",
  "market.competition": "Конкуренція",
  "market.tam": "Ширина ніші",
  "market.anchorPrice": "Звична для ЦА ціна",

  "channels.seoAsset": "Написано контенту",
  "channels.seoMature": "Контент у пошуку",
  "channels.seoMonths": "Вік сайту, міс",
  "channels.communityRep": "Репутація у спільнотах",
  "channels.listings": "Каталоги",
  "channels.listSize": "Розсилка, підписників",
  "channels.adsSkill": "Досвід у рекламі",
  "channels.launchCharge": "Готовність до запуску",

  "funnel.visitors": "Відвідувачі",
  "funnel.visSeo": "— з пошуку",
  "funnel.visCommunity": "— зі спільнот",
  "funnel.visListings": "— з каталогів",
  "funnel.visReferral": "— за рекомендацією",
  "funnel.visDirect": "— напряму",
  "funnel.visAds": "— з реклами",
  "funnel.visLaunch": "— із запуску",
  "funnel.trials": "Спробували продукт",
  "funnel.newCustomers": "Нові клієнти",
  "funnel.churnedCustomers": "Пішли клієнти",

  "biz.cash": "Гроші на рахунку",
  "biz.customers": "Клієнтів",
  "biz.mrr": "MRR",
  "biz.arpu": "Середній чек",
  "biz.price": "Ціна",
  "biz.annualShare": "Частка річних планів",
  "biz.adSpend": "Бюджет реклами",
  "biz.toolCost": "Витрати на інструменти",
  "biz.infraCost": "Інфраструктура",
  "biz.netProfit": "Чистий прибуток",
  "biz.ramenMonths": "Місяців «продукт годує»",
  "biz.salaryMonths": "Місяців «як зарплата»",
  "biz.cumNew": "Усього залучено",
  "biz.cumChurned": "Усього втрачено",
  "biz.cumSpend": "Витрачено на залучення",
  "biz.personalBurn": "Особисті витрати",
  "biz.outsideIncome": "Сторонній дохід",

  "metrics.churnPct": "Відтік за місяць",
  "metrics.visitorTrialPct": "Конверсія у тріал",
  "metrics.trialPaidPct": "Конверсія в оплату",
  "metrics.cac": "Вартість клієнта (CAC)",
  "metrics.ltv": "Цінність клієнта (LTV)",
  "metrics.ltvCac": "LTV : CAC",
  "metrics.paybackMonths": "Окупність залучення",
  "metrics.runwayMonths": "Грошей вистачить, міс",
  "metrics.mrrCeiling": "Стеля MRR",
  "metrics.topCustomerShare": "Частка найбільшого клієнта",

  "analytics.level": "Рівень аналітики",

  "flags.hasLanding": "Сторінка продукту",
  "flags.hasProduct": "Продукт",
  "flags.hasBilling": "Прийом оплат",
  "flags.hasAnnual": "Річний план",
  "flags.communityActive": "Присутність у спільноті",
  "flags.rested": "Відпочинок цього місяця",
  "flags.quitJob": "Звільнення",
  "flags.launchedPH": "Запуск на Product Hunt",
  "flags.launchedHN": "Запуск Show HN",
  "flags.processorRisk": "Ризик із платіжною системою",
  "flags.trafficSpike": "Сплеск трафіку",
  "flags.hoursPenaltyPct": "Втрата годин, %",
  "flags.heldPayout": "Заморожені виплати",
  "flags.holdMonths": "Місяців до розблокування",
  "flags.priceShock": "Реакція на зміну ціни",
};

/** Показники, які вимірюються в грошах, а не в балах. */
const MONEY = new Set([
  "biz.cash",
  "biz.mrr",
  "biz.arpu",
  "biz.price",
  "biz.adSpend",
  "biz.toolCost",
  "biz.infraCost",
  "biz.netProfit",
  "biz.personalBurn",
  "biz.outsideIncome",
  "biz.cumSpend",
  "market.anchorPrice",
  "metrics.cac",
  "metrics.ltv",
  "metrics.mrrCeiling",
]);

const PERCENT = new Set([
  "metrics.churnPct",
  "metrics.visitorTrialPct",
  "metrics.trialPaidPct",
  "biz.annualShare",
  "metrics.topCustomerShare",
  "flags.hoursPenaltyPct",
]);

export function statNameOf(path) {
  return STAT_NAMES[path] ?? path;
}

export function formatValue(path, value) {
  if (MONEY.has(path)) return `$${Math.round(value).toLocaleString("uk-UA")}`;
  if (PERCENT.has(path)) return `${Math.round(value * 10) / 10}%`;
  if (path === "metrics.ltvCac") return `×${Math.round(value * 10) / 10}`;
  if (path.startsWith("flags.")) return value > 0 ? "так" : "ні";
  return String(Math.round(value));
}

export function formatDelta(path, delta) {
  const sign = delta > 0 ? "+" : "−";
  const size = Math.abs(delta);
  if (MONEY.has(path)) return `${sign}$${Math.round(size).toLocaleString("uk-UA")}`;
  if (PERCENT.has(path)) return `${sign}${Math.round(size * 10) / 10}%`;
  return `${sign}${Math.round(size)}`;
}

/** Показники, у яких «більше» означає «гірше». */
export const INVERTED = new Set([
  "product.techDebt",
  "product.bugs",
  "founder.supportBacklog",
  "market.competition",
  "metrics.churnPct",
  "metrics.cac",
  "metrics.paybackMonths",
  "biz.cumChurned",
]);

/**
 * Показники-потоки й похідні метрики. Вони не накопичуються, а перераховуються
 * заново щомісяця, тому в розборі має сенс саме результат, а не зміна:
 * «прийшло 39 з пошуку» зрозуміліше, ніж «на 8 більше, ніж торік у листопаді».
 */
export const ABSOLUTE = new Set([
  ...Object.keys(STAT_NAMES).filter((path) => path.startsWith("funnel.") || path.startsWith("metrics.")),
  "biz.mrr",
  "biz.arpu",
  "biz.netProfit",
  "biz.infraCost",
]);
