// 4 sources d'eau + modificateurs
// 1. Visiteurs (8s hover) -> géré côté WS dans server.js
// 2. Pluie météo réelle du pays d'origine
// 3. Ensoleillement (x0.5 à x1.5)
// 4. Accords de paix / cessez-le-feu (NewsAPI)

const axios = require('axios');
const { makeLogger } = require('./logger');
const log = makeLogger('waterSystem');

const OWM_KEY = process.env.OPENWEATHER_KEY || '';
const NEWS_KEY = process.env.NEWS_API_KEY || '';

// Cache météo 10min
const weatherCache = {};
const CACHE_TTL = 600000;

// Retourne tableau { plant_id, delta } pour tous les plantes
async function computeDeltas(db) {
  const plants = await getAlivePlants(db);
  if (plants.length === 0) return [];

  // Pays uniques
  const countryCodes = [...new Set(plants.map(p => p.country_code))];

  // Météo par pays
  const weatherMap = {};
  await Promise.all(countryCodes.map(async code => {
    weatherMap[code] = await getWeather(db, code);
  }));

  // Paix active ?
  const peaceActive = await checkPeaceNews(countryCodes);

  // Facteur solaire : courbe sinus, pic à 12h UTC, nul de 18h à 6h
  const now = new Date();
  const hourFloat = now.getUTCHours() + now.getUTCMinutes() / 60;
  const solarFactor = Math.max(0, Math.sin((hourFloat - 6) / 12 * Math.PI));

  // Rosée matinale : légère recharge entre 4h30 et 7h UTC
  const isDew = hourFloat >= 4.5 && hourFloat < 7;

  const deltas = [];
  for (const p of plants) {
    const w = weatherMap[p.country_code] || { rain: 0, sun: 0.5 };
    let delta = 0;

    // Pluie : +0 à +10
    delta += w.rain * 10;

    // Évaporation solaire (nuages réduisent l'évap) — calibrée pour ~1 mois
    delta -= solarFactor * w.sun * 0.003;

    // Rosée matinale : +0.001 par tick
    if (isDew) delta += 0.001;

    // Paix : +5 bonus
    if (peaceActive[p.country_code]) delta += 5;

    deltas.push({ plant_id: p.id, delta: Math.round(delta * 100000) / 100000 });
  }

  return deltas;
}

async function getWeather(db, countryCode) {
  const cached = weatherCache[countryCode];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const coords = {
    PSE: { lat: 31.5, lon: 34.47 },
    SDN: { lat: 15.5, lon: 32.5 },
    UKR: { lat: 48.8, lon: 31.2 },
    MMR: { lat: 19.7, lon: 96.1 },
    YEM: { lat: 15.5, lon: 48.5 },
  };

  const c = coords[countryCode];
  if (!c || !OWM_KEY) {
    return { rain: 0, sun: 0.5 }; // fallback neutre/sec — cohérent zones de conflit
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${c.lat}&lon=${c.lon}&appid=${OWM_KEY}`;
    const { data } = await axios.get(url, { timeout: 5000 });

    const rain = data.rain ? Math.min(1, (data.rain['1h'] || 0) / 10) : 0;
    const clouds = (data.clouds?.all || 0) / 100;
    const sun = 1 - clouds * 0.5; // x0.5 nuageux -> x1.0 dégagé

    const result = { rain, sun };
    weatherCache[countryCode] = { ts: Date.now(), data: result };

    // Persist en DB
    db.run(
      `INSERT OR REPLACE INTO weather_conditions(country_code, rain_intensity, sun_intensity, updated_at)
       VALUES(?, ?, ?, datetime('now'))`,
      [countryCode, rain, sun]
    );

    return result;
  } catch (err) {
    log.warn('weather fetch failed', { country: countryCode, message: err.message });
    return { rain: 0.1, sun: 1.0 };
  }
}

// Cache paix 1h
let peaceCache = { ts: 0, data: {} };

async function checkPeaceNews(countryCodes) {
  if (Date.now() - peaceCache.ts < 3600000) return peaceCache.data;
  if (!NEWS_KEY) return {};

  const peaceMap = {};
  try {
    const query = 'ceasefire OR "peace agreement" OR "cessez-le-feu"';
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=20&apiKey=${NEWS_KEY}`;
    const { data } = await axios.get(url, { timeout: 8000 });

    const countryNames = { PSE: 'gaza', SDN: 'sudan', UKR: 'ukraine', MMR: 'myanmar', YEM: 'yemen' };
    for (const [code, name] of Object.entries(countryNames)) {
      peaceMap[code] = data.articles?.some(a =>
        (a.title + ' ' + (a.description || '')).toLowerCase().includes(name)
      ) || false;
    }
  } catch (err) {
    log.warn('peace news fetch failed', { message: err.message });
  }

  peaceCache = { ts: Date.now(), data: peaceMap };
  return peaceMap;
}

function getAlivePlants(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, country_code, water_level FROM plants WHERE is_alive=1', [], (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}

module.exports = { computeDeltas };
