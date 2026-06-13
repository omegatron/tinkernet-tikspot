// Captive-portal routes (the public surface the hotspot clients reach via the
// walled-garden). The MikroTik shim POSTs the hotspot session context here; we
// render the active design's page, whose login form posts back to the router's
// link-login to complete authentication.

import { renderPortalPage } from './render.js';
import { activeModel } from './designs.js';
import { BASE_CSS } from './base-css.js';
import { getSetting } from '../db/settings.js';

// The hotspot host shown to direct-load visitors: the host part of the configured
// server-name (set in Router setup), falling back to the request's own host.
function hotspotHost(db, req) {
  const sn = getSetting(db, 'server_name', '') || '';
  const host = sn.split('|')[0].trim();
  return host || (req.headers?.host || '').split(':')[0];
}

// Pull the hotspot session context from a POST body (shim) or GET query
// (direct/preview). Field names use MikroTik's hyphenated spelling.
function readContext(req) {
  const src = { ...(req.query ?? {}), ...(req.body ?? {}) };
  return {
    mac: src.mac ?? '',
    ip: src.ip ?? '',
    username: src.username ?? '',
    linkLogin: src['link-login'] ?? src.linkLogin ?? '',
    linkLogout: src['link-logout'] ?? src.linkLogout ?? '',
    dst: src.dst ?? src['link-orig'] ?? '',
    error: src.error ?? '',
    chapId: src['chap-id'] ?? src.chapId ?? '',
    chapChallenge: src['chap-challenge'] ?? src.chapChallenge ?? '',
  };
}

function loginMethod(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'login_method'").get();
  return row?.value ?? 'pap';
}

function simplePage(title, bodyHtml) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>${BASE_CSS}</style></head><body class="tk-body"><main class="tk-page">${bodyHtml}</main></body></html>`;
}

export default async function portalRoutes(app) {
  const db = app.db;

  async function serveLogin(req, reply) {
    const ctx = readContext(req);
    ctx.chap = loginMethod(db) === 'chap';
    ctx.preview = (req.query?.preview ?? '') === '1';
    ctx.hotspotHost = hotspotHost(db, req);
    reply.type('text/html').send(renderPortalPage(activeModel(db), ctx));
  }

  // The shim POSTs; browsers/preview may GET.
  app.get('/login', serveLogin);
  app.post('/login', serveLogin);
  app.get('/', serveLogin); // bare container hit shows the portal too

  async function serveStatus(req, reply) {
    const ctx = readContext(req);
    const logout = ctx.linkLogout
      ? `<form method="post" action="${ctx.linkLogout.replace(/"/g, '&quot;')}"><button class="tk-btn" type="submit">Log out</button></form>`
      : '';
    reply
      .type('text/html')
      .send(
        simplePage(
          'Connected',
          `<h1>You're connected</h1><p>Enjoy the Wi-Fi.</p>${logout}` +
            `<p class="tk-muted">Powered by Tikspot</p>`,
        ),
      );
  }
  app.get('/status', serveStatus);
  app.post('/status', serveStatus);

  async function serveLogout(_req, reply) {
    reply
      .type('text/html')
      .send(
        simplePage(
          'Logged out',
          `<h1>You're logged out</h1><p>Reconnect any time from the Wi-Fi page.</p>` +
            `<p class="tk-muted">Powered by Tikspot</p>`,
        ),
      );
  }
  app.get('/logout', serveLogout);
  app.post('/logout', serveLogout);
}
