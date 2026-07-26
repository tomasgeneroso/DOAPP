import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../utils/analytics';

const GA_MEASUREMENT_ID = import.meta.env.VITE_GOOGLE_ANALYTICS_ID;

/**
 * Google Analytics component that initializes GA and tracks page views
 * Must be placed inside BrowserRouter
 */
export function GoogleAnalytics() {
  const location = useLocation();
  const initialized = useRef(false);

  // Initialize GA on mount - load gtag.js script
  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    if (initialized.current) return;

    // Check if gtag script already exists
    const existingScript = document.querySelector(`script[src*="googletagmanager.com/gtag"]`);
    if (existingScript) {
      initialized.current = true;
      if (window.gtag) {
        window.gtag('config', GA_MEASUREMENT_ID, {
          page_path: window.location.pathname,
          send_page_view: true,
        });
      }
      return;
    }

    // Load Google Analytics when the browser is idle, so the ~65 KB gtag.js
    // never competes with the critical first paint (helps LCP/TBT). The first
    // page_view still fires as soon as the script finishes loading.
    const loadGa = () => {
      if (document.querySelector(`script[src*="googletagmanager.com/gtag"]`)) return;
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
      script.onload = () => {
        if (window.gtag) {
          window.gtag('config', GA_MEASUREMENT_ID, {
            page_path: window.location.pathname,
            send_page_view: true,
          });
        }
      };
      document.head.appendChild(script);
    };

    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    if (ric) ric(loadGa, { timeout: 4000 });
    else setTimeout(loadGa, 2500);
    initialized.current = true;
  }, []);

  // Track page views on route change
  useEffect(() => {
    if (GA_MEASUREMENT_ID && window.gtag) {
      trackPageView(location.pathname + location.search, document.title);
    }
  }, [location]);

  return null;
}

export default GoogleAnalytics;
