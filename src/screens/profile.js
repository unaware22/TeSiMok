/**
 * screens/profile.js
 * Player profile matching UIUX.png (Screen 10).
 * - Big avatar with edit pencil badge, Player123, Level 12
 * - 4 clean menu cards:
 *   1. Stiker Saya (📥)
 *   2. Riwayat (🕒)
 *   3. Pengaturan (⚙️)
 *   4. Bantuan (❓)
 * - Soft full-width Keluar button
 */
import { el, mount } from '../lib/dom.js';
import { sfx, setSoundEnabled } from '../lib/audio.js';
import {
  Button, RowItem, Badge, Avatar, Stat, openSheet, toast,
  confirmDialog, SectionHead,
} from '../components/primitives.js';
import { BottomNav, TopBar } from '../components/shell.js';
import { updateProfile } from '../services/profile.js';
import { fetchStickerCatalogue, fetchOwnedStickers } from '../services/shop.js';
import { fetchStageProgress } from '../services/stages.js';
import { signOut } from '../services/supabase.js';
import { getState, applyProfile, clearSession } from '../state/store.js';
import * as router from '../state/router.js';
import { formatNumber } from '../lib/format.js';
import { levelFromStars, starsForNextLevel } from '../config/game.js';
import { handleNav } from './home.js';
import { getTheme, toggleTheme, ThemeToggleBtn } from '../lib/theme.js';

const AVATAR_CHOICES = ['😎', '🤣', '🔥', '👑', '🐉', '💀', '🦁', '👽', '🤖', '🐸', '🎭', '🐼'];

