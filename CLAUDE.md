# SOLACE — Instructions pour Claude Code

## Projet
Jardin mémoriel interactif. Chaque plante = une victime de conflits armés (données ACLED).
Civilians → fleurs colorées. Combattants → végétation sombre sur les bords.

## Stack
- **Backend** : Node.js + Express 5 + WebSocket (`ws`) + SQLite3
- **Frontend** : Phaser 4, rendu isométrique custom
- **DB** : `solace.db` SQLite (~1000 plantes : Gaza, Soudan, Ukraine, Myanmar, Yémen)
- **Logs** : `logger.js` (makeLogger), sortie dans `solace.log`

## Déploiement live
- **Site** : https://solace.databyric.fr (SSL Certbot, nginx proxy → :3002)
- **pm2** : process `solace` online — `pm2 restart solace` pour redémarrer
- **Port : 3002** — le 3000 est pris par hero.databyric.fr et ldvelh
- Fichiers statiques (`public/`) servis directement — pas besoin de restart pm2

```bash
pm2 restart solace        # redémarrer
pm2 logs solace           # logs live
PORT=3002 node server.js  # lancer manuellement (debug)
```

## Fichiers clés
| Fichier | Rôle |
|---|---|
| `server.js` | Express + WS, API REST, route `/snapshot` |
| `gardenEngine.js` | Tick 30s : eau, santé plantes, bots |
| `botController.js` | Déplacement bots côté serveur |
| `waterSystem.js` | Calcul deltas eau par source |
| `memorialService.js` | Logique mémorial (grief_pause, events) |
| `plantGenerator.js` | Génération attributs visuels d'une plante |
| `migrate.js` | Migrations SQLite |
| `importer.js` | Import CSV ACLED → DB |
| `public/js/gardenScene.js` | Scene Phaser principale |
| `public/js/plantRenderer.js` | Rendu plantes isométriques |
| `public/js/botRenderer.js` | Rendu bots (errance client-side) |

## API REST
- `GET /api/garden` — snapshot complet (plants + bots + resources)
- `GET /api/stats` — compteurs globaux
- `GET /api/weather` — conditions météo
- `GET /snapshot` — HTML auto-rendu canvas (headless screenshot)

## WebSocket messages
- **Serveur → client** : `snapshot`, `plants_update`, `bots_update`, `grief_pause`, `plant_watered`
- **Client → serveur** : `{ type: 'water_plant', plant_id: N }`

## Pièges connus
1. **Port 3000 pris** — toujours utiliser PORT=3002 pour solace
2. **Phaser 4 RenderTexture** : `RenderTexture.draw(graphics)` ne capture PAS un Graphics créé avec `make.graphics({add:false})` → texture vide silencieuse. Solution : `graphics.generateTexture(key, w, h)` puis `add.image(0,0,key)`
3. **Arbres immortels** : plantes avec `fatalities >= 1000` ne meurent jamais de sécheresse (logique intentionnelle)
4. **DB SQLite callbacks** : toute l'API DB utilise des callbacks (pas de promesses natives) — wrapper en Promise si besoin

## Rendu Phaser (résumé)
- **5 plantes** (`SCENE_PLANTS`) affichées, cluster autour d'une graine stable
- Texture plantes pré-rendue UNE fois, régénérée seulement sur `plants_update` (tick 30s)
- Bots errent côté client (rayon `BOT_WANDER_R = 4.0`), pas côté serveur
- Résolution plafonnée à `min(devicePixelRatio, 2)`

## Constantes réglables (gardenScene.js)
- `SCENE_PLANTS` — nb plantes visibles (4–6)
- `BOT_WANDER_R` — rayon errance bots
- `BOT_MIN_MS` / `BOT_MAX_MS` — durée trajet bot

## Scripts ops (scripts/)
| Script | Cron | Rôle |
|---|---|---|
| `scripts/backup-db-daily.sh` | `15 4 * * *` | Snapshot SQLite WAL-safe → kDrive `solace-db/`, retention 30j |
| `scripts/backup-full-weekly.sh` | `30 5 * * 0` | tar.gz complet (sans node_modules/.git/logs) → kDrive `solace-full/` |
| `scripts/watchdog.sh` | `*/30 * * * *` | Vérifie pm2, HTTP :3002, DB, disque — auto-restart + Telegram |

Logs crons → `storage/logs/`
Credentials Telegram lus depuis `/root/ricadmin/kpopdata/.env` (même VPS)

## Tests headless
playwright-core disponible dans `/root/ricadmin/Hero/ldvelh/node_modules`
```js
// Chromium headless avec WebGL software
{ args: ['--use-gl=swiftshader', '--no-sandbox'], viewport: { width: 390, height: 844 } }
// goto http://localhost:3002 puis sonder window.game.scene.scenes[0]
```

## Workflow AI-friendly
- Avant tout refactor : `git diff` pour voir l'état depuis le dernier commit
- Les migrations DB sont dans `migrate.js` — NE PAS modifier `solace.db` directement
- `.env` : variables sensibles (ACLED_API_KEY etc.) — ne JAMAIS committer
- `node_modules/` et `solace.db` et `*.log` sont dans `.gitignore`
