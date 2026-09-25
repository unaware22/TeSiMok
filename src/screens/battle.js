/**
 * screens/battle.js
 * Ranked battle: matchmaking lobby, mirrored realtime arena, taunt stickers,
 * and rating settlement.
 *
 * Realtime strategy: a Postgres-changes subscription keeps the battle row in
 * sync (scores, status, timer). Taunts arrive on the same channel. A local
 * animation loop drives the countdown without extra network traffic.
 */
import { el, mount, flashClass } from '../lib/dom.js';
import { sfx } from '../lib/audio.js';
import {
  Button, Badge, Avatar, openSheet, toast, confirmDialog, EmptyState,
} from '../components/primitives.js';
import { BottomNav, TopBar } from '../components/shell.js';
import {
  joinQueue, cancelQueue, getBattleState, fetchBattleQuestions,
  submitBattleAnswer, settleBattle, watchBattle, watchMatchmaking,
  fetchOpponent, sendTaunt,
} from '../services/battle.js';
import { supabase } from '../services/supabase.js';
import { fetchProfile } from '../services/profile.js';
import { getState, applyProfile } from '../state/store.js';
import * as router from '../state/router.js';
import { formatNumber } from '../lib/format.js';
import { formatOptionText } from '../services/stages.js';
import {
  BATTLE_DURATION_SECONDS, MATCHMAKING_TIMEOUT_MS, TAUNT_STICKERS,
  MATCH_POLL_INTERVAL_MS,
} from '../config/game.js';
import { handleNav } from './home.js';

