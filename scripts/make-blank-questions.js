/**
 * scripts/make-blank-questions.js
 *
 * Menghasilkan versi "tanpa teks" dari tiap stiker, dipakai sebagai soal
 * mekanik baru: user melihat gambar stiker yang caption-nya masih utuh,
 * jadi tidak ada yang bisa ditebak.
 *
 * Kenapa dari SOURCE, bukan dari fragment?
 * ────────────────────────────────────────
 * public/fragments/ berisi hasil crop 1/4 dari gambar asli, jadi caption
 * bisa berada di luar area crop — atau sebagian saja. Untuk menutup caption
 * dengan andal kita harus mulai dari gambar utuh di source-images/.
 *
 * Kenapa caption ditutup, bukan dihapus?
 * ─────────────────────────────────────
 * Kita TIDAK melakukan OCR / menghapus teks secara harfiah (rapuh, dan
 * hasilnya kotor di sekitar huruf). Sebaliknya area caption ditutup oleh
 * "panel" solid yang warnanya diambil dari rata-rata piksel tepat di
 * atasnya, sehingga terlihat seperti bagian dari foto — seperti stiker yang
 * caption-nya belum ditempel.
 *
 * Output:
 *   public/fragments-blank/stiker_<file>.webp   gambar utuh tanpa caption
 *   supabase/seed-blank-images.sql              UPDATE mapping ke DB
 *
 * Pakai:
 *   node scripts/make-blank-questions.js             # hanya yang belum ada
 *   node scripts/make-blank-questions.js --force      # timpa semua
 */
import sharp from 'sharp';
import { readdir, writeFile, mkdir, access } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'source-images');
const BLANK_DIR = path.join(ROOT, 'public', 'fragments-blank');
const SQL_OUTPUT = path.join(ROOT, 'supabase', 'seed-blank-images.sql');

/**
 * Proporsi tinggi gambar (dari bawah) yang ditutup panel.
 *
 * Caption meme ala "impact font" umumnya menempati 16–24% tinggi gambar.
 * 0.24 cukup untuk menutup caption beserta outline & descender-nya, tapi
 * masih menyisakan bagian dada/badan sehingga stiker tidak terlihat
 * terpotong separuh.
 */
const CAPTION_ZONE = 0.24;

/** Warna panel sedikit digelapkan agar terbaca sebagai bayangan, bukan blok putih. */
const PANEL_DARKEN = 0.88;

/** Lebar output stiker (persegi). Sumber berbentuk 4:3 — dipotong tengah. */
const OUT_SIZE = 512;

const SOURCE_RE = /^jomok(\d+)\.png$/i;

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ambil warna rata-rata dari beberapa strip di atas area caption.
 *
 * Memakai satu strip rata-rata global menghasilkan warna yang bisa jauh
 * berbeda dari sisi kiri/kanan gambar (mis. langit terang di kiri, gedung
 * gelap di kanan) sehingga panel terlihat seperti blok asing. Di sini kita
 * ambil warna per-kolom supaya gradien panel mengikuti gradien foto.
 */
