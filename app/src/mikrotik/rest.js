// RouterOS v7 REST client. Talks to https://<router>/rest (or http) with HTTP
// Basic auth. Routers ship a self-signed cert, so TLS verification is disabled
// for https — this is a LAN management tool pointed at a user-configured router.
//
// Used by the setup wizard to auto-configure the router (RADIUS client, hotspot
// profile, DNS static, walled-garden) and, optionally, as an alternative path
// for listing/kicking active users.

import http from 'node:http';
import https from 'node:https';

// Comment stamped on every router object the setup wizard creates (DNS static,
// walled-garden rules). Re-running setup finds its own objects by this marker and
// updates them in place — even if the container IP or server-name changed — rather
// than leaving stale duplicates behind (important after a -Fresh reinstall, where
// the router config persists but the container's /data is wiped).
export const MANAGED_COMMENT = 'Tikspot portal (managed by setup wizard)';
const isManaged = (r) => /tikspot/i.test(r.comment || '');
// A literal-IP server-name (e.g. "172.18.0.3") needs no DNS record or host walled-garden.
export const isIpHost = (h) => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(h || '').trim());

// The router menus Tikspot creates/owns, and the safe fields to surface per menu
// when listing them back (secrets are deliberately never included).
const MANAGED_MENUS = [
  { key: 'radius', menu: '/radius', fields: ['address', 'service'] },
  { key: 'dns-static', menu: '/ip/dns/static', fields: ['name', 'address'] },
  { key: 'hotspot-profile', menu: '/ip/hotspot/profile', fields: ['name', 'use-radius', 'login-by'] },
  { key: 'walled-garden-ip', menu: '/ip/hotspot/walled-garden/ip', fields: ['action', 'dst-address'] },
  { key: 'walled-garden-host', menu: '/ip/hotspot/walled-garden', fields: ['action', 'dst-host'] },
];

function summarize(entry, fields) {
  const out = { id: entry['.id'], comment: entry.comment || '' };
  for (const f of fields) out[f] = entry[f];
  return out;
}

