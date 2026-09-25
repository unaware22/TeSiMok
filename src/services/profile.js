import { supabase, rpc } from './supabase.js';
import { LIFE_REGEN_MS, MAX_LIVES } from '../config/game.js';
import { getLocalStore, updateLocalProfile } from './fallback-data.js';

// ============================================================
// Reads
// ============================================================

/**
 * Fetch the current player's profile.
 * Runs lazy life/key regeneration server-side via the get_profile() RPC,
 * or falls back to local storage seamlessly.
 */
export async function fetchProfile(passedUser = null) {
  try {
    const data = await rpc('get_profile');
    if (data) return normalizeProfile(data);
  } catch (err) {
    // Try reading profile row directly if RPC is not present
    try {
      const user = passedUser || (await supabase.auth.getUser().catch(() => ({})))?.data?.user;
      if (user) {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (!error && data) return normalizeProfile(data);
      }
    } catch {}
  }

  // Fallback only if there is an authenticated user session
  try {
    const user = passedUser || (await supabase.auth.getUser().catch(() => ({})))?.data?.user;
    if (user) {
      const store = getLocalStore();
      return normalizeProfile({
        ...store.profile,
        id: user.id,
        email: user.email,
        display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Pemain',
        avatar_emoji: user.user_metadata?.avatar_emoji || '😎',
      });
    }
  } catch {}

  return null;
}

/** Public profile for any user (leaderboard / battle opponent). */
export async function fetchPublicProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_emoji, rating, ranked_wins, ranked_losses, total_stars, is_premium')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) return data;
  } catch {}

  const store = getLocalStore();
  return store.profile;
}

/** Batch fetch profiles keyed by id (used by leaderboards & battles). */
export async function fetchProfilesMap(userIds = []) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return {};

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_emoji, rating, is_premium')
      .in('id', unique);

    if (!error && data) {
      return Object.fromEntries(data.map((p) => [p.id, p]));
    }
  } catch {}

  return {};
}

// ============================================================
// Life regeneration (client-side mirror of the server logic)
// ============================================================

/**
 * Compute the live life state without hitting the server.
 * The server remains authoritative — this only drives the UI countdown.
 */
export function computeLifeState(profile) {
  if (!profile) {
    return { lives: MAX_LIVES, maxLives: MAX_LIVES, msToNext: 0, isFull: true, progress: 1 };
  }

  const maxLives = profile.max_lives || MAX_LIVES;
  let lives = profile.lives ?? maxLives;
  let msToNext = 0;

  if (lives >= maxLives) {
    return { lives: maxLives, maxLives, msToNext: 0, isFull: true, progress: 1 };
  }

  const elapsed = Date.now() - new Date(profile.life_regen_at).getTime();
  const remainder = elapsed % LIFE_REGEN_MS;
  msToNext = LIFE_REGEN_MS - remainder;

  // Optimistically tick lives forward so the UI matches the server's lazy refill
  const gained = Math.floor(elapsed / LIFE_REGEN_MS);
  lives = Math.min(maxLives, lives + Math.max(0, gained));

  return {
    lives,
    maxLives,
    msToNext: lives >= maxLives ? 0 : msToNext,
    isFull: lives >= maxLives,
    progress: lives / maxLives,
  };
}

// ============================================================
// Mutations
// ============================================================

/** Spend one life before starting a stage run. Server-authoritative with local fallback. */
export async function spendLife() {
  try {
    const data = await rpc('spend_life', { p_user: (await currentUserId()) });
    if (data) return normalizeProfile(data);
  } catch (err) {
    console.warn('[profile] spend_life RPC failed, falling back to local:', err.message);
  }

  const store = getLocalStore();
  const currentLives = store.profile.lives ?? MAX_LIVES;
  const newLives = Math.max(0, currentLives - 1);
  const updated = updateLocalProfile({
    lives: newLives,
    life_regen_at: newLives < MAX_LIVES ? new Date().toISOString() : store.profile.life_regen_at,
  });
  return normalizeProfile(updated);
}

