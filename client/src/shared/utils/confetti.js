// Inject animation CSS once per page session
if (!document.getElementById('confetti-styles')) {
  const style = document.createElement('style');
  style.id = 'confetti-styles';
  style.textContent = `
    @keyframes confetti-fall {
      0%   { transform: translate(-50%, -50%) scale(1) rotate(0deg);   opacity: 1; }
      100% { transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(0) rotate(720deg); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

const COLORS = ['#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca', '#ffffff'];

function spawnParticle(color) {
  const el = document.createElement('div');
  const x = randomInRange(-80, 80);
  const y = randomInRange(-80, 80);
  el.style.cssText = `
    position:fixed; width:8px; height:8px;
    background:${color}; left:50%; top:50%;
    border-radius:2px; pointer-events:none; z-index:10000;
    animation:confetti-fall 2.5s ease-out forwards;
  `;
  el.style.setProperty('--x', `${x}vw`);
  el.style.setProperty('--y', `${y}vh`);
  document.body.appendChild(el);
  // Remove element after animation to avoid DOM accumulation
  setTimeout(() => el.remove(), 2600);
}

/**
 * Lightweight confetti burst — 3 s duration, max ~120 particles total.
 * Safe to call multiple times; each call is independent.
 */
export function triggerConfetti() {
  const endAt = Date.now() + 3000;
  // Reduced from 50 to 12 particles per tick — avoids layout thrash
  const PARTICLES_PER_TICK = 12;

  const interval = setInterval(() => {
    const remaining = endAt - Date.now();
    if (remaining <= 0) { clearInterval(interval); return; }

    const count = Math.ceil(PARTICLES_PER_TICK * (remaining / 3000));
    for (let i = 0; i < count; i++) {
      spawnParticle(COLORS[Math.floor(Math.random() * COLORS.length)]);
    }
  }, 250);
}
