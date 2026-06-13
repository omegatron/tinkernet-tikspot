// System / health view. Reports the container's own status plus — when a router
// is configured — the MikroTik's resources, clock/NTP, and THIS container's
// placement on the router (mount, root-dir, veth, IP). The router snapshot is
// also reused by the backup bundle.

import fs from 'node:fs';
import { routerFromSettings } from './setup.js';
import { getSetting, setSetting } from '../db/settings.js';
import { VERSION, DATA_DIR } from '../config.js';

function diskFree(dir) {
  try {
    const s = fs.statfsSync(dir);
    return { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch {
    return null;
  }
}

export function containerInfo() {
  return {
    version: VERSION,
    node: process.version,
    uptimeSecs: Math.round(process.uptime()),
    data: diskFree(DATA_DIR),
  };
}

function ntpSynced(ntp) {
  if (!ntp) return null;
  const s = String(ntp.status || ntp['status'] || '').toLowerCase();
  if (s) return s.includes('synchronized') || s.includes('synced');
  return ntp.enabled === 'true' || ntp.enabled === true ? null : false;
}

// Find the /container entry that corresponds to THIS container, by matching the
// configured container IP to a veth address, then the veth to a container.
function matchContainerOnRouter(db, containers, veths, addrs) {
  const ip = (getSetting(db, 'container_ip', '') || '').trim();
  if (!ip) return null;
  const veth = veths.find((v) => String(v.address || '').split('/')[0] === ip);
  const ipEntry = addrs.find((a) => String(a.address || '').split('/')[0] === ip);
  let container = null;
  if (veth) container = containers.find((c) => c.interface === veth.name) || null;
  if (!container && containers.length === 1) container = containers[0];
  return {
    containerIp: ip,
    veth: veth ? { name: veth.name, address: veth.address, gateway: veth.gateway } : null,
    ipBinding: ipEntry ? { address: ipEntry.address, interface: ipEntry.interface } : null,
    container: container
      ? {
          name: container.name,
          status: container.status,
          rootDir: container['root-dir'],
          mounts: container.mount || container.mounts || '',
          interface: container.interface,
        }
      : null,
  };
}

// Build the full health snapshot (also used by backup). Returns { container,
// router, clock, ntpOk, placement }.
export async function buildHealth(db) {
  const out = { container: containerInfo(), routerConfigured: false };
  const router = routerFromSettings(db);
  if (!router) return out;
  out.routerConfigured = true;
  try {
    const [resource, clock, ntp, containers, veths, addrs] = await Promise.all([
      router.call('GET', '/system/resource').catch(() => null),
      router.call('GET', '/system/clock').catch(() => null),
      router.call('GET', '/system/ntp/client').catch(() => null),
      router.list('/container').catch(() => []),
      router.list('/interface/veth').catch(() => []),
      router.list('/ip/address').catch(() => []),
    ]);
    if (resource) {
      out.router = {
        board: resource['board-name'],
        version: resource.version,
        arch: resource['architecture-name'],
        cpuLoad: resource['cpu-load'],
        freeMemory: Number(resource['free-memory']) || null,
        totalMemory: Number(resource['total-memory']) || null,
        uptime: resource.uptime,
      };
    }
    if (clock) {
      out.clock = { time: clock.time, date: clock.date, timezone: clock['time-zone-name'] };
      // Cache the router's GMT offset (seconds) so the midnight-expiry sweeper can
      // compute router-local midnight without querying the router each tick.
      if (clock['gmt-offset'] != null) setSetting(db, 'router_gmt_offset_secs', String(clock['gmt-offset']));
    }
    if (ntp) out.ntp = { enabled: ntp.enabled, status: ntp.status, servers: ntp.servers || ntp['server-dns-names'] || '' };
    out.ntpOk = ntpSynced(ntp);
    out.placement = matchContainerOnRouter(db, Array.isArray(containers) ? containers : [], Array.isArray(veths) ? veths : [], Array.isArray(addrs) ? addrs : []);
  } catch (err) {
    out.error = String(err.message ?? err);
  }
  return out;
}

export default async function systemRoutes(app) {
  const db = app.db;
  app.get('/api/system/health', async () => buildHealth(db));
}
