// Unit tests for the security-sensitive, pure pieces of the backend: password
// hashing, the login rate limiter, and the management-API input validators.
// These avoid the native better-sqlite3 dependency so they run anywhere with
// just `node --test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hashPassword, verifyPassword } from '../src/admin/auth.js';
import { makeRateLimiter } from '../src/admin/ratelimit.js';
import {
  validateRateLimit,
  validateNonNegInt,
  validatePassword,
  validateDesignJson,
  validateExpiryMode,
  MAX_DESIGN_BYTES,
} from '../src/admin/validate.js';
import { renderClientsConf } from '../src/radius/clientsconf.js';
import { routerLocalDate } from '../src/radius/midnight.js';
import { buildSetupScript } from '../src/mikrotik/script.js';
import { MANAGED_COMMENT } from '../src/mikrotik/rest.js';

test('password hash round-trips and rejects wrong/tampered input', () => {
  const stored = hashPassword('correct horse');
  assert.equal(verifyPassword('correct horse', stored), true);
  assert.equal(verifyPassword('wrong', stored), false);
  assert.equal(verifyPassword('', stored), false);
  assert.equal(verifyPassword('correct horse', null), false);

  // A salt is used: two hashes of the same password differ.
  assert.notEqual(hashPassword('same'), hashPassword('same'));

  // A tampered hash fails rather than throwing.
  const tampered = stored.slice(0, -1) + (stored.endsWith('a') ? 'b' : 'a');
  assert.equal(verifyPassword('correct horse', tampered), false);
  assert.equal(verifyPassword('x', 'bcrypt$deadbeef$cafe'), false); // unknown alg
});

test('rate limiter blocks after max within the window and reset clears it', () => {
  const rl = makeRateLimiter({ max: 3, windowMs: 1000 });
  const t0 = 1_000_000;
  assert.equal(rl.check('ip', t0).allowed, true);
  assert.equal(rl.check('ip', t0).allowed, true);
  assert.equal(rl.check('ip', t0).allowed, true);
  const blocked = rl.check('ip', t0);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);

  // A different key is independent.
  assert.equal(rl.check('other', t0).allowed, true);

  // The window rolls over.
  assert.equal(rl.check('ip', t0 + 1001).allowed, true);

  // reset() clears the counter immediately.
  rl.check('ip', t0 + 1001);
  rl.check('ip', t0 + 1001);
  assert.equal(rl.check('ip', t0 + 1001).allowed, false);
  rl.reset('ip');
  assert.equal(rl.check('ip', t0 + 1001).allowed, true);
});

test('validateRateLimit accepts MikroTik forms and rejects junk', () => {
  for (const good of ['5M/5M', '512k/1M', '10000000/10000000', '2.5M/2.5M']) {
    assert.equal(validateRateLimit(good).ok, true, good);
  }
  for (const bad of ['5M', '5M-5M', 'fast', '5M/', '/5M', '5X/5M']) {
    assert.equal(validateRateLimit(bad).ok, false, bad);
  }
  assert.deepEqual(validateRateLimit(''), { ok: true, value: null });
  assert.deepEqual(validateRateLimit(null), { ok: true, value: null });
  assert.equal(validateRateLimit('  5M/5M  ').value, '5M/5M'); // trimmed
});

test('validateNonNegInt rejects negatives, floats, and NaN', () => {
  assert.equal(validateNonNegInt(0, 'x').ok, true);
  assert.equal(validateNonNegInt(1024, 'x').value, 1024);
  assert.deepEqual(validateNonNegInt('', 'x'), { ok: true, value: null });
  assert.equal(validateNonNegInt(-1, 'x').ok, false);
  assert.equal(validateNonNegInt(1.5, 'x').ok, false);
  assert.equal(validateNonNegInt('abc', 'x').ok, false);
});

