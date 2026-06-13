// Design persistence helpers (the `designs` table). Exactly one design is active
// at a time; the live portal renders the active one. The design MODEL (theme +
// blocks JSON) is stored in the `grapes_json` column.

import { defaultDesign, normalizeDesign } from '../design/model.js';

export function getActiveDesign(db) {
  return db.prepare('SELECT * FROM designs WHERE is_active = 1 ORDER BY id LIMIT 1').get() ?? null;
}

export function listDesigns(db) {
  return db
    .prepare('SELECT id, name, is_active, version, updated_at FROM designs ORDER BY id')
    .all();
}

export function getDesign(db, id) {
  return db.prepare('SELECT * FROM designs WHERE id = ?').get(id) ?? null;
}

// Parse a design row's stored JSON into a normalised model (theme + blocks).
export function designModel(row) {
  if (!row || !row.grapes_json) return defaultDesign();
  try {
    return normalizeDesign(JSON.parse(row.grapes_json));
  } catch {
    return defaultDesign();
  }
}

export function activeModel(db) {
  return designModel(getActiveDesign(db));
}

export function activateDesign(db, id) {
  const tx = db.transaction((designId) => {
    db.prepare('UPDATE designs SET is_active = 0 WHERE is_active = 1').run();
    db.prepare('UPDATE designs SET is_active = 1 WHERE id = ?').run(designId);
  });
  tx(id);
}

// Create a new design or update an existing one (by id). Returns its id.
export function saveDesign(db, { id, name, grapes_json, html, css, activate }) {
  if (id) {
    db.prepare(
      `UPDATE designs
         SET name = COALESCE(@name, name),
             grapes_json = COALESCE(@grapes_json, grapes_json),
             html = COALESCE(@html, html),
             css = COALESCE(@css, css),
             version = version + 1,
             updated_at = datetime('now')
       WHERE id = @id`,
    ).run({
      id,
      name: name ?? null,
      grapes_json: grapes_json ?? null,
      html: html ?? null,
      css: css ?? null,
    });
    if (activate) activateDesign(db, id);
    return id;
  }
  const info = db
    .prepare(
      `INSERT INTO designs (name, grapes_json, html, css, is_active)
       VALUES (@name, @grapes_json, @html, @css, 0)`,
    )
    .run({
      name: name ?? 'Untitled',
      grapes_json: grapes_json ?? null,
      html: html ?? '',
      css: css ?? '',
    });
  const newId = info.lastInsertRowid;
  if (activate) activateDesign(db, newId);
  return newId;
}

// Seed the default design as the active one if no designs exist yet.
export function ensureDefaultDesign(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM designs').get().n;
  if (count > 0) return;
  const id = saveDesign(db, { name: 'Default', grapes_json: JSON.stringify(defaultDesign()) });
  activateDesign(db, id);
}
