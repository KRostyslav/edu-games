import { makeEffect } from "@edu/sim-core";

/**
 * Природні процеси — те, що відбувається з кущем саме по собі, без гравця.
 *
 * Це навчально найважливіший шар: він показує, що бездіяльність — теж рішення.
 * Хвороби наростають самі, волога випаровується сама, а запас поживних речовин
 * сам не поповнюється.
 */

const eff = (target, delta, reason, tone) =>
  makeEffect({ target, delta, reason, source: "natural", tone });

/** Місяці, коли на кущі є листя, а отже — працює фотосинтез і ростуть хвороби. */
const VEGETATION = [4, 5, 6, 7, 8, 9];

export function naturalProcesses({ state }) {
  const month = state.month;
  const out = [];

  // ── Волога випаровується завжди, коли ґрунт не мерзлий ──
  if (month >= 3 && month <= 10) {
    const loss = month >= 6 && month <= 8 ? 16 : 9;
    out.push(eff("soil.moisture", -loss, "Волога випаровується з ґрунту й витрачається кущем"));
  }

  // ── Хвороби наростають самі, якщо їх не стримувати ──
  if (VEGETATION.includes(month)) {
    const wet = state.soil.moisture > 60;
    const dense = state.vine.canopy > 65;
    out.push(
      eff(
        "disease.mildew",
        6 + (wet ? 6 : 0) + (dense ? 4 : 0),
        wet || dense
          ? "Мілдью розвивається сам: волого й загущено — саме ті умови, яких він потребує"
          : "Інфекційний фон мілдью повільно наростає",
      ),
      eff("disease.oidium", 6, "Оїдіум розвивається на кущі самостійно"),
    );
  }

  // ── Осінь: листя віддає запас у деревину ──
  if (month === 10) {
    const transfer = Math.round(state.vine.canopy * 0.25);
    out.push(
      eff(
        "vine.reserves",
        transfer,
        `Листя ще працює і жене поживні речовини в багаторічну деревину (+${transfer} за рахунок крони)`,
        "good",
      ),
      eff("vine.canopy", -35, "Листя жовтіє й опадає — сезон фотосинтезу завершується"),
      eff("vine.woodRipeness", 6, "Лоза продовжує дерев'яніти"),
    );
  }

  // ── Листопад: загартування, з якого й береться морозостійкість ──
  // Морозостійкість не накопичується роками — вона набувається заново щоосені
  // і повністю втрачається навесні. Її джерело одне: визріла деревина.
  if (month === 11) {
    const gain = Math.round(state.vine.woodRipeness * 0.45);
    out.push(
      eff("vine.canopy", -100, "Листя опало повністю, кущ входить у спокій"),
      eff(
        "vine.hardiness",
        gain,
        `Загартування: морозостійкість виростає з визрівання лози (визрівання ${Math.round(
          state.vine.woodRipeness,
        )} → +${gain}). Невизріла лоза не загартовується взагалі`,
        "good",
      ),
    );
  }

  // ── Зима: повільна втрата загартування до кінця спокою ──
  if (month === 2) {
    out.push(
      eff("vine.hardiness", -8, "Кущ виходить із глибокого спокою й поступово втрачає загартування"),
    );
  }

  // ── Весна: старт росту з осіннього запасу ──
  if (month === 4) {
    const start = Math.round(state.vine.reserves * 0.3 + state.soil.nitrogen * 0.15);
    out.push(
      eff(
        "vine.canopy",
        start,
        `Кущ розпускається за рахунок торішнього запасу (запас ${Math.round(
          state.vine.reserves,
        )}) — листя ще немає, живитися більше нічим`,
        "good",
      ),
      eff("vine.reserves", -22, "Запас витрачається на розпускання й перший приріст"),
      eff("vine.hardiness", -100, "Кущ вийшов зі спокою — морозостійкості більше немає до осені"),
    );
  }

  if (month === 5) {
    const growth = Math.round(12 + state.soil.nitrogen * 0.2 + state.soil.moisture * 0.1);
    out.push(
      eff("vine.canopy", growth, "Пагони ростуть, листовий апарат нарощується"),
      eff("vine.vigor", 6, "Активна вегетація"),
    );
  }

  // ── Червень: зав'язування ягід. Тут вирішується кількість ──
  if (month === 6) {
    const base = Math.round(
      35 + state.vine.canopy * 0.2 + state.soil.moisture * 0.1 - Math.max(0, state.vine.load - 60) * 0.3,
    );
    out.push(
      eff(
        "crop.setRate",
        base,
        `Зав'язування ягід: базовий рівень ${base}% визначений станом крони (${Math.round(
          state.vine.canopy,
        )}) і вологою (${Math.round(state.soil.moisture)})`,
        "good",
      ),
      eff("crop.sanitary", 75, "Грона зав'язалися чистими — далі все залежить від захисту", "good"),
    );
  }

  // ── Липень: налив ягід ──
  if (month === 7) {
    const size = Math.round(20 + state.soil.moisture * 0.25 + state.vine.canopy * 0.1);
    out.push(
      eff(
        "crop.berrySize",
        size,
        `Ягода наливається. Розмір визначається вологою (${Math.round(
          state.soil.moisture,
        )}) — саме зараз і більше ніколи`,
        "good",
      ),
    );
  }

  // ── Серпень: цукор і одночасне визрівання лози ──
  if (month === 8) {
    const loadPenalty = Math.max(0, state.vine.load - 60) * 0.35;
    const sugarGain = Math.round(18 + state.vine.canopy * 0.15 - loadPenalty);
    out.push(
      eff(
        "crop.sugar",
        sugarGain,
        loadPenalty > 3
          ? `Накопичення цукру. Перевантаження (${Math.round(
              state.vine.load,
            )}) забирає частину: кущ не встигає налити всі грона`
          : "Накопичення цукру в ягодах",
        "good",
      ),
      eff(
        "vine.woodRipeness",
        Math.round(10 - loadPenalty * 0.5),
        "Лоза дерев'яніє паралельно з наливом ягід — кущ ділить ресурс між урожаєм і зимівлею",
      ),
    );
  }

  if (month === 9) {
    out.push(
      eff("crop.sugar", 8, "Останній тиждень перед збором — ягода добирає цукор", "good"),
      eff("vine.woodRipeness", 8, "Лоза продовжує визрівати"),
    );
    if (state.disease.rot > 45) {
      out.push(
        eff(
          "crop.sanitary",
          -Math.round(state.disease.rot * 0.3),
          `Сіра гниль перед збором вражає грона (рівень гнилі ${Math.round(state.disease.rot)})`,
        ),
      );
    }
  }

  // ── Хвороби б'ють по врожаю тоді, коли врожай уже є ──
  if (month >= 6 && month <= 9) {
    const pressure = state.disease.mildew + state.disease.oidium;
    if (pressure > 90) {
      out.push(
        eff(
          "crop.sanitary",
          -Math.round((pressure - 90) * 0.4),
          `Хвороби вийшли з-під контролю (мілдью ${Math.round(
            state.disease.mildew,
          )} + оїдіум ${Math.round(state.disease.oidium)}) і псують грона`,
        ),
        eff("vine.canopy", -Math.round((pressure - 90) * 0.2), "Уражене листя відмирає"),
      );
    }
  }

  return out;
}
