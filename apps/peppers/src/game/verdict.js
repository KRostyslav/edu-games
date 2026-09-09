/**
 * Ризики, вирок і розтин.
 *
 * Ключове архітектурне рішення файлу: `risksFor` — ЄДИНЕ джерело правди про
 * небезпеку. З неї панель малює попередження ще до ходу, з неї ж пишуться
 * маркери в журнал рослини, і вона ж живить `judge`. Панель фізично не може
 * обіцяти одне, а вирок рахувати інше.
 *
 * Смерть у цій грі ніколи не буває раптовою. Вона завжди має ланцюг: маркери
 * лягають у журнал за місяці до неї, і розтин показує гравцеві не «рослина
 * загинула в січні», а «це вирішилося в листопаді, коли ви полили її повною
 * нормою».
 */

import { CULTIVARS, speciesOf } from "../data/plants.data.js";
import { MONTH_NAMES, SEASON_MONTHS } from "../data/calendar.js";
import { potFactor } from "./model.js";

/**
 * Усе, що зараз загрожує рослині.
 *
 * `chainFor` прив'язує ризик до причини смерті: коли рослина гине, розтин
 * збирає з журналу саме той ланцюг, який до цієї смерті призвів.
 */
export function risksFor(plant, state, cultivarId) {
  if (plant.alive <= 0) return [];

  const sp = speciesOf(cultivarId);
  const c = CULTIVARS[cultivarId];
  const { tempFloor, humidity } = state.balcony;
  const risks = [];

  // ── Промерзання коріння ──
  if (tempFloor < sp.rootKillC) {
    risks.push({
      code: "freezing",
      chainFor: "freeze",
      severity: "bad",
      text:
        `У грудці ${round1(tempFloor)} °C, а коріння ${sp.label} гине вже при +${sp.rootKillC} °C. ` +
        `Кожен такий місяць забирає частину кореневої системи.`,
    });
  } else if (tempFloor < sp.rootKillC + 3) {
    risks.push({
      code: "freeze_near",
      chainFor: "freeze",
      severity: "warn",
      text:
        `У грудці ${round1(tempFloor)} °C при критичних +${sp.rootKillC} для ${sp.label} — ` +
        `запас усього ${round1(tempFloor - sp.rootKillC)} градуса.`,
    });
  }

  // ── Мокрий субстрат у спокої ──
  if (plant.pot.moisture > 60 && (tempFloor < 12 || plant.dormancy > 40)) {
    risks.push({
      code: "wet_dormant",
      chainFor: "root_rot",
      severity: plant.pot.moisture > 72 ? "bad" : "warn",
      text:
        `Вологість субстрату ${Math.round(plant.pot.moisture)} при ${round1(tempFloor)} °C у грудці ` +
        `й дренажі ${Math.round(plant.pot.drainage)}. У спокої це вже режим гниття, а не поливу.`,
    });
  }

  if (plant.roots < 30) {
    risks.push({
      code: "roots_low",
      // Той самий симптом веде до різних причин смерті — прив'язуємо ризик до
      // тієї, яка зараз реально працює, інакше розтин збере не той ланцюг.
      chainFor:
        plant.pot.moisture > 55 ? "root_rot" : plant.pot.moisture < 25 ? "drought" : "freeze",
      severity: plant.roots < 15 ? "bad" : "warn",
      text:
        `Коріння лишилося ${Math.round(plant.roots)} зі 100. Рослина ще стоїть, але брати воду й живлення ` +
        `їй уже майже нічим.`,
    });
  }

  // ── Пересихання ──
  if (plant.pot.moisture < 24) {
    risks.push({
      code: "dry",
      chainFor: "drought",
      severity: plant.pot.moisture < 14 ? "bad" : "warn",
      text:
        `Грудка пересохла (${Math.round(plant.pot.moisture)})` +
        (c.startPotL <= 3 ? ` — у ${plant.pot.volume}-літровому горщику це питання днів.` : "."),
    });
  }

  // ── Кліщ ──
  if (plant.mites > 45) {
    risks.push({
      code: "mites",
      chainFor: "mites",
      severity: plant.mites > 70 ? "bad" : "warn",
      text:
        `Кліщ ${Math.round(plant.mites)} при вологості повітря ${Math.round(humidity)}%. ` +
        `Колонія подвоюється приблизно за два тижні, і листя вже втрачає клітини.`,
    });
  }

  // ── Виснаження ──
  if (plant.leaf < 18 && plant.reserves < 30) {
    risks.push({
      code: "exhaustion",
      chainFor: "exhaustion",
      severity: plant.reserves < 15 ? "bad" : "warn",
      text:
        `Листя ${Math.round(plant.leaf)}, запас стебла ${Math.round(plant.reserves)}. ` +
        `Живитися нічим і відновлюватися нічим — рослина проїдає останнє.`,
    });
  }

  // ── Горщик ──
  if (plant.rootFill > 88) {
    risks.push({
      code: "rootbound",
      chainFor: null,
      severity: "warn",
      text:
        `Коріння заповнило горщик (${Math.round(plant.rootFill)}). Рослина пересихає за день і не втримає ` +
        `врожай — потрібна пересадка в більший об'єм.`,
    });
  }

  if (plant.pot.salinity > 55) {
    risks.push({
      code: "salinity",
      chainFor: "salinity",
      severity: plant.pot.salinity > 72 ? "bad" : "warn",
      text:
        `Засолення ${Math.round(plant.pot.salinity)}. Солі тримають воду сильніше за коріння — ` +
        `рослина в'яне на мокрому субстраті. Потрібне промивання або пересадка.`,
    });
  }

  if (potFactor(plant, c) < 0.7) {
    risks.push({
      code: "pot_small",
      chainFor: null,
      severity: "warn",
      text:
        `Горщик ${plant.pot.volume} л при потрібних сорту ${c.needL} л — врожай обмежений об'ємом, ` +
        `а не доглядом.`,
    });
  }

  return risks;
}

