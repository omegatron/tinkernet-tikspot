// Shared SQLite handle.
//
// This is the SAME database file FreeRADIUS reads/writes via rlm_sql (radcheck,
// radreply, radgroupreply, radusergroup, radacct, ...). FreeRADIUS is the hot
// writer (accounting), so we run in WAL mode with a generous busy_timeout on
// both sides to let the two processes interleave without lock errors.

import Database from 'better-sqlite3';
import { DB_PATH } from '../config.js';

export function openDb({ readonly = false } = {}) {
  const db = new Database(DB_PATH, { readonly });
  if (!readonly) {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  return db;
}
