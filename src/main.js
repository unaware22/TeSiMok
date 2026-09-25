/**
 * main.js — application entry point.
 * Boots Supabase auth, hydrates the store, registers routes, and starts routing.
 */
import './style.css';

import { onAuthStateChange, getSession } from './services/supabase.js';
import { loadProfile, startLifeTicker, stopLifeTicker, getState, clearSession } from './state/store.js';
import * as router from './state/router.js';
import { setSoundEnabled } from './lib/audio.js';
import { initTheme } from './lib/theme.js';

// ============================================================
// Route registry
// ============================================================

router.register('auth', () => import('./screens/auth.js').then((m) => m.AuthScreen));
router.register('home', () => import('./screens/home.js').then((m) => m.HomeScreen));
router.register('stages', () => import('./screens/stages.js').then((m) => m.StageSelectScreen));
router.register('game', () => import('./screens/game.js').then((m) => m.GameScreen));
router.register('battle', () => import('./screens/battle.js').then((m) => m.BattleScreen));
router.register('shop', () => import('./screens/shop.js').then((m) => m.ShopScreen));
router.register('subscription', () => import('./screens/subscription.js').then((m) => m.SubscriptionScreen));
router.register('daily', () => import('./screens/daily.js').then((m) => m.DailyRewardScreen));
router.register('leaderboard', () => import('./screens/leaderboard.js').then((m) => m.LeaderboardScreen));
router.register('profile', () => import('./screens/profile.js').then((m) => m.ProfileScreen));

// ============================================================
// Boot
// ============================================================

async function boot() {
  initTheme();
  showSplash();

  // 1. Check if we already have persistent auth restored from store
  const existingState = getState();
  const hasCachedSession = Boolean(existingState.user && existingState.profile);

  if (hasCachedSession) {
    setSoundEnabled(existingState.profile.sound_enabled !== false);
    startLifeTicker();
    // Start routing immediately into the current hash or home
    router.start('home');

    // Background verify and refresh profile
    loadProfile().catch((e) => console.warn('[boot] background loadProfile:', e));
  }

  // 2. React to auth state changes (sign-in, token refresh, OAuth callback, sign-out)
  onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
      stopLifeTicker();
      clearSession();
      router.resetHistory();
      router.navigate('auth', {}, { replace: true });
      return;
    }

    if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
      const profile = await loadProfile();
      if (profile) {
        setSoundEnabled(profile.sound_enabled !== false);
        startLifeTicker();
        if (window.location.hash.includes('/auth') || !window.location.hash) {
          router.navigate('home', {}, { replace: true });
        }
      }
    }
  });

  // 3. If no cached session was present, await Supabase getSession (handles Google OAuth redirect)
  if (!hasCachedSession) {
    let session = null;
    try {
      session = await Promise.race([
        getSession(),
        new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
    } catch (e) {
      console.warn('[boot] getSession timed out or failed:', e);
    }

    if (session?.user) {
      try {
        const profile = await loadProfile();
        if (profile) {
          setSoundEnabled(profile.sound_enabled !== false);
          startLifeTicker();
          router.start('home');
          return;
        }
      } catch (e) {
        console.warn('[boot] loadProfile error:', e);
      }
    }

    // No session available: route to auth
    clearSession();
    router.start('auth');
  }
}

function showSplash() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="splash">
      <img src="/brand/logo.png" alt="TeSiMok" style="width:105px;height:105px;object-fit:contain;margin-bottom:12px;filter:drop-shadow(0 8px 18px rgba(0,0,0,0.18));" />
      <div class="splash__logo">TeSiMok</div>
      <div class="spinner"></div>
      <p class="splash__msg">Menyiapkan permainan...</p>
    </div>`;
}

// ============================================================
// Global guards
// ============================================================

// Block context menu, copy, drag, and text selection globally
document.addEventListener('contextmenu', (e) => {
  if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
  }
});

document.addEventListener('copy', (e) => {
  if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
  }
});

document.addEventListener('dragstart', (e) => e.preventDefault());

document.addEventListener('selectstart', (e) => {
  if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
  }
});

// Block browser zoom shortcuts during gameplay
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '='].includes(e.key)) {
    if (document.querySelector('.game, .arena')) e.preventDefault();
  }
});

// Never leave a page-close during a battle without settling silently
window.addEventListener('beforeunload', () => {
  stopLifeTicker();
});

// Expose a tiny debug surface in development only
if (import.meta.env.DEV) {
  window.__TESIMOK__ = { getState, router };
}

boot().catch((err) => {
  console.error('[TeSiMok] Boot failed:', err);
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="splash">
      <div class="splash__logo">TeSiMok</div>
      <p class="splash__msg">Gagal memuat aplikasi.</p>
      <p class="splash__msg" style="opacity:0.6;font-size:12px">${err.message}</p>
    </div>`;
});
