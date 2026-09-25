/**
 * components/shell.js
 * App chrome: persistent bottom navigation and top greeting bar.
 * - BottomNav: Home, Battle, Leaderboard, Profil.
 * - GreetingBar: displays the player's chosen avatar (emoji / photo), name, and ❤️ + 🔑 pills.
 */
import { el } from '../lib/dom.js';
import { MAX_LIVES } from '../config/game.js';
import * as router from '../state/router.js';
import { IconHome, IconBattle, IconTrophy, IconProfile, IconHeart, IconKey } from './icons.js';
import { ThemeToggleBtn } from '../lib/theme.js';

export const NAV_ITEMS = [
  { id: 'home', icon: (props) => IconHome(props), label: 'Home' },
  { id: 'battle', icon: (props) => IconBattle(props), label: 'Battle' },
  { id: 'leaderboard', icon: (props) => IconTrophy(props), label: 'Leaderboard' },
  { id: 'profile', icon: (props) => IconProfile(props), label: 'Profil' },
];

/**
 * Persistent bottom navigation.
 * @param {string} activeId
 * @param {(id:string)=>void} onNavigate
 */
export function BottomNav(activeId, onNavigate) {
  return el('nav', { class: 'bottom-nav' },
    el('div', { class: 'bottom-nav__inner' },
      ...NAV_ITEMS.map((item) => {
        const isActive = item.id === activeId;
        const iconNode = typeof item.icon === 'function' ? item.icon({ active: isActive }) : item.icon;
        return el('button', {
          class: `nav-item${isActive ? ' nav-item--active' : ''}`,
          type: 'button',
          onClick: () => (onNavigate ? onNavigate(item.id) : router.navigate(item.id)),
          'aria-current': isActive ? 'page' : null,
        },
          el('span', { class: 'nav-item__icon', style: { display: 'flex', alignItems: 'center', justifyContent: 'center' } }, iconNode),
          el('span', {}, item.label),
        );
      }),
    ),
  );
}

/**
 * Greeting header with avatar, name, and resource pills.
 * Dynamically displays the avatar chosen during registration (emoji or photo).
 */
export function GreetingBar({ profile, greeting = 'Halo,', onResourceClick, right = null }) {
  const lives = profile?.lives ?? MAX_LIVES;
  const keys = profile?.answer_keys ?? 2;
  const avatarEmoji = profile?.avatar_emoji || '😎';
  const avatarUrl = profile?.avatar_url;

  return el('header', { class: 'greet' },
    el('div', {
      class: 'row',
      style: { gap: '10px', minWidth: 0, alignItems: 'center', cursor: 'pointer' },
      onClick: () => router.navigate('profile'),
      title: 'Buka profil',
    },
      avatarUrl
        ? el('img', {
            src: avatarUrl,
            alt: 'Avatar',
            style: {
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: '2px solid var(--line-mid)',
              boxShadow: 'var(--shadow-sm)',
              background: 'var(--surface-solid)',
            },
          })
        : el('div', {
            style: {
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'var(--surface-card)',
              border: '2px solid var(--line-mid)',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.6rem',
              flex: '0 0 44px',
              userSelect: 'none',
            },
          }, avatarEmoji),

      el('div', { class: 'greet__text' },
        el('div', { class: 'greet__hi' }, greeting),
        el('div', { class: 'greet__name' }, profile?.display_name || 'Player123'),
      ),
    ),

    right || el('div', { class: 'row', style: { gap: '6px', alignItems: 'center' } },
      el('button', {
        class: 'res-pill res-pill--lives res-pill--action',
        type: 'button',
        title: 'Lihat status nyawa',
        onClick: () => (onResourceClick ? onResourceClick('lives') : router.navigate('shop', { tab: 'lives' })),
      },
        el('span', { class: 'res-pill__icon', style: { display: 'inline-flex', alignItems: 'center' } }, IconHeart({ size: 15 })),
        el('span', {}, `${lives}`),
      ),
      el('button', {
        class: 'res-pill res-pill--keys res-pill--action',
        type: 'button',
        title: 'Lihat kunci jawaban',
        onClick: () => (onResourceClick ? onResourceClick('keys') : router.navigate('shop', { tab: 'toko' })),
      },
        el('span', { class: 'res-pill__icon', style: { display: 'inline-flex', alignItems: 'center' } }, IconKey({ size: 15 })),
        el('span', {}, `${keys}`),
      ),
      ThemeToggleBtn({ size: 'sm' }),
    ),
  );
}

/**
 * Top bar for sub-screens: back button + title + optional action.
 * Strictly centered and symmetrical across all pages.
 */
export function TopBar({ title = '', subtitle = null, onBack = null, right = null, showTheme = true }) {
  return el('header', { class: 'topbar' },
    el('div', { class: 'topbar__left' },
      onBack
        ? el('button', {
            class: 'icon-btn',
            type: 'button',
            'aria-label': 'Kembali',
            onClick: onBack,
          }, '←')
        : el('span', { style: { width: '42px', display: 'inline-block' } }),
    ),

    el('div', { class: 'topbar__center' },
      el('div', { class: 'topbar__title' }, title),
      subtitle ? el('div', { class: 'topbar__sub' }, subtitle) : null,
    ),

    el('div', { class: 'topbar__right' },
      right || (showTheme ? ThemeToggleBtn({ size: 'md' }) : el('span', { style: { width: '42px', display: 'inline-block' } })),
    ),
  );
}

/**
 * Quick resource banner showing lives & keys.
 */
export function ResourceStrip({ profile, onLives, onKeys }) {
  const lives = profile?.lives ?? MAX_LIVES;
  const keys = profile?.answer_keys ?? 2;

  return el('div', { class: 'res-strip' },
    el('button', {
      class: 'res-strip__item',
      type: 'button',
      onClick: onLives,
    },
      el('span', { class: 'res-strip__icon', style: { display: 'inline-flex', alignItems: 'center' } }, IconHeart({ size: 15 })),
      el('span', { class: 'res-strip__val' }, `${lives}/${MAX_LIVES}`),
      el('span', { class: 'res-strip__label' }, 'Nyawa'),
    ),
    el('div', { class: 'res-strip__div' }),
    el('button', {
      class: 'res-strip__item',
      type: 'button',
      onClick: onKeys,
    },
      el('span', { class: 'res-strip__icon', style: { display: 'inline-flex', alignItems: 'center' } }, IconKey({ size: 15 })),
      el('span', { class: 'res-strip__val' }, `${keys}`),
      el('span', { class: 'res-strip__label' }, 'Kunci'),
    ),
  );
}
