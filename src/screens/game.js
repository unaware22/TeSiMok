/**
 * screens/game.js
 * Single-player stage gameplay.
 *
 * MEKANIK (PILIH JAWABAN A, B, C, D):
 *   1. Pemain melihat gambar stiker dengan caption yang dihilangkan (blank image).
 *   2. Terdapat 4 pilihan jawaban ganda: A, B, C, D.
 *   3. Pemain dapat memilih jawaban melalui sentuhan/klik atau keyboard (A/B/C/D atau 1/2/3/4).
 *   4. Jika jawaban BENAR:
 *        -> Tombol pilihan menyala hijau (mc-option--correct).
 *        -> Teks jawaban benar muncul tercetak di bawah stiker dengan animasi cap (stiker jadi utuh).
 *        -> Suara benar berbunyi, skor & streak bertambah.
 *        -> Jeda ~1.3 detik, lalu lanjut ke soal berikutnya.
 *   5. Jika jawaban SALAH:
 *        -> Tombol pilihan bergetar merah (mc-option--wrong).
 *        -> Teks TIDAK muncul pada stiker (tetap tersembunyi).
 *        -> Suara salah berbunyi, nyawa berkurang 1.
 *        -> Tombol jawaban benar ditandai hijau agar pemain belajar.
 *        -> Jeda ~1.5 detik, lalu lanjut ke soal berikutnya.
 *   6. Power-up:
 *        -> 💡 50:50: Mengeliminasi 2 pilihan jawaban salah.
 *        -> 🔑 Buka Jawaban: Membuka jawaban benar dan mencetak teks di stiker.
 */
