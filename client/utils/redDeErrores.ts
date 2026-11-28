/**
 * La red de errores de la web: mira TODAS las llamadas a la API (fetch y axios) y, si una acción falla y la pantalla no lo muestra, lo muestra ella. Así una pantalla
 * que se olvida del error (o una nueva) igual avisa. También atrapa los errores que nadie agarró en el navegador.
 *
 * Para no repetir un aviso, espera un momento y se fija si la pantalla ya lo dijo: apareció el texto, un cartel de error o un `alert`.
 */
import axios from 'axios';
import { ALGO_FALLO, avisoPorLaRespuesta } from '../../shared/errores/redDeErrores';

export const EVENTO_ERROR_SIN_MOSTRAR = 'doapp:error-sin-mostrar';
const ESPERA_A_LA_PANTALLA_MS = 900;
const SIEMPRE_ES_UN_CARTEL = '[role="alert"], [data-error]';
const TEXTO_EN_ROJO = '[class*="text-red"], [class*="text-danger"]';
/** Un mensaje de error es una frase; lo más corto (un globito con un número, un ícono) no lo es. */
const LARGO_DE_UN_MENSAJE = 15;

/**
 * ¿Esto que apareció es un cartel de error? Un fondo o un borde rojo no alcanzan: el globito de las notificaciones aparecía mientras fallaba la acción y la red se
 * quedaba callada (2026-11-28). Cuenta lo marcado como alerta, o una frase en rojo que no sea un botón, un enlace ni parte del encabezado.
 */
function esUnCartelDeError(e: Element): boolean {
  if (e.matches(SIEMPRE_ES_UN_CARTEL)) return true;
  if (!e.matches(TEXTO_EN_ROJO) || e.closest('button, a, nav, header')) return false;
  return (e.textContent || '').trim().length >= LARGO_DE_UN_MENSAJE;
}

let ultimoAviso = 0;
let ultimoCartel = 0;

const esDeLaApi = (url: string): boolean => {
  try {
    const u = new URL(url, window.location.origin);
    const base = String((import.meta as any).env?.VITE_API_URL || '');
    const delSitio = u.origin === window.location.origin || (base.startsWith('http') && url.startsWith(base));
    return delSitio && u.pathname.startsWith('/api/');
  } catch {
    return false;
  }
};

const laPantallaYaLoDijo = (mensaje: string, desde: number): boolean =>
  ultimoAviso >= desde || ultimoCartel >= desde || Boolean(document.body?.innerText?.includes(mensaje.slice(0, 80)));

function avisarSiLaPantallaCalla(mensaje: string, desde: number): void {
  window.setTimeout(() => {
    if (!laPantallaYaLoDijo(mensaje, desde)) window.dispatchEvent(new CustomEvent(EVENTO_ERROR_SIN_MOSTRAR, { detail: mensaje }));
  }, ESPERA_A_LA_PANTALLA_MS);
}

/** Anota cuándo apareció algo con pinta de error, venga de donde venga. */
function vigilarLosCarteles(): void {
  const mira = new MutationObserver((cambios) => {
    for (const c of cambios) {
      for (const n of Array.from(c.addedNodes)) {
        if (n instanceof Element && [n, ...Array.from(n.querySelectorAll(`${SIEMPRE_ES_UN_CARTEL}, ${TEXTO_EN_ROJO}`))].some(esUnCartelDeError)) {
          ultimoCartel = Date.now();
          return;
        }
      }
    }
  });
  mira.observe(document.documentElement, { childList: true, subtree: true });
}

let instalada = false;

export function instalarRedDeErrores(): void {
  if (instalada || typeof window === 'undefined') return;
  instalada = true;
  vigilarLosCarteles();

  const alertOriginal = window.alert.bind(window);
  window.alert = (...a: Parameters<typeof window.alert>) => {
    ultimoAviso = Date.now();
    alertOriginal(...a);
  };

  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const [entrada, opciones] = args;
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const metodo = opciones?.method || (typeof entrada === 'object' && 'method' in entrada ? entrada.method : 'GET');
    if (!esDeLaApi(url)) return fetchOriginal(...args);
    const desde = Date.now();
    try {
      const res = await fetchOriginal(...args);
      if (!res.ok) {
        void res
          .clone()
          .json()
          .catch(() => null)
          .then((cuerpo) => {
            const mensaje = avisoPorLaRespuesta({ metodo, url, status: res.status, cuerpo });
            if (mensaje) avisarSiLaPantallaCalla(mensaje, desde);
          });
      }
      return res;
    } catch (error: any) {
      // Un pedido que la propia pantalla canceló (al salir o al escribir) no es una falla.
      if (error?.name !== 'AbortError') {
        const mensaje = avisoPorLaRespuesta({ metodo, url });
        if (mensaje) avisarSiLaPantallaCalla(mensaje, desde);
      }
      throw error;
    }
  };

  axios.interceptors.request.use((config) => {
    (config as any).doappDesde = Date.now();
    return config;
  });
  axios.interceptors.response.use(undefined, (error) => {
    const config = error?.config;
    if (config && !axios.isCancel(error) && esDeLaApi(String(config.url || ''))) {
      const mensaje = avisoPorLaRespuesta({ metodo: config.method || 'GET', url: String(config.url), status: error.response?.status, cuerpo: error.response?.data });
      if (mensaje) avisarSiLaPantallaCalla(mensaje, config.doappDesde ?? Date.now());
    }
    return Promise.reject(error);
  });

  // Lo que nadie atrapó: una acción que se cortó por la mitad sin decir nada.
  window.addEventListener('unhandledrejection', (e) => {
    const texto = String((e.reason as any)?.message || e.reason || '');
    // Los pedidos cancelados, los de red (ya avisan arriba) y la versión nueva de la web (se recarga sola) no cuentan.
    if (/AbortError|aborted|Failed to fetch|NetworkError|Load failed|dynamically imported module|Request failed with status/i.test(`${(e.reason as any)?.name || ''} ${texto}`)) return;
    avisarSiLaPantallaCalla(ALGO_FALLO, Date.now());
  });
}