export class RouterOS {
  constructor({ baseUrl, username, password }) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  }

  // Uses node:http/https directly so we can accept the router's self-signed cert
  // (rejectUnauthorized:false) without depending on undici Agent support.
  call(method, path, body) {
    return new Promise((resolve, reject) => {
      let url;
      try {
        url = new URL(`${this.baseUrl}/rest${path}`);
      } catch (e) {
        reject(new Error('invalid router URL: ' + this.baseUrl));
        return;
      }
      const mod = url.protocol === 'https:' ? https : http;
      const data = body !== undefined ? JSON.stringify(body) : null;
      const opts = {
        method,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          Authorization: this.auth,
          Accept: 'application/json',
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        },
        rejectUnauthorized: false,
        timeout: 8000,
      };
      const req = mod.request(opts, (res) => {
        let t = '';
        res.on('data', (d) => (t += d));
        res.on('end', () => {
          let parsed;
          try { parsed = t ? JSON.parse(t) : null; } catch { parsed = t; }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            // RouterOS error bodies look like {error, message, detail} — `detail`
            // carries the real reason (e.g. "not enough permissions"). Surface it.
            const message = parsed && parsed.message;
            const detail = parsed && parsed.detail;
            const human =
              [message, detail].filter(Boolean).join(' — ') ||
              (typeof parsed === 'string' && parsed) ||
              `HTTP ${res.statusCode}`;
            const err = new Error(`RouterOS ${method} ${path}: ${human}`);
            err.status = res.statusCode;
            err.data = parsed;
            reject(err);
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('router connection timed out')));
      if (data) req.write(data);
      req.end();
    });
  }

  // ---- primitives ----
  probe() { return this.call('GET', '/system/resource'); }
  list(menu) { return this.call('GET', menu); }
  add(menu, obj) { return this.call('PUT', menu, obj); }
  patch(menu, id, obj) { return this.call('PATCH', `${menu}/${encodeURIComponent(id)}`, obj); }
  remove(menu, id) { return this.call('DELETE', `${menu}/${encodeURIComponent(id)}`); }

  // ---- hotspot helpers ----
  async ensureRadiusClient({ address, secret }) {
    const all = await this.list('/radius');
    // Reuse our managed entry (by comment) or any hotspot entry for this address,
    // so re-running setup updates it in place (incl. the secret) and tags it.
    const existing = all.find(isManaged) || all.find((r) => r.address === address && (r.service || '').includes('hotspot'));
    const body = { address, secret, service: 'hotspot', comment: MANAGED_COMMENT };
    if (existing) {
      await this.patch('/radius', existing['.id'], body);
      return { updated: existing['.id'] };
    }
    const created = await this.add('/radius', body);
    return { created: created && created['.id'] };
  }

  async configureHotspotProfile({ loginBy = 'mac-cookie,http-chap,http-pap,mac' } = {}) {
    const profiles = await this.list('/ip/hotspot/profile');
    // Configure every profile to use RADIUS + the requested login methods, and tag
    // it so it shows up in the managed-objects view.
    const results = [];
    for (const p of profiles) {
      await this.patch('/ip/hotspot/profile', p['.id'], {
        'use-radius': 'yes',
        'login-by': loginBy,
        comment: MANAGED_COMMENT,
      });
      results.push(p.name);
    }
    return results;
  }

  // List every router object Tikspot manages (tagged with MANAGED_COMMENT), grouped
  // by menu, with only safe fields (never secrets). Powers the admin "router objects"
  // view so the operator can see exactly what Tikspot configured.
  async listManaged() {
    const out = {};
    for (const { key, menu, fields } of MANAGED_MENUS) {
      const all = await this.list(menu).catch(() => []);
      out[key] = all.filter(isManaged).map((e) => summarize(e, fields));
    }
    return out;
  }

  async ensureDnsStatic({ name, address }) {
    const all = await this.list('/ip/dns/static');
    // Reuse our managed entry (by comment) or any existing entry with this name,
    // so re-running setup updates in place instead of adding a duplicate.
    const existing = all.find(isManaged) || all.find((r) => r.name === name);
    if (existing) {
      await this.patch('/ip/dns/static', existing['.id'], { name, address, comment: MANAGED_COMMENT });
      return { updated: name };
    }
    await this.add('/ip/dns/static', { name, address, comment: MANAGED_COMMENT });
    return { created: name };
  }

  async ensureWalledGarden({ address, host }) {
    const added = [];
    if (address) {
      const ips = await this.list('/ip/hotspot/walled-garden/ip').catch(() => []);
      // Find our managed IP rule (by comment) or any accept rule for this address.
      const existing = ips.find(isManaged) || ips.find((e) => e['dst-address'] === address && e.action === 'accept');
      const body = { action: 'accept', 'dst-address': address, comment: MANAGED_COMMENT };
      if (existing) {
        await this.patch('/ip/hotspot/walled-garden/ip', existing['.id'], body);
        added.push(`ip:${address} (updated)`);
      } else {
        await this.add('/ip/hotspot/walled-garden/ip', body);
        added.push(`ip:${address}`);
      }
    }
    if (host) {
      const wg = await this.list('/ip/hotspot/walled-garden').catch(() => []);
      const existing = wg.find(isManaged) || wg.find((e) => e['dst-host'] === host && e.action === 'allow');
      const body = { action: 'allow', 'dst-host': host, comment: MANAGED_COMMENT };
      if (existing) {
        await this.patch('/ip/hotspot/walled-garden', existing['.id'], body);
        added.push(`host:${host} (updated)`);
      } else {
        await this.add('/ip/hotspot/walled-garden', body);
        added.push(`host:${host}`);
      }
    }
    return added;
  }

  listActive() { return this.list('/ip/hotspot/active'); }
  removeActive(id) { return this.remove('/ip/hotspot/active', id); }
}

