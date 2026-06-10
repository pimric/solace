// Rendu isométrique d'une plante — SOLACE

class PlantRenderer {
  constructor(scene) {
    this.scene = scene;
    this._colorCache = {};
  }

  _hex(str) {
    if (!this._colorCache[str])
      this._colorCache[str] = Phaser.Display.Color.HexStringToColor(str || '#3a5c3a').color;
    return this._colorCache[str];
  }

  toIso(x, z) {
    const s = (typeof WORLD_SCALE !== 'undefined') ? WORLD_SCALE : 1;
    const cam = this.scene._cam || { x: 0, z: 0 };
    const cx = this.scene.cameras.main.width / 2;
    const cy = this.scene.cameras.main.height / 2;
    const rx = x * s - cam.x;
    const rz = z * s - cam.z;
    return {
      sx: cx + (rx - rz) * (TILE_W / 2),
      sy: cy + (rx + rz) * (TILE_H / 2),
    };
  }

  // Position iso en espace monde absolu (pour pré-rendu dans texture)
  worldIso(x, z) {
    const s = (typeof WORLD_SCALE !== 'undefined') ? WORLD_SCALE : 1;
    return {
      ix: (x * s - z * s) * (TILE_W / 2),
      iy: (x * s + z * s) * (TILE_H / 2),
    };
  }

  // Dessine la plante à une position écran/texture donnée
  drawAt(graphics, plant, sx, sy) {
    const alive = Number(plant.is_alive) === 1;

    // Hauteur relative à la taille de tuile
    const h = Math.max(4, Math.floor((plant.stem_height || 1) * TILE_H * 1.4));
    const curve = (plant.stem_curve || 0) * 8;

    const stemColor = alive ? this._hex(plant.primary_color || '#2d4a2d') : this._hex('#3a2e22');
    const leafColor = alive ? this._hex(plant.secondary_color || '#3a5c3a') : 0x252015;

    // Sol : petite empreinte sous la plante
    if (alive) {
      graphics.fillStyle(stemColor, 0.08);
      graphics.fillEllipse(sx, sy + 1, 10, 4);
    }

    // Tige — 2 traits décalés d'1px pour l'épaisseur
    const stemAlpha = alive ? 0.92 : 0.35;
    graphics.lineStyle(2, stemColor, stemAlpha);
    graphics.beginPath();
    graphics.moveTo(sx, sy);
    // Légère courbe via point intermédiaire
    const mx = sx + curve * 0.5;
    const my = sy - h * 0.55;
    graphics.lineTo(mx, my);
    graphics.lineTo(sx + curve, sy - h);
    graphics.strokePath();

    if (!alive) return;

    const tipX = sx + curve;
    const tipY = sy - h;

    // Feuilles — paires opposées le long de la tige
    const leafCount = Math.min(plant.leaf_count || 4, 6);
    graphics.fillStyle(leafColor, 0.88);
    for (let i = 0; i < leafCount; i++) {
      const t = (i + 1) / (leafCount + 1);
      const lx = sx + curve * t;
      const ly = sy - h * t;
      const side = i % 2 === 0 ? 1 : -1;
      // Petite feuille ovale orientée
      graphics.fillEllipse(lx + side * 4, ly - 1, 5, 3);
    }

    // Fleur / pétales (civils uniquement)
    if (plant.victim_type === 'civilian' && plant.petal_count > 0) {
      const pc = Math.min(plant.petal_count, 8);
      const petalColor = this._hex(plant.primary_color || '#3a5c3a');
      const r = 3 + plant.petal_count * 0.3;

      // Halos doux concentriques
      graphics.fillStyle(petalColor, 0.06);
      graphics.fillCircle(tipX, tipY, r * 3.5);
      graphics.fillStyle(petalColor, 0.12);
      graphics.fillCircle(tipX, tipY, r * 2.2);

      // Pétales
      graphics.fillStyle(petalColor, 0.75);
      for (let i = 0; i < pc; i++) {
        const a = (i / pc) * Math.PI * 2;
        const px = tipX + Math.cos(a) * r;
        const py = tipY + Math.sin(a) * r * 0.6;
        graphics.fillEllipse(px, py, 4, 3);
      }

      // Centre de fleur
      graphics.fillStyle(0xf5e8c0, 0.9);
      graphics.fillCircle(tipX, tipY, 1.5);

      // Halo enfant (petite plante)
      if (plant.stem_height < 0.5) {
        graphics.fillStyle(petalColor, 0.07);
        graphics.fillCircle(tipX, tipY, r * 5);
      }
    } else {
      // Combattant : bourgeon sombre, discret
      graphics.fillStyle(leafColor, 0.6);
      graphics.fillCircle(tipX, tipY, 2);
    }
  }
}
