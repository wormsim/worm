#!/usr/bin/env bash
# deploy/watchdog.sh -- notice when the site is up but not working.
#
# systemd already restarts a process that dies (Restart=on-failure). This catches the
# other case: the process is alive, the port answers, and the app is wrong -- a full
# disk, a corrupted ledger, an RPC that hangs the draw. Three failed checks in a row
# restart the service, and every failure goes to the journal under the tag
# `worm-watchdog`, so `journalctl -t worm-watchdog` is the history.
#
#     sudo bash deploy/watchdog.sh        # one check, by hand
set -uo pipefail

PORT="${PORT:-3230}"
MAX="${MAX:-3}"
STATE="${STATE:-/var/lib/worm-watchdog.failures}"
URL="http://127.0.0.1:$PORT/api/live"

if curl -fsS -m 20 -o /dev/null "$URL"; then
  echo 0 > "$STATE"
  exit 0
fi

n=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$STATE"
logger -t worm-watchdog "health check failed at $URL ($n/$MAX)"

if [ "$n" -ge "$MAX" ]; then
  logger -t worm-watchdog "restarting worm.service after $n consecutive failures"
  systemctl restart worm
  echo 0 > "$STATE"
fi
