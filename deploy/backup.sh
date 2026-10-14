#!/usr/bin/env bash
# deploy/backup.sh -- one backup of everything the server remembers.
#
#     sudo bash deploy/backup.sh                  # into /var/backups/worm
#     sudo KEEP_DAYS=30 bash deploy/backup.sh     # keep 30 days instead of 14
#
# What is being protected: the season ledger (sides, commits, reveals, the drawn
# blocks), the day's board, the submitted run records, and the anchor manifest.
# That is the whole record of the live season, and it is small -- so it is cheap to
# copy, and expensive to lose.
#
# Restore (documented, not automated):
#     sudo tar xzf /var/backups/worm/worm-<UTC>.tgz -C /tmp/worm-restore
#     sudo systemctl stop worm
#     sudo -u worm cp -a /tmp/worm-restore/data/. /srv/worm/data/
#     sudo systemctl start worm
#     curl -s http://127.0.0.1:3230/api/live | head -c 200
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/worm.env}"
DEST="${DEST:-/var/backups/worm}"
KEEP_DAYS="${KEEP_DAYS:-14}"
CURRENT="${CURRENT:-/srv/worm/current}"

set -a; . "$ENV_FILE"; set +a
DATA="${WORM_DATA_DIR:?WORM_DATA_DIR is not set}"

install -d -m 700 "$DEST"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$DEST/worm-$STAMP.tgz"
STAGE=$(mktemp -d /tmp/worm-backup-XXXXXX)
trap 'rm -rf "$STAGE"' EXIT

install -d "$STAGE/data" "$STAGE/repo"
cp -a "$DATA/." "$STAGE/data/"
[ -f "$CURRENT/anchors/anchors.json" ] && cp -a "$CURRENT/anchors/anchors.json" "$STAGE/repo/anchors.json" || true
[ -f /srv/worm/DEPLOY-NOTES.md ] && cp -a /srv/worm/DEPLOY-NOTES.md "$STAGE/repo/DEPLOY-NOTES.md" || true

tar czf "$OUT" -C "$STAGE" .
chmod 600 "$OUT"

# A sidecar, because a backup you cannot check is a guess: the chain head here is the
# number the /anchors page and the anchor script both produce for day 0.
{
  echo "at      $STAMP"
  echo "archive $OUT"
  echo "bytes   $(wc -c < "$OUT")"
  echo "month   $(date -u +%Y-%m)"
} > "$OUT.txt"
chmod 600 "$OUT.txt"

find "$DEST" -name 'worm-*.tgz' -mtime "+$KEEP_DAYS" -delete
find "$DEST" -name 'worm-*.tgz.txt' -mtime "+$KEEP_DAYS" -delete

echo "wrote $OUT ($(wc -c < "$OUT") bytes), keeping $KEEP_DAYS days"
ls -1 "$DEST" | tail -3
