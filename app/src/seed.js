// Seed the defaults needed for a working free-login hotspot out of the box:
// a "Free" plan (RADIUS group `free`) and the shared free credential mapped to
// it. Idempotent — safe on every boot. Admins can later edit the plan and the
// limits flow back to RADIUS via syncPlanToRadius().

import { FREE_USERNAME, FREE_PASSWORD } from './config.js';
import { syncPlanToRadius, syncUser } from './radius/sync.js';

const DEFAULT_FREE_PLAN = {
  name: 'Free',
  radius_groupname: 'free',
  kind: 'free',
  rate_limit: '5M/5M', // 5 Mbit/s down / up
  total_limit_bytes: 200 * 1024 * 1024, // 200 MiB
  session_timeout_secs: 60 * 60, // 1 hour
  mac_remember: 0,
  mac_validity_secs: null,
};

export function seedDefaults(db) {
  const existing = db
    .prepare('SELECT id FROM plans WHERE radius_groupname = ?')
    .get(DEFAULT_FREE_PLAN.radius_groupname);

  if (!existing) {
    db.prepare(
      `INSERT INTO plans
         (name, radius_groupname, kind, rate_limit, total_limit_bytes,
          session_timeout_secs, mac_remember, mac_validity_secs)
       VALUES
         (@name, @radius_groupname, @kind, @rate_limit, @total_limit_bytes,
          @session_timeout_secs, @mac_remember, @mac_validity_secs)`,
    ).run(DEFAULT_FREE_PLAN);
  }

  const freePlan = db
    .prepare('SELECT * FROM plans WHERE radius_groupname = ?')
    .get(DEFAULT_FREE_PLAN.radius_groupname);

  // Project the plan limits and (re)create the shared free credential.
  syncPlanToRadius(db, freePlan);
  syncUser(db, { username: FREE_USERNAME, password: FREE_PASSWORD, groupname: 'free' });
}
