// ui.js — DOM rendering helpers for all screens
import { getLeaderboard } from './supabase.js';

// ===== Utility =====
function $(selector) {
    return document.querySelector(selector);
}

function html(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
        else el.setAttribute(k, v);
    }
    for (const child of children) {
        if (typeof child === 'string') el.appendChild(document.createTextNode(child));
        else if (child) el.appendChild(child);
    }
    return el;
}

function clear() {
    const app = $('#app');
    app.innerHTML = '';
    return app;
}

// ===== Auth Screen =====
export function renderAuth(onSignIn, onSignUp, onGuestPlay) {
    const app = clear();
    let isLogin = true;

    function render() {
        app.innerHTML = '';
        const container = html('div', { class: 'auth-container' },
            html('div', { class: 'home-header' },
                html('h1', { class: 'title-glow' }, 'TeSiMok'),
                html('p', { class: 'subtitle' }, 'Can you guess the image from a tiny fragment?'),
            ),
            html('div', { class: 'card', style: { width: '100%' } },
                ...buildForm(),
            ),
            // Guest play button
            html('div', { class: 'guest-login-divider' }, '— OR —'),
            html('button', {
                class: 'btn btn-ghost',
                onClick: onGuestPlay,
                style: { width: '100%', marginTop: '0.5rem' },
            }, '🕵️ Play as Guest (Score not saved)'),
        );
        app.appendChild(container);
    }

    function buildForm() {
        const errorEl = html('div', { class: 'auth-error', id: 'auth-error', style: { display: 'none' } });

        const fields = [
            ...(!isLogin ? [buildInput('display_name', 'Display Name', 'text', 'Your gamer name')] : []),
            buildInput('email', 'Email', 'email', 'you@example.com'),
            buildInput('password', 'Password', 'password', '••••••••'),
        ];

        const submitBtn = html('button', {
            class: 'btn btn-primary btn-lg',
            type: 'submit',
            id: 'auth-submit',
        }, isLogin ? '🔓 Sign In' : '🚀 Create Account');

        const form = html('form', {
            class: 'auth-form',
            onSubmit: async (e) => {
                e.preventDefault();
                submitBtn.disabled = true;
                submitBtn.textContent = 'Loading...';
                errorEl.style.display = 'none';

                const formData = new FormData(e.target);
                const email = formData.get('email');
                const password = formData.get('password');

                try {
                    if (isLogin) {
                        await onSignIn(email, password);
                    } else {
                        const displayName = formData.get('display_name');
                        await onSignUp(email, password, displayName);
                    }
                } catch (err) {
                    errorEl.textContent = err.message;
                    errorEl.style.display = 'block';
                    submitBtn.disabled = false;
                    submitBtn.textContent = isLogin ? '🔓 Sign In' : '🚀 Create Account';
                }
            },
        }, ...fields, errorEl, submitBtn);

        const toggleText = isLogin
            ? "Don't have an account? "
            : 'Already have an account? ';
        const toggleLabel = isLogin ? 'Sign Up' : 'Sign In';

        const toggle = html('div', { class: 'auth-toggle' },
            document.createTextNode(toggleText),
            html('span', {
                onClick: () => { isLogin = !isLogin; render(); },
            }, toggleLabel),
        );

        return [
            html('h2', { style: { marginBottom: '1rem', fontSize: '1.3rem' } },
                isLogin ? 'Welcome Back' : 'Join TeSiMok'),
            form,
            toggle,
        ];
    }

    function buildInput(name, label, type, placeholder) {
        return html('div', { class: 'input-group' },
            html('label', { for: name }, label),
            (() => {
                const inp = html('input', {
                    class: 'input-field',
                    type,
                    name,
                    id: name,
                    placeholder,
                    required: 'true',
                });
                if (type === 'password') inp.minLength = 6;
                return inp;
            })(),
        );
    }

    render();
}

// ===== Home Screen =====
export function renderHome(user, onPlay, onLogout) {
    const app = clear();

    const isGuest = !user;
    const displayName = isGuest ? 'Guest' : (user.user_metadata?.display_name || user.email?.split('@')[0] || 'Player');

    const container = html('div', { class: 'home-container' },
        // User bar
        html('div', { class: 'user-bar' },
            html('span', { class: 'user-name' }, `👋 Hey, ${displayName}`),
            html('button', { class: 'logout-btn', onClick: onLogout }, isGuest ? 'Sign In' : 'Sign out'),
        ),
        // Header
        html('div', { class: 'home-header' },
            html('h1', { class: 'title-glow' }, 'TeSiMok'),
            html('p', { class: 'subtitle' }, 'Sebuah ujian untuk membuktikan apakah kamu suki atau tidak😂.'),
        ),
        // Actions
        html('div', { class: 'home-actions' },
            html('button', {
                class: 'btn btn-primary btn-lg',
                id: 'start-game-btn',
                onClick: onPlay,
                style: { width: '100%' },
            }, 'Start Game'),
        ),
        // Leaderboard preview (guests don't get saved, so they should be reminded)
        html('div', {
            class: 'card leaderboard-section',
            id: 'home-leaderboard',
            style: { width: '100%' },
        },
            html('h2', {}, '🏆 Leaderboard'),
            isGuest ? html('p', { style: { fontSize: '0.85rem', color: 'var(--text-muted)' } }, 'Guest scores are not ranked.') : '',
            html('div', { class: 'spinner' }),
        ),
    );

    app.appendChild(container);
    loadLeaderboard('home-leaderboard');
}

