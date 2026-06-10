#!/usr/bin/env node
// Statut rapide de la DB SOLACE
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '..', 'solace.db'), sqlite3.OPEN_READONLY);

function q(sql, params = []) {
  return new Promise((res, rej) => db.get(sql, params, (e, r) => e ? rej(e) : res(r)));
}
function qa(sql, params = []) {
  return new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r)));
}

async function main() {
  const stats     = await q(`SELECT COUNT(*) as total, SUM(CASE WHEN is_alive=1 THEN 1 ELSE 0 END) as alive, SUM(CASE WHEN victim_type='civilian' THEN 1 ELSE 0 END) as civilians, SUM(CASE WHEN victim_type='combatant' THEN 1 ELSE 0 END) as combatants FROM plants`);
  const countries = await qa(`SELECT country_code, COUNT(*) as n, SUM(CASE WHEN is_alive=1 THEN 1 ELSE 0 END) as alive FROM plants GROUP BY country_code ORDER BY n DESC`);
  const bots      = await qa(`SELECT role, state, COUNT(*) as n FROM bots GROUP BY role, state`);
  const tick      = await q(`SELECT value FROM garden_resources WHERE key='garden_tick_count'`);
  const grief     = await q(`SELECT value FROM garden_resources WHERE key='grief_pause_until'`);
  const water     = await q(`SELECT AVG(water_level) as avg_water, AVG(health) as avg_health FROM plants WHERE is_alive=1`);

  const dead = stats.total - stats.alive;
  const pct  = v => `${Math.round(v)}%`;

  console.log('\n── SOLACE status ──────────────────────────');
  console.log(`  Plantes     : ${stats.total} total  |  ${stats.alive} vivantes  |  ${dead} mortes`);
  console.log(`  Victimes    : ${stats.civilians} civils  |  ${stats.combatants} combattants`);
  console.log(`  Santé moy.  : eau ${pct(water.avg_water)}  |  health ${pct(water.avg_health)}`);
  console.log(`  Tick garden : #${tick?.value || 0}`);
  if (grief?.value && new Date(grief.value) > new Date())
    console.log(`  Grief pause : jusqu'à ${grief.value}`);

  console.log('\n  Par pays :');
  for (const c of countries)
    console.log(`    ${c.country_code.padEnd(4)}  ${String(c.n).padStart(4)} plantes  |  ${c.alive} vivantes`);

  if (bots.length) {
    console.log('\n  Bots :');
    for (const b of bots)
      console.log(`    ${b.role.padEnd(12)} ${b.state.padEnd(10)} ×${b.n}`);
  }
  console.log('───────────────────────────────────────────\n');
}

main().catch(e => { console.error(e.message); process.exit(1); }).finally(() => db.close());
