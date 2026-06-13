// MAC re-auth: grant + expire remembered devices.
//
// Grant: when a device is online (open radacct session) under a plan whose
// mac_remember is on, record its MAC as a RADIUS user (username = MAC,
// Cleartext-Password = MAC) in the plan's group, so a returning device that
// MikroTik authenticates by MAC (login-by=mac, User-Name=MAC) gets straight back
// on with the plan's limits — until its validity window closes.
//
// Expire: the sweeper removes the MAC RADIUS user once expires_at passes, so the
// device falls back to the portal. (We rely on the sweeper rather than a RADIUS
// Expiration attribute to avoid depending on FreeRADIUS module ordering.)

import { syncUser, removeUser } from '../radius/sync.js';

// Create MAC re-auth entries for newly-online devices on mac_remember plans.
export function processMacGrants(db) {
  const rows = db
    .prepare(
      `SELECT DISTINCT ra.callingstationid AS mac, ra.username AS identity,
              p.id AS plan_id, p.radius_groupname AS groupname, p.mac_validity_secs AS validity
         FROM radacct ra
         JOIN radusergroup rug ON rug.username = ra.username
         JOIN plans p ON p.radius_groupname = rug.groupname
        WHERE ra.acctstoptime IS NULL
          AND p.mac_remember = 1
          AND p.mac_validity_secs IS NOT NULL
          AND ra.callingstationid <> ''
          AND NOT EXISTS (
                SELECT 1 FROM mac_sessions ms WHERE ms.mac = ra.callingstationid AND ms.active = 1)`,
    )
    .all();

  const insert = db.prepare(
    `INSERT INTO mac_sessions (mac, identity, plan_id, expires_at, active)
     VALUES (@mac, @identity, @plan_id, datetime('now', '+' || @validity || ' seconds'), 1)
     ON CONFLICT(mac) DO UPDATE SET
       identity = excluded.identity, plan_id = excluded.plan_id,
       granted_at = datetime('now'), expires_at = excluded.expires_at, active = 1`,
  );

  let granted = 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      // Skip MAC-named identities (those are re-auth logins, not fresh grants).
      if (String(r.identity).toUpperCase() === String(r.mac).toUpperCase()) continue;
      insert.run({ mac: r.mac, identity: r.identity, plan_id: r.plan_id, validity: r.validity });
      syncUser(db, { username: r.mac, password: r.mac, groupname: r.groupname });
      granted++;
    }
  });
  tx();
  return granted;
}

// Remove expired MAC re-auth entries (and their RADIUS users).
export function sweepMacSessions(db) {
  const expired = db
    .prepare("SELECT mac FROM mac_sessions WHERE active = 1 AND expires_at <= datetime('now')")
    .all();
  const tx = db.transaction(() => {
    for (const { mac } of expired) {
      removeUser(db, mac);
      db.prepare('UPDATE mac_sessions SET active = 0 WHERE mac = ?').run(mac);
    }
  });
  tx();
  return expired.length;
}

export function activeMacSessions(db) {
  return db
    .prepare(
      `SELECT m.mac, m.identity, m.granted_at, m.expires_at, p.name AS plan_name
         FROM mac_sessions m LEFT JOIN plans p ON p.id = m.plan_id
        WHERE m.active = 1 ORDER BY m.expires_at`,
    )
    .all();
}
