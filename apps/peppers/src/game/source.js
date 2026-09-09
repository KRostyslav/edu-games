/**
 * Джерело ефекту.
 *
 * Рушій зберігає `source` як звичайний рядок, і цього достатньо для однієї
 * рослини. Але тут горщиків чотири: політий халапеньо й політий хабанеро дали б
 * однаковий source і склеїлися б в одну купу в розборі місяця. Тому джерело
 * кодується композитним ключем:
 *
 *   "action:water_dormant@habanero"   дія гравця над конкретним горщиком
 *   "action:grow_light"               дія над балконом — рослини не має
 *   "climate"                         детермінований розрахунок середовища
 *   "natural@ajiLimo"                 рослина живе сама
 *   "event:cold_snap"                 подія балкона
 *   "death:root_rot@habanero"         вирок
 */

export function makeSource({ kind, id = null, plantId = null }) {
  const head = id ? `${kind}:${id}` : kind;
  return plantId ? `${head}@${plantId}` : head;
}

export function parseSource(source) {
  const [head, plantId = null] = String(source).split("@");
  const [kind, id = null] = head.split(":");
  return { kind, id, plantId };
}

/** Чи належить ефект діям гравця — розбір місяця ділить колонки саме так. */
export const isPlayerAction = (source) => parseSource(source).kind === "action";
