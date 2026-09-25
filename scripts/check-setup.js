/**
 * scripts/check-setup.js
 *
 * Memeriksa apakah database Supabase + aset sudah siap untuk menjalankan
 * TeSiMok v2.1. Jalankan kapan saja untuk tahu apa yang masih kurang.
 *
 *   node scripts/check-setup.js
 *
 * Script ini hanya MEMBACA — tidak mengubah apa pun di database.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------- Baca konfigurasi ----------
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!existsSync(envPath)) {
    console.error('❌ File .env tidak ditemukan di root proyek.');
    process.exit(1);
  }

  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('❌ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY tidak ada di .env');
  process.exit(1);
}

const REST = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;

const results = [];
function record(ok, label, detail = '') {
  results.push({ ok, label, detail });
}

// ---------- Cek via REST ----------
async function restGet(pathAndQuery) {
  const res = await fetch(`${REST}/${pathAndQuery}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  let body = null;
  try { body = await res.json(); } catch { /* biarkan null */ }
  return { status: res.status, body };
}

async function checkTables() {
  const tables = [
    ['questions', 'Bank soal'],
    ['profiles', 'Profil pemain (nyawa/koin/premium)'],
    ['stages', 'Daftar 10 stage'],
    ['stage_progress', 'Progres bintang per stage'],
    ['stage_runs', 'Riwayat percobaan'],
    ['battles', 'Pertandingan ranked'],
    ['battle_answers', 'Jawaban dalam battle'],
    ['taunt_messages', 'Stiker taunt realtime'],
    ['stickers', 'Katalog stiker'],
    ['user_stickers', 'Stiker yang dimiliki'],
    ['weekly_ranked', 'Leaderboard mingguan'],
    ['transactions', 'Riwayat transaksi'],
    ['shop_items', 'Katalog toko'],
    ['daily_reward_claims', 'Klaim reward harian'],
    ['question_attempts', 'Statistik per soal'],
  ];

  for (const [name, label] of tables) {
    const { status } = await restGet(`${name}?select=*&limit=1`);
    record(status === 200, `Tabel ${name}`, label);
  }
}

async function checkColumn() {
  const { status, body } = await restGet('questions?select=blank_image_url&limit=1');
  const ok = status === 200;
  record(
    ok,
    'Kolom questions.blank_image_url',
    ok ? '' : (body?.message || 'kolom belum ada'),
  );
}

async function checkRpc(name, label) {
  // RPC functions with required parameters need dummy args to avoid PostgREST "without parameters" 404
  const sampleArgs = {
    check_guess_answer: { p_question_id: '00000000-0000-0000-0000-000000000000', p_answer: 'sample' },
    record_stage_result: { p_stage_id: 1, p_correct: 0, p_total: 5, p_score: 0, p_max_streak: 0 },
    find_or_create_battle: {},
    get_profile: {},
  }[name] || {};

  const res = await fetch(`${REST}/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(sampleArgs),
  });

  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  const msg = String(body?.message || '');
  const missing = res.status === 404 || /could not find the function|does not exist/i.test(msg);

  record(!missing, `RPC ${name}`, label);
}

async function checkStageSeed() {
  const { status, body } = await restGet('stages?select=id&order=id');
  if (status !== 200) {
    record(false, 'Seed 10 stage', 'tabel stages belum ada');
    return;
  }
  const count = Array.isArray(body) ? body.length : 0;
  record(count >= 10, 'Seed 10 stage', `terisi ${count} stage`);
}

async function checkQuestionSeed() {
  const { status, body } = await restGet('questions?select=id');
  if (status !== 200) {
    record(false, 'Bank soal', 'tabel questions belum bisa dibaca');
    return;
  }
  const count = Array.isArray(body) ? body.length : 0;
  record(count > 0, 'Bank soal', `${count} soal tersedia`);
}

async function checkBlankImages() {
  const { status, body } = await restGet(
    'questions?select=fragment_url,blank_image_url&blank_image_url=not.is.null',
  );
  if (status !== 200) {
    record(false, 'Soal punya gambar tanpa teks', 'kolom belum ada');
    return;
  }
  const linked = Array.isArray(body) ? body.length : 0;
  const { body: all } = await restGet('questions?select=id');
  const total = Array.isArray(all) ? all.length : 0;

  record(
    linked > 0,
    'Soal punya gambar tanpa teks',
    `${linked}/${total} soal sudah terhubung`,
  );
}

// ---------- Cek aset lokal ----------
function checkAssets() {
  const blankDir = path.join(ROOT, 'public', 'fragments-blank');
  if (!existsSync(blankDir)) {
    record(false, 'Folder public/fragments-blank/', 'belum digenerate');
    return;
  }
  const files = readdirSync(blankDir).filter((f) => f.endsWith('.webp'));
  record(files.length > 0, 'Gambar tanpa teks di public/', `${files.length} file`);

  const setupSql = path.join(ROOT, 'supabase', 'SETUP-ALL.sql');
  record(existsSync(setupSql), 'File supabase/SETUP-ALL.sql', 'siap di-paste');
}

// ---------- Jalankan ----------
async function main() {
  console.log('\n🔍 Memeriksa kesiapan setup TeSiMok...\n');
  console.log(`   Project: ${SUPABASE_URL}\n`);

  try {
    await checkTables();
    await checkColumn();
    await checkStageSeed();
    await checkQuestionSeed();
    await checkBlankImages();
    await checkRpc('get_profile', 'ambil profil pemain');
    await checkRpc('check_guess_answer', 'verifikasi jawaban tebak teks');
    await checkRpc('record_stage_result', 'simpan hasil stage');
    await checkRpc('find_or_create_battle', 'matchmaking battle');
  } catch (err) {
    console.error('\n❌ Gagal menghubungi Supabase:', err.message);
    console.error('   Periksa koneksi internet dan nilai di .env.\n');
    process.exit(1);
  }

  checkAssets();

  // ---------- Laporan ----------
  console.log('─'.repeat(64));
  const failed = results.filter((r) => !r.ok);

  for (const r of results) {
    const mark = r.ok ? '✅' : '❌';
    const detail = r.detail ? `  — ${r.detail}` : '';
    console.log(`${mark} ${r.label}${detail}`);
  }

  console.log('─'.repeat(64));

  if (failed.length === 0) {
    console.log('\n🎉 Semua siap! Jalankan `npm run dev` lalu buka http://localhost:5173\n');
  } else {
    console.log(`\n⚠️  ${failed.length} dari ${results.length} pemeriksaan belum lolos.\n`);
    console.log('   Langkah perbaikan:');
    console.log('   1. Buka Supabase Dashboard → SQL Editor → New query');
    console.log('   2. Paste seluruh isi  supabase/SETUP-ALL.sql');
    console.log('   3. Klik Run');
    console.log('   4. Jalankan ulang:  node scripts/check-setup.js\n');
  }
}

main().catch((err) => {
  console.error('❌ Error tak terduga:', err);
  process.exit(1);
});
