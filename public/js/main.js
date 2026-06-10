// SOLACE - entry point Phaser
const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#080810',
  parent: 'game-container',
  antialias: false,
  pixelArt: true,
  roundPixels: true,
  // Plafonne la résolution : sur mobile devicePixelRatio peut valoir 3 → canvas énorme et saccadé
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  scene: [GardenScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(config);
window.game = game;

window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});
