/**
 * services/stages.js
 * Single-player stage mode: the stage map, question runs, and results.
 */
import { supabase, rpc } from './supabase.js';
import { QUESTIONS_PER_STAGE, BASE_POINTS, STREAK_BONUS, MAX_STREAK_BONUS, SPEED_BONUS_MAX } from '../config/game.js';
import {
  DEFAULT_STAGES,
  DEFAULT_QUESTIONS,
  getLocalStore,
  recordLocalStageResult,
} from './fallback-data.js';

const STAGE_CACHE_KEY = 'tesimok.stages.v2';

let stageCache = null;

let questionsCache = null;

// ============================================================
// Stage catalogue
// ============================================================

/** Static stage definitions (cached in memory + localStorage). */
export async function fetchStages() {
  if (stageCache && stageCache.length > 0) return stageCache;

  try {
    const cached = sessionStorage.getItem(STAGE_CACHE_KEY);
    if (cached) {
      stageCache = JSON.parse(cached);
      return stageCache;
    }
  } catch {}

  // Instant fallback to DEFAULT_STAGES so the game never hangs waiting for network
  stageCache = DEFAULT_STAGES;

  // Background fetch to update cache without blocking user
  supabase.from('stages').select('*').order('id')
    .then(({ data, error }) => {
      if (!error && data && data.length > 0) {
        stageCache = data;
        try { sessionStorage.setItem(STAGE_CACHE_KEY, JSON.stringify(stageCache)); } catch {}
      }
    })
    .catch(() => {});

  return stageCache;
}

/** Stage definitions merged with the player's progress and unlock state. */
export async function fetchStageProgress() {
  try {
    const data = await Promise.race([
      rpc('get_stage_progress'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('progress timeout')), 1000)),
    ]);
    if (data && data.stages && data.stages.length > 0) {
      return {
        totalStars: data?.total_stars ?? 0,
        stages: data.stages.map((s) => ({
          ...s,
          is_boss: s.stage_id === 10 || s.id === 10,
        })),
      };
    }
  } catch (err) {
    // fallback to local store
  }

  const local = getLocalStore();
  return local.stageProgress;
}

export function clearStageCache() {
  stageCache = null;
  questionsCache = null;
  try {
    sessionStorage.removeItem(STAGE_CACHE_KEY);
  } catch {
    // ignore
  }
}

/** Fetch a stage definition by id. */
export async function fetchStage(stageId) {
  const stages = await fetchStages();
  return stages.find((s) => s.id === Number(stageId)) || stages[0] || null;
}

// ============================================================
// Question selection
// ============================================================

/**
 * Pick the questions for a stage run. Instant return from local pool/cache.
 */
export async function pickStageQuestions(stage) {
  const count = stage?.question_count || QUESTIONS_PER_STAGE;
  const stageId = Number(stage?.id) || 1;

  if (!questionsCache || questionsCache.length === 0) {
    questionsCache = DEFAULT_QUESTIONS.map((q) => normaliseQuestion(q, DEFAULT_QUESTIONS));

    // Background fetch from supabase if online
    supabase
      .from('questions')
      .select('id, fragment_url, correct_answer, options, category')
      .order('id')
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          questionsCache = data.map((q) => {
            let blankUrl = null;
            if (q.fragment_url) {
              const m = q.fragment_url.match(/frag_([^/]+)\.webp$/i);
              if (m) blankUrl = `/fragments-blank/${m[1]}.webp`;
            }
            return normaliseQuestion({
              ...q,
              blank_image_url: blankUrl || q.fragment_url,
            }, data);
          });
        }
      })
      .catch(() => {});
  }

  return sampleQuestions(questionsCache, stage, count, stageId);
}

/**
 * Format string teks opsi ke Title Case bersih tanpa emoji.
 * e.g., "APE TU WOI" -> "Ape Tu Woi", "Aku Bilangin ke Polisi😡" -> "Aku Bilangin Ke Polisi"
 */
