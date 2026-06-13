// RADIUS NAS shared secret. Signs CoA / disconnect packets sent to the router.
//
// There is deliberately NO insecure default here: a missing secret must fail
// loudly rather than fall back to a well-known value (the old "testing123"),
// which an attacker on the segment could use to forge disconnects and kick
// paying users.

import { randomBytes } from 'node:crypto';
import { getSetting, setSetting } from '../db/settings.js';

export class NasSecretMissing extends Error {
  constructor() {
    super('RADIUS NAS secret is not configured — set it on the Router setup tab first.');
    this.name = 'NasSecretMissing';
  }
}

// Read the configured secret, or throw if neither the setting nor the env var is
// set. Callers that need it to act (e.g. a CoA kick) should surface the error as
// a clear 4xx rather than silently using a default.
export function getNasSecret(db) {
  const secret = getSetting(db, 'nas_secret', null) ?? process.env.TIKSPOT_NAS_SECRET ?? null;
  if (!secret) throw new NasSecretMissing();
  return secret;
}

// Return the configured secret, generating and persisting a strong random one if
// none exists. Used during router auto-config so a real secret is always in place.
export function ensureNasSecret(db) {
  let secret = getSetting(db, 'nas_secret', null) ?? process.env.TIKSPOT_NAS_SECRET ?? null;
  if (!secret) {
    secret = randomBytes(16).toString('hex'); // 32 hex chars
    setSetting(db, 'nas_secret', secret);
  }
  return secret;
}
