// Admin API (Phase 2 slice): design CRUD for the editor, the hotspot-shim zip
// download, and branding-asset upload. Auth is added in a later phase; for now
// these live under /api and the admin UI under /admin.

import fs from 'node:fs';
import path from 'node:path';
import { listDesigns, getDesign, getActiveDesign, saveDesign, activateDesign } from '../portal/designs.js';
import { buildShimZip } from '../hotspot/zip.js';
import { generateShims } from '../hotspot/shims.js';
import { routerFromSettings } from './setup.js';
import { getSetting } from '../db/settings.js';
import { ASSETS_DIR } from '../config.js';
import { validateDesignJson } from './validate.js';
import { logAudit } from './audit.js';

function shimContentType(name) {
  if (name.endsWith('.json')) return 'application/json';
  if (name.endsWith('.txt')) return 'text/plain';
  return 'text/html';
}

// Keep uploaded filenames safe for the filesystem and for URL use.
function safeName(name) {
  return path.basename(String(name)).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128) || 'file';
}

export default async function adminRoutes(app) {
  const db = app.db;

  // ---- Designs ----------------------------------------------------------
  app.get('/api/designs', async () => ({ designs: listDesigns(db) }));

  app.get('/api/designs/active', async (_req, reply) => {
    const d = getActiveDesign(db);
    if (!d) return reply.code(404).send({ error: 'no active design' });
    return d;
  });

  app.get('/api/designs/:id', async (req, reply) => {
    const d = getDesign(db, Number(req.params.id));
    if (!d) return reply.code(404).send({ error: 'not found' });
    return d;
  });

  app.post('/api/designs', async (req, reply) => {
    const { id, name, grapes_json, html, css, activate } = req.body ?? {};
    const dj = validateDesignJson(grapes_json);
    if (!dj.ok) return reply.code(400).send({ error: dj.error });
    const savedId = saveDesign(db, { id, name, grapes_json: dj.value, html, css, activate });
    logAudit(db, req, id ? 'design.update' : 'design.create', name ?? `#${savedId}`);
    return { ok: true, id: savedId };
  });

  app.post('/api/designs/:id/activate', async (req) => {
    activateDesign(db, Number(req.params.id));
    logAudit(db, req, 'design.activate', `#${req.params.id}`);
    return { ok: true };
  });

  // ---- Hotspot shim files ------------------------------------------------
  // Option 1: download the zip.
  app.get('/api/hotspot/shim.zip', async (_req, reply) => {
    const buf = await buildShimZip();
    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', 'attachment; filename="tikspot-hotspot.zip"')
      .send(buf);
  });

  // Public: the individual shim files, so the router can pull them with /tool/fetch.
  // Not sensitive (redirect HTML); the auth gate allowlists /hotspot-files/.
  app.get('/hotspot-files/:name', async (req, reply) => {
    const f = generateShims().find((s) => s.name === req.params.name);
    if (!f) return reply.code(404).send('not found');
    reply.type(shimContentType(f.name)).send(f.content);
  });

  // Option 2: push the shim files straight onto the router's hotspot directory
  // over the REST API (the router /tool/fetch'es each file from this container).
  app.post('/api/hotspot/push', async (_req, reply) => {
    const router = routerFromSettings(db);
    if (!router) return reply.code(400).send({ error: 'Router not configured — set it up on the Router setup tab first.' });
    const containerIp = (getSetting(db, 'container_ip', '') || '').trim();
    if (!containerIp) return reply.code(400).send({ error: 'Container IP not set — add it on the Router setup tab.' });

    // Where the hotspot serves HTML from (default "hotspot"); read from a profile.
    let htmlDir = 'hotspot';
    try {
      const profiles = await router.list('/ip/hotspot/profile');
      const d = profiles.map((p) => p['html-directory']).find(Boolean);
      if (d) htmlDir = String(d).replace(/\/+$/, '');
    } catch { /* fall back to "hotspot" */ }

    const files = generateShims();
    const results = [];
    for (const f of files) {
      const url = `http://${containerIp}/hotspot-files/${f.name}`;
      const dst = `${htmlDir}/${f.name}`;
      try {
        const r = await router.call('POST', '/tool/fetch', { url, 'dst-path': dst, mode: 'http' });
        const status = r && (r.status || r['status']);
        const ok = !status || /finish|done|success/i.test(String(status));
        results.push({ name: f.name, ok, status: status || 'ok' });
      } catch (err) {
        results.push({ name: f.name, ok: false, status: String(err.message ?? err) });
      }
    }
    const pushed = results.filter((r) => r.ok).length;
    return { ok: pushed === files.length, htmlDir, pushed, total: files.length, results };
  });

  // ---- Branding assets ---------------------------------------------------
  app.get('/api/assets', async () => ({
    assets: db.prepare('SELECT filename, mime, bytes, created_at FROM assets ORDER BY id').all(),
  }));

  app.post('/api/assets', async (req, reply) => {
    const file = await req.file?.();
    if (!file) return reply.code(400).send({ error: 'expected a multipart file upload' });
    const filename = safeName(file.filename);
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    const dest = path.join(ASSETS_DIR, filename);
    const buf = await file.toBuffer();
    fs.writeFileSync(dest, buf);
    db.prepare(
      `INSERT INTO assets (filename, mime, bytes) VALUES (@filename, @mime, @bytes)
       ON CONFLICT(filename) DO UPDATE SET mime = excluded.mime, bytes = excluded.bytes`,
    ).run({ filename, mime: file.mimetype ?? null, bytes: buf.length });
    return { ok: true, filename, url: `/assets/${filename}` };
  });
}
