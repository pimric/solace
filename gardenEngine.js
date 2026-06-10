// Boucle principale SOLACE - tick toutes les 30s
const botController = require('./botController');
const waterSystem = require('./waterSystem');
const { makeLogger } = require('./logger');
const log = makeLogger('gardenEngine');

const TICK_MS = 30000;
const GRIEF_THRESHOLD = 100;

let _db, _wss;

function broadcast(type, payload) {
  if (global.broadcast) global.broadcast(type, payload);
}

async function tick() {
  try {
    const tickNum = await incrementTick();

    // Vérifier grief_pause
    const griefUntil = await getResource('grief_pause_until');
    if (griefUntil && new Date(griefUntil) > new Date()) {
      broadcast('grief_pause', { until: griefUntil });
      return;
    }

    // Eau : appliquer toutes les sources
    const waterDeltas = await waterSystem.computeDeltas(_db);
    await applyWaterDeltas(waterDeltas);

    // Santé des plantes
    await updatePlantHealth();

    // Mouvement bots
    const botStates = await botController.tick(_db);
    broadcast('bots_update', { bots: botStates });

    // Arrosage effectif par bots proches
    await applyBotWatering(botStates);

    // Plantes modifiées -> broadcast
    const plants = await getAlivePlants();
    broadcast('plants_update', { plants, tick: tickNum });

  } catch (err) {
    log.error('tick failed', { message: err.message, stack: err.stack });
  }
}

// Arroseur applique +8 eau si à moins de 3 unités de sa cible
async function applyBotWatering(bots) {
  return new Promise(resolve => {
    const arroseurs = bots.filter(b => b.role === 'arroseur' && b.state === 'working' && b.target_plant_id);
    if (arroseurs.length === 0) return resolve();
    let done = 0;
    for (const bot of arroseurs) {
      _db.get('SELECT pos_x, pos_z FROM plants WHERE id=? AND is_alive=1', [bot.target_plant_id], (err, plant) => {
        if (plant) {
          const d = Math.sqrt((bot.pos_x - plant.pos_x) ** 2 + (bot.pos_y - plant.pos_z) ** 2);
          if (d < 3) {
            _db.run('UPDATE plants SET water_level=MIN(100,water_level+8) WHERE id=?', [bot.target_plant_id]);
          }
        }
        if (++done === arroseurs.length) resolve();
      });
    }
  });
}

async function applyWaterDeltas(deltas) {
  return new Promise(resolve => {
    if (!deltas || deltas.length === 0) return resolve();
    let done = 0;
    for (const { plant_id, delta } of deltas) {
      _db.run(
        `UPDATE plants SET water_level=MAX(0,MIN(100,water_level+?)) WHERE id=?`,
        [delta, plant_id],
        () => { if (++done === deltas.length) resolve(); }
      );
    }
  });
}

async function updatePlantHealth() {
  return new Promise(resolve => {
    // Arbres (>1000 fatalités) ne meurent jamais de sécheresse
    _db.run(`
      UPDATE plants SET
        health = CASE
          WHEN fatalities >= 1000 THEN MAX(health, 20)
          WHEN water_level < 10   THEN MAX(0, health - 0.001)
          WHEN water_level < 30   THEN MAX(0, health - 0.0005)
          WHEN water_level > 70   THEN MIN(100, health + 0.1)
          ELSE health
        END,
        is_alive = CASE
          WHEN fatalities >= 1000 THEN 1
          WHEN health <= 0        THEN 0
          ELSE is_alive
        END,
        died_at = CASE
          WHEN fatalities < 1000 AND health <= 0 AND died_at IS NULL THEN datetime('now')
          ELSE died_at
        END,
        death_reason = CASE
          WHEN fatalities < 1000 AND health <= 0 AND death_reason IS NULL THEN 'drought'
          ELSE death_reason
        END
    `, resolve);
  });
}

async function getAlivePlants() {
  return new Promise((resolve, reject) => {
    _db.all('SELECT * FROM plants', [], (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}

async function incrementTick() {
  return new Promise(resolve => {
    _db.get(`SELECT value FROM garden_resources WHERE key='garden_tick_count'`, [], (err, row) => {
      const n = parseInt(row?.value || '0') + 1;
      _db.run(`UPDATE garden_resources SET value=?, updated_at=datetime('now') WHERE key='garden_tick_count'`, [String(n)]);
      resolve(n);
    });
  });
}

async function getResource(key) {
  return new Promise(resolve => {
    _db.get(`SELECT value FROM garden_resources WHERE key=?`, [key], (err, row) => {
      resolve(row?.value || null);
    });
  });
}

// Détection événement massif -> grief_pause 30s
function checkGriefPause(fatalities) {
  if (fatalities >= GRIEF_THRESHOLD) {
    const until = new Date(Date.now() + 30000).toISOString();
    _db.run(`UPDATE garden_resources SET value=? WHERE key='grief_pause_until'`, [until]);
    broadcast('grief_pause', { until });
  }
}
global.checkGriefPause = checkGriefPause;

function start(db, wss) {
  _db = db;
  _wss = wss;
  tick();
  setInterval(tick, TICK_MS);
  log.info(`started tick=${TICK_MS}ms`);
}

module.exports = { start };
