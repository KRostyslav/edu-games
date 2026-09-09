/** Збереження прогресу в localStorage під неймспейсом гри. */

export function createStorage(namespace, version = 1) {
  const key = `edu-sim:${namespace}`;

  return {
    save(data) {
      try {
        localStorage.setItem(key, JSON.stringify({ version, savedAt: Date.now(), data }));
        return true;
      } catch {
        // Приватний режим або переповнене сховище — гра має працювати й без збереження.
        return false;
      }
    },

    load() {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // Стара версія збереження несумісна з новою моделлю — краще почати заново,
        // ніж відновити стан, який рушій прочитає неправильно.
        if (parsed.version !== version) return null;
        return parsed.data;
      } catch {
        return null;
      }
    },

    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ігноруємо */
      }
    },
  };
}
