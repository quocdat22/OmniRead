import { useEffect, useRef, useState } from "react";

interface ScrollVisibilityOptions {
  threshold?: number;
  topOffset?: number;
  freeze?: boolean;
}

/**
 * Hook to auto-hide a toolbar on scroll down and show on scroll up.
 *
 * @param options.threshold Minimum scroll delta (px) required to trigger state change (prevents jitter).
 * @param options.topOffset Scroll position (px) below which the toolbar is always visible.
 * @param options.freeze When true (e.g. popover/dialog is open), toolbar remains visible.
 */
export function useScrollVisibility(options: ScrollVisibilityOptions = {}) {
  const { threshold = 10, topOffset = 60, freeze = false } = options;
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;

          if (freeze) {
            setIsVisible(true);
            lastScrollY.current = currentScrollY;
            ticking = false;
            return;
          }

          if (currentScrollY <= topOffset) {
            setIsVisible(true);
          } else {
            const diff = currentScrollY - lastScrollY.current;
            if (diff > threshold) {
              // Scrolling down -> hide toolbar
              setIsVisible(false);
            } else if (diff < -threshold) {
              // Scrolling up -> show toolbar
              setIsVisible(true);
            }
          }

          lastScrollY.current = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [threshold, topOffset, freeze]);

  return isVisible;
}