// Orchestrate the full auto-config. `serverHost` is the bare host of server-name
// (e.g. "hotspot.tikspot"); the container is reachable at `containerIp`.
export async function autoConfigure(router, { containerIp, nasSecret, serverHost }) {
  const steps = [];
  const radius = await router.ensureRadiusClient({ address: containerIp, secret: nasSecret });
  steps.push({ step: 'radius-client', ...radius });
  const profiles = await router.configureHotspotProfile();
  steps.push({ step: 'hotspot-profile', profiles });
  // A literal-IP server-name resolves itself, so only a real hostname needs a DNS
  // static + host walled-garden entry.
  const hostname = serverHost && !isIpHost(serverHost) ? serverHost : null;
  if (hostname) {
    steps.push({ step: 'dns-static', ...(await router.ensureDnsStatic({ name: hostname, address: containerIp })) });
  }
  const wg = await router.ensureWalledGarden({ address: containerIp, host: hostname });
  steps.push({ step: 'walled-garden', added: wg });
  return steps;
}

// Verify the router matches the expected hotspot/RADIUS config. Returns
// { ok, checks } where each check is { component, ok, required, raw, detail }:
// `raw` is the actual RouterOS line for a pass (the RADIUS secret is never included),
// and top-level `ok` is true when every REQUIRED check passes.
export async function verifyConfig(router, { containerIp, serverHost }) {
  const [radius, profiles, dns, wgIp, wgHost] = await Promise.all([
    router.list('/radius').catch(() => []),
    router.list('/ip/hotspot/profile').catch(() => []),
    router.list('/ip/dns/static').catch(() => []),
    router.list('/ip/hotspot/walled-garden/ip').catch(() => []),
    router.list('/ip/hotspot/walled-garden').catch(() => []),
  ]);
  const host = String(serverHost || '').trim();
  const fmt = (menu, e, fields) => (menu + ' ' + fields.map((f) => `${f}=${e[f] == null ? '' : e[f]}`).join(' ')).trim();
  const checks = [];

  const rc = radius.find((r) => r.address === containerIp && (r.service || '').includes('hotspot'));
  checks.push({
    component: `RADIUS client → ${containerIp || '?'}`, ok: !!rc, required: true,
    detail: rc ? '' : 'no /radius entry for the container with service=hotspot',
    raw: rc ? fmt('/radius', rc, ['address', 'service', 'comment']) : '',
  });

  const prof = profiles.find((p) => p['use-radius'] === 'yes' || p['use-radius'] === 'true');
  checks.push({
    component: 'Hotspot profile uses RADIUS', ok: !!prof, required: true,
    detail: prof ? '' : (profiles.length ? 'no hotspot profile has use-radius=yes' : 'no hotspot profiles found'),
    raw: prof ? fmt('/ip/hotspot/profile', prof, ['name', 'use-radius', 'login-by']) : '',
  });

  const wi = wgIp.find((e) => e['dst-address'] === containerIp && e.action === 'accept');
  checks.push({
    component: `Walled-garden allows ${containerIp || '?'}`, ok: !!wi, required: true,
    detail: wi ? '' : "pre-login clients can't reach the container (no walled-garden IP accept)",
    raw: wi ? fmt('/ip/hotspot/walled-garden/ip', wi, ['action', 'dst-address']) : '',
  });

  if (host && !isIpHost(host)) {
    const d = dns.find((r) => r.name === host && (!containerIp || r.address === containerIp));
    checks.push({
      component: `DNS static ${host} → ${containerIp || '?'}`, ok: !!d, required: true,
      detail: d ? '' : "no /ip/dns/static mapping the server-name to the container (clients can't resolve it)",
      raw: d ? fmt('/ip/dns/static', d, ['name', 'address']) : '',
    });
    const wh = wgHost.find((e) => e['dst-host'] === host && (e.action === 'allow' || e.action === 'accept'));
    checks.push({
      component: `Walled-garden allows host ${host}`, ok: !!wh, required: false,
      detail: wh ? '' : 'optional — a dst-host walled-garden entry for the server-name',
      raw: wh ? fmt('/ip/hotspot/walled-garden', wh, ['action', 'dst-host']) : '',
    });
  } else if (isIpHost(host)) {
    checks.push({
      component: `Server-name is an IP (${host}) — no DNS needed`, ok: true, required: false,
      detail: 'clients reach the portal directly by IP', raw: '',
    });
  }

  return { ok: checks.every((c) => c.ok || !c.required), checks };
}
