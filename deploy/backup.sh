#!/usr/bin/env bash
# mess_soft nightly backup: MySQL dump + app storage volume, with retention and
# an optional off-machine copy. Safe to run by hand; exits non-zero on any failure.
#
# Install on the VM (as root):
#   install -m 700 deploy/backup.sh /usr/local/bin/mess_soft-backup
#   install -m 600 deploy/backup.conf.example /etc/mess_soft-backup.conf   # then edit it
#   crontab -e  →  15 2 * * * /usr/local/bin/mess_soft-backup >> /var/log/mess_soft-backup.log 2>&1
#
# Restore:
#   gunzip -c /var/backups/mess_soft/db/mess_soft_<stamp>.sql.gz | mysql -u root -p mess_soft
#   docker run --rm -v mess-soft_storage:/s -v /var/backups/mess_soft/storage:/b alpine \
#     sh -c 'cd /s && tar xzf /b/storage_<stamp>.tar.gz'
set -euo pipefail

CONF="${MESS_SOFT_BACKUP_CONF:-/etc/mess_soft-backup.conf}"
# shellcheck source=/dev/null
[ -f "$CONF" ] && . "$CONF"

DB_NAME="${DB_NAME:-mess_soft}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/mess_soft}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
# MySQL credentials live in a my.cnf-style file ([client] user=… password=…), never on the command line.
MYSQL_DEFAULTS_FILE="${MYSQL_DEFAULTS_FILE:-/root/.my.cnf}"
STORAGE_VOLUME="${STORAGE_VOLUME:-mess-soft_storage}"
REMOTE_TARGET="${REMOTE_TARGET:-}"   # e.g. backup@192.168.100.50:/srv/backups/mess_soft  (empty = no copy)

stamp="$(date +%F_%H%M)"
log() { echo "[$(date '+%F %T')] $*"; }
fail() { log "ERROR: $*"; exit 1; }
trap 'log "ERROR: backup FAILED at line $LINENO — check the messages above"' ERR

[ -r "$MYSQL_DEFAULTS_FILE" ] || fail "MySQL credentials file not readable: $MYSQL_DEFAULTS_FILE"
mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/storage"
chmod 700 "$BACKUP_DIR"

# ── 1. Database ─────────────────────────────────────────────────────
db_tmp="$BACKUP_DIR/db/.mess_soft_${stamp}.sql.gz.part"
db_out="$BACKUP_DIR/db/mess_soft_${stamp}.sql.gz"
trap 'rm -f "$db_tmp"' EXIT

# --set-gtid-purged exists in MySQL's mysqldump but not MariaDB's.
gtid_opt=()
mysqldump --help 2>/dev/null | grep -q -- '--set-gtid-purged' && gtid_opt=(--set-gtid-purged=OFF)

log "Dumping database $DB_NAME"
mysqldump --defaults-extra-file="$MYSQL_DEFAULTS_FILE" \
  --single-transaction --routines --triggers --no-tablespaces "${gtid_opt[@]}" \
  "$DB_NAME" | gzip -9 > "$db_tmp"

# A dump is only usable if it is valid gzip AND mysqldump reached the end.
gzip -t "$db_tmp" || fail "dump is not valid gzip"
gunzip -c "$db_tmp" | tail -n 1 | grep -q '^-- Dump completed' || fail "dump is incomplete (no 'Dump completed' trailer)"
mv "$db_tmp" "$db_out"
chmod 600 "$db_out"
log "Database OK: $db_out ($(du -h "$db_out" | cut -f1))"

# ── 2. App storage volume (logs, uploaded files) ────────────────────
if command -v docker >/dev/null 2>&1 && docker volume inspect "$STORAGE_VOLUME" >/dev/null 2>&1; then
  st_out="$BACKUP_DIR/storage/storage_${stamp}.tar.gz"
  docker run --rm --quiet -v "$STORAGE_VOLUME":/s:ro -v "$BACKUP_DIR/storage":/b alpine:3.20 \
    sh -c "tar czf '/b/$(basename "$st_out")' -C /s --exclude='./framework/cache' --exclude='./framework/views' . \
           && chown $(id -u):$(id -g) '/b/$(basename "$st_out")' && chmod 600 '/b/$(basename "$st_out")'"
  log "Storage OK: $st_out ($(du -h "$st_out" | cut -f1))"
else
  log "Storage volume $STORAGE_VOLUME not found — skipped"
fi

# ── 3. Retention ────────────────────────────────────────────────────
find "$BACKUP_DIR/db" -name 'mess_soft_*.sql.gz' -mtime +"$RETENTION_DAYS" -print -delete | sed 's/^/Pruned /'
find "$BACKUP_DIR/storage" -name 'storage_*.tar.gz' -mtime +"$RETENTION_DAYS" -print -delete | sed 's/^/Pruned /'

# ── 4. Off-machine copy (a backup on the same disk doesn't survive a dead VM) ──
if [ -n "$REMOTE_TARGET" ]; then
  log "Copying to $REMOTE_TARGET"
  rsync -a --delete "$BACKUP_DIR/" "$REMOTE_TARGET/" || fail "rsync to $REMOTE_TARGET failed"
fi

log "Backup finished"
