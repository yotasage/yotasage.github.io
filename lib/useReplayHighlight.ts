import React from 'react';

/**
 * Elements that a link jumps to (#rule-1, #note-3, #ref-AD, …) are highlighted with a CSS animation on :target.
 * Clicking a link to the element that is already the target does not start that animation again, so this
 * restarts it.
 */
export default function useReplayHighlight() {
  React.useEffect(() => {
    function onClick(event: MouseEvent) {
      const link = (event.target as Element).closest?.('a[href^="#"]');
      const hash = link?.getAttribute('href');
      if (!hash || hash !== window.location.hash) return;
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!target) return;
      target.style.animation = 'none';
      void target.offsetWidth; // makes the browser apply "none" before the animation is put back
      target.style.animation = '';
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
}