async function sampleColumnColors(image, width, height, zoneTop) {
  const bandHeight = Math.max(4, Math.min(Math.floor(height * 0.05), zoneTop));
  const sampleTop = Math.max(0, zoneTop - bandHeight);

  // Kecilkan jadi 1px tinggi; lebar dipertahankan sebagai jumlah kolom.
  const { data, info } = await image
    .clone()
    .extract({ left: 0, top: sampleTop, width, height: bandHeight })
    .resize(width, 1, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels;
  const cols = info.width;
  const colors = [];

  for (let x = 0; x < cols; x++) {
    const i = x * ch;
    colors.push([
      Math.round(data[i] * PANEL_DARKEN),
      Math.round(data[i + 1] * PANEL_DARKEN),
      Math.round(data[i + 2] * PANEL_DARKEN),
    ]);
  }

  // Rata-rata global, dipakai sebagai warna fallback bila gradien gagal.
  const avg = colors.reduce(
    (acc, c) => [acc[0] + c[0] / cols, acc[1] + c[1] / cols, acc[2] + c[2] / cols],
    [0, 0, 0],
  ).map(Math.round);

  return { colors, avg };
}

/**
 * Buat satu gambar stiker tanpa caption.
 *
 * Alur: ambil gambar sumber → crop tengah jadi persegi → hitung warna panel
 * dari strip di atas area caption → tutup area caption → tulis webp.
 */
async function makeBlank(srcName, { force = false } = {}) {
  const srcPath = path.join(SOURCE_DIR, srcName);
  const outName = srcName.replace(/\.png$/i, '.webp');
  const outPath = path.join(BLANK_DIR, outName);

  if (!force && (await fileExists(outPath))) {
    return { name: outName, skipped: true };
  }

  // Crop tengah ke persegi lebih dulu, supaya proporsi CAPTION_ZONE konsisten
  // di semua gambar apa pun rasio aslinya.
  const squared = await sharp(srcPath, { failOn: 'none' })
    .resize(OUT_SIZE, OUT_SIZE, { fit: 'cover', position: 'attention' })
    .png()
    .toBuffer();

  const image = sharp(squared);
  const { width, height } = await image.metadata();

  const zoneTop = Math.floor(height * (1 - CAPTION_ZONE));
  const zoneHeight = height - zoneTop;

  if (zoneHeight < 8 || width < 8) {
    return { name: outName, skipped: true, reason: 'image too small' };
  }

  const { colors, avg } = await sampleColumnColors(image, width, height, zoneTop);

  // Panel = gradien horizontal yang meniru warna foto tepat di atas caption,
  // ditambah gradien vertikal tipis supaya tepi atas menyatu (tidak ada garis
  // batas keras) dan bagian bawah sedikit lebih gelap seperti bayangan.
  const stops = colors
    .map((c, i) => {
      const off = ((i / Math.max(1, colors.length - 1)) * 100).toFixed(2);
      return `<stop offset="${off}%" stop-color="rgb(${c[0]},${c[1]},${c[2]})" />`;
    })
    .join('');

  const panel = Buffer.from(
    `<svg width="${width}" height="${zoneHeight}" xmlns="http://www.w3.org/2000/svg">
       <defs>
         <linearGradient id="h" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>
         <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0%" stop-color="#000" stop-opacity="0" />
           <stop offset="22%" stop-color="#000" stop-opacity="0.06" />
           <stop offset="100%" stop-color="#000" stop-opacity="0.24" />
         </linearGradient>
         <mask id="fade">
           <linearGradient id="m" x1="0" y1="0" x2="0" y2="1">
             <stop offset="0%" stop-color="#fff" stop-opacity="0" />
             <stop offset="14%" stop-color="#fff" stop-opacity="1" />
             <stop offset="100%" stop-color="#fff" stop-opacity="1" />
           </linearGradient>
           <rect width="${width}" height="${zoneHeight}" fill="url(#m)" />
         </mask>
       </defs>
       <g mask="url(#fade)">
         <rect width="${width}" height="${zoneHeight}" fill="url(#h)" />
         <rect width="${width}" height="${zoneHeight}" fill="url(#v)" />
       </g>
     </svg>`,
  );

  await sharp(squared)
    .composite([{ input: panel, top: zoneTop, left: 0, blend: 'over' }])
    .webp({ quality: 88 })
    .toFile(outPath);

  return {
    name: outName,
    skipped: false,
    color: `${avg[0]},${avg[1]},${avg[2]}`,
    zoneTop,
    srcName,
  };
}

async function main() {
  const force = process.argv.includes('--force');

  if (!existsSync(SOURCE_DIR)) {
    console.error(`❌ Folder tidak ditemukan: ${SOURCE_DIR}`);
    process.exit(1);
  }

  await mkdir(BLANK_DIR, { recursive: true });

  const all = await readdir(SOURCE_DIR);
  const sources = all.filter((f) => SOURCE_RE.test(f)).sort((a, b) => {
    const na = Number(a.match(SOURCE_RE)[1]);
    const nb = Number(b.match(SOURCE_RE)[1]);
    return na - nb;
  });

  if (sources.length === 0) {
    console.error('❌ Tidak ada jomok*.png di source-images/.');
    process.exit(1);
  }

  console.log(`🎨 Membuat stiker tanpa caption (${sources.length} sumber)${force ? ' [mode timpa]' : ''}\n`);

  const results = [];
  for (const name of sources) {
    try {
      const res = await makeBlank(name, { force });
      results.push(res);
      console.log(
        res.skipped
          ? `  ⏭  ${name} → ${res.name} (sudah ada)`
          : `  ✅ ${name} → ${res.name}  panel=${res.color}`,
      );
    } catch (err) {
      console.warn(`  ⚠️  ${name} gagal: ${err.message}`);
    }
  }

  const created = results.filter((r) => !r.skipped);
  console.log(`\n📄 Menulis seed SQL (${created.length} baris)...`);

  let sql = `-- Auto-generated by scripts/make-blank-questions.js\n`;
  sql += `-- Kolom blank_image_url menyimpan versi stiker TANPA caption,\n`;
  sql += `-- dipakai sebagai soal mekanik "tebak teks stiker".\n`;
  sql += `-- Jalankan setelah migration v2 (kolom blank_image_url sudah ada).\n\n`;

  if (created.length === 0) {
    sql += `-- Tidak ada file baru. Semua sudah ada.\n`;
  } else {
    // fragment_url asli berbentuk /fragments/frag_<file>.webp — kita petakan
    // lewat nama file sumber (jomokN) supaya tidak bergantung pada urutan.
    const pairs = created.map((r) => {
      const base = r.name.replace(/\.webp$/i, '');
      return `  ('/fragments/frag_${base}.webp', '/fragments-blank/${r.name}')`;
    });

    sql += `UPDATE questions SET blank_image_url = v.blank_url\n`;
    sql += `FROM (VALUES\n`;
    sql += pairs.join(',\n');
    sql += `\n) AS v(fragment_url, blank_url)\n`;
    sql += `WHERE questions.fragment_url = v.fragment_url;\n\n`;

    sql += `-- Soal yang belum punya gambar blank akan jatuh ke fragment_url,\n`;
    sql += `-- jadi game tetap bisa dimainkan walau sebagian aset belum siap.\n`;
  }

  await writeFile(SQL_OUTPUT, sql, 'utf8');
  console.log(`  ✅ ${SQL_OUTPUT}`);

  console.log(`\n🎉 Selesai. ${created.length} dibuat, ${results.length - created.length} dilewati.`);
  console.log(`   Jalankan seed SQL di Supabase SQL Editor untuk menghubungkan ke soal.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
