#!/usr/bin/env node
/**
 * SOLACE — Pipeline export réseaux sociaux
 * Génère : screenshots multi-format + GIF + MP4
 *
 * Usage :
 *   node scripts/social-export.js [--video] [--frames N]
 *   node scripts/social-export.js --video --frames 90
 *
 * Sortie dans : storage/social/YYYY-MM-DD/
 */

const { chromium } = require('/root/ricadmin/Hero/ldvelh/node_modules/playwright-core');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs   = require('fs');

const args       = process.argv.slice(2);
const DO_VIDEO   = args.includes('--video');
const FRAME_COUNT = parseInt(args.find(a => a.startsWith('--frames='))?.split('=')[1] || (args[args.indexOf('--frames')+1]) || '60');
const URL        = 'http://localhost:3002/plant/';
const TODAY      = new Date().toISOString().slice(0, 10);
const OUT_DIR    = path.join(__dirname, '..', 'storage', 'social', TODAY);

fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Formats RS ────────────────────────────────────────────────────────────────
const FORMATS = [
  { name: 'instagram-square',   w: 1080, h: 1080, label: 'IG Carré 1:1'      },
  { name: 'instagram-portrait', w: 1080, h: 1350, label: 'IG Portrait 4:5'   },
  { name: 'story-tiktok',       w: 1080, h: 1920, label: 'Story / Reel 9:16' },
  { name: 'twitter-card',       w: 1200, h: 675,  label: 'Twitter/X 16:9'    },
  { name: 'linkedin-post',      w: 1200, h: 627,  label: 'LinkedIn 1.91:1'   },
];

// ── Angles caméra pour variété ────────────────────────────────────────────────
const SHOTS = [
  { label: 'vue-ensemble',  camPos: [2,  8, 13],  target: [0.5, 0.8, 0]  },
  { label: 'vue-sol',       camPos: [1,  3,  8],  target: [0.5, 0.5, 0]  },
  { label: 'vue-plongee',   camPos: [0, 14,  5],  target: [0.5, 0,   0]  },
  { label: 'vue-laterale',  camPos: [10, 5,  2],  target: [0.5, 1,   0]  },
];

async function run() {
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  });

  console.log(`\n📁 Sortie : ${OUT_DIR}`);
  console.log(`📸 Formats : ${FORMATS.length} | Angles : ${SHOTS.length} | Vidéo : ${DO_VIDEO}\n`);

  // ── Screenshots statiques ─────────────────────────────────────────────────
  for (const fmt of FORMATS) {
    console.log(`\n▶ ${fmt.label} (${fmt.w}×${fmt.h})`);
    const page = await browser.newPage({ viewport: { width: fmt.w, height: fmt.h } });
    page.on('pageerror', e => console.error('  [err]', e.message));

    await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(4000); // attendre GLTF + animation

    for (const shot of SHOTS) {
      // Positionner la caméra via la scène Three.js exposée
      await page.evaluate(({ pos, tgt }) => {
        try {
          // eslint-disable-next-line no-undef -- contexte navigateur (page.evaluate)
          const scene = window.__solaceScene;
          if (!scene) return;
          scene.camera.position.set(...pos);
          scene.orb.target.set(...tgt);
          scene.orb.update();
          scene.orb.autoRotate = false;
        } catch(e) {}
      }, { pos: shot.camPos, tgt: shot.target });

      await page.waitForTimeout(300);

      const fname = `${fmt.name}_${shot.label}.png`;
      await page.screenshot({ path: path.join(OUT_DIR, fname) });
      console.log(`  ✓ ${fname}`);
    }

    await page.close();
  }

  // ── Enregistrement vidéo (frames → ffmpeg) ────────────────────────────────
  if (DO_VIDEO) {
    console.log(`\n🎬 Enregistrement ${FRAME_COUNT} frames…`);
    const framesDir = path.join(OUT_DIR, 'frames');
    fs.mkdirSync(framesDir, { recursive: true });

    // Format 9:16 pour Reel/TikTok
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(4000);

    for (let i = 0; i < FRAME_COUNT; i++) {
      const fname = `frame_${String(i).padStart(4, '0')}.png`;
      await page.screenshot({ path: path.join(framesDir, fname) });
      if (i % 10 === 0) process.stdout.write(`  ${i}/${FRAME_COUNT}\r`);
    }
    console.log(`  ${FRAME_COUNT}/${FRAME_COUNT} frames capturées`);
    await page.close();

    // MP4
    const mp4Out = path.join(OUT_DIR, 'solace-reel.mp4');
    console.log('\n🔧 ffmpeg → MP4…');
    execSync(`ffmpeg -y -r 24 -i "${framesDir}/frame_%04d.png" -vcodec libx264 -pix_fmt yuv420p -crf 20 "${mp4Out}" 2>/dev/null`);
    console.log(`  ✓ ${mp4Out}`);

    // GIF (résolution réduite pour partage rapide)
    const gifOut = path.join(OUT_DIR, 'solace-preview.gif');
    console.log('🔧 ffmpeg → GIF…');
    execSync(`ffmpeg -y -r 12 -i "${framesDir}/frame_%04d.png" -vf "scale=480:-1:flags=lanczos,fps=12,split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse" "${gifOut}" 2>/dev/null`);
    const gifSize = (fs.statSync(gifOut).size / 1024 / 1024).toFixed(1);
    console.log(`  ✓ ${gifOut} (${gifSize} MB)`);

    // Nettoyage frames brutes
    fs.rmSync(framesDir, { recursive: true });
  }

  await browser.close();

  // ── Résumé ─────────────────────────────────────────────────────────────────
  const files = fs.readdirSync(OUT_DIR);
  console.log(`\n✅ Export terminé — ${files.length} fichiers dans ${OUT_DIR}`);
  files.forEach(f => {
    const size = (fs.statSync(path.join(OUT_DIR, f)).size / 1024).toFixed(0);
    console.log(`   ${f.padEnd(45)} ${size} KB`);
  });
}

run().catch(err => { console.error(err); process.exit(1); });
