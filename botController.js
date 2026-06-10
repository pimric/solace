// Comportements des 5 bots - tick synchrone avec gardenEngine

const GARDEN_RADIUS = 50;

function rand(min, max) { return min + Math.random() * (max - min); }
function dist(a, b) { return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2); }

// Retourne les états mis à jour des bots
async function tick(db) {
  const bots = await getBots(db);
  const plants = await getPlants(db);
  const now = new Date().toISOString();

  const updates = bots.map(bot => {
    switch (bot.role) {
      case 'arroseur':     return tickArroseur(bot, plants, now);
      case 'veilleur':     return tickVeilleur(bot, plants, now);
      case 'memorialiste': return tickMemorialiste(bot, plants, now);
      case 'tailleur':     return tickTailleur(bot, plants, now);
      case 'chercheur':    return tickChercheur(bot, plants, now);
      default: return bot;
    }
  });

  await saveBots(db, updates);
  return updates;
}

// Arroseur : cherche plante la plus assoiffée
function tickArroseur(bot, plants, now) {
  const thirsty = plants
    .filter(p => p.is_alive && p.water_level < 40)
    .sort((a, b) => a.water_level - b.water_level);

  if (thirsty.length === 0) {
    return moveToward(bot, { x: rand(-GARDEN_RADIUS, GARDEN_RADIUS), y: rand(-GARDEN_RADIUS, GARDEN_RADIUS) }, 2, 'wandering', now);
  }

  const target = thirsty[0];
  const moved = moveToward(bot, { x: target.pos_x, y: target.pos_z }, 3, 'working', now);
  moved.target_plant_id = target.id;
  return moved;
}

// Veilleur : patrouille périmètre, s'précipite vers nouvelles plantes
function tickVeilleur(bot, plants, now) {
  const recent = plants.filter(p => {
    const age = (Date.now() - new Date(p.created_at).getTime()) / 1000;
    return age < 120;
  });

  if (recent.length > 0) {
    const t = recent[0];
    return moveToward(bot, { x: t.pos_x, y: t.pos_z }, 5, 'rushing', now);
  }

  // Patrouille périmètre circulaire
  const angle = (Date.now() / 8000) % (Math.PI * 2);
  const tx = Math.cos(angle) * GARDEN_RADIUS * 0.8;
  const ty = Math.sin(angle) * GARDEN_RADIUS * 0.8;
  return moveToward(bot, { x: tx, y: ty }, 2, 'patrolling', now);
}

// Mémorialiste : erratique, s'arrête au hasard
function tickMemorialiste(bot, plants, now) {
  const r = Math.random();

  if (r < 0.15) {
    // S'arrête - déclenche souvenir
    const target = plants[Math.floor(Math.random() * plants.length)];
    if (target) {
      return { ...bot, state: 'paused', target_plant_id: target.id, last_action: 'memory', last_action_at: now };
    }
  }

  if (bot.state === 'paused' && Math.random() < 0.3) {
    return { ...bot, state: 'wandering', last_action_at: now };
  }

  if (bot.state === 'paused') return bot;

  // Mouvement erratique
  const dx = rand(-8, 8);
  const dy = rand(-8, 8);
  return moveToward(bot, { x: bot.pos_x + dx, y: bot.pos_y + dy }, 1.5, 'wandering', now);
}

// Tailleur : inactif si <200 plantes, réorganise sinon
function tickTailleur(bot, plants, now) {
  const alive = plants.filter(p => p.is_alive);
  if (alive.length < 200) {
    return { ...bot, state: 'dormant', last_action_at: now };
  }

  // Cherche plantes trop proches (>10 voisins dans rayon 5)
  const crowded = alive.find(p => {
    const neighbors = alive.filter(q => q.id !== p.id && dist({ x: p.pos_x, y: p.pos_z }, { x: q.pos_x, y: q.pos_z }) < 5);
    return neighbors.length > 10;
  });

  if (crowded) {
    return moveToward(bot, { x: crowded.pos_x, y: crowded.pos_z }, 2, 'organizing', now);
  }

  return moveToward(bot, { x: rand(-20, 20), y: rand(-20, 20) }, 1, 'wandering', now);
}

// Chercheur : dormant, s'active si sécheresse globale
function tickChercheur(bot, plants, now) {
  const alive = plants.filter(p => p.is_alive);
  if (alive.length === 0) return { ...bot, state: 'dormant' };

  const avgWater = alive.reduce((s, p) => s + p.water_level, 0) / alive.length;

  if (avgWater > 40) {
    return { ...bot, state: 'dormant', last_action_at: now };
  }

  // Zigzag anxieux
  const t = Date.now() / 500;
  const tx = Math.sin(t) * GARDEN_RADIUS * 0.6;
  const ty = Math.cos(t * 1.3) * GARDEN_RADIUS * 0.6;
  return moveToward(bot, { x: tx, y: ty }, 4, 'searching', now);
}

function moveToward(bot, target, speed, state, now) {
  const dx = target.x - bot.pos_x;
  const dy = target.y - bot.pos_y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.5) return { ...bot, state, last_action_at: now };
  const nx = bot.pos_x + (dx / d) * Math.min(speed, d);
  const ny = bot.pos_y + (dy / d) * Math.min(speed, d);
  return { ...bot, pos_x: nx, pos_y: ny, state, last_action: 'move', last_action_at: now };
}

function getBots(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM bots', [], (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function getPlants(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM plants', [], (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function saveBots(db, bots) {
  return new Promise(resolve => {
    let done = 0;
    if (bots.length === 0) return resolve();
    for (const b of bots) {
      db.run(
        `UPDATE bots SET pos_x=?, pos_y=?, state=?, target_plant_id=?, last_action=?, last_action_at=? WHERE id=?`,
        [b.pos_x, b.pos_y, b.state, b.target_plant_id || null, b.last_action || null, b.last_action_at, b.id],
        () => { if (++done === bots.length) resolve(); }
      );
    }
  });
}

module.exports = { tick };
