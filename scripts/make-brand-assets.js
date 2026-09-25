/**
 * make-brand-assets.js
 * Generates the brand/character artwork used across the v2 UI:
 *  - public/brand/char.webp        (mascot, used on splash/auth/hero/reward)
 *  - public/brand/char-win.webp    (thumbs-up variant for win states)
 *  - public/brand/char-sad.webp    (loss variant)
 *  - public/icons/*.png            (PWA style icons)
 *
 * Source: the existing jomok sticker set in source-images/.
 */
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'source-images');
const BRAND_DIR = path.join(ROOT, 'public', 'brand');
const ICON_DIR = path.join(ROOT, 'public', 'icons');

// Character picks — expressive jomok stickers work best as mascots
const MASCOTS = {
  'char': 'jomok5',        // laughing / energetic
  'char-win': 'jomok30',   // cocky sunglasses
  'char-sad': 'jomok4',    // resigned
  'char-cool': 'jomok32',
};

function pickSource(key) {
  const preferred = path.join(SOURCE, `${MASCOTS[key]}.png`);
  if (existsSync(preferred)) return preferred;

  // Fall back to any jomok sticker when the preferred one is missing
  for (const n of [12, 11, 10, 9, 8, 7, 6, 5, 3, 2, 1]) {
    const p = path.join(SOURCE, `jomok${n}.png`);
    if (existsSync(p)) return p;
  }
  return null;
}

async function makeBrand(key, size) {
  const src = pickSource(key);
  if (!src) {
    console.warn(`  ⚠ No source found for ${key}, skipping`);
    return;
  }

  const out = path.join(BRAND_DIR, `${key}.webp`);
  await sharp(src)
    .resize(size, size, { fit: 'cover', position: 'top' })
    .webp({ quality: 88 })
    .toFile(out);

  console.log(`  ✅ ${key}.webp  (${size}x${size})`);
}

async function makeIcon(key, size, name, bg = '#101a2c') {
  const src = pickSource(key);
  const canvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bg,
    },
  });

  const layers = [];
  if (src) {
    const art = await sharp(src)
      .resize(Math.round(size * 0.78), Math.round(size * 0.78), { fit: 'cover', position: 'top' })
      .png()
      .toBuffer();

    layers.push({
      input: art,
      top: Math.round(size * 0.11),
      left: Math.round(size * 0.11),
    });
  }

  await canvas
    .composite(layers)
    .png()
    .toFile(path.join(ICON_DIR, name));

  console.log(`  ✅ icons/${name}  (${size}x${size})`);
}

async function main() {
  console.log('🎨 TeSiMok brand asset generator\n');

  if (!existsSync(BRAND_DIR)) mkdirSync(BRAND_DIR, { recursive: true });
  if (!existsSync(ICON_DIR)) mkdirSync(ICON_DIR, { recursive: true });

  console.log('📦 Character artwork...');
  await makeBrand('char', 512);
  await makeBrand('char-win', 512);
  await makeBrand('char-sad', 512);
  await makeBrand('char-cool', 512);

  console.log('\n📱 App icons...');
  await makeIcon('char', 192, 'icon-192.png');
  await makeIcon('char', 512, 'icon-512.png');
  await makeIcon('char', 512, 'maskable-512.png', '#f5b014');
  await makeIcon('char', 180, 'apple-touch-icon.png');

  console.log('\n🎉 Brand assets ready in public/brand/ and public/icons/');
}

main().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
