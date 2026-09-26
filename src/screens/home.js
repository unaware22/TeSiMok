/**
 * screens/home.js
 * Main hub: stage hero card, mode shortcuts, daily reward prompt,
 * leaderboard preview, and ad slot for free players.
 */
import { el, mount } from '../lib/dom.js';
import { Button, SectionHead, AdSlot, Badge } from '../components/primitives.js';
import { BottomNav, GreetingBar } from '../components/shell.js';
import { TeSiMokBrandBadge } from '../components/icons.js';
import { fetchStageProgress, fetchStages } from '../services/stages.js';
import { shouldShowAds } from '../services/shop.js';
import { formatNumber } from '../lib/format.js';
import { getState, setState } from '../state/store.js';
import * as router from '../state/router.js';

export function HomeScreen() {
  let isMounted = true;
  render();
  loadData();

  async function loadData() {
    try {
      const [progress, stages] = await Promise.all([fetchStageProgress(), fetchStages()]);
      if (!isMounted) return;
      setState({ stageProgress: progress });

      // Show a "resume" hint pointing at the furthest unlocked stage
      const nextStage = pickNextStage(progress.stages, stages);
      updateHero(nextStage, progress);
    } catch (err) {
      console.error('[home] Failed to load data:', err);
    }
  }

  function pickNextStage(progressStages, stages) {
    const unlocked = progressStages.filter((s) => s.unlocked);
    const uncleared = unlocked.find((s) => !s.cleared);
    if (uncleared) return uncleared;
    if (unlocked.length) return unlocked[unlocked.length - 1];
    return stages[0] || null;
  }

  function updateHero(stage, progress) {
    const host = document.getElementById('home-hero');
    if (!host || !stage) return;

    host.replaceChildren(
      el('div', { class: 'row-between', style: { width: '100%', marginBottom: '14px', zIndex: '2', position: 'relative' } },
        el('div', {},
          el('div', { class: 'hero__title', style: { fontSize: '1.3rem' } }, `Stage ${stage.stage_id || stage.id}`),
          el('div', { class: 'hero__sub', style: { fontSize: '0.82rem', opacity: '0.85' } }, 'Tebak Stiker'),
        ),
        el('button', {
          class: 'icon-btn icon-btn--plain',
          type: 'button',
          style: { color: 'rgba(255,255,255,0.7)', fontSize: '1.4rem' },
          onClick: (e) => {
            e.stopPropagation();
            router.navigate('stages');
          },
        }, '›'),
      ),

      // Center brand sticker badge
      el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '6px auto 14px' } },
        TeSiMokBrandBadge({ size: 'md' }),
      ),

      // White CTA button
      el('div', { style: { position: 'relative', zIndex: '2', width: '100%' } },
        Button({
          label: 'Mulai Stage',
          variant: 'white',
          size: 'md',
          block: true,
          onClick: () => router.navigate('stages'),
        }),
      ),
    );

    // Make the whole card tappable to go to stage selection
    host.onclick = (e) => {
      if (e.target.closest('button')) return;
      router.navigate('stages');
    };
  }

  function render() {
    const { profile, lifeState } = getState();
    const showAds = shouldShowAds(profile);

    mount(
      el('div', { class: 'shell' },
        GreetingBar({
          profile: profile || { display_name: 'Player123', avatar_emoji: '😎' },
          greeting: 'Halo,',
          onResourceClick: (tab) => router.navigate('shop', { tab: tab || 'lives' }),
        }),

        el('div', { class: 'home-grid' },
          // Left column on desktop: Stage Petualangan & Daily
          el('div', { class: 'home-grid__col' },
            // Stage hero
            el('div', { class: 'hero', id: 'home-hero' },
              el('div', { class: 'row-between', style: { width: '100%', marginBottom: '14px', zIndex: '2', position: 'relative' } },
                el('div', {},
                  el('div', { class: 'hero__title', style: { fontSize: '1.3rem' } }, 'Stage 1'),
                  el('div', { class: 'hero__sub', style: { fontSize: '0.82rem', opacity: '0.85' } }, 'Tebak Stiker'),
                ),
                el('button', {
                  class: 'icon-btn icon-btn--plain',
                  type: 'button',
                  style: { color: 'rgba(255,255,255,0.7)', fontSize: '1.4rem' },
                  onClick: () => router.navigate('stages'),
                }, '›'),
              ),

              el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '6px auto 14px' } },
                TeSiMokBrandBadge({ size: 'md' }),
              ),

              el('div', { style: { position: 'relative', zIndex: '2', width: '100%' } },
                Button({
                  label: 'Mulai Stage',
                  variant: 'white',
                  size: 'md',
                  block: true,
                  onClick: () => router.navigate('stages'),
                }),
              ),
            ),

            // Daily reward prompt
            el('div', { id: 'daily-prompt' }),

            // Ad slot for free players
            showAds ? AdSlot({ format: 'banner' }) : null,
          ),

          // Right column on desktop: Battle Mode & Stats Dashboard
          el('div', { class: 'home-grid__col' },
            // Prominent Battle Mode Card
            el('div', {
              class: 'card card--interactive',
              style: {
                background: 'linear-gradient(135deg, #1E1B4B 0%, #2A256B 60%, #3B3486 100%)',
                color: '#FFFFFF',
                border: '1.5px solid rgba(255,255,255,0.15)',
                boxShadow: '0 8px 24px rgba(30, 27, 75, 0.35)',
                padding: '16px 18px',
                position: 'relative',
                overflow: 'hidden',
                cursor: 'pointer',
              },
              onClick: () => router.navigate('battle'),
            },
              el('div', {
                style: {
                  position: 'absolute',
                  top: '-20px',
                  right: '-20px',
                  width: '90px',
                  height: '90px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(245,158,11,0.35) 0%, rgba(245,158,11,0) 70%)',
                  pointerEvents: 'none',
                },
              }),
              el('div', { class: 'row-between', style: { alignItems: 'center', position: 'relative', zIndex: '2' } },
                el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
                  el('div', {
                    style: {
                      width: '46px',
                      height: '46px',
                      borderRadius: '14px',
                      background: 'rgba(255,255,255,0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.6rem',
                      flex: '0 0 46px',
                      border: '1.5px solid rgba(255,255,255,0.22)',
                    },
                  }, '⚔️'),
                  el('div', {},
                    el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                      el('span', { style: { fontSize: '1.05rem', fontWeight: '800', color: '#FFFFFF' } }, 'Battle Mode 1v1'),
                      Badge({ label: 'Live', variant: 'coral' }),
                    ),
                    el('div', { style: { fontSize: '0.8rem', color: '#CBD5E1', marginTop: '3px' } },
                      `${profile?.rating ?? 1000} RR · ${profile?.ranked_wins ?? 0} Menang · Adu Cepat!`),
                  ),
                ),
                el('button', {
                  class: 'btn btn--gold btn--sm',
                  type: 'button',
                  style: { fontWeight: '800', padding: '8px 14px', borderRadius: '10px' },
                  onClick: (e) => {
                    e.stopPropagation();
                    router.navigate('battle');
                  },
                }, 'Tanding ⚔️'),
              ),
            ),

            // Stats
            el('div', { class: 'stat-grid' },
              el('div', {
                class: 'stat card--interactive',
                style: { cursor: 'pointer' },
                onClick: () => router.navigate('stages'),
                title: 'Buka petualangan stage',
              },
                el('div', { class: 'stat__value' }, `${getState().stageProgress?.totalStars ?? profile?.total_stars ?? 0}`),
                el('div', { class: 'stat__label' }, '⭐ Total Bintang'),
              ),
              el('div', {
                class: 'stat card--interactive',
                style: { cursor: 'pointer' },
                onClick: () => router.navigate('battle'),
                title: 'Buka battle ranked',
              },
                el('div', { class: 'stat__value' }, `${profile?.ranked_wins ?? 0}`),
                el('div', { class: 'stat__label' }, '⚔️ Menang Battle'),
              ),
              el('div', {
                class: 'stat card--interactive',
                style: { cursor: 'pointer' },
                onClick: () => router.navigate('leaderboard'),
                title: 'Buka peringkat leaderboard',
              },
                el('div', { class: 'stat__value' }, `${profile?.rating ?? 1000}`),
                el('div', { class: 'stat__label' }, '🏆 Rating (RR)'),
              ),
              el('div', {
                class: 'stat card--interactive',
                style: { cursor: 'pointer' },
                onClick: () => router.navigate('shop'),
                title: 'Buka toko',
              },
                el('div', { class: 'stat__value' }, formatNumber(profile?.coins ?? 0)),
                el('div', { class: 'stat__label' }, '🪙 Koin'),
              ),
            ),

            el('p', { class: 't-subtitle t-center', style: { fontSize: '11px', opacity: '0.7', margin: '4px 0 0' } },
              'TeSiMok v2 · Dibuat untuk keseruan tebak stiker jomok.'),
          ),
        ),
      ),
      BottomNav('home', handleNav),
    );

    // Render the daily reward card (needs live state)
    renderDailyPrompt();
  }

  function renderDailyPrompt() {
    const host = document.getElementById('daily-prompt');
    if (!host) return;

    const { profile } = getState();
    if (!profile) return;

    const lastClaim = profile.last_daily_claim;
    const today = new Date().toISOString().slice(0, 10);
    const canClaim = lastClaim !== today;

    if (!canClaim) return;

    host.replaceChildren(
      el('div', { class: 'card card--interactive', style: { borderColor: 'var(--line-gold)' },
        onClick: () => router.navigate('daily') },
        el('div', { class: 'row', style: { gap: '12px' } },
          el('div', { class: 'row-item__icon row-item__icon--gold' }, '🎁'),
          el('div', { class: 'grow' },
            el('div', { class: 'row-item__title' }, 'Hadiah Harian Siap!'),
            el('div', { class: 'row-item__sub' },
              `Streak hari ke-${((profile.daily_streak || 0) % 7) + 1} · Ketuk untuk klaim`),
          ),
          el('span', { class: 'row-item__chev' }, '›'),
        ),
      ),
    );
  }

  return () => {
    isMounted = false;
  };
}

/** Shared bottom-nav handler. */
export function handleNav(id) {
  if (id === 'battle') return router.navigate('battle');
  if (id === 'leaderboard') return router.navigate('leaderboard');
  if (id === 'shop') return router.navigate('shop');
  if (id === 'profile') return router.navigate('profile');
  return router.navigate('home');
}
