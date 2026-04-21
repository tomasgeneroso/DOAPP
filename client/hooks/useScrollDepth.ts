import { useEffect, useRef } from 'react';
import analytics from '../utils/analytics';

const MILESTONES = [25, 50, 75, 100] as const;

/**
 * Tracks scroll depth milestones (25%, 50%, 75%, 100%) and reports to GA4.
 * Fires each milestone only once per page mount.
 */
export function useScrollDepth() {
  const fired = useRef(new Set<number>());

  useEffect(() => {
    fired.current.clear();

    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;

      const pct = Math.round((scrollTop / docHeight) * 100);

      for (const milestone of MILESTONES) {
        if (!fired.current.has(milestone) && pct >= milestone) {
          fired.current.add(milestone);
          analytics.scrollDepth(milestone);
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
}
