/**
 * lib/audio.js
 * Web Audio sound effects — synthesized, so there are no asset downloads.
 * All effects are short and respect the player's sound preference.
 */

let ctx = null;
let enabled = true;

const AudioCtor = window.AudioContext || window.webkitAudioContext;

/** Lazily create/resume the context. Must be called from a user gesture. */
export function initAudio() {
  if (!AudioCtor) return;
  if (!ctx) ctx = new AudioCtor();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function setSoundEnabled(value) {
  enabled = Boolean(value);
}

export function isSoundEnabled() {
  return enabled;
}

/** Play a single oscillator tone. */
function tone({ freq, to, type = 'sine', duration = 0.25, volume = 0.3, delay = 0 }) {
  if (!enabled || !ctx) return;

  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + duration * 0.7);

  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Play a sequence of notes. */
function sequence(notes, { type = 'triangle', volume = 0.22, step = 0.1 } = {}) {
  notes.forEach((freq, i) => {
    tone({ freq, type, volume, duration: step * 3, delay: i * step });
  });
}

// ============================================================
// Named effects
// ============================================================

export const sfx = {
  /** Correct answer — rising, level-based pitch. */
  correct(streak = 0) {
    const base = 560 + Math.min(streak, 8) * 40;
    tone({ freq: base, to: base * 1.5, type: 'sine', duration: 0.18, volume: 0.28 });
  },

  /** Wrong answer — short descending buzz. */
  wrong() {
    tone({ freq: 190, to: 90, type: 'sawtooth', duration: 0.3, volume: 0.16 });
  },

  /** Timeout — soft double beep. */
  timeout() {
    tone({ freq: 320, type: 'square', duration: 0.14, volume: 0.12 });
    tone({ freq: 240, type: 'square', duration: 0.2, volume: 0.12, delay: 0.16 });
  },

  /** Stage cleared. */
  win() {
    sequence([523.25, 659.25, 783.99, 1046.5], { step: 0.1, volume: 0.24 });
  },

  /** Stage failed. */
  lose() {
    sequence([392, 349.23, 311.13, 261.63], { type: 'sawtooth', step: 0.16, volume: 0.15 });
  },

  /** Answer key consumed. */
  unlock() {
    tone({ freq: 880, to: 1320, type: 'sine', duration: 0.16, volume: 0.2 });
  },

  /** UI tap. */
  tap() {
    tone({ freq: 520, type: 'sine', duration: 0.05, volume: 0.1 });
  },

  /** Coin / purchase. */
  coin() {
    tone({ freq: 988, type: 'square', duration: 0.08, volume: 0.14 });
    tone({ freq: 1319, type: 'square', duration: 0.18, volume: 0.14, delay: 0.08 });
  },

  /** Reward claimed. */
  reward() {
    sequence([659.25, 783.99, 987.77, 1318.51], { step: 0.085, volume: 0.2 });
  },

  /** Countdown tick (battle). */
  tick() {
    tone({ freq: 700, type: 'square', duration: 0.06, volume: 0.12 });
  },

  /** Battle start. */
  battleStart() {
    sequence([440, 554.37, 659.25], { step: 0.12, volume: 0.22 });
  },

  /** Battle finished. */
  battleEnd() {
    sequence([880, 1108.73, 1318.51, 1760], { step: 0.11, volume: 0.2 });
  },

  /** Incoming taunt. */
  taunt() {
    tone({ freq: 400, to: 800, type: 'triangle', duration: 0.2, volume: 0.18 });
  },

  /** Life recharged. */
  lifeUp() {
    tone({ freq: 660, to: 990, type: 'sine', duration: 0.35, volume: 0.2 });
  },

  /** Generic error. */
  error() {
    tone({ freq: 150, to: 110, type: 'sawtooth', duration: 0.25, volume: 0.14 });
  },
};

export default sfx;
