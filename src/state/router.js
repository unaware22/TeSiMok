/**
 * state/router.js
 * A tiny hash-based router with pushState-style navigation and a
 * screen registry. Keeps every screen lazy-loaded.
 */

import { getState } from './store.js';

const routes = new Map();
const moduleCache = new Map();

let currentCleanup = null;
let currentRoute = null;
let navigationToken = 0;
const history = [];

/**
 * Register a screen factory.
 * @param {string} name
 * @param {() => Promise<{ default: Function }|Function>} loader
 */
export function register(name, loader) {
  routes.set(name, loader);
}

/**
 * Navigate to a screen.
 * @param {string} name
 * @param {object} [params]
 * @param {{replace?: boolean, force?: boolean}} [opts]
 */
export async function navigate(name, params = {}, opts = {}) {
  // Authentication Guard: all routes except 'auth' require a logged-in user
  const state = getState();
  const isAuthenticated = Boolean(state.user && state.profile);

  if (!isAuthenticated && name !== 'auth') {
    name = 'auth';
    params = {};
    opts.replace = true;
  }

  if (!routes.has(name)) {
    console.error(`[router] Unknown route: ${name}`);
    return;
  }

  // If already on the exact same screen and params, ignore rapid re-click unless forced
  const isSameRoute = currentRoute
    && currentRoute.name === name
    && JSON.stringify(currentRoute.params) === JSON.stringify(params);
  if (isSameRoute && !opts.replace && !opts.force) {
    return;
  }

  // Monotonically increasing token to cancel older in-flight navigations
  const token = ++navigationToken;

  // Retrieve cached factory or dynamically load screen chunk
  let factory = moduleCache.get(name);
  if (!factory) {
    let module;
    try {
      module = await routes.get(name)();
    } catch (err) {
      if (token !== navigationToken) return;
      console.error(`[router] Failed to load screen "${name}":`, err);
      return;
    }

    // A newer navigation began while loading chunk — discard this one!
    if (token !== navigationToken) return;

    factory = typeof module === 'function' ? module : module?.default;
    if (typeof factory !== 'function') {
      console.error(`[router] Screen "${name}" did not export a function.`);
      return;
    }
    moduleCache.set(name, factory);
  }

  // Double check token after module retrieval
  if (token !== navigationToken) return;

  // Tear down the previous screen
  if (typeof currentCleanup === 'function') {
    try {
      currentCleanup();
    } catch (err) {
      console.error('[router] cleanup failed:', err);
    }
    currentCleanup = null;
  }

  if (!opts.replace && currentRoute) {
    history.push(currentRoute);
  }

  currentRoute = { name, params };

  // Keep the URL shareable / back-button friendly
  const hash = params && Object.keys(params).length
    ? `#/${name}?${new URLSearchParams(params).toString()}`
    : `#/${name}`;
  if (window.location.hash !== hash) {
    window.history.pushState(null, '', hash);
  }

  const result = factory(params);

  // A screen may return a cleanup function (used to stop timers/subscriptions)
  if (typeof result === 'function') {
    if (token === navigationToken) {
      currentCleanup = result;
    } else {
      try { result(); } catch {}
    }
  } else if (result && typeof result.then === 'function') {
    const resolved = await result;
    if (token === navigationToken && typeof resolved === 'function') {
      currentCleanup = resolved;
    } else if (token !== navigationToken && typeof resolved === 'function') {
      try { resolved(); } catch {}
    }
  }
}

/** Go back one screen. */
export function back(fallback = 'home') {
  const previous = history.pop();
  navigate(previous ? previous.name : fallback, previous?.params || {}, { replace: true });
}

export function current() {
  return currentRoute;
}

/** Parse `#/name?a=1` into a route descriptor. */
function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (!raw) return null;

  const [name, queryString] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(queryString || ''));
  return name ? { name, params } : null;
}

/** Start routing: handle the initial hash and browser back/forward. */
export function start(defaultRoute = 'home') {
  /**
   * Sync the rendered screen to whatever `location.hash` currently says.
   *
   * We cannot rely on `popstate` alone: it only fires for history traversal
   * (back/forward) and for our own pushState calls. A hash typed into the
   * address bar, or set directly by an `<a href="#/shop">`, changes the URL
   * without any popstate — and would leave the previous screen mounted.
   */
  const sync = () => {
    const parsed = parseHash();
    const next = parsed ? parsed.name : defaultRoute;
    const params = parsed ? parsed.params : {};

    // Already showing this exact screen (normal navigate() flow) → nothing to do.
    if (currentRoute && currentRoute.name === next && JSON.stringify(currentRoute.params) === JSON.stringify(params)) return;
    // Unknown route → fall back to the default rather than rendering nothing.
    if (!routes.has(next)) {
      navigate(defaultRoute, {}, { replace: true });
      return;
    }
    navigate(next, params, { replace: true });
  };

  window.addEventListener('popstate', sync);
  window.addEventListener('hashchange', sync);

  const initial = parseHash();
  navigate(initial && routes.has(initial.name) ? initial.name : defaultRoute, initial?.params || {}, {
    replace: true,
  });
}

/** Clear navigation history (used on sign-in / sign-out). */
export function resetHistory() {
  history.length = 0;
  currentRoute = null;
  if (typeof currentCleanup === 'function') {
    try {
      currentCleanup();
    } catch (err) {
      console.error('[router] cleanup failed:', err);
    }
    currentCleanup = null;
  }
}
