/**
 * config/game.js
 * Single source of truth for gameplay tuning. Changing a value here
 * updates both the client prediction and the server validation payloads.
 */

// ---------- Lives ----------
export const MAX_LIVES = 5;
export const LIFE_REGEN_HOURS = 2;
export const LIFE_REGEN_MS = LIFE_REGEN_HOURS * 60 * 60 * 1000;

// ---------- Answer keys ----------
export const FREE_KEYS_PER_DAY = 2;
export const KEY_PACK_SIZE = 5;
export const KEY_PACK_PRICE_IDR = 20000;

// ---------- Stage mode ----------
export const STAGE_COUNT = 10;
export const QUESTIONS_PER_STAGE = 10;
export const STAGE_TIME_PER_QUESTION = 6;

/**
 * Mekanik permainan.
 *
 * `guess-text` (default, sejak v2.1): pemain melihat stiker UTUH dengan
 *   caption-nya dihapus, lalu menebak TEKS apa yang seharusnya ada di sana.
 *   Jawaban benar → teks muncul di posisi caption pada gambar.
 *
 * `guess-image` (warisan v1/v2): gambar di-crop 1/4 dan pemain menebak
 *   gambar apa itu. Disimpan sebagai fallback untuk soal yang belum punya
 *   aset `blank_image_url`.
 */
export const GAME_MECHANIC = 'guess-text';

/** Berapa lama teks jawaban ditahan di layar sebelum lanjut ke soal berikutnya. */
export const REVEAL_HOLD_MS = { correct: 1400, wrong: 1900 };

/** Star thresholds are stored per-stage in the DB; these are display fallbacks. */
export const STAR_THRESHOLDS = { one: 60, two: 80, three: 100 };

/** Points awarded per correct answer, scaled by the current streak. */
export const BASE_POINTS = 10;
export const STREAK_BONUS = 2;
export const MAX_STREAK_BONUS = 10;

/** Bonus points for answering fast (proportional to time remaining). */
export const SPEED_BONUS_MAX = 5;

// ---------- Battle / ranked ----------
export const BATTLE_DURATION_SECONDS = 60;
export const BATTLE_POINTS_PER_CORRECT = 100;
export const BATTLE_STREAK_BONUS = 20;
export const BATTLE_STARTING_RATING = 1000;
export const MATCHMAKING_TIMEOUT_MS = 30000;
export const MATCH_POLL_INTERVAL_MS = 2000;

/** Taunt stickers available during battle (free ones + premium unlocks). */
export const TAUNT_STICKERS = [
  { id: 'hai', emoji: '👋', label: 'Hai', premium: false },
  { id: 'lucu', emoji: '😐', label: 'Dikira Lucu', premium: false },
  { id: 'terluka', emoji: '😂', label: 'Tertawa Terluka', premium: false },
  { id: 'sibuk', emoji: '😴', label: 'Sedang Sibuk', premium: false },
  { id: 'jempol', emoji: '👍', label: 'Jempol', premium: false },
  { id: 'api', emoji: '🔥', label: 'Lagi Panas', premium: true },
  { id: 'sigma', emoji: '😎', label: 'Sigma', premium: true },
  { id: 'nangis', emoji: '😭', label: 'Nangis', premium: true },
  { id: 'polisi', emoji: '🚓', label: 'Bilangin Polisi', premium: true },
  { id: 'mahkota', emoji: '👑', label: 'Raja Jomok', premium: true },
];

// ---------- Daily rewards (mirrors the SQL function) ----------
export const DAILY_REWARDS = [
  { day: 1, lives: 1, keys: 0, coins: 50 },
  { day: 2, lives: 0, keys: 1, coins: 75 },
  { day: 3, lives: 1, keys: 0, coins: 100 },
  { day: 4, lives: 0, keys: 1, coins: 125 },
  { day: 5, lives: 1, keys: 0, coins: 150 },
  { day: 6, lives: 1, keys: 1, coins: 200 },
  { day: 7, lives: 2, keys: 2, coins: 500 },
];

// ---------- Monetisation ----------
export const PREMIUM_PLANS = [
  {
    sku: 'premium_monthly',
    name: 'Bulanan',
    price: 29000,
    period: '/ bulan',
    badge: null,
  },
  {
    sku: 'premium_yearly',
    name: 'Tahunan',
    price: 199000,
    period: '/ tahun',
    badge: 'Hemat 43%',
  },
];

export const PREMIUM_BENEFITS = [
  'Bebas iklan selamanya',
  'Akses stiker eksklusif',
  'Akses soal eksklusif',
  'Reward harian lebih besar',
  'Badge premium di leaderboard',
];

/** Ad cadence for free users. Premium users never see these. */
export const AD_CONFIG = {
  interstitialEveryNPlays: 3,
  rewardedKeysAmount: 1,
  rewardedCoinsAmount: 100,
};

// ---------- Economy ----------
export const COINS_PER_WIN = 150;
export const COINS_PER_BATTLE_WIN = 200;

// ---------- Level / XP ----------
/** Player level derived from total stage stars. */
export function levelFromStars(stars) {
  return Math.max(1, Math.floor(stars / 3) + 1);
}

export function starsForNextLevel(stars) {
  const level = levelFromStars(stars);
  return level * 3;
}

// ---------- Scoring helpers (client-side preview; server is authoritative) ----------
export function computeScore(isCorrect, streak, secondsLeft, timeLimit) {
  if (!isCorrect) return 0;

  const streakBonus = Math.min(STREAK_BONUS * (streak - 1), MAX_STREAK_BONUS);
  const speedRatio = timeLimit > 0 ? Math.max(0, secondsLeft / timeLimit) : 0;
  const speedBonus = Math.round(SPEED_BONUS_MAX * speedRatio);

  return BASE_POINTS + streakBonus + speedBonus;
}

export function computeStars(accuracy, stage) {
  const t1 = stage?.star1_percent ?? STAR_THRESHOLDS.one;
  const t2 = stage?.star2_percent ?? STAR_THRESHOLDS.two;
  const t3 = stage?.star3_percent ?? STAR_THRESHOLDS.three;

  if (accuracy >= t3) return 3;
  if (accuracy >= t2) return 2;
  if (accuracy >= t1) return 1;
  return 0;
}
