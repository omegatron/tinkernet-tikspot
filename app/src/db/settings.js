// Tiny key/value settings helpers over the `settings` table.

export function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value == null ? null : String(value));
}

export function getBool(db, key, fallback = false) {
  const v = getSetting(db, key, null);
  if (v == null) return fallback;
  return v === '1' || v === 'true';
}

export function getJSON(db, key, fallback = null) {
  const v = getSetting(db, key, null);
  if (v == null) return fallback;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}