test('validatePassword enforces the minimum length', () => {
  assert.equal(validatePassword('123456').ok, true);
  assert.equal(validatePassword('12345').ok, false);
  assert.equal(validatePassword('').ok, false);
  assert.equal(validatePassword(undefined).ok, false);
});

test('validateDesignJson checks validity and size', () => {
  assert.equal(validateDesignJson('{"a":1}').ok, true);
  assert.deepEqual(validateDesignJson(null), { ok: true, value: null });
  assert.equal(validateDesignJson('{not json').ok, false);
  assert.equal(validateDesignJson(42).ok, false);
  const huge = JSON.stringify({ s: 'x'.repeat(MAX_DESIGN_BYTES) });
  assert.equal(validateDesignJson(huge).ok, false);
});

test('validateExpiryMode accepts fixed/midnight and rejects junk', () => {
  assert.deepEqual(validateExpiryMode(null), { ok: true, value: null });
  assert.deepEqual(validateExpiryMode(''), { ok: true, value: null });
  assert.deepEqual(validateExpiryMode('fixed'), { ok: true, value: null });
  assert.deepEqual(validateExpiryMode('midnight'), { ok: true, value: 'midnight' });
  assert.equal(validateExpiryMode('hourly').ok, false);
});

test('routerLocalDate shifts the date by the cached GMT offset', () => {
  // Minimal db stub: getSetting reads settings.value.
  const dbWith = (offsetSec) => ({ prepare: () => ({ get: () => ({ value: String(offsetSec) }) }) });
  const lateUtc = Date.parse('2026-01-01T23:30:00Z');
  const earlyUtc = Date.parse('2026-01-01T00:30:00Z');
  assert.equal(routerLocalDate(dbWith(0), lateUtc), '2026-01-01');
  assert.equal(routerLocalDate(dbWith(3600), lateUtc), '2026-01-02'); // +1h tips into next day
  assert.equal(routerLocalDate(dbWith(-3600), earlyUtc), '2025-12-31'); // -1h tips into prev day
});

test('buildSetupScript emits idempotent hotspot config with embedded values (IP server-name)', () => {
  const s = buildSetupScript({ containerIp: '172.18.0.3', serverHost: '172.18.0.3', nasSecret: 'sek' });
  assert.match(s, /:if \(\[:len \[\/radius find/); // idempotent set-or-add form
  assert.match(s, /\/radius add address="172\.18\.0\.3" secret="sek" service=hotspot/);
  assert.ok(s.includes(MANAGED_COMMENT)); // tagged with the managed comment
  assert.match(s, /\/ip\/hotspot\/profile set \[find\] use-radius=yes/);
  assert.match(s, /walled-garden\/ip add action=accept dst-address="172\.18\.0\.3"/);
  // A literal-IP server-name needs no DNS static / host walled-garden.
  assert.ok(!s.includes('/ip/dns/static add'));
  assert.match(s, /server-name is an IP/);
});

test('buildSetupScript adds DNS + host walled-garden for a hostname server-name', () => {
  const s = buildSetupScript({ containerIp: '10.0.0.5', serverHost: 'wifi.example.com', nasSecret: 'x' });
  assert.match(s, /\/ip\/dns\/static add name="wifi\.example\.com" address="10\.0\.0\.5"/);
  assert.match(s, /\/ip\/hotspot\/walled-garden add action=allow dst-host="wifi\.example\.com"/);
});

test('renderClientsConf embeds the secret and trusts localhost + a LAN range', () => {
  const conf = renderClientsConf('s3cr3t-value');
  // Secret present on every client block.
  assert.equal((conf.match(/secret = s3cr3t-value/g) || []).length, 4);
  assert.match(conf, /client localhost \{/);
  assert.match(conf, /ipaddr = 127\.0\.0\.1/);
  // A catch-all client so a router at any LAN IP is accepted (the gap this fixes).
  assert.match(conf, /ipaddr = 0\.0\.0\.0\/0/);
  assert.match(conf, /ipv6addr = ::\/0/);
});