/**
 * Вирок. Повертає null, якщо рослина жива.
 *
 * Порядок перевірок — від найконкретнішої причини до найзагальнішої: якщо
 * коріння загинуло в мокрому субстраті, це гниль, а не «виснаження».
 */
export function judge(plant, state, cultivarId) {
  if (plant.alive <= 0) return null;

  const sp = speciesOf(cultivarId);
  const { tempFloor } = state.balcony;

  if (plant.roots <= 0) {
    // Порядок важливий: коріння може загинути трьома різними способами, і
    // назвати причину треба ту, що справді працювала. Холод перевіряємо
    // першим, бо він єдиний видно за температурою прямо зараз.
    if (tempFloor < sp.rootKillC) {
      return {
        code: "freeze",
        cause: "Промерзання кореневої грудки",
        reason:
          `Коріння загинуло повністю. У грудці трималося ${round1(tempFloor)} °C, ` +
          `а коріння ${sp.label} гине вже при +${sp.rootKillC} °C`,
      };
    }
    if (plant.pot.moisture > 55) {
      return {
        code: "root_rot",
        cause: "Коренева гниль",
        reason:
          `Коріння загинуло повністю. Субстрат стояв мокрим (${Math.round(plant.pot.moisture)}) ` +
          `при ${round1(tempFloor)} °C у грудці й дренажі ${Math.round(plant.pot.drainage)}: ` +
          `у холодному вологому субстраті без повітря коріння не дихає й загниває`,
      };
    }
    if (plant.pot.moisture < 25) {
      return {
        code: "drought",
        cause: "Пересихання кореневої грудки",
        reason:
          `Коріння загинуло повністю. Субстрат стояв сухим (${Math.round(plant.pot.moisture)}) — ` +
          `дрібні всмоктувальні корінці відмирають від посухи так само надійно, як від гнилі, ` +
          `а в ${plant.pot.volume}-літровому горщику запасу вологи майже немає`,
      };
    }
    return {
      code: "salinity",
      cause: "Засолення субстрату",
      reason:
        `Коріння загинуло повністю при засоленні ${Math.round(plant.pot.salinity)}. ` +
        `Солей у розчині більше, ніж у клітинах кореня, і вода йде не в рослину, а з неї`,
    };
  }

  if (plant.mites >= 92 && plant.leaf <= 6) {
    return {
      code: "mites",
      cause: "Знищення павутинним кліщем",
      reason:
        `Кліщ ${Math.round(plant.mites)} зі 100, листя майже не лишилося (${Math.round(plant.leaf)}). ` +
        `Рослина без листя не може ні годуватися, ні відновитися`,
    };
  }

  if (plant.reserves <= 0 && plant.leaf <= 4) {
    return {
      code: "exhaustion",
      cause: "Виснаження",
      reason:
        `Кущ залишився без листя (${Math.round(plant.leaf)}) і без запасу в стеблі. ` +
        `Живитися нічим і нічим відновлюватися`,
    };
  }

  return null;
}

/**
 * Розтин: не «що сталося», а «коли це вирішилося».
 *
 * Безпосередня причина смерті майже завжди нецікава — цікавий момент, після
 * якого результат був уже вирішений. Його й шукаємо в журналі.
 */
export function buildAutopsy(plant, verdict) {
  const raw = [...plant.journal]
    .filter((marker) => marker.chainFor === verdict.code)
    .sort(bySeasonOrder);

  const chain = collapseRuns(raw);

  return {
    ...verdict,
    decidedAt: raw[0] ?? null,
    lastChance: raw.length > 1 ? raw[raw.length - 2] : null,
    chain,
  };
}

/**
 * Згортає послідовні однакові попередження в один запис.
 *
 * Шість місяців поспіль із рядком «грудка пересохла» — це не шість подій, а
 * одна, що тривала півроку. Розтин має читатися як історія, а не як лог.
 */
function collapseRuns(markers) {
  const out = [];
  for (const marker of markers) {
    const last = out[out.length - 1];
    if (last && last.code === marker.code) {
      last.until = marker;
      last.count += 1;
      // Текст беремо найсвіжіший: у ньому актуальні числа.
      last.text = marker.text;
      continue;
    }
    out.push({ ...marker, until: null, count: 1 });
  }
  return out;
}

function bySeasonOrder(a, b) {
  if (a.year !== b.year) return a.year - b.year;
  return SEASON_MONTHS.indexOf(a.month) - SEASON_MONTHS.indexOf(b.month);
}

/** Підпис маркера для журналу й розтину. */
export function markerLabel(marker) {
  return `${MONTH_NAMES[marker.month]}, рік ${marker.year}`;
}

function round1(v) {
  return Math.round(v * 10) / 10;
}
