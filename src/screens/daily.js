/**
 * screens/daily.js
 * Daily login reward matching UIUX.png Screen 8 ("Reward Harian").
 */
import { el, mount } from '../lib/dom.js';
import { sfx } from '../lib/audio.js';
import { Button, toast } from '../components/primitives.js';
import { BottomNav, TopBar } from '../components/shell.js';
import { claimDailyReward, fetchProfile } from '../services/profile.js';
import { getState, applyProfile } from '../state/store.js';
import * as router from '../state/router.js';
import { handleNav } from './home.js';

const STREAK_DAYS = [
  { day: 1, label: 'Day 1', reward: '❤️ +1', icon: '❤️' },
  { day: 2, label: 'Day 2', reward: '🔑 +1', icon: '🔑' },
  { day: 3, label: 'Day 3', reward: '❤️ +1', icon: '❤️' },
  { day: 4, label: 'Day 4', reward: '🔑 +2', icon: '🔑' },
  { day: 5, label: 'Day 5', reward: '🎁', icon: '🎁' },
];

export function DailyRewardScreen() {
  let claiming = false;

  render();

  function render() {
    const { profile } = getState();
    const today = new Date().toISOString().slice(0, 10);
    const claimedToday = profile?.last_daily_claim === today;
    const currentStreak = profile?.daily_streak || 1;
    const activeDay = ((currentStreak - 1) % 5) + 1;

    mount(
      el('div', { class: 'shell' },
        TopBar({
          title: 'Reward Harian',
          onBack: () => router.navigate('home'),
        }),

        // 5-Day Streak Row matching UIUX.png Screen 8
        el('div', { class: 'card', style: { padding: '16px 12px' } },
          el('div', { class: 'row', style: { justifyContent: 'space-between', gap: '6px' } },
            ...STREAK_DAYS.map((d) => {
              const isCurrent = d.day === activeDay;
              const isDone = d.day < activeDay || (claimedToday && isCurrent);

              return el('div', {
                style: {
                  flex: '1',
                  textAlign: 'center',
                  background: isCurrent ? 'var(--surface-card-hover)' : 'transparent',
                  border: isCurrent ? '1.5px solid var(--navy-900)' : '1px solid var(--line-soft)',
                  borderRadius: '12px',
                  padding: '8px 4px',
                  position: 'relative',
                },
              },
                el('div', { class: 't-label', style: { fontSize: '10px', marginBottom: '4px' } }, d.label),
                el('div', { style: { fontSize: '1.25rem', margin: '2px 0' } }, isDone ? '✅' : d.icon),
                el('div', { style: { fontSize: '11px', fontWeight: '700', color: 'var(--navy-900)' } },
                  d.day === 5 ? 'Spesial' : d.reward),
              );
            }),
          ),
        ),

        // Mascot with thumbs-up and sparkles
        el('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            margin: '12px auto 6px',
          },
        },
          el('img', {
            src: '/brand/mascot-thumbs.webp',
            alt: 'Hadiah Harian',
            style: {
              width: '180px',
              height: '140px',
              objectFit: 'contain',
              filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.08))',
              marginBottom: '12px',
            },
          }),

          el('h2', { class: 't-title', style: { fontSize: '1.6rem', color: 'var(--text-primary)' } },
            'Hadiah Harian!'),
          el('p', { class: 't-subtitle', style: { marginTop: '4px' } },
            'Kamu mendapatkan:'),

          // Reward pill badges
          el('div', { class: 'row', style: { gap: '10px', marginTop: '12px', justifyContent: 'center' } },
            el('div', {
              class: 'res-pill',
              style: { padding: '8px 16px', fontSize: '1rem', background: 'var(--surface-card)', border: '1.5px solid var(--line-mid)' },
            },
              el('span', {}, '❤️'),
              el('span', { style: { fontWeight: '800' } }, '+1'),
            ),
            el('div', {
              class: 'res-pill',
              style: { padding: '8px 16px', fontSize: '1rem', background: 'var(--surface-card)', border: '1.5px solid var(--line-mid)' },
            },
              el('span', {}, '🔑'),
              el('span', { style: { fontWeight: '800' } }, '+1'),
            ),
          ),
        ),

        // Big Amber/Gold CTA Button matching UIUX.png
        el('div', { style: { width: '100%', marginTop: '16px' } },
          Button({
            label: claimedToday ? 'Sudah Diklaim Hari Ini' : (claiming ? 'Mengklaim...' : 'Klaim'),
            variant: claimedToday ? 'ghost' : 'gold',
            size: 'lg',
            block: true,
            disabled: claimedToday || claiming,
            onClick: handleClaim,
          }),
        ),

        // Footer note matching UIUX.png
        el('div', {
          class: 'row',
          style: {
            justifyContent: 'center',
            gap: '8px',
            marginTop: 'auto',
            padding: '12px',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            textAlign: 'center',
          },
        },
          el('span', {}, '📅'),
          el('span', {}, 'Login setiap hari untuk hadiah yang lebih besar!'),
        ),
      ),

      BottomNav('home', handleNav),
    );
  }

  async function handleClaim() {
    if (claiming) return;
    claiming = true;
    render();

    try {
      const res = await claimDailyReward();
      sfx.win();
      toast('🎉 Hadiah berhasil diklaim!', 'ok');

      const refreshed = await fetchProfile();
      applyProfile(refreshed);
    } catch (err) {
      console.warn('[daily] claim failed:', err);
      toast(err.message || 'Gagal mengklaim hadiah.', 'bad');
    } finally {
      claiming = false;
      render();
    }
  }
}
