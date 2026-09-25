import { supabase } from './supabase.js';
import { purchaseSku } from './profile.js';
import { AD_CONFIG } from '../config/game.js';
import { DEFAULT_SHOP_ITEMS, getLocalStore } from './fallback-data.js';

// ============================================================
// Catalogue
// ============================================================

let shopCache = null;

export async function fetchShopItems() {
  if (shopCache && shopCache.length > 0) return shopCache;

  try {
    const { data, error } = await supabase
      .from('shop_items')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (!error && data && data.length > 0) {
      shopCache = data;
      return shopCache;
    }
  } catch (err) {
    console.warn('[shop] fetchShopItems failed, using fallback:', err.message);
  }

  shopCache = DEFAULT_SHOP_ITEMS;
  return shopCache;
}

export async function fetchStickerCatalogue() {
  try {
    const { data, error } = await supabase
      .from('stickers')
      .select('*')
      .order('sort_order');

    if (!error && data && data.length > 0) return data;
  } catch {}

  return [
    { id: 'hai', emoji: '👋', name: 'Hai Suki', price: 50 },
    { id: 'lucu', emoji: '😐', name: 'Dikira Lucu', price: 75 },
    { id: 'sigma', emoji: '😎', name: 'Sigma Asli', price: 100 },
    { id: 'mahkota', emoji: '👑', name: 'Raja Jomok', price: 200 },
  ];
}

export async function fetchOwnedStickers() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase
        .from('user_stickers')
        .select('sticker_id')
        .eq('user_id', user.id);

      if (!error && data) return data.map((r) => r.sticker_id);
    }
  } catch {}

  const store = getLocalStore();
  return store.ownedStickers || ['hai', 'lucu'];
}

export function clearShopCache() {
  shopCache = null;
}

// ============================================================
// Purchases
// ============================================================

/**
 * Buy a shop SKU.
 *
 * NOTE: `purchase_sku` runs as SECURITY DEFINER and marks the transaction
 * 'paid' immediately — suitable for demos and server-trusted flows.
 * For production, route this through a payment provider (Midtrans, Xendit,
 * Stripe) and only call the fulfilment RPC from the provider's webhook.
 */
export async function buy(sku) {
  const result = await purchaseSku(sku);
  clearShopCache();
  return result;
}

export function isSubscriptionSku(sku) {
  return typeof sku === 'string' && sku.startsWith('premium_');
}

// ============================================================
// Ads
// ============================================================

const AD_COUNTER_KEY = 'tesimok.adCounter';

/** True when this player should be shown advertising. */
export function shouldShowAds(profile) {
  return !profile?.is_premium_active;
}

/**
 * Count a completed play and report whether an interstitial is now due.
 * Premium players never trigger ads.
 */
export function registerPlayAndCheckInterstitial(profile) {
  if (!shouldShowAds(profile)) return false;

  let count = 0;
  try {
    count = Number(sessionStorage.getItem(AD_COUNTER_KEY) || '0') + 1;
    sessionStorage.setItem(AD_COUNTER_KEY, String(count));
  } catch {
    count = AD_CONFIG.interstitialEveryNPlays;
  }

  return count % AD_CONFIG.interstitialEveryNPlays === 0;
}

export function resetAdCounter() {
  try {
    sessionStorage.setItem(AD_COUNTER_KEY, '0');
  } catch {
    // ignore
  }
}

/**
 * Ad adapter.
 *
 * Replace the bodies below with your real network SDK, e.g.:
 *   - Web:      Google AdSense / AdMob via H5
 *   - Android:  AdMob rewarded video through a native bridge
 *   - Capacitor: @capacitor-community/admob
 *
 * The current implementation resolves after a short simulated delay so the
 * surrounding UX (loading state, reward flow) is fully wired and testable.
 */
export const ads = {
  isReady() {
    return true;
  },

  /** Full-screen interstitial. Resolves when it is dismissed. */
  async showInterstitial() {
    await delay(1200);
    return { shown: true, simulated: true };
  },

  /** Rewarded video. Resolves with { rewarded: boolean }. */
  async showRewarded() {
    await delay(1600);
    return { rewarded: true, simulated: true };
  },
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
