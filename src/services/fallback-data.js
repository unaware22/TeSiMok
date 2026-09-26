/**
 * services/fallback-data.js
 * Comprehensive fallback data and local storage manager.
 * Ensures the entire application works smoothly offline or when Supabase
 * tables/RPCs are not yet migrated.
 */

export const DEFAULT_PROFILE = {
  id: 'player-local-123',
  display_name: 'Player123',
  avatar_emoji: '😎',
  avatar_url: '/brand/avatar.webp',
  coins: 500,
  lives: 5,
  max_lives: 5,
  life_regen_at: new Date().toISOString(),
  answer_keys: 2,
  keys_reset_on: new Date().toISOString().slice(0, 10),
  is_premium: false,
  is_premium_active: false,
  premium_tier: null,
  premium_until: null,
  daily_streak: 1,
  last_daily_claim: null,
  rating: 1000,
  ranked_wins: 0,
  ranked_losses: 0,
  ranked_draws: 0,
  total_score: 0,
  stage_score: 0,
  battle_score: 0,
  stages_cleared: 0,
  total_stars: 0,
  sound_enabled: true,
  haptics_enabled: true,
};

export const DEFAULT_STAGES = [
  { id: 1, slug: 'pemanasan', title: 'Pemanasan', subtitle: 'Tebak stiker jomok dasar', emoji: '🎯', question_count: 5, time_per_question: 25, pass_percent: 60, star2_percent: 80, star3_percent: 100 },
  { id: 2, slug: 'meme-klasik', title: 'Meme Klasik', subtitle: 'Stiker yang sering lewat di grup', emoji: '😂', question_count: 5, time_per_question: 22, pass_percent: 60, star2_percent: 80, star3_percent: 100 },
  { id: 3, slug: 'jomok-santai', title: 'Jomok Santai', subtitle: 'Tingkat kesulitan menengah', emoji: '☕', question_count: 5, time_per_question: 20, pass_percent: 60, star2_percent: 80, star3_percent: 100 },
  { id: 4, slug: 'sigma-mode', title: 'Sigma Mode', subtitle: 'Jangan sampai salah tebak', emoji: '🗿', question_count: 5, time_per_question: 20, pass_percent: 70, star2_percent: 85, star3_percent: 100 },
  { id: 5, slug: 'amba-universe', title: 'Amba Universe', subtitle: 'Kumpulan stiker Mas Amba', emoji: '👑', question_count: 5, time_per_question: 18, pass_percent: 70, star2_percent: 85, star3_percent: 100 },
  { id: 6, slug: 'rusdi-club', title: 'Rusdi Barber', subtitle: 'Koleksi pangkas rambut legendaris', emoji: '✂️', question_count: 5, time_per_question: 18, pass_percent: 70, star2_percent: 85, star3_percent: 100 },
  { id: 7, slug: 'suki-expert', title: 'Suki Expert', subtitle: 'Hanya sepuh yang bisa jawab', emoji: '🔥', question_count: 5, time_per_question: 16, pass_percent: 80, star2_percent: 90, star3_percent: 100 },
  { id: 8, slug: 'master-stiker', title: 'Master Stiker', subtitle: 'Waktu makin sempit', emoji: '⚡', question_count: 5, time_per_question: 15, pass_percent: 80, star2_percent: 90, star3_percent: 100 },
  { id: 9, slug: 'grandmaster', title: 'Grandmaster Jomok', subtitle: 'Hampir mendekati puncak', emoji: '🌟', question_count: 5, time_per_question: 12, pass_percent: 80, star2_percent: 90, star3_percent: 100 },
  { id: 10, slug: 'raja-jomok', title: 'Raja Jomok', subtitle: 'Final Boss — Taklukkan Sang Raja!', emoji: '👹', question_count: 5, time_per_question: 10, pass_percent: 80, star2_percent: 90, star3_percent: 100, is_boss: true },
];

