/**
 * Події. Вони не караються навмання: майже кожна має вагу, що залежить від стану,
 * у якому гравець опинився. Критичний баг вірогідніший при великому технічному
 * борзі, хвороба — при низькій енергії, заморожені виплати — при різкому стрибку
 * обороту. Подія перевіряє, наскільки ви виявилися готовими.
 */

import { n } from "../game/model.js";
import { ACQUISITION_ARR_MULTIPLE } from "./economics.js";

const e = (target, delta, reason) => ({ target, delta, reason });

/** Загальна вага «нічого не сталося». Разом дає приблизно одну подію на 3–4 місяці. */
export const IDLE_WEIGHT = 1.0;

export const EVENTS = [
  {
    id: "payment_hold",
    label: "Платіжна система заморозила виплати",
    codexRef: "payments",
    weightFor: ({ state, growth }) => {
      if (!state.flags.hasBilling || state.biz.mrr < 800) return 0;
      let weight = 0.03;
      if (growth > 0.6) weight *= 2.5;
      if (state.flags.processorRisk) weight *= 2;
      return weight;
    },
    describe: ({ state }) =>
      `Платіжний провайдер помітив різке зростання обороту й поставив акаунт на ручну перевірку. Виплати за цей місяць — близько $${Math.round(state.biz.mrr * 0.9)} — заморожені на два місяці. Гроші ваші, але їх у вас немає.`,
    effects: ({ state }) => [
      e("biz.cash", -state.biz.mrr * 0.9, "Виплату затримано — гроші зароблені, але недоступні"),
      e("flags.heldPayout", state.biz.mrr * 0.9, "Сума очікує розблокування"),
      e("flags.holdMonths", 2, "Перевірка триває два місяці"),
      e("founder.energy", -8, "Листування з підтримкою провайдера — окремий вид виснаження"),
    ],
  },

  {
    id: "critical_bug",
    label: "Критичний баг у продакшені",
    codexRef: "tech-debt",
    weightFor: ({ state }) =>
      state.flags.hasProduct ? 0.02 + 0.05 * n(state.product.techDebt) + 0.03 * n(state.product.bugs) : 0,
    describe: ({ state }) =>
      state.product.techDebt > 50
        ? "Зламалося те, що трималося на обхідному рішенні дворічної давнини. Півтора дня на пошук причини, ще день на виправлення, і частина клієнтів усе це бачила."
        : "Прикрий баг у ключовому сценарії. Клієнти помітили раніше за вас.",
    effects: ({ state, rng }) => {
      const lost = Math.max(0, Math.round(state.biz.customers * 0.04 * rng.range(0.5, 1.5)));
      const out = [
        e("product.bugs", 25, "Одна поломка витягла за собою кілька суміжних"),
        e("flags.hoursPenaltyPct", 25, "Чверть місяця пішла на гасіння пожежі замість роботи"),
        e("market.trust", -10, "Довіра падає швидше, ніж відновлюється"),
        e("founder.energy", -10, "Аварія в проді соло — це ще й нікому передати"),
      ];
      if (lost > 0) out.push(e("biz.customers", -lost, `${lost} клієнтів пішли одразу після аварії`));
      return out;
    },
  },

  {
    id: "competitor_launch",
    label: "Конкурент із фінансуванням",
    codexRef: "niche",
    weightFor: ({ state, monthIndex }) => {
      if (monthIndex < 8) return 0;
      const strong = state.product.fit >= 70 && state.market.trust >= 50;
      return strong ? 0.018 : 0.035;
    },
    describe: ({ state }) =>
      state.product.fit >= 70
        ? "У вашій ніші запустився продукт із інвестиціями й великим маркетинговим бюджетом. Ваші клієнти подивилися й лишилися: їм потрібне саме те, що ви робите."
        : "У вашій ніші запустився продукт із інвестиціями. У них команда, бюджет і реклама всюди. Частина ваших клієнтів пішла подивитися й не повернулася.",
    effects: ({ state, rng }) => {
      const lost = Math.round(state.biz.customers * 0.03 * rng.range(0.5, 1.5));
      const out = [
        e("market.competition", 18, "Реклама конкурента підняла ціну уваги для всіх у ніші"),
        e("founder.energy", -6, "Дивитися на чужий бюджет — окремий вид втоми"),
      ];
      if (lost > 0)
        out.push(
          e(
            "biz.customers",
            -lost,
            `${lost} пішли подивитися й не повернулися. Клієнти, яким ви справді потрібні, не йдуть по рекламі — тому втрати тим менші, чим кращий фіт`,
          ),
        );
      return out;
    },
  },

  {
    id: "hn_frontpage",
    label: "Вас закинули на головну",
    codexRef: "launch",
    weightFor: ({ state }) => 0.015 * (n(state.market.awareness) / 0.5) * (0.3 + n(state.market.positioning)),
    describe: ({ state }) =>
      state.product.polish < 50
        ? "Хтось запостив ваш продукт, і це злетіло. Тисячі людей прийшли подивитися — і побачили, як усе лягло під навантаженням."
        : "Хтось запостив ваш продукт, і це злетіло. Тисячі людей за день, і сервер витримав.",
    effects: ({ state, rng }) => {
      const spike = rng.int(3000, 25000);
      const out = [
        e("flags.trafficSpike", spike, `${spike} відвідувачів за кілька днів — не ваша заслуга, але ваш шанс`),
        e("market.awareness", 12, "Про вас дізналося на порядок більше людей"),
        e("founder.supportBacklog", 25, "Разом із трафіком прийшла хвиля питань"),
        e("biz.infraCost", 30, "Рахунок за інфраструктуру цього місяця буде іншим"),
      ];
      if (state.product.polish < 50) {
        out.push(
          e("product.bugs", 20, "Під навантаженням вилізло все, що ніколи не перевірялося"),
          e("market.trust", -8, "Тисячі людей побачили продукт у момент, коли він не працював"),
        );
      }
      return out;
    },
  },

  {
    id: "big_customer_churn",
    label: "Найбільший клієнт пішов",
    codexRef: "concentration",
    weightFor: ({ state }) =>
      state.biz.customers >= 20 ? 0.03 * (1 + n(state.metrics.topCustomerShare)) : 0,
    describe: () =>
      "Клієнт, на якого припадала помітна частина виручки, змінив підхід і більше не потребує продукту. Нічого не зламалося — просто у них змінилися обставини.",
    effects: ({ state, rng }) => {
      const lost = Math.max(1, Math.round(state.biz.customers * 0.03 * rng.range(0.7, 1.4)));
      return [
        e(
          "biz.customers",
          -lost,
          `Мінус ${lost}. Що менша база, то більша частка припадає на кожного — і то дорожчий кожен такий випадок`,
        ),
        e("founder.energy", -5, "Втрата великого клієнта б'є не лише по цифрах"),
      ];
    },
  },

  {
    id: "illness",
    label: "Захворіли на два тижні",
    codexRef: "burnout",
    weightFor: ({ state }) => 0.03 * (state.founder.energy < 40 ? 2 : 1),
    describe: ({ state }) =>
      state.founder.energy < 40
        ? "Організм узяв відпустку сам, не питаючи. Так буває саме тоді, коли ви довго працювали на межі."
        : "Звичайна хвороба, два тижні з ладу. Соло це означає, що не працює ніхто.",
    effects: () => [
      e("flags.hoursPenaltyPct", 50, "Половина місяця випала"),
      e("founder.supportBacklog", 15, "Звернення нікуди не поділися, просто ніхто не відповідав"),
      e("founder.energy", -5, "Хвороба не є відпочинком"),
    ],
  },

  {
    id: "viral_post",
    label: "Ваш допис розлетівся",
    codexRef: "community",
    weightFor: ({ state }) =>
      0.025 * (n(state.channels.communityRep) / 0.6) * (0.4 + n(state.founder.skillMarketing)),
    describe: () =>
      "Допис, який ви написали між справами, зачепив людей і розійшовся далеко за межі вашої звичайної аудиторії.",
    effects: ({ rng }) => {
      const spike = rng.int(600, 2500);
      return [
        e("flags.trafficSpike", spike, `${spike} відвідувачів. Щастя приходить до тих, хто присутній`),
        e("market.awareness", 15, "Ваше ім'я побачили там, де раніше не бачили"),
        e("channels.listSize", 150, "Частина підписалася на розсилку"),
      ];
    },
  },

  {
    id: "platform_change",
    label: "Платформа змінила правила",
    codexRef: "tech-debt",
    weightFor: ({ state }) => (state.flags.hasProduct ? 0.02 : 0),
    describe: () =>
      "Сервіс, від якого ви залежите, змінив API й ціни. Термін на міграцію — місяць, і він не обговорюється.",
    effects: () => [
      e("product.techDebt", 12, "Термінова міграція завжди робиться гірше, ніж планова"),
      e("flags.hoursPenaltyPct", 12, "Частина місяця пішла на роботу, якої не було в планах"),
      e("biz.toolCost", 15, "Новий тариф дорожчий за старий"),
    ],
  },

  {
    id: "seo_update",
    label: "Оновлення пошукового алгоритму",
    codexRef: "seo",
    weightFor: ({ state }) => (state.channels.seoMature > 20 ? 0.025 : 0),
    describe: ({ state }) =>
      state.market.icpClarity > 55
        ? "Пошук оновив алгоритм. Матеріали, написані для конкретної аудиторії з реальною відповіддю на реальне питання, від таких оновлень зазвичай виграють."
        : "Пошук оновив алгоритм і опустив поверхневі матеріали. Частина ваших статей просіла.",
    effects: ({ state }) => {
      const good = state.market.icpClarity > 55;
      const delta = good ? state.channels.seoMature * 0.15 : -state.channels.seoMature * 0.25;
      return [
        e(
          "channels.seoMature",
          delta,
          good
            ? "Ваші матеріали піднялися: алгоритми послідовно винагороджують тексти, написані для людей із конкретною проблемою"
            : "Загальні статті «про все» просіли першими — саме їх оновлення й цілять",
        ),
      ];
    },
  },

  {
    id: "press_mention",
    label: "Про вас написало нішеве видання",
    codexRef: "trust",
    weightFor: ({ state }) => 0.02 * (n(state.market.trust) / 0.5),
    describe: () => "Галузеве видання згадало ваш продукт у добірці. Ви про це навіть не просили.",
    effects: ({ rng }) => [
      e("market.awareness", 10, "Згадка в галузевому виданні працює довше за рекламу"),
      e("market.trust", 6, "Посилання з поважного джерела знімає частину сумнівів"),
      e("flags.trafficSpike", rng.int(300, 1200), "Невеликий, але якісний сплеск трафіку"),
    ],
  },

  {
    id: "chargebacks",
    label: "Хвиля повернень і чарджбеків",
    codexRef: "churn",
    weightFor: ({ state }) => (state.metrics.churnPct > 12 ? 0.02 : 0),
    describe: () =>
      "Частина клієнтів, які пішли, вимагала повернення коштів, а кілька відкрили спори через банк. Провайдер це помітив.",
    effects: ({ state }) => [
      e("biz.cash", -state.biz.mrr * 0.15, "Повернення й штрафи за спори"),
      e(
        "flags.processorRisk",
        1,
        "Акаунт на підвищеному контролі провайдера — тепер заморозка виплат значно вірогідніша. Високий відтік породжує другу проблему, яку вже не пов'язують із першою",
      ),
    ],
  },

  {
    id: "acquisition_inquiry",
    label: "«Чи не думали продати проєкт?»",
    codexRef: "exit",
    weightFor: ({ state, monthIndex }) => (state.biz.mrr >= 2500 && monthIndex >= 18 ? 0.02 : 0),
    describe: ({ state }) =>
      `Лист від покупця мікро-SaaS: пропонують $${Math.round(state.biz.mrr * 12 * ACQUISITION_ARR_MULTIPLE).toLocaleString("uk-UA")} — приблизно ${ACQUISITION_ARR_MULTIPLE}× річної виручки. Відповісти треба до наступного місяця.`,
    decision: ({ state }) => ({
      id: "acquisition",
      title: "Пропозиція про купівлю",
      offer: Math.round(state.biz.mrr * 12 * ACQUISITION_ARR_MULTIPLE),
    }),
    effects: () => [
      e("founder.energy", 6, "Хтось оцінив зроблене вами в конкретну суму — це саме по собі надає сил"),
    ],
  },

  {
    id: "family_emergency",
    label: "Сімейні обставини",
    codexRef: "burnout",
    weightFor: () => 0.02,
    describe: () => "Життя поза продуктом теж трапляється, і воно не питає, який зараз місяць.",
    effects: () => [
      e(
        "flags.hoursPenaltyPct",
        40,
        "Майже половина місяця випала. Протидії тут немає — протидією був запас, зроблений раніше",
      ),
    ],
  },
];

export const EVENTS_BY_ID = Object.fromEntries(EVENTS.map((event) => [event.id, event]));
