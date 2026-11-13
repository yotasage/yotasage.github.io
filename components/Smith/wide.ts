// Wide equations on narrow screens (notes-M5.3.md, Fixes): an equation box wider than the space it has scrolls sideways
// inside itself (overflow-x: auto in its CSS), never clipped; while it does, it takes a Tab stop so that the keyboard
// can scroll it too, and loses it when it fits again. Used by the derivation dialog's lines, the Equations panel's rows
// and the theory's equations. Each check reads the layout once per box, so it runs after a render or a change of width,
// never in a drag's frames.

/** Gives the boxes under `root` that match `selector` a Tab stop while they are wider than they show. */
export function markWide(root: ParentNode, selector: string): void {
  for (const el of root.querySelectorAll<HTMLElement>(selector)) {
    const wide = el.scrollWidth > el.clientWidth + 1;
    if (wide === (el.getAttribute('data-wide') !== null)) continue;
    if (wide) {
      el.setAttribute('data-wide', '');
      el.tabIndex = 0;
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', 'Wide equation, scrolls sideways');
    } else {
      el.removeAttribute('data-wide');
      el.removeAttribute('tabindex');
      el.removeAttribute('role');
      el.removeAttribute('aria-label');
    }
  }
}

/** Marks the wide boxes again whenever `root` changes width; returns the clean-up. */
export function watchWide(root: HTMLElement, selector: string): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {};
  let w = root.clientWidth;
  const ro = new ResizeObserver(() => {
    if (root.clientWidth === w) return;
    w = root.clientWidth;
    markWide(root, selector);
  });
  ro.observe(root);
  return () => ro.disconnect();
}
