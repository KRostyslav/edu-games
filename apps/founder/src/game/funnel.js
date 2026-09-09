/**
 * Воронка: звідки беруться люди, скільки з них пробує, скільки платить
 * і скільки йде.
 *
 * Три окремі фази, ніколи одна. Гравець мусить читати «1050 відвідувачів,
 * 27 тріалів, 5 нових, 4 пішли» як чотири незалежні числа з чотирма
 * незалежними причинами. Злиття їх в один «ріст» знищило б усю діагностичну
 * цінність гри: саме нездатність відрізнити «до мене не доходять» від
 * «доходять, але не платять» — головна сліпота початківця.
 */

import { makeEffect } from "@edu/sim-core";
import { n, roundStochastic } from "./model.js";

/** Абсолютне значення показника через дельту — ідіома для потоків і метрик. */
const setTo = (state, path, value, reason, source, tone) => {
  const current = read(state, path);
  return makeEffect({ target: path, delta: value - current, reason, source, tone });
};

function read(object, path) {
  return path.split(".").reduce((acc, key) => acc?.[key], object);
}

const round1 = (value) => Math.round(value * 10) / 10;
const pct = (value) => `${round1(value * 100)}%`;

/**
 * Якість трафіку за каналом. Не всі відвідувачі рівні: людина, що прийшла за
 * рекомендацією клієнта, уже має причину довіряти, а натовп із запуску здебільшого
 * складається з інших розробників, яким ваш продукт не потрібен.
 */
const CHANNEL_QUALITY = {
  visReferral: 1.9,
  visDirect: 1.3,
  visSeo: 1.25,
  visCommunity: 1.15,
  visListings: 1.0,
  visAds: 0.85,
};

const CHANNEL_NAMES = {
  visSeo: "пошук",
  visCommunity: "спільноти",
  visListings: "каталоги",
  visReferral: "рекомендації",
  visDirect: "прямі заходи",
  visAds: "реклама",
  visLaunch: "запуск",
};

// ─────────────────────────── фаза 2: ринок ───────────────────────────

/**
 * Активи дозрівають і згасають.
 *
 * Тут живе головна часова механіка гри — лаг SEO. Стаття, написана цього
 * місяця, потрапляє в `seoAsset` одразу, а трафік дає лише `seoMature`, який
 * підтягується до активу повільно й перші три місяці не рухається взагалі.
 * Саме тому фаза стоїть між діями й трафіком: те, що ви написали сьогодні,
 * фізично не може привести відвідувача сьогодні.
 */
