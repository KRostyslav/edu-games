import { makeEffect } from "@edu/sim-core";

/**
 * Погода й ризикові події.
 *
 * Кожна подія пояснює не лише що сталося, а й чому наслідки саме такі —
 * і чи можна було підготуватися. Погода в грі не «карає випадково»:
 * вона перевіряє, наскільки кущ був до неї готовий.
 */

const eff = (target, delta, reason, tone) =>
  makeEffect({ target, delta, reason, source: "weather", tone });

export const WEATHER_EVENTS = [
  {
    id: "hard_frost",
    label: "Сильні морози",
    months: [12, 1, 2],
    weightFor: (ctx) => (ctx.region.winterMinC <= -20 ? 0.55 : 0.2),
    describe: (ctx) => `Температура впала до ${ctx.region.winterMinC} °C.`,
    effects: (ctx) => {
      const { state, region } = ctx;

      // Показник морозостійкості переводиться в градуси, які кущ реально
      // витримує. Шкала 0–100 відповідає приблизно −10…−30 °C.
      const tolerable = 10 + state.vine.hardiness * 0.2;
      const deficit = Math.abs(region.winterMinC) - tolerable;

      const out = [];

      if (deficit <= 0) {
        out.push(
          eff(
            "vine.budsAlive",
            0,
            `Мороз пережито без втрат: кущ витримує до −${Math.round(tolerable)} °C${
              state.flags.covered ? " разом з укриттям" : " навіть без укриття"
            }`,
            "good",
          ),
        );
      } else {
        // Квадратична залежність: невелика нестача морозостійкості майже нічого
        // не коштує, а суттєва — вбиває кущ. Саме так поводиться справжня лоза.
        const damage = Math.round(deficit * deficit * 1.2);
        out.push(
          eff(
            "vine.budsAlive",
            -damage,
            `Кущ витримує до −${Math.round(tolerable)} °C, а було ${region.winterMinC} °C. Не вистачило ${Math.round(
              deficit,
            )} градусів (визрівання лози ${Math.round(state.vine.woodRipeness)}, ${
              state.flags.covered ? "укриття є" : "кущ не вкритий"
            })`,
          ),
        );
      }

      // Коріння захищає не укриття, а волога в ґрунті: суха земля промерзає глибше.
      if (state.soil.moisture < 30) {
        out.push(
          eff(
            "vine.reserves",
            -12,
            "Ґрунт пішов у зиму сухим — суха земля промерзає глибше, і коріння підмерзло",
          ),
        );
      }

      return out;
    },
  },

  {
    id: "thaw",
    label: "Тривала відлига",
    months: [1, 2],
    weightFor: (ctx) => (ctx.state.flags.covered ? 0.4 : 0.15),
    describe: () => "Кілька теплих днів поспіль, під укриттям стало волого.",
    effects: (ctx) => {
      if (!ctx.state.flags.covered) {
        return [eff("vine.hardiness", -5, "Відлига частково знімає загартування лози")];
      }
      // Провітрювання цього місяця — єдина реальна протидія випріванню.
      const ventilated = ctx.actions.some((a) => a.id === "ventilate_cover");
      return ventilated
        ? [
            eff(
              "vine.budsAlive",
              2,
              "Укриття було провітрене — волога вийшла, вічка не задихнулися",
              "good",
            ),
          ]
        : [
            eff(
              "vine.budsAlive",
              -14,
              "Під непровітреним укриттям вічка випріли: тепло, волого й немає доступу повітря",
            ),
            eff("disease.rot", 10, "У теплій вологій задусі під укриттям розвинулася пліснява"),
          ];
    },
  },

  {
    id: "spring_frost",
    label: "Весняний заморозок",
    months: [4, 5],
    weightFor: (ctx) => ctx.region.springFrostRisk,
    describe: () => "Уночі температура опустилася нижче нуля, а приріст уже зелений.",
    effects: (ctx) => {
      if (ctx.state.flags.frostGuard) {
        return [
          eff(
            "vine.budsAlive",
            -3,
            "Заморозок був, але агроволокно й димлення втримали температуру біля нуля — втрати мінімальні",
            "good",
          ),
        ];
      }
      return [
        eff("vine.budsAlive", -22, "Молодий приріст гине вже за −1 °C, а захисту не було"),
        eff(
          "vine.load",
          -10,
          "Кущ відросте із запасних вічок, але вони вдвічі менш плодоносні",
        ),
      ];
    },
  },

  {
    id: "long_rain",
    label: "Затяжні дощі",
    months: [5, 6, 7],
    weightFor: (ctx) => ctx.region.rainRisk,
    describe: () => "Тиждень дощів і туманів — вода на листі не висихає.",
    effects: (ctx) => {
      // Спора мілдью проростає лише в краплі води, тому дощ множить саме її.
      const canopyPenalty = ctx.state.vine.canopy > 65 ? 10 : 0;
      return [
        eff(
          "disease.mildew",
          22 + canopyPenalty,
          canopyPenalty
            ? "Дощ дав мілдью воду для проростання спор, а загущена крона не просихає — спалах сильніший"
            : "Дощ дав мілдью воду для проростання спор",
        ),
        eff("soil.moisture", 18, "Ґрунт наситився дощовою водою"),
        eff("disease.rot", 10, "Постійна вологість сприяє сірій гнилі"),
      ];
    },
  },

  {
    id: "heat_wave",
    label: "Хвиля спеки",
    months: [6, 7, 8],
    weightFor: (ctx) => (ctx.region.droughtRisk > 0.4 ? 0.45 : 0.25),
    describe: () => "Кілька тижнів за +33 °C без дощу.",
    effects: (ctx) => {
      const dry = ctx.state.soil.moisture < 35;
      return [
        eff("soil.moisture", -25, "Спека швидко висушила ґрунт"),
        eff("disease.oidium", 18, "Оїдіум розвивається саме в спеку — на відміну від мілдью, дощ йому не потрібен"),
        ...(dry
          ? [
              eff(
                "crop.berrySize",
                -12,
                "Ягода зупинилася в рості: у сухому ґрунті кущ не має чим її наливати",
              ),
            ]
          : [
              eff(
                "crop.sugar",
                4,
                "Сонця багато, а вологи в ґрунті вистачає — цукор накопичується швидше",
                "good",
              ),
            ]),
      ];
    },
  },

  {
    id: "drought",
    label: "Посуха",
    months: [6, 7, 8],
    weightFor: (ctx) => ctx.region.droughtRisk,
    describe: () => "Місяць без опадів.",
    effects: (ctx) => [
      eff("soil.moisture", -30, "Запас вологи в ґрунті вичерпується"),
      ...(ctx.state.soil.moisture < 30
        ? [
            eff("vine.canopy", -12, "Листя в'яне — кущ скидає частину крони, щоб зменшити випаровування"),
            eff("crop.berrySize", -10, "Без води ягода не наливається"),
          ]
        : []),
    ],
  },

  {
    id: "hail",
    label: "Град",
    months: [5, 6, 7],
    weightFor: () => 0.08,
    describe: () => "Короткочасний град побив листя й грона.",
    effects: () => [
      eff("vine.canopy", -18, "Град порвав листя — фотосинтезувати стало нічим"),
      eff("crop.sanitary", -20, "Пошкоджена шкірка ягід — відкриті ворота для інфекції"),
      eff("disease.rot", 22, "Сіра гниль заходить у кожну ранку на ягоді"),
    ],
  },

  {
    id: "wasps",
    label: "Наліт ос",
    months: [8, 9],
    weightFor: (ctx) => (ctx.state.disease.pests > 20 ? 0.5 : 0.25),
    describe: () => "На солодкі грона злетілися оси.",
    effects: (ctx) =>
      ctx.state.disease.pests < 12
        ? [eff("crop.sanitary", -3, "Сітка втримала ос — пошкоджень майже немає", "good")]
        : [
            eff("crop.sanitary", -18, "Оси прогризли шкірку ягід"),
            eff("disease.rot", 16, "Через прокуси в ягоду одразу заходить сіра гниль"),
          ],
  },

  {
    id: "warm_autumn",
    label: "Тепла суха осінь",
    months: [9, 10],
    weightFor: () => 0.35,
    describe: () => "Сонячна погода без дощів затрималася до пізньої осені.",
    effects: () => [
      eff("vine.woodRipeness", 10, "Тепла осінь дала лозі час добре визріти", "good"),
      eff("crop.sugar", 5, "Ягода добирає цукор на сонці", "good"),
    ],
  },

  {
    id: "early_frost",
    label: "Ранні осінні заморозки",
    months: [10],
    weightFor: (ctx) => (ctx.region.covering === "required" ? 0.3 : 0.12),
    describe: () => "Мороз ударив раніше звичного, листя облетіло за одну ніч.",
    effects: () => [
      eff("vine.canopy", -30, "Листя загинуло від морозу"),
      eff(
        "vine.reserves",
        -10,
        "Листя облетіло рано — кущ не встиг перекачати всі поживні речовини в багаторічну деревину",
      ),
    ],
  },
];

/** Обирає подію місяця, враховуючи регіон і стан куща. */
export function rollWeather(ctx, rng) {
  const eligible = WEATHER_EVENTS.filter((event) => event.months.includes(ctx.state.month)).map(
    (event) => ({ ...event, weight: event.weightFor(ctx) }),
  );
  if (eligible.length === 0) return null;

  const total = eligible.reduce((sum, e) => sum + e.weight, 0);
  // Добираємо «спокійний місяць» — без нього подія траплялася б завжди
  // і перестала б сприйматися як подія.
  const calmWeight = Math.max(0.35, 1.2 - total);
  let roll = rng.next() * (total + calmWeight);

  for (const event of eligible) {
    roll -= event.weight;
    if (roll <= 0) return event;
  }
  return null;
}
