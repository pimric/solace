// Rendu des bots — silhouettes humanoïdes isométriques SOLACE

const BOT_COLORS = {
  arroseur:     0x7ab8d4,
  veilleur:     0xd8d8c8,
  memorialiste: 0xd4a85a,
  tailleur:     0x7ac48a,
  chercheur:    0xe8824a,
};

class BotRenderer {
  constructor(scene) {
    this.scene = scene;
    this._tick = 0;
  }

  tick() { this._tick++; }

  toIso(x, z) {
    if (this.scene.worldToScreen && this.scene.plantImg) return this.scene.worldToScreen(x, z);
    const s = (typeof WORLD_SCALE !== 'undefined') ? WORLD_SCALE : 1;
    const cam = this.scene._cam || { x: 0, z: 0 };
    const cx = this.scene.cameras.main.width / 2;
    const cy = this.scene.cameras.main.height / 2;
    const rx = x * s - cam.x;
    const rz = z * s - cam.z;
    return { sx: cx + (rx - rz) * (TILE_W / 2), sy: cy + (rx + rz) * (TILE_H / 2) };
  }

  draw(graphics, bot) {
    const { sx, sy } = this.toIso(bot.curX, bot.curY);
    const color = BOT_COLORS[bot.role] || 0xffffff;
    const isMoving = bot.state === 'moving';
    // walk cycle: 0 or 1 every 8 ticks
    const step = isMoving ? Math.floor(this._tick / 8) % 2 : 0;

    // ombre
    graphics.fillStyle(0x000000, 0.2);
    graphics.fillEllipse(sx, sy + 1, 6, 2);

    // jambes (2px chacune, alternance gauche/droite)
    graphics.fillStyle(color, 0.7);
    const legOffL = step === 0 ? 2 : 0;
    const legOffR = step === 0 ? 0 : 2;
    // jambe gauche
    graphics.fillRect(sx - 2, sy, 1, 3 + legOffL);
    // jambe droite
    graphics.fillRect(sx + 1, sy, 1, 3 + legOffR);

    // corps (torse rectangle)
    graphics.fillStyle(color, 0.9);
    graphics.fillRect(sx - 2, sy - 5, 5, 5);

    // tête (cercle)
    graphics.fillStyle(color, 1.0);
    graphics.fillCircle(sx, sy - 7, 2.5);

    // objet de rôle (à droite du corps)
    this._drawRoleObject(graphics, bot.role, sx + 4, sy - 4, color);

    // halo si "working"
    if (bot.state === 'working' || bot.state === 'rushing') {
      graphics.fillStyle(color, 0.2);
      graphics.fillCircle(sx, sy - 7, 5);
    }
  }

  _drawRoleObject(graphics, role, ox, oy, color) {
    graphics.lineStyle(1.5, color, 0.9);
    graphics.fillStyle(color, 0.9);

    switch (role) {
      case 'arroseur': {
        // arrosoir : rectangle + bec incliné + pomme
        graphics.fillRect(ox, oy - 1, 5, 3);          // réservoir
        graphics.beginPath();
        graphics.moveTo(ox + 5, oy);
        graphics.lineTo(ox + 8, oy - 3);              // bec
        graphics.strokePath();
        graphics.fillCircle(ox + 8, oy - 3, 1);       // pomme
        break;
      }
      case 'veilleur': {
        // lanterne : petit carré + anse + lueur
        graphics.fillRect(ox + 1, oy - 3, 3, 4);      // corps lanterne
        graphics.fillStyle(0xffee88, 0.8);
        graphics.fillCircle(ox + 2, oy - 1, 1);       // flamme
        graphics.lineStyle(1, color, 0.7);
        graphics.beginPath();
        graphics.moveTo(ox + 2, oy - 3);
        graphics.lineTo(ox + 2, oy - 5);              // anse
        graphics.strokePath();
        break;
      }
      case 'memorialiste': {
        // rouleau : rectangle arrondi + lignes de texte
        graphics.fillRect(ox, oy - 4, 5, 5);
        graphics.fillStyle(0x1a0f00, 0.5);
        for (let i = 0; i < 3; i++) {
          graphics.fillRect(ox + 1, oy - 3 + i * 1.5, 3, 0.5);
        }
        break;
      }
      case 'tailleur': {
        // sécateur : deux traits croisés
        graphics.beginPath();
        graphics.moveTo(ox, oy - 3);
        graphics.lineTo(ox + 5, oy + 1);
        graphics.strokePath();
        graphics.beginPath();
        graphics.moveTo(ox + 5, oy - 3);
        graphics.lineTo(ox, oy + 1);
        graphics.strokePath();
        break;
      }
      case 'chercheur': {
        // loupe : cercle + manche
        graphics.lineStyle(1.5, color, 0.9);
        graphics.beginPath();
        graphics.arc(ox + 2, oy - 2, 2, 0, Math.PI * 2);
        graphics.strokePath();
        graphics.beginPath();
        graphics.moveTo(ox + 4, oy);
        graphics.lineTo(ox + 7, oy + 2);
        graphics.strokePath();
        break;
      }
    }
  }
}
