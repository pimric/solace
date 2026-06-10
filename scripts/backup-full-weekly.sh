#!/bin/bash

# === BACKUP COMPLET HEBDOMADAIRE — SOLACE ===
DATE=$(date +%F_%H-%M-%S)
SOURCE_DIR="/root/ricadmin/solace"
BACKUP_FILE="/tmp/solace-full-$DATE.tar.gz"
DESTINATION="kdrive:rick D (0)/DATABYRIC/Backup Hebdo/solace-full"

ENV_FILE="/root/ricadmin/kpopdata/.env"
if [ -f "$ENV_FILE" ]; then
    TELEGRAM_BOT_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | cut -d= -f2-)
    TELEGRAM_CHAT_ID=$(grep '^TELEGRAM_CHAT_ID=' "$ENV_FILE" | cut -d= -f2-)
else
    TELEGRAM_BOT_TOKEN=""
    TELEGRAM_CHAT_ID=""
fi

umask 077

find /tmp -name "solace-full-*.tar.gz" -mtime +7 -exec rm {} \; 2>/dev/null

# Snapshot SQLite avant tar
DB_SNAPSHOT="$SOURCE_DIR/solace_backup_snap.db"
[ -f "$SOURCE_DIR/solace.db" ] && sqlite3 "$SOURCE_DIR/solace.db" ".backup '$DB_SNAPSHOT'"

tar --exclude="$BACKUP_FILE" \
    --exclude="$SOURCE_DIR/node_modules" \
    --exclude="$SOURCE_DIR/.git" \
    --exclude="$SOURCE_DIR/solace.db" \
    --exclude="$SOURCE_DIR/solace.db-wal" \
    --exclude="$SOURCE_DIR/solace.db-shm" \
    --exclude="$SOURCE_DIR/storage/logs/*.gz" \
    --exclude="*.log" \
    -czf "$BACKUP_FILE" "$SOURCE_DIR"
TAR_STATUS=$?
[ $TAR_STATUS -eq 1 ] && TAR_STATUS=0

rm -f "$DB_SNAPSHOT"

rclone copy "$BACKUP_FILE" "$DESTINATION"
RCLONE_STATUS=$?

rclone delete --min-age 30d "$DESTINATION" --include "solace-full-*.tar.gz"

if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    rm -f "$BACKUP_FILE"
else
    BACKUP_SIZE="inconnu"
fi

if [ $TAR_STATUS -eq 0 ] && [ $RCLONE_STATUS -eq 0 ]; then
    MESSAGE="✅ Backup COMPLET hebdo solace : $BACKUP_SIZE → kDrive"
else
    MESSAGE="❌ Échec backup complet solace ($DATE)"
fi

[ -n "$TELEGRAM_BOT_TOKEN" ] && curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
     -d chat_id="$TELEGRAM_CHAT_ID" \
     -d text="$MESSAGE"