export function marketPhase({ state }) {
  const out = [];
  const { channels, market, flags } = state;
  const source = "market";

  if (channels.seoAsset > 0 || channels.seoMonths > 0) {
    out.push(
      makeEffect({
        target: "channels.seoMonths",
        delta: 1,
        reason: "Ще місяць віку домену та контенту — старіший сайт ранжується швидше",
        source,
        tone: "neutral",
      }),
    );
  }

  const months = channels.seoMonths;
  const domainAge = Math.min(1, months / 18);
  const rate = months < 3 ? 0 : 0.16 * (0.7 + 0.6 * domainAge);
  const growth = (channels.seoAsset - channels.seoMature) * rate;

  if (channels.seoAsset > 0) {
    if (months < 3) {
      out.push(
        makeEffect({
          target: "channels.seoMature",
          delta: 0,
          reason: `Статті написані, але пошук їх ще не ранжує: домену ${months} міс. Перші три місяці нового сайту трафіку не дають взагалі — це нормально й це причина починати писати раніше, ніж хочеться`,
          source,
          tone: "neutral",
        }),
      );
    } else if (growth > 0.05) {
      out.push(
        makeEffect({
          target: "channels.seoMature",
          delta: growth,
          reason: `Частина написаного вийшла в пошук (швидкість дозрівання ${pct(rate)}/міс за віку домену ${months} міс). Чим старший сайт, тим швидше ранжується кожна нова стаття`,
          source,
          tone: "good",
        }),
      );
    }

    out.push(
      makeEffect({
        target: "channels.seoAsset",
        delta: -channels.seoAsset * 0.035,
        reason: "Контент застаріває: скріншоти не ті, ціни не ті, конкуренти написали свіжіше",
        source,
        tone: "bad",
      }),
    );
  }

  if (channels.communityRep > 0) {
    const decay = flags.communityActive ? 2 : 8;
    out.push(
      makeEffect({
        target: "channels.communityRep",
        delta: -Math.min(decay, channels.communityRep),
        reason: flags.communityActive
          ? "Ви були присутні — репутація майже не просіла"
          : "Місяць без участі: у спільноті пам'ятають тих, хто в ній є, а не тих, хто був",
        source,
        tone: "bad",
      }),
    );
  }

  if (market.awareness > 0.5) {
    out.push(
      makeEffect({
        target: "market.awareness",
        delta: -market.awareness * 0.07,
        reason: "Про вас поступово забувають — упізнаваність не зберігається сама",
        source,
        tone: "bad",
      }),
    );
  }

  out.push(
    makeEffect({
      target: "market.competition",
      delta: 0.6,
      reason: "Ніша не стоїть на місці: щомісяця хтось запускає щось схоже",
      source,
      tone: "bad",
    }),
  );

  // Уявлення про «нормальну ціну» уточнюється в міру того, як ви дізнаєтесь,
  // кому продаєте: чіткіша ЦА майже завжди виявляється платоспроможнішою.
  const anchorTarget = 11 + 0.34 * market.icpClarity;
  const anchorDelta = (anchorTarget - market.anchorPrice) * 0.2;
  if (Math.abs(anchorDelta) > 0.2) {
    out.push(
      makeEffect({
        target: "market.anchorPrice",
        delta: anchorDelta,
        reason: `Уявлення про прийнятну ціну для цієї аудиторії уточнилося до $${Math.round(anchorTarget)}: що краще ви знаєте, кому продаєте, то дорожчою виявляється проблема`,
        source,
        tone: anchorDelta > 0 ? "good" : "bad",
      }),
    );
  }

  if (state.biz.adSpend > 0) {
    out.push(
      makeEffect({
        target: "channels.adsSkill",
        delta: 2.5,
        reason: "Кампанія й ви разом із нею накопичуєте дані: клік дешевшає з досвідом",
        source,
        tone: "good",
      }),
    );
  }

  if (flags.priceShock > 0.5) {
    out.push(
      makeEffect({
        target: "flags.priceShock",
        delta: -flags.priceShock * 0.5,
        reason: "Обурення від зміни ціни згасає: хто мав піти — пішов, решта лишилася",
        source,
        tone: "good",
      }),
    );
  }

  return out;
}

// ─────────────────────────── фаза 3: трафік ───────────────────────────

/** Вартість кліка. Дорожчає від конкуренції й дешевшає від того, що ви вмієте. */
export function cpcFor(state) {
  const { market, channels, biz } = state;
  return (
    1.1 *
    (1 + 1.2 * n(market.competition)) *
    (1.35 - 0.5 * n(channels.adsSkill)) *
    (1.25 - 0.35 * n(market.icpClarity)) *
    (biz.adSpend < 300 ? 1.4 : 1)
  );
}

