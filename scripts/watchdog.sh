#!/bin/bash
# Watchdog SOLACE — toutes les 30min via cron

SOLACE="/root/ricadmin/solace"
LOG="$SOLACE/storage/logs/watchdog.log"
ALERT_FILE="/tmp/solace_watchdog_last_alert"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Credentials Telegram depuis kpopdata (même VPS)
ENV_FILE="/root/ricadmin/kpopdata/.env"
TELEGRAM_BOT_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
TELEGRAM_CHAT_ID=$(grep '^TELEGRAM_CHAT_ID=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)

send_alert() {
    local msg="$1"
    # Anti-spam : max 1 alerte par heure
    if [ -f "$ALERT_FILE" ]; then
        local last=$(cat "$ALERT_FILE")
        local now=$(date +%s)
        local diff=$((now - last))
        if [ "$diff" -lt 3600 ]; then
            log "⏭️ Alerte supprimée (anti-spam, dernière il y a ${diff}s)"
            return
        fi
    fi
    date +%s > "$ALERT_FILE"
    [ -n "$TELEGRAM_BOT_TOKEN" ] && curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
        -d chat_id="$TELEGRAM_CHAT_ID" \
        -d text="$msg" >/dev/null
    log "🔔 Alerte envoyée"
}

problems=()

# ━━━ 1. pm2 process solace ━━━
if pm2 list 2>/dev/null | grep -q "solace.*online"; then
    log "✅ pm2 solace: online"
else
    log "❌ pm2 solace: DOWN → restart"
    problems+=("pm2 solace DOWN")
    pm2 start "$SOLACE/server.js" --name solace -- --port 3002 2>/dev/null || \
    pm2 restart solace 2>/dev/null
    sleep 3
    if pm2 list 2>/dev/null | grep -q "solace.*online"; then
        log "🔄 pm2 solace: redémarré OK"
        problems+=("(auto-restart OK)")
    else
        problems+=("(auto-restart FAILED)")
    fi
fi

# ━━━ 2. HTTP répond sur :3002 ━━━
http_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3002/api/stats 2>/dev/null)
if [ "$http_status" = "200" ]; then
    log "✅ HTTP :3002/api/stats → 200"
else
    log "❌ HTTP :3002/api/stats → $http_status"
    problems+=("HTTP :3002 status=$http_status")
fi

# ━━━ 3. DB accessible ━━━
db_size=$(du -m "$SOLACE/solace.db" 2>/dev/null | awk '{print $1}')
if [ -n "$db_size" ]; then
    log "🗄️ DB: ${db_size}MB"
else
    log "❌ DB inaccessible"
    problems+=("solace.db inaccessible")
fi

# ━━━ 4. Espace disque ━━━
disk_usage=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
log "💾 Disque: ${disk_usage}%"
if [ "$disk_usage" -gt 90 ]; then
    problems+=("Disque à ${disk_usage}%")
fi

# ━━━ 5. Cron tourne ━━━
if pgrep -x cron >/dev/null 2>&1; then
    log "✅ cron: actif"
else
    log "❌ cron: DOWN"
    problems+=("cron DOWN")
    systemctl start cron 2>/dev/null
fi

# ━━━ BILAN ━━━
if [ ${#problems[@]} -gt 0 ]; then
    problem_list=$(printf '• %s\n' "${problems[@]}")
    send_alert "🚨 SOLACE Watchdog

${problem_list}

🕐 $(date '+%Y-%m-%d %H:%M')"
    log "❌ ${#problems[@]} problème(s) détecté(s)"
else
    log "✅ Tout OK"
fi
