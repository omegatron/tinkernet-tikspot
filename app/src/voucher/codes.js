// Voucher code generation. Codes use an unambiguous alphabet (no 0/O/1/I/L) so
// they're easy to read off a printed slip. Uses crypto for unpredictability.

import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(length = 8) {
  let s = '';
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

// Generate `count` codes unique against the existing vouchers table.
export function generateUniqueCodes(db, count, length = 8) {
  const existing = new Set(db.prepare('SELECT code FROM vouchers').pluck().all());
  const out = new Set();
  let guard = count * 50 + 100;
  while (out.size < count && guard-- > 0) {
    const c = randomCode(length);
    if (!existing.has(c) && !out.has(c)) out.add(c);
  }
  return [...out];
}

// A short batch id derived from a timestamp passed in (scripts can't use Date.now
// in some contexts, but the server can — callers pass it for testability).
export function batchId(ts) {
  return 'b' + Number(ts).toString(36);
}
