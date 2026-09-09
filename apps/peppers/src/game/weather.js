/**
 * Події балкона.
 *
 * Фаза подій іде ПІСЛЯ фізіології з тієї самої причини, з якої погода у
 * виноградника йде останньою: подія не створює умови, вона перевіряє,
 * наскільки гравець виявився до них готовим. Пінопласт, куплений цього ж
 * місяця, встигає спрацювати; куплений наступного — ні.
 *
 * Таблиць дві, і з кожної береться максимум одна подія: клімат і неприємності
 * незалежні одне від одного, і сухе повітря від опалення цілком може збігтися
 * зі спалахом кліща — власне, зазвичай так і буває.
 *
 * `idleWeight` у sim-core працює як МІНІМАЛЬНА сума ваг, а не як додаткова
 * вага: шанс «нічого не сталося» дорівнює (idleWeight − сума ваг) / idleWeight.
 * Тому ваги тут дрібні, а idleWeight помітно більший за них.
 */

import { rollEvent } from "@edu/sim-core";
import { CULTIVARS, speciesOf } from "../data/plants.data.js";
import { livePlantIds, plantPath } from "./model.js";

const CLIMATE_IDLE = 2.0;
const TROUBLE_IDLE = 2.2;

/** Ефект для кожної живої рослини — більшість подій б'ють по всьому балкону. */
function forEachPlant(state, fn) {
  const out = [];
  for (const id of livePlantIds(state)) {
    const produced = fn(state.plants[id], id, CULTIVARS[id], speciesOf(id)) ?? [];
    for (const effect of produced) {
      if (effect) out.push(effect);
    }
  }
  return out;
}

const e = (target, delta, reason) => ({ target, delta, reason });

// ──────────────────────────── Кліматичні події ────────────────────────────