// ===== Leaderboard Render =====
async function loadLeaderboard(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        const data = await getLeaderboard(10);
        const h2 = container.querySelector('h2');
        container.innerHTML = '';
        if (h2) container.appendChild(h2);

        if (!data || data.length === 0) {
            container.appendChild(html('div', { class: 'lb-empty' }, 'No scores yet. Be the first to play!'));
            return;
        }

        const table = html('table', { class: 'leaderboard-table' },
            html('thead', {},
                html('tr', {},
                    html('th', {}, '#'),
                    html('th', {}, 'Player'),
                    html('th', {}, 'Score'),
                    html('th', {}, 'Accuracy'),
                ),
            ),
            html('tbody', {},
                ...data.map((entry, idx) => {
                    const rank = idx + 1;
                    const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';
                    const medals = ['', '🥇', '🥈', '🥉'];
                    const accuracy = entry.total_count > 0
                        ? Math.round((entry.correct_count / entry.total_count) * 100)
                        : 0;

                    return html('tr', {},
                        html('td', {},
                            html('span', { class: `rank-badge ${rankClass}` },
                                rank <= 3 ? medals[rank] : `${rank}`),
                        ),
                        html('td', { class: 'lb-name' }, entry.player_name),
                        html('td', { class: 'lb-score' }, `${entry.score}`),
                        html('td', {}, `${accuracy}%`),
                    );
                }),
            ),
        );

        container.appendChild(table);
    } catch (err) {
        const h2 = container.querySelector('h2');
        container.innerHTML = '';
        if (h2) container.appendChild(h2);
        container.appendChild(html('div', { class: 'lb-empty' }, 'Could not load leaderboard'));
    }
}

// ===== Game Screen =====
export function renderGameScreen() {
    const app = clear();

    const container = html('div', { class: 'game-container', id: 'game-screen' },
        // HUD
        html('div', { class: 'game-hud' },
            html('div', { class: 'hud-item hud-question' },
                html('span', { class: 'hud-label' }, 'Question'),
                html('span', { class: 'hud-value', id: 'hud-question' }, '1/10'),
            ),
            html('div', { class: 'hud-item hud-score' },
                html('span', { class: 'hud-label' }, 'Score'),
                html('span', { class: 'hud-value', id: 'hud-score' }, '0'),
            ),
            html('div', { class: 'hud-item hud-streak' },
                html('span', { class: 'hud-label' }, 'Streak'),
                html('span', { class: 'hud-value', id: 'hud-streak' }, '0'),
            ),
        ),
        // Timer
        html('div', { class: 'timer-container' },
            html('div', { class: 'timer-bar-bg' },
                html('div', { class: 'timer-bar-fill', id: 'timer-fill' }),
            ),
            html('div', { class: 'timer-text', id: 'timer-text' }, '15s'),
        ),
        // Fragment
        html('div', { class: 'fragment-wrapper', id: 'fragment-wrapper' },
            html('img', { id: 'fragment-img', alt: 'Guess this image', draggable: 'false' }),
        ),
        // Feedback area
        html('div', { id: 'feedback-area', style: { minHeight: '2rem' } }),
        // Options
        html('div', { class: 'options-grid', id: 'options-grid' }),
    );

    app.appendChild(container);

    // Prevent right-click and zoom on fragment
    const wrapper = document.getElementById('fragment-wrapper');
    wrapper.addEventListener('contextmenu', (e) => e.preventDefault());
    wrapper.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    wrapper.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
}

export function updateGameHUD(questionNum, total, score, streak) {
    const qEl = document.getElementById('hud-question');
    const sEl = document.getElementById('hud-score');
    const stEl = document.getElementById('hud-streak');

    if (qEl) qEl.textContent = `${questionNum}/${total}`;
    if (sEl) {
        sEl.textContent = score;
        sEl.classList.remove('shimmer-score');
        void sEl.offsetWidth; // reflow
        sEl.classList.add('shimmer-score');
    }
    if (stEl) {
        stEl.textContent = streak;
        stEl.className = `hud-value${streak >= 3 ? ' on-fire' : ''}`;
    }
}

export function setFragmentImage(url) {
    const img = document.getElementById('fragment-img');
    if (img) img.src = url;
}

export function renderOptions(options, onSelect) {
    const grid = document.getElementById('options-grid');
    if (!grid) return;
    grid.innerHTML = '';

    options.forEach((opt) => {
        const btn = html('button', {
            class: 'option-btn',
            onClick: () => onSelect(opt, btn),
        }, opt);
        grid.appendChild(btn);
    });
}

