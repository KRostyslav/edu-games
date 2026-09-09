/**
 * Адреса гри.
 *
 * У проді всі збірки лежать поруч (`dist/games/<id>/`), тому посилання відносне —
 * і сайт однаково працює з кореня домену та з будь-якої підтеки.
 * У деві кожна гра має власний vite-сервер на фіксованому порті з реєстру.
 *
 * Гілку з портом Vite вирізає з продакшн-бандла статично (`import.meta.env.DEV`),
 * тож локальні адреси фізично не можуть потрапити в деплой.
 *
 * hostname, а не «localhost»: так вітрина працює і з телефона в тій самій мережі.
 */
export function hrefFor(game) {
  if (game.status === "upcoming") return null;
  return import.meta.env.DEV
    ? `${location.protocol}//${location.hostname}:${game.devPort}/`
    : `./games/${game.id}/`;
}
