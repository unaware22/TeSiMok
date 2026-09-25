# TeSiMok — Tebak Teks Stiker Jomok

Game tebak-teks: stiker ditampilkan **tanpa caption**, dan kamu menebak **teks
apa yang seharusnya ada di stiker itu**. Kalau benar, teksnya muncul menempel
di stiker.

Versi 2 menambahkan sistem stage, battle ranked real-time, sistem nyawa, kunci
jawaban, langganan premium, iklan, reward harian, dan tema terang yang mengikuti
`UIUX.png`.

**Stack:** Vanilla JS (ES modules) + Vite · Supabase (Auth, Postgres, Realtime, RLS)

---

## Daftar Isi

- [Fitur](#fitur)
- [Menjalankan Proyek](#menjalankan-proyek)
- [Setup Database (WAJIB)](#setup-database-wajib)
- [Deploy Edge Functions](#deploy-edge-functions)
- [Struktur Folder](#struktur-folder)
- [Arsitektur](#arsitektur)
- [Monetisasi](#monetisasi)
- [Integrasi Iklan & Pembayaran](#integrasi-iklan--pembayaran)
- [Perintah Berguna](#perintah-berguna)
- [Troubleshooting](#troubleshooting)

---

## Fitur

### 0. Mekanik Inti — Tebak Teks Stiker

Permainan ini bukan "tebak gambar" biasa. Stiker ditampilkan **utuh tapi
caption-nya sudah dihapus**, dan pemain menebak **teks apa yang seharusnya
ada di stiker itu**.

- **Jawaban benar** → teks jawaban **muncul di posisi caption** dengan animasi
  "stempel", sehingga stiker jadi utuh kembali. Ini momen hadiah utama.
- **Jawaban salah** → teks **tidak muncul**; slot caption berkedip merah dan
  jawaban yang benar hanya ditandai di tombol opsi.
- Pilihan jawaban berupa 4 tombol teks, sehingga **kunci jawaban (🔑)** tetap
  relevan (menghilangkan 1 opsi salah).
- **Verifikasi di server** lewat RPC `check_guess_answer` — jawaban tidak
  dibandingkan di klien, jadi tidak bisa diintip lewat DevTools.
- **Fallback otomatis:** soal yang belum punya aset stiker tanpa teks jatuh ke
  gambar crop lama, jadi permainan tidak pernah macet karena data kurang.
- Statistik tiap jawaban dicatat ke `question_attempts` untuk mengukur
  **soal tersulit** (`get_hardest_questions`).

Aset stiker tanpa caption digenerate oleh `scripts/make-blank-questions.js`:
area caption ditutup oleh panel bergradasi yang **warnanya diambil dari piksel
di sekitarnya**, jadi terlihat menyatu dengan foto, bukan seperti blok sensor.

### 1. Single Mode — Stage

- **1 level berisi 10 stage**, difficulty naik bertahap.
- Kesulitan naik lewat 3 hal: **waktu per soal** makin ketat (25s → 8s),
  **bank soal** makin luas/ambigu, dan **kategori** makin campur.
- **Unlock berbasis bintang.** Stage berikutnya terbuka setelah mengumpulkan
  bintang tertentu dan menuntaskan stage sebelumnya.
- **Penilaian bintang:** 1★ lulus, 2★ target menengah, 3★ sempurna
  (threshold berbeda per stage).
- **Streak & speed bonus.** Poin = 100 + bonus streak (maks 150) + bonus cepat
  (maks 50). Server tetap otoritatif untuk data yang disimpan.
- **Kunci jawaban** menghilangkan 1 opsi salah di tengah permainan.

### 2. Battle / Ranked Mode (Premium)

- **Matchmaking rating-based** dengan toleransi melebar seiring waktu tunggu.
- **Layar dibagi 2 secara mirroring real-time.** Setengah layar untukmu, setengah
  lagi untuk lawan (di desktop: kiri/kanan; di mobile: atas/bawah, sisi lawan
  diputar 180° agar terasa benar-benar "berhadapan").
- **Duel 60 detik** — makin banyak benar, makin tinggi poin.
- **Taunting stiker real-time** via Supabase Realtime.
- **ELO rating** (K=32) dengan pengali margin kemenangan.
- **Leaderboard turnamen mingguan** + **global** sepanjang masa.
- **Bot fallback** setelah 30 detik agar mode tidak pernah jadi jalan buntu.

### 3. Subscription (Premium)

- Bebas iklan · stiker eksklusif · soal eksklusif · reward harian lebih besar.
- Paket **Bulanan Rp29.000** dan **Tahunan Rp199.000** (hemat 43%).

### 4. Iklan (User Gratis)

- **Interstitial** setiap 3 kali bermain, **rewarded video** untuk kunci/koin.
- Pemain premium tidak pernah melihat iklan (dijaga di layer service).

### 5. ❤️ Sistem Nyawa

- Maksimal **5 nyawa**, pulih **1 nyawa per 2 jam**.
- Pemulihan dihitung *lazy* di server (fungsi `refill_lives`), jadi tidak butuh cron.
- **Refill instan** lewat Toko (Rp10.000 untuk 5 nyawa).

### 6. 🔑 Kunci Jawaban

- **2 kunci gratis setiap hari** (otomatis direset, termasuk untuk user baru).
- Beli tambahan: **Rp20.000 untuk 5 kunci** (ada paket lebih hemat).

### 7. 🎁 Daily Login Reward

- Siklus **7 hari** dengan hadiah meningkat; hari ke-7 jackpot
  (+2 nyawa, +2 kunci, +500 koin).
- Streak putus jika tidak login sehari.

---

## Menjalankan Proyek

```bash
npm install

# Siapkan environment
cp .env.example .env
# lalu isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY

npm run dev      # http://localhost:5173
npm run build    # produksi -> dist/
npm run preview  # pratinjau hasil build
```

---

## Setup Database (WAJIB — baca ini dulu)

Semua fitur v2 bergantung pada skema baru. **Aplikasi tidak akan berfungsi
sebelum migrasi dijalankan.** Tanpa migrasi, layar akan kosong dan konsol
browser menampilkan error seperti:

```
Could not find the function public.get_stage_progress
Could not find the table 'public.stages' in the schema cache
```

### Langkah cepat (paling mudah, tanpa password)

1. **Buat file SQL gabungan** (sudah tersedia bila belum ada):
   ```bash
   npm run setup:sql
   ```
2. **Buka Supabase Dashboard → SQL Editor → New query**, lalu **paste seluruh
   isi** `supabase/SETUP-ALL.sql` dan klik **Run**.
3. **Verifikasi hasilnya:**
   ```bash
   npm run check
   ```
   Kalau semua baris bertanda ✅, database siap.
4. **Jalankan aplikasi:**
   ```bash
   npm run dev
   ```

> `SETUP-ALL.sql` adalah gabungan idempoten dari 3 file di bawah, jadi aman
> dijalankan berkali-kali. Kalau migration diubah, jalankan `npm run setup:sql`
> lagi untuk memperbarui file gabungan itu.

### Opsi alternatif — Supabase CLI

Kalau kamu punya **database password** (Project Settings → Database):

```bash
supabase link --project-ref qwvrcrpshjtvbuitkbrt
supabase db push --linked --include-all
```

### Daftar file SQL (untuk referensi)

| File | Isi | Perlu jika |
|---|---|---|
| `supabase/schema.sql` | Skema v1 (questions, sessions, leaderboard) | sudah ada di DB saat ini → **skip** |
| `supabase/seed-questions.sql` | 32 soal | sudah ada → **skip** |
| `supabase/migrations/20260925000001_v2_game_system.sql` | 14 tabel, 18 RPC, RLS, seed stage/stiker/toko | **WAJIB** |
| `supabase/migrations/20260925000002_guess_text_mode.sql` | `blank_image_url` + RPC `check_guess_answer` | **WAJIB** |
| `supabase/seed-blank-images.sql` | Menghubungkan gambar tanpa teks ke soal | **WAJIB** |
| `supabase/SETUP-ALL.sql` | **Gabungan 3 file WAJIB di atas** | pakai ini |

Semua migrasi bersifat **idempoten** (`CREATE TABLE IF NOT EXISTS`,
`ON CONFLICT DO UPDATE`, `ADD COLUMN IF NOT EXISTS`), jadi aman diulang.

### Membuat / memperbarui aset stiker tanpa teks

Kalau gambar sumber di `source-images/` berubah atau ada soal baru:

```bash
node scripts/make-blank-questions.js          # hanya file yang belum ada
node scripts/make-blank-questions.js --force   # timpa semua
```

Script ini menulis `public/fragments-blank/*.webp` dan memperbarui
`supabase/seed-blank-images.sql`. Jalankan ulang SQL itu di SQL Editor.

### Yang dibuat oleh migrasi v2

| Objek | Kegunaan |
|---|---|
| `profiles` | Nyawa, kunci, koin, premium, rating, streak harian |
| `stages` | 10 stage + threshold bintang + gating (terisi otomatis) |
| `stage_progress` | Bintang & skor terbaik per stage per pemain |
| `stage_runs` | Satu baris per percobaan (anti-cheat) |
| `battles`, `battle_answers` | Pertandingan ranked + jawaban per soal |
| `taunt_messages` | Stiker godaan real-time |
| `stickers`, `user_stickers` | Katalog & kepemilikan stiker |
| `weekly_ranked` | Papan turnamen mingguan |
| `shop_items`, `transactions` | Katalog toko + jejak audit pembelian |
| `daily_reward_claims` | Riwayat klaim hadiah harian |

**Fungsi RPC (server-authoritative):**

`get_profile` · `refill_lives` · `spend_life` · `refill_daily_keys` ·
`claim_daily_reward` · `get_stage_progress` · `record_stage_result` ·
`find_or_create_battle` · `get_battle_state` · `submit_battle_answer` ·
`finish_battle` · `purchase_sku` · `purchase_sticker` ·
`get_ranked_leaderboard`

Semuanya `SECURITY DEFINER` — klien tidak pernah bisa menaikkan nyawa, koin,
atau rating secara langsung.

### Realtime

Migrasi otomatis menambahkan `battles`, `battle_answers`, dan `taunt_messages`
ke publication `supabase_realtime`. Jika Realtime tidak aktif, nyalakan di
**Dashboard → Database → Replication**.

---

## Deploy Edge Functions

Hanya diperlukan untuk mode **Guest/anonim** yang lama. Battle, stage,
toko, dan daily reward semuanya berjalan lewat RPC dan tidak butuh fungsi ini.

```bash
supabase functions deploy start-game
supabase functions deploy submit-answer
supabase functions deploy end-game
```

---

## Struktur Folder

```
src/
├── main.js                 # Entry point: boot auth, daftar route, mulai router
├── style.css               # Import stylesheet + alias kompatibilitas
├── config/
│   └── game.js             # ⭐ SEMUA tuning gameplay (nyawa, poin, harga, stage)
├── lib/
│   ├── dom.js              # Helper DOM deklaratif (el, mount, flashClass)
│   ├── format.js           # Format angka/rupiah/durasi (locale id-ID)
│   └── audio.js            # SFX Web Audio (tanpa file aset)
├── services/               # 🔌 SATU-SATUNYA lapisan yang bicara ke Supabase
│   ├── supabase.js         # Klien + auth + helper RPC + pesan error
│   ├── profile.js          # Nyawa, kunci, koin, premium, daily reward
│   ├── stages.js           # Katalog stage, pemilihan soal, hasil
│   ├── battle.js           # Matchmaking, jawaban, taunt, realtime watcher
│   ├── shop.js             # Katalog, pembelian, adapter iklan
│   └── leaderboard.js      # Papan turnamen / global / per-stage
├── state/
│   ├── store.js            # Store observable + ticker nyawa
│   └── router.js           # Router hash + registry screen (lazy load)
├── components/
│   ├── primitives.js       # Button, Card, Tabs, Sheet, Toast, Badge, dll
│   └── shell.js            # BottomNav, GreetingBar, TopBar
├── screens/                # Satu file per layar
│   ├── auth.js             # Masuk / daftar / tamu
│   ├── home.js             # Hub utama
│   ├── stages.js           # Peta stage
│   ├── game.js             # Gameplay single-player
│   ├── battle.js           # Lobby + arena ranked
│   ├── shop.js             # Toko (Nyawa / Kunci / Item)
│   ├── subscription.js     # Upgrade premium
│   ├── daily.js            # Reward harian 7 hari
│   ├── leaderboard.js      # Turnamen & global
│   └── profile.js          # Profil, pengaturan, bantuan
└── styles/
    ├── tokens.css          # Design tokens (warna, radius, spacing, font)
    ├── components.css      # Komponen bersama
    └── screens.css         # Gaya per layar + animasi + responsif
```

---

## Arsitektur

**Aliran data satu arah.** Screen → Service → Supabase. Screen tidak pernah
memanggil Supabase langsung, sehingga semua query terkumpul di enam file
service dan mudah diuji atau diganti.

**Server itu otoritatif.** Penilaian soal, pemberian koin, pemakaian nyawa,
dan perubahan rating semuanya berjalan lewat RPC `SECURITY DEFINER` di dalam
satu transaksi. Klien hanya memprediksi untuk responsivitas UI, lalu
merekon-siliasi dengan respons server.

**Store observable minimal.** `state/store.js` menyimpan profil, kondisi nyawa,
progres stage, dan daftar stiker. Ticker 1 detik menjaga hitungan mundur nyawa
tetap akurat tanpa membebani jaringan (re-sync ke server sekali per menit).

**Router lazy.** Setiap screen adalah chunk terpisah, jadi halaman awal hanya
memuat apa yang dibutuhkan (bundle awal ~52 kB gzip).

**Realtime hemat.** Battle hanya memakai satu channel Postgres-changes.
Hitungan waktu 60 detik dianimasikan secara lokal; server hanya dipanggil saat
jawaban dikirim dan saat pertandingan diselesaikan.

---

## Monetisasi

| SKU | Item | Harga |
|---|---|---|
| `lives_5` | +5 nyawa | Rp10.000 |
| `lives_10` | +10 nyawa | Rp18.000 |
| `keys_5` | +5 kunci | Rp20.000 |
| `keys_15` | +15 kunci | Rp50.000 |
| `premium_monthly` | Premium bulanan | Rp29.000 |
| `premium_yearly` | Premium tahunan | Rp199.000 |
| `no_ads` | Hapus iklan permanen | Rp15.000 |
| `coins_1000` | 1000 koin | Rp20.000 |

`purchase_sku` menandai transaksi `paid` seketika (cocok untuk demo & alur yang
sudah terpercaya). **Untuk produksi**, jangan panggil dari klien secara
langsung: arahkan ke payment provider lalu panggil RPC pemenuhan dari webhook
provider tersebut agar tidak bisa dipalsukan.

---

## Integrasi Iklan & Pembayaran

Kedua integrasi sudah punya adapter yang tinggal diisi — UX di sekitarnya
(state loading, alur reward) sudah berfungsi penuh.

### Iklan — `src/services/shop.js`

```js
export const ads = {
  async showInterstitial() { /* Google AdSense / AdMob H5 */ },
  async showRewarded()     { /* rewarded video; return { rewarded: true } */ },
};
```

Saat ini mengembalikan hasil simulasi setelah jeda singkat, jadi alur reward
bisa diuji end-to-end sebelum SDK asli dipasang.

### Pembayaran — `supabase/migrations/...v2_game_system.sql`

Ganti isi `purchase_sku` dengan verifikasi ke provider (Midtrans / Xendit /
Stripe), dan **verifikasi signature webhook** sebelum memberi item. Semua
`transactions` sudah punya kolom `provider` dan `provider_ref` untuk ini.

---

## Perintah Berguna

```bash
npm run dev              # Dev server
npm run build            # Build produksi
npm run preview          # Pratinjau hasil build
npm run check            # Periksa apakah database + aset sudah siap
npm run setup:sql        # Regenerasi supabase/SETUP-ALL.sql
npm run blank            # Regenerasi stiker tanpa teks
npm run crop             # Potong ulang fragment dari source-images/
node scripts/make-brand-assets.js   # Regenerasi maskot & ikon PWA
```

---

## Troubleshooting

### Cek dulu: `npm run check`

Perintah ini memeriksa 25 hal (tabel, kolom, RPC, seed, aset) dan menunjukkan
persis apa yang kurang:

```
✅ Tabel questions  — Bank soal
❌ Tabel profiles  — Profil pemain (nyawa/koin/premium)
...
⚠️  21 dari 25 pemeriksaan belum lolos.
```

Kalau ada yang ❌, jalankan `supabase/SETUP-ALL.sql` di SQL Editor lalu
`npm run check` lagi.

### Error yang umum

**Layar kosong + konsol: `Could not find the table 'public.stages'`**
**atau `Could not find the function public.get_profile`**
→ Migrasi v2 belum dijalankan. Ini penyebab paling sering. Lihat
[Setup Database](#setup-database-wajib-baca-ini-dulu).

**`column questions.blank_image_url does not exist`**
→ Migration `20260925000002_guess_text_mode.sql` belum dijalankan. Jalankan
`SETUP-ALL.sql` (sudah termasuk di dalamnya).

**Semua soal menampilkan badge kecil "crop" di pojok stiker**
→ Ini bukan error. Artinya `blank_image_url` masih kosong untuk soal tersebut,
jadi game memakai gambar crop lama sebagai fallback. Jalankan
`supabase/seed-blank-images.sql`, atau cek apakah nama file di
`public/fragments-blank/` cocok dengan `fragment_url` di tabel `questions`.

**"Missing Supabase credentials"**
→ `.env` belum dibuat, atau dev server perlu di-restart setelah mengubah `.env`.

**"Soal di database hanya N, minimal 10"**
→ Bank soal kurang dari 10. Jalankan `supabase/seed-questions.sql`.

**Battle tidak menemukan lawan**
→ Buka game di dua browser/perangkat berbeda. Jika tetap kosong setelah 30
detik, bot fallback akan ditawarkan.

**Skor battle tidak sinkron**
→ Pastikan Realtime aktif dan `battles` sudah masuk publication
(lihat bagian [Realtime](#realtime)). Polling 2 detik tetap berjalan sebagai
jaring pengaman untuk matchmaking.

**Nyawa tidak bertambah**
→ Pemulihan butuh 2 jam per nyawa. Cek countdown di halaman Profil atau Toko.
Refresh halaman memicu re-sync dengan server.

**Tidak bisa login / "Email not confirmed"**
→ Di Supabase: Authentication → Providers → Email, matikan
"Confirm email" selama masa pengembangan agar bisa langsung masuk.

---

## Keamanan

- **RLS aktif** di seluruh 14 tabel; `profiles` bisa dibaca publik (dibutuhkan
  leaderboard) tetapi hanya pemilik yang bisa menulis.
- **Tidak ada tabel ekonomi yang writable dari klien.** Nyawa, kunci, koin,
  rating, dan pemberian item semuanya lewat RPC `SECURITY DEFINER`.
- **Anti-cheat:** jawaban divalidasi di server, waktu soal dicek, dan setiap
  percobaan stage dicatat di `stage_runs`.
- **Fragment diproteksi** dari context menu, zoom, dan pinch (mencegah
  pengambilan gambar secara kasual).

---

## Lisensi

Proyek privat.
