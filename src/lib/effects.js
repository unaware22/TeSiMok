/**
 * lib/effects.js
 * Visual effects for correct answers, lightning bursts, and animated score popups.
 */

/**
 * Trigger an electric lightning burst and points popup on correct guess.
 * @param {HTMLElement} targetEl - The element that was clicked or the card.
 * @param {number} points - Number of points earned (e.g. 120).
 * @param {number} streak - Current correct streak (e.g. 1, 2, 3...).
 */
export function triggerCorrectEffect(targetEl, points = 100, streak = 1) {
  if (!targetEl) return;

  const rect = targetEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  // 1. Screen subtle electric shock glow
  triggerScreenShock();

  // 2. Button electric shockwave halo
  targetEl.classList.add('fx-target-lightning');
  setTimeout(() => {
    targetEl.classList.remove('fx-target-lightning');
  }, 700);

  // 3. Electric spark & bolt particles bursting outwards
  createLightningSparks(centerX, centerY, streak);

  // 4. Floating electric points popup
  createPointsPopup(centerX, rect.top, points, streak);
}

/**
 * Flash subtle electric peripheral aura on the screen edges.
 */
function triggerScreenShock() {
  const app = document.getElementById('app') || document.body;
  app.classList.remove('fx-screen-shock');
  void app.offsetWidth; // force reflow
  app.classList.add('fx-screen-shock');
  setTimeout(() => {
    app.classList.remove('fx-screen-shock');
  }, 400);
}

/**
 * Create lightning sparks & electric particle bursts.
 */
function createLightningSparks(x, y, streak = 1) {
  const count = Math.min(16, 8 + streak * 2);
  const container = document.createElement('div');
  container.className = 'fx-sparks-container';
  container.style.left = `${x}px`;
  container.style.top = `${y}px`;

  const sparkIcons = ['⚡', '✦', '✧', '⚡', '⚡', '✺'];

  for (let i = 0; i < count; i++) {
    const spark = document.createElement('span');
    spark.className = 'fx-spark-particle';

    const icon = sparkIcons[i % sparkIcons.length];
    spark.textContent = icon;

    // Calculate angle & distance
    const angle = (i / count) * 2 * Math.PI + (Math.random() - 0.5) * 0.5;
    const distance = 40 + Math.random() * 65;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const rot = Math.random() * 360;
    const scale = 0.7 + Math.random() * 0.7;

    spark.style.setProperty('--dx', `${dx}px`);
    spark.style.setProperty('--dy', `${dy}px`);
    spark.style.setProperty('--rot', `${rot}deg`);
    spark.style.setProperty('--scale', `${scale}`);
    spark.style.animationDelay = `${Math.random() * 60}ms`;

    container.appendChild(spark);
  }

  document.body.appendChild(container);
  setTimeout(() => {
    container.remove();
  }, 900);
}

/**
 * Create floating electric point popup (+120 ⚡).
 */
function createPointsPopup(x, y, points, streak = 1) {
  const popup = document.createElement('div');
  popup.className = 'fx-point-popup';
  popup.style.left = `${x}px`;
  popup.style.top = `${Math.max(40, y - 24)}px`;

  const ptsText = points > 0 ? `+${points} Poin` : 'BENAR!';

  popup.innerHTML = `
    <div class="fx-point-popup__core">
      <span class="fx-point-popup__bolt">⚡</span>
      <span class="fx-point-popup__val">${ptsText}</span>
    </div>
    ${streak > 1 ? `<div class="fx-point-popup__streak">COMBO x${streak} 🔥</div>` : ''}
  `;

  document.body.appendChild(popup);

  setTimeout(() => {
    popup.remove();
  }, 1000);
}