export const RAW_QUESTION_BANK = [
  { file: 'jomok1', answer: 'Bersiaplah', options: ['Bersiaplah', 'Yang Nanya Siapa', 'Tertawa Tapi Terluka', 'Sedang Sibuk'] },
  { file: 'jomok2', answer: 'Berotak Kontol', options: ['Berotak Kontol', 'Sedang Sibuk', 'Dikira Lucu', 'Tertawa Tapi Terluka'] },
  { file: 'jomok3', answer: 'Rusdi', options: ['Rusdi', 'Sedang Sibuk', 'Berotak Kontol', 'Ada Ada Saja'] },
  { file: 'jomok4', answer: 'Gw Lagi Yang Kena', options: ['Gw Lagi Yang Kena', 'Dikira Lucu', 'Gk', 'Rusdi'] },
  { file: 'jomok5', answer: 'Langsung Sigma Gw Bjiir', options: ['Langsung Sigma Gw Bjiir', 'Berotak Kontol', 'Dikira Lucu', 'Aku Nak'] },
  { file: 'jomok6', answer: 'Gk', options: ['Gk', 'Dikira Lucu', 'Tertawa Tapi Terluka', 'Aku Nak'] },
  { file: 'jomok7', answer: 'Sedang Sibuk', options: ['Sedang Sibuk', 'Gk', 'Rusdi', 'Bersiaplah'] },
  { file: 'jomok8', answer: 'Aku Nak', options: ['Aku Nak', 'Ada Ada Saja', 'Tertawa Tapi Terluka', 'Dikira Lucu'] },
  { file: 'jomok9', answer: 'Yang Nanya Siapa', options: ['Yang Nanya Siapa', 'Bersiaplah', 'Gw Lagi Yang Kena', 'Aku Nak'] },
  { file: 'jomok10', answer: 'Dikira Lucu', options: ['Dikira Lucu', 'Ada Ada Saja', 'Gw Lagi Yang Kena', 'Sedang Sibuk'] },
  { file: 'jomok11', answer: 'Ada Ada Saja', options: ['Ada Ada Saja', 'Aku Nak', 'Dikira Lucu', 'Langsung Sigma Gw Bjiir'] },
  { file: 'jomok12', answer: 'Tertawa Tapi Terluka', options: ['Tertawa Tapi Terluka', 'Gk', 'Aku Nak', 'Dikira Lucu'] },
  { file: 'jomok13', answer: 'Ape Tu Woi', options: ['Ape Tu Woi', 'Nak Ikot', 'Amba Remaja', 'Aku Bilangin Ke Polisi'] },
  { file: 'jomok14', answer: 'Mas Amba', options: ['Mas Amba', 'Duh Ketahuan', 'Awas Gw Lagi Sigma', 'Amba Remaja'] },
  { file: 'jomok15', answer: 'Kanaratzu Katsu', options: ['Kanaratzu Katsu', 'Mas Amba', 'Ambatron', 'Awas Gw Lagi Sigma'] },
  { file: 'jomok16', answer: 'Kontol Emosimu Kawan', options: ['Kontol Emosimu Kawan', 'Alamak', 'Banyak Omong Lu Suki', 'Sebaiknya Jangan Terlalu Gegabah'] },
  { file: 'jomok17', answer: 'Awas Gw Lagi Sigma', options: ['Awas Gw Lagi Sigma', 'Ngab Owi', 'Mas Amba', 'Ambatron'] },
  { file: 'jomok18', answer: 'Sebaiknya Jangan Terlalu Gegabah', options: ['Sebaiknya Jangan Terlalu Gegabah', 'Ape Tu Woi', 'Ngab Owi', 'Mas Amba'] },
  { file: 'jomok19', answer: 'Mas Amba', options: ['Mas Amba', 'Ape Tu Woi', 'Aku Bilangin Ke Polisi', 'Mas Rusdi'] },
  { file: 'jomok21', answer: 'Banyak Omong Lu Suki', options: ['Banyak Omong Lu Suki', 'Mas Rusdi', 'Ape Tu Woi', 'Duh Ketahuan'] },
  { file: 'jomok22', answer: 'Nak Ikot', options: ['Nak Ikot', 'Aku Bilangin Ke Polisi', 'Halah Nyocot', 'Amba Remaja'] },
  { file: 'jomok23', answer: 'Mas Amba', options: ['Mas Amba', 'Sebaiknya Jangan Terlalu Gegabah', 'Mas Rusdi', 'Ngab Owi'] },
  { file: 'jomok24', answer: 'Alamak', options: ['Alamak', 'Sebaiknya Jangan Terlalu Gegabah', 'Mas Rusdi', 'Kontol Emosimu Kawan'] },
  { file: 'jomok25', answer: 'Aku Bilangin Ke Polisi', options: ['Aku Bilangin Ke Polisi', 'Ngab Owi', 'Mas Rusdi', 'Nak Ikot'] },
  { file: 'jomok26', answer: 'Duh Ketahuan', options: ['Duh Ketahuan', 'Mas Amba', 'Kontol Emosimu Kawan', 'Ambatron'] },
  { file: 'jomok27', answer: 'Tak Bosan Bosan Aku Menunggumu', options: ['Tak Bosan Bosan Aku Menunggumu', 'Amba Remaja', 'Alamak', 'Duh Ketahuan'] },
  { file: 'jomok28', answer: 'Mas Fuad Sparta', options: ['Mas Fuad Sparta', 'Nak Ikot', 'Mas Rusdi', 'Mas Amba'] },
  { file: 'jomok29', answer: 'Halah Nyocot', options: ['Halah Nyocot', 'Mas Fuad Sparta', 'Mas Amba', 'Tak Bosan Bosan Aku Menunggumu'] },
  { file: 'jomok30', answer: 'Mas Rusdi', options: ['Mas Rusdi', 'Amba Remaja', 'Mas Amba', 'Duh Ketahuan'] },
  { file: 'jomok32', answer: 'Ngab Owi', options: ['Ngab Owi', 'Mas Amba', 'Awas Gw Lagi Sigma', 'Banyak Omong Lu Suki'] },
  { file: 'jomok33', answer: 'Amba Remaja', options: ['Amba Remaja', 'Nak Ikot', 'Banyak Omong Lu Suki', 'Duh Ketahuan'] },
  { file: 'jomok34', answer: 'Ambatron', options: ['Ambatron', 'Mas Amba', 'Tak Bosan Bosan Aku Menunggumu', 'Ngab Owi'] },
];