export const CLIMATE_EVENTS = [
  {
    id: "cold_snap",
    label: "Прорив холоду",
    months: [11, 12, 1, 2],
    weightFor: ({ state }) => 0.4 + (state.equipment.insulation > 0 ? 0 : 0.2),
    describe: ({ state }) =>
      `За вікном тримається сильний мороз. На балконі стало ${round1(state.balcony.tempAir - 6)} °C, ` +
      `у горщиках ${round1(state.balcony.tempFloor - 6)} °C.`,
    effects: (ctx) => {
      const { state } = ctx;
      const drop = state.equipment.insulation > 0 ? 4 : 6;
      const newFloor = state.balcony.tempFloor - drop;
      return [
        e("balcony.tempAir", -drop, "Мороз за вікном продавив температуру на балконі"),
        e("balcony.tempFloor", -drop, "Услід за повітрям охолола й коренева грудка"),
        ...forEachPlant(state, (plant, id, c, sp) => {
          if (newFloor >= sp.rootKillC) {
            return [
              e(
                plantPath(id, "damage"),
                3,
                `${c.name} витримав: у грудці ${round1(newFloor)} °C при критичних +${sp.rootKillC} для ${sp.label}`,
              ),
            ];
          }
          const gap = sp.rootKillC - newFloor;
          return [
            e(
              plantPath(id, "roots"),
              // Обмежено навмисно: один прорив холоду має боляче вдарити, але
              // не вбити з одного разу. Смерть у цій грі завжди має ланцюг,
              // який гравець міг побачити заздалегідь.
              -Math.min(24, gap * 4),
              `У грудці ${round1(newFloor)} °C, а коріння ${sp.label} гине при +${sp.rootKillC} °C. ` +
                (state.equipment.potStand > 0
                  ? "Пінопласт зменшив удар, але не скасував його"
                  : "Горщик стоїть на бетоні, і той тягне тепло знизу"),
            ),
            e(plantPath(id, "leaf"), -8, `${c.name} скинув частину листя від холодового шоку`),
          ];
        }),
      ];
    },
  },

  {
    id: "thaw",
    label: "Тривала відлига",
    months: [1, 2, 3],
    weightFor: () => 0.35,
    describe: () =>
      "Тиждень плюсової погоди й сонця. На балконі стало по-весняному тепло — рослини вирішили, що зима скінчилася.",
    effects: ({ state }) => [
      e("balcony.tempAir", 6, "Сонце крізь скло прогріло балкон"),
      e("balcony.tempFloor", 5, "Прогрілася й коренева грудка"),
      ...forEachPlant(state, (plant, id, c) =>
        plant.dormancy > 20
          ? [
              e(
                plantPath(id, "dormancy"),
                -22,
                `${c.name} вийшов зі спокою раніше часу — він орієнтується на тепло, а не на календар`,
              ),
              e(
                plantPath(id, "reserves"),
                -7,
                "Рушивши в ріст, кущ витратив запас стебла. Наступне похолодання він зустріне вже незагартованим",
              ),
            ]
          : [],
      ),
    ],
  },

  {
    id: "long_clouds",
    label: "Тиждень суцільної хмарності",
    months: [11, 12, 1, 2],
    weightFor: ({ state }) => (state.equipment.lamp > 0 ? 0.15 : 0.5),
    describe: ({ state }) =>
      state.equipment.lamp > 0
        ? "Кілька днів без просвіту. Фітолампа тримає освітленість, тож рослини цього майже не помітили."
        : "Кілька днів без просвіту. І без того короткий день став практично сутінками.",
    effects: ({ state }) =>
      state.equipment.lamp > 0
        ? [e("balcony.light", -4, "Лампа компенсувала майже всю втрату природного світла")]
        : [
            e("balcony.light", -18, "Суцільна хмарність забрала рештки природного світла"),
            ...forEachPlant(state, (plant, id, c) => [
              e(
                plantPath(id, "leaf"),
                -7,
                `${c.name} скидає листя: у такі тижні воно не окупається навіть теоретично`,
              ),
            ]),
          ],
  },

  {
    id: "power_outage",
    label: "Тривале відключення світла",
    months: [11, 12, 1, 2],
    weightFor: ({ state }) => (state.equipment.lamp > 0 ? 0.3 : 0),
    when: ({ state }) => state.equipment.lamp > 0,
    describe: () => "Половину місяця не було електрики. Фітолампа й обігрівач працювали через раз.",
    effects: ({ state }) => [
      e("balcony.light", -22, "Лампа світила половину місяця — обладнання не дорівнює гарантії"),
      ...(state.equipment.heater > 0
        ? [e("balcony.tempFloor", -3, "Обігрівач теж простоював, і грудка встигала охолонути")]
        : []),
    ],
  },

  {
    id: "spring_sun",
    label: "Перше яскраве сонце",
    months: [3, 4],
    weightFor: () => 0.45,
    describe: ({ state }) =>
      state.flags.hardenedOff > 0
        ? "Сонце вперше вдарило на повну силу. Загартовані рослини зустріли його спокійно."
        : "Сонце вперше вдарило на повну силу крізь скло — і воно значно яскравіше за будь-яку лампу.",
    effects: ({ state }) => [
      e("balcony.tempAir", 8, "Балкон прогрівся сонцем"),
      ...(state.flags.hardenedOff > 0
        ? forEachPlant(state, (plant, id, c) => [
            e(plantPath(id, "vigor"), 5, `${c.name} загартований — яскраве сонце пішло йому на користь`),
          ])
        : forEachPlant(state, (plant, id, c) => [
            e(
              plantPath(id, "damage"),
              20,
              `Листя ${c.name}, вирощене під лампою, отримало сонячний опік: біло-бурі сухі плями по краю`,
            ),
            e(
              plantPath(id, "leaf"),
              -14,
              "Обпечене листя опадає. Загартовування — це два тижні поступового привчання, і воно безкоштовне",
            ),
          ])),
    ],
  },

  {
    id: "summer_heat",
    label: "Спека на заскленому балконі",
    months: [6, 7, 8],
    weightFor: ({ state }) => 0.5 - (state.flags.ventilated > 0 ? 0.15 : 0),
    describe: ({ state }) =>
      `Той самий парниковий ефект, що рятував узимку, тепер працює проти вас: ` +
      `на балконі ${Math.round(state.balcony.tempAir + 8)} °C.`,
    effects: ({ state }) => {
      const relief = (state.flags.ventilated > 0 ? 0.5 : 1) * (state.equipment.fan > 0 ? 0.7 : 1);
      const peak = state.balcony.tempAir + 8 * relief;
      return [
        e("balcony.tempAir", 8 * relief, "Закритий балкон розжарився на сонці"),
        e("balcony.humidity", -6, "Спека висушила повітря"),
        ...forEachPlant(state, (plant, id, c, sp) => {
          if (peak <= sp.pollenSterileC || plant.flowers < 6) return [];
          return [
            e(
              plantPath(id, "flowers"),
              -plant.flowers * 0.4 * relief,
              `${Math.round(peak)} °C проти порога +${sp.pollenSterileC} для ${sp.label}: ` +
                `пилок стерильний, і квітки обсипаються, скільки їх не запилюй`,
            ),
          ];
        }),
        ...forEachPlant(state, (plant, id, c) => [
          e(
            plantPath(id, "pot.moisture"),
            -10 * relief,
            `У спеку ${c.name} випаровує воду вдвічі швидше`,
          ),
        ]),
      ];
    },
  },

  {
    id: "late_frost",
    label: "Повернення заморозків",
    months: [4, 5],
    weightFor: ({ state }) => (state.flags.outdoorMode > 0 ? 0.4 : 0.08),
    describe: ({ state }) =>
      state.flags.outdoorMode > 0
        ? "Нічний заморозок. Рослини стоять на відкритому балконі й нічим не захищені."
        : "Нічний заморозок за вікном. Скління втримало тепло — на балконі лишився плюс.",
    effects: ({ state }) =>
      state.flags.outdoorMode > 0
        ? [
            e("balcony.tempAir", -9, "Нічний заморозок на відкритому балконі"),
            e("balcony.tempFloor", -8, "Горщики промерзли з усіх боків"),
            ...forEachPlant(state, (plant, id, c, sp) => [
              e(
                plantPath(id, "leaf"),
                -30,
                `Молодий весняний приріст ${c.name} гине за кілька годин мінусу — він ніжніший за зимове листя`,
              ),
              e(
                plantPath(id, "roots"),
                -(sp.rootKillC > 0 ? 16 : 7),
                `Коріння ${sp.label} постраждало: воно не переносить мінус у грудці`,
              ),
            ]),
          ]
        : [e("balcony.tempAir", -2, "Скління втримало заморозок — на балконі лишився плюс")],
  },
];

