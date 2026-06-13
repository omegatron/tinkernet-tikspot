-- Tikspot application tables (Node-owned). These live in the SAME SQLite file as
-- the FreeRADIUS tables. The app is the single UI authority for plans/users; a
-- sync layer (radius/sync.js) projects them into the RADIUS tables so FreeRADIUS
-- stays the single auth authority.
--
-- Phase 1 introduces `plans`, `settings`, and `app_meta`. Later phases add
-- vouchers, accounts, mac_sessions, designs, assets, etc.

CREATE TABLE IF NOT EXISTS app_meta (
	key   TEXT PRIMARY KEY,
	value TEXT
);

-- A plan = a RADIUS group. Its limits are projected to radgroupreply rows:
--   rate_limit            -> Mikrotik-Rate-Limit  ("rx/tx", e.g. "5M/5M")
--   total_limit_bytes     -> Mikrotik-Total-Limit (+ -Gigawords for > 4 GiB)
--   session_timeout_secs  -> Session-Timeout
-- NULL limit columns mean "unlimited" (no corresponding reply attribute).
CREATE TABLE IF NOT EXISTS plans (
	id                   INTEGER PRIMARY KEY AUTOINCREMENT,
	name                 TEXT NOT NULL UNIQUE,
	radius_groupname     TEXT NOT NULL UNIQUE,
	kind                 TEXT NOT NULL DEFAULT 'free',   -- free | voucher | account
	rate_limit           TEXT,
	total_limit_bytes    INTEGER,
	session_timeout_secs INTEGER,
	mac_remember         INTEGER NOT NULL DEFAULT 0,     -- per-plan MAC re-auth toggle
	mac_validity_secs    INTEGER,
	-- Expiry mode: NULL/'fixed' = use session_timeout_secs; 'midnight' = sessions are
	-- CoA-disconnected at the next router-local midnight (renew daily). A 24h fallback
	-- Session-Timeout is still projected for midnight plans.
	expiry_mode          TEXT,
	created_at           TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Free-form key/value settings (router host + REST creds, radius secret,
-- container IP/hostname, server-name pointer, walled-garden list, ...).
CREATE TABLE IF NOT EXISTS settings (
	key   TEXT PRIMARY KEY,
	value TEXT
);

-- Voucher codes. Each code is a RADIUS user (radcheck Cleartext-Password = code,
-- radusergroup -> the plan's group). status: unused | used | revoked.
CREATE TABLE IF NOT EXISTS vouchers (
	id                   INTEGER PRIMARY KEY AUTOINCREMENT,
	code                 TEXT NOT NULL UNIQUE,
	plan_id              INTEGER REFERENCES plans(id) ON DELETE SET NULL,
	status               TEXT NOT NULL DEFAULT 'unused',
	batch_id             TEXT,
	mac_remember_override INTEGER,
	created_at           TEXT NOT NULL DEFAULT (datetime('now')),
	first_use_at         TEXT,
	expires_at           TEXT,
	-- Optional absolute validity window (date-gated vouchers). NULL = no gate.
	valid_from           TEXT,
	valid_until          TEXT
);
CREATE INDEX IF NOT EXISTS vouchers_batch ON vouchers(batch_id);
CREATE INDEX IF NOT EXISTS vouchers_status ON vouchers(status);

-- Named user accounts (e.g. staff / paid). username -> radcheck + radusergroup.
CREATE TABLE IF NOT EXISTS accounts (
	id                   INTEGER PRIMARY KEY AUTOINCREMENT,
	username             TEXT NOT NULL UNIQUE,
	password             TEXT NOT NULL,
	plan_id              INTEGER REFERENCES plans(id) ON DELETE SET NULL,
	enabled              INTEGER NOT NULL DEFAULT 1,
	mac_remember_override INTEGER,
	created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Remembered devices for MAC re-auth. When a user logs in on a mac_remember plan,
-- the grant processor records their MAC here AND as a RADIUS user (username = MAC,
-- Cleartext-Password = MAC, with an Expiration check item) so a returning device
-- (MikroTik login-by=mac) auto-authenticates until the validity window closes.
CREATE TABLE IF NOT EXISTS mac_sessions (
	id                   INTEGER PRIMARY KEY AUTOINCREMENT,
	mac                  TEXT NOT NULL UNIQUE,
	identity             TEXT,
	plan_id              INTEGER REFERENCES plans(id) ON DELETE SET NULL,
	rate_limit           TEXT,
	total_limit_bytes    INTEGER,
	session_timeout_secs INTEGER,
	granted_at           TEXT NOT NULL DEFAULT (datetime('now')),
	expires_at           TEXT NOT NULL,
	active               INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS mac_sessions_active ON mac_sessions(active, expires_at);

-- Saved captive-portal page designs. `grapes_json` holds the design model JSON
-- (theme + ordered blocks) that the editor edits and the portal renders from.
-- (`html`/`css` are legacy/unused now.) Exactly one design is active at a time.
CREATE TABLE IF NOT EXISTS designs (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	name       TEXT NOT NULL,
	grapes_json TEXT,
	html       TEXT NOT NULL DEFAULT '',
	css        TEXT NOT NULL DEFAULT '',
	is_active  INTEGER NOT NULL DEFAULT 0,
	version    INTEGER NOT NULL DEFAULT 1,
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Admin action audit trail. Append-only record of state-changing admin actions
-- (plan/voucher/account CRUD, kicks, restores, backups) for accountability.
CREATE TABLE IF NOT EXISTS admin_audit (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	action     TEXT NOT NULL,
	detail     TEXT,
	ip         TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS admin_audit_created ON admin_audit(id);

-- Branding assets (images/fonts/css) uploaded by the admin and served by the
-- container at /assets/<filename> (referenced by the live portal page). The
-- bytes live on the /data volume; this table is the index.
CREATE TABLE IF NOT EXISTS assets (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	filename   TEXT NOT NULL UNIQUE,
	mime       TEXT,
	bytes      INTEGER,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
