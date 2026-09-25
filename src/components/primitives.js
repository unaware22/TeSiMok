/**
 * components/primitives.js
 * Reusable UI atoms shared by every screen.
 */
import { el } from '../lib/dom.js';
import { formatNumber } from '../lib/format.js';

// ============================================================
// Buttons
// ============================================================

/**
 * @param {object} opts
 * @param {string} opts.label
 * @param {'primary'|'gold'|'coral'|'mint'|'ghost'|'soft'|'outline-gold'} [opts.variant]
 * @param {'sm'|'md'|'lg'} [opts.size]
 * @param {boolean} [opts.block]
 * @param {boolean} [opts.disabled]
 * @param {Function} [opts.onClick]
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  block = false,
  disabled = false,
  loading = false,
  icon = null,
  onClick,
  ...rest
} = {}) {
  const classes = ['btn', `btn--${variant}`];
  if (size !== 'md') classes.push(`btn--${size}`);
  if (block) classes.push('btn--block');

  const content = [];
  if (loading) {
    content.push(el('span', { class: 'spinner spinner--sm' }));
  } else if (icon) {
    content.push(el('span', { 'aria-hidden': 'true' }, icon));
  }
  content.push(el('span', {}, label));

  return el('button', {
    class: classes,
    disabled: disabled || loading,
    type: 'button',
    onClick,
    ...rest,
  }, ...content);
}

/** Square icon-only button (back arrows, etc). */
export function IconButton({ icon, label, onClick, plain = false, ...rest }) {
  return el('button', {
    class: `icon-btn${plain ? ' icon-btn--plain' : ''}`,
    type: 'button',
    'aria-label': label,
    title: label,
    onClick,
    ...rest,
  }, icon);
}

// ============================================================
// Resource pills
// ============================================================

/** ❤️ lives / 🔑 keys / 🪙 coins indicator. */
export function ResourcePill({ kind, value, max, onClick, showPlus = false }) {
  const icons = { lives: '❤️', keys: '🔑', coins: '🪙' };
  const classes = ['res-pill', `res-pill--${kind}`];
  if (onClick) classes.push('res-pill--action');

  const label = max !== undefined ? `${value}/${max}` : formatNumber(value);

  return el(kind === 'lives' || kind === 'keys' || kind === 'coins' ? 'button' : 'span', {
    class: classes,
    type: onClick ? 'button' : undefined,
    onClick,
  },
    el('span', { class: 'res-pill__icon' }, icons[kind] || '•'),
    el('span', {}, label),
    showPlus ? el('span', { class: 'res-pill__plus' }, '+') : null,
  );
}

/** Row of heart icons reflecting current lives. */
export function LivesRow({ lives, maxLives = 5, size = 'md' }) {
  const hearts = [];
  for (let i = 0; i < maxLives; i++) {
    const on = i < lives;
    hearts.push(el('span', {
      class: `heart${on ? '' : ' heart--off'}${size === 'lg' ? ' heart--lg' : ''}`,
    }, on ? '❤️' : '🖤'));
  }
  return el('div', { class: 'lives-row' }, ...hearts);
}

// ============================================================
// Progress
// ============================================================

export function Progress({ value = 0, max = 100, variant = '', thin = false, meta = null }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  const bar = el('div', { class: `progress${thin ? ' progress--thin' : ''}` },
    el('div', {
      class: `progress__fill${variant ? ` progress__fill--${variant}` : ''}`,
      style: { width: `${pct}%` },
    }),
  );

  if (!meta) return bar;

  return el('div', {}, bar,
    el('div', { class: 'progress__meta' }, ...meta),
  );
}

// ============================================================
// Stars
// ============================================================

export function Stars({ count = 0, total = 3 }) {
  const stars = [];
  for (let i = 0; i < total; i++) {
    stars.push(el('span', { class: `star${i < count ? ' star--on' : ''}` }, '★'));
  }
  return el('span', { class: 'stars', 'aria-label': `${count} dari ${total} bintang` }, ...stars);
}

// ============================================================
// Badges & chips
// ============================================================

export function Badge({ label, variant = 'muted' }) {
  return el('span', { class: `badge badge--${variant}` }, label);
}

export function PriceChip({ amount, variant = '' }) {
  return el('span', { class: `price-chip${variant ? ` price-chip--${variant}` : ''}` },
    formatRupiahChip(amount),
  );
}

function formatRupiahChip(amount) {
  return `Rp${formatNumber(amount)}`;
}

// ============================================================
// Row item (Toko / Profil style list row)
// ============================================================

export function RowItem({
  icon,
  iconVariant = '',
  title,
  subtitle,
  trail = null,
  onClick,
  chevron = false,
}) {
  const tag = onClick ? 'button' : 'div';

  return el(tag, {
    class: 'row-item',
    type: onClick ? 'button' : undefined,
    onClick,
  },
    el('div', { class: `row-item__icon${iconVariant ? ` row-item__icon--${iconVariant}` : ''}` }, icon),
    el('div', { class: 'row-item__body' },
      el('div', { class: 'row-item__title' }, title),
      subtitle ? el('div', { class: 'row-item__sub' }, subtitle) : null,
    ),
    el('div', { class: 'row-item__trail' },
      ...(Array.isArray(trail) ? trail : [trail].filter(Boolean)),
      chevron ? el('span', { class: 'row-item__chev' }, '›') : null,
    ),
  );
}

// ============================================================
// Section header
// ============================================================

export function SectionHead({ title, action = null, onAction = null }) {
  return el('div', { class: 'section-head' },
    el('div', { class: 'section-head__title' }, title),
    action ? el('span', { class: 'section-head__link', onClick: onAction }, action) : null,
  );
}