export function trafficPhase({ state, meta }) {
  const out = [];
  const { channels, market, product, biz, flags, analytics } = state;
  const source = "traffic";

  // Без сторінки, на яку можна прийти, трафіку не існує — навіть якщо статті написані.
  const reachable = flags.hasLanding > 0 || flags.hasProduct > 0;

  const icpQ = 0.35 + 0.65 * n(market.icpClarity);
  const compQ = 1 - 0.35 * n(market.competition);
  const reachQ = 0.45 + 0.55 * n(market.tam);

  const visSeo = reachable ? 700 * n(channels.seoMature) ** 1.4 * icpQ * compQ * reachQ : 0;
  const visCommunity = reachable
    ? 260 * n(channels.communityRep) ** 1.2 * icpQ * (flags.communityActive ? 1 : 0.55)
    : 0;
  const visListings = reachable ? 180 * n(channels.listings) * icpQ : 0;
  const visReferral = biz.customers * 0.22 * n(product.fit) ** 2 * (0.4 + 0.6 * n(market.trust));
  const visDirect = reachable
    ? 5 + market.awareness * 1.8 + 0.25 * product.depth * n(product.polish)
    : 0;

  const wastedShare = analytics.level === 0 ? 0.45 : 0.1;
  const cpc = cpcFor(state);
  const visAds = biz.adSpend > 0 ? (biz.adSpend * (1 - wastedShare)) / cpc : 0;

  const visLaunch = meta.launchVisitors ?? 0;
  const spike = flags.trafficSpike;

  const values = { visSeo, visCommunity, visListings, visReferral, visDirect, visAds, visLaunch };

  out.push(
    setTo(
      state,
      "funnel.visSeo",
      visSeo,
      visSeo < 1
        ? "З пошуку не прийшов ніхто: або писати ще нема чого, або написане ще не ранжується"
        : `Пошук привів ${Math.round(visSeo)}: дозрілий контент ${Math.round(channels.seoMature)}/100, поправка на чіткість теми ×${round1(icpQ)} і конкуренцію ×${round1(compQ)}`,
      source,
      visSeo > 0 ? "good" : "neutral",
    ),
  );

  out.push(
    setTo(
      state,
      "funnel.visCommunity",
      visCommunity,
      visCommunity < 1
        ? "Зі спільнот ніхто не прийшов — вас там поки не знають"
        : `Спільноти привели ${Math.round(visCommunity)}${flags.communityActive ? "" : " (вдвічі менше: цього місяця вас там не було)"}`,
      source,
      visCommunity > 0 ? "good" : "neutral",
    ),
  );

  out.push(
    setTo(
      state,
      "funnel.visListings",
      visListings,
      visListings < 1
        ? "Каталоги трафіку не дали"
        : `Каталоги та маркетплейси привели ${Math.round(visListings)} — повільно, зате без вашої участі`,
      source,
      visListings > 0 ? "good" : "neutral",
    ),
  );

  out.push(
    setTo(
      state,
      "funnel.visReferral",
      visReferral,
      visReferral < 1
        ? "Рекомендацій немає: або клієнтів замало, або продукт не настільки їм потрібен, щоб про нього розповідати"
        : `${Math.round(visReferral)} прийшли за рекомендацією клієнтів. Це найдешевший трафік у грі, і росте він від фіту, а не від маркетингу`,
      source,
      visReferral > 0 ? "good" : "neutral",
    ),
  );

  out.push(
    setTo(
      state,
      "funnel.visDirect",
      visDirect,
      reachable
        ? `${Math.round(visDirect)} прийшли напряму — упізнаваність ${Math.round(market.awareness)}/100 плюс згадки про сам продукт`
        : "Прийти нікуди: сторінки продукту ще не існує",
      source,
      "neutral",
    ),
  );

  out.push(
    setTo(
      state,
      "funnel.visAds",
      visAds,
      biz.adSpend === 0
        ? "Реклама вимкнена"
        : `Реклама: $${Math.round(biz.adSpend)} за ціною $${round1(cpc)}/клік дали ${Math.round(visAds)} візитів. ${
            analytics.level === 0
              ? `Без аналітики ${pct(wastedShare)} бюджету пішло нікуди — ви не знаєте, які покази марні, і не можете їх вимкнути`
              : `Втрати бюджету ${pct(wastedShare)} — аналітика дозволяє відсікати марні покази`
          }`,
      source,
      biz.adSpend > 0 ? "neutral" : "neutral",
    ),
  );

  out.push(
    setTo(
      state,
      "funnel.visLaunch",
      visLaunch,
      visLaunch > 0 ? `Запуск привів ${Math.round(visLaunch)} відвідувачів` : "Запусків цього місяця не було",
      source,
      visLaunch > 0 ? "good" : "neutral",
    ),
  );

  const total = Object.values(values).reduce((sum, value) => sum + value, 0) + spike;

  out.push(
    setTo(
      state,
      "funnel.visitors",
      total,
      spike > 0
        ? `Разом ${Math.round(total)} відвідувачів, з них ${Math.round(spike)} — сплеск від події`
        : `Разом ${Math.round(total)} відвідувачів`,
      source,
      "neutral",
    ),
  );

  meta.channelVisitors = { ...values, spike };
  meta.cpc = cpc;
  return out;
}

