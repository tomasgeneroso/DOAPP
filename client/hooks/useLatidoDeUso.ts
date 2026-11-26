import { useEffect } from 'react';
import { SEGUNDOS_ENTRE_LATIDOS } from '../../shared/metricas/definiciones';

/** Sin tocar nada durante este tiempo, una pestaña a la vista deja de contar como uso (una pantalla olvidada no infla la duración). */
const MINUTOS_SIN_TOCAR = 5;

/**
 * Registro de uso propio: avisa «estoy usando DOAPP» una vez por minuto, solo con sesión, con la pestaña a la vista y si la persona tocó algo hace poco.
 * No manda qué pantalla es ni nada de lo escrito: solo la plataforma. No usa a terceros.
 */
export function useLatidoDeUso(conSesion: boolean): void {
  useEffect(() => {
    if (!conSesion) return;
    let ultimoToque = Date.now();
    let ultimoEnvio = 0;
    const latir = () => {
      const ahora = Date.now();
      if (document.visibilityState !== 'visible' || ahora - ultimoToque > MINUTOS_SIN_TOCAR * 60_000) return;
      if (ahora - ultimoEnvio < (SEGUNDOS_ENTRE_LATIDOS - 5) * 1000) return;
      ultimoEnvio = ahora;
      void fetch('/api/actividad/latido', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ plataforma: 'web' }),
      }).catch(() => undefined);
    };
    const tocar = () => { ultimoToque = Date.now(); };
    const alVolver = () => { if (document.visibilityState === 'visible') { tocar(); latir(); } };
    const toques = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    toques.forEach((e) => window.addEventListener(e, tocar, { passive: true }));
    document.addEventListener('visibilitychange', alVolver);
    latir();
    const reloj = window.setInterval(latir, SEGUNDOS_ENTRE_LATIDOS * 1000);
    return () => {
      window.clearInterval(reloj);
      toques.forEach((e) => window.removeEventListener(e, tocar));
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [conSesion]);
}
