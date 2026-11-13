import { useRef, type RefObject } from 'react';

/** For a page whose buttons open a form or question: `remember` notes the button that has
    focus as it opens, and `restore` puts focus back on it once it closes, or on `fallback`
    when that button's row is gone. The form is removed before it closes, so the browser
    can't hand focus back by itself. */
export function useReturnFocus(fallback: RefObject<HTMLElement | null>) {
  const opener = useRef<HTMLElement | null>(null);
  return {
    remember() {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    },
    restore() {
      requestAnimationFrame(() => {
        const button = opener.current;
        (button?.isConnected ? button : fallback.current)?.focus();
      });
    },
  };
}