// ──────────────────────────── Неприємності ────────────────────────────

export const TROUBLE_EVENTS = [
  {
    id: "heating_on",
    label: "Увімкнули опалення",
    months: [10, 11, 12, 1, 2],
    weightFor: ({ state }) => (state.month <= 2 || state.month >= 11 ? 0.6 : 0.35),
    describe: () =>
      "Батареї в квартирі вийшли на повну. Сухе тепле повітря тягне на балкон — і вологість падає різко.",
    effects: ({ state }) => {
      const compensated = state.equipment.humidifier > 0;
      return [
        e(
          "balcony.humidity",
          compensated ? -9 : -20,
          compensated
            ? "Опалення сушить повітря, зволожувач компенсує приблизно половину"
            : "Опалення сушить повітря до рівня пустелі — саме тут починається кліщ",
        ),
        e(
          "balcony.mitePressure",
          compensated ? 6 : 14,
          "Сухе повітря — головний прискорювач розмноження павутинного кліща",
        ),
      ];
    },
  },

  {
    id: "mite_outbreak",
    label: "Спалах павутинного кліща",
    months: [11, 12, 1, 2, 3, 4],
    weightFor: ({ state }) =>
      (state.balcony.humidity < 38 ? 0.55 : 0.12) + state.balcony.mitePressure / 400,
    describe: ({ state }) =>
      `На нижньому боці листя видно дрібну білу крапку й тонке павутиння між гілками. ` +
      `При вологості ${Math.round(state.balcony.humidity)}% колонія подвоюється за два тижні.`,
    effects: ({ state }) =>
      forEachPlant(state, (plant, id, c) => {
        const youngLeaf = plant.leaf > 55;
        return [
          e(
            plantPath(id, "mites"),
            youngLeaf ? 30 : 20,
            youngLeaf
              ? `${c.name} тримає багато молодого листя — кліщ обирає саме його`
              : `Колонія кліща на ${c.name} різко зросла`,
          ),
          plant.mites > 45
            ? e(
                plantPath(id, "leaf"),
                -16,
                "Пошкоджене листя вже не відновиться: кліщ висмоктав клітини, і тканина висохла",
              )
            : null,
        ];
      }),
  },

  {
    id: "aphid_invasion",
    label: "Попелиця й білокрилка",
    months: [3, 4, 5, 6],
    weightFor: ({ state }) => 0.32 + (state.flags.outdoorMode > 0 ? 0.18 : 0),
    describe: () =>
      "На молодих пагонах з'явилися колонії попелиці. Занести її досить одним букетом або відчиненим вікном.",
    effects: ({ state }) =>
      forEachPlant(state, (plant, id, c) => [
        e(plantPath(id, "pests"), 26, `Попелиця обліпила молоді пагони ${c.name}`),
        e(plantPath(id, "leaf"), -6, "Висмоктані пагони деформуються, молоде листя скручується"),
      ]),
  },

  {
    id: "watering_miss",
    label: "Тижнева відсутність",
    months: [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    weightFor: () => 0.22,
    describe: () => "Вас не було вдома тиждень. Поливати не було кому.",
    effects: ({ state }) =>
      forEachPlant(state, (plant, id, c) => {
        // Об'єм горщика — це буфер помилки. Дволітровий NuMex Easter пересихає
        // за той самий тиждень, який дванадцятилітровий Ají Limo не помітить.
        const buffer = clamp(plant.pot.volume / 8, 0.35, 1.4);
        const loss = 26 / buffer / (state.balcony.tempAir > 24 ? 0.7 : 1);
        return [
          e(
            plantPath(id, "pot.moisture"),
            -loss,
            plant.pot.volume <= 3
              ? `${plant.pot.volume} л субстрату — це запас на кілька днів, не на тиждень`
              : `${plant.pot.volume}-літровий горщик пом'якшив пропущений полив`,
          ),
        ];
      }),
  },
];

/** Розігрує події місяця: максимум одна кліматична й одна неприємність. */
export function rollBalconyEvents(ctx, rng) {
  const eligible = (table, idleWeight) =>
    rollEvent(
      table
        .filter((event) => event.months.includes(ctx.state.month))
        .filter((event) => (event.when ? event.when(ctx) : true))
        .map((event) => ({ ...event, weight: event.weightFor(ctx) }))
        .filter((event) => event.weight > 0),
      { ...ctx, idleWeight },
      rng,
    );

  return [eligible(CLIMATE_EVENTS, CLIMATE_IDLE), eligible(TROUBLE_EVENTS, TROUBLE_IDLE)].filter(Boolean);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function round1(v) {
  return Math.round(v * 10) / 10;
}