export function formatOptionText(text) {
  if (!text || typeof text !== 'string') return '';
  const clean = text
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, '')
    .trim();
  if (!clean) return text.trim();

  return clean
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const MEME_DISTRACTORS = [
  'Bersiaplah',
  'Sedang Sibuk',
  'Dikira Lucu',
  'Tertawa Tapi Terluka',
  'Rusdi',
  'Gw Lagi Yang Kena',
  'Ada Ada Saja',
  'Yang Nanya Siapa',
  'Ape Tu Woi',
  'Mas Amba',
  'Mas Rusdi',
  'Mas Fuad Sparta',
  'Ambatron',
  'Amba Remaja',
  'Ngab Owi',
  'Banyak Omong Lu Suki',
  'Alamak',
  'Nak Ikot',
  'Duh Ketahuan',
  'Tak Bosan Bosan Aku Menunggumu',
  'Halah Nyocot',
  'Sebaiknya Jangan Terlalu Gegabah',
  'Kontol Emosimu Kawan',
  'Kanaratzu Katsu',
  'Awas Gw Lagi Sigma',
  'Aku Bilangin Ke Polisi',
  'Berotak Kontol',
  'Langsung Sigma Gw Bjiir',
  'Gk',
  'Aku Nak',
];

/**
 * Bentuk seragam untuk satu soal:
 * - Menjamin 4 pilihan unik (tidak ada duplikat teks).
 * - Semua pilihan dan kunci jawaban memiliki format kapitalisasi konsisten (Title Case).
 * - Kunci jawaban diacak posisinya sehingga tidak selalu di posisi tertentu.
 */
export function normaliseQuestion(q, distractorPool = []) {
  let img = q.blank_image_url || q.fragment_url;
  // If blank_image_url is not set, map from fragment
  if (!q.blank_image_url && q.fragment_url) {
    const m = q.fragment_url.match(/frag_([^/]+)\.webp$/i);
    if (m) img = `/fragments-blank/${m[1]}.webp`;
  }

  const cleanAns = formatOptionText(q.correct_answer || '');

  // Kumpulkan opsi dengan normalisasi case dan deduplikasi ketat
  const rawOpts = Array.isArray(q.options) ? q.options : [];
  const uniqueMap = new Map(); // lowercase key -> formatted string

  if (cleanAns) {
    uniqueMap.set(cleanAns.toLowerCase(), cleanAns);
  }

  for (const opt of rawOpts) {
    const formatted = formatOptionText(opt);
    if (!formatted) continue;
    const key = formatted.toLowerCase();
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, formatted);
    }
  }

  // Jika opsi kurang dari 4, ambil pengecoh dari soal-soal lain
  if (uniqueMap.size < 4 && Array.isArray(distractorPool) && distractorPool.length > 0) {
    for (const other of distractorPool) {
      if (uniqueMap.size >= 4) break;
      const otherAns = formatOptionText(other.correct_answer || other.answer || '');
      if (otherAns && !uniqueMap.has(otherAns.toLowerCase())) {
        uniqueMap.set(otherAns.toLowerCase(), otherAns);
      }
    }
  }

  // Jika masih kurang dari 4, lengkapi dari daftar distractor cadangan
  if (uniqueMap.size < 4) {
    for (const backup of MEME_DISTRACTORS) {
      if (uniqueMap.size >= 4) break;
      const formatted = formatOptionText(backup);
      if (!uniqueMap.has(formatted.toLowerCase())) {
        uniqueMap.set(formatted.toLowerCase(), formatted);
      }
    }
  }

  // Acak 4 pilihan unik
  const allUnique = Array.from(uniqueMap.values());
  const options = shuffle(allUnique.slice(0, 4));

  return {
    ...q,
    correct_answer: cleanAns,
    options,
    imageUrl: img || q.fragment_url,
    fallback_image_url: q.fragment_url,
    hasBlankAsset: true,
  };
}

