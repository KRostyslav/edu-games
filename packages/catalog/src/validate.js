/**
 * Перевірка реєстру. Викликається під час імпорту каталогу — і в порталі,
 * і в скрипті збірки, — тому помилка падає в найпершому ж споживачі.
 *
 * Ловить саме ті дві помилки, які кусаються при додаванні сьомої гри:
 * дубль `id` (гра мовчки затерла б чужу теку в dist) і дубль `devPort`
 * (vite узяв би вільний порт, а посилання з порталу в деві повело б у нікуди).
 */

const STATUSES = new Set(["released", "beta", "upcoming"]);

export function assertCatalog(categories, games) {
  const known = new Set(categories.map((category) => category.id));
  const ids = new Set();
  const ports = new Map();

  for (const game of games) {
    const where = `гра "${game.id ?? "?"}"`;

    // id іде і в URL (/games/<id>/), і в ім'я теки — звідси обмеження на символи.
    if (!/^[a-z][a-z0-9-]*$/.test(game.id ?? "")) {
      throw new Error(`${where}: id має бути з [a-z0-9-] і починатися з літери`);
    }
    if (ids.has(game.id)) throw new Error(`Дубль id у каталозі: "${game.id}"`);
    ids.add(game.id);

    if (!known.has(game.category)) {
      throw new Error(`${where}: невідома категорія "${game.category}"`);
    }
    if (!STATUSES.has(game.status)) {
      throw new Error(`${where}: status має бути released | beta | upcoming`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(game.released ?? "")) {
      throw new Error(`${where}: released має бути у форматі YYYY-MM-DD`);
    }

    if (game.status === "upcoming") continue;

    if (ports.has(game.devPort)) {
      throw new Error(`Порт ${game.devPort} уже зайнятий грою "${ports.get(game.devPort)}"`);
    }
    ports.set(game.devPort, game.id);
  }
}
