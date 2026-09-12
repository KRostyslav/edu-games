/**
 * Складає один статичний сайт із незалежно зібраних застосунків:
 * портал лягає в корінь, кожна гра — в /games/<id>/.
 *
 * Без залежностей, лише node:fs. Запускати ПІСЛЯ `turbo run build`.
 * Каталог імпортується шляхом, а не за іменем пакета: кореневий package.json
 * не мусить залежати від воркспейсів заради одного скрипта.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { GAMES } from "../packages/catalog/src/index.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "dist");

const portal = join(root, "apps", "portal", "dist");
if (!existsSync(portal)) die(`немає ${relative(root, portal)}. Спершу: pnpm build`);

// Тека чиститься повністю: гра, прибрана з реєстру, мусить зникнути й із сайту,
// інакше /games/<id>/ лишався б у видачі назавжди.
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(portal, out, { recursive: true });
console.log("portal      → dist/");

let copied = 0;
for (const game of GAMES) {
  if (game.status === "upcoming") continue; // гри ще немає — і збірки теж
  const src = join(root, game.dir, "dist");
  if (!existsSync(src)) die(`немає ${relative(root, src)} для «${game.title}». Спершу: pnpm build`);

  cpSync(src, join(out, "games", game.id), { recursive: true });
  console.log(`${game.id.padEnd(11)} → dist/games/${game.id}/`);
  copied += 1;
}

console.log(`\nГотово: портал + ${copied} ${gamesWord(copied)} у dist/. Хостити як статику, з кореня.`);

/** 1 гра · 2–4 гри · 5+ ігор — з урахуванням 11–14. */
function gamesWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "гра";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "гри";
  return "ігор";
}

function die(message) {
  console.error(`build-site: ${message}`);
  process.exit(1);
}
