// Seed SOLACE - données représentatives Gaza/Soudan/Ukraine/Myanmar/Yémen

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'solace.db'));

const GARDEN_ZONES = {
  PSE: { cx: -100, cz: -35 },
  SDN: { cx:  -80, cz: -45 },
  UKR: { cx:  100, cz:  35 },
  MMR: { cx:  140, cz:  25 },
  YEM: { cx:  120, cz:  42 },
};

// Palettes par pays — tiges / fleurs
const COUNTRY_PALETTE = {
  PSE: { stem: ['#4a6c3a','#3a5c2a','#5a7c3a'], petal: ['#c8a05a','#d4b06a','#b89050'] },
  SDN: { stem: ['#5c4a2a','#6c5a3a','#4a3a1a'], petal: ['#c8843a','#b8743a','#d8943a'] },
  UKR: { stem: ['#4a6c4a','#3a5c3a','#5a7c4a'], petal: ['#d4c03a','#e8d04a','#c4b030'] },
  MMR: { stem: ['#3a4c5a','#4a5c6a','#2a3c4a'], petal: ['#8c5c9c','#9c6cac','#7c4c8c'] },
  YEM: { stem: ['#5a5a3a','#4a4a2a','#6a6a4a'], petal: ['#c89070','#b88060','#d8a080'] },
};

// Paramètres visuels par type de victime
const VICTIM_VISUAL = {
  child: {
    stem_h: [0.15, 0.45], curve: [0.1, 0.5],
    leaves: [2, 4], petals: [7, 12],
    glow: [0.6, 0.9],
  },
  woman: {
    stem_h: [0.5, 0.9], curve: [0.3, 0.7],
    leaves: [4, 7], petals: [5, 8],
    glow: [0.5, 0.7],
  },
  elderly: {
    stem_h: [0.25, 0.5], curve: [0.0, 0.2],
    leaves: [5, 9], petals: [3, 5],
    glow: [0.3, 0.5],
  },
  adult: {
    stem_h: [0.7, 1.3], curve: [0.1, 0.4],
    leaves: [4, 8], petals: [4, 7],
    glow: [0.4, 0.6],
  },
  combatant: {
    stem_h: [1.2, 1.9], curve: [0.0, 0.08],
    leaves: [2, 4], petals: [0, 0],
    glow: [0.1, 0.2],
  },
};

function rr([min, max]) { return min + Math.random() * (max - min); }
function ri([min, max]) { return Math.round(rr([min, max])); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function plantParams(subType, victimType, countryCode) {
  const v = VICTIM_VISUAL[subType] || VICTIM_VISUAL.adult;
  const pal = COUNTRY_PALETTE[countryCode] || COUNTRY_PALETTE.UKR;
  const isCivilian = victimType === 'civilian';

  return {
    victim_type: victimType,
    stem_height:  Math.round(rr(v.stem_h) * 100) / 100,
    stem_curve:   Math.round(rr(v.curve) * 100) / 100,
    leaf_count:   ri(v.leaves),
    petal_count:  isCivilian ? ri(v.petals) : 0,
    primary_color:   pick(pal.stem),
    secondary_color: isCivilian ? pick(pal.petal) : '#1a2a1a',
    glow_intensity:  Math.round(rr(v.glow) * 100) / 100,
  };
}

// Événements : fatalities totales réparties en sous-types
const EVENTS = [
  { country_code: 'PSE', conflict_name: 'Gaza 2023-24',
    civilians: 18, children: 7, women: 5, elderly: 2, combatants: 4 },
  { country_code: 'SDN', conflict_name: 'Darfour 2023',
    civilians: 12, children: 3, women: 3, elderly: 1, combatants: 3 },
  { country_code: 'UKR', conflict_name: 'Ukraine 2022-24',
    civilians: 14, children: 2, women: 4, elderly: 3, combatants: 5 },
  { country_code: 'MMR', conflict_name: 'Myanmar 2021-24',
    civilians: 10, children: 3, women: 2, elderly: 1, combatants: 2 },
  { country_code: 'YEM', conflict_name: 'Yémen 2021-24',
    civilians: 8,  children: 2, women: 2, elderly: 1, combatants: 2 },
];

function expandEvent(event) {
  const zone = GARDEN_ZONES[event.country_code];
  const rows = [];

  const groups = [
    { n: event.children,   sub: 'child',     vt: 'civilian' },
    { n: event.women,      sub: 'woman',     vt: 'civilian' },
    { n: event.elderly,    sub: 'elderly',   vt: 'civilian' },
    { n: event.civilians,  sub: 'adult',     vt: 'civilian' },
    { n: event.combatants, sub: 'combatant', vt: 'combatant' },
  ];

  for (const g of groups) {
    for (let i = 0; i < g.n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 12;
      rows.push({
        conflict_name: event.conflict_name,
        country_code: event.country_code,
        pos_x: zone.cx + Math.cos(angle) * r,
        pos_z: zone.cz + Math.sin(angle) * r,
        ...plantParams(g.sub, g.vt, event.country_code),
      });
    }
  }
  return rows;
}

db.serialize(() => {
  db.run('DELETE FROM plants');
  const stmt = db.prepare(`
    INSERT INTO plants
      (conflict_name, country_code, victim_type,
       stem_height, stem_curve, leaf_count, petal_count,
       primary_color, secondary_color, glow_intensity,
       pos_x, pos_z, is_alive, health, water_level)
    VALUES (?,?,?, ?,?,?,?, ?,?,?, ?,?,1,100,100)`);

  for (const ev of EVENTS) {
    for (const r of expandEvent(ev)) {
      stmt.run(
        r.conflict_name, r.country_code, r.victim_type,
        r.stem_height, r.stem_curve, r.leaf_count, r.petal_count,
        r.primary_color, r.secondary_color, r.glow_intensity,
        r.pos_x, r.pos_z
      );
    }
  }
  stmt.finalize(() => {
    db.get('SELECT COUNT(*) as n, COUNT(DISTINCT primary_color) as colors FROM plants', (e, row) => {
      console.log(`Seeded ${row.n} plants, ${row.colors} distinct colors`);
      db.close();
    });
  });
});
