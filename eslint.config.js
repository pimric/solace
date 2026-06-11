const js = require('@eslint/js');

const nodeGlobals = {
  require: 'readonly', module: 'readonly', exports: 'readonly',
  __dirname: 'readonly', __filename: 'readonly', process: 'readonly',
  console: 'readonly', global: 'readonly', Buffer: 'readonly',
  setTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  clearTimeout: 'readonly',
};

const browserGlobals = {
  window: 'readonly', document: 'readonly', navigator: 'readonly',
  console: 'readonly', location: 'readonly',
  setTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  clearTimeout: 'readonly', requestAnimationFrame: 'readonly',
  devicePixelRatio: 'readonly', WebSocket: 'readonly',
  Phaser: 'readonly',
  // Globals partagés entre fichiers via script tags (pas de bundler)
  TILE_W: 'readonly', TILE_H: 'readonly', WORLD_SCALE: 'readonly',
  PlantRenderer: 'writable', PropRenderer: 'writable',
  BotRenderer: 'writable', GardenScene: 'writable',
};

module.exports = [
  // Librairies tierces vendorées (non lintées, comme phaser.min.js)
  { ignores: ['node_modules/**', 'public/phaser.min.js', 'public/plant/vendor/**', 'public/plant/utils/**'] },
  js.configs.recommended,
  {
    files: ['*.js', 'scripts/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: nodeGlobals,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['public/js/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: browserGlobals,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-var': 'warn',
      'prefer-const': 'warn',
      'no-case-declarations': 'warn',
      'no-redeclare': 'off',
    },
  },
];