export function ProfileScreen() {
  let isMounted = true;

  render();
  loadExtras();

  async function loadExtras() {
    try {
      const [progress, stickers, owned] = await Promise.all([
        fetchStageProgress(),
        fetchStickerCatalogue().catch(() => []),
        fetchOwnedStickers().catch(() => []),
      ]);
      if (!isMounted) return;
      render({ progress, stickerCount: stickers.length, ownedCount: owned.length });
    } catch (err) {
      console.warn('[profile] extras failed:', err.message);
    }
  }

  function render({ progress = null, stickerCount = 0, ownedCount = 0 } = {}) {
    if (!isMounted) return;
    const { profile, lifeState } = getState();

    if (!profile) {
      mount(
        el('div', { class: 'shell' },
          TopBar({ title: 'Profil', onBack: () => router.navigate('home') }),
          el('div', { class: 'empty' },
            el('div', { class: 'empty__icon' }, '🔐'),
            el('div', { class: 'empty__title' }, 'Belum Masuk Akun'),
            el('div', { class: 'empty__text' },
              'Masuk atau daftar akun untuk menyimpan progres, rating turnamen, dan koleksi stikermu.'),
          ),
          Button({
            label: 'Masuk / Daftar',
            variant: 'dark',
            size: 'lg',
            block: true,
            onClick: () => router.navigate('auth'),
          }),
        ),
        BottomNav('profile', handleNav),
      );
      return;
    }

    const totalStars = progress?.totalStars ?? profile.total_stars ?? 0;
    const level = levelFromStars(totalStars);

    mount(
      el('div', { class: 'shell' },
        TopBar({
          title: 'Profil',
          onBack: () => router.navigate('home'),
        }),

        // Profile hero card matching UIUX.png Screen 10
        el('div', {
          class: 'card t-center',
          style: {
            padding: '28px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: '4px',
          },
        },
          // Avatar circle with edit pencil badge
          el('div', { style: { position: 'relative', width: '92px', height: '92px', margin: '0 auto 12px' } },
            profile.avatar_url
              ? el('img', {
                  src: profile.avatar_url,
                  alt: profile.display_name,
                  style: {
                    width: '92px',
                    height: '92px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '3px solid var(--line-mid)',
                    boxShadow: 'var(--shadow-md)',
                    background: 'var(--surface-solid)',
                  },
                })
              : el('div', {
                  style: {
                    width: '92px',
                    height: '92px',
                    borderRadius: '50%',
                    background: 'var(--surface-card)',
                    border: '3px solid var(--line-mid)',
                    boxShadow: 'var(--shadow-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '3.2rem',
                    userSelect: 'none',
                  },
                }, profile.avatar_emoji || '😎'),
            el('button', {
              class: 'icon-btn',
              type: 'button',
              'aria-label': 'Edit profil',
              style: {
                position: 'absolute',
                bottom: '0',
                right: '0',
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                background: 'var(--navy-900)',
                color: 'var(--text-on-navy)',
                fontSize: '13px',
                border: '2px solid var(--line-mid)',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              },
              onClick: openEditSheet,
            }, '✏️'),
          ),

          // Name & Level
          el('div', {
            style: {
              fontSize: '1.35rem',
              fontWeight: '800',
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            },
          }, profile.display_name || 'Player123'),
          el('div', {
            style: {
              fontSize: '0.95rem',
              fontWeight: '600',
              color: 'var(--text-secondary)',
              marginTop: '4px',
            },
          }, `Level ${level}`),

          // Small tag strip
          el('div', { class: 'row', style: { gap: '6px', marginTop: '10px' } },
            profile.is_premium_active
              ? Badge({ label: '👑 Premium', variant: 'gold' })
              : Badge({ label: 'Gratis', variant: 'muted' }),
            Badge({ label: `${profile.rating ?? 1000} RR`, variant: 'sky' }),
            Badge({ label: `⭐ ${totalStars}`, variant: 'gold' }),
          ),
        ),

        // 4 Menu Cards matching UIUX.png Screen 10
        el('div', { class: 'stack stack-3', style: { marginTop: '14px' } },
          // Card 1: Stiker Saya
          RowItem({
            icon: '📥',
            iconVariant: 'violet',
            title: 'Stiker Saya',
            subtitle: `${ownedCount || 5} stiker tersimpan di koleksi`,
            chevron: true,
            onClick: () => router.navigate('shop', { tab: 'toko' }),
          }),

          // Card 2: Riwayat
          RowItem({
            icon: '🕒',
            iconVariant: 'sky',
            title: 'Riwayat',
            subtitle: 'Lihat progres stage & statistik pertarungan',
            chevron: true,
            onClick: openHistory,
          }),

          // Card 3: Pengaturan
          RowItem({
            icon: '⚙️',
            iconVariant: 'muted',
            title: 'Pengaturan',
            subtitle: 'Pengaturan audio, notifikasi, dan profil',
            chevron: true,
            onClick: openSettings,
          }),

          // Card 4: Bantuan
          RowItem({
            icon: '❓',
            iconVariant: 'muted',
            title: 'Bantuan',
            subtitle: 'FAQ, panduan cara bermain, dan kontak',
            chevron: true,
            onClick: openHelp,
          }),
        ),

        // Premium upsell if free
        !profile.is_premium_active
          ? el('div', { style: { marginTop: '8px' } },
              RowItem({
                icon: '👑',
                iconVariant: 'gold',
                title: 'Upgrade ke Premium',
                subtitle: 'Bebas iklan & akses stiker eksklusif',
                trail: [Badge({ label: 'Mulai Rp29.000', variant: 'gold' })],
                chevron: true,
                onClick: () => router.navigate('subscription'),
              }),
            )
          : null,

        // Logout Button matching UIUX.png Screen 10
        el('div', { style: { marginTop: '18px' } },
          Button({
            label: 'Keluar',
            variant: 'soft',
            block: true,
            onClick: handleLogout,
            style: {
              background: '#FEE2E2',
              color: '#DC2626',
              fontWeight: '700',
              border: 'none',
            },
          }),
        ),

        el('p', { class: 't-subtitle t-center', style: { fontSize: '11px', marginTop: '12px' } },
          'TeSiMok v2.0.0 · Game Tebak Stiker Jomok'),
      ),

      BottomNav('profile', handleNav),
    );
  }

  // ============================================================
  // Edit Profile Sheet
  // ============================================================

  function openEditSheet() {
    const { profile } = getState();
    let selected = profile.avatar_emoji || '😎';

    const nameInput = el('input', {
      class: 'input',
      type: 'text',
      value: profile.display_name || '',
      maxlength: '20',
      style: { fontWeight: '600' },
    });

    const picker = el('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', marginTop: '8px' } },
      ...AVATAR_CHOICES.map((emoji) =>
        el('button', {
          class: `avatar avatar--sm${emoji === selected ? ' avatar--gold' : ''}`,
          type: 'button',
          style: { cursor: 'pointer', fontSize: '1.3rem' },
          onClick: (e) => {
            selected = emoji;
            picker.querySelectorAll('.avatar').forEach((n) => n.classList.remove('avatar--gold'));
            e.currentTarget.classList.add('avatar--gold');
          },
        }, emoji),
      ),
    );

    const handle = openSheet({
      content: el('div', { class: 'stack stack-4' },
        el('h2', { class: 't-title' }, 'Edit Profil'),

        el('div', { class: 'field' },
          el('label', { class: 'field__label' }, 'Nama Pemain'),
          nameInput,
        ),

        el('div', { class: 'field' },
          el('label', { class: 'field__label' }, 'Pilih Avatar'),
          picker,
        ),

        el('div', { class: 'dialog__actions', style: { marginTop: '16px' } },
          Button({
            label: 'Simpan',
            variant: 'dark',
            block: true,
            onClick: async () => {
              const newName = nameInput.value.trim();
              if (!newName) {
                toast('Nama tidak boleh kosong.', 'bad');
                return;
              }
              try {
                const updated = await updateProfile({
                  display_name: newName,
                  avatar_emoji: selected,
                });
                applyProfile(updated);
                sfx.tap();
                toast('Profil berhasil diperbarui!', 'ok');
                handle.close();
                render();
              } catch (err) {
                toast(err.message, 'bad');
              }
            },
          }),
        ),
      ),
    });
  }

  // ============================================================
  // History Sheet
  // ============================================================

  function openHistory() {
    const { profile, stageProgress } = getState();
    const stagesCleared = profile?.stages_cleared ?? stageProgress?.stages?.filter((s) => s.cleared).length ?? 0;
    const totalStars = stageProgress?.totalStars ?? profile?.total_stars ?? 0;
    const stageScore = profile?.stage_score ?? (profile?.total_score ? Math.round(profile.total_score * 0.6) : 0);
    const battleScore = profile?.battle_score ?? 0;
    const totalScore = (profile?.stage_score !== undefined || profile?.battle_score !== undefined)
      ? (stageScore + battleScore)
      : (profile?.total_score ?? 0);

    const wins = profile?.ranked_wins ?? 0;
    const losses = profile?.ranked_losses ?? 0;
    const draws = profile?.ranked_draws ?? 0;
    const totalBattles = wins + losses + draws;
    const winRate = totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 0;
    const rating = profile?.rating ?? 1000;

    openSheet({
      content: el('div', { class: 'stack stack-3' },
        el('h2', { class: 't-title' }, '📊 Statistik & Riwayat Pemain'),

        // Card 1: Statistik Petualangan Stage
        el('div', { class: 'card', style: { padding: '16px' } },
          el('div', { class: 'card__head', style: { marginBottom: '8px' } },
            el('div', { class: 'card__title' }, '🎯 Petualangan Stage'),
            Badge({ label: `${stagesCleared}/10 Selesai`, variant: stagesCleared === 10 ? 'gold' : 'sky' }),
          ),
          el('div', { class: 'stat-grid' },
            Stat({ value: `${stagesCleared}/10`, label: 'Stage Selesai' }),
            Stat({ value: `${totalStars}/30 ⭐`, label: 'Total Bintang' }),
            Stat({ value: formatNumber(stageScore), label: 'Poin Stage' }),
          ),
        ),

        // Card 2: Statistik Battle Ranked 1v1
        el('div', { class: 'card', style: { padding: '16px' } },
          el('div', { class: 'card__head', style: { marginBottom: '8px' } },
            el('div', { class: 'card__title' }, '⚔️ Battle Ranked 1v1'),
            Badge({ label: `${rating} RR`, variant: 'coral' }),
          ),
          el('div', { class: 'stat-grid', style: { marginBottom: '8px' } },
            Stat({ value: `${wins}`, label: 'Menang (W)' }),
            Stat({ value: `${losses}`, label: 'Kalah (L)' }),
            Stat({ value: `${draws}`, label: 'Seri (D)' }),
          ),
          el('div', { class: 'row-between', style: { borderTop: '1px solid var(--line-soft)', paddingTop: '10px', marginTop: '6px' } },
            el('span', { class: 't-subtitle', style: { fontSize: '12px' } }, `Win Rate: ${winRate}% (${totalBattles} Pertandingan)`),
            el('b', { style: { color: 'var(--coral-500)', fontSize: '13px' } }, `${formatNumber(battleScore)} Poin Battle`),
          ),
        ),

        // Card 3: Total Skor Keseluruhan
        el('div', { class: 'card', style: { padding: '12px 16px', background: 'var(--grad-navy)', color: '#FFF' } },
          el('div', { class: 'row-between', style: { alignItems: 'center' } },
            el('div', {},
              el('div', { style: { fontSize: '0.8rem', opacity: '0.85' } }, 'Total Skor Keseluruhan'),
              el('div', { style: { fontSize: '1.4rem', fontWeight: '900', color: '#FFF' } }, formatNumber(totalScore)),
            ),
            el('div', { style: { textAlign: 'right' } },
              el('div', { style: { fontSize: '0.8rem', opacity: '0.85' } }, 'Koin Dimiliki'),
              el('div', { style: { fontSize: '1.2rem', fontWeight: '800', color: 'var(--gold-400)' } }, `${formatNumber(profile?.coins ?? 0)} 🪙`),
            ),
          ),
        ),
      ),
    });
  }

  // ============================================================
  // Settings Sheet
  // ============================================================

  function openSettings() {
    const { profile } = getState();
    let soundOn = profile?.sound_enabled ?? true;

    openSheet({
      content: el('div', { class: 'stack stack-3' },
        el('h2', { class: 't-title' }, '⚙️ Pengaturan'),
        RowItem({
          icon: soundOn ? '🔊' : '🔇',
          title: 'Efek Suara',
          subtitle: soundOn ? 'Suara aktif' : 'Suara dimatikan',
          trail: [
            Button({
              label: soundOn ? 'ON' : 'OFF',
              variant: soundOn ? 'dark' : 'ghost',
              size: 'sm',
              onClick: () => {
                soundOn = !soundOn;
                setSoundEnabled(soundOn);
                updateProfile({ sound_enabled: soundOn });
                document.querySelector('.overlay')?.remove();
                openSettings();
              },
            }),
          ],
        }),
        RowItem({
          icon: '📱',
          title: 'Versi Aplikasi',
          subtitle: 'TeSiMok v2.0.0 (Web Edition)',
        }),
      ),
    });
  }

  // ============================================================
  // Help Sheet
  // ============================================================

  function openHelp() {
    openSheet({
      content: el('div', { class: 'stack stack-3' },
        el('h2', { class: 't-title' }, '❓ Panduan & Bantuan'),
        el('div', { class: 'card' },
          el('div', { class: 'card__title', style: { marginBottom: '6px' } }, '🎯 Cara Bermain Tebak Teks Stiker'),
          el('p', { class: 'card__hint', style: { lineHeight: '1.5' } },
            '1. Perhatikan stiker yang muncul (teks pada stiker belum ada).\n' +
            '2. Susun huruf dari kotak huruf di bawah untuk menebak kalimat stiker.\n' +
            '3. Jika tebakanmu benar, teks stiker akan tercetak utuh dan kamu mendapatkan skor!\n' +
            '4. Gunakan tombol 💡 Hint untuk bantuan huruf pertama, atau 🔑 Buka Jawaban jika mentok.',
          ),
        ),
        el('div', { class: 'card' },
          el('div', { class: 'card__title', style: { marginBottom: '6px' } }, '❤️ Sistem Nyawa & Kunci'),
          el('p', { class: 'card__hint', style: { lineHeight: '1.5' } },
            '• Maksimal 5 nyawa. Nyawa pulih 1 setiap 2 jam.\n' +
            '• Kunci jawaban diberikan 2 gratis setiap hari saat login.',
          ),
        ),
      ),
    });
  }

  // ============================================================
  // Logout Flow
  // ============================================================

  async function handleLogout() {
    const confirmed = await confirmDialog({
      title: 'Keluar dari akun?',
      body: 'Kamu akan keluar dari sesi ini. Progres yang tersimpan di perangkat tetap aman.',
      confirmLabel: 'Keluar',
      cancelLabel: 'Batal',
      danger: true,
    });

    if (!confirmed) return;

    try {
      await signOut();
    } catch {
      // ignore
    }
    clearSession();
    router.resetHistory();
    toast('Berhasil keluar dari akun.', 'ok');
    router.navigate('auth', {}, { replace: true });
  }

  return () => {
    isMounted = false;
  };
}