// ─────────────────────── фаза 4: конверсія у платних ───────────────────────

/** Множники, з яких складається конверсія у тріал. Повертаємо для звіту. */
export function trialFactors(state) {
  const { market, product } = state;
  return {
    icpMatch: {
      label: "Влучання в ЦА",
      value: 0.45 + 1.1 * n(market.icpClarity),
      why: "Люди, яким це справді треба, реагують інакше, ніж випадкові відвідувачі",
    },
    messageClarity: {
      label: "Ясність повідомлення",
      value: 0.55 + 0.8 * n(market.positioning),
      why: "Перший екран мусить назвати проблему словами, якими її називає клієнт",
    },
    trustFactor: {
      label: "Довіра",
      value: 0.7 + 0.6 * n(market.trust),
      why: "Відгуки, кейси й згадки знімають питання «а ви взагалі живі?»",
    },
    frictionFactor: {
      label: "Тертя на вході",
      value: 0.75 + 0.4 * n(product.onboarding),
      why: "Кожне зайве поле у формі реєстрації коштує частини тих, хто вже хотів",
    },
    nicheBonus: {
      label: "Вузькість ніші",
      value: 1.3 - 0.3 * n(market.tam),
      why: "«Для юристів» упізнається краще, ніж «для бізнесу»",
    },
  };
}

/** Множники конверсії тріалу в оплату. `fitFactor` — єдиний, що переходить 1. */
export function paidFactors(state) {
  const { product, market, biz } = state;
  const elasticity = 0.3 + 0.55 * (1 - n(product.fit));
  const priceFactor = biz.price > 0 ? (market.anchorPrice / biz.price) ** elasticity : 1;

  return {
    fitFactor: {
      label: "Відповідність проблемі",
      value: 0.4 + 1.35 * n(product.fit),
      why: "Єдиний множник, що переходить одиницю. Його не можна зробити за місяць і нічим не можна замінити",
    },
    onboardFactor: {
      label: "Онбординг",
      value: 0.6 + 0.7 * n(product.onboarding),
      why: "Клієнт платить не за продукт, а за момент, коли вперше отримав від нього користь",
    },
    depthFactor: {
      label: "Глибина продукту",
      value: 0.65 + 0.45 * Math.min(1, product.depth / 70),
      why: "До певної межі функції потрібні; після неї вони вже нічого не додають",
    },
    trustFactor2: {
      label: "Довіра до оплати",
      value: 0.8 + 0.4 * n(market.trust),
      why: "Ввести картку — окреме рішення, і воно вимагає більше довіри, ніж реєстрація",
    },
    priceFactor: {
      label: "Ціна проти очікувань",
      value: priceFactor,
      why: `Ціна $${Math.round(biz.price)} проти звичних для цієї аудиторії $${Math.round(market.anchorPrice)}; еластичність ${round1(elasticity)} — що кращий фіт, то менше ціна впливає на рішення`,
    },
  };
}

