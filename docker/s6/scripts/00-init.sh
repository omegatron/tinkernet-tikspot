#!/command/with-contenv sh
# Tikspot one-shot init, runs before long-running services start.
#
# Phase 0: just ensure the persistent data directory exists and announce
# ourselves. Later phases extend this to: create/migrate the shared SQLite DB
# with WAL mode, generate the RADIUS shared secret + admin bootstrap token +
# self-signed TLS cert on first boot, and render the FreeRADIUS sql module
# config pointing at /data/tikspot.db.
set -e

DATA_DIR="${TIKSPOT_DATA_DIR:-/data}"

echo "[tikspot-init] starting (data dir: ${DATA_DIR})"
mkdir -p "${DATA_DIR}"
# FreeRADIUS run dir (pid/control socket); /var/run can be a fresh tmpfs.
mkdir -p /var/run/radiusd
echo "[tikspot-init] ready"
