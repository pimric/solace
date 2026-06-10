#!/bin/bash
# Usage: ./cron_wrapper.sh "Job Name" "commande"

set +e

JOB_NAME="$1"
shift
COMMAND="$@"

SOLACE="/root/ricadmin/solace"
ENV_FILE="/root/ricadmin/kpopdata/.env"
TELEGRAM_BOT_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
TELEGRAM_CHAT_ID=$(grep '^TELEGRAM_CHAT_ID=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)

cd "$SOLACE" || exit 1

echo "════════════════════════════════════════"
echo "🚀 DÉBUT: $JOB_NAME"
echo "⏰ $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════"

START_TIME=$(date +%s)
bash -c "$COMMAND"
EXIT_CODE=$?
DURATION=$(( $(date +%s) - START_TIME ))

echo ""
echo "════════════════════════════════════════"
echo "⏱️  DURÉE: ${DURATION}s  |  EXIT: $EXIT_CODE"
echo "════════════════════════════════════════"

if [ $EXIT_CODE -ne 0 ] && [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
        -d chat_id="$TELEGRAM_CHAT_ID" \
        -d text="🚨 SOLACE ÉCHEC: $JOB_NAME
⏰ $(date '+%Y-%m-%d %H:%M:%S')
⏱️ ${DURATION}s  |  exit $EXIT_CODE
Logs: storage/logs/" >/dev/null
fi

exit $EXIT_CODE
