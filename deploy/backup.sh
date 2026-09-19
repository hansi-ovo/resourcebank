#!/usr/bin/env bash
# DKU Leadership Resource Bank — daily SQLite backup (01-architecture §9:
# daily 03:00, 14-day retention, /var/backups/rb/).
#
# Install (crontab -e as root or via /etc/cron.d):
#   0 3 * * * /opt/resourcebank/deploy/backup.sh >> /var/log/rb-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${RB_BACKUP_DIR:-/var/backups/rb}"
DB_PATH="${RB_DB_PATH:-/opt/resourcebank/data/rb.sqlite}"
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR"

stamp="$(date +%Y-%m-%d_%H%M%S)"
dest="$BACKUP_DIR/rb-$stamp.sqlite"

# sqlite3 .backup takes a consistent snapshot even while the server is running
# (WAL mode). Falls back to file copy if sqlite3 is unavailable.
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$dest'"
else
  echo "WARN: sqlite3 not found — using plain copy (server should be idle)"
  cp "$DB_PATH" "$dest"
fi

echo "$(date -Is) backup written: $dest"

# retention: keep the newest $RETENTION_DAYS daily backups
ls -1t "$BACKUP_DIR"/rb-*.sqlite 2>/dev/null | tail -n +$((RETENTION_DAYS + 1)) | while read -r old; do
  rm -f -- "$old"
  echo "$(date -Is) pruned: $old"
done