export function disableOptions() {
    document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);
}

export function highlightOption(btn, isCorrect, correctAnswer) {
    btn.classList.add(isCorrect ? 'correct' : 'wrong');
    if (!isCorrect) {
        document.querySelectorAll('.option-btn').forEach(b => {
            if (b.textContent === correctAnswer) b.classList.add('correct');
        });
    }
}

export function showFeedback(text, type) {
    const area = document.getElementById('feedback-area');
    if (!area) return;
    area.innerHTML = '';
    const fb = html('div', { class: `result-feedback ${type}` }, text);
    area.appendChild(fb);
}

export function clearFeedback() {
    const area = document.getElementById('feedback-area');
    if (area) area.innerHTML = '';
}

// ===== Timer =====
export function updateTimer(fraction, seconds) {
    const fill = document.getElementById('timer-fill');
    const text = document.getElementById('timer-text');

    if (fill) {
        fill.style.width = `${fraction * 100}%`;
        fill.className = 'timer-bar-fill';
        if (fraction <= 0.3) fill.classList.add('low');
        else if (fraction <= 0.5) fill.classList.add('half');
    }

    if (text) {
        text.textContent = `${Math.ceil(seconds)}s`;
        text.className = 'timer-text';
        if (fraction <= 0.3) text.classList.add('low');
    }
}

// ===== Points Popup =====
export function showPointsPopup(points) {
    const popup = html('div', {
        class: `points-popup ${points > 0 ? 'positive' : 'negative'}`,
    }, points > 0 ? `+${points}` : `${points === 0 ? 'MISS!' : points}`);

    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 900);
}

// ===== Result Modal =====
export function renderResultModal(won, score, correctCount, totalCount, onContinue, onRetry, onHome, isGuest = false) {
    // Remove existing modal
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

    let successMessage = 'Selamat! Kamu Bukanlah Suki!';
    if (won && isGuest) {
        successMessage = 'Selamat! Namun, skormu tidak disimpan karena ini adalah mode Guest (Sign In untuk masuk Leaderboard!).';
    }

    const modal = html('div', { class: 'modal-overlay' },
        html('div', { class: 'card modal' },
            html('h2', { class: won ? 'win-title' : 'lose-title' },
                won ? '🎉 You Win!' : '💔 Game Over'),
            html('p', { class: 'subtitle' },
                won
                    ? successMessage
                    : `You needed 6 correct answers but got ${correctCount}. Try again!`),
            html('div', { class: 'modal-stats' },
                html('div', { class: 'modal-stat' },
                    html('div', { class: 'stat-value' }, `${score}`),
                    html('div', { class: 'stat-label' }, 'Final Score'),
                ),
                html('div', { class: 'modal-stat' },
                    html('div', { class: 'stat-value' }, `${correctCount}/${totalCount}`),
                    html('div', { class: 'stat-label' }, 'Correct'),
                ),
                html('div', { class: 'modal-stat' },
                    html('div', { class: 'stat-value' }, `${accuracy}%`),
                    html('div', { class: 'stat-label' }, 'Accuracy'),
                ),
                html('div', { class: 'modal-stat' },
                    html('div', { class: 'stat-value' }, won ? '✅' : '❌'),
                    html('div', { class: 'stat-label' }, 'Result'),
                ),
            ),
            html('div', { class: 'modal-actions' },
                ...(won
                    ? [
                        html('button', { class: 'btn btn-primary btn-lg', onClick: onContinue },
                            '🔥 Play Again to Beat Your Score'),
                    ]
                    : [
                        html('button', { class: 'btn btn-danger btn-lg', onClick: onRetry },
                            '🔄 Try Again'),
                    ]),
                html('button', { class: 'btn btn-ghost', onClick: onHome },
                    '🏠 Back to Home'),
            ),
        ),
    );

    document.body.appendChild(modal);

    // Confetti on win
    if (won) launchConfetti();
}

// ===== Confetti =====
function launchConfetti() {
    const canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#ec4899'];
    const particles = [];

    for (let i = 0; i < 150; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            w: Math.random() * 10 + 5,
            h: Math.random() * 6 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            vy: Math.random() * 3 + 2,
            vx: (Math.random() - 0.5) * 2,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10,
        });
    }

    let frame = 0;
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach((p) => {
            p.y += p.vy;
            p.x += p.vx;
            p.rotation += p.rotationSpeed;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        });

        frame++;
        if (frame < 180) {
            requestAnimationFrame(animate);
        } else {
            canvas.remove();
        }
    }

    animate();
}

// ===== Loading Screen =====
export function renderLoading(message = 'Loading...') {
    const app = clear();
    app.appendChild(
        html('div', { class: 'auth-container' },
            html('h1', { class: 'title-glow' }, 'TeSiMok'),
            html('div', { class: 'spinner' }),
            html('p', { class: 'subtitle' }, message),
        ),
    );
}