export function funnelPhase({ state, meta, rng }) {
  const out = [];
  const source = "funnel";
  const { funnel, flags } = state;

  const trialF = trialFactors(state);
  // Стеля 5%: навіть ідеальний B2B-лендінг не переводить у тріал більше
  // кількох відсотків холодного трафіку. Без неї добуток множників
  // розганяється до цифр, яких у природі не буває.
  const trialRate = Math.min(0.05, Object.values(trialF).reduce((acc, f) => acc * f.value, 0.022));

  let webTrials = 0;
  for (const [key, quality] of Object.entries(CHANNEL_QUALITY)) {
    webTrials += (funnel[key] ?? 0) * trialRate * quality;
  }

  // Трафік із запуску йде повз звичайну воронку: у день запуску до вас приходять
  // здебільшого інші розробники, а не ваші клієнти.
  const launchTrials = (funnel.visLaunch ?? 0) * 0.035 * (0.5 + 0.5 * n(state.market.positioning));
  const outreachTrials = meta.directTrials ?? 0;
  webTrials += launchTrials;
  const trials = webTrials + outreachTrials;

  out.push(
    setTo(
      state,
      "funnel.trials",
      trials,
      `${Math.round(trials)} спробували продукт. Конверсія відвідувача в тріал ${pct(trialRate)} — це добуток ${Object.values(
        trialF,
      )
        .map((f) => `${f.label} ×${round1(f.value)}`)
        .join(", ")}${outreachTrials > 0 ? `; плюс ${Math.round(outreachTrials)} з холодних листів` : ""}`,
      source,
      trials > 0 ? "good" : "neutral",
    ),
  );

  const paidF = paidFactors(state);
  // Стеля накладається на якість продукту, але НЕ на ціну: інакше вигода від
  // дешевого тарифу мовчки обрізалася б, і урок «ви занадто дешеві» перестав би
  // бути перевіряним усередині моделі.
  const { priceFactor, ...qualityF } = paidF;
  const quality = Math.min(2.0, Object.values(qualityF).reduce((acc, f) => acc * f.value, 1));
  const rawPaid = 0.14 * quality * priceFactor.value;
  const paidRate = flags.hasBilling ? Math.min(rawPaid, 0.45) : 0;

  // Той, з ким ви особисто поговорили, — це не відвідувач сайту. Він уже описав
  // вам свою проблему й почув, що ви її вирішуєте, тому конвертується в рази
  // краще. Саме тому перших клієнтів знаходять руками, а не воронкою.
  const qualifiedRate = Math.min(0.6, paidRate * 3);
  const fromWeb = webTrials * paidRate;
  const fromOutreach = outreachTrials * qualifiedRate;
  const newCustomers = roundStochastic(fromWeb + fromOutreach, rng);

  out.push(
    setTo(
      state,
      "funnel.newCustomers",
      newCustomers,
      flags.hasBilling
        ? `${newCustomers} почали платити. Конверсія тріалу в оплату ${pct(paidRate)} — ${Object.values(paidF)
            .map((f) => `${f.label} ×${round1(f.value)}`)
            .join(", ")}${
            outreachTrials > 0
              ? `. З тих, з ким ви говорили особисто, платить ${pct(qualifiedRate)} — розмова важить більше за будь-яку сторінку`
              : ""
          }`
        : "Платити ніхто не може: прийом оплат не підключено. Тріали є, грошей немає",
      source,
      newCustomers > 0 ? "good" : "bad",
    ),
  );

  if (newCustomers > 0) {
    out.push(
      makeEffect({
        target: "biz.customers",
        delta: newCustomers,
        reason: `Прийшло ${newCustomers} нових клієнтів`,
        source,
        tone: "good",
      }),
      makeEffect({
        target: "biz.cumNew",
        delta: newCustomers,
        reason: "Накопичений лічильник залучених — знадобиться, щоб побачити, скільки з них ви втратили",
        source,
        tone: "neutral",
      }),
    );
  }

  meta.trialRate = trialRate;
  meta.paidRate = paidRate;
  meta.trialFactors = trialF;
  meta.paidFactors = paidF;
  return out;
}

