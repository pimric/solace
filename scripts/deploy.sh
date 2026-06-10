#!/bin/bash
# Déploiement solace : pull + restart
set -e
cd /root/ricadmin/solace
echo "→ git pull"
git pull origin main
echo "→ npm install (si package.json changé)"
npm install --omit=dev --silent
echo "→ pm2 restart"
pm2 restart solace
echo "✅ Déployé — $(date '+%Y-%m-%d %H:%M')"
