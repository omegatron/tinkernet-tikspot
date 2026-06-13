#!/command/with-contenv sh
# Create/migrate the shared SQLite DB and seed defaults before radiusd & node
# start. Runs as a s6 oneshot that the longruns depend on.
cd /app || exit 1
exec node src/init.js
