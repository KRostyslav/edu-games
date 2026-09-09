/**
 * Фаза клімату: у що перетворюється календар на конкретному балконі.
 *
 * Тут немає випадковості — усе детерміновано. Гравець бачить прогноз ще до
 * ходу й може підготуватися; несподіванки додає лише фаза подій.
 *
 * Фаза виставляє АБСОЛЮТНІ значення через delta = ціль − поточне. Так зроблено
 * навмисно: температура на балконі не «змінюється на −3», вона просто така,
 * яка є, і рахується з нуля щомісяця. Причина кожного ефекту несе весь
 * розрахунок, тому гравець бачить, з чого склалося число.
 */

import { makeEffect } from "@edu/sim-core";
import { GLASS_TRANSMISSION, OUTDOOR_TEMP, PHOTOPERIOD, SOLAR_GAIN } from "../data/calendar.js";
import { makeSource } from "./source.js";

/** Місяці опалювального сезону: батареї сушать повітря в квартирі й на балконі. */
const HEATING_MONTHS = [10, 11, 12, 1, 2, 3];

/**
 * Скільки градусів балкон бере від стіни квартири.
 *
 * Це те, що робить засклений балкон придатним для зимівлі взагалі: він не
 * автономний, він гріється від житла. Саме тому в січні на ньому близько +4,
 * а не вуличні −3.
 *
 * Поза опалювальним сезоном цього подарунка немає — стіна кімнатної
 * температури влітку балкон уже не гріє, вона його швидше остуджує.
 */
const wallBonus = (month) => (HEATING_MONTHS.includes(month) ? 5 : 1);

/** Наскільки грудка на бетоні холодніша за повітря. Пінопласт майже знімає різницю. */
const FLOOR_DROP_BARE = 4.5;
const FLOOR_DROP_STAND = 1;

/** Тривалість роботи фітолампи за таймером, годин на добу. */
const LAMP_HOURS = 12;

/** Годин світла, що відповідають повній шкалі 100. */
const LIGHT_SCALE = 14;

/**
 * Прогноз на місяць — те саме, що порахує фаза, але без ефектів.
 * Панель показує це гравцеві ДО ходу: рішення має ухвалюватися зі знанням умов.
 */
export function forecast(state, month) {
  const outdoor = OUTDOOR_TEMP[month];
  const daylight = PHOTOPERIOD[month];

  const tempAir = airTemperature(state, month);
  const tempFloor = floorTemperature(state, tempAir);

  return {
    outdoor,
    daylight,
    tempAir: round1(tempAir),
    tempFloor: round1(tempFloor),
    lightHours: round1(effectiveLightHours(state, month)),
    lamp: state.equipment.lamp > 0,
  };
}

function airTemperature(state, month) {
  // Винесені на відкритий балкон рослини живуть за вуличною температурою —
  // скління більше не працює.
  if (state.flags.outdoorMode > 0) return OUTDOOR_TEMP[month];

  // Сонячний нагрів — денний максимум, тому в середньодобову йде частково.
  let target = OUTDOOR_TEMP[month] + SOLAR_GAIN[month] * 0.6 + wallBonus(month);

  if (state.equipment.insulation > 0) target += 3;
  if (state.flags.ventilated > 0) target -= 4;
  // Обігрівач не гріє балкон до кімнатної температури — він лише не дає
  // опуститися нижче безпечного порога.
  if (state.equipment.heater > 0) target = Math.max(target, 12);

  return target;
}

function floorTemperature(state, tempAir) {
  const drop = state.equipment.potStand > 0 ? FLOOR_DROP_STAND : FLOOR_DROP_BARE;
  return tempAir - drop;
}

function effectiveLightHours(state, month) {
  const throughGlass = PHOTOPERIOD[month] * GLASS_TRANSMISSION[month];
  // Фітолампа не додається до сонця, а задає нижню межу: вона світить за
  // таймером незалежно від того, що там за вікном.
  return state.equipment.lamp > 0 ? Math.max(throughGlass, LAMP_HOURS * 0.92) : throughGlass;
}

function targetHumidity(state, month, tempAir) {
  let target = 55;
  if (HEATING_MONTHS.includes(month)) target -= 15;
  if (state.equipment.heater > 0) target -= 10;
  if (state.equipment.humidifier > 0) target += 18;
  if (tempAir > 32) target -= 8;
  if (state.flags.ventilated > 0) target += 4;
  return clamp(target, 12, 92);
}

function targetAirflow(state) {
  let target = 30;
  if (state.equipment.fan > 0) target += 28;
  if (state.flags.ventilated > 0) target += 22;
  if (state.flags.outdoorMode > 0) target = 85;
  return clamp(target, 0, 100);
}

