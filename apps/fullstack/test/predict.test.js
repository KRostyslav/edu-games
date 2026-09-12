/**
 * Predict-задачі перевіряються справжнім Node, а не нашою думкою про нього.
 *
 * Кожен сніпет запускається 3 рази як є і 3 рази з доданим busy-wait на 3 мс
 * наприкінці головного модуля. Другий варіант ловить класичну недетермінованість
 * `setTimeout(0)` проти `setImmediate` у головному модулі: без I/O-колбека їхній
 * порядок залежить від того, чи встиг мінімальний 1 мс таймера минути до першої
 * фази циклу. Такі сніпети гра показувати не має права.
 *
 * Завжди `--input-type=commonjs`: у ESM черга промісів обробляється раніше за
 * nextTick, і відповідь була б іншою.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { LEVEL_LIST, BOSS_LIST } from "../src/data/content.js";

const BUSY_WAIT = "\n;{ const __t = Date.now(); while (Date.now() - __t < 3) {} }\n";

function runNode(code) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=commonjs", "-e", code], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ lines: stdout.split("\n").filter((line) => line !== ""), exitCode, stderr }));
  });
}

const items = [
  ...LEVEL_LIST.filter((level) => level.kind === "predict").map((level) => ({ id: level.id, payload: level.payload })),
  ...BOSS_LIST.flatMap((boss) =>
    boss.phases.filter((phase) => phase.kind === "predict").map((phase) => ({ id: `${boss.id}/${phase.id}`, payload: phase.payload })),
  ),
];

for (const { id, payload } of items) {
  test(`${id}: вивід справжнього Node збігається з еталоном і стабільний`, async () => {
    const variants = [payload.code, payload.code, payload.code, payload.code + BUSY_WAIT, payload.code + BUSY_WAIT, payload.code + BUSY_WAIT];
    const runs = await Promise.all(variants.map(runNode));
    for (const [i, run] of runs.entries()) {
      assert.deepEqual(run.lines, payload.expected, `прогін ${i + 1}${i >= 3 ? " (з busy-wait)" : ""}; stderr: ${run.stderr.slice(0, 300)}`);
      assert.equal(run.exitCode, payload.expectedExit ?? 0, `код виходу, прогін ${i + 1}`);
    }
    for (const trap of payload.distractors ?? []) {
      assert.ok(!runs[0].lines.includes(trap.text), `рядок-пастка «${trap.text}» насправді друкується`);
    }
  });
}