export function BattleScreen() {
  // ---------- Battle state ----------
  const state = {
    battleId: null,
    role: null,
    myId: null,
    opponent: null,
    questions: [],
    index: 0,
    myScore: 0,
    oppScore: 0,
    myCorrect: 0,
    oppCorrect: 0,
    streak: 0,
    locked: false,
    endsAt: null,
    secondsLeft: BATTLE_DURATION_SECONDS,
    clockId: null,
    unsubBattle: null,
    unsubMatch: null,
    unsubTaunt: null,
    pollId: null,
    matchTimeout: null,
    settled: false,
    finished: false,
    answeredIds: new Set(),
  };

  // ---------- Lifecycle ----------
  start();

  async function start() {
    const { profile } = getState();

    if (!profile) {
      mount(
        el('div', { class: 'shell' },
          TopBar({ title: 'Battle Mode', onBack: () => router.navigate('home') }),
          EmptyState({
            icon: '🔐',
            title: 'Masuk untuk bertanding',
            text: 'Battle mode memerlukan akun agar rating dan peringkatmu tersimpan.',
          }),
          Button({
            label: 'Masuk Sekarang',
            variant: 'gold',
            block: true,
            onClick: () => router.navigate('auth'),
          }),
        ),
        BottomNav('battle', handleNav),
      );
      return;
    }

    let user = null;
    try {
      const res = await supabase.auth.getUser();
      user = res?.data?.user;
    } catch {}
    state.myId = user?.id || profile?.id || 'player-guest-1';

    renderLobby();
  }

  // ============================================================
  // Matchmaking
  // ============================================================

  async function beginMatchmaking() {
    try {
      const { battleId, role, matched } = await joinQueue();
      state.battleId = battleId;
      state.role = role;

      if (matched) {
        onMatched();
        return;
      }

      state.unsubMatch = watchMatchmaking(battleId, () => onMatched());

      state.pollId = setInterval(async () => {
        try {
          const snapshot = await getBattleState(battleId);
          if (snapshot.opponent_joined && snapshot.status !== 'waiting') {
            onMatched();
          }
        } catch {}
      }, MATCH_POLL_INTERVAL_MS);

      // Otomatis pasangkan dengan penantang AI aktif setelah 4.5 detik
      state.matchTimeout = setTimeout(() => {
        const challengers = [
          { id: 'bot', display_name: 'Mas Rusdi [AI]', avatar_emoji: '✂️', rating: 1120 },
          { id: 'bot', display_name: 'Ambatron [Bot]', avatar_emoji: '🤖', rating: 1080 },
          { id: 'bot', display_name: 'Fuad Sparta [AI]', avatar_emoji: '⚔️', rating: 1200 },
          { id: 'bot', display_name: 'Suki Gacor [Bot]', avatar_emoji: '🔥', rating: 1040 },
        ];
        const selected = challengers[Math.floor(Math.random() * challengers.length)];
        startBotMatch(selected);
      }, 4500);
    } catch (err) {
      console.warn('[battle] matchmaking RPC offline/unmigrated, starting bot duel:', err.message);
      startBotMatch();
    }
  }

  async function offerBotMatch() {
    startBotMatch();
  }

  async function onMatched() {
    clearInterval(state.pollId);
    clearTimeout(state.matchTimeout);
    state.unsubMatch?.();
    state.unsubMatch = null;
    state.pollId = null;
    state.matchTimeout = null;

    try {
      const snapshot = await getBattleState(state.battleId);
      state.endsAt = snapshot.ends_at;
      state.opponent = await fetchOpponent(state.battleId, state.myId);
      state.questions = await fetchBattleQuestions(state.battleId);

      if (state.questions.length === 0) {
        throw new Error('Bank soal kosong. Hubungi admin.');
      }

      sfx.battleStart();
      toast('Lawan ditemukan! Bertanding...', 'ok', 1800);

      renderArena();
      watchRealtime();
      startClock();
      nextQuestion();
    } catch (err) {
      console.error('[battle] failed to start match:', err);
      toast(err.message || 'Gagal memulai pertandingan.', 'bad');
      router.navigate('home');
    }
  }

  async function startBotMatch(customBot = null) {
    clearInterval(state.pollId);
    clearTimeout(state.matchTimeout);
    state.unsubMatch?.();
    state.pollId = null;
    state.matchTimeout = null;

    try {
      state.endsAt = new Date(Date.now() + BATTLE_DURATION_SECONDS * 1000).toISOString();
      const botObj = customBot || { id: 'bot', display_name: 'Bot Jomok', avatar_emoji: '🤖', rating: 1050 };
      state.opponent = botObj;

      let questions = [];
      if (state.battleId) {
        try {
          questions = await fetchBattleQuestions(state.battleId);
        } catch {}
      }

      if (!questions || questions.length === 0) {
        const { pickStageQuestions } = await import('../services/stages.js');
        questions = await pickStageQuestions({ question_count: 15, id: 1 });
      }

      state.questions = questions;
      if (state.questions.length === 0) throw new Error('Bank soal kosong.');

      sfx.battleStart();
      toast(`Tanding dimulai lawan ${state.opponent.display_name}!`, 'ok', 1600);

      renderArena();
      startClock();
      nextQuestion();
      runBot();
    } catch (err) {
      console.error('[battle] bot match failed:', err);
      toast('Gagal memulai latihan bot.', 'bad');
      router.navigate('home');
    }
  }

  /** Simulasi bot dengan interaksi nyata: skor bertambah, dot indikator, dan sesekali taunt emoji */
  function runBot() {
    const botTick = () => {
      if (state.finished || !state.endsAt) return;

      const remaining = (new Date(state.endsAt).getTime() - Date.now()) / 1000;
      if (remaining <= 0) return;

      const isCorrect = Math.random() < 0.65;
      if (isCorrect) {
        state.oppScore += 100 + Math.floor(Math.random() * 25);
        state.oppCorrect += 1;
        addDot('opp-dots', true);
      } else {
        addDot('opp-dots', false);
      }

      updateArenaScores();

      if (Math.random() < 0.22) {
        const taunts = ['hai', 'lucu', 'terluka'];
        const randomTaunt = taunts[Math.floor(Math.random() * taunts.length)];
        showIncomingTaunt(randomTaunt);
      }

      setTimeout(botTick, 2800 + Math.random() * 2400);
    };

    setTimeout(botTick, 2000);
  }

  // ============================================================
  // Realtime
  // ============================================================

  function watchRealtime() {
    state.unsubBattle = watchBattle(state.battleId, {
      onBattle: (row) => {
        if (!row) return;

        const iAmA = row.player_a === state.myId;
        state.myScore = iAmA ? row.score_a : row.score_b;
        state.oppScore = iAmA ? row.score_b : row.score_a;
        state.myCorrect = iAmA ? row.correct_a : row.correct_b;
        state.oppCorrect = iAmA ? row.correct_b : row.correct_a;

        updateArenaScores();

        if (row.status === 'finished' && !state.finished) {
          endBattle(row);
        }
      },

      onTaunt: (row) => {
        if (!row) return;
        if (row.sender_id === state.myId) return;   // our own taunt is shown locally
        showIncomingTaunt(row.sticker);
      },

      onStatus: (status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[battle] realtime channel issue:', status);
        }
      },
    });
  }

  // ============================================================
  // Lobby UI
  // ============================================================

  function renderLobby() {
    const { profile } = getState();
    const avatarEmoji = profile?.avatar_emoji || '😎';
    const avatarUrl = profile?.avatar_url;

    mount(
      el('div', { class: 'shell' },
        TopBar({
          title: 'Battle Mode',
          subtitle: 'Turnamen Mingguan & Ranked 1v1',
          onBack: () => router.navigate('home'),
          right: el('div', { class: 'res-pill res-pill--plain' },
            el('span', {}, `${profile?.rating ?? 1000} RR`),
          ),
        }),

        // Player profile summary card
        el('div', {
          class: 'card',
          style: {
            padding: '18px 20px',
            background: 'linear-gradient(135deg, #1C2431 0%, #2D3748 100%)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '18px',
          },
        },
          el('div', { class: 'row', style: { gap: '16px', alignItems: 'center' } },
            avatarUrl
              ? el('img', {
                  src: avatarUrl,
                  alt: 'Avatar',
                  style: {
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '3px solid var(--mint-400)',
                  },
                })
              : el('div', {
                  style: {
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.12)',
                    border: '3px solid var(--mint-400)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2rem',
                    flex: '0 0 56px',
                  },
                }, avatarEmoji),
            el('div', { class: 'grow' },
              el('div', {
                style: {
                  fontSize: '1.15rem',
                  fontWeight: '800',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                },
              },
                profile?.display_name || 'Kamu',
                Badge({ label: 'Ranked', variant: 'mint' }),
              ),
              el('div', { style: { fontSize: '0.85rem', color: '#CBD5E0', marginTop: '4px' } },
                `${profile?.rating ?? 1000} RR · ${profile?.ranked_wins ?? 0} Kemenangan`),
            ),
          ),
        ),

        // Tournament info
        el('div', { class: 'card' },
          el('div', { class: 'card__head' },
            el('div', { class: 'card__title' }, '🏆 Turnamen Mingguan (Live)'),
            Badge({ label: 'Aktif', variant: 'gold' }),
          ),
          el('p', { class: 't-subtitle', style: { fontSize: '13px', margin: '4px 0 10px' } },
            'Kumpulkan poin kemenangan dan raih peringkat teratas papan turnamen sebelum reset mingguan!'),
          el('div', { class: 'row', style: { gap: '8px' } },
            el('div', { class: 'stat', style: { padding: '10px', background: '#F8FAFC', flex: '1', borderRadius: '10px' } },
              el('div', { class: 'stat__value', style: { fontSize: '1rem', color: 'var(--mint-600)' } }, '+25 RR'),
              el('div', { class: 'stat__label', style: { fontSize: '11px' } }, 'Jika Menang'),
            ),
            el('div', { class: 'stat', style: { padding: '10px', background: '#F8FAFC', flex: '1', borderRadius: '10px' } },
              el('div', { class: 'stat__value', style: { fontSize: '1rem', color: 'var(--coral-500)' } }, '-15 RR'),
              el('div', { class: 'stat__label', style: { fontSize: '11px' } }, 'Jika Kalah'),
            ),
          ),
        ),

        // Battle rules
        el('div', { class: 'card' },
          el('div', { class: 'card__head' },
            el('div', { class: 'card__title' }, '📋 Aturan Pertandingan'),
          ),
          el('div', { class: 'stack stack-2' },
            ruleRow('⏱️', `${BATTLE_DURATION_SECONDS} detik adu cepat tebak stiker secara real-time`),
            ruleRow('🎯', 'Jawaban benar dan cepat memberikan poin lebih besar'),
            ruleRow('😈', 'Kirim stiker taunt interaktif untuk mengganggu fokus lawan'),
            ruleRow('📈', 'Hasil tanding langsung memengaruhi rating peringkatmu'),
          ),
        ),

        // Action Buttons
        el('div', { class: 'stack stack-2', style: { marginTop: '4px' } },
          Button({
            label: '⚔️ Mulai Cari Lawan',
            variant: 'primary',
            size: 'lg',
            block: true,
            onClick: () => startSearching(),
          }),
          Button({
            label: '🤖 Latihan Lawan Bot (Bebas Risiko)',
            variant: 'soft',
            size: 'md',
            block: true,
            onClick: () => startBotMatch(),
          }),
        ),
      ),

      BottomNav('battle', handleNav),
    );
  }

  function startSearching() {
    state.finished = false;
    state.settled = false;
    renderSearching();
    beginMatchmaking();
  }

  function renderSearching() {
    const { profile } = getState();

    mount(
      el('div', { class: 'shell' },
        TopBar({
          title: 'Battle Mode',
          subtitle: 'Mencari Lawan...',
          onBack: async () => {
            await leaveQueue();
            state.finished = false;
            renderLobby();
          },
          right: el('div', { class: 'res-pill res-pill--plain' },
            el('span', {}, `${profile?.rating ?? 1000} RR`),
          ),
        }),

        el('div', { class: 'battle-lobby' },
          el('div', { class: 'radar' },
            el('div', { class: 'radar__ring' }),
            el('div', { class: 'radar__ring' }),
            el('div', { class: 'radar__ring' }),
            el('div', { class: 'radar__core' }, '⚔️'),
          ),

          el('h2', { class: 't-title' }, 'Mencari Lawan...'),
          el('p', { class: 't-subtitle' },
            'Mencocokkan dengan pemain yang rating-nya seimbang.'),

          el('div', { class: 'battle-vs', style: { marginTop: '8px' } },
            el('div', { class: 'battle-vs__side' },
              Avatar({ emoji: profile?.avatar_emoji || '😎', size: 'lg', gold: true }),
              el('div', { class: 'battle-vs__name' }, profile?.display_name || 'Kamu'),
              el('div', { class: 'battle-vs__rating' }, `${profile?.rating ?? 1000} RR`),
              Badge({ label: 'Kamu', variant: 'mint' }),
            ),
            el('div', { class: 'battle-vs__mark' }, 'VS'),
            el('div', { class: 'battle-vs__side' },
              Avatar({ emoji: '❔', size: 'lg' }),
              el('div', { class: 'battle-vs__name' }, 'Mencari...'),
              el('div', { class: 'battle-vs__rating' }, '— RR'),
              Badge({ label: 'Lawan', variant: 'coral' }),
            ),
          ),
        ),

        el('div', { class: 'stack stack-2', style: { marginTop: '12px' } },
          Button({
            label: '⚡ Tanding Sekarang (Lawan Bot)',
            variant: 'gold',
            size: 'lg',
            block: true,
            onClick: () => {
              leaveQueue();
              startBotMatch();
            },
          }),
          Button({
            label: 'Batalkan Pencarian',
            variant: 'ghost',
            size: 'md',
            block: true,
            onClick: async () => {
              await leaveQueue();
              state.finished = false;
              renderLobby();
            },
          }),
        ),
      ),

      BottomNav('battle', handleNav),
    );
  }

  function ruleRow(icon, text) {
    return el('div', { class: 'row', style: { gap: '10px' } },
      el('span', { style: { fontSize: '1rem' } }, icon),
      el('span', { class: 't-subtitle', style: { fontSize: '13px' } }, text),
    );
  }

  async function leaveQueue() {
    cleanup();
    if (state.battleId && state.role === 'player_a') {
      await cancelQueue(state.battleId).catch(() => {});
    }
  }

  // ============================================================
  // Arena UI
  // ============================================================

  function renderArena() {
    const me = getState().profile;
    const opp = state.opponent || { display_name: 'Lawan', avatar_emoji: '🎭' };

    mount(
      el('div', { class: 'arena' },
        // Arena Top Bar with Surrender Button
        el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 4px' } },
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            el('span', { style: { fontSize: '1.2rem' } }, '⚔️'),
            el('span', { style: { fontWeight: '900', fontSize: '0.95rem', color: 'var(--navy-900)' } }, 'Battle 1v1 Arena'),
          ),
          Button({
            label: '🏳️ Menyerah',
            variant: 'ghost',
            size: 'sm',
            onClick: async () => {
              const confirm = await confirmDialog({
                title: 'Menyerah Pertandingan?',
                body: 'Keluar sekarang akan mengakhiri sesi pertandingan ini.',
                confirmLabel: 'Ya, Menyerah',
                cancelLabel: 'Lanjut Bertanding',
              });
              if (confirm) {
                finalize();
                cleanup();
                router.navigate('battle', {}, { replace: true });
              }
            },
          }),
        ),

        // Shared clock
        el('div', { class: 'arena__timer' },
          el('div', { class: 'arena__timer-row' },
            el('span', { class: 'arena__clock', id: 'arena-clock' }, `${BATTLE_DURATION_SECONDS}`),
            el('span', { class: 'card__hint' }, 'detik tersisa'),
          ),
          el('div', { class: 'progress progress--thin' },
            el('div', { class: 'progress__fill', id: 'arena-progress', style: { width: '100%' } }),
          ),
        ),

        // Split halves (Right-side up)
        el('div', { class: 'arena__split' },
          // Opponent half
          el('div', { class: 'duel duel--opp', id: 'duel-opp' },
            el('div', { class: 'duel__head' },
              Avatar({ emoji: opp.avatar_emoji || '🎭', size: 'sm' }),
              el('span', { class: 'duel__who' }, opp.display_name),
              el('span', { class: 'duel__score', id: 'opp-score' }, '0'),
            ),
            el('div', { class: 'duel__question' },
              el('div', { class: 'duel__frag' },
                el('img', { id: 'opp-frag', alt: '', src: '' }),
              ),
              el('div', { class: 'duel__opts', id: 'opp-opts' },
                el('div', { class: 'duel__opt duel__opt--opp', style: { opacity: '0.35' } }, 'menunggu...'),
              ),
            ),
            el('div', { class: 'duel__dots', id: 'opp-dots' }),
          ),

          // My half
          el('div', { class: 'duel duel--me', id: 'duel-me' },
            el('div', { class: 'duel__head' },
              Avatar({ emoji: me?.avatar_emoji || '😎', size: 'sm' }),
              el('span', { class: 'duel__who' }, me?.display_name || 'Kamu'),
              el('span', { class: 'duel__score', id: 'my-score' }, '0'),
            ),
            el('div', { class: 'duel__question' },
              el('div', { class: 'duel__frag' },
                el('img', { id: 'my-frag', alt: 'Tebak teks pada stiker ini', src: '' }),
                el('div', { class: 'duel__caption', id: 'my-caption' },
                  el('span', { class: 'duel__caption-text' }, ''),
                ),
              ),
              el('div', { class: 'duel__opts', id: 'my-opts' }),
            ),
            el('div', { class: 'duel__dots', id: 'my-dots' }),
          ),
        ),

        // Taunt bar
        renderTauntBar(),
      ),
    );
  }

  function renderTauntBar() {
    const { profile } = getState();
    const isPremium = profile?.is_premium_active;

    return el('div', { class: 'taunt-bar' },
      el('span', { class: 'taunt-bar__label' }, 'Godain:'),
      el('div', { class: 'taunt-bar__scroll' },
        ...TAUNT_STICKERS.map((sticker) => {
          const locked = sticker.premium && !isPremium;
          return el('button', {
            class: `taunt-btn${locked ? ' taunt-btn--locked' : ''}`,
            type: 'button',
            title: locked ? `${sticker.label} (Premium)` : sticker.label,
            'aria-label': sticker.label,
            onClick: () => handleTaunt(sticker, locked),
          }, sticker.emoji);
        }),
      ),
    );
  }

  // ============================================================
  // Question flow
  // ============================================================

  function nextQuestion() {
    if (state.finished) return;

    // Skip questions already answered (the pool is shared and reused)
    while (state.index < state.questions.length && state.answeredIds.has(state.questions[state.index].id)) {
      state.index += 1;
    }

    const question = state.questions[state.index];

    if (!question) {
      // Ran out of questions before the timer — loop the pool with a reshuffle
      state.answeredIds.clear();
      state.questions = shuffle(state.questions);
      state.index = 0;
      return nextQuestion();
    }

    state.locked = false;

    const imgUrl = question.imageUrl || question.blank_image_url || question.fragment_url;
    const myImg = document.getElementById('my-frag');
    if (myImg) myImg.src = imgUrl;

    const oppImg = document.getElementById('opp-frag');
    if (oppImg) oppImg.src = imgUrl;

    resetMyCaption();

    renderMyOptions(question);
    renderOpponentOptions(question);
  }

  /** Sembunyikan caption di panel pemain untuk soal baru. */
  function resetMyCaption() {
    const cap = document.getElementById('my-caption');
    if (cap) {
      cap.className = 'duel__caption';
      const txt = cap.querySelector('.duel__caption-text');
      if (txt) txt.textContent = '';
    }
  }

  /**
   * Tampilkan teks jawaban di panel pemain setelah menjawab.
   * Benar → teks muncul (stiker jadi utuh). Salah → caption tetap kosong.
   */
  function revealMyCaption(text) {
    const cap = document.getElementById('my-caption');
    if (!cap) return;

    const txt = cap.querySelector('.duel__caption-text');
    if (!txt) return;

    txt.textContent = text;
    void cap.offsetWidth;
    cap.classList.add('duel__caption--revealed');
  }

  function renderMyOptions(question) {
    const host = document.getElementById('my-opts');
    if (!host) return;

    const opts = Array.isArray(question.options) ? question.options : [];
    host.replaceChildren(
      ...opts.map((option, idx) => {
        const letter = ['A', 'B', 'C', 'D'][idx] || `${idx + 1}`;
        return el('button', {
          class: 'duel__opt',
          type: 'button',
          dataset: { value: option },
          onClick: () => answer(option),
        },
          el('span', { class: 'duel__opt-badge' }, letter),
          el('span', { class: 'duel__opt-text' }, option),
        );
      }),
    );
  }

  function renderOpponentOptions(question) {
    const host = document.getElementById('opp-opts');
    if (!host) return;

    const opts = Array.isArray(question.options) ? question.options : [];
    host.replaceChildren(
      ...opts.map((option, idx) => {
        const letter = ['A', 'B', 'C', 'D'][idx] || `${idx + 1}`;
        return el('div', { class: 'duel__opt duel__opt--opp' },
          el('span', { class: 'duel__opt-badge', style: { opacity: '0.6' } }, letter),
          el('span', { class: 'duel__opt-text' }, option),
        );
      }),
    );
  }

  async function answer(choice) {
    if (state.locked || state.finished) return;
    state.locked = true;

    const question = state.questions[state.index];
    if (!question) return;

    state.answeredIds.add(question.id);

    const correctClean = formatOptionText(question.correct_answer).toLowerCase();
    const isCorrect = formatOptionText(choice).toLowerCase() === correctClean;

    const host = document.getElementById('my-opts');
    host?.querySelectorAll('.duel__opt').forEach((btn) => {
      btn.disabled = true;
      const valClean = formatOptionText(btn.dataset.value).toLowerCase();
      if (valClean === formatOptionText(choice).toLowerCase()) {
        btn.classList.add(isCorrect ? 'duel__opt--correct' : 'duel__opt--wrong');
      }
      if (!isCorrect && valClean === correctClean) {
        btn.classList.add('duel__opt--correct');
      }
    });

    if (isCorrect) {
      state.streak += 1;
      sfx.correct(state.streak);
      revealMyCaption(question.correct_answer);
      state.myCorrect += 1;
      state.myScore += 100 + (state.streak > 1 ? (state.streak - 1) * 20 : 0);
      updateArenaScores();
    } else {
      state.streak = 0;
      sfx.wrong();
    }

    addDot('my-dots', isCorrect);

    if (state.battleId && state.opponent?.id !== 'bot') {
      try {
        const result = await submitBattleAnswer(state.battleId, question.id, choice);
        state.myScore = result.my_score;
        state.myCorrect = result.my_correct;
        updateArenaScores();
      } catch (err) {
        console.warn('[battle] submitBattleAnswer RPC error:', err.message);
      }
    }

    setTimeout(() => {
      if (state.finished) return;
      state.index += 1;
      nextQuestion();
    }, isCorrect ? 550 : 900);
  }

  function addDot(containerId, isCorrect) {
    const host = document.getElementById(containerId);
    if (!host) return;
    if (host.children.length >= 14) host.removeChild(host.firstChild);
    host.appendChild(el('span', { class: `duel__dot${isCorrect ? ' duel__dot--ok' : ' duel__dot--bad'}` }));
  }

  function updateArenaScores() {
    const myNode = document.getElementById('my-score');
    const oppNode = document.getElementById('opp-score');

    if (myNode) {
      myNode.textContent = formatNumber(state.myScore);
      flashClass(myNode, 'duel__score--bump', 420);
    }
    if (oppNode) {
      oppNode.textContent = formatNumber(state.oppScore);
      flashClass(oppNode, 'duel__score--bump', 420);
    }

    // Highlight whoever is leading
    const meLead = state.myScore > state.oppScore;
    const oppLead = state.oppScore > state.myScore;
    document.getElementById('duel-me')?.classList.toggle('duel--leading', meLead);
    document.getElementById('duel-opp')?.classList.toggle('duel--leading', oppLead);
  }

  // ============================================================
  // Clock
  // ============================================================

  function startClock() {
    const endTime = state.endsAt
      ? new Date(state.endsAt).getTime()
      : Date.now() + BATTLE_DURATION_SECONDS * 1000;

    let lastWhole = null;

    const tick = () => {
      if (state.finished) return;

      const remaining = Math.max(0, (endTime - Date.now()) / 1000);
      state.secondsLeft = remaining;

      const clock = document.getElementById('arena-clock');
      const bar = document.getElementById('arena-progress');

      if (clock) {
        const whole = Math.ceil(remaining);
        clock.textContent = `${whole}`;
        clock.classList.toggle('arena__clock--low', remaining <= 10);

        // Audible countdown for the final 5 seconds
        if (whole <= 5 && whole !== lastWhole && whole > 0) {
          sfx.tick();
          lastWhole = whole;
        }
      }

      if (bar) {
        bar.style.width = `${(remaining / BATTLE_DURATION_SECONDS) * 100}%`;
        bar.className = 'progress__fill';
        if (remaining <= 10) bar.classList.add('progress__fill--bad');
        else if (remaining <= 25) bar.classList.add('progress__fill--warn');
      }

      if (remaining <= 0) {
        finalize();
        return;
      }

      state.clockId = requestAnimationFrame(tick);
    };

    tick();
  }

  // ============================================================
  // Taunts
  // ============================================================

  async function handleTaunt(sticker, locked) {
    if (locked) {
      const upgrade = await confirmDialog({
        title: `${sticker.emoji} Stiker Premium`,
        body: `Stiker "${sticker.label}" hanya tersedia untuk pemain Premium.`,
        confirmLabel: 'Lihat Premium',
        cancelLabel: 'Nanti',
      });
      if (upgrade) router.navigate('subscription');
      return;
    }

    showFloatingTaunt(sticker.emoji, false);
    sfx.tap();

    try {
      await sendTaunt(state.battleId, sticker.id);
    } catch (err) {
      console.warn('[battle] taunt failed:', err.message);
    }
  }

  function showIncomingTaunt(stickerId) {
    const sticker = TAUNT_STICKERS.find((s) => s.id === stickerId);
    const emoji = sticker?.emoji || '😈';
    showFloatingTaunt(emoji, true);
    sfx.taunt();
  }

  function showFloatingTaunt(emoji, incoming) {
    const node = el('div', {
      class: `taunt-float${incoming ? ' taunt-float--incoming' : ''}`,
      style: {
        left: `${15 + Math.random() * 60}%`,
        top: incoming ? '28%' : '52%',
      },
    }, emoji);

    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2100);
  }

  // ============================================================
  // Finish
  // ============================================================

  async function finalize() {
    if (state.finished) return;
    state.finished = true;

    if (state.clockId) cancelAnimationFrame(state.clockId);
    state.clockId = null;

    updateArenaScores();

    const isBot = state.opponent?.id === 'bot';

    if (isBot) {
      endBattle({
        winner: state.myScore > state.oppScore ? state.myId
              : state.oppScore > state.myScore ? 'bot' : null,
        is_draw: state.myScore === state.oppScore,
        status: 'finished',
      }, { isBot: true });
      return;
    }

    try {
      // A short grace period lets any in-flight answer land before settling
      await sleep(700);
      const snapshot = await getBattleState(state.battleId);

      if (snapshot.status === 'finished') {
        const result = await settleBattle(state.battleId);
        endBattle(snapshot, { result });
      } else {
        endBattle(snapshot);
      }
    } catch (err) {
      console.error('[battle] finalize failed:', err);
      endBattle({ status: 'finished', winner: null, is_draw: state.myScore === state.oppScore });
    }
  }

  async function endBattle(row = {}, { isBot = false, result = null } = {}) {
    if (state.settled) return;
    state.settled = true;
    state.finished = true;

    if (state.clockId) cancelAnimationFrame(state.clockId);
    state.clockId = null;

    cleanupRealtime();

    const iWon = isBot
      ? state.myScore > state.oppScore
      : row.winner === state.myId;

    const isDraw = state.is_draw ?? (state.myScore === state.oppScore);

    if (iWon) sfx.battleEnd();
    else if (!isDraw) sfx.lose();

    let ratingDelta = result?.rating_delta ?? row.rating_delta ?? 0;
    let newRating = result?.new_rating ?? null;

    // Refresh the profile so ratings/coins elsewhere stay accurate
    if (!isBot) {
      try {
        const refreshed = await fetchProfile();
        applyProfile(refreshed);
        newRating = refreshed.rating;
      } catch {
        // non-fatal
      }
    }

    showBattleResult({ iWon, isDraw, ratingDelta, newRating, isBot });
  }

  function showBattleResult({ iWon, isDraw, ratingDelta, newRating, isBot }) {
    const title = isDraw ? 'Seri!' : iWon ? 'Kamu Menang!' : 'Kamu Kalah';
    const tone = isDraw ? 'draw' : iWon ? 'win' : 'lose';
    const icon = isDraw ? '🤝' : iWon ? '🏆' : '💔';

    openSheet({
      position: 'center',
      dismissible: false,
      content: el('div', {},
        el('div', { class: `result-badge result-badge--${tone}` }, icon),
        el('h2', { class: 't-title t-center' }, title),

        el('div', { class: 'battle-vs', style: { marginTop: '16px' } },
          el('div', { class: 'battle-vs__side' },
            el('div', { class: 'battle-vs__rating' }, 'Kamu'),
            el('div', { class: 'result-score', style: { fontSize: '2rem' } },
              formatNumber(state.myScore)),
            el('div', { class: 'battle-vs__rating' }, `${state.myCorrect} benar`),
          ),
          el('div', { class: 'battle-vs__mark' }, '–'),
          el('div', { class: 'battle-vs__side' },
            el('div', { class: 'battle-vs__rating' }, state.opponent?.display_name || 'Lawan'),
            el('div', { class: 'board-row__score', style: { fontSize: '2rem' } },
              formatNumber(state.oppScore)),
            el('div', { class: 'battle-vs__rating' }, `${state.oppCorrect} benar`),
          ),
        ),

        isBot
          ? el('p', { class: 't-subtitle t-center', style: { marginTop: '12px' } },
              'Pertandingan latihan bot — rating tidak berubah.')
          : el('div', { class: 'row', style: { justifyContent: 'center', marginTop: '14px' } },
              el('span', {
                class: `rating-delta rating-delta--${ratingDelta >= 0 ? 'up' : 'down'}`,
              }, `${ratingDelta >= 0 ? '+' : ''}${ratingDelta} RR`),
              newRating
                ? el('span', { class: 'card__hint', style: { marginLeft: '10px' } },
                    `Rating: ${newRating}`)
                : null,
            ),

        el('div', { class: 'dialog__actions' },
          Button({
            label: 'Cari Lawan Lagi',
            variant: 'gold',
            size: 'lg',
            block: true,
            onClick: () => {
              document.querySelector('.overlay')?.remove();
              cleanup();
              router.navigate('battle', {}, { replace: true });
            },
          }),
          Button({
            label: 'Lihat Leaderboard',
            variant: 'soft',
            block: true,
            onClick: () => {
              document.querySelector('.overlay')?.remove();
              cleanup();
              router.navigate('leaderboard');
            },
          }),
          Button({
            label: 'Kembali ke Home',
            variant: 'ghost',
            block: true,
            onClick: () => {
              document.querySelector('.overlay')?.remove();
              cleanup();
              router.navigate('home');
            },
          }),
        ),
      ),
    });
  }

  // ============================================================
  // Cleanup
  // ============================================================

  function cleanupRealtime() {
    state.unsubBattle?.();
    state.unsubTaunt?.();
    state.unsubMatch?.();
    state.unsubBattle = null;
    state.unsubTaunt = null;
    state.unsubMatch = null;

    clearInterval(state.pollId);
    clearTimeout(state.matchTimeout);
    state.pollId = null;
    state.matchTimeout = null;
  }

  function cleanup() {
    cleanupRealtime();
    if (state.clockId) cancelAnimationFrame(state.clockId);
    state.clockId = null;
    state.finished = true;
  }

  return cleanup;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
