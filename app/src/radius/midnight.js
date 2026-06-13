// Midnight-expiry sweeper. Plans with expiry_mode='midnight' renew daily: at the
// next router-local midnight, their active sessions are CoA-disconnected so devices
// re-authenticate (free = one tap, voucher = re-enter, remembered-MAC = automatic),
// getting a fresh daily quota. A 24h fallback Session-Timeout (radius/sync.js) guards
// against a missed sweep.
//
// "Local midnight" is detected by a date change: we track the last router-local date
// we swept and act when it advances. The router's GMT offset is cached in settings by
// the health check (admin/system.js); until then we fall back to UTC.

import { getSetting, setSetting } from '../db/settings.js';
import { disconnectSession } from './coa.js';
import { getNasSecret } from './nas.js';

// Router-local calendar date (YYYY-MM-DD) for a given epoch-ms, using the cached
// GMT offset. Shifting the timestamp and reading the UTC date yields the local date.
export function routerLocalDate(db, nowMs) {
  const offsetSec = Number(getSetting(db, 'router_gmt_offset_secs', '0')) || 0;
  return new Date(nowMs + offsetSec * 1000).toISOString().slice(0, 10);
}

// Active sessions belonging to a midnight-expiry plan (radacct -> radusergroup -> plans).
export function midnightSessions(db) {
  return db
    .prepare(
      `SELECT a.acctsessionid, a.username, a.nasipaddress, a.framedipaddress
         FROM radacct a
         JOIN radusergroup g ON g.username = a.username
         JOIN plans p ON p.radius_groupname = g.groupname
        WHERE a.acctstoptime IS NULL
          AND p.expiry_mode = 'midnight'`,
    )
    .all();
}

// Run one sweep tick. Returns the number of sessions disconnected this tick.
export function sweepMidnightExpiry(db, log, nowMs = Date.now()) {
  const today = routerLocalDate(db, nowMs);
  const last = getSetting(db, 'last_midnight_sweep_date', null);
  // First run just records the date — never disconnect retroactively on boot.
  if (last == null) {
    setSetting(db, 'last_midnight_sweep_date', today);
    return 0;
  }
  if (last === today) return 0; // no local-midnight boundary crossed yet
  setSetting(db, 'last_midnight_sweep_date', today);

  const sessions = midnightSessions(db);
  if (!sessions.length) return 0;

  let secret;
  try {
    secret = getNasSecret(db);
  } catch {
    log && log.warn('sweepMidnightExpiry: NAS secret not configured; skipping disconnects');
    return 0;
  }

  for (const s of sessions) {
    disconnectSession({
      nasip: s.nasipaddress,
      secret,
      acctSessionId: s.acctsessionid,
      username: s.username,
      framedIp: s.framedipaddress,
    })
      .then((r) => {
        if (!r.ok) log && log.warn({ out: r.output }, `midnight CoA disconnect failed for ${s.username}`);
      })
      .catch((e) => log && log.warn({ err: String(e) }, 'midnight CoA error'));
  }
  return sessions.length;
}
