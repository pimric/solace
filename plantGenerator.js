// Génère paramètres visuels d'une plante via Groq API
// Fallback : paramètres aléatoires cohérents si API indisponible

const axios = require('axios');

const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const ENDEMIC = {
  PSE: ['Anémone Palestine', 'Olivier', 'Chardon des sables'],
  SDN: ['Acacia épineux', 'Baobab', 'Euphorbe'],
  UKR: ['Tournesol', 'Bleuet', 'Herbe des steppes'],
  MMR: ['Orchidée Padauk', 'Bambou', 'Fougère'],
  YEM: ['Anémone Palestine', 'Acacia épineux', 'Euphorbe'],
};

const VICTIM_PRESETS = {
  child: {
    stem_height: [0.2, 0.5], stem_curve: [0.1, 0.3],
    leaf_count: [2, 5], petal_count: [6, 12],
    leaf_shape: 'tiny', petal_shape: 'delicate',
    plant_type: 'wildflower', glow_intensity: [0.6, 0.9],
  },
  woman: {
    stem_height: [0.5, 1.0], stem_curve: [0.3, 0.7],
    leaf_count: [4, 8], petal_count: [5, 8],
    leaf_shape: 'elongated', petal_shape: 'curved',
    plant_type: 'flowering', glow_intensity: [0.5, 0.7],
  },
  elderly: {
    stem_height: [0.3, 0.6], stem_curve: [0.0, 0.15],
    leaf_count: [6, 12], petal_count: [3, 6],
    leaf_shape: 'wide', petal_shape: 'broad',
    plant_type: 'groundcover', glow_intensity: [0.3, 0.5],
  },
  adult: {
    stem_height: [0.7, 1.4], stem_curve: [0.1, 0.3],
    leaf_count: [5, 10], petal_count: [4, 7],
    leaf_shape: 'oval', petal_shape: 'round',
    plant_type: 'herb', glow_intensity: [0.4, 0.6],
  },
  combatant: {
    stem_height: [1.2, 1.8], stem_curve: [0.0, 0.05],
    leaf_count: [2, 5], petal_count: [0, 0],
    leaf_shape: 'lance', petal_shape: 'none',
    plant_type: 'shrub', glow_intensity: [0.1, 0.25],
  },
};

function randRange([min, max]) {
  return min + Math.random() * (max - min);
}

function fallbackParams(victimType, countryCode) {
  const preset = VICTIM_PRESETS[victimType] || VICTIM_PRESETS.adult;
  const endemic = ENDEMIC[countryCode] || ENDEMIC.UKR;
  const species = endemic[Math.floor(Math.random() * endemic.length)];

  const colors = {
    child:     { primary: '#5a7c5a', secondary: '#3a5c3a' },
    woman:     { primary: '#4a6c5a', secondary: '#3a5c4a' },
    elderly:   { primary: '#3a5c3a', secondary: '#2d4a2d' },
    adult:     { primary: '#3a5c3a', secondary: '#2d4a2d' },
    combatant: { primary: '#2a3c2a', secondary: '#1a2c1a' },
  };
  const c = colors[victimType] || colors.adult;

  return {
    stem_height: Math.round(randRange(preset.stem_height) * 100) / 100,
    stem_curve: Math.round(randRange(preset.stem_curve) * 100) / 100,
    leaf_count: Math.round(randRange(preset.leaf_count)),
    leaf_shape: preset.leaf_shape,
    petal_count: Math.round(randRange(preset.petal_count)),
    petal_shape: preset.petal_shape,
    primary_color: c.primary,
    secondary_color: c.secondary,
    glow_intensity: Math.round(randRange(preset.glow_intensity) * 100) / 100,
    plant_type: preset.plant_type,
    endemic_species: species,
  };
}

async function generateParams(victimType, countryCode, context = {}) {
  if (!GROQ_KEY) return fallbackParams(victimType, countryCode);

  const preset = VICTIM_PRESETS[victimType] || VICTIM_PRESETS.adult;
  const endemic = (ENDEMIC[countryCode] || []).join(', ');

  const prompt = `Tu génères les paramètres visuels d'une plante mémorielle pixel art pour l'installation artistique SOLACE.

Victime : ${victimType} | Pays : ${countryCode} | Flore endémique : ${endemic}
Contexte : ${context.event_type || 'conflit armé'}, ${context.fatalities || 1} victimes

Réponds UNIQUEMENT avec un JSON valide, pas de commentaires :
{
  "stem_height": <float ${preset.stem_height[0]}-${preset.stem_height[1]}>,
  "stem_curve": <float ${preset.stem_curve[0]}-${preset.stem_curve[1]}>,
  "leaf_count": <int ${preset.leaf_count[0]}-${preset.leaf_count[1]}>,
  "leaf_shape": "${preset.leaf_shape}",
  "petal_count": <int ${preset.petal_count[0]}-${preset.petal_count[1]}>,
  "petal_shape": "${preset.petal_shape}",
  "primary_color": <hex sombre vert/ocre>,
  "secondary_color": <hex plus sombre>,
  "glow_intensity": <float 0-1>,
  "plant_type": "${preset.plant_type}",
  "endemic_species": <une espèce parmi [${endemic}]>
}`;

  try {
    const { data } = await axios.post(GROQ_URL, {
      model: 'llama3-8b-8192',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.7,
    }, {
      headers: { Authorization: `Bearer ${GROQ_KEY}` },
      timeout: 8000,
    });

    const text = data.choices?.[0]?.message?.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallbackParams(victimType, countryCode);

    const params = JSON.parse(match[0]);
    // Valider et coerce les valeurs dans les bornes
    const fallback = fallbackParams(victimType, countryCode);
    return {
      stem_height: Math.min(Math.max(params.stem_height ?? fallback.stem_height, preset.stem_height[0]), preset.stem_height[1]),
      stem_curve: Math.min(Math.max(params.stem_curve ?? fallback.stem_curve, 0), 1),
      leaf_count: Math.min(Math.max(Math.round(params.leaf_count ?? fallback.leaf_count), 1), 16),
      leaf_shape: params.leaf_shape || fallback.leaf_shape,
      petal_count: Math.min(Math.max(Math.round(params.petal_count ?? fallback.petal_count), 0), 16),
      petal_shape: params.petal_shape || fallback.petal_shape,
      primary_color: /^#[0-9a-f]{6}$/i.test(params.primary_color) ? params.primary_color : fallback.primary_color,
      secondary_color: /^#[0-9a-f]{6}$/i.test(params.secondary_color) ? params.secondary_color : fallback.secondary_color,
      glow_intensity: Math.min(Math.max(params.glow_intensity ?? fallback.glow_intensity, 0), 1),
      plant_type: params.plant_type || fallback.plant_type,
      endemic_species: params.endemic_species || fallback.endemic_species,
    };
  } catch {
    return fallbackParams(victimType, countryCode);
  }
}

module.exports = { generateParams, fallbackParams };
