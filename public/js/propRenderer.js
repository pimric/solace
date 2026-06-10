// Rendu des éléments de décor (barrières, eau) — SOLACE

class PropRenderer {
  constructor(scene) {
    this.scene = scene;
  }

  // Barrière naturelle (rochers/buissons)
  drawBarrier(graphics, x, z, type = 'rock') {
    const { ix, iy } = this.scene.plantRenderer.worldIso(x, z);
    
    if (type === 'rock') {
      const colors = [0x4a4a4a, 0x5a5a5a, 0x3a3a3a];
      const color = colors[Math.floor(Math.abs(x + z) % 3)];
      
      // Ombre
      graphics.fillStyle(0x000000, 0.2);
      graphics.fillEllipse(ix, iy + 2, 12, 6);
      
      // Rocher
      graphics.fillStyle(color, 1);
      graphics.beginPath();
      graphics.moveTo(ix - 6, iy);
      graphics.lineTo(ix, iy - 8);
      graphics.lineTo(ix + 6, iy);
      graphics.lineTo(ix, iy + 4);
      graphics.closePath();
      graphics.fill();
    } else {
      // Buisson
      graphics.fillStyle(0x2d4a2d, 1);
      graphics.fillCircle(ix, iy - 4, 6);
      graphics.fillCircle(ix - 4, iy, 5);
      graphics.fillCircle(ix + 4, iy, 5);
    }
  }

  // Point d'eau (mare/fontaine)
  drawWater(graphics, x, z, radius = 20) {
    const { ix, iy } = this.scene.plantRenderer.worldIso(x, z);
    
    // Bordure & Fond
    graphics.lineStyle(2, 0x3a5c3a, 0.5);
    graphics.fillStyle(0x1a2c3a, 0.8);
    
    // Forme iso (Phaser 3 uses fillEllipse/strokeEllipse)
    graphics.fillEllipse(ix, iy, radius * 2, radius * 1.2);
    graphics.strokeEllipse(ix, iy, radius * 2, radius * 1.2);
    
    // Reflets
    graphics.lineStyle(1, 0xffffff, 0.2);
    graphics.beginPath();
    graphics.moveTo(ix - radius * 0.4, iy - 2);
    graphics.lineTo(ix + radius * 0.2, iy - 2);
    graphics.strokePath();
  }

  // Zone de terre (soil)
  drawSoil(graphics, x, z, w, h) {
    const { ix, iy } = this.scene.plantRenderer.worldIso(x, z);
    
    graphics.fillStyle(0x1a1a15, 1); // Terre sombre
    graphics.beginPath();
    graphics.moveTo(ix, iy - (h/2) * (TILE_H/2));
    graphics.lineTo(ix + (w/2) * (TILE_W/2), iy);
    graphics.lineTo(ix, iy + (h/2) * (TILE_H/2));
    graphics.lineTo(ix - (w/2) * (TILE_W/2), iy);
    graphics.closePath();
    graphics.fill();
    
    // Texture de terre (petits points)
    graphics.fillStyle(0x2a2a20, 0.3);
    for(let i=0; i<20; i++) {
        const rx = (Math.random() - 0.5) * w * (TILE_W/2);
        const ry = (Math.random() - 0.5) * h * (TILE_H/2);
        graphics.fillCircle(ix + rx, iy + ry, 1);
    }
  }
}