export const DEFAULT_QUESTIONS = RAW_QUESTION_BANK.map((item, idx) => ({
  id: idx + 1,
  blank_image_url: `/fragments-blank/${item.file}.webp`,
  fragment_url: `/fragments/frag_${item.file}.webp`,
  imageUrl: `/fragments-blank/${item.file}.webp`,
  fallback_image_url: `/fragments/frag_${item.file}.webp`,
  hasBlankAsset: true,
  correct_answer: item.answer,
  options: item.options,
  category: idx >= 20 ? 'jomok' : 'suki',
}));

export const DEFAULT_LEADERBOARD_TOURNAMENT = [
  { userId: 'u1', name: 'RakoSantuy', avatar: '😎', rating: 1850, battle_score: 8450, wins: 48, losses: 10, isPremium: true },
  { userId: 'u2', name: 'Luna', avatar: '🐱', rating: 1780, battle_score: 7870, wins: 42, losses: 12, isPremium: false },
  { userId: 'u3', name: 'KucingOren', avatar: '🦁', rating: 1650, battle_score: 6920, wins: 39, losses: 14, isPremium: false },
  { userId: 'u4', name: 'DikaGame', avatar: '🎮', rating: 1540, battle_score: 5850, wins: 35, losses: 15, isPremium: true },
  { userId: 'u5', name: 'Fahmi17', avatar: '🔥', rating: 1490, battle_score: 4760, wins: 31, losses: 18, isPremium: false },
  { userId: 'u6', name: 'BudiSigma', avatar: '🗿', rating: 1410, battle_score: 3920, wins: 28, losses: 19, isPremium: false },
  { userId: 'u7', name: 'RusdiLover', avatar: '💈', rating: 1380, battle_score: 3150, wins: 25, losses: 20, isPremium: false },
  { userId: 'u8', name: 'AmbaFan', avatar: '👑', rating: 1320, battle_score: 2840, wins: 22, losses: 21, isPremium: false },
  { userId: 'u9', name: 'FuadSparta', avatar: '⚔️', rating: 1250, battle_score: 2400, wins: 19, losses: 22, isPremium: false },
  { userId: 'u10', name: 'SigmaBoy', avatar: '🗿', rating: 1180, battle_score: 1950, wins: 15, losses: 23, isPremium: false },
];

