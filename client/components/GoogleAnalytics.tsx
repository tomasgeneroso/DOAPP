import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { configurarAnalitica, trackPageView } from '../utils/analytics';
import { useEleccionDeCookies } from '../utils/consentimientoDeCookies';

const GA_MEASUREMENT_ID = import.meta.env.VITE_GOOGLE_ANALYTICS_ID;

/**
 * Google Analytics component that initializes GA and tracks page views
 * Must be placed inside BrowserRouter
 *
 * Google se carga SOLO si la persona aceptó la analítica en el cartel de cookies (`BannerDeCookies`): sin respuesta, o con un rechazo, no se descarga el
 * script ni se le manda nada a Google. Si aceptó y después cambia de idea («Preferencias de cookies»), se apaga con la bandera que Google define para eso.
 */
export function GoogleAnalytics() {
  const location = useLocation();
  const aceptada = useEleccionDeCookies() === 'aceptado';
  const initialized = useRef(false);
  /** Google ya está configurado: antes de eso una visita se perdería o se mandaría dos veces. */
  const listo = useRef(false);
  /** La pantalla de ahora: la primera visita se cuenta cuando Google termina de cargar, no cuando se montó el componente. */
  const rutaActual = useRef(location.pathname);
  rutaActual.current = location.pathname;

  // Initialize GA on mount - load gtag.js script
  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    // La bandera de Google para no medir: se baja solo con consentimiento y se levanta si lo retira (también si el script ya estaba cargado).
    (window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`] = !aceptada;
    if (!aceptada) return;
    if (initialized.current) return;

    // Configura Google y cuenta la primera visita. Solo viaja la ruta: ver `configurarAnalitica` (sin la query, que trae tokens).
    const configurar = () => {
      configurarAnalitica(GA_MEASUREMENT_ID, rutaActual.current);
      listo.current = true;
    };

    // Check if gtag script already exists
    const existingScript = document.querySelector(`script[src*="googletagmanager.com/gtag"]`);
    if (existingScript) {
      initialized.current = true;
      configurar();
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
      script.onload = configurar;
      document.head.appendChild(script);
    };

    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    if (ric) ric(loadGa, { timeout: 4000 });
    else setTimeout(loadGa, 2500);
    initialized.current = true;
  }, [aceptada]);

  // Track page views on route change
  // Solo la ruta, nunca `location.search`: ahí viajan `?token=` (sesión, recuperar contraseña, verificar correo) y `?email=`.
  useEffect(() => {
    if (GA_MEASUREMENT_ID && aceptada && listo.current) {
      trackPageView(location.pathname, document.title);
    }
  }, [location, aceptada]);

  return null;
}

export default GoogleAnalytics;
