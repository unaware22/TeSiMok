/**
 * lib/theme.js
 * Theme manager for TeSiMok: switches between Antigravity Dark Mode and Modern Light Mode.
 * Persists user preference to localStorage.
 */
import { el } from './dom.js';

const THEME_STORAGE_KEY = 'tesimok_theme';
const listeners = new Set();

export function getTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return 'dark'; // Default to Antigravity Dark Mode
}

export function setTheme(theme) {
  const target = theme === 'light' ? 'light' : 'dark';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, target);
  } catch {}

  document.documentElement.setAttribute('data-theme', target);
  document.documentElement.style.colorScheme = target;

  for (const listener of listeners) {
    try {
      listener(target);
    } catch (e) {
      console.error('[theme] listener failed:', e);
    }
  }
  return target;
}

export function toggleTheme() {
  const current = getTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  return setTheme(next);
}

export function initTheme() {
  const current = getTheme();
  document.documentElement.setAttribute('data-theme', current);
  document.documentElement.style.colorScheme = current;
  return current;
}

export function subscribeTheme(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Reusable theme toggle button (shows ☀️ in dark mode, 🌙 in light mode).
 */
export function ThemeToggleBtn({ size = 'md' } = {}) {
  const currentTheme = getTheme();
  const isDark = currentTheme === 'dark';

  const btn = el('button', {
    class: 'icon-btn theme-toggle-btn',
    type: 'button',
    'aria-label': isDark ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap',
    title: isDark ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap',
    style: {
      fontSize: size === 'sm' ? '1rem' : '1.15rem',
      cursor: 'pointer',
      width: size === 'sm' ? '36px' : '42px',
      height: size === 'sm' ? '36px' : '42px',
      flex: `0 0 ${size === 'sm' ? '36px' : '42px'}`,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'transform 0.15s ease, background 0.15s ease, border-color 0.15s ease',
    },
    onClick: (e) => {
      e.stopPropagation();
      const newTheme = toggleTheme();
      btn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
      btn.setAttribute('aria-label', newTheme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap');
      btn.setAttribute('title', newTheme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap');
    },
  }, isDark ? '☀️' : '🌙');

  // Update button if theme changed from another trigger
  const unsubscribe = subscribeTheme((newTheme) => {
    btn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    btn.setAttribute('aria-label', newTheme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap');
    btn.setAttribute('title', newTheme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap');
  });

  return btn;
}
