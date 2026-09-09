/**
 * Фаза «рослини живуть самі».
 *
 * Це найдовший файл гри, і так має бути: тут лежить уся фізіологія, яку гравець
 * не контролює безпосередньо, а лише створює для неї умови. Дії гравця змінюють
 * середовище й запаси; перетворює це на ріст, листя, плоди або на смерть — саме
 * цей файл.
 *
 * Фаза йде ПІСЛЯ клімату, бо це реакція на середовище, яке вже склалося цього
 * місяця. Усі розрахунки читають стан на початок фази: місяць проживається
 * одночасно, а не послідовно.
 */

import { makeEffect } from "@edu/sim-core";
import { CULTIVARS, speciesOf } from "../data/plants.data.js";
import { livePlantIds, pathFor, potFactor } from "./model.js";
import { makeSource } from "./source.js";

/** Освітленість, нижче якої лист витрачає більше, ніж виробляє. */
const LEAF_BREAK_EVEN = 38;

/** Місяці, коли рослина в принципі здатна цвісти. */
const FLOWERING_MONTHS = [4, 5, 6, 7, 8];

export function plantsPhase({ state, meta }) {
  const out = [];
  meta.plantNotes = meta.plantNotes ?? {};

  for (const id of livePlantIds(state)) {
    const effects = livePlant(state, id, meta);
    const source = makeSource({ kind: "natural", plantId: id });
    for (const effect of effects) {
      out.push(makeEffect({ ...effect, source }));
    }
  }

  return out;
}

