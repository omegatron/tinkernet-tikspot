# Backup & migrating Tikspot to another device

Tikspot keeps everything stateful on the mounted `/data` volume (the SQLite DB +
branding assets). The admin **Backup** tab turns that into a single portable file so you
can move a whole install — plans, vouchers, accounts, page designs, settings and
branding — to another MikroTik.

## What's in a backup

A `tikspot-backup-<date>.zip` containing:

- `tikspot.db` — a consistent snapshot of the database (plans, vouchers, accounts, page
  designs, RADIUS users, settings).
- `assets/…` — your uploaded branding images.
- `tikspot-backup.json` — metadata: app version, timestamp, **all settings (including the
  router API credentials, RADIUS secret and admin password hash)**, and a **router
  snapshot** (the old device's container mount/root-dir/veth/IP + board) so you can
  recreate the network side on the new device.

> The backup contains secrets. Treat the file as sensitive.

## Back up (old device)

Admin portal → **Backup** → **Download backup .zip**.

## Restore (new device)

1. **Load the container** on the new MikroTik and start it (see `deploy-rb5009.md`). It
   boots with a fresh default install.
2. Open its admin portal → run the wizard far enough to set an admin password (you'll
   replace it in a moment), or just reach the login.
3. Admin portal → **Backup** → **Restore** → choose the backup zip → **Restore**.
   The bundle is *staged*, not applied live (FreeRADIUS + the app hold the DB open).
4. **Restart the container** to finish — on the router:
   ```rsc
   /container/stop  [find name=app-tikspot]
   /container/start [find name=app-tikspot]
   ```
   On boot, `db-init` promotes the staged database in place. The container comes back up
   with all your data, designs and settings (and the old admin password).

## Recreating the network side on the new device

The DB restore brings back Tikspot's own config, but the **RouterOS** side (the veth, the
container mount/root-dir, the RADIUS client, hotspot profile, DNS static and
walled-garden) belongs to the router, not the backup. Use the **router snapshot** in
`tikspot-backup.json` (also shown on the **System** tab of the old device) to match the
veth address / mounts, then re-run the **Router setup → Auto-configure** step on the new
device (the restored settings pre-fill the form).

## Notes

- Time: the container uses the MikroTik's clock (shared host clock). Date-gated vouchers
  therefore depend on the router's NTP being synced — the **System** tab warns if it
  isn't.
- Restore replaces **all** current data on the next restart; it is not a merge.
