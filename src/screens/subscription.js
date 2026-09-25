/**
 * screens/subscription.js
 * Premium upgrade screen matching UIUX.png Screen 5.
 */
import { el, mount } from '../lib/dom.js';
import { sfx } from '../lib/audio.js';
import { Button, Badge, toast } from '../components/primitives.js';
import { BottomNav, TopBar } from '../components/shell.js';
import { buy } from '../services/shop.js';
import { fetchProfile } from '../services/profile.js';
import { getState, applyProfile } from '../state/store.js';
import * as router from '../state/router.js';
import { handleNav } from './home.js';

const BENEFITS = [
  'Bebas iklan',
  'Akses stiker eksklusif',
  'Akses soal eksklusif',
  'Dapatkan reward premium',
];

export function SubscriptionScreen() {
  let selectedTier = 'monthly'; // 'monthly' | 'yearly'
  let busy = false;

  render();

  function render() {
    const { profile } = getState();
    const isPremium = profile?.is_premium_active;

    mount(
      el('div', { class: 'shell' },
        TopBar({
          title: 'Subscription',
          onBack: () => router.navigate('home'),
        }),

        // Top Dark Card with Mascot & Crown matching UIUX.png
        el('div', {
          style: {
            background: 'var(--navy-900)',
            borderRadius: '24px',
            padding: '24px 20px',
            textAlign: 'center',
            color: '#ffffff',
            position: 'relative',
            overflow: 'hidden',
          },
        },
          el('div', { style: { position: 'relative', display: 'inline-block', marginBottom: '8px' } },
            el('img', {
              src: '/brand/mascot.webp',
              alt: 'Mascot',
              style: { width: '84px', height: '84px', objectFit: 'contain' },
            }),
            el('div', {
              style: {
                position: 'absolute',
                top: '0px',
                right: '-24px',
                fontSize: '1.6rem',
              },
            }, '👑'),
          ),

          el('h1', { style: { fontSize: '1.45rem', fontWeight: '900', color: '#ffffff', marginTop: '6px' } },
            isPremium ? 'Akun Kamu Premium' : 'Upgrade ke Premium'),
          el('p', { style: { fontSize: '0.85rem', color: 'rgba(255,255,255,0.78)', marginTop: '4px' } },
            isPremium ? 'Semua fitur premium sudah aktif.' : 'Nikmati pengalaman bermain yang lebih seru!'),
        ),

        // 2 Plan Cards matching UIUX.png
        !isPremium
          ? el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '4px' } },
              // Monthly Card
              el('button', {
                type: 'button',
                onClick: () => { selectedTier = 'monthly'; render(); },
                style: {
                  background: selectedTier === 'monthly' ? 'var(--navy-900)' : '#ffffff',
                  color: selectedTier === 'monthly' ? '#ffffff' : 'var(--navy-900)',
                  border: selectedTier === 'monthly' ? '2px solid var(--navy-900)' : '1px solid var(--line-soft)',
                  borderRadius: '18px',
                  padding: '16px 12px',
                  textAlign: 'center',
                  position: 'relative',
                  cursor: 'pointer',
                  boxShadow: selectedTier === 'monthly' ? 'var(--shadow-navy)' : 'var(--shadow-xs)',
                  transition: 'all 0.2s',
                },
              },
                el('span', {
                  style: {
                    position: 'absolute',
                    top: '-10px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--gold-400)',
                    color: '#1C2431',
                    fontSize: '10px',
                    fontWeight: '800',
                    padding: '2px 10px',
                    borderRadius: '999px',
                    whiteSpace: 'nowrap',
                  },
                }, 'Populer'),
                el('div', { style: { fontSize: '0.82rem', fontWeight: '600', opacity: selectedTier === 'monthly' ? '0.85' : '0.6', marginTop: '4px' } }, 'Bulanan'),
                el('div', { style: { fontSize: '1.15rem', fontWeight: '900', marginTop: '4px' } }, 'Rp 29.000'),
              ),

              // Yearly Card
              el('button', {
                type: 'button',
                onClick: () => { selectedTier = 'yearly'; render(); },
                style: {
                  background: selectedTier === 'yearly' ? 'var(--navy-900)' : '#ffffff',
                  color: selectedTier === 'yearly' ? '#ffffff' : 'var(--navy-900)',
                  border: selectedTier === 'yearly' ? '2px solid var(--navy-900)' : '1px solid var(--line-soft)',
                  borderRadius: '18px',
                  padding: '16px 12px',
                  textAlign: 'center',
                  position: 'relative',
                  cursor: 'pointer',
                  boxShadow: selectedTier === 'yearly' ? 'var(--shadow-navy)' : 'var(--shadow-xs)',
                  transition: 'all 0.2s',
                },
              },
                el('span', {
                  style: {
                    position: 'absolute',
                    top: '-10px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--gold-400)',
                    color: '#1C2431',
                    fontSize: '10px',
                    fontWeight: '800',
                    padding: '2px 10px',
                    borderRadius: '999px',
                    whiteSpace: 'nowrap',
                  },
                }, 'Hemat 43%'),
                el('div', { style: { fontSize: '0.82rem', fontWeight: '600', opacity: selectedTier === 'yearly' ? '0.85' : '0.6', marginTop: '4px' } }, 'Tahunan'),
                el('div', { style: { fontSize: '1.15rem', fontWeight: '900', marginTop: '4px' } }, 'Rp 199.000'),
              ),
            )
          : null,

        // Benefits Checklist matching UIUX.png
        el('div', { class: 'stack stack-3', style: { margin: '8px 0', padding: '0 8px' } },
          ...BENEFITS.map((text) =>
            el('div', { class: 'row', style: { gap: '12px', alignItems: 'center' } },
              el('div', {
                style: {
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'var(--navy-900)',
                  color: '#ffffff',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '12px',
                  fontWeight: '900',
                  flexShrink: 0,
                },
              }, '✓'),
              el('span', { style: { fontSize: '0.95rem', fontWeight: '600', color: 'var(--navy-900)' } }, text),
            ),
          ),
        ),

        // CTA Button matching UIUX.png
        el('div', { style: { marginTop: 'auto', paddingTop: '16px' } },
          isPremium
            ? el('div', { class: 'alert alert--success', style: { justifyContent: 'center' } },
                '🎉 Kamu sudah berlangganan Premium.')
            : Button({
                label: busy ? 'Memproses...' : 'Langganan Sekarang',
                variant: 'primary',
                size: 'lg',
                block: true,
                disabled: busy,
                onClick: handleSubscribe,
              }),
        ),
      ),

      BottomNav('shop', handleNav),
    );
  }

  async function handleSubscribe() {
    if (busy) return;
    busy = true;
    render();

    try {
      const sku = selectedTier === 'monthly' ? 'premium_monthly' : 'premium_yearly';
      await buy(sku);
      sfx.win();
      toast('🎉 Berhasil berlangganan Premium!', 'ok');

      const refreshed = await fetchProfile();
      applyProfile(refreshed);
    } catch (err) {
      toast(err.message || 'Gagal berlangganan.', 'bad');
    } finally {
      busy = false;
      render();
    }
  }
}
