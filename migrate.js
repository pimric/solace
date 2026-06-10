// Migration SQLite - SOLACE
// Crée les nouvelles tables, préserve conflict_data existante

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'solace.db'));

const migrations = [
  `CREATE TABLE IF NOT EXISTS plants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conflict_name TEXT,
    country_code TEXT,
    country_lat REAL,
    country_lng REAL,
    event_date TEXT,
    fatalities INTEGER DEFAULT 0,
    civilian_fatalities INTEGER DEFAULT 0,
    children_fatalities INTEGER DEFAULT 0,
    women_fatalities INTEGER DEFAULT 0,
    event_type TEXT,
    victim_type TEXT CHECK(victim_type IN ('civilian','combatant','unknown')) DEFAULT 'unknown',
    stem_height REAL DEFAULT 1.0,
    stem_curve REAL DEFAULT 0.0,
    leaf_count INTEGER DEFAULT 4,
    leaf_shape TEXT DEFAULT 'oval',
    petal_count INTEGER DEFAULT 5,
    petal_shape TEXT DEFAULT 'round',
    primary_color TEXT DEFAULT '#3a5c3a',
    secondary_color TEXT DEFAULT '#2d4a2d',
    glow_intensity REAL DEFAULT 0.5,
    plant_type TEXT DEFAULT 'herb',
    endemic_species TEXT,
    pos_x REAL DEFAULT 0,
    pos_z REAL DEFAULT 0,
    water_level REAL DEFAULT 100.0,
    health REAL DEFAULT 100.0,
    is_alive INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    died_at TEXT,
    death_reason TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS bots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT CHECK(role IN ('arroseur','veilleur','memorialiste','tailleur','chercheur')) NOT NULL,
    pos_x REAL DEFAULT 0,
    pos_y REAL DEFAULT 0,
    target_plant_id INTEGER REFERENCES plants(id),
    state TEXT DEFAULT 'idle',
    color TEXT,
    last_action TEXT,
    last_action_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS garden_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    description TEXT,
    related_plant_id INTEGER REFERENCES plants(id),
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS weather_conditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    country_code TEXT UNIQUE NOT NULL,
    rain_intensity REAL DEFAULT 0.0,
    sun_intensity REAL DEFAULT 1.0,
    updated_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS garden_resources (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_plants_country ON plants(country_code)`,
  `CREATE INDEX IF NOT EXISTS idx_plants_alive ON plants(is_alive)`,
  `CREATE INDEX IF NOT EXISTS idx_plants_victim_type ON plants(victim_type)`,
  `CREATE INDEX IF NOT EXISTS idx_garden_events_type ON garden_events(event_type)`,
];

db.serialize(() => {
  db.run('BEGIN TRANSACTION');
  let errors = 0;

  for (const sql of migrations) {
    db.run(sql, (err) => {
      if (err) {
        console.error('Migration error:', err.message);
        errors++;
      }
    });
  }

  // Initialiser les ressources de base du jardin
  const resources = [
    ['garden_water_total', '500'],
    ['garden_tick_count', '0'],
    ['grief_pause_until', null],
    ['last_backup_at', null],
  ];

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO garden_resources(key, value) VALUES (?, ?)`
  );
  for (const [key, value] of resources) {
    stmt.run(key, value);
  }
  stmt.finalize();

  db.run('COMMIT', (err) => {
    if (err) {
      console.error('Commit error:', err.message);
    } else {
      console.log('Migration terminée. Tables créées : plants, bots, garden_events, weather_conditions, garden_resources');
    }
    db.close();
  });
});