/**
 * Weighted sampling across the difficulty curve.
 *
 * Every question gets a difficulty score derived from how often its answer
 * shows up as a distractor for other questions — a cheap, stable proxy for
 * "how easily is this sticker confused with another".
 */
function sampleQuestions(pool, stage, count, stageId = 1) {
  if (pool.length === 0) return [];

  // Tally how often each answer appears as an option elsewhere
  const confusion = new Map();
  for (const q of pool) {
    for (const option of q.options || []) {
      if (option === q.correct_answer) continue;
      confusion.set(option, (confusion.get(option) || 0) + 1);
    }
  }

  // Score 0..1 where 1 is the hardest (most confusable)
  const maxConfusion = Math.max(1, ...confusion.values());

  const scored = pool.map((q) => ({
    ...q,
    _difficulty: (confusion.get(q.correct_answer) || 0) / maxConfusion,
  }));

  // Stage 1..10 maps to a difficulty band, widening as the player progresses
  const progress = Math.min(1, Math.max(0, (stageId - 1) / (STAGE_RAMP - 1)));
  const minBand = progress < 0.5 ? 0 : progress * 0.45;
  const maxBand = 0.35 + progress * 0.65;

  // Category priority: honour the stage filter first, then broaden
  const filter = Array.isArray(stage?.category_filter) ? stage.category_filter : null;

  let candidates = scored.filter(
    (q) => q._difficulty >= minBand && q._difficulty <= maxBand,
  );

  if (filter && filter.length > 0) {
    const inCategory = candidates.filter((q) => filter.includes(q.category));
    if (inCategory.length >= count) candidates = inCategory;
  }

  // Widen progressively if the band is too narrow to fill the stage
  if (candidates.length < count) {
    candidates = scored
      .filter((q) => q._difficulty <= maxBand)
      .sort((a, b) => Math.abs(a._difficulty - progress) - Math.abs(b._difficulty - progress));
  }
  if (candidates.length < count) candidates = scored;

  return shuffle(dedupe(candidates)).slice(0, Math.min(count, candidates.length));
}

/** Number of stages over which the difficulty curve is spread. */
const STAGE_RAMP = 10;