// ─────────────────────────── фаза 5: відтік ───────────────────────────

/** Множники відтоку. Кожен — те, через що клієнт іде. */
export function churnFactors(state) {
  const { product, founder, biz, market, flags } = state;
  const pricePenalty =
    biz.price > market.anchorPrice ? 1 + 0.2 * Math.log(biz.price / market.anchorPrice) : 1;

  return {
    fitPenalty: {
      label: "Продукт вирішує не ту проблему",
      value: 2.1 - 1.6 * n(product.fit),
      why: "Клієнт, який купив не те, йде першим і не повертається",
    },
    qualityPenalty: {
      label: "Надійність і баги",
      value: 1.5 - 0.6 * n(product.polish) + 0.9 * n(product.bugs),
      why: "Кожна поламана дія — привід згадати, що є альтернатива",
    },
    supportPenalty: {
      label: "Невідповіді на звернення",
      value: 1 + 0.8 * n(founder.supportBacklog),
      why: "Мовчання у відповідь читається як «проєкт помер»",
    },
    depthPenalty: {
      label: "Не вистачає функцій",
      value: 1.35 - 0.45 * Math.min(1, product.depth / 75),
      why: "Клієнт виріс із продукту й пішов туди, де є наступний крок",
    },
    pricePenalty: {
      label: "Ціна вище очікувань",
      value: pricePenalty * (1 + flags.priceShock / 100),
      why: "Дорожче за звичне — привід перерахувати, чи воно того варте",
    },
    annualDiscount: {
      label: "Річні передплати",
      value: 1 - 0.38 * n(biz.annualShare),
      why: "Хто заплатив за рік, цього місяця піти фізично не може",
    },
  };
}

export function retentionPhase({ state, meta, rng }) {
  const out = [];
  const source = "retention";
  const { biz, funnel } = state;

  const factors = churnFactors(state);
  const raw = Object.values(factors).reduce((acc, f) => acc * f.value, 0.055);

  const churnExisting = Math.min(0.25, Math.max(0.015, raw));
  const churnNew = Math.min(0.55, Math.max(0.03, raw * 1.9));

  const newCustomers = funnel.newCustomers;
  const existing = Math.max(0, biz.customers - newCustomers);

  const lostExisting = roundStochastic(existing * churnExisting, rng);
  const lostNew = roundStochastic(newCustomers * churnNew, rng);
  const lost = Math.min(biz.customers, lostExisting + lostNew);

  out.push(
    setTo(
      state,
      "funnel.churnedCustomers",
      lost,
      biz.customers === 0
        ? "Іти нікому"
        : `Пішло ${lost}: ${lostExisting} зі старих (${pct(churnExisting)}/міс) і ${lostNew} з новачків (${pct(
            churnNew,
          )} — перший місяць завжди найгірший, саме там клієнт вирішує, чи це працює)`,
      source,
      lost > 0 ? "bad" : "good",
    ),
  );

  if (lost > 0) {
    out.push(
      makeEffect({
        target: "biz.customers",
        delta: -lost,
        reason: `Відтік ${pct(churnExisting)} на місяць. Головний множник: ${strongest(factors)}`,
        source,
        tone: "bad",
      }),
      makeEffect({
        target: "biz.cumChurned",
        delta: lost,
        reason: "Накопичений лічильник втрачених — доказ того, скільки води вилилося з відра",
        source,
        tone: "neutral",
      }),
    );
  }

  meta.churnExisting = churnExisting;
  meta.churnNew = churnNew;
  meta.churnFactors = factors;
  return out;
}

/** Найсильніша причина відтоку — те, що варто лагодити першим. */
function strongest(factors) {
  const worst = Object.values(factors).reduce((a, b) => (b.value > a.value ? b : a));
  return `${worst.label} (×${round1(worst.value)})`;
}

export { CHANNEL_NAMES, CHANNEL_QUALITY };
