/**
 * screens/leaderboard.js
 * Papan peringkat Turnamen & Global matching UIUX.png (Screen 4).
 * - Tabs: Turnamen & Global
 * - Turnamen Mingguan card dengan countdown sisa waktu
 * - Ranked list 1–5+ dengan badge 🥇🥈🥉, avatar, nama, dan skor
 * - Banner bawah: "Raih peringkat lebih tinggi dan dapatkan hadiah menarik!"
 */
import { el, mount } from '../lib/dom.js';
import {
  Button, Tabs, Avatar, EmptyState, Spinner, Badge,
} from '../components/primitives.js';
import { BottomNav, TopBar } from '../components/shell.js';
import { IconTrophy } from '../components/icons.js';
import {
  fetchTournamentBoard, fetchGlobalBoard, fetchMyRank, secondsUntilWeeklyReset,
} from '../services/leaderboard.js';
import { DEFAULT_LEADERBOARD } from '../services/fallback-data.js';
import { getState } from '../state/store.js';
import * as router from '../state/router.js';
import { formatNumber, formatCountdownHuman } from '../lib/format.js';
import { handleNav } from './home.js';

export function LeaderboardScreen({ tab = 'tournament' } = {}) {
  let isMounted = true;
  let activeTab = tab;
  let entries = DEFAULT_LEADERBOARD.slice(0, 15);
  let myRank = null;
  let countdownId = null;
  let currentLoadId = 0;

  render();
  load();

  async function load() {
    const loadId = ++currentLoadId;
    try {
      const data = activeTab === 'tournament'
        ? await fetchTournamentBoard(50)
        : await fetchGlobalBoard(50);

      if (!isMounted || loadId !== currentLoadId) return;

      if (data && data.length > 0) {
        entries = data;
      }

      const { profile } = getState();
      if (profile?.id) {
        myRank = await fetchMyRank(profile.id, activeTab, entries).catch(() => null);
      }
    } catch (err) {
      console.warn('[leaderboard] load error:', err);
    } finally {
      if (isMounted && loadId === currentLoadId) {
        render();
      }
    }
  }

  function render() {
    if (!isMounted) return;
    const medals = ['🥇', '🥈', '🥉'];
    const myId = getState().profile?.id;

    mount(
      el('div', { class: 'shell' },
        TopBar({
          title: 'Leaderboard',
          onBack: () => router.navigate('home'),
        }),

        Tabs({
          items: [
            { id: 'tournament', label: '⚔️ Battle (Turnamen)' },
            { id: 'global', label: '🎯 Stage (Petualangan)' },
          ],
          active: activeTab,
          onChange: (id) => {
            activeTab = id;
            load();
          },
        }),

        // Header card matching active mode
        activeTab === 'tournament'
          ? el('div', { class: 'card', style: { padding: '16px 20px' } },
              el('div', { class: 'row', style: { gap: '14px', alignItems: 'center' } },
                el('div', {
                  style: {
                    width: '46px',
                    height: '46px',
                    borderRadius: '14px',
                    background: 'var(--coral-100)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: '0 0 46px',
                  },
                }, IconTrophy({ size: 26, active: true })),
                el('div', { class: 'grow' },
                  el('div', { class: 'card__title', style: { fontSize: '1.05rem', fontWeight: '800' } }, 'Turnamen Ranked 1v1'),
                  el('div', { class: 'card__hint', id: 'weekly-countdown', style: { color: 'var(--text-secondary)', marginTop: '2px' } },
                    `Reset mingguan dalam ${formatCountdownHuman(secondsUntilWeeklyReset())}`),
                ),
              ),
            )
          : el('div', { class: 'card', style: { padding: '16px 20px' } },
              el('div', { class: 'row', style: { gap: '14px', alignItems: 'center' } },
                el('div', {
                  style: {
                    width: '46px',
                    height: '46px',
                    borderRadius: '14px',
                    background: 'var(--gold-100)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: '0 0 46px',
                    fontSize: '1.4rem',
                  },
                }, '🎯'),
                el('div', { class: 'grow' },
                  el('div', { class: 'card__title', style: { fontSize: '1.05rem', fontWeight: '800' } }, 'Peringkat Petualangan Stage'),
                  el('div', { class: 'card__hint', style: { color: 'var(--text-secondary)', marginTop: '2px' } },
                    'Akumulasi skor dan total perolehan bintang dari seluruh stage.'),
                ),
              ),
            ),

        // Ranked list
        entries && entries.length
          ? el('div', { class: 'card', style: { padding: '8px 16px' } },
              ...entries.slice(0, 15).map((entry, i) =>
                renderRankRow(entry, i, medals, entry.userId === myId),
              ),
            )
          : EmptyState({
              icon: '🏆',
              title: 'Belum ada peringkat',
              text: activeTab === 'tournament'
                ? 'Menangkan pertandingan battle ranked untuk masuk papan peringkat!'
                : 'Selesaikan stage untuk mengumpulkan skor dan bintang!',
            }),

        // My rank card
        myRank
          ? el('div', { class: 'card', style: { borderColor: 'var(--sky-400)', borderWidth: '1.5px', background: 'var(--surface-card)' } },
              el('div', { class: 'row', style: { gap: '12px', alignItems: 'center' } },
                el('div', { style: { fontWeight: '900', fontSize: '1.1rem', minWidth: '32px', textAlign: 'center', color: 'var(--sky-400)' } }, `#${myRank.rank}`),
                el('div', { class: 'grow' },
                  el('div', { class: 'card__title' }, 'Peringkat Kamu'),
                  el('div', { class: 'card__hint' },
                    activeTab === 'tournament'
                      ? `${myRank.wins ?? 0} Menang · ${myRank.losses ?? 0} Kalah · ${myRank.rating ?? 1000} RR`
                      : `${myRank.stars ?? 0}/30 ⭐ · Stage ${myRank.stages_cleared ?? 0}/10 Selesai`),
                ),
                el('div', { style: { textAlign: 'right' } },
                  el('div', {
                    class: 'board-row__score',
                    style: {
                      fontWeight: '800',
                      color: activeTab === 'tournament' ? 'var(--coral-500)' : 'var(--gold-400)',
                      fontSize: '1.05rem',
                    },
                  },
                    activeTab === 'tournament'
                      ? `${myRank.rating ?? 1000} RR`
                      : `${formatNumber(myRank.stage_score || myRank.points || 0)} Poin`),
                  activeTab === 'tournament'
                    ? el('div', { style: { fontSize: '0.72rem', color: 'var(--text-secondary)' } },
                        `${formatNumber(myRank.battle_score || myRank.points || 0)} Poin Battle`)
                    : el('div', { style: { fontSize: '0.72rem', color: 'var(--text-secondary)' } },
                        'Poin Petualangan'),
                ),
              ),
            )
          : null,

        // Motivational banner
        el('div', {
          class: 'card',
          style: {
            background: 'var(--grad-navy)',
            color: '#FFFFFF',
            border: '1px solid var(--line-soft)',
            borderRadius: '16px',
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          },
        },
          el('span', { style: { fontSize: '1.6rem', flex: '0 0 auto' } }, '👑'),
          el('div', { style: { fontSize: '0.9rem', fontWeight: '700', lineHeight: '1.35', color: '#F7FAFC' } },
            activeTab === 'tournament'
              ? 'Tanding terus di Battle Mode dan pertahankan rating tertinggimu!'
              : 'Selesaikan Stage 10 dan kalahkan Boss untuk membuka level selanjutnya!'),
        ),
      ),

      BottomNav('leaderboard', handleNav),
    );

    startCountdown();
  }

  function renderRankRow(entry, index, medals, isMe) {
    const rank = index + 1;
    const isTop3 = rank <= 3;
    const name = entry.name || 'Pemain';
    const avatar = entry.avatar || '😎';

    return el('div', {
      class: 'row',
      style: {
        padding: '12px 4px',
        borderBottom: index < (entries.length - 1) ? '1px solid var(--line-soft)' : 'none',
        alignItems: 'center',
        gap: '12px',
        background: isMe ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
        borderRadius: isMe ? '12px' : '0',
      },
    },
      // Rank badge / number
      el('div', {
        style: {
          width: '32px',
          textAlign: 'center',
          fontSize: isTop3 ? '1.4rem' : '0.95rem',
          fontWeight: '800',
          color: isTop3 ? 'var(--gold-500)' : 'var(--text-muted)',
          flex: '0 0 32px',
        },
      }, isTop3 ? medals[rank - 1] : `${rank}`),

      // Avatar
      el('div', {
        style: {
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          overflow: 'hidden',
          background: 'var(--surface-solid)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.2rem',
          flex: '0 0 40px',
          border: isTop3 ? '2px solid var(--gold-400)' : '1px solid var(--line-soft)',
        },
      },
        avatar.startsWith('/') || avatar.startsWith('http')
          ? el('img', { src: avatar, alt: name, style: { width: '100%', height: '100%', objectFit: 'cover' } })
          : el('span', {}, avatar),
      ),

      // Name & subtitle
      el('div', { class: 'grow', style: { minWidth: 0 } },
        el('div', {
          style: {
            fontSize: '0.95rem',
            fontWeight: '700',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            minWidth: 0,
          },
        },
          el('span', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, name),
          isMe ? Badge({ label: 'Kamu', variant: 'mint' }) : null,
          entry.isPremium ? el('span', { title: 'Premium' }, '👑') : null,
        ),
        el('div', {
          style: {
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            marginTop: '2px',
          },
        },
          activeTab === 'tournament'
            ? `${entry.wins ?? 0} Menang · ${entry.losses ?? 0} Kalah`
            : `${entry.stars ?? 0}/30 ⭐ · Stage ${entry.stages_cleared || Math.min(10, Math.ceil((entry.stars ?? 0) / 3))}/10 Selesai`,
        ),
      ),

      // Score / Rating
      el('div', { style: { textAlign: 'right', flex: '0 0 auto' } },
        el('div', {
          style: {
            fontWeight: '800',
            fontSize: '1rem',
            fontFamily: 'var(--font-display)',
            color: activeTab === 'tournament' ? 'var(--coral-500)' : 'var(--gold-400)',
          },
        },
          activeTab === 'tournament'
            ? `${entry.rating ?? 1000} RR`
            : `${formatNumber(entry.stage_score || entry.score || 0)} Poin`),
        activeTab === 'tournament'
          ? el('div', { style: { fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '1px' } },
              `${formatNumber(entry.battle_score || entry.score || 0)} Poin Battle`)
          : el('div', { style: { fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '1px' } },
              'Poin Stage'),
      ),
    );
  }

  function startCountdown() {
    clearInterval(countdownId);
    if (activeTab !== 'tournament') return;

    countdownId = setInterval(() => {
      const node = document.getElementById('weekly-countdown');
      if (!node) {
        clearInterval(countdownId);
        return;
      }
      node.textContent = `Berakhir dalam ${formatCountdownHuman(secondsUntilWeeklyReset())}`;
    }, 1000);
  }

  return () => {
    isMounted = false;
    clearInterval(countdownId);
  };
}
