// audio.js - Synthesizes simple sound effects using Web Audio API

const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

export function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
    // Resume context if required by browser policies (e.g. after user gesture)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

export function playCorrectSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1); // A5

    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

export function playWrongSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

export function playWinSound() {
    if (!audioCtx) return;
    // Play an arpeggio (A major chord)
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, index) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;

        gainNode.gain.setValueAtTime(0, audioCtx.currentTime + index * 0.1);
        gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + index * 0.1 + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + index * 0.1 + 0.4);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(audioCtx.currentTime + index * 0.1);
        osc.stop(audioCtx.currentTime + index * 0.1 + 0.5);
    });
}

export function playLoseSound() {
    if (!audioCtx) return;
    // Play a descending minor sequence
    const notes = [440, 415.30, 392.00, 349.23];
    notes.forEach((freq, index) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;

        gainNode.gain.setValueAtTime(0, audioCtx.currentTime + index * 0.2);
        gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + index * 0.2 + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + index * 0.2 + 0.4);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(audioCtx.currentTime + index * 0.2);
        osc.stop(audioCtx.currentTime + index * 0.2 + 0.5);
    });
}