/** Refill lives to max via the server or local. */
export async function refillLivesServer() {
  try {
    const data = await rpc('refill_lives', { p_user: await currentUserId() });
    if (data) return normalizeProfile(data);
  } catch (err) {
    console.warn('[profile] refill_lives RPC failed, falling back to local:', err.message);
  }

  const updated = updateLocalProfile({ lives: MAX_LIVES });
  return normalizeProfile(updated);
}

export async function claimDailyReward() {
  try {
    const data = await rpc('claim_daily_reward');
    if (data) return data;
  } catch (err) {
    console.warn('[profile] claim_daily_reward RPC failed, falling back to local:', err.message);
  }

  const store = getLocalStore();
  const today = new Date().toISOString().slice(0, 10);
  const streak = ((store.profile.daily_streak || 0) % 5) + 1;

  const updated = updateLocalProfile({
    daily_streak: streak,
    last_daily_claim: today,
    lives: Math.min(MAX_LIVES, (store.profile.lives ?? MAX_LIVES) + 1),
    answer_keys: (store.profile.answer_keys || 0) + 1,
    coins: (store.profile.coins || 0) + 100,
  });

  return {
    success: true,
    streak,
    reward: { lives: 1, keys: 1, coins: 100 },
    profile: normalizeProfile(updated),
  };
}

export async function purchaseSku(sku) {
  try {
    const data = await rpc('purchase_sku', { p_sku: sku });
    if (data) return data;
  } catch (err) {
    console.warn('[profile] purchase_sku RPC failed, applying locally:', err.message);
  }

  const store = getLocalStore();
  const patch = {};

  if (sku === 'lives_refill') {
    patch.lives = MAX_LIVES;
  } else if (sku === 'keys_pack_5') {
    patch.answer_keys = (store.profile.answer_keys || 0) + 5;
  } else if (sku === 'sticker_pack_exclusive') {
    store.ownedStickers = ['hai', 'lucu', 'terluka', 'sibuk', 'jempol', 'api', 'sigma', 'nangis', 'polisi', 'mahkota'];
  } else if (sku === 'premium_monthly') {
    patch.is_premium = true;
    patch.is_premium_active = true;
    patch.premium_tier = 'monthly';
    patch.premium_until = new Date(Date.now() + 30 * 86400000).toISOString();
  } else if (sku === 'premium_yearly') {
    patch.is_premium = true;
    patch.is_premium_active = true;
    patch.premium_tier = 'yearly';
    patch.premium_until = new Date(Date.now() + 365 * 86400000).toISOString();
  } else if (sku === 'no_ads') {
    patch.is_premium = true;
    patch.is_premium_active = true;
  }

  const updated = updateLocalProfile(patch);
  return { success: true, sku, profile: normalizeProfile(updated) };
}

/** Update mutable profile fields (name, avatar, preferences). */
export async function updateProfile(patch) {
  try {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select()
      .single();

    if (!error && data) return normalizeProfile(data);
  } catch {}

  const updated = updateLocalProfile(patch);
  return normalizeProfile(updated);
}

/**
 * Buy a sticker using coins.
 */
export async function buySticker(stickerId) {
  try {
    await rpc('purchase_sticker', { p_sticker_id: stickerId });
  } catch {}
  return fetchProfile();
}

export async function fetchOwnedStickerIds() {
  try {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('user_stickers')
      .select('sticker_id')
      .eq('user_id', userId);

    if (!error && data) return data.map((r) => r.sticker_id);
  } catch {}

  const store = getLocalStore();
  return store.ownedStickers || [];
}

// ============================================================
// Helpers
// ============================================================

export async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Kamu harus masuk terlebih dahulu.');
  return user.id;
}

function normalizeProfile(row) {
  if (!row) return null;

  const isPremiumActive =
    Boolean(row.is_premium) &&
    (!row.premium_until || new Date(row.premium_until) > new Date());

  return {
    ...row,
    max_lives: row.max_lives || MAX_LIVES,
    is_premium_active: isPremiumActive,
  };
}
