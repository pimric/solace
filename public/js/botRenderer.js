// Rendu des bots — insectes lents sur le jardin SOLACE

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

  draw(graphics, bot) {
    const { sx, sy } = this.toIso(bot.curX, bot.curY);
    const color = BOT_COLORS[bot.role] || 0xffffff;

    // Ombre portée
    graphics.fillStyle(0x000000, 0.18);
    graphics.fillEllipse(sx, sy + 2, 8, 3);

    // Corps insecte — ellipse légèrement aplatie
    graphics.fillStyle(color, 0.92);
    graphics.fillEllipse(sx, sy, 5, 3);

    // Tête (petit cercle devant)
    const angle = Math.atan2(bot.toY - bot.fromY, bot.toX - bot.fromX);
    const hx = sx + Math.cos(angle - Math.PI * 0.25) * 3;
    const hy = sy + Math.sin(angle - Math.PI * 0.25) * 2;
    graphics.fillStyle(color, 1.0);
    graphics.fillCircle(hx, hy, 1.5);

    // Pattes (4 traits courts de chaque côté)
    graphics.lineStyle(1, color, 0.5);
    for (let i = -1; i <= 1; i += 2) {
      for (let j = 0; j < 2; j++) {
        const lx = sx + (j === 0 ? -1 : 1);
        const la = angle + Math.PI * 0.5 * i + (j === 0 ? -0.3 : 0.3);
        graphics.beginPath();
        graphics.moveTo(lx, sy);
        graphics.lineTo(lx + Math.cos(la) * 3, sy + Math.sin(la) * 2);
        graphics.strokePath();
      }
    }

    // Indicateur d'état : petit point lumineux au-dessus si "working"
    if (bot.state === 'working' || bot.state === 'rushing') {
      graphics.fillStyle(color, 0.35);
      graphics.fillCircle(sx, sy - 5, 2.5);
      graphics.fillStyle(color, 0.7);
      graphics.fillCircle(sx, sy - 5, 1.2);
    }
  }
}
