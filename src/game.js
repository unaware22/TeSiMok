import {
    startGame as apiStartGame,
    submitAnswer as apiSubmitAnswer,
} from './supabase.js';
import {
    initAudio,
    playCorrectSound,
    playWrongSound,
    playWinSound,
    playLoseSound,
} from './audio.js';
import {
    renderGameScreen,
    updateGameHUD,
    setFragmentImage,
    renderOptions,
    disableOptions,
    highlightOption,
    showFeedback,
    clearFeedback,
    updateTimer,
    showPointsPopup,
    renderResultModal,
    renderLoading,
} from './ui.js';

const TIME_LIMIT = 15; // seconds per question
const WIN_THRESHOLD = 6;

let gameState = null;
let timerInterval = null;
let timerStart = null;

export async function startNewGame(onHome) {
    initAudio(); // Initialize audio context on user interaction
    renderLoading('Starting game...');

    try {
        const result = await apiStartGame();

        gameState = {
            sessionId: result.session_id,
            totalQuestions: result.total_questions,
            currentQuestion: result.question,
            score: 0,
            streak: 0,
            correctCount: 0,
            totalAnswered: 0,
            onHome,
        };

        renderGameScreen();
        showQuestion();
    } catch (err) {
        console.error('Failed to start game:', err);
        const msg = err.message || 'Unknown error';
        renderLoading(`Failed to start game: ${msg}`);
        setTimeout(() => onHome(), 4000);
    }
}

function showQuestion() {
    if (!gameState || !gameState.currentQuestion) return;

    const q = gameState.currentQuestion;

    // Update HUD
    updateGameHUD(
        q.question_number,
        gameState.totalQuestions,
        gameState.score,
        gameState.streak,
    );

    // Set fragment image
    setFragmentImage(q.fragment_url);

    // Clear feedback
    clearFeedback();

    // Render answer options
    renderOptions(q.options, handleAnswer);

    // Start timer
    startTimer();
}

function startTimer() {
    stopTimer();

    timerStart = Date.now();
    const endTime = timerStart + TIME_LIMIT * 1000;

    function tick() {
        const now = Date.now();
        const remaining = Math.max(0, endTime - now);
        const fraction = remaining / (TIME_LIMIT * 1000);
        const seconds = remaining / 1000;

        updateTimer(fraction, seconds);

        if (remaining <= 0) {
            stopTimer();
            handleTimeout();
        }
    }

    tick();
    timerInterval = setInterval(tick, 50);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

async function handleAnswer(answer, btn) {
    stopTimer();
    disableOptions();

    try {
        const result = await apiSubmitAnswer(gameState.sessionId, answer);

        // Update game state from server
        gameState.score = result.score;
        gameState.streak = result.streak;
        gameState.correctCount = result.correct_count;
        gameState.totalAnswered = result.total_answered;

        // Visual feedback
        highlightOption(btn, result.is_correct, result.correct_answer);

        if (result.is_correct) {
            playCorrectSound();
            showFeedback(`✅ Correct! +${result.points_earned} points`, 'correct');
            showPointsPopup(result.points_earned);
        } else if (result.timed_out) {
            playWrongSound();
            showFeedback(`⏰ Time's up! The answer was: ${result.correct_answer}`, 'timeout');
            showPointsPopup(0);
        } else {
            playWrongSound();
            showFeedback(`❌ Wrong! The answer was: ${result.correct_answer}`, 'wrong');
            showPointsPopup(0);
        }

        // Update HUD
        updateGameHUD(
            gameState.currentQuestion.question_number,
            gameState.totalQuestions,
            gameState.score,
            gameState.streak,
        );

        // Wait, then show next question or result
        setTimeout(async () => {
            if (result.is_last_question) {
                const { data: { user } } = await import('./supabase.js').then(m => m.supabase.auth.getUser());
                showGameResult(result.won, !user);
            } else {
                gameState.currentQuestion = result.next_question;
                showQuestion();
            }
        }, 1500);
    } catch (err) {
        console.error('Failed to submit answer:', err);
        showFeedback('⚠️ Connection error. Please try again.', 'wrong');
    }
}

async function handleTimeout() {
    disableOptions();

    try {
        // Submit empty/null answer for timeout
        const result = await apiSubmitAnswer(gameState.sessionId, '__TIMEOUT__');

        gameState.score = result.score;
        gameState.streak = result.streak;
        gameState.correctCount = result.correct_count;
        gameState.totalAnswered = result.total_answered;

        playWrongSound();
        showFeedback(`⏰ Time's up! The answer was: ${result.correct_answer}`, 'timeout');
        showPointsPopup(0);

        updateGameHUD(
            gameState.currentQuestion.question_number,
            gameState.totalQuestions,
            gameState.score,
            gameState.streak,
        );

        setTimeout(async () => {
            if (result.is_last_question) {
                const { data: { user } } = await import('./supabase.js').then(m => m.supabase.auth.getUser());
                showGameResult(result.won, !user);
            } else {
                gameState.currentQuestion = result.next_question;
                showQuestion();
            }
        }, 1500);
    } catch (err) {
        console.error('Timeout submit failed:', err);
    }
}

function showGameResult(won, isGuest) {
    stopTimer();

    if (won) {
        playWinSound();
    } else {
        playLoseSound();
    }

    renderResultModal(
        won,
        gameState.score,
        gameState.correctCount,
        gameState.totalAnswered,
        // Continue (play again after win)
        () => {
            const overlay = document.querySelector('.modal-overlay');
            if (overlay) overlay.remove();
            const confetti = document.getElementById('confetti-canvas');
            if (confetti) confetti.remove();
            startNewGame(gameState.onHome);
        },
        // Retry (after loss)
        () => {
            const overlay = document.querySelector('.modal-overlay');
            if (overlay) overlay.remove();
            startNewGame(gameState.onHome);
        },
        // Home
        () => {
            const overlay = document.querySelector('.modal-overlay');
            if (overlay) overlay.remove();
            const confetti = document.getElementById('confetti-canvas');
            if (confetti) confetti.remove();
            stopTimer();
            const onHomeFn = gameState?.onHome;
            gameState = null;
            if (onHomeFn) onHomeFn();
            else window.location.reload();
        },
        isGuest
    );
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopTimer();
});
