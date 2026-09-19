'use strict';

// Page chrome around the game: drifting bubbles and the fullscreen button.

(function decorate() {
  const holder = document.getElementById('bubbles');
  if (holder && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (let index = 0; index < 18; index++) {
      const size = 6 + Math.random() * 20;
      const bubble = document.createElement('span');
      bubble.className = 'bubble';
      bubble.style.width = bubble.style.height = `${size}px`;
      bubble.style.left = `${Math.random() * 100}%`;
      bubble.style.setProperty('--drift', `${(Math.random() - 0.5) * 80}px`);
      bubble.style.animationDuration = `${14 + Math.random() * 18}s`;
      bubble.style.animationDelay = `${-Math.random() * 30}s`;
      holder.appendChild(bubble);
    }
  }

  const play = document.getElementById('play');
  const button = document.getElementById('fullscreen');
  if (!button || !play.requestFullscreen) {
    if (button) button.hidden = true;
    return;
  }
  button.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else play.requestFullscreen().catch(() => {});
    button.blur();
  });
})();
