// Live view of who's online, sourced from FreeRADIUS accounting (radacct). An
// open session is a row with no acctstoptime. This works without any router
// credentials — FreeRADIUS writes radacct as the hotspot reports accounting.

export function activeSessions(db) {
  return db
    .prepare(
      `SELECT acctsessionid, username, framedipaddress AS ip, callingstationid AS mac,
              nasipaddress, acctstarttime, acctsessiontime AS session_secs,
              acctinputoctets AS in_octets, acctoutputoctets AS out_octets,
              (COALESCE(acctinputoctets,0) + COALESCE(acctoutputoctets,0)) AS total_octets
         FROM radacct
        WHERE acctstoptime IS NULL
        ORDER BY acctstarttime DESC`,
    )
    .all();
}

// Aggregate usage per user across all sessions (for the accounting view).
export function usageByUser(db, { limit = 100 } = {}) {
  return db
    .prepare(
      `SELECT username,
              COUNT(*) AS sessions,
              SUM(COALESCE(acctinputoctets,0) + COALESCE(acctoutputoctets,0)) AS total_octets,
              MAX(acctstarttime) AS last_start,
              SUM(CASE WHEN acctstoptime IS NULL THEN 1 ELSE 0 END) AS active_sessions
         FROM radacct
        GROUP BY username
        ORDER BY total_octets DESC
        LIMIT ?`,
    )
    .all(limit);
}

// Look up a single open session by acctsessionid (used by the kick flow).
export function findSession(db, acctSessionId) {
  return (
    db
      .prepare(
        `SELECT acctsessionid, username, nasipaddress, framedipaddress, callingstationid
           FROM radacct WHERE acctsessionid = ? AND acctstoptime IS NULL`,
      )
      .get(acctSessionId) ?? null
  );
}

// Optimistically close a session locally (after a successful kick). The router
// normally also sends an Acct-Stop, which is idempotent with this.
export function closeSession(db, acctSessionId) {
  db.prepare(
    `UPDATE radacct SET acctstoptime = datetime('now'), acctterminatecause = 'Admin-Reset'
      WHERE acctsessionid = ? AND acctstoptime IS NULL`,
  ).run(acctSessionId);
}
