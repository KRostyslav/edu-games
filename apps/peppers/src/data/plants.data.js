/**
 * Біологія перців: вид і сорт.
 *
 * Уся гра тримається на одній відмінності — Capsicum annuum і Capsicum chinense
 * по-різному реагують на холод, світло й час. Халапеньо перезимує майже будь-як,
 * хабанеро загине від того самого догляду. Тому пороги виду винесені в дані,
 * а не зашиті в розрахунок: гравець мусить бачити, що це властивість рослини,
 * а не примха балансу.
 *
 * Числа — ігрові пороги, а не лабораторні константи. Вони відповідають реальній
 * поведінці рослин у діапазоні, який видно на балконі, але спрощені до одного
 * значення там, де в житті є плавний перехід.
 */

export const SPECIES = {
  annuum: {
    id: "annuum",
    label: "Capsicum annuum",
    note: "Найпоширеніший вид. Витриваліший до холоду й швидший — саме тому з нього починають.",

    // ── Холод ──
    // Коріння гине не «від морозу», а від температури в грудці. Для annuum це
    // фактичне промерзання, для chinense — задовго до нуля.
    rootKillC: -1,
    // Нижче цієї температури лист перестає працювати й опадає.
    leafDropC: 2,
    // Нижче цієї температури ріст стоїть і накопичуються пошкодження.
    coldStressC: 5,

    // ── Пробудження ──
    wakeTemp: 14,
    wakeLight: 45,
    wakeSpeed: 1.0,

    // ── Вегетація ──
    humidityNeed: 45,
    // Вище цієї температури пилок стерильний і квітки обсипаються.
    pollenSterileC: 32,
    // Швидкість визрівання плоду. 1.0 ≈ 60–80 днів від зав'язі.
    ripenRate: 1.0,
    dormancyRate: 1.0,
  },

  chinense: {
    id: "chinense",
    label: "Capsicum chinense",
    note: "Тропічний вид. Гине від прохолоди, яку annuum не помічає, і потребує на місяць-два більше часу на визрівання.",

    // Головне число всієї гри: коріння chinense гине при +2 °C, коли термометр
    // на стіні показує впевнений плюс. Саме на цьому втрачають хабанеро.
    rootKillC: 2,
    leafDropC: 8,
    coldStressC: 12,

    wakeTemp: 16,
    wakeLight: 55,
    // Прокидається повільніше — на балконі це означає старт на місяць пізніше.
    wakeSpeed: 0.6,

    humidityNeed: 60,
    pollenSterileC: 35,
    // 90–120+ днів від зав'язі. Через це половина плодів не встигає визріти,
    // і саме тому chinense має сенс перезимовувати, а не сіяти щороку.
    ripenRate: 0.6,
    dormancyRate: 0.7,
  },
};

/**
 * Сорти. `needL` — об'єм горщика, за якого сорт розкривається повністю;
 * `pods` — скільки плодів дає доросла рослина за ідеальних умов;
 * `gram` — середня маса одного плоду.
 */
export const CULTIVARS = {
  jalapeno: {
    id: "jalapeno",
    name: "Халапеньо",
    species: "annuum",
    note: "Найтерплячіший у колекції. Прощає помилки зимівлі, швидко визріває, добре гілкується.",
    height: "середній",

    startPotL: 5,
    needL: 7,
    potStepL: 3,

    pods: 30,
    gram: 22,
    baseSHU: 5000,
    basePungency: 45,

    startVigor: 55,
    startWoody: 40,
    startRootFill: 55,

    // Колір стиглого плоду для сцени й звіту.
    ripeColor: "червоний",
  },

  habanero: {
    id: "habanero",
    name: "Хабанеро",
    species: "chinense",
    note: "Найвимогливіший до тепла. Гине від прохолодного коріння взимку й не встигає визріти, якщо стартує пізно.",
    height: "середній",

    startPotL: 6,
    needL: 9,
    potStepL: 3,

    pods: 40,
    gram: 9,
    baseSHU: 250000,
    basePungency: 70,

    startVigor: 50,
    startWoody: 45,
    startRootFill: 60,

    ripeColor: "помаранчевий",
  },

  ajiLimo: {
    id: "ajiLimo",
    name: "Ají Limo",
    species: "chinense",
    note: "Перуанський сорт. Високий і розлогий — без опори вилягає, а маленького горщика йому мало вже до липня.",
    height: "високий",

    startPotL: 7,
    needL: 12,
    potStepL: 4,

    pods: 55,
    gram: 7,
    baseSHU: 60000,
    basePungency: 60,

    startVigor: 60,
    startWoody: 50,
    startRootFill: 70,

    ripeColor: "жовтий",
  },

  numexEaster: {
    id: "numexEaster",
    name: "NuMex Easter",
    species: "annuum",
    note: "Декоративний компакт: 25 см заввишки, плоди пастельні й різнокольорові на одному кущі. Горщик малий, тому пересихає найшвидше.",
    height: "компактний",

    startPotL: 2,
    needL: 3,
    potStepL: 1,

    pods: 60,
    gram: 3,
    baseSHU: 15000,
    basePungency: 40,

    startVigor: 45,
    startWoody: 35,
    startRootFill: 50,

    ripeColor: "пастельний",
  },
};

/** Порядок горщиків на балконі — він же порядок вкладок і колонок у таблиці. */
export const PLANT_IDS = ["jalapeno", "habanero", "ajiLimo", "numexEaster"];

/** Вид сорту — найчастіша операція в усій моделі, тому окремим хелпером. */
export function speciesOf(cultivarId) {
  return SPECIES[CULTIVARS[cultivarId].species];
}
