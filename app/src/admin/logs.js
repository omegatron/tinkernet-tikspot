// Logs API — surfaces what RADIUS is actually seeing, so the admin can tell
// whether the router is reaching us. Sourced from FreeRADIUS's own tables:
// radpostauth (every Access-Accept/Reject) and radacct (accounting). All local
// DB — no router connection needed.

export default async function logsRoutes(app) {
  const db = app.db;

  app.get('/api/logs/auth', async (req) => {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 500);
    const attempts = db
      .prepare(`SELECT id, username, reply, authdate FROM radpostauth ORDER BY id DESC LIMIT ?`)
      .all(limit)
      .map((r) => ({ ...r, accept: /accept/i.test(r.reply || '') }));

    const since = db
      .prepare(
        `SELECT reply, COUNT(*) AS n FROM radpostauth
          WHERE authdate >= datetime('now','-1 day') GROUP BY reply`,
      )
      .all();
    let accepts24h = 0;
    let rejects24h = 0;
    for (const c of since) {
      if (/accept/i.test(c.reply || '')) accepts24h += c.n;
      else rejects24h += c.n;
    }
    const total = db.prepare('SELECT COUNT(*) AS n FROM radpostauth').get().n;
    const lastAcct = db
      .prepare('SELECT MAX(acctstarttime) AS t FROM radacct')
      .get().t;

    return { attempts, accepts24h, rejects24h, total, lastAccounting: lastAcct };
  });

  // Admin action audit trail (plan/voucher/account CRUD, kicks, restores, backups).
  app.get('/api/logs/admin', async (req) => {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 500);
    const entries = db
      .prepare('SELECT id, action, detail, ip, created_at FROM admin_audit ORDER BY id DESC LIMIT ?')
      .all(limit);
    return { entries };
  });
}