export const DEFAULT_LEADERBOARD_GLOBAL = [
  { userId: 'u1', name: 'RakoSantuy', avatar: '😎', stage_score: 14200, score: 14200, stars: 30, stages_cleared: 10, isPremium: true },
  { userId: 'u2', name: 'Luna', avatar: '🐱', stage_score: 13450, score: 13450, stars: 29, stages_cleared: 10, isPremium: false },
  { userId: 'u3', name: 'KucingOren', avatar: '🦁', stage_score: 12100, score: 12100, stars: 27, stages_cleared: 9, isPremium: false },
  { userId: 'u4', name: 'DikaGame', avatar: '🎮', stage_score: 10850, score: 10850, stars: 25, stages_cleared: 9, isPremium: true },
  { userId: 'u5', name: 'Fahmi17', avatar: '🔥', stage_score: 9600, score: 9600, stars: 22, stages_cleared: 8, isPremium: false },
  { userId: 'u6', name: 'BudiSigma', avatar: '🗿', stage_score: 8400, score: 8400, stars: 19, stages_cleared: 7, isPremium: false },
  { userId: 'u7', name: 'RusdiLover', avatar: '💈', stage_score: 7250, score: 7250, stars: 16, stages_cleared: 6, isPremium: false },
  { userId: 'u8', name: 'AmbaFan', avatar: '👑', stage_score: 6100, score: 6100, stars: 14, stages_cleared: 5, isPremium: false },
  { userId: 'u9', name: 'FuadSparta', avatar: '⚔️', stage_score: 4950, score: 4950, stars: 11, stages_cleared: 4, isPremium: false },
  { userId: 'u10', name: 'SigmaBoy', avatar: '🗿', stage_score: 3800, score: 3800, stars: 8, stages_cleared: 3, isPremium: false },
];

export const DEFAULT_LEADERBOARD = DEFAULT_LEADERBOARD_TOURNAMENT;

export const DEFAULT_SHOP_ITEMS = [
  { id: 1, sku: 'lives_refill', title: 'Refill Nyawa', subtitle: '+5 nyawa langsung', price: 10000, category: 'lives', icon: '❤️' },
  { id: 2, sku: 'keys_pack_5', title: 'Tambah 5 Kunci', subtitle: '+5 kunci jawaban', price: 20000, category: 'keys', icon: '🔑' },
  { id: 3, sku: 'sticker_pack_exclusive', title: 'Paket Stiker Eksklusif', subtitle: 'Akses semua stiker premium', price: 29000, category: 'stickers', icon: '👑' },
  { id: 4, sku: 'no_ads', title: 'Hapus Iklan', subtitle: 'Bermain tanpa gangguan iklan', price: 15000, category: 'items', icon: '🚫' },
];

// Local state manager
const STORAGE_KEY = 'tesimok_v2_store';

