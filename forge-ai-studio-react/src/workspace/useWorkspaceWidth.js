import { useEffect, useRef, useState } from 'react';

/**
 * Observes the width of the element that actually contains the IDE.
 *
 * The browser window width is the wrong signal: a desktop browser at 1440px
 * can leave a sidebar-wrapped workspace with only 850px of usable space, and
 * that workspace needs a narrower layout than the window suggests.
 *
 * @param {React.RefObject<HTMLElement>} target
 * @returns {number} the observed width in CSS pixels
 */
export function useWorkspaceWidth(target) {
  const [width, setWidth] = useState(0);
  const observerRef = useRef(null);

  useEffect(() => {
    const element = target?.current;
    if (!element) return undefined;

    const update = () => {
      const next = element.getBoundingClientRect().width;
      setWidth((current) => (Math.abs(current - next) > 0.5 ? next : current));
    };

    update();

    // ResizeObserver is not available everywhere, so the window resize event
    // is a fallback rather than a replacement.
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [target]);

  return width;
}
