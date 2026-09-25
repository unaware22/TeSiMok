/**
 * state/store.js
 * Minimal observable store — the app's single source of client state.
 */
import { fetchProfile, computeLifeState } from '../services/profile.js';
import { getSession } from '../services/supabase.js';

const listeners = new Set();

const AUTH_CACHE_KEY = 'tesimok_auth_session_v2';

function readCachedAuth() {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.user && parsed.profile) {
        return parsed;
      }
    }
  } catch {}
  return { user: null, profile: null };
}

function persistAuth(user, profile) {
  try {
    if (user && profile) {
      localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ user, profile }));
    }
  } catch {}
}

const cachedAuth = readCachedAuth();

const state = {
  user: cachedAuth.user,
  profile: cachedAuth.profile,
  lifeState: cachedAuth.profile ? computeLifeState(cachedAuth.profile) : { lives: 5, maxLives: 5, msToNext: 0, isFull: true, progress: 1 },
  stageProgress: { totalStars: 0, stages: [] },
  ownedStickers: [],
  dailyReward: { canClaim: false, streak: 0 },
  ready: Boolean(cachedAuth.user && cachedAuth.profile),
  loading: false,
};

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (err) {
      console.error('[store] listener failed:', err);
    }
  }
}

export function setState(patch) {
  Object.assign(state, patch);
  if (state.user && state.profile) {
    persistAuth(state.user, state.profile);
  }
  emit();
}

// ============================================================
// Profile lifecycle
// ============================================================

/** Load (or reload) the signed-in player's profile with resilient session retention. */
export async function loadProfile() {
  let session = null;
  try {
    session = await Promise.race([
      getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('session timeout')), 4000)),
    ]);
  } catch {}

  const currentUser = session?.user || state.user;
  if (!currentUser) {
    if (!state.user) {
      clearSession();
      return null;
    }
    return state.profile;
  }

  try {
    const profile = await fetchProfile(currentUser);
    if (profile) {
      setState({
        user: currentUser,
        profile,
        lifeState: computeLifeState(profile),
        ready: true,
      });
      persistAuth(currentUser, profile);
      return profile;
    }
  } catch (err) {
    console.warn('[store] loadProfile background fetch error:', err);
  }

  // If already in memory or cached, preserve it
  if (state.profile) {
    return state.profile;
  }

  return null;
}

/** Apply a locally-updated profile (after a purchase, claim, etc). */
export function applyProfile(profile) {
  setState({ profile, lifeState: computeLifeState(profile) });
  if (state.user && profile) {
    persistAuth(state.user, profile);
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(AUTH_CACHE_KEY);
  } catch {}
  setState({
    user: null,
    profile: null,
    stageProgress: { totalStars: 0, stages: [] },
    ownedStickers: [],
    ready: true,
  });
}

// ============================================================
// Life ticker
// ============================================================

let lifeTimer = null;

/**
 * Keep `lifeState` fresh so countdowns and heart icons stay accurate
 * without hammering the database. Re-syncs with the server every minute.
 */
export function startLifeTicker(onRecharge = null) {
  stopLifeTicker();

  let syncedAt = Date.now();

  lifeTimer = setInterval(() => {
    if (!state.profile) return;

    const previous = state.lifeState.lives;
    const next = computeLifeState(state.profile);

    if (next.lives !== previous) {
      setState({ lifeState: next });
      onRecharge?.(next.lives);
    } else {
      setState({ lifeState: next });
    }

    // Re-sync with the server once a minute so we don't drift
    if (Date.now() - syncedAt > 60000) {
      syncedAt = Date.now();
      loadProfile().catch(() => {});
    }
  }, 1000);
}

export function stopLifeTicker() {
  if (lifeTimer) {
    clearInterval(lifeTimer);
    lifeTimer = null;
  }
}

// ============================================================
// Derived helpers
// ============================================================

export function isPremium() {
  return Boolean(state.profile?.is_premium_active);
}

export function hasLives() {
  return (state.profile?.lives ?? 0) > 0;
}
