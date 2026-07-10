/**
 * Confetti celebration effect for major success moments
 * Usage: import { triggerConfetti } from './utils/confetti'
 *        triggerConfetti()
 */

export function triggerConfetti() {
  const duration = 3000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };

  function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  const colors = ['#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca'];
  
  const interval = setInterval(function() {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);
    
    // Create confetti particles
    for (let i = 0; i < particleCount; i++) {
      createConfettiParticle(
        randomInRange(0.1, 0.3),
        colors[Math.floor(Math.random() * colors.length)],
        randomInRange(-100, 100),
        randomInRange(-100, 100)
      );
    }
  }, 250);
}

function createConfettiParticle(scale, color, x, y) {
  const particle = document.createElement('div');
  particle.style.cssText = `
    position: fixed;
    width: 10px;
    height: 10px;
    background: ${color};
    left: 50%;
    top: 50%;
    opacity: 1;
    transform: translate(-50%, -50%) scale(${scale});
    border-radius: 2px;
    pointer-events: none;
    z-index: 10000;
    animation: confetti-fall 3s ease-out forwards;
  `;
  
  particle.style.setProperty('--x', `${x}vw`);
  particle.style.setProperty('--y', `${y}vh`);
  
  document.body.appendChild(particle);
  
  setTimeout(() => {
    particle.remove();
  }, 3000);
}

// Add CSS animation if not already present
if (!document.getElementById('confetti-styles')) {
  const style = document.createElement('style');
  style.id = 'confetti-styles';
  style.textContent = `
    @keyframes confetti-fall {
      0% {
        transform: translate(-50%, -50%) scale(1) rotate(0deg);
        opacity: 1;
      }
      100% {
        transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(0) rotate(720deg);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}
