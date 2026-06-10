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
  }

  preload() {}

  create() {
    this.plantRenderer = new PlantRenderer(this);
    this.propRenderer = new PropRenderer(this);
    this.botRenderer = new BotRenderer(this);

    this.botGraphics = this.add.graphics().setDepth(1);

    this.connectWS();
    this.setupInput();

    this.scale.on('resize', () => { this._dirty = true; });
  }

  update(time, delta) {
    if (this._dirty) {
      this._dirty = false;
      this._buildPlantTexture();
    }
    this._positionPlantLayer();
    this._drawBots();
    this._updateDayNight();
  }

  _updateDayNight() {
    const now = new Date();
    const h = now.getUTCHours() + now.getUTCMinutes() / 60;

    // Palettes clés : [r, g, b] pour chaque phase
    const PALETTE = {
      midnight: [2,   4,   8  ],
      dawn:     [18,  10,  22 ],
      sunrise:  [28,  16,  20 ],
      day:      [8,   12,  20 ],
      noon:     [10,  15,  24 ],
      dusk:     [24,  12,  8  ],
      sunset:   [18,  8,   6  ],
      night:    [4,   4,   10 ],
    };

    // Interpolation linéaire entre deux couleurs
    const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const toHex = rgb => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];

    let color;
    if      (h < 1)  color = lerp(PALETTE.night,    PALETTE.midnight, h / 1);
    else if (h < 5)  color = PALETTE.midnight;
    else if (h < 6)  color = lerp(PALETTE.midnight,  PALETTE.dawn,    (h - 5));
    else if (h < 7)  color = lerp(PALETTE.dawn,      PALETTE.sunrise, (h - 6));
    else if (h < 9)  color = lerp(PALETTE.sunrise,   PALETTE.day,     (h - 7) / 2);
    else if (h < 13) color = lerp(PALETTE.day,        PALETTE.noon,   (h - 9) / 4);
    else if (h < 17) color = lerp(PALETTE.noon,       PALETTE.day,    (h - 13) / 4);
    else if (h < 18) color = lerp(PALETTE.day,        PALETTE.dusk,   (h - 17));
    else if (h < 19) color = lerp(PALETTE.dusk,       PALETTE.sunset, (h - 18));
    else if (h < 21) color = lerp(PALETTE.sunset,     PALETTE.night,  (h - 19) / 2);
    else             color = PALETTE.night;

    this.cameras.main.setBackgroundColor(toHex(color));

    // Opacité globale du jardin : légèrement réduite la nuit
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
    const ZONE_R = 22;  // rayon de la zone en unités monde (plantes à r=5..15)

    // --- Sol sous chaque zone ---
    for (const z of GARDEN_ZONES) {
      const c = this._wp(z.cx, z.cz);
      const rx = ZONE_R * WORLD_SCALE * TILE_W;
      const ry = ZONE_R * WORLD_SCALE * TILE_H;
      g.fillStyle(0x141410, 1);
      g.beginPath();
      g.moveTo(c.x,      c.y - ry);
      g.lineTo(c.x + rx, c.y);
      g.lineTo(c.x,      c.y + ry);
      g.lineTo(c.x - rx, c.y);
      g.closePath();
      g.fill();
    }

    // --- Rayons du pentagone : chaque zone → centre ---
    const ctr = this._wp(0, 0);
    const zoneCoords = GARDEN_ZONES.map(z => ({ code: z.code, ...this._wp(z.cx, z.cz) }));
    for (const z of zoneCoords) {
      this._drawDottedPath(g, { x: z.x, y: z.y }, ctr, 0x2a3c2a, 0.40, 6);
    }
    // Périmètre du pentagone (zone adjacente)
    const perimOrder = [0, 1, 2, 3, 4];
    for (let i = 0; i < perimOrder.length; i++) {
      const a = zoneCoords[perimOrder[i]];
      const b = zoneCoords[perimOrder[(i + 1) % perimOrder.length]];
      this._drawDottedPath(g, { x: a.x, y: a.y }, { x: b.x, y: b.y }, 0x1e2e1e, 0.25, 9);
    }

    // --- Eau ---
    // Bassin central
    this._drawPool(g, ctr.x, ctr.y, 60, 26);
    // Petites mares à mi-chemin sur deux rayons
    const mPSE = this._wp(-28, -28);
    this._drawPool(g, mPSE.x, mPSE.y, 22, 10);
    const mMMR = this._wp(32, 15);
    this._drawPool(g, mMMR.x, mMMR.y, 22, 10);

    // --- Délimitations (contour iso diamond) ---
    for (const z of GARDEN_ZONES) {
      const c = this._wp(z.cx, z.cz);
      const rx = ZONE_R * WORLD_SCALE * TILE_W;
      const ry = ZONE_R * WORLD_SCALE * TILE_H;
      g.lineStyle(1, 0x3a5c3a, 0.45);
      g.beginPath();
      g.moveTo(c.x,      c.y - ry);
      g.lineTo(c.x + rx, c.y);
      g.lineTo(c.x,      c.y + ry);
      g.lineTo(c.x - rx, c.y);
      g.closePath();
      g.strokePath();
    }
  }

  _drawPool(g, x, y, rw, rh) {
    g.fillStyle(0x1a2c3a, 0.75);
    g.fillEllipse(x, y, rw, rh);
    g.lineStyle(1, 0x2a4c5a, 0.5);
    g.strokeEllipse(x, y, rw, rh);
    // reflet
    g.lineStyle(1, 0xffffff, 0.12);
    g.beginPath();
    g.moveTo(x - rw * 0.25, y - 1);
    g.lineTo(x + rw * 0.15, y - 1);
    g.strokePath();
  }

  _drawDottedPath(g, from, to, color, alpha, gap) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.floor(len / gap);
    g.fillStyle(color, alpha);
    for (let i = 0; i <= steps; i++) {
      if (i % 2 === 0) continue;
      const t = i / steps;
      g.fillCircle(from.x + dx * t, from.y + dy * t, 1.2);
    }
  }

  _positionPlantLayer() {
    if (!this.plantImg || !this.cameras || !this.cameras.main) return;
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;
    const uiOffset = 40;
    const cx = W / 2;
    const cy = H / 2 + uiOffset * 0.5;

    // Auto-scale : remplit 88% de la zone disponible (sous la stats bar)
    const availW = W * 0.88;
    const availH = (H - uiOffset) * 0.88;
    const scale = Math.min(availW / this.plantImg.width, availH / this.plantImg.height, 2.0);

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
              duration: 7000 + Math.random() * 5000,
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
      duration: 5000 + Math.random() * 8000,
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

  setupInput() {
    this.input.on('pointermove', (ptr) => {
      const plant = this._plantAt(ptr.x, ptr.y);
      const hitId = plant ? plant.id : null;

      if (hitId !== this.hoverPlantId) {
        this.hoverPlantId = hitId;
        clearTimeout(this.hoverTimer);
        if (hitId) {
          this.hoverTimer = setTimeout(() => this._waterByVisitor(hitId), this.WATER_HOVER_MS);
        }
      }

      if (window.showPlantTip) window.showPlantTip(plant || null, ptr.x, ptr.y);
    });

    this.input.on('pointerout', () => {
      if (window.hidePlantTip) window.hidePlantTip();
    });
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
