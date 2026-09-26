/**
 * screens/stages.js
 * Tebak Gambar Style Stage Map:
 * - Level Selection Tabs (Level 1 Active, Level 2+ Locked / Segera Hadir)
 * - 3x3 Stage Grid for Stages 1-9
 * - Stage 10 as dramatic Crimson Red Boss Stage
 * - Lock gating: Stage 2-10 locked until preceding stage is cleared
 * - Antigravity IDE Dark Mode aesthetics
 */
import { el, mount } from '../lib/dom.js';
import { Progress, Spinner, toast } from '../components/primitives.js';
import { BottomNav, TopBar } from '../components/shell.js';
import { fetchStageProgress } from '../services/stages.js';
import { getState, setState } from '../state/store.js';
import * as router from '../state/router.js';
import { handleNav } from './home.js';

export function StageSelectScreen() {
  let isMounted = true;
  let selectedLevel = 1;
  const LEVELS = [
    { id: 1, name: 'Level 1', title: 'Pemula Jomok', unlocked: true },
    { id: 2, name: 'Level 2', title: 'Meme Sigma', unlocked: false },
    { id: 3, name: 'Level 3', title: 'Sepuh Kasar', unlocked: false },
    { id: 4, name: 'Level 4', title: 'Dewa Ngawi', unlocked: false },
    { id: 5, name: 'Level 5', title: 'Ambatron Prime', unlocked: false },
  ];

  render({ loading: true });
  load();

  async function load() {
    try {
      const progress = await fetchStageProgress();
      if (!isMounted) return;
      setState({ stageProgress: progress });
      render({ progress });
    } catch (err) {
      if (!isMounted) return;
      console.error('[stages] load failed:', err);
      render({ error: err.message });
    }
  }

  function render({ progress = null, loading = false, error = null } = {}) {
    if (!isMounted) return;
    const rawStages = progress?.stages || getState().stageProgress?.stages || [];
    const stages = rawStages.slice(0, 10);
    const totalStars = stages.reduce((acc, s) => acc + (s.stars || 0), 0);
    const maxStars = stages.length * 3;

    mount(
      el('div', { class: 'shell' },
        TopBar({
          title: 'Pilih Stage',
          subtitle: `Level ${selectedLevel} · Tebak Gambar Mode`,
          onBack: () => router.navigate('home'),
          right: el('div', { class: 'res-pill res-pill--coins' },
            el('span', { class: 'res-pill__icon' }, '⭐'),
            el('span', {}, `${totalStars}/${maxStars}`),
          ),
        }),

        // Level Tabs Selector
        el('div', { class: 'level-nav' },
          ...LEVELS.map((lvl) =>
            el('button', {
              class: [
                'level-tab',
                lvl.id === selectedLevel ? 'level-tab--active' : '',
                !lvl.unlocked ? 'level-tab--locked' : '',
              ].filter(Boolean).join(' '),
              type: 'button',
              onClick: () => {
                if (!lvl.unlocked) {
                  toast(`🔒 ${lvl.name} masih terkunci! Kalahkan Boss Stage 10 di Level 1 terlebih dahulu.`, 'bad');
                  return;
                }
                selectedLevel = lvl.id;
                render({ progress });
              },
            },
              lvl.unlocked ? '🎯' : '🔒',
              el('span', {}, lvl.name),
            )
          ),
        ),

        // Level Overview Card
        el('div', { class: 'card', style: { padding: '16px' } },
          el('div', { class: 'row-between', style: { marginBottom: '8px' } },
            el('div', {},
              el('div', { class: 'card__title', style: { fontSize: '1.05rem' } }, 'Level 1: Pemula Jomok'),
              el('div', { class: 'card__hint' }, 'Kumpulkan 30 bintang & kalahkan Boss!'),
            ),
            el('div', { style: { textAlign: 'right' } },
              el('span', { style: { color: 'var(--gold-400)', fontWeight: '800', fontSize: '1rem' } }, `${totalStars}`),
              el('span', { style: { color: 'var(--text-muted)', fontSize: '0.8rem' } }, `/${maxStars} ⭐`),
            ),
          ),
          Progress({ value: totalStars, max: maxStars }),
        ),

        error ? el('div', { class: 'alert alert--error' }, `⚠️ ${error}`) : null,
        loading ? Spinner() : null,

        // Tebak Gambar Stage Grid (Stages 1-9 Grid + Stage 10 Boss)
        stages.length > 0
          ? el('div', { class: 'tebak-grid' }, ...renderStageGrid(stages))
          : null,
      ),

      BottomNav('home', handleNav),
    );
  }

  function renderStageGrid(stages) {
    const items = [];

    // Stages 1 to 9: standard grid boxes
    const regularStages = stages.filter((s) => (s.stage_id || s.id) !== 10);
    // Stage 10: Boss
    const bossStage = stages.find((s) => (s.stage_id || s.id) === 10) || {
      stage_id: 10,
      title: 'Raja Jomok',
      subtitle: 'Final Boss',
      emoji: '👹',
      unlocked: false,
      cleared: false,
      stars: 0,
      is_boss: true,
    };

    regularStages.forEach((stage) => {
      const stageNum = stage.stage_id || stage.id;
      const isCurrent = stage.unlocked && !stage.cleared;
      const starsCount = stage.stars || 0;

      items.push(
        el('button', {
          class: [
            'stage-box',
            !stage.unlocked ? 'stage-box--locked' : '',
            stage.cleared ? 'stage-box--cleared' : '',
            isCurrent ? 'stage-box--current' : '',
          ].filter(Boolean).join(' '),
          type: 'button',
          onClick: () => handleStageClick(stage),
        },
          stage.unlocked
            ? el('div', { class: 'stage-box__emoji' }, stage.emoji || '🎯')
            : el('div', { class: 'stage-box__lock' }, '🔒'),

          el('div', { class: 'stage-box__num' }, `${stageNum}`),

          stage.unlocked
            ? el('div', { class: 'stage-box__stars' },
                ...renderStarString(starsCount),
              )
            : el('div', { class: 'card__hint', style: { fontSize: '0.68rem', marginTop: '4px' } }, 'Terkunci'),

          stage.cleared
            ? el('span', { class: 'stage-box__tag' }, 'SELESAI')
            : isCurrent
              ? el('span', { class: 'stage-box__tag', style: { background: 'rgba(56, 189, 248, 0.2)', color: '#38BDF8' } }, 'MAIN')
              : null,
        )
      );
    });

    // Boss Stage 10
    const bossCleared = bossStage.cleared;
    const bossUnlocked = bossStage.unlocked;

    items.push(
      el('button', {
        class: [
          'stage-box',
          'stage-box--boss',
          !bossUnlocked ? 'stage-box--locked' : '',
          bossCleared ? 'stage-box--cleared' : '',
        ].filter(Boolean).join(' '),
        type: 'button',
        onClick: () => handleStageClick(bossStage),
      },
        el('div', { class: 'boss-left' },
          el('div', { class: 'boss-icon' }, bossUnlocked ? '👹' : '🔒'),
          el('div', { class: 'boss-info' },
            el('div', { class: 'boss-badge' }, '👑 BOSS STAGE · STAGE 10'),
            el('div', { class: 'boss-title' }, bossStage.title || 'Raja Jomok'),
            el('div', { class: 'boss-sub' },
              bossUnlocked
                ? 'Kalahkan Raja Jomok untuk membuka Level 2!'
                : 'Selesaikan Stage 9 untuk menantang Boss!'),
          ),
        ),
        el('div', { class: 'boss-action' },
          bossUnlocked
            ? el('div', {
                style: {
                  background: 'var(--grad-coral)',
                  color: '#fff',
                  fontWeight: '800',
                  fontSize: '0.78rem',
                  padding: '8px 14px',
                  borderRadius: '999px',
                  boxShadow: '0 0 12px rgba(239, 68, 68, 0.6)',
                }
              }, bossCleared ? 'LAWAN LAGI ⚔️' : 'TANTANG BOSS ⚔️')
            : el('div', {
                style: {
                  color: 'var(--text-muted)',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                }
              }, 'TERKUNCI 🔒'),
          bossCleared
            ? el('div', { class: 'stage-box__stars', style: { fontSize: '0.85rem' } }, ...renderStarString(bossStage.stars || 3))
            : null,
        ),
      )
    );

    return items;
  }

  function renderStarString(count) {
    const stars = [];
    for (let i = 1; i <= 3; i++) {
      stars.push(
        el('span', {
          style: {
            color: i <= count ? 'var(--gold-400)' : 'rgba(255,255,255,0.2)',
            textShadow: i <= count ? '0 0 6px rgba(250, 204, 21, 0.4)' : 'none',
          }
        }, '⭐')
      );
    }
    return stars;
  }

  function handleStageClick(stage) {
    const stageId = stage.stage_id || stage.id;
    if (!stage.unlocked) {
      const prev = stageId - 1;
      toast(`🔒 Stage ${stageId} masih terkunci! Selesaikan Stage ${prev} terlebih dahulu.`, 'bad');
      return;
    }

    const { profile, lifeState } = getState();
    if (!profile) {
      toast('Masuk dulu untuk bermain stage.', 'bad');
      router.navigate('auth');
      return;
    }

    const lives = profile.lives ?? lifeState?.lives ?? 5;
    if (lives <= 0) {
      toast('❤️ Nyawa kamu habis! Silakan isi ulang di Toko.', 'bad');
      router.navigate('shop', { tab: 'lives' });
      return;
    }

    router.navigate('game', { id: stageId });
  }

  return () => {
    isMounted = false;
  };
}
