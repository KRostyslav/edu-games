/**
 * Фаза окремої рослини.
 *
 * У виноградника фенофаза одна на всіх — вона задана календарем. Тут інакше:
 * на одному балконі, за однакової температури, у березні халапеньо вже пускає
 * листя, а хабанеро ще стоїть у спокої, бо йому потрібно +18, а не +14.
 * Тому фаза рахується для кожного горщика окремо — з його власного стану.
 */

import { speciesOf } from "../data/plants.data.js";
import { SEASON_MONTHS } from "../data/calendar.js";

export function phaseOf(plant, state, cultivarId, month) {
  if (plant.alive <= 0) {
    return {
      key: "dead",
      phase: "Рослина загинула",
      description: plant.death
        ? `${plant.death.cause}. Розтин показує, коли це насправді вирішилося.`
        : "Горщик порожній.",
    };
  }

  const sp = speciesOf(cultivarId);
  const { tempAir, light } = state.balcony;
  const springSide = [2, 3, 4, 5].includes(month);

  if (plant.dormancy >= 60) {
    return {
      key: "deep",
      phase: "Глибокий спокій",
      description:
        `Ріст зупинено повністю. Рослина витрачає лише запас стебла і майже не бере воду — ` +
        `будь-який зайвий полив зараз небезпечніший за посуху.`,
    };
  }

  if (plant.dormancy >= 25) {
    return springSide
      ? {
          key: "waking",
          phase: "Виходить зі спокою",
          description:
            `Умови вже майже достатні (${sp.label} рушає при +${sp.wakeTemp} °C і світлі ${sp.wakeLight}). ` +
            `Найкращий момент для пересадки: коріння вже росте, а листової маси ще мало.`,
        }
      : {
          key: "rest",
          phase: "Спокій",
          description:
            `Рослина пригальмувала ріст і живе на запасі. Полив — мінімальний, азот не потрібен зовсім.`,
        };
  }

  if (plant.ripeness >= 25) {
    return {
      key: "ripening",
      phase: "Визрівання плодів",
      description:
        `Плоди набирають колір і гостроту. Розмір уже не зміниться — зараз вирішується лише те, ` +
        `скільки з них встигне забарвитися до кінця сезону.`,
    };
  }

  if (plant.fruitSet >= 12) {
    return {
      key: "filling",
      phase: "Налив плодів",
      description:
        `Зав'язь росте й тягне максимум води, калію та кальцію. Нерівний полив зараз дає вершинну гниль.`,
    };
  }

  if (plant.flowers >= 12) {
    return {
      key: "flowering",
      phase: "Цвітіння",
      description:
        `Квітки живуть 2–3 дні. На закритому балконі немає ні вітру, ні комах — ` +
        `усе, що не запилили руками, обсиплеться.`,
    };
  }

  if (tempAir >= sp.wakeTemp && light >= sp.wakeLight) {
    return {
      key: "growth",
      phase: "Вегетативний ріст",
      description:
        `Рослина будує листя й гілки — апарат, яким годуватиме майбутні плоди. Це фаза азоту.`,
    };
  }

  return {
    key: "slow",
    phase: "Сповільнений ріст",
    description:
      tempAir < sp.wakeTemp
        ? `Для ${sp.label} ще холодно: потрібно +${sp.wakeTemp} °C, а на балконі ${Math.round(tempAir)}.`
        : `Світла ще мало: потрібно ${sp.wakeLight}, а є ${Math.round(light)}.`,
  };
}

/** Чи лишилося місяців до кінця сезону — потрібно для попереджень про визрівання. */
export function monthsLeftInSeason(month) {
  return SEASON_MONTHS.length - 1 - SEASON_MONTHS.indexOf(month);
}
