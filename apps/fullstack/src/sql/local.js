/**
 * Адаптер над екземпляром PGlite: скидання до датасету й виконання SQL.
 * Один і той самий код працює у воркері браузера і в Node-тестах — тож
 * перевірки задач під Node тестують рівно те, що побачить гравець.
 *
 * Скидання робить ROLLBACK (гравець міг лишити відкриту транзакцію),
 * RESET ALL (і SET enable_seqscan = off, яким можна «обдурити» перевірку
 * плану) та перестворює схему public. Часовий пояс — завжди UTC: інакше
 * PGlite бере його з браузера, і дати в результатах різнилися б між гравцями.
 */

export const RESET_SQL =
  "ROLLBACK; RESET ALL; SET TimeZone TO 'UTC'; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; SET search_path TO public;";

export function createLocalDb(PGliteClass, datasets = {}) {
  let db = null;

  async function ensure() {
    if (!db) db = await PGliteClass.create();
    return db;
  }

  return {
    async reset(datasetId) {
      const instance = await ensure();
      await instance.exec(RESET_SQL);
      if (datasetId) {
        const dataset = datasets[datasetId];
        if (!dataset) throw new Error(`Невідомий датасет: ${datasetId}`);
        await instance.exec(dataset.setup);
      }
      return null;
    },
    /** Кілька інструкцій за раз; кожен результат — { fields, rows (масиви), affected }. */
    async exec(sql) {
      const instance = await ensure();
      const results = await instance.exec(sql, { rowMode: "array" });
      return results.map((result) => ({
        fields: (result.fields ?? []).map((field) => field.name),
        rows: result.rows ?? [],
        affected: result.affectedRows ?? 0,
      }));
    },
    async close() {
      await db?.close();
      db = null;
    },
  };
}