export function getLocalStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.stageProgress?.stages) {
        parsed.stageProgress.stages = parsed.stageProgress.stages.map((s, idx) => ({
          ...s,
          is_boss: s.stage_id === 10 || s.id === 10,
          unlocked: idx === 0 || Boolean(parsed.stageProgress.stages[idx - 1]?.cleared),
        }));
      }
      return parsed;
    }
  } catch (e) {
    console.warn('[LocalStore] read error:', e);
  }

  // Initial fresh state: Stage 1 unlocked by default, Stages 2-10 locked
  const initial = {
    profile: { ...DEFAULT_PROFILE, stages_cleared: 0, total_stars: 0 },
    stageProgress: {
      totalStars: 0,
      stages: DEFAULT_STAGES.map((s) => ({
        stage_id: s.id,
        title: s.title,
        subtitle: s.subtitle,
        emoji: s.emoji,
        unlocked: s.id === 1,
        cleared: false,
        stars: 0,
        time_per_question: s.time_per_question,
        is_boss: s.id === 10,
      })),
    },
    ownedStickers: ['hai', 'lucu', 'terluka', 'sibuk', 'jempol'],
  };
  saveLocalStore(initial);
  return initial;
}

export function saveLocalStore(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('[LocalStore] save error:', e);
  }
}

export function updateLocalProfile(patch) {
  const store = getLocalStore();
  store.profile = { ...store.profile, ...patch };
  saveLocalStore(store);
  return store.profile;
}

export function recordLocalStageResult(stageId, score, stars) {
  const store = getLocalStore();
  const stages = store.stageProgress.stages;
  const current = stages.find((s) => s.stage_id === stageId);
  if (current) {
    current.stars = Math.max(current.stars || 0, stars);
    if (stars > 0) current.cleared = true;
  }
  // Unlock next stage
  const next = stages.find((s) => s.stage_id === stageId + 1);
  if (next && stars > 0) {
    next.unlocked = true;
  }

  // Recalculate total stars and cleared stages
  const totalStars = stages.reduce((acc, s) => acc + (s.stars || 0), 0);
  const stagesCleared = stages.filter((s) => s.cleared).length;
  store.stageProgress.totalStars = totalStars;

  // Add score & coins to profile
  const coinsEarned = stars * 50;
  store.profile.stage_score = (store.profile.stage_score || 0) + score;
  store.profile.total_score = (store.profile.stage_score || 0) + (store.profile.battle_score || 0);
  store.profile.total_stars = totalStars;
  store.profile.stages_cleared = stagesCleared;
  store.profile.coins = (store.profile.coins || 0) + coinsEarned;

  saveLocalStore(store);
  return {
    coins_earned: coinsEarned,
    totalStars,
    stagesCleared,
    profile: store.profile,
    stageProgress: store.stageProgress,
  };
}

export function recordLocalBattleResult({ myScore = 0, oppScore = 0, won = false, isDraw = false, ratingDelta = 0 }) {
  const store = getLocalStore();
  const currentRating = store.profile.rating || 1000;
  const newRating = Math.max(100, currentRating + ratingDelta);

  store.profile.rating = newRating;
  if (won) {
    store.profile.ranked_wins = (store.profile.ranked_wins || 0) + 1;
  } else if (isDraw) {
    store.profile.ranked_draws = (store.profile.ranked_draws || 0) + 1;
  } else {
    store.profile.ranked_losses = (store.profile.ranked_losses || 0) + 1;
  }

  const coinsEarned = won ? 50 : (isDraw ? 25 : 15);
  store.profile.battle_score = (store.profile.battle_score || 0) + myScore;
  store.profile.total_score = (store.profile.stage_score || 0) + (store.profile.battle_score || 0);
  store.profile.coins = (store.profile.coins || 0) + coinsEarned;

  saveLocalStore(store);
  return {
    newRating,
    ratingDelta,
    coinsEarned,
    profile: store.profile,
  };
}