/** Фаза для рушія. */
export function climatePhase({ state, meta }) {
  const month = state.month;
  const out = [];
  const source = makeSource({ kind: "climate" });
  const push = (target, value, reason) =>
    out.push(makeEffect({ target, delta: value - get(state, target), reason, source, tone: "neutral" }));

  const outdoor = OUTDOOR_TEMP[month];
  const daylight = PHOTOPERIOD[month];

  // ── Температура повітря ──
  const tempAir = airTemperature(state, month);
  push(
    "balcony.tempAir",
    tempAir,
    state.flags.outdoorMode > 0
      ? `Рослини стоять на відкритому балконі, тож температура дорівнює вуличній: ${round1(outdoor)} °C`
      : `За вікном ${round1(outdoor)} °C. Сонце крізь скло додає ${round1(SOLAR_GAIN[month] * 0.6)}, ` +
        `стіна квартири ще ${wallBonus(month)}` +
        (state.equipment.insulation > 0 ? ", утеплені щілини +3" : "") +
        (state.flags.ventilated > 0 ? ", провітрювання −4" : "") +
        (state.equipment.heater > 0 && tempAir <= 12.01
          ? ". Обігрівач не дає опуститися нижче +12"
          : "") +
        ` — на балконі ${round1(tempAir)} °C`,
  );

  // ── Температура кореневої грудки ──
  // Найважливіше число зими: рослина гине по корінню, а не по кроні.
  const tempFloor = floorTemperature(state, tempAir);
  push(
    "balcony.tempFloor",
    tempFloor,
    state.equipment.potStand > 0
      ? `Горщики стоять на пінопласті: у грудці ${round1(tempFloor)} °C — лише на градус холодніше за повітря`
      : `Горщики стоять просто на бетоні, і він тягне тепло знизу: у грудці ${round1(tempFloor)} °C ` +
        `проти ${round1(tempAir)} °C у повітрі`,
  );

  // ── Світло ──
  const hours = effectiveLightHours(state, month);
  const light = clamp((hours / LIGHT_SCALE) * 100, 0, 100);
  push(
    "balcony.light",
    light,
    state.equipment.lamp > 0
      ? `Фітолампа світить ${LAMP_HOURS} годин за таймером — освітленість тримається на ${Math.round(light)} ` +
        `незалежно від того, що день триває лише ${daylight} год`
      : `День триває ${daylight} год, крізь скло доходить ${Math.round(GLASS_TRANSMISSION[month] * 100)}% — ` +
        `рослина отримує ${round1(hours)} год повноцінного світла`,
  );

  // ── Вологість повітря ──
  const humidity = targetHumidity(state, month, tempAir);
  push(
    "balcony.humidity",
    humidity,
    HEATING_MONTHS.includes(month)
      ? `Опалювальний сезон сушить повітря` +
        (state.equipment.heater > 0 ? ", обігрівач на балконі сушить ще сильніше" : "") +
        (state.equipment.humidifier > 0 ? ", зволожувач частково це компенсує" : "") +
        ` — вологість ${Math.round(humidity)}%`
      : `Вологість повітря ${Math.round(humidity)}%`,
  );

  // ── Рух повітря ──
  const airflow = targetAirflow(state);
  push(
    "balcony.airflow",
    airflow,
    airflow < 35
      ? `Повітря на закритому балконі стоїть (${Math.round(airflow)}) — застій сприяє хворобам і кліщу`
      : `Рух повітря ${Math.round(airflow)}`,
  );

  // ── Фоновий тиск кліща ──
  // Кліщ живе на балконі, а не в окремому горщику: він переходить із рослини
  // на рослину, і сухе повітря розганяє його популяцію в рази.
  const miteDrift = humidity < 40 ? 5 : humidity < 50 ? 1 : -3;
  if (miteDrift !== 0) {
    out.push(
      makeEffect({
        target: "balcony.mitePressure",
        delta: miteDrift,
        reason:
          humidity < 40
            ? `При вологості ${Math.round(humidity)}% павутинний кліщ розмножується найшвидше — покоління за тиждень`
            : humidity < 50
              ? "Повітря сухувате — кліщ повільно накопичується"
              : "Вологе повітря стримує розмноження кліща",
        source,
      }),
    );
  }

  meta.forecast = {
    outdoor: round1(outdoor),
    daylight,
    tempAir: round1(tempAir),
    tempFloor: round1(tempFloor),
    lightHours: round1(hours),
    humidity: Math.round(humidity),
  };

  return out;
}

function get(state, path) {
  return path.split(".").reduce((node, key) => node[key], state);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function round1(v) {
  return Math.round(v * 10) / 10;
}
