// Input validation helpers for the management API. Small and dependency-free.
// Each returns { ok: true, value } on success or { ok: false, error } on failure
// so callers can `reply.code(400).send({ error })` uniformly.

// MikroTik rate-limit string: "rx-rate/tx-rate", each a number with an optional
// k/M/G suffix — e.g. "5M/5M", "512k/1M", "10000000/10000000". Empty -> null.
const RATE_RE = /^\d+(\.\d+)?[kKmMgG]?\/\d+(\.\d+)?[kKmMgG]?$/;

export function validateRateLimit(v) {
  if (v == null || v === '') return { ok: true, value: null };
  if (typeof v !== 'string' || !RATE_RE.test(v.trim())) {
    return { ok: false, error: 'rate_limit must look like "5M/5M" (rx/tx)' };
  }
  return { ok: true, value: v.trim() };
}

// Non-negative integer (bytes / seconds). Empty -> null (unlimited).
export function validateNonNegInt(v, field) {
  if (v == null || v === '') return { ok: true, value: null };
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return { ok: false, error: `${field} must be a non-negative whole number` };
  }
  return { ok: true, value: n };
}

// Plan expiry mode: 'fixed' (or empty) -> null (use session_timeout_secs); 'midnight'
// -> sessions renew at the next router-local midnight.
export function validateExpiryMode(v) {
  if (v == null || v === '' || v === 'fixed') return { ok: true, value: null };
  if (v === 'midnight') return { ok: true, value: 'midnight' };
  return { ok: false, error: "expiry_mode must be 'fixed' or 'midnight'" };
}

export const MIN_PASSWORD_LEN = 6;

export function validatePassword(v, field = 'password') {
  if (typeof v !== 'string' || v.length < MIN_PASSWORD_LEN) {
    return { ok: false, error: `${field} must be at least ${MIN_PASSWORD_LEN} characters` };
  }
  return { ok: true, value: v };
}

// Validate a design model payload before persisting: must be valid JSON and not
// absurdly large (DoS / storage-bloat guard). null -> ok/null (nothing to update).
export const MAX_DESIGN_BYTES = 512 * 1024;

export function validateDesignJson(v) {
  if (v == null) return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, error: 'grapes_json must be a JSON string' };
  if (Buffer.byteLength(v, 'utf8') > MAX_DESIGN_BYTES) {
    return { ok: false, error: 'design is too large (max 512 KB)' };
  }
  try {
    JSON.parse(v);
  } catch {
    return { ok: false, error: 'grapes_json must be valid JSON' };
  }
  return { ok: true, value: v };
}
