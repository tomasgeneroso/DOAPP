/**
 * Fotos de perfil que no cargan: un solo arreglo para todos los lugares donde aparece una (chats, listas, tarjetas, encabezado...).
 *
 * El navegador avisa «error» de cada imagen que falla (el evento no sube por el árbol, pero se puede escuchar en la fase de captura). Para una
 * foto de perfil se hace, en orden:
 *   1. Si es de Google (lh3.googleusercontent.com) y no se probó sin referrer: se reintenta SIN decir de qué sitio viene (Google a veces se niega).
 *   2. Si sigue fallando: se reemplaza por un círculo con la inicial del nombre (el `alt`), en vez de la imagen rota o el texto «Avatar».
 * Solo toca imágenes que parecen fotos de perfil (rutas de avatares, Google, dicebear o con forma de círculo); las demás (fotos de un trabajo) no.
 */
const COLORES = ['#0ea5e9', '#6366f1', '#8b5cf6', '#0d9488', '#d97706', '#e11d48'];

function esFotoDePerfil(img: HTMLImageElement): boolean {
  const src = img.currentSrc || img.src || '';
  return (
    /\/uploads\/avatars\//.test(src) ||
    /googleusercontent\.com|dicebear\.com|fbcdn\.net|pbs\.twimg\.com/.test(src) ||
    /\brounded-full\b/.test(img.className || '')
  );
}

export function inicialDe(texto: string | null | undefined): string {
  const limpio = String(texto || '')
    .replace(/^(foto de|avatar de|avatar|foto)\s*/i, '')
    .trim();
  return (limpio.charAt(0) || '?').toUpperCase();
}

export function marcadorConInicial(texto: string | null | undefined): string {
  const inicial = inicialDe(texto);
  const color = COLORES[(inicial.charCodeAt(0) || 0) % COLORES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${color}"/><text x="48" y="48" dy=".35em" text-anchor="middle" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="44" font-weight="700" fill="#fff">${inicial}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

let instalado = false;

export function instalarFotosRotas(): void {
  if (instalado || typeof window === 'undefined') return;
  instalado = true;
  window.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || img.dataset.fotoArreglada === 'listo') return;
      if (!esFotoDePerfil(img)) return;

      const src = img.currentSrc || img.src || '';
      // 1) Google: se reintenta sin referrer, una vez
      if (/googleusercontent\.com/.test(src) && img.dataset.fotoArreglada !== 'sinReferrer') {
        img.dataset.fotoArreglada = 'sinReferrer';
        img.referrerPolicy = 'no-referrer';
        img.src = src;
        return;
      }
      // 2) la inicial del nombre
      img.dataset.fotoArreglada = 'listo';
      img.removeAttribute('srcset');
      img.src = marcadorConInicial(img.alt);
    },
    true,
  );
}