function livePlant(state, id, meta) {
  const plant = state.plants[id];
  const cultivar = CULTIVARS[id];
  const sp = speciesOf(id);
  const P = pathFor(id);
  const { tempAir, tempFloor, light, humidity, mitePressure } = state.balcony;
  const month = state.month;
  const pot = potFactor(plant, cultivar);

  const out = [];
  const e = (key, delta, reason) => {
    if (Math.abs(delta) < 0.4) return;
    out.push({ target: P(key), delta: round(delta), reason });
  };

  // ─────────────────────────── Спокій і пробудження ───────────────────────────
  const warmEnough = tempAir >= sp.wakeTemp;
  const brightEnough = light >= sp.wakeLight;

  if (!warmEnough || !brightEnough) {
    const coldPart = warmEnough ? 0 : (sp.wakeTemp - tempAir) * 1.6;
    const darkPart = brightEnough ? 0 : (sp.wakeLight - light) * 0.35;
    e(
      "dormancy",
      Math.min(20, coldPart + darkPart),
      !warmEnough && !brightEnough
        ? `І холодно (${Math.round(tempAir)} °C проти потрібних +${sp.wakeTemp}), і темно (${Math.round(light)} проти ${sp.wakeLight}) — рослина йде в спокій`
        : !warmEnough
          ? `${sp.label} рушає в ріст від +${sp.wakeTemp} °C, а на балконі ${Math.round(tempAir)} — ріст зупинено`
          : `Світла ${Math.round(light)} при потрібних ${sp.wakeLight} — рослина пригальмовує`,
    );
  } else if (plant.dormancy > 0) {
    e(
      "dormancy",
      -Math.min(plant.dormancy, 45 * sp.wakeSpeed),
      sp.wakeSpeed < 1
        ? `Умови достатні, але ${sp.label} прокидається повільно — на це йде більше часу, ніж у annuum`
        : `Тепло (${Math.round(tempAir)} °C) і світло (${Math.round(light)}) достатні — рослина виходить зі спокою`,
    );
  }

  // Вихід зі спокою — не перемикач, а схил: рослина, яка ще не прокинулася
  // повністю, уже потроху росте. Для chinense це принципово, бо повне
  // пробудження в нього займає зайвий місяць.
  const active = plant.dormancy < 45 && warmEnough && brightEnough;
  const dormancyFactor = clamp(1 - plant.dormancy / 55, 0.25, 1);

  // ─────────────────────────────── Вода в горщику ──────────────────────────────
  const tempFactor = clamp(tempAir / 22, 0.2, 2.0);
  const leafFactor = 0.4 + (plant.leaf / 100) * 0.9;
  const volumeFactor = clamp(0.6 + plant.pot.volume / 15, 0.7, 1.6);
  const evaporation = (14 * tempFactor * leafFactor) / volumeFactor;

  e(
    "pot.moisture",
    -evaporation,
    plant.pot.volume <= 3
      ? `У ${plant.pot.volume}-літровому горщику вологи мало за визначенням — він пересихає найшвидше на балконі`
      : tempAir < 10
        ? "У прохолоді рослина майже не випаровує воду — грудка сохне повільно"
        : `Рослина випаровує воду через листя: за місяць грудка втрачає ${Math.round(evaporation)}`,
  );

  // ──────────────────────────────── Коріння ────────────────────────────────
  // Промерзання. Головна причина загибелі chinense на неопалюваному балконі.
  if (tempFloor < sp.rootKillC) {
    const gap = sp.rootKillC - tempFloor;
    e(
      "roots",
      -Math.pow(gap, 1.5) * 2.5,
      `У грудці ${round1(tempFloor)} °C, а коріння ${sp.label} гине вже при +${sp.rootKillC} °C. ` +
        `Різниця в ${round1(gap)} градуса руйнує кореневі волоски`,
    );
  }

  // Гниль. Убиває не мороз, а поєднання мокрого субстрату, холоду й спокою.
  const soggy = plant.pot.moisture > 60;
  const coldRoot = tempFloor < 12;
  if (soggy && (coldRoot || plant.dormancy > 40)) {
    const excess = plant.pot.moisture - 60;
    const coldMultiplier = 1 + Math.max(0, 12 - tempFloor) / 12;
    const drainageRelief = 1 - plant.pot.drainage / 150;
    const progression = 1 + Math.max(0, 70 - plant.roots) / 100;
    const rot = excess * 0.3 * coldMultiplier * drainageRelief * progression;
    e(
      "roots",
      -rot,
      `Субстрат мокрий (${Math.round(plant.pot.moisture)}) при ${round1(tempFloor)} °C у грудці. ` +
        `У холодному вологому субстраті коріння не дихає й загниває — це і є коренева гниль`,
    );
  }

  // Пересихання.
  if (plant.pot.moisture < 12) {
    e(
      "roots",
      -(12 - plant.pot.moisture) * 0.8,
      `Грудка пересохла (${Math.round(plant.pot.moisture)}) — дрібні всмоктувальні корінці відмирають першими`,
    );
  }

  // Засолення: солі тримають воду й коріння не може її взяти.
  if (plant.pot.salinity > 50) {
    e(
      "roots",
      -(plant.pot.salinity - 50) * 0.12,
      `Засолення ${Math.round(plant.pot.salinity)}: солей у розчині більше, ніж у клітинах кореня, ` +
        `і вода йде не в рослину, а з неї`,
    );
  }

  // Відновлення — коріння відростає, якщо умови не проти нього.
  const rootsComfortable =
    plant.pot.moisture >= 25 &&
    plant.pot.moisture <= 62 &&
    tempFloor > sp.coldStressC &&
    plant.pot.salinity < 55;
  if (rootsComfortable && plant.roots < 100) {
    e(
      "roots",
      active ? 7 : 2.5,
      active
        ? "Тепла, помірно волога й повітропроникна грудка — коріння активно відновлюється"
        : "Умови в горщику спокійні — коріння повільно відновлюється навіть у спокої",
    );
  }

  // Освоєння об'єму. Рано чи пізно горщик стане тісним — це неминуче.
  if (active && plant.rootFill < 100) {
    e("rootFill", 6 / volumeFactor, "Коріння росте й заповнює об'єм горщика");
  }

  // Субстрат злежується сам собою.
  if (plant.pot.drainage > 0) {
    e("pot.drainage", -1.5, "Субстрат поступово злежується й втрачає повітроємність");
  }

  // ───────────────────────────────── Листя ─────────────────────────────────
  // Втрати листя рахуються разом і обмежуються спільною підлогою: рослина
  // скидає старе листя, але верхівкові точки росту тримає до останнього.
  // Без цієї підлоги chinense щозими виходив би в нуль і навесні стартував би
  // з голого стебла — а це вже не зимівля, а загибель із відтермінуванням.
  const LEAF_FLOOR = 14;
  const losses = [];

  if (light < LEAF_BREAK_EVEN) {
    losses.push([
      (LEAF_BREAK_EVEN - light) * 1.2,
      `Освітленість ${Math.round(light)} нижча за поріг окупності листа (${LEAF_BREAK_EVEN}). ` +
        `Лист витрачає більше, ніж виробляє, і рослина його скидає`,
    ]);
  }

  if (tempAir < sp.leafDropC) {
    losses.push([
      (sp.leafDropC - tempAir) * 0.9,
      `${sp.label} починає скидати листя нижче +${sp.leafDropC} °C, а на балконі ${Math.round(tempAir)}`,
    ]);
  }

  // Магнієвий хлороз: жилки зелені, тканина між ними жовтіє.
  if (plant.pot.magnesium < 25) {
    losses.push([
      3.5,
      `Магнію мало (${Math.round(plant.pot.magnesium)}) — старе листя жовтіє між жилками й опадає`,
    ]);
  }

  const wanted = losses.reduce((sum, [amount]) => sum + amount, 0);
  const allowed = Math.max(0, plant.leaf - LEAF_FLOOR);
  const scale = wanted > allowed ? allowed / wanted : 1;
  for (const [amount, reason] of losses) {
    e(
      "leaf",
      -amount * scale,
      scale < 1
        ? `${reason}. Скидати далі нікуди: залишилися верхівкові листки, без яких рослина не виживе`
        : reason,
    );
  }

  // Ріст листя.
  if (active && plant.roots > 20) {
    const nitrogenFactor = clamp(plant.pot.nitrogen / 55, 0.15, 1.2);
    const rootFactor = clamp(plant.roots / 70, 0.2, 1.15);
    const lightFactor = clamp(light / 70, 0.3, 1.2);
    const growth = 19 * nitrogenFactor * rootFactor * lightFactor * pot * dormancyFactor;
    e(
      "leaf",
      growth,
      plant.pot.nitrogen < 25
        ? `Листя росте, але азоту мало (${Math.round(plant.pot.nitrogen)}) — приріст удвічі менший за можливий`
        : `Тепло, світло й азот у наявності — рослина нарощує листя`,
    );
    e("pot.nitrogen", -6 * pot, "Азот витрачено на приріст листя й пагонів");
  }

  // ────────────────────────── Запас у стеблі й сила ──────────────────────────
  const lightShare = clamp(light / 100, 0, 1);
  if (!active) {
    // Узимку листя стає споживачем, а не годувальником — і саме тому кущ,
    // що пішов у зиму з повною кроною, до весни спорожнює стебло.
    const drain = 1.5 + plant.leaf * 0.06 * (1 - lightShare);
    e(
      "reserves",
      -drain,
      plant.leaf > 40
        ? `Кущ тримає ${Math.round(plant.leaf)} одиниць листя при освітленості ${Math.round(light)} — ` +
          `воно не окупається й з'їдає запас стебла`
        : "Рослина живе на запасі стебла — у спокої це нормальна витрата",
    );
  } else if (plant.leaf > 25) {
    e(
      "reserves",
      Math.min(9, plant.leaf * 0.09 * lightShare),
      "Листя працює й відкладає надлишок у стебло — це запас на наступну зиму",
    );
  }

  if (plant.woody < 100 && plant.age >= 1 && !active) {
    e("woody", 2.5, "Стебло поступово дерев'яніє — здерев'яніла тканина краще переносить холод");
  }

  // Сила росту виводиться з коріння, запасу й того, чи вистачає горщика.
  const vigorTarget = clamp(
    plant.roots * 0.5 + plant.reserves * 0.3 + pot * 30 - Math.max(0, plant.rootFill - 85) * 0.4,
    0,
    100,
  );
  const vigorShift = (vigorTarget - plant.vigor) * 0.35;
  if (Math.abs(vigorShift) >= 0.5) {
    e(
      "vigor",
      vigorShift,
      plant.rootFill > 85
        ? `Коріння заповнило горщик (${Math.round(plant.rootFill)}) — рослині нікуди рости, сила падає`
        : vigorShift > 0
          ? "Здорове коріння й запас у стеблі дають рослині силу росту"
          : "Сила росту падає слідом за станом коріння й запасом стебла",
    );
  }

  // ──────────────────────────── Шкідники ────────────────────────────
  const miteDelta =
    mitePressure / 12 + (humidity < 40 ? 7 : humidity < 50 ? 2.5 : -2.5) + (plant.leaf > 60 ? 1.5 : 0);
  e(
    "mites",
    miteDelta,
    humidity < 40
      ? `Вологість ${Math.round(humidity)}% — ідеальні умови для павутинного кліща: покоління виводиться за тиждень`
      : humidity < 50
        ? "Повітря сухувате — колонія кліща потроху росте"
        : `Вологе повітря (${Math.round(humidity)}%) стримує кліща — частина колонії гине`,
  );

  if (plant.mites > 40) {
    e(
      "leaf",
      -(plant.mites - 40) * 0.14,
      `Кліщ висмоктує клітини листа: ${Math.round(plant.mites)} — це вже помітна крапчастість і павутиння знизу`,
    );
  }

  if (active) {
    e("pests", 3, "У теплі попелиця й білокрилка розмножуються самі — досить одного занесеного екземпляра");
  } else if (plant.pests > 0) {
    e("pests", -2, "У прохолоді комахи-шкідники розмножуються повільно");
  }

  if (plant.pests > 45) {
    e("leaf", -(plant.pests - 45) * 0.1, `Попелиця висмоктує соки з молодих пагонів (${Math.round(plant.pests)})`);
  }

  // ──────────────────────────── Цвітіння і плоди ────────────────────────────
  if (active && FLOWERING_MONTHS.includes(month) && plant.vigor > 35 && plant.leaf > 22) {
    const flowerGain = (plant.vigor / 100) * 20 * pot * clamp(plant.pot.pk / 45, 0.4, 1.2);
    e(
      "flowers",
      flowerGain,
      plant.age >= 2
        ? `Перезимований кущ цвіте рясно: у нього вже є готовий скелет і коріння, а не тільки що пророслий сіянець`
        : "Рослина набрала масу й почала закладати квітки",
    );
  }

  // Спека стерилізує пилок — квітки обсипаються, скільки їх не запилюй.
  if (plant.flowers > 5 && tempAir > sp.pollenSterileC) {
    e(
      "flowers",
      -plant.flowers * 0.35,
      `На балконі ${Math.round(tempAir)} °C. Вище +${sp.pollenSterileC} °C пилок ${sp.label} стерильний, ` +
        `і квітки обсипаються нерозкритою зав'яззю`,
    );
  }

  // Самозапилення без вітру й комах — мізерне. Це і є головна пастка балкона.
  if (plant.flowers > 8) {
    const selfSet = plant.flowers * 0.06;
    e(
      "fruitSet",
      selfSet,
      `Без вітру й комах пилок майже не осипається на приймочку — самотужки зав'язується лише ` +
        `близько 6% квіток`,
    );
    e("flowers", -selfSet * 1.6, "Частина квіток відцвіла й опала, не давши зав'язі");
  }

  // Налив плодів.
  if (plant.fruitSet > 8) {
    const waterOk = plant.pot.moisture > 25 && plant.pot.moisture < 85;
    const fill =
      14 *
      pot *
      clamp(plant.leaf / 55, 0.3, 1.2) *
      clamp(plant.pot.pk / 45, 0.35, 1.2) *
      (waterOk ? 1 : 0.4);
    e(
      "fruitFill",
      fill,
      !waterOk
        ? `Вологість субстрату ${Math.round(plant.pot.moisture)} — плоди не наливаються, розмір втрачено назавжди`
        : plant.pot.pk < 30
          ? `Калію мало (${Math.round(plant.pot.pk)}) — плоди наливаються повільніше за можливе`
          : "Плоди наливаються: води, калію й працюючого листя вистачає",
    );
    e("pot.pk", -8, "Калій і фосфор витрачені на налив плодів");

    // Вершинна гниль — дефіцит кальцію в тканині плода, а не інфекція.
    if (plant.pot.calcium < 30) {
      e(
        "fruitFill",
        -6,
        `Кальцію мало (${Math.round(plant.pot.calcium)}): на кінчиках плодів з'являється чорна суха пляма — ` +
          `вершинна гниль. Це не хвороба, а дефіцит у самій тканині`,
      );
    }
    e("pot.calcium", -5, "Кальцій пішов у тканину плодів разом із потоком води");
  }

  // Визрівання — тут вирішується доля chinense.
  if (plant.fruitFill > 18 && tempAir > 18) {
    e(
      "ripeness",
      32 * sp.ripenRate,
      sp.ripenRate < 1
        ? `${sp.label} визріває поволі: від зав'язі до кольору йому потрібно 90–120 днів проти 60–80 в annuum`
        : "Плоди набирають колір",
    );
  }

  // Гострота росте від стресу — це не міф, а реакція на посуху й спеку.
  if (plant.fruitFill > 20) {
    const stress = (plant.pot.moisture < 30 ? 4 : 0) + (tempAir > 28 ? 3 : 0);
    if (stress > 0) {
      e(
        "pungency",
        stress,
        "Помірний стрес — суха грудка й спека — змушує рослину накопичувати капсаїцин: плоди стають гострішими",
      );
    }
  }

  // Магній витрачається завжди, коли рослина працює.
  if (active) {
    e("pot.magnesium", -4, "Магній витрачається на хлорофіл — його завжди бракує раніше за інші елементи");
  }

  meta.plantNotes[id] = { active, pot: round1(pot) };
  return out;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function round(v) {
  return Math.round(v * 10) / 10;
}

function round1(v) {
  return Math.round(v * 10) / 10;
}
