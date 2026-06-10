// Scène principale Phaser - jardin isométrique SOLACE

const TILE_W = 28;
const TILE_H = 14;
const WORLD_SCALE = 0.25;

// Pentagone iso : 5 zones équidistantes autour du centre (0,0)
const GARDEN_ZONES = [
  { code: 'PSE', cx: -57, cz: -57 },  // sommet
  { code: 'UKR', cx:  10, cz: -45 },  // haut droite
  { code: 'MMR', cx:  63, cz:  29 },  // bas droite
  { code: 'YEM', cx:  29, cz:  63 },  // bas gauche
  { code: 'SDN', cx: -45, cz:  10 },  // haut gauche
];

// 5 zones + centre — bots empruntent les rayons du pentagone
const PATH_NODES = [
  { id: 0, x: -57, z: -57 },  // PSE
  { id: 1, x:  10, z: -45 },  // UKR
  { id: 2, x:  63, z:  29 },  // MMR
  { id: 3, x:  29, z:  63 },  // YEM
  { id: 4, x: -45, z:  10 },  // SDN
  { id: 5, x:   0, z:   0 },  // centre
];
const PATH_EDGES = {
  0: [1, 4, 5],
  1: [0, 2, 5],
  2: [1, 3, 5],
  3: [2, 4, 5],
  4: [3, 0, 5],
  5: [0, 1, 2, 3, 4],
};

class GardenScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GardenScene' });
    this.plants = [];        // données brutes serveur
    this.viewPlants = [];    // plantes effectivement rendues
    this._botAnim = {};
    this.ws = null;
    this.griefPause = false;
    this.hoverPlantId = null;
    this.hoverTimer = null;
    this.WATER_HOVER_MS = 8000;

    this._cam = { x: 0, z: 0 };
    this._center = { x: 0, z: 0 };
    this._texKey = 'plantTex';
    this._texVer = 0;
    this._dirty = true;
    this._viewScale = 1;
    this._imgX = 0;
    this._imgY = 0;
    this._texMinX = 0;
    this._texMinY = 0;
    // Navigation
    this._panX = 0;
    this._panY = 0;
    this._zoom = 1.0;
    this._dragging = false;
    this._dragOrigin = { x: 0, y: 0 };
    // Outils
    this._activeTool = 'navigate';
    this._candles = [];      // { wx, wz, born }
    this._mouseX = 0;
    this._mouseY = 0;
  }

  preload() {}

  create() {
    this.plantRenderer = new PlantRenderer(this);
    this.propRenderer = new PropRenderer(this);
    this.botRenderer = new BotRenderer(this);

    this.botGraphics      = this.add.graphics().setDepth(1);
    this.fountainGraphics = this.add.graphics().setDepth(0.8);
    this.candleGraphics   = this.add.graphics().setDepth(1.5);
    this.cursorGraphics   = this.add.graphics().setDepth(10);

    this.connectWS();
    this.setupInput();

    this.scale.on('resize', () => { this._dirty = true; });
  }

  update(time, _delta) {
    if (this._dirty) {
      this._dirty = false;
      this._buildPlantTexture();
    }
    this._positionPlantLayer();
    this._updateZoneLabels();
    this.botRenderer.tick();
    this._drawBots();
    this._drawAnimatedFountain(time);
    this._drawCandles(time);
    this._drawCursor(time);
    this._updateDayNight();
  }

  _updateDayNight() {
    const now = new Date();
    const h = now.getUTCHours() + now.getUTCMinutes() / 60;

    // Palettes clés : [r, g, b] pour chaque phase — couleurs horizon (bas) et zénith (haut)
    const PALETTE = {
      midnight: { top: [2,3,8],     bot: [4,5,14]   },
      dawn:     { top: [15,8,25],   bot: [40,18,20]  },
      sunrise:  { top: [40,20,15],  bot: [80,45,20]  },
      day:      { top: [18,30,65],  bot: [50,70,110] },
      noon:     { top: [25,45,90],  bot: [65,95,145] },
      dusk:     { top: [50,22,8],   bot: [90,50,15]  },
      sunset:   { top: [30,10,5],   bot: [70,28,10]  },
      night:    { top: [3,4,12],    bot: [6,7,18]    },
    };

    const lerp  = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const lerpP = (a, b, t) => ({ top: lerp(a.top, b.top, t), bot: lerp(a.bot, b.bot, t) });
    const toN   = rgb => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];

    let pal;
    if      (h < 1)  pal = lerpP(PALETTE.night,    PALETTE.midnight, h);
    else if (h < 5)  pal = PALETTE.midnight;
    else if (h < 6)  pal = lerpP(PALETTE.midnight,  PALETTE.dawn,    h - 5);
    else if (h < 7)  pal = lerpP(PALETTE.dawn,      PALETTE.sunrise, h - 6);
    else if (h < 9)  pal = lerpP(PALETTE.sunrise,   PALETTE.day,     (h - 7) / 2);
    else if (h < 13) pal = lerpP(PALETTE.day,        PALETTE.noon,   (h - 9) / 4);
    else if (h < 17) pal = lerpP(PALETTE.noon,       PALETTE.day,    (h - 13) / 4);
    else if (h < 18) pal = lerpP(PALETTE.day,        PALETTE.dusk,   h - 17);
    else if (h < 19) pal = lerpP(PALETTE.dusk,       PALETTE.sunset, h - 18);
    else if (h < 21) pal = lerpP(PALETTE.sunset,     PALETTE.night,  (h - 19) / 2);
    else             pal = PALETTE.night;

    // Dégradé vertical plein écran (zénith → horizon)
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;
    const tC = toN(pal.top);
    const bC = toN(pal.bot);
    if (!this._skyGfx) {
      this._skyGfx = this.add.graphics().setDepth(-1);
    }
    this._skyGfx.clear();
    this._skyGfx.fillGradientStyle(tC, tC, bC, bC, 1);
    this._skyGfx.fillRect(0, 0, W, H);

    // Opacité globale du jardin
    const solarFactor = Math.max(0, Math.sin((h - 6) / 12 * Math.PI));
    const alpha = 0.55 + solarFactor * 0.45;
    if (this.plantImg) this.plantImg.setAlpha(this.griefPause ? 0.25 : alpha);
    this.botGraphics.setAlpha(this.griefPause ? 0 : alpha);
  }

  _applyViewSubset() {
    this.viewPlants = this.plants;
    this._dirty = true;
  }

  connectWS() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}`);

    this.ws.onopen = () => {
      document.getElementById('connection-state').classList.add('live');
    };
    this.ws.onclose = () => {
      document.getElementById('connection-state').classList.remove('live');
      setTimeout(() => this.connectWS(), 3000);
    };
    this.ws.onmessage = (e) => {
      try { this._handleMessage(JSON.parse(e.data)); } catch(err) { console.error('WS Error:', err); }
    };
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'snapshot':
        console.log('[solace] snapshot plants=' + msg.plants.length);
        this.plants = msg.plants;
        this._applyViewSubset();
        this._initBotAnim(msg.bots);
        break;
      case 'plants_update':
        this.plants = msg.plants;
        this._applyViewSubset();
        const alive = msg.plants.filter(p => p.is_alive).length;
        const el = document.getElementById('s-alive');
        if (el) el.textContent = alive;
        break;
      case 'bots_update':
        this._updateBotAnim(msg.bots);
        break;
      case 'plant_watered':
        this._flashPlant(msg.plant_id);
        if (window._onPlantWatered) window._onPlantWatered();
        break;
      case 'grief_pause':
        this.griefPause = true;
        this._dirty = true;
        setTimeout(() => { this.griefPause = false; this._dirty = true; }, 30000);
        break;
    }
  }

  _buildPlantTexture() {
    try {
        const PAD = 60;

        // Bounding box : plantes + zones d'infra (délimitations, eau)
        let minIX = Infinity, maxIX = -Infinity, minIY = Infinity, maxIY = -Infinity;
        const _bb = (wx, wz) => {
          const { ix, iy } = this.plantRenderer.worldIso(wx, wz);
          if (ix < minIX) minIX = ix; if (ix > maxIX) maxIX = ix;
          if (iy < minIY) minIY = iy; if (iy > maxIY) maxIY = iy;
        };
        for (const p of this.viewPlants) _bb(p.pos_x, p.pos_z);
        // Inclure les zones même si pas de plantes chargées
        const ZR = 25;
        for (const z of GARDEN_ZONES) {
          _bb(z.cx - ZR, z.cz - ZR); _bb(z.cx + ZR, z.cz + ZR);
          _bb(z.cx - ZR, z.cz + ZR); _bb(z.cx + ZR, z.cz - ZR);
        }

        // Fallback ultime
        if (!isFinite(minIX)) { minIX = -500; maxIX = 500; minIY = -300; maxIY = 300; }

        this._texMinX = minIX - PAD;
        this._texMinY = minIY - PAD;
        const texW = Math.ceil(maxIX - minIX + PAD * 2);
        const texH = Math.ceil(maxIY - minIY + PAD * 2);

        const g = this.make.graphics({ add: false });

        // Infra du jardin : sol, eau, délimitations, chemins (avant plantes)
        this._drawGardenInfra(g);

        const sorted = [...this.viewPlants].sort((a, b) =>
          (a.pos_x + a.pos_z) - (b.pos_x + b.pos_z)
        );

        for (const p of sorted) {
          const { ix, iy } = this.plantRenderer.worldIso(p.pos_x, p.pos_z);
          this.plantRenderer.drawAt(g, p, ix - this._texMinX, iy - this._texMinY);
        }

        if (this.plantImg) { this.plantImg.destroy(); this.plantImg = null; }
        const prevKey = this._texKey + this._texVer;
        const key = this._texKey + (this._texVer + 1);
        g.generateTexture(key, texW, texH);
        g.destroy();
        if (this.textures.exists(prevKey)) this.textures.remove(prevKey);
        this._texVer++;

        this.plantImg = this.add.image(0, 0, key).setOrigin(0.5, 0.5).setDepth(0);
        if (!this._zoneLabels) this._createZoneLabels();
        console.log('[solace] texture rebuilt ver=' + this._texVer + ' plants=' + this.viewPlants.length + ' size=' + texW + 'x' + texH);
    } catch(e) {
        console.error('[solace] _buildPlantTexture failed', e);
    }
  }

  // Convertit coords monde → coords texture
  _wp(wx, wz) {
    const { ix, iy } = this.plantRenderer.worldIso(wx, wz);
    return { x: ix - this._texMinX, y: iy - this._texMinY };
  }

  _drawGardenInfra(g) {
    const ZONE_R = 22;
    const ctr = this._wp(0, 0);
    const zoneCoords = GARDEN_ZONES.map(z => ({ code: z.code, ...this._wp(z.cx, z.cz) }));

    // ── 1. CHEMINS (avant le sol pour passer dessous) ──────────────────────
    // Wobbles forts et alternés pour des S-curves bien visibles
    const ZONE_WOBBLES = [42, -38, 50, -44, 36];
    for (let i = 0; i < GARDEN_ZONES.length; i++) {
      const z = zoneCoords[i];
      this._drawPathRibbon(g, { x: z.x, y: z.y }, ctr, 6, ZONE_WOBBLES[i]);
    }
    // Périmètre (chemin de ronde, plus fin, courbures propres)
    const perimOrder = [0, 1, 2, 3, 4];
    const PERIM_WOBBLES = [28, -32, 25, -30, 22];
    for (let i = 0; i < perimOrder.length; i++) {
      const a = zoneCoords[perimOrder[i]];
      const b = zoneCoords[perimOrder[(i+1) % 5]];
      this._drawPathRibbon(g, { x: a.x, y: a.y }, { x: b.x, y: b.y }, 4, PERIM_WOBBLES[i]);
    }

    // ── 2. SOL TERREUX (recouvre les extrémités des chemins) ──────────────
    const EARTH_SPECK = [0x2a1e0e, 0x3a2a14, 0x1e1608, 0x4a3520, 0x251a0a];
    for (const z of GARDEN_ZONES) {
      const c = this._wp(z.cx, z.cz);
      const rx = ZONE_R * WORLD_SCALE * TILE_W;
      const ry = ZONE_R * WORLD_SCALE * TILE_H;

      g.fillStyle(0x1c1208, 1);
      g.beginPath();
      g.moveTo(c.x,      c.y - ry);
      g.lineTo(c.x + rx, c.y);
      g.lineTo(c.x,      c.y + ry);
      g.lineTo(c.x - rx, c.y);
      g.closePath();
      g.fill();

      let seed = (z.cx * 137 + z.cz * 31) & 0xffff;
      const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffff; return seed / 0xffff; };
      for (let i = 0; i < 90; i++) {
        const r  = rng() * 0.85;
        const th = rng() * Math.PI * 2;
        const sx = c.x + Math.cos(th) * r * rx;
        const sy = c.y + Math.sin(th) * r * ry;
        const col = EARTH_SPECK[Math.floor(rng() * EARTH_SPECK.length)];
        g.fillStyle(col, 0.55 + rng() * 0.35);
        g.fillCircle(sx, sy, 0.8 + rng() * 1.2);
      }
      for (let i = 0; i < 12; i++) {
        const r  = rng() * 0.7;
        const th = rng() * Math.PI * 2;
        g.fillStyle(0x3a2810, 0.25 + rng() * 0.2);
        g.fillEllipse(c.x + Math.cos(th) * r * rx, c.y + Math.sin(th) * r * ry, 4 + rng() * 4, 2 + rng() * 2);
      }
    }

    // ── 3. VASQUE (fond statique, jets animés dans _drawAnimatedFountain) ─
    this._drawFountainBase(g, ctr.x, ctr.y);

    // ── 5. DÉCOR ──────────────────────────────────────────────────────────
    this._drawProps(g);

    // ── 6. CONTOUR ZONES ──────────────────────────────────────────────────
    for (const z of GARDEN_ZONES) {
      const c = this._wp(z.cx, z.cz);
      const rx = ZONE_R * WORLD_SCALE * TILE_W;
      const ry = ZONE_R * WORLD_SCALE * TILE_H;
      g.lineStyle(1, 0x4a3820, 0.45);
      g.beginPath();
      g.moveTo(c.x,      c.y - ry);
      g.lineTo(c.x + rx, c.y);
      g.lineTo(c.x,      c.y + ry);
      g.lineTo(c.x - rx, c.y);
      g.closePath();
      g.strokePath();
    }
  }

  // Partie statique dessinée dans la texture (vasque + colonne)
  _drawFountainBase(g, x, y) {
    // Vasque iso
    g.fillStyle(0x0e1a24, 0.92);
    g.fillEllipse(x, y, 40, 18);
    g.lineStyle(2, 0x4a3e2e, 0.7);
    g.strokeEllipse(x, y + 1, 42, 19);
    g.lineStyle(1.5, 0x2a4a5a, 0.6);
    g.strokeEllipse(x, y, 40, 18);
    // Eau intérieure
    g.fillStyle(0x152838, 0.7);
    g.fillEllipse(x, y - 1, 32, 14);
    // Colonne
    g.fillStyle(0x4a3e2e, 1);
    g.fillEllipse(x, y,     6, 3);
    g.fillRect(x - 1.5, y - 9, 3, 9);
    g.fillEllipse(x, y - 9, 5, 2.5);
  }

  // Partie animée dessinée chaque frame sur fountainGraphics
  _drawAnimatedFountain(time) {
    if (!this.plantImg || !this.fountainGraphics) return;
    const g = this.fountainGraphics;
    g.clear();

    const { sx: x, sy: y } = this.worldToScreen(0, 0);
    const t = time * 0.001; // secondes

    // ── Ondulations concentriques ──────────────────────────────────────
    // 3 cercles qui s'élargissent puis disparaissent (cycle 2.4s)
    for (let i = 0; i < 3; i++) {
      const phase = ((t + i * 0.8) % 2.4) / 2.4; // 0→1
      const rw = 6 + phase * 26;
      const rh = rw * 0.42;
      const alpha = (1 - phase) * 0.35;
      g.lineStyle(1, 0x5ab4cc, alpha);
      g.strokeEllipse(x, y - 1, rw, rh);
    }

    // ── Jets d'eau (4 arcs qui pulsent en hauteur) ────────────────────
    const jetDefs = [
      { angle: -0.6, spread: 0.5 },
      { angle:  0.6, spread: 0.5 },
      { angle: -1.8, spread: 0.4 },
      { angle:  1.8, spread: 0.4 },
    ];
    jetDefs.forEach((j, i) => {
      const pulse = 1 + Math.sin(t * 2.5 + i * 1.1) * 0.22;
      const len   = (9 + j.spread * 4) * pulse;
      const ox = x + Math.cos(j.angle) * 1.5;
      const oy = y - 9;
      const tx = ox + Math.cos(j.angle) * len;
      const ty = oy + Math.sin(j.angle) * len * 0.45 + len * 0.3;
      const alpha = 0.55 + Math.sin(t * 3 + i) * 0.15;
      g.lineStyle(1.2, 0x8ad4e8, alpha);
      g.beginPath();
      g.moveTo(ox, oy);
      // arc via point de contrôle
      const mx = (ox + tx) / 2 + Math.cos(j.angle) * len * 0.15;
      const my = Math.min(oy, ty) - 3 * pulse;
      g.lineTo(mx, my);
      g.lineTo(tx, ty);
      g.strokePath();
      // gouttelette au sommet
      g.fillStyle(0x8ad4e8, alpha * 0.7);
      g.fillCircle(mx, my, 0.9);
    });

    // ── Reflets animés sur la surface ────────────────────────────────
    const shimmer = [
      { ox: -9, oy: -1, l: 7 },
      { ox:  3, oy:  2, l: 5 },
      { ox: -4, oy:  1, l: 4 },
    ];
    shimmer.forEach((s, i) => {
      const a = 0.12 + Math.sin(t * 4 + i * 1.7) * 0.08;
      g.lineStyle(1, 0xb8e8f8, a);
      g.beginPath();
      g.moveTo(x + s.ox,         y + s.oy);
      g.lineTo(x + s.ox + s.l,   y + s.oy);
      g.strokePath();
    });

    // Opacité globale suit le jardin (nuit = plus discret)
    const solarFactor = Math.max(0, Math.sin((new Date().getUTCHours() + new Date().getUTCMinutes()/60 - 6) / 12 * Math.PI));
    g.setAlpha(this.griefPause ? 0 : 0.6 + solarFactor * 0.4);
  }

  // Ruban de chemin plat échantillonné le long d'un bezier cubique
  _drawPathRibbon(g, from, to, width, wobble = 14) {
    const STEPS = 28;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len; const ny = dx / len;

    // Points de contrôle : S-curve prononcée (c2 dévie en sens inverse)
    const c1 = { x: from.x + dx * 0.25 + nx * wobble,       y: from.y + dy * 0.25 + ny * wobble };
    const c2 = { x: from.x + dx * 0.75 - nx * wobble * 0.8, y: from.y + dy * 0.75 - ny * wobble * 0.8 };

    // Échantillonnage
    const pts = [];
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const u = 1 - t;
      pts.push({
        x: u*u*u*from.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*to.x,
        y: u*u*u*from.y + 3*u*u*t*c1.y + 3*u*t*t*c2.y + t*t*t*to.y,
      });
    }

    // Calcul des normales à chaque point
    const left = [], right = [];
    for (let i = 0; i <= STEPS; i++) {
      let tx, ty;
      if (i === 0)     { tx = pts[1].x - pts[0].x;   ty = pts[1].y - pts[0].y; }
      else if (i === STEPS) { tx = pts[i].x - pts[i-1].x; ty = pts[i].y - pts[i-1].y; }
      else             { tx = pts[i+1].x - pts[i-1].x; ty = pts[i+1].y - pts[i-1].y; }
      const tl = Math.sqrt(tx*tx + ty*ty) || 1;
      const pnx = -ty / tl; const pny = tx / tl;
      const hw = width * 0.5;
      left.push({ x: pts[i].x + pnx * hw, y: pts[i].y + pny * hw });
      right.push({ x: pts[i].x - pnx * hw, y: pts[i].y - pny * hw });
    }

    // Couche de fond (terre compactée, bords sombres)
    g.fillStyle(0x140e06, 0.75);
    g.beginPath();
    g.moveTo(left[0].x, left[0].y);
    for (const p of left) g.lineTo(p.x, p.y);
    for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i].x, right[i].y);
    g.closePath();
    g.fill();

    // Surface sablonneuse (plus étroite, centrée)
    const innerW = width * 0.55;
    const iLeft = [], iRight = [];
    for (let i = 0; i <= STEPS; i++) {
      let tx, ty;
      if (i === 0)     { tx = pts[1].x - pts[0].x;   ty = pts[1].y - pts[0].y; }
      else if (i === STEPS) { tx = pts[i].x - pts[i-1].x; ty = pts[i].y - pts[i-1].y; }
      else             { tx = pts[i+1].x - pts[i-1].x; ty = pts[i+1].y - pts[i-1].y; }
      const tl = Math.sqrt(tx*tx + ty*ty) || 1;
      const pnx = -ty / tl; const pny = tx / tl;
      const hw = innerW * 0.5;
      iLeft.push({ x: pts[i].x + pnx * hw, y: pts[i].y + pny * hw });
      iRight.push({ x: pts[i].x - pnx * hw, y: pts[i].y - pny * hw });
    }
    g.fillStyle(0xb89860, 0.5);
    g.beginPath();
    g.moveTo(iLeft[0].x, iLeft[0].y);
    for (const p of iLeft) g.lineTo(p.x, p.y);
    for (let i = iRight.length - 1; i >= 0; i--) g.lineTo(iRight[i].x, iRight[i].y);
    g.closePath();
    g.fill();

    // Cailloux déterministes
    let seed = ((from.x * 17 + to.y * 31) * 997) & 0xffff;
    const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffff; return seed / 0xffff; };
    for (let i = 2; i < STEPS - 2; i++) {
      if (rng() > 0.55) continue;
      const side = rng() > 0.5 ? 1 : -1;
      const ox = pts[i].x + (iLeft[i].x - pts[i].x) * side * (0.6 + rng() * 0.9);
      const oy = pts[i].y + (iLeft[i].y - pts[i].y) * side * (0.6 + rng() * 0.9);
      g.fillStyle(0x4a3820, 0.35 + rng() * 0.3);
      g.fillCircle(ox, oy, 0.6 + rng() * 1.0);
    }
  }

  _drawProps(g) {
    // Stèles mémorielles à l'entrée de chaque zone (nord-ouest de la zone)
    for (const z of GARDEN_ZONES) {
      const p = this._wp(z.cx - 12, z.cz - 12);
      // Ombre
      g.fillStyle(0x000000, 0.25);
      g.fillEllipse(p.x, p.y + 2, 6, 3);
      // Corps stèle
      g.fillStyle(0x4a4035, 1);
      g.fillRect(p.x - 2, p.y - 10, 4, 10);
      // Tête arrondie
      g.fillStyle(0x5a5045, 1);
      g.fillCircle(p.x, p.y - 10, 2.5);
      // Gravure (trait horizontal)
      g.lineStyle(0.8, 0x2a2520, 0.6);
      g.beginPath(); g.moveTo(p.x - 1.5, p.y - 7); g.lineTo(p.x + 1.5, p.y - 7); g.strokePath();
      g.beginPath(); g.moveTo(p.x - 1.5, p.y - 5); g.lineTo(p.x + 1.5, p.y - 5); g.strokePath();
    }
    // Puits au centre (autour du bassin)
    const cw = this._wp(-8, 5);
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(cw.x, cw.y + 2, 10, 4);
    g.fillStyle(0x4a3820, 1);
    g.fillEllipse(cw.x, cw.y, 10, 5);      // margelle
    g.fillStyle(0x0a1218, 0.9);
    g.fillEllipse(cw.x, cw.y - 1, 6, 3);   // ouverture
    // Poutre du puits
    g.fillStyle(0x5a4028, 1);
    g.fillRect(cw.x - 1, cw.y - 7, 2, 7);
    g.fillRect(cw.x - 4, cw.y - 8, 8, 1.5);
  }

  _positionPlantLayer() {
    if (!this.plantImg || !this.cameras || !this.cameras.main) return;
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;
    const uiOffset = 40;

    // Auto-scale de base : remplit 88% de la zone disponible
    const availW = W * 0.88;
    const availH = (H - uiOffset) * 0.88;
    const baseScale = Math.min(availW / this.plantImg.width, availH / this.plantImg.height, 2.0);
    const scale = baseScale * this._zoom;

    const cx = W / 2 + this._panX;
    const cy = H / 2 + uiOffset * 0.5 + this._panY;

    this._viewScale = scale;
    this._imgX = cx;
    this._imgY = cy;
    this.plantImg.x = cx;
    this.plantImg.y = cy;
    this.plantImg.setScale(scale);
  }

  // Convertit une position monde en coordonnée écran (aligné avec la texture scalée)
  worldToScreen(x, z) {
    const { ix, iy } = this.plantRenderer.worldIso(x, z);
    const vs = this._viewScale || 1;
    return {
      sx: this._imgX + (ix - this._texMinX - this.plantImg.width  / 2) * vs,
      sy: this._imgY + (iy - this._texMinY - this.plantImg.height / 2) * vs,
    };
  }

  _initBotAnim(bots) {
    this._botAnim = {};
    for (const b of bots) {
      const start = this._botSpawn();
      this._botAnim[b.id] = {
        id: b.id, role: b.role, state: b.state,
        nodeId: start.nodeId,
        fromX: start.x, fromY: start.z,
        curX: start.x, curY: start.z,
        ...this._botLeg(start),
      };
    }
  }

  _updateBotAnim(bots) {
    for (const b of bots) {
      const prev = this._botAnim[b.id];
      if (prev) {
        prev.role = b.role;
        prev.state = b.state;
        // Arroseur : si nouvelle cible reçue du serveur, réorienter immédiatement
        if (b.role === 'arroseur' && b.target_plant_id && b.target_plant_id !== prev.targetPlantId) {
          prev.targetPlantId = b.target_plant_id;
          const plant = this.plants.find(p => p.id === b.target_plant_id);
          if (plant) {
            const nearestNode = this._nearestNodeToWorld(plant.pos_x, plant.pos_z);
            prev.fromX = prev.curX; prev.fromY = prev.curY;
            prev.nodeId = nearestNode;
            Object.assign(prev, {
              toX: plant.pos_x + (Math.random() - 0.5) * 4,
              toY: plant.pos_z + (Math.random() - 0.5) * 4,
              toNodeId: nearestNode,
              startTime: Date.now(),
              duration: 18000 + Math.random() * 12000,
            });
          }
        }
      } else {
        const start = this._botSpawn();
        this._botAnim[b.id] = {
          id: b.id, role: b.role, state: b.state,
          fromX: start.x, fromY: start.z,
          curX: start.x, curY: start.z,
          ...this._botLeg(start),
        };
      }
    }
  }

  // Spawn : place le bot exactement sur un nœud du graphe
  _botSpawn() {
    const node = PATH_NODES[Math.floor(Math.random() * PATH_NODES.length)];
    return { x: node.x, z: node.z, nodeId: node.id };
  }

  // Prochain segment : nœud voisin suivant, sans jitter
  _botLeg(from) {
    const nodeId = (from.nodeId !== undefined) ? from.nodeId
      : this._nearestNode(from.x, from.z);
    const neighbors = PATH_EDGES[nodeId] || [0];
    const nextId = neighbors[Math.floor(Math.random() * neighbors.length)];
    const node = PATH_NODES[nextId];
    return {
      toX: node.x, toY: node.z,
      toNodeId: nextId,
      startTime: Date.now(),
      duration: 16000 + Math.random() * 14000,
    };
  }

  // Trouve le nœud du graphe le plus proche d'une position dans l'animation (espace bot)
  _nearestNode(x, z) {
    let best = 0, bestD = Infinity;
    for (const n of PATH_NODES) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD) { bestD = d; best = n.id; }
    }
    return best;
  }

  // Même chose mais pour une position en coordonnées monde brutes (pos_x/pos_z DB)
  _nearestNodeToWorld(wx, wz) {
    return this._nearestNode(wx, wz);
  }

  _getAnimatedBots() {
    const now = Date.now();
    return Object.values(this._botAnim).map(b => {
      let t = (now - b.startTime) / b.duration;
      if (t >= 1) {
        b.fromX = b.toX; b.fromY = b.toY;
        b.nodeId = b.toNodeId !== undefined ? b.toNodeId : this._nearestNode(b.toX, b.toY);
        Object.assign(b, this._botLeg({ x: b.toX, z: b.toY, nodeId: b.nodeId }));
        t = 0;
      }
      
      // Interpolation linéaire directe : suit exactement le segment nœud→nœud
      b.curX = b.fromX + (b.toX - b.fromX) * t;
      b.curY = b.fromY + (b.toY - b.fromY) * t;
      return b;
    });
  }

  _drawBots() {
    this.botGraphics.clear();
    if (this.griefPause) return;
    const bots = this._getAnimatedBots();
    for (const b of bots) {
      this.botRenderer.draw(this.botGraphics, b);
    }
  }

  _createZoneLabels() {
    this._zoneLabels = true;
    const NAMES = { PSE:'GAZA', UKR:'UKRAINE', MMR:'MYANMAR', YEM:'YÉMEN', SDN:'SOUDAN' };
    const style = {
      fontFamily: 'Courier New', fontSize: '8px',
      color: '#c8b090', stroke: '#000000', strokeThickness: 2,
    };
    this._zoneLabelObjs = GARDEN_ZONES.map(z => {
      const t = this.add.text(0, 0, NAMES[z.code] || z.code, style)
        .setOrigin(0.5, 1).setDepth(2).setAlpha(0.75);
      return { wx: z.cx, wz: z.cz, obj: t };
    });
  }

  _updateZoneLabels() {
    if (!this._zoneLabelObjs || !this.plantImg) return;
    const ZONE_R = 22;
    for (const lbl of this._zoneLabelObjs) {
      // Place le label au sommet nord du losange iso de la zone
      const { sx, sy } = this.worldToScreen(lbl.wx, lbl.wz - ZONE_R);
      lbl.obj.x = sx;
      lbl.obj.y = sy - 4;
    }
  }

  _placeCandle(px, py) {
    // Convertit position écran → coords monde approximatives
    if (!this.plantImg) return;
    const vs = this._viewScale || 1;
    const tx = (px - this._imgX) / vs + this.plantImg.width  / 2 + this._texMinX;
    const ty = (py - this._imgY) / vs + this.plantImg.height / 2 + this._texMinY;
    // iso inverse : ix=(x-z)*s*TW/2, iy=(x+z)*s*TH/2
    const s = WORLD_SCALE;
    const xmz = tx / (s * TILE_W / 2);
    const xpz = ty / (s * TILE_H / 2);
    const wx = (xmz + xpz) / 2;
    const wz = (xpz - xmz) / 2;
    this._candles.push({ wx, wz, born: Date.now() });
  }

  _drawCandles(time) {
    if (!this.candleGraphics || !this.plantImg) return;
    const g = this.candleGraphics;
    g.clear();
    const now = Date.now();
    const LIFE = 90000; // 90s
    this._candles = this._candles.filter(c => now - c.born < LIFE);
    for (const c of this._candles) {
      const age = (now - c.born) / LIFE;       // 0→1
      const fade = 1 - age;
      const { sx, sy } = this.worldToScreen(c.wx, c.wz);
      // Halo au sol
      g.fillStyle(0xe8a040, 0.08 * fade);
      g.fillEllipse(sx, sy, 28 * fade, 12 * fade);
      // Cire (corps bougie)
      g.fillStyle(0xf0e8d0, 0.9 * fade);
      g.fillRect(sx - 2, sy - 9, 4, 8);
      // Mèche
      g.fillStyle(0x2a1a08, fade);
      g.fillRect(sx - 0.5, sy - 12, 1, 3);
      // Flamme — 3 couches qui flickent
      const flick = Math.sin(time * 0.012 + c.wx) * 0.3;
      g.fillStyle(0xfff0a0, 0.85 * fade);
      g.fillEllipse(sx + flick * 0.5, sy - 14, 4, 5);
      g.fillStyle(0xffa040, 0.7 * fade);
      g.fillEllipse(sx + flick,       sy - 13, 2.5, 3.5);
      g.fillStyle(0xffffff, 0.4 * fade);
      g.fillEllipse(sx + flick * 0.3, sy - 14.5, 1.2, 1.8);
      // Lueur dorée
      g.fillStyle(0xe8900a, 0.12 * fade);
      g.fillEllipse(sx, sy - 13, 14, 10);
    }
  }

  _drawCursor(time) {
    if (!this.cursorGraphics) return;
    const g = this.cursorGraphics;
    g.clear();
    const x = this._mouseX;
    const y = this._mouseY;
    if (x === 0 && y === 0) return;

    if (this._activeTool === 'navigate') {
      // Croix fine + cercle
      g.lineStyle(1, 0xc8b89a, 0.6);
      g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.strokePath();
      g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x, y + 6); g.strokePath();
      g.lineStyle(1, 0xc8b89a, 0.3);
      g.strokeCircle(x, y, 4);

    } else if (this._activeTool === 'water') {
      const pulse = 1 + Math.sin(time * 0.006) * 0.15;
      // Corps arrosoir
      g.fillStyle(0x7ab8d4, 0.9);
      g.fillRect(x - 8, y - 5, 10, 7);
      // Bec
      g.lineStyle(1.5, 0x7ab8d4, 0.9);
      g.beginPath(); g.moveTo(x + 2, y - 2); g.lineTo(x + 10, y - 7); g.strokePath();
      // Anse
      g.beginPath(); g.moveTo(x - 8, y - 5); g.lineTo(x - 10, y - 9); g.lineTo(x - 4, y - 9); g.strokePath();
      // Gouttes
      g.fillStyle(0x7ab8d4, 0.7 * pulse);
      g.fillCircle(x + 11, y - 6,  1.2);
      g.fillCircle(x + 13, y - 4,  0.9);
      g.fillCircle(x + 12, y - 2,  0.8);

    } else if (this._activeTool === 'candle') {
      const flick = Math.sin(time * 0.014) * 1.2;
      // Cire
      g.fillStyle(0xf0e8d0, 0.9);
      g.fillRect(x - 3, y, 6, 10);
      // Flamme
      g.fillStyle(0xfff0a0, 0.9);
      g.fillEllipse(x + flick * 0.4, y - 4, 5, 7);
      g.fillStyle(0xffa040, 0.8);
      g.fillEllipse(x + flick * 0.6, y - 3, 3, 5);
      g.fillStyle(0xffffff, 0.5);
      g.fillEllipse(x + flick * 0.2, y - 4, 1.5, 2.5);
      // Halo
      g.fillStyle(0xe8900a, 0.1);
      g.fillEllipse(x, y - 2, 18, 14);
    }
  }

  setupInput() {
    this.input.on('pointerdown', (ptr) => {
      if (this._activeTool === 'water') {
        const plant = this._plantAt(ptr.x, ptr.y);
        if (plant) { this._waterByVisitor(plant.id); this._flashPlant(plant.id); }
        return;
      }
      if (this._activeTool === 'candle') {
        this._placeCandle(ptr.x, ptr.y);
        return;
      }
      // navigate : pan
      this._dragging = true;
      this._dragOrigin = { x: ptr.x - this._panX, y: ptr.y - this._panY };
    });

    this.input.on('pointerup', () => { this._dragging = false; });
    this.input.on('pointerout', () => {
      this._dragging = false;
      if (window.hidePlantTip) window.hidePlantTip();
    });

    this.input.on('pointermove', (ptr) => {
      this._mouseX = ptr.x;
      this._mouseY = ptr.y;

      if (this._dragging && this._activeTool === 'navigate') {
        this._panX = ptr.x - this._dragOrigin.x;
        this._panY = ptr.y - this._dragOrigin.y;
        return;
      }
      const plant = this._plantAt(ptr.x, ptr.y);
      const hitId = plant ? plant.id : null;
      if (hitId !== this.hoverPlantId) {
        this.hoverPlantId = hitId;
        clearTimeout(this.hoverTimer);
        // arrosage auto uniquement en mode navigate
        if (hitId && this._activeTool === 'navigate') {
          this.hoverTimer = setTimeout(() => this._waterByVisitor(hitId), this.WATER_HOVER_MS);
        }
      }
      if (window.showPlantTip) window.showPlantTip(plant || null, ptr.x, ptr.y);
    });

    this.input.on('wheel', (_ptr, _dx, _dy, deltaY) => {
      const factor = deltaY > 0 ? 0.9 : 1.1;
      this._zoom = Math.max(0.4, Math.min(4.0, this._zoom * factor));
    });

    this.input.on('pointerdblclick', () => {
      if (this._activeTool === 'navigate') {
        this._panX = 0; this._panY = 0; this._zoom = 1.0;
      }
    });

    // Exposition de setTool au HTML
    window.setGardenTool = (tool) => {
      this._activeTool = tool;
      if (window.onToolChanged) window.onToolChanged(tool);
    };
  }

  _plantAt(px, py) {
    for (const p of this.viewPlants) {
      const { sx, sy } = this.plantRenderer.toIso(p.pos_x, p.pos_z);
      const dx = px - sx, dy = py - sy;
      if (dx * dx + dy * dy < 64) return p;
    }
    return null;
  }

  _waterByVisitor(plantId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'water_plant', plant_id: plantId }));
    }
  }

  _flashPlant(plantId) {
    const p = this.plants.find(x => x.id === plantId);
    if (!p) return;
    const { sx, sy } = this.plantRenderer.toIso(p.pos_x, p.pos_z);
    const flash = this.add.graphics();
    flash.fillStyle(0x7ab8d4, 0.5);
    flash.fillCircle(sx, sy, 10);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 1000,
      onComplete: () => flash.destroy(),
    });
  }
}
