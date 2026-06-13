// Lightweight admin audit log. Records who-did-what for state-changing admin
// actions (plan/voucher/account CRUD, kicks, restores, backups). Stored in the
// admin_audit table; surfaced read-only via GET /api/logs/admin.

export function logAudit(db, req, action, detail) {
  try {
    db.prepare('INSERT INTO admin_audit (action, detail, ip) VALUES (?, ?, ?)').run(
      String(action),
      detail == null ? null : String(detail),
      req?.ip ?? null,
    );
  } catch {
    // Auditing must never break the action it records.
  }
}
