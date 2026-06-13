// First-run setup wizard backend + router settings + MAC-session views.

import { getSetting, setSetting, getBool } from '../db/settings.js';
import { hashPassword } from './auth.js';
import { RouterOS, autoConfigure, verifyConfig } from '../mikrotik/rest.js';
import { buildSetupScript } from '../mikrotik/script.js';
import { activeMacSessions } from '../mac/grants.js';
import { removeUser } from '../radius/sync.js';
import { ensureNasSecret } from '../radius/nas.js';
import { applyNasSecret } from '../radius/clientsconf.js';

const COOKIE = 'tikspot_sess';

function serverHostOf(serverName) {
  return String(serverName || '').split('|')[0].trim();
}

export function routerFromSettings(db) {
  const scheme = getSetting(db, 'router_scheme', 'https');
  const host = getSetting(db, 'router_host', null);
  if (!host) return null;
  return new RouterOS({
    baseUrl: `${scheme}://${host}`,
    username: getSetting(db, 'router_user', 'admin'),
    password: getSetting(db, 'router_pass', ''),
  });
}

export default async function setupRoutes(app) {
  const db = app.db;

  app.get('/api/setup/state', async () => ({
    setup_complete: getBool(db, 'setup_complete', false),
    has_admin: !!getSetting(db, 'admin_password_hash', null),
    router: {
      scheme: getSetting(db, 'router_scheme', 'https'),
      host: getSetting(db, 'router_host', ''),
      username: getSetting(db, 'router_user', 'admin'),
      container_ip: getSetting(db, 'container_ip', ''),
      server_name: getSetting(db, 'server_name', ''),
      configured: getBool(db, 'router_configured', false),
    },
  }));

  // Set the admin password (first run) and log the browser in to continue.
  app.post('/api/setup/admin', async (req, reply) => {
    const { password } = req.body ?? {};
    if (!password || String(password).length < 6) {
      return reply.code(400).send({ error: 'password must be at least 6 characters' });
    }
    // Only allowed pre-setup, or when already authed (handled by the auth gate).
    if (getSetting(db, 'admin_password_hash', null) && !getBool(db, 'setup_complete', false)) {
      // allow overwrite during setup
    }
    setSetting(db, 'admin_password_hash', hashPassword(password));
    reply.setCookie(COOKIE, 'admin', {
      signed: true, httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7,
    });
    return { ok: true };
  });

  // Store router connection + network settings.
  app.post('/api/setup/router', async (req) => {
    const b = req.body ?? {};
    const map = {
      router_scheme: b.scheme, router_host: b.host, router_user: b.username,
      router_pass: b.password, container_ip: b.container_ip, server_name: b.server_name,
      nas_secret: b.nas_secret,
    };
    for (const [k, v] of Object.entries(map)) if (v !== undefined) setSetting(db, k, v);
    // If the NAS secret was (re)set, re-render clients.conf + reload radiusd now so
    // the container accepts the same secret the router will be told — no restart,
    // no drift (FreeRADIUS would otherwise silently drop the router's requests).
    if (b.nas_secret !== undefined) applyNasSecret(db);
    return { ok: true };
  });

  // Probe the router (connectivity + auth check).
  app.post('/api/setup/probe', async (_req, reply) => {
    const router = routerFromSettings(db);
    if (!router) return reply.code(400).send({ error: 'router not configured' });
    try {
      const r = await router.probe();
      return { ok: true, version: r?.version, board: r?.['board-name'] };
    } catch (err) {
      return reply.code(502).send({ ok: false, error: String(err.message ?? err) });
    }
  });

  // Auto-configure the router over REST.
  app.post('/api/setup/autoconfig', async (_req, reply) => {
    const router = routerFromSettings(db);
    if (!router) return reply.code(400).send({ error: 'router not configured' });
    try {
      // Ensure a real shared secret exists (generates + persists a strong random
      // one if the admin didn't set one) — never the old "testing123" placeholder.
      const steps = await autoConfigure(router, {
        containerIp: getSetting(db, 'container_ip', ''),
        nasSecret: ensureNasSecret(db),
        serverHost: serverHostOf(getSetting(db, 'server_name', '')),
      });
      // Make the container accept exactly the secret we just gave the router.
      applyNasSecret(db);
      setSetting(db, 'router_configured', '1');
      return { ok: true, steps };
    } catch (err) {
      return reply.code(502).send({ ok: false, error: String(err.message ?? err) });
    }
  });

  app.post('/api/setup/verify', async (_req, reply) => {
    const router = routerFromSettings(db);
    if (!router) return reply.code(400).send({ error: 'router not configured' });
    try {
      return await verifyConfig(router, {
        containerIp: getSetting(db, 'container_ip', ''),
        serverHost: serverHostOf(getSetting(db, 'server_name', '')),
      });
    } catch (err) {
      return reply.code(502).send({ ok: false, error: String(err.message ?? err) });
    }
  });

  app.post('/api/setup/finish', async () => {
    setSetting(db, 'setup_complete', '1');
    return { ok: true };
  });

  // Generate idempotent RouterOS commands equivalent to Auto-configure, so the admin
  // can configure the router by hand (no write credentials needed in the container).
  app.get('/api/setup/script', async (_req) => ({
    script: buildSetupScript({
      containerIp: getSetting(db, 'container_ip', ''),
      serverHost: serverHostOf(getSetting(db, 'server_name', '')),
      nasSecret: ensureNasSecret(db),
    }),
  }));

  // List the router objects Tikspot manages (tagged by comment) so the admin can
  // see/audit exactly what was configured on the router.
  app.get('/api/setup/router-objects', async (_req, reply) => {
    const router = routerFromSettings(db);
    if (!router) return reply.code(400).send({ error: 'router not configured' });
    try {
      return { ok: true, objects: await router.listManaged() };
    } catch (err) {
      return reply.code(502).send({ ok: false, error: String(err.message ?? err) });
    }
  });

  // ---- Remembered devices (MAC re-auth) ----
  app.get('/api/mac', async () => ({ mac_sessions: activeMacSessions(db) }));
  app.delete('/api/mac/:mac', async (req) => {
    const mac = req.params.mac;
    removeUser(db, mac);
    db.prepare('UPDATE mac_sessions SET active = 0 WHERE mac = ?').run(mac);
    return { ok: true };
  });
}