// ============================================================
// Tabs
// ============================================================

/**
 * @param {Array<{id:string,label:string}>} items
 * @param {string} active
 * @param {(id:string)=>void} onChange
 */
export function Tabs({ items, active, onChange, underline = false }) {
  return el('div', { class: `tabs${underline ? ' tabs--underline' : ''}` },
    ...items.map((item) =>
      el('button', {
        class: `tabs__item${item.id === active ? ' tabs__item--active' : ''}`,
        type: 'button',
        onClick: () => onChange(item.id),
      }, item.label),
    ),
  );
}

// ============================================================
// Empty state
// ============================================================

export function EmptyState({ icon = '📭', title, text }) {
  return el('div', { class: 'empty' },
    el('div', { class: 'empty__icon' }, icon),
    el('div', { class: 'empty__title' }, title),
    text ? el('div', { class: 'empty__text' }, text) : null,
  );
}

export function Spinner({ small = false, size = 'md' } = {}) {
  const isSm = small || size === 'sm';
  return el('div', { class: 'spinner-wrap', style: { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px' } },
    el('div', { class: `spinner${isSm ? ' spinner--sm' : ''}` }),
  );
}

// ============================================================
// Avatar
// ============================================================

export function Avatar({ emoji = '😎', size = 'md', gold = false }) {
  const classes = ['avatar'];
  if (size === 'sm') classes.push('avatar--sm');
  if (size === 'lg') classes.push('avatar--lg');
  if (gold) classes.push('avatar--gold');

  return el('div', { class: classes }, emoji);
}

// ============================================================
// Stat tile
// ============================================================

export function Stat({ value, label }) {
  return el('div', { class: 'stat' },
    el('div', { class: 'stat__value' }, value),
    el('div', { class: 'stat__label' }, label),
  );
}

// ============================================================
// Ad slot
// ============================================================

export function AdSlot({ format = 'banner', onWatch = null }) {
  const isRewarded = format === 'rewarded';

  return el('div', { class: 'ad-slot' },
    el('span', { class: 'ad-slot__label' }, 'Iklan'),
    el('div', { class: 'ad-slot__body' },
      el('div', { class: 'ad-slot__icon' }, isRewarded ? '🎬' : '📢'),
      el('div', {}, isRewarded ? 'Tonton iklan untuk dapat hadiah' : 'Ruang iklan'),
      isRewarded && onWatch
        ? Button({ label: 'Tonton Sekarang', variant: 'soft', size: 'sm', onClick: onWatch })
        : null,
    ),
  );
}

// ============================================================
// Modal / sheet
// ============================================================

/**
 * Show a modal or bottom sheet. Returns a handle with `close()`.
 * @param {object} opts
 * @param {Node|string} opts.content
 * @param {'center'|'bottom'} [opts.position]
 * @param {boolean} [opts.dismissible]
 * @param {Function} [opts.onClose]
 */
export function openSheet({ content, position = 'bottom', dismissible = true, onClose } = {}) {
  const panel = position === 'bottom'
    ? el('div', { class: 'sheet' }, el('div', { class: 'sheet__grip' }), content)
    : el('div', { class: 'dialog' }, content);

  const overlay = el('div', {
    class: `overlay${position === 'bottom' ? ' overlay--bottom' : ''}`,
  }, panel);

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };

  const onKey = (e) => {
    if (e.key === 'Escape' && dismissible) close();
  };

  if (dismissible) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', onKey);
  }

  document.body.appendChild(overlay);
  return { close, overlay, panel };
}

/** Convenience: modal dialog with a title, body, and actions. */
export function showDialog({ title, body, actions = [], dismissible = true, onClose }) {
  const content = el('div', {},
    title ? el('h2', { class: 't-title', style: { marginBottom: '12px' } }, title) : null,
    typeof body === 'string' ? el('p', { class: 't-subtitle' }, body) : body,
    actions.length
      ? el('div', { class: 'dialog__actions' }, ...actions)
      : null,
  );

  return openSheet({ content, position: 'center', dismissible, onClose });
}

/** Yes/no confirmation. Resolves true when confirmed. */
export function confirmDialog({ title, body, confirmLabel = 'Ya', cancelLabel = 'Batal', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (value, handle) => {
      if (settled) return;
      settled = true;
      handle.close();
      resolve(value);
    };

    const handle = showDialog({
      title,
      body,
      dismissible: true,
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
      actions: [
        Button({
          label: confirmLabel,
          variant: danger ? 'coral' : 'gold',
          block: true,
          onClick: () => finish(true, handle),
        }),
        Button({
          label: cancelLabel,
          variant: 'ghost',
          block: true,
          onClick: () => finish(false, handle),
        }),
      ],
    });
  });
}

// ============================================================
// Toasts
// ============================================================

let toastHost = null;

function ensureToastHost() {
  if (!toastHost || !document.body.contains(toastHost)) {
    toastHost = el('div', { class: 'toast-host' });
    document.body.appendChild(toastHost);
  }
  return toastHost;
}

/**
 * @param {string} message
 * @param {'info'|'gold'|'ok'|'bad'} [tone]
 */
export function toast(message, tone = 'info', duration = 2400) {
  const host = ensureToastHost();
  const node = el('div', { class: `toast${tone !== 'info' ? ` toast--${tone}` : ''}` }, message);

  host.appendChild(node);

  setTimeout(() => {
    node.style.transition = 'opacity 240ms, transform 240ms';
    node.style.opacity = '0';
    node.style.transform = 'translateY(10px)';
    setTimeout(() => node.remove(), 260);
  }, duration);
}

