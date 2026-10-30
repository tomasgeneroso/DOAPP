/**
 * Se carga dentro del proceso del SERVIDOR (`NODE_OPTIONS=--require`) en las pruebas «reales». Hace dos cosas:
 *
 *  1. Las llamadas que el servidor le hace a Mercado Pago (que tiene escrito `https://api.mercadopago.com`) van al gemelo local. El código del
 *     servidor no se toca: es el mismo que corre en producción.
 *  2. Ninguna otra llamada sale a internet. Lo que no es de la propia máquina se corta con un error de red (como si no hubiera conexión):
 *     el servidor ya tiene su alternativa para eso (la cotización del dólar, por ejemplo, cae al valor de respaldo). Así una prueba nunca
 *     toca a un tercero de verdad por accidente.
 *
 * Los destinos se leen de `E2E_URL_MP` (el gemelo de Mercado Pago) y `E2E_URL_TERCEROS` (cotización del dólar y direcciones).
 */
const Module = require('module');
const URL_MP = process.env.E2E_URL_MP;
const URL_TERCEROS = process.env.E2E_URL_TERCEROS;

const DESVIOS = {
  'api.mercadopago.com': URL_MP,
  'dolarapi.com': URL_TERCEROS,
  'api.bluelytics.com.ar': URL_TERCEROS,
  'bluelytics.com.ar': URL_TERCEROS,
};

const LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function destino(entrada) {
  let texto = typeof entrada === 'string' ? entrada : entrada && entrada.url ? entrada.url : entrada && entrada.href ? entrada.href : null;
  if (!texto) return { cambiar: false };
  let url;
  try {
    url = new URL(texto);
  } catch {
    return { cambiar: false };
  }
  if (LOCALES.has(url.hostname)) return { cambiar: false };
  const base = DESVIOS[url.hostname];
  if (base) {
    const nuevo = new URL(base);
    nuevo.pathname = url.pathname;
    nuevo.search = url.search;
    // El gemelo de terceros distingue a quién se le habló por este encabezado.
    return { cambiar: true, url: nuevo.toString(), original: url.hostname };
  }
  return { cambiar: false, bloquear: true, host: url.hostname };
}

function envolver(original) {
  return function fetchDeLaPrueba(entrada, init) {
    const d = destino(entrada);
    if (d.bloquear) {
      process.stderr.write(`[e2e] llamada a internet cortada: ${d.host}\n`);
      return Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: new Error('sin internet en las pruebas (e2e)') }));
    }
    if (d.cambiar) {
      const cabeceras = Object.assign({}, (init && init.headers) || {}, { 'x-e2e-host-original': d.original });
      return original(d.url, Object.assign({}, init, { headers: cabeceras }));
    }
    return original(entrada, init);
  };
}

// fetch global (lo usa el código propio del servidor)
if (typeof globalThis.fetch === 'function') globalThis.fetch = envolver(globalThis.fetch.bind(globalThis));

// node-fetch (lo usa el SDK de Mercado Pago)
const cargarOriginal = Module._load;
Module._load = function (pedido, padre, esPrincipal) {
  const exportado = cargarOriginal.apply(this, arguments);
  if (pedido === 'node-fetch' && exportado && !exportado.__e2e) {
    const envuelto = envolver(exportado);
    Object.assign(envuelto, exportado);
    envuelto.default = envuelto;
    envuelto.__e2e = true;
    return envuelto;
  }
  return exportado;
};
