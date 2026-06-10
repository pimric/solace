#!/usr/bin/env node
// Vérifie que toutes les tables attendues existent dans solace.db
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const EXPECTED_TABLES = ['plants', 'bots', 'garden_events', 'weather_conditions', 'garden_resources'];

const db = new sqlite3.Database(path.join(__dirname, '..', 'solace.db'), sqlite3.OPEN_READONLY);

db.all(`SELECT name FROM sqlite_master WHERE type='table'`, [], (err, rows) => {
  db.close();
  if (err) { console.error('❌ DB inaccessible:', err.message); process.exit(1); }

  const existing = rows.map(r => r.name);
  const missing  = EXPECTED_TABLES.filter(t => !existing.includes(t));

  if (missing.length) {
    console.error(`❌ Tables manquantes: ${missing.join(', ')}`);
    console.error('   → Lancer: node migrate.js');
    process.exit(1);
  }
  console.log('✅ DB OK — toutes les tables présentes');
  process.exit(0);
});
