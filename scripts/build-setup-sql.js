/**
 * scripts/build-setup-sql.js
 *
 * Menggabungkan file migration + seed menjadi satu file
 * `supabase/SETUP-ALL.sql` yang bisa langsung di-paste ke SQL Editor.
 *
 * Kenapa perlu? Supabase CLI butuh DATABASE PASSWORD untuk `db push`.
 * Kalau password tidak tersedia, jalan termudah adalah paste SQL manual —
 * dan menyalin 3 file satu per satu rawan terlewat.
 *
 * Jalankan setiap kali migration berubah:
 *   node scripts/build-setup-sql.js
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/**
 * Urutan penting: skema dasar dulu, baru mekanik yang bergantung padanya,
 * terakhir seed yang meng-UPDATE baris hasil migrasi.
 */
const PARTS = [
  {
    file: 'supabase/migrations/20260925000001_v2_game_system.sql',
    title: 'SKEMA V2 — tabel, RPC, RLS, seed 10 stage / stiker / toko',
  },
  {
    file: 'supabase/migrations/20260925000002_guess_text_mode.sql',
    title: 'MEKANIK TEBAK TEKS — kolom blank_image_url + RPC check_guess_answer',
  },
  {
    file: 'supabase/seed-blank-images.sql',
    title: 'HUBUNGKAN GAMBAR TANPA TEKS KE SOAL',
  },
];

const missing = PARTS.filter((p) => !existsSync(path.join(ROOT, p.file)));
if (missing.length > 0) {
  console.error('❌ File berikut tidak ditemukan:');
  missing.forEach((p) => console.error(`   - ${p.file}`));
  process.exit(1);
}

let out = '';
out += '-- =====================================================================\n';
out += '-- TeSiMok — SETUP LENGKAP (sekali jalan)\n';
out += '--\n';
out += '-- Cara pakai:\n';
out += '--   1. Buka Supabase Dashboard -> SQL Editor -> New query\n';
out += '--   2. Paste SELURUH isi file ini\n';
out += '--   3. Klik Run (atau Ctrl+Enter)\n';
out += '--   4. Verifikasi:  npm run check\n';
out += '--\n';
out += '-- Aman dijalankan berulang kali (semua statement idempoten).\n';
out += '-- JANGAN edit file ini langsung — ia digenerate oleh\n';
out += '-- scripts/build-setup-sql.js dari:\n';
PARTS.forEach((p, i) => { out += `--   ${i + 1}. ${p.file}\n`; });
out += '-- =====================================================================\n';

for (const p of PARTS) {
  out += '\n\n-- #####################################################################\n';
  out += `-- ## ${p.title}\n`;
  out += `-- ## sumber: ${p.file}\n`;
  out += '-- #####################################################################\n\n';
  out += readFileSync(path.join(ROOT, p.file), 'utf8');
}

const outPath = path.join(ROOT, 'supabase', 'SETUP-ALL.sql');
writeFileSync(outPath, out, 'utf8');

// Sanitasi cepat: blok PL/pgSQL dibungkus $$, jadi jumlahnya harus genap.
const dollarCount = (out.match(/\$\$/g) || []).length;
if (dollarCount % 2 !== 0) {
  console.warn(`⚠️  Jumlah '$$' ganjil (${dollarCount}) — periksa blok fungsi!`);
}

const tables = (out.match(/CREATE TABLE/gi) || []).length;
const funcs = (out.match(/CREATE OR REPLACE FUNCTION/gi) || []).length;

console.log(`✅ supabase/SETUP-ALL.sql dibuat`);
console.log(`   ${(out.length / 1024).toFixed(1)} KB · ${tables} tabel · ${funcs} fungsi\n`);
console.log('   Selanjutnya: paste file itu ke Supabase SQL Editor, lalu jalankan npm run check\n');