import { el, mount, flashClass } from '../lib/dom.js';
import { initAudio, sfx } from '../lib/audio.js';
import { triggerCorrectEffect, triggerConfetti } from '../lib/effects.js';
import { Button, confirmDialog, openSheet, toast } from '../components/primitives.js';
import { IconHeart, IconLightbulb, IconKey } from '../components/icons.js';
import {
  fetchStage, pickStageQuestions, scoreAnswer, computeStarRating,
  createRun, updateRun, abandonRun, recordStageResult, clearStageCache,
  recordAttempt, formatOptionText,
} from '../services/stages.js';
import { spendLife, fetchProfile } from '../services/profile.js';
import { registerPlayAndCheckInterstitial, ads, shouldShowAds } from '../services/shop.js';
import { getState, setState, applyProfile } from '../state/store.js';
import * as router from '../state/router.js';
import { formatNumber } from '../lib/format.js';
import { QUESTIONS_PER_STAGE, REVEAL_HOLD_MS, MAX_LIVES } from '../config/game.js';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export function GameScreen({ id }) {
  const stageId = Number(id) || 1;

  // ---------- Run state ----------
  const run = {
    stage: null,
    questions: [],
    index: 0,
    score: 0,
    streak: 0,
    maxStreak: 0,
    correct: 0,
    answered: 0,
    keysUsed: 0,
    hintsUsed: 0,
    locked: false,
    timeLimit: 10,
    secondsLeft: 10,
    startedAt: 0,
    timerId: null,
    runId: null,
    finished: false,
    advanceId: null,
    currentOptions: [],
  };

  init();

  // ============================================================
  // Boot
  // ============================================================

  async function init() {
    mount(
      el('div', { class: 'game' },
        el('div', { class: 'splash' },
          el('div', { class: 'spinner' }),
          el('p', { class: 'splash__msg' }, 'Menyiapkan stage...'),
        ),
      ),
    );

    try {
      const stage = await fetchStage(stageId);
      if (!stage) throw new Error('Stage tidak ditemukan.');

      run.stage = stage;
      run.timeLimit = stage.time_per_question || 10;

      const { profile } = getState();
      if (!profile) {
        router.navigate('auth');
        return;
      }

      // Check lives
      if ((profile.lives ?? MAX_LIVES) <= 0) {
        toast('Nyawa kamu habis! Silakan isi ulang di Toko.', 'bad');
        router.navigate('shop', { tab: 'lives' });
        return;
      }

      // Spend life for this stage attempt in background (non-blocking)
      spendLife().then((p) => { if (p) applyProfile(p); }).catch(() => {});

      run.questions = await pickStageQuestions(stage);

      if (!run.questions || run.questions.length === 0) {
        throw new Error('Belum ada soal untuk stage ini.');
      }

      // Persist run in background without blocking screen render
      createRun(stageId).then((created) => {
        run.runId = created?.id;
        if (run.runId) {
          updateRun(run.runId, { question_ids: run.questions.map((q) => q.id) });
        }
      }).catch((e) => console.warn('[game] createRun background:', e.message));

      initAudio();
      renderGame();
      setupKeyboardListeners();
      nextQuestion();
    } catch (err) {
      console.error('[game] init failed:', err);
      mount(
        el('div', { class: 'shell' },
          el('div', { class: 'empty' },
            el('div', { class: 'empty__icon' }, '⚠️'),
            el('div', { class: 'empty__title' }, 'Gagal memulai stage'),
            el('div', { class: 'empty__text' }, err.message),
          ),
          Button({
            label: 'Kembali',
            variant: 'primary',
            block: true,
            onClick: () => router.navigate('home'),
          }),
        ),
      );
    }
  }

  // ============================================================
  // Rendering Shell
  // ============================================================

  function renderGame() {
    const stage = run.stage;
    const { profile, lifeState } = getState();
    const lives = profile?.lives ?? lifeState?.lives ?? MAX_LIVES;

    mount(
      el('div', { class: 'game' },
        // Top Bar
        el('div', { class: 'topbar', style: { width: '100%', marginBottom: '-4px' } },
          el('button', {
            class: 'icon-btn',
            type: 'button',
            'aria-label': 'Kembali',
            onClick: confirmQuit,
          }, '←'),

          el('div', { class: 'topbar__title', id: 'stage-title-text' },
            `Stage ${stage.id}`),

          el('div', { class: 'res-pill res-pill--lives', id: 'game-lives-pill' },
            el('span', { class: 'res-pill__icon', style: { display: 'inline-flex', alignItems: 'center' } }, IconHeart({ size: 15 })),
            el('span', { id: 'game-lives-count' }, `${lives}`),
          ),
        ),

        // Progress bar (e.g. 1/5) & Timer
        el('div', { style: { width: '100%', margin: '4px 0' } },
          el('div', { class: 'row-between', style: { marginBottom: '4px' } },
            el('span', { class: 't-label', id: 'q-step-indicator' }, `1/${run.questions.length}`),
            el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              el('span', { class: 'game__timer-val', id: 'timer-val', style: { fontSize: '0.85rem', fontWeight: '800' } }, `⏱️ ${run.timeLimit}s`),
              el('span', { class: 'streak-chip', id: 'streak-chip' }, '🔥 0'),
            ),
          ),
          el('div', { class: 'progress progress--thin' },
            el('div', { class: 'progress__fill', id: 'timer-fill', style: { width: '100%' } }),
          ),
        ),

        // Sticker container
        el('div', { class: 'stiker', id: 'stiker' },
          el('img', {
            id: 'stiker-img',
            alt: 'Tebak teks pada stiker ini',
            draggable: 'false',
          }),
          // Caption reveal area (appears when answered correctly)
          el('div', { class: 'stiker__caption', id: 'stiker-caption' },
            el('span', { class: 'stiker__caption-text', id: 'caption-text' }, ''),
          ),
        ),

        // Multiple choice options grid A, B, C, D
        el('div', { class: 'mc-grid', id: 'mc-options' }),

        // Power-ups Bar
        el('div', { class: 'powerbar-modern' },
          el('button', {
            class: 'power-btn',
            type: 'button',
            id: 'hint-btn',
            onClick: useFiftyFifty,
          },
            el('span', { style: { display: 'inline-flex', alignItems: 'center' } }, IconLightbulb({ size: 16 })),
            el('span', {}, '50:50'),
            el('span', { class: 'power-btn__badge', id: 'hint-badge' }, '(2)'),
          ),

          el('button', {
            class: 'power-btn',
            type: 'button',
            id: 'key-btn',
            onClick: useAnswerKey,
          },
            el('span', { style: { display: 'inline-flex', alignItems: 'center' } }, IconKey({ size: 16 })),
            el('span', {}, 'Buka Jawaban'),
            el('span', { class: 'power-btn__badge', id: 'key-badge' },
              `(${getState().profile?.answer_keys ?? 2})`),
          ),
        ),
      ),
    );

    protectImage();
  }

  function protectImage() {
    const wrapper = document.getElementById('stiker');
    if (!wrapper) return;
    wrapper.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ============================================================
  // Question & Options Setup
  // ============================================================

  function nextQuestion() {
    if (run.finished) return;

    const question = run.questions[run.index];
    if (!question) {
      finishStage();
      return;
    }

    run.locked = false;

    // Reset Caption & Image
    resetCaption();

    const img = document.getElementById('stiker-img');
    if (img) {
      img.style.opacity = '0';
      img.src = question.imageUrl || question.blank_image_url || question.fragment_url;
      img.onload = () => { img.style.opacity = '1'; };
      img.onerror = () => {
        if (question.fallback_image_url && img.src !== question.fallback_image_url) {
          img.src = question.fallback_image_url;
        }
      };
    }

    // Render A, B, C, D options
    setupOptions(question);

    // Update Indicators
    updateHeaderIndicators();

    startTimer();
  }

  function setupOptions(question) {
    const host = document.getElementById('mc-options');
    if (!host) return;

    host.innerHTML = '';

    // Options from normaliseQuestion already contain 4 distinct Title Case items
    let opts = Array.isArray(question.options) ? [...question.options] : [];
    const correctClean = formatOptionText(question.correct_answer);

    const hasCorrect = opts.some((o) => formatOptionText(o).toLowerCase() === correctClean.toLowerCase());
    if (!hasCorrect) {
      opts[0] = correctClean;
      opts = shuffle(opts);
    }

    run.currentOptions = opts;

    opts.forEach((text, i) => {
      const letter = OPTION_LETTERS[i] || `${i + 1}`;

      const btn = el('button', {
        class: 'mc-option',
        type: 'button',
        dataset: { value: text, index: String(i) },
        onClick: () => handleChoice(text, btn),
      },
        el('span', { class: 'mc-option__badge' }, letter),
        el('span', { class: 'mc-option__text' }, text),
      );

      host.appendChild(btn);
    });
  }

  // ============================================================
  // Choice Handling
  // ============================================================

  async function handleChoice(selectedAnswer, chosenBtn) {
    if (run.locked || run.finished) return;
    run.locked = true;
    stopTimer();

    const question = run.questions[run.index];
    const correctClean = formatOptionText(question.correct_answer).toLowerCase();
    const isCorrect = formatOptionText(selectedAnswer).toLowerCase() === correctClean;

    const allButtons = document.querySelectorAll('.mc-option');
    allButtons.forEach((b) => (b.disabled = true));

    if (isCorrect) {
      // 1. Jawaban Benar
      chosenBtn.classList.add('mc-option--correct');

      // Teks jawaban muncul di stiker (reveal caption)
      revealCaption(question.correct_answer);

      run.correct += 1;
      run.streak += 1;
      run.maxStreak = Math.max(run.maxStreak, run.streak);
      sfx.correct(run.streak);

      const points = scoreAnswer({
        isCorrect: true,
        streak: run.streak,
        secondsLeft: run.secondsLeft,
        timeLimit: run.timeLimit,
      });
      run.score += points;

      triggerCorrectEffect(chosenBtn, points, run.streak);
      updateHeaderIndicators();

      recordAttempt(question.id, true, 'stage');

      // Advance after reveal animation
      run.advanceId = setTimeout(() => {
        run.advanceId = null;
        run.index += 1;
        if (run.index >= run.questions.length) finishStage();
        else nextQuestion();
      }, REVEAL_HOLD_MS.correct || 1300);

    } else {
      // 2. Jawaban Salah
      chosenBtn.classList.add('mc-option--wrong');

      // Teks TIDAK muncul pada stiker (caption tetap kosong)
      sfx.wrong();
      run.streak = 0;
      updateHeaderIndicators();

      // Deduct 1 life
      const { profile } = getState();
      if (profile) {
        spendLife().then((p) => applyProfile(p)).catch(() => {});
        const count = document.getElementById('game-lives-count');
        if (count && profile.lives) count.textContent = `${Math.max(0, profile.lives - 1)}`;
      }

      // Highlight correct answer so user learns
      allButtons.forEach((b) => {
        if (formatOptionText(b.dataset.value).toLowerCase() === correctClean) {
          b.classList.add('mc-option--correct');
        }
      });

      recordAttempt(question.id, false, 'stage');

      // Advance to next question after brief delay
      run.advanceId = setTimeout(() => {
        run.advanceId = null;
        run.index += 1;
        if (run.index >= run.questions.length) finishStage();
        else nextQuestion();
      }, 1500);
    }
  }

  function handleTimeout() {
    if (run.locked || run.finished) return;
    run.locked = true;
    stopTimer();

    const question = run.questions[run.index];
    const correctClean = formatOptionText(question.correct_answer).toLowerCase();
    sfx.wrong();
    run.streak = 0;
    updateHeaderIndicators();

    // Show correct answer
    const allButtons = document.querySelectorAll('.mc-option');
    allButtons.forEach((b) => {
      b.disabled = true;
      if (formatOptionText(b.dataset.value).toLowerCase() === correctClean) {
        b.classList.add('mc-option--correct');
      }
    });

    toast('Waktu habis!', 'bad', 1200);

    run.advanceId = setTimeout(() => {
      run.advanceId = null;
      run.index += 1;
      if (run.index >= run.questions.length) finishStage();
      else nextQuestion();
    }, 1400);
  }

  // ============================================================
  // Caption Reveal
  // ============================================================

  function revealCaption(text) {
    const wrap = document.getElementById('stiker-caption');
    const txtNode = document.getElementById('caption-text');
    if (!wrap || !txtNode) return;

    txtNode.textContent = text;
    wrap.className = 'stiker__caption';
    void wrap.offsetWidth;
    wrap.classList.add('stiker__caption--revealed');
  }

  function resetCaption() {
    const wrap = document.getElementById('stiker-caption');
    const txtNode = document.getElementById('caption-text');
    if (!wrap || !txtNode) return;

    wrap.className = 'stiker__caption';
    txtNode.textContent = '';
  }

  // ============================================================
  // Power-ups
  // ============================================================

  function useFiftyFifty() {
    if (run.locked || run.finished) return;

    const question = run.questions[run.index];
    const correctClean = formatOptionText(question.correct_answer).toLowerCase();
    const allButtons = Array.from(document.querySelectorAll('.mc-option'));
    const wrongButtons = allButtons.filter(
      (b) => formatOptionText(b.dataset.value).toLowerCase() !== correctClean && !b.classList.contains('mc-option--eliminated'),
    );

    if (wrongButtons.length <= 1) {
      toast('50:50 sudah digunakan.', 'bad');
      return;
    }

    // Eliminate 2 wrong choices
    const toEliminate = shuffle(wrongButtons).slice(0, 2);
    toEliminate.forEach((b) => {
      b.classList.add('mc-option--eliminated');
      b.disabled = true;
    });

    sfx.tap();
    toast('💡 2 pilihan salah telah dieliminasi!', 'ok');

    const badge = document.getElementById('hint-badge');
    if (badge) badge.textContent = '(1)';
  }

  async function useAnswerKey() {
    if (run.locked || run.finished) return;

    const { profile } = getState();
    const keys = profile?.answer_keys ?? 0;

    if (keys <= 0) {
      const buyMore = await confirmDialog({
        title: '🔑 Kunci Habis',
        body: 'Kamu kehabisan kunci jawaban. Dapatkan kunci gratis harian atau beli paket kunci di Toko.',
        confirmLabel: 'Buka Toko',
        cancelLabel: 'Lanjut Main',
      });
      if (buyMore) router.navigate('shop', { tab: 'toko' });
      return;
    }

    run.keysUsed += 1;

    // Deduct key from profile
    const { updateLocalProfile } = await import('../services/fallback-data.js');
    updateLocalProfile({ answer_keys: Math.max(0, keys - 1) });
    const updated = await fetchProfile().catch(() => null);
    if (updated) applyProfile(updated);

    const question = run.questions[run.index];
    const correctClean = formatOptionText(question.correct_answer).toLowerCase();
    const correctBtn = Array.from(document.querySelectorAll('.mc-option')).find(
      (b) => formatOptionText(b.dataset.value).toLowerCase() === correctClean,
    );

    if (correctBtn) {
      sfx.reward();
      toast('🔑 Kunci digunakan! Jawaban terbuka.', 'ok');
      handleChoice(question.correct_answer, correctBtn);
    }
  }

  // ============================================================
  // Desktop Keyboard Listeners
  // ============================================================

  function setupKeyboardListeners() {
    const handler = (e) => {
      if (run.locked || run.finished) return;

      const key = e.key.toUpperCase();
      let index = -1;

      if (['1', 'A'].includes(key)) index = 0;
      else if (['2', 'B'].includes(key)) index = 1;
      else if (['3', 'C'].includes(key)) index = 2;
      else if (['4', 'D'].includes(key)) index = 3;

      if (index >= 0 && run.currentOptions[index]) {
        const btn = document.querySelector(`.mc-option[data-index="${index}"]`);
        if (btn && !btn.disabled) {
          handleChoice(run.currentOptions[index], btn);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }

  // ============================================================
  // Timer & Indicators
  // ============================================================

  function startTimer() {
    stopTimer();
    run.secondsLeft = run.timeLimit;
    run.startedAt = Date.now();

    const bar = document.getElementById('timer-fill');
    const timerVal = document.getElementById('timer-val');
    if (bar) {
      bar.style.width = '100%';
      bar.className = 'progress__fill';
    }
    if (timerVal) {
      timerVal.textContent = `⏱️ ${Math.ceil(run.secondsLeft)}s`;
      timerVal.className = 'game__timer-val';
    }

    run.timerId = setInterval(() => {
      run.secondsLeft -= 0.1;
      const pct = Math.max(0, (run.secondsLeft / run.timeLimit) * 100);
      const secs = Math.max(0, Math.ceil(run.secondsLeft));

      if (timerVal) {
        timerVal.textContent = `⏱️ ${secs}s`;
        if (secs <= 3) {
          timerVal.className = 'game__timer-val game__timer-val--low';
        } else {
          timerVal.className = 'game__timer-val';
        }
      }

      if (bar) {
        bar.style.width = `${pct}%`;
        if (pct < 25) bar.className = 'progress__fill progress__fill--bad';
        else if (pct < 50) bar.className = 'progress__fill progress__fill--warn';
      }

      if (run.secondsLeft <= 0) {
        stopTimer();
        handleTimeout();
      }
    }, 100);
  }

  function stopTimer() {
    if (run.timerId) {
      clearInterval(run.timerId);
      run.timerId = null;
    }
  }

  function updateHeaderIndicators() {
    const step = document.getElementById('q-step-indicator');
    if (step) step.textContent = `${run.index + 1}/${run.questions.length}`;

    const streak = document.getElementById('streak-chip');
    if (streak) streak.textContent = `🔥 ${run.streak}`;
  }

  function showPointsPopup(pts) {
    const node = el('div', { class: 'points-float' }, `+${pts}`);
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 900);
  }

  // ============================================================
  // Stage Completion (Immediate Rich Output Screen)
  // ============================================================

  function finishStage() {
    if (run.finished) return;
    run.finished = true;
    stopTimer();
    clearTimeout(run.advanceId);

    const total = run.questions.length;
    const accuracy = total > 0 ? (run.correct / total) * 100 : 0;
    const stars = computeStarRating(accuracy, run.stage);

    const isWin = stars > 0;
    if (isWin) {
      sfx.win();
      triggerConfetti();
    } else {
      sfx.lose();
    }

    // Persist result asynchronously in background — never block UI output
    recordStageResult({
      stageId: run.stage.id,
      score: run.score,
      correct: run.correct,
      total,
      maxStreak: run.maxStreak,
      stars,
    }).then((recordRes) => {
      if (recordRes?.stageProgress) {
        setState({ stageProgress: recordRes.stageProgress });
      }
      return fetchProfile();
    }).then((updated) => {
      if (updated) applyProfile(updated);
    }).catch((e) => {
      console.warn('[game] background recordStageResult failed:', e);
    });

    // Check interstitial ad if applicable
    try {
      const needAd = registerPlayAndCheckInterstitial(getState().profile);
      if (needAd && ads.isReady()) {
        ads.showInterstitial().catch(() => {});
      }
    } catch {}

    // Render Stage Result View immediately
    renderStageResult(isWin, stars, total, accuracy);
  }

  function renderStageResult(isWin, stars, total, accuracy) {
    const stage = run.stage;
    const nextStageId = stage.id + 1;
    const hasNext = isWin && nextStageId <= 10;
    const coinsEarned = isWin ? 150 : 30;

    mount(
      el('div', { class: 'shell stage-result-screen' },
        el('div', { class: 'stack stack-4', style: { width: '100%', alignItems: 'center' } },
          // Badge Trophy/Heart
          el('div', {
            class: `result-badge result-badge--${isWin ? 'win' : 'lose'}`,
            style: {
              width: '84px',
              height: '84px',
              borderRadius: '24px',
              display: 'grid',
              placeItems: 'center',
              fontSize: '2.5rem',
              margin: '12px auto 0',
              background: isWin ? 'rgba(245, 158, 11, 0.14)' : 'rgba(239, 68, 68, 0.12)',
              border: `2px solid ${isWin ? 'var(--gold-400)' : 'var(--coral-400)'}`,
            },
          }, isWin ? '🏆' : '💔'),

          // Title & Subtitle
          el('div', { style: { textAlign: 'center' } },
            el('h1', { class: 't-display', style: { fontSize: '1.8rem', marginBottom: '6px' } },
              isWin ? `Stage ${stage.id} Berhasil!` : `Stage ${stage.id} Belum Berhasil`),
            el('p', { class: 't-subtitle', style: { maxWidth: '340px', margin: '0 auto' } },
              isWin
                ? 'Luar biasa! Kamu berhasil menebak stiker dan menyelesaikan stage ini.'
                : 'Target bintang belum tercapai. Jangan menyerah, coba lagi yuk!'),
          ),

          // Star Rating with Pop-in Animation
          el('div', {
            style: {
              fontSize: '2.4rem',
              letterSpacing: '8px',
              margin: '4px 0',
              filter: isWin ? 'drop-shadow(0 2px 8px rgba(245,158,11,0.35))' : 'none',
            },
          },
            ...Array.from({ length: 3 }, (_, i) => (i < stars ? '⭐' : '🖤')),
          ),

          // Summary Card
          el('div', { class: 'card stage-result-card', style: { width: '100%', maxWidth: '380px' } },
            el('div', { class: 'row-between' },
              el('span', { class: 't-label' }, 'Jawaban Benar'),
              el('b', { style: { fontSize: '1.05rem' } }, `${run.correct} / ${total}`),
            ),
            el('div', { class: 'row-between' },
              el('span', { class: 't-label' }, 'Akurasi'),
              el('b', { style: { color: isWin ? 'var(--mint-600)' : 'var(--coral-600)', fontSize: '1.05rem' } }, `${Math.round(accuracy)}%`),
            ),
            el('div', { class: 'row-between' },
              el('span', { class: 't-label' }, 'Streak Tertinggi'),
              el('b', {}, `🔥 ${run.maxStreak}`),
            ),
            el('div', { class: 'row-between' },
              el('span', { class: 't-label' }, 'Skor Stage'),
              el('b', { style: { color: 'var(--navy-900)', fontSize: '1.1rem' } }, `+${formatNumber(run.score)}`),
            ),
            el('div', { class: 'row-between' },
              el('span', { class: 't-label' }, 'Koin Diperoleh'),
              el('b', { style: { color: 'var(--gold-600)', fontSize: '1.05rem' } }, `+${coinsEarned} 🪙`),
            ),
          ),

          // Action Buttons matching UIUX.png
          el('div', { class: 'stack stack-2', style: { width: '100%', maxWidth: '380px', marginTop: '4px' } },
            hasNext
              ? Button({
                  label: `Lanjut Stage ${nextStageId} →`,
                  variant: 'dark',
                  size: 'lg',
                  block: true,
                  onClick: () => router.navigate('game', { id: nextStageId }),
                })
              : null,

            Button({
              label: isWin && !hasNext ? 'Daftar Semua Stage' : (isWin ? 'Pilih Stage Lain' : 'Coba Lagi 🔄'),
              variant: isWin && hasNext ? 'soft' : 'dark',
              size: isWin && hasNext ? 'md' : 'lg',
              block: true,
              onClick: () => {
                if (!isWin) {
                  router.navigate('game', { id: stage.id });
                } else {
                  router.navigate('stages');
                }
              },
            }),

            Button({
              label: 'Kembali ke Beranda',
              variant: 'ghost',
              size: 'md',
              block: true,
              onClick: () => router.navigate('home'),
            }),
          ),
        ),
      ),
    );
  }

  async function confirmQuit() {
    const ok = await confirmDialog({
      title: 'Keluar dari Stage?',
      body: 'Progres stage ini akan dibatalkan dan nyawa tidak akan dikembalikan.',
      confirmLabel: 'Ya, Keluar',
      cancelLabel: 'Lanjut Main',
    });

    if (ok) {
      stopTimer();
      clearTimeout(run.advanceId);
      router.navigate('home');
    }
  }

  return () => {
    stopTimer();
    clearTimeout(run.advanceId);
  };
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
