#!/bin/bash

# === BACKUP DB QUOTIDIEN — SOLACE ===
DATE=$(date +%F_%H-%M-%S)
SOURCE_DIR="/root/ricadmin/solace"
DB_FILE="$SOURCE_DIR/solace.db"
BACKUP_FILE="/tmp/solace-db-$DATE.db"
DESTINATION="kdrive:rick D (0)/DATABYRIC/Backup Hebdo/solace-db"

# Credentials Telegram depuis kpopdata (même VPS)
ENV_FILE="/root/ricadmin/kpopdata/.env"
if [ -f "$ENV_FILE" ]; then
    TELEGRAM_BOT_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | cut -d= -f2-)
    TELEGRAM_CHAT_ID=$(grep '^TELEGRAM_CHAT_ID=' "$ENV_FILE" | cut -d= -f2-)
else
    TELEGRAM_BOT_TOKEN=""
    TELEGRAM_CHAT_ID=""
fi

umask 077

# Nettoyage local (+7 jours)
find /tmp -name "solace-db-*.db" -mtime +7 -exec rm {} \; 2>/dev/null

# Snapshot SQLite propre (WAL-safe)
sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
CP_STATUS=$?

# Upload kDrive
rclone copy "$BACKUP_FILE" "$DESTINATION"
RCLONE_STATUS=$?

# Nettoyage kDrive : garder 30 jours
rclone delete --min-age 30d "$DESTINATION" --include "solace-db-*.db"

if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    rm -f "$BACKUP_FILE"
else
    BACKUP_SIZE="inconnu"
fi

if [ $CP_STATUS -eq 0 ] && [ $RCLONE_STATUS -eq 0 ]; then
    MESSAGE="✅ Backup DB quotidien solace : $BACKUP_SIZE → kDrive"
else
    MESSAGE="❌ Échec backup DB solace ($DATE)"
fi

[ -n "$TELEGRAM_BOT_TOKEN" ] && curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
     -d chat_id="$TELEGRAM_CHAT_ID" \
     -d text="$MESSAGE"
