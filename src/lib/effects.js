/**
 * lib/effects.js
 * Clean, tactile micro-interactions and celebratory victory confetti.
 * Designed to feel premium, responsive, and delighting without tacky AI-slop glows.
 */

/**
 * Trigger subtle floating score feedback on correct guess.
 * @param {HTMLElement} targetEl - The element that was clicked.
 * @param {number} points - Number of points earned (e.g. 100).
 * @param {number} streak - Current correct streak (e.g. 1, 2, 3...).
 */
export function triggerCorrectEffect(targetEl, points = 100, streak = 1) {
  if (!targetEl || typeof targetEl.getBoundingClientRect !== 'function') return;

  const rect = targetEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const topY = rect.top;

  // 1. Tactile scale bounce on clicked button
  targetEl.classList.remove('btn-pop-success');
  void targetEl.offsetWidth;
  targetEl.classList.add('btn-pop-success');
  setTimeout(() => targetEl.classList.remove('btn-pop-success'), 400);

  // 2. Clean floating point indicator
  createPointsPopup(centerX, topY, points, streak);
}

/**
 * Create floating points indicator (+100 Poin) that floats upward and fades smoothly.
 */
function createPointsPopup(x, y, points, streak = 1) {
  const popup = document.createElement('div');
  popup.className = 'fx-point-popup';
  popup.style.left = `${x}px`;
  popup.style.top = `${Math.max(30, y - 18)}px`;

  const ptsText = points > 0 ? `+${points}` : 'Benar!';

  popup.innerHTML = `
    <div class="fx-point-popup__core">
      <span class="fx-point-popup__val">${ptsText}</span>
      ${streak > 1 ? `<span class="fx-point-popup__streak">x${streak}</span>` : ''}
    </div>
  `;

  document.body.appendChild(popup);

  setTimeout(() => {
    popup.remove();
  }, 950);
}

/**
 * Trigger celebratory victory confetti for stage clear.
 */
export function triggerConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-wrap';
  container.setAttribute('aria-hidden', 'true');

  const colors = ['#F59E0B', '#10B981', '#38BDF8', '#EC4899', '#8B5CF6', '#FACC15'];
  const count = 36;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';

    const color = colors[i % colors.length];
    const left = Math.random() * 100;
    const size = 6 + Math.random() * 8;
    const dur = 1.6 + Math.random() * 1.2;
    const delay = Math.random() * 0.4;
    const rot = Math.random() * 360;

    piece.style.cssText = `
      position: absolute;
      left: ${left}%;
      top: -12px;
      width: ${size}px;
      height: ${size * (Math.random() > 0.4 ? 1.6 : 1)}px;
      background: ${color};
      border-radius: ${Math.random() > 0.5 ? '2px' : '50%'};
      transform: rotate(${rot}deg);
      animation: confetti-fall ${dur}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}s forwards;
      opacity: 0.9;
    `;

    container.appendChild(piece);
  }

  document.body.appendChild(container);
  setTimeout(() => container.remove(), 3200);
}