function dedupe(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// Stage runs (server-tracked attempts)
// ============================================================

export async function createRun(stageId) {
  const userId = await currentUserId();

  const { data, error } = await supabase
    .from('stage_runs')
    .insert({
      user_id: userId,
      stage_id: stageId,
      question_ids: [],
      status: 'active',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateRun(runId, patch) {
  const { error } = await supabase.from('stage_runs').update(patch).eq('id', runId);
  if (error) throw new Error(error.message);
}

export async function abandonRun(runId) {
  await supabase.from('stage_runs').update({ status: 'abandoned' }).eq('id', runId);
}

/** Persist the result and get back the awarded stars/coins. */
export async function recordStageResult(arg1, arg2, arg3, arg4, arg5) {
  let stageId, score, stars, correct, total, maxStreak;
  if (arg1 && typeof arg1 === 'object') {
    stageId = arg1.stageId;
    score = arg1.score || 0;
    correct = arg1.correct || 0;
    total = arg1.total || 0;
    maxStreak = arg1.maxStreak || 0;
    stars = arg1.stars;
  } else {
    stageId = arg1;
    score = arg2 || 0;
    stars = arg3;
    correct = arg4;
    total = arg5;
  }

  const stageTotal = total || 10;
  const stageCorrect = correct ?? (typeof stars === 'number' ? Math.round((stars / 3) * stageTotal) : 0);
  const calculatedAccuracy = stageTotal > 0 ? (stageCorrect / stageTotal) * 100 : 0;
  const finalStars = typeof stars === 'number'
    ? stars
    : (calculatedAccuracy >= 100 ? 3 : (calculatedAccuracy >= 80 ? 2 : (calculatedAccuracy >= 60 ? 1 : 0)));

  // Always record locally to guarantee instant persistence & reactivity
  const localRes = recordLocalStageResult(stageId, score, finalStars);

  try {
    const res = await rpc('record_stage_result', {
      p_stage_id: stageId,
      p_score: score,
      p_correct: stageCorrect,
      p_total: stageTotal,
      p_max_streak: maxStreak || 0,
    });
    if (res) return { ...localRes, ...res };
  } catch (err) {
    console.warn('[stages] record_stage_result RPC failed, relying on local:', err.message);
  }

  return localRes;
}

// ============================================================
// Answer attempts (untuk statistik soal tersulit)
// ============================================================

/**
 * Catat satu jawaban pemain. Best-effort: kegagalan tidak boleh mengganggu
 * jalannya permainan, jadi error hanya di-log.
 *
 * @param {string} questionId
 * @param {boolean} isCorrect
 * @param {'stage'|'battle'} mode
 */
export async function recordAttempt(questionId, isCorrect, mode = 'stage') {
  try {
    const userId = await currentUserId();
    await supabase.from('question_attempts').insert({
      user_id: userId,
      question_id: questionId,
      is_correct: isCorrect,
      mode,
    });
  } catch (err) {
    console.warn('[stages] Could not record attempt:', err.message);
  }
}

/**
 * Verifikasi jawaban di server.
 *
 * Klien sudah tahu `correct_answer` untuk soal yang sedang dimainkan (dipakai
 * untuk highlight opsi), tapi server tetap dipanggil supaya:
 *  - pemain tidak bisa menebak lewat manipulasi state klien,
 *  - normalisasi (case/emoji/spasi) konsisten di satu tempat.
 *
 * Kalau RPC belum ter-deploy, kita jatuh ke perbandingan lokal supaya game
 * tidak mati total.
 */
export async function verifyGuess(questionId, answer, localCorrect) {
  try {
    const res = await rpc('check_guess_answer', {
      p_question_id: questionId,
      p_answer: answer,
    });
    if (res && typeof res.is_correct === 'boolean') return res.is_correct;
  } catch (err) {
    console.warn('[stages] check_guess_answer unavailable, using local check:', err.message);
  }
  return answer === localCorrect;
}

// ============================================================
// Scoring (client preview — the UI shows this, the DB stores the truth)
// ============================================================

export function scoreAnswer({ isCorrect, streak, secondsLeft, timeLimit }) {
  if (!isCorrect) return 0;

  const streakBonus = Math.min(STREAK_BONUS * Math.max(0, streak - 1), MAX_STREAK_BONUS);
  const speedBonus = Math.round(SPEED_BONUS_MAX * Math.max(0, secondsLeft / Math.max(1, timeLimit)));

  return BASE_POINTS + streakBonus + speedBonus;
}

export function computeStarRating(arg1, arg2) {
  let accuracy = 0;
  let stage = null;

  if (typeof arg1 === 'number') {
    accuracy = arg1;
    stage = arg2;
  } else if (arg1 && typeof arg1 === 'object') {
    stage = arg1.stage;
    if (typeof arg1.accuracy === 'number') {
      accuracy = arg1.accuracy;
    } else {
      const correct = arg1.correct || 0;
      const total = arg1.total || 0;
      accuracy = total > 0 ? (correct / total) * 100 : 0;
    }
  }

  const t1 = stage?.star1_percent ?? stage?.pass_percent ?? 60;
  const t2 = stage?.star2_percent ?? 80;
  const t3 = stage?.star3_percent ?? 100;

  let stars = 0;
  if (accuracy >= t3) stars = 3;
  else if (accuracy >= t2) stars = 2;
  else if (accuracy >= t1) stars = 1;

  return stars;
}

// ============================================================
// Helpers
// ============================================================

async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Kamu harus masuk terlebih dahulu.');
  return user.id;
}
