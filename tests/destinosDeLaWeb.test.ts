import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Toda dirección de la web que el servidor arma tiene que existir como ruta.
 *
 * Qué pasó: al terminar la verificación de identidad en Didit, la persona volvía a `/kyc/callback` y caía en un
 * 404: el servidor mandaba la dirección, la pantalla nunca se había escrito. Mirando todo lo que el servidor
 * arma hacia la web (redirecciones, retornos de pago, enlaces de correo) aparecieron otros tres iguales:
 * la recuperación de la contraseña de fase (`/admin/platform/reset`), el botón «Ver mi perfil» del correo de
 * identidad verificada (`/profile`, que pide un id) y los tickets de soporte (`/support/tickets/…`).
 *
 * Cada vez que alguien agregue un enlace nuevo en el servidor, este test mira que la web lo reciba.
 */

const RAIZ = process.cwd();

function archivos(dir: string): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const completo = join(dir, e.name);
    if (e.isDirectory()) salida.push(...archivos(completo));
    else if (e.name.endsWith('.ts')) salida.push(completo);
  }
  return salida;
}

/**
 * Destinos que NO tienen pantalla a propósito. Cada uno con el motivo; sumar uno acá es una decisión, no un trámite.
 */
const SIN_PANTALLA_A_PROPOSITO: Record<string, string> = {
  '/perfil/pagos':
    'Retorno de la vinculación de cuenta de Mercado Pago (OAuth). Ninguna pantalla de la web ni de la app arranca ese ' +
    'flujo, así que nadie llega a esa redirección. Si se le agrega interfaz, hay que crear la pantalla y sacar esta línea.',
};

function rutasDeLaWeb(): string[] {
  const app = readFileSync(join(RAIZ, 'client/App.tsx'), 'utf8');
  // Las rutas del panel (dentro de /admin) están escritas relativas.
  return [...app.matchAll(/path="([^"]+)"/g)].map((m) => (m[1].startsWith('/') || m[1] === '*' ? m[1] : `/admin/${m[1]}`));
}

function existe(ruta: string, rutas: string[]): boolean {
  return rutas.some((r) => {
    if (r === '*') return false; // el comodín es justamente lo que muestra el 404
    return new RegExp(`^${r.replace(/:[A-Za-z]+/g, '[^/]+')}/?$`).test(ruta);
  });
}

describe('destinos que el servidor arma hacia la web', () => {
  const rutas = rutasDeLaWeb();
  const destinos = new Map<string, { ruta: string; dinamico: boolean; en: Set<string> }>();

  for (const f of archivos(join(RAIZ, 'server'))) {
    const src = readFileSync(f, 'utf8');
    const re = /\$\{(?:config\.clientUrl|process\.env\.CLIENT_URL|process\.env\.FRONTEND_URL|clientUrl)[^}]*\}(\/[A-Za-z0-9_\-/.]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const ruta = m[1].replace(/\/$/, '') || '/';
      const dinamico = src[m.index + m[0].length] === '$';
      const clave = ruta + (dinamico ? '/<dinamico>' : '');
      if (!destinos.has(clave)) destinos.set(clave, { ruta, dinamico, en: new Set() });
      destinos.get(clave)!.en.add(f.slice(RAIZ.length + 1).replace(/\\/g, '/'));
    }
  }

  it('el barrido encuentra destinos (no está mirando una carpeta vacía)', () => {
    expect(rutas.length).toBeGreaterThan(100);
    expect(destinos.size).toBeGreaterThan(15);
    expect(destinos.has('/kyc/callback')).toBe(true);
  });

  it('cada uno tiene una ruta en la web', () => {
    const sinRuta = [...destinos.values()]
      .filter((d) => !(d.ruta in SIN_PANTALLA_A_PROPOSITO))
      .filter((d) => !existe(d.dinamico ? `${d.ruta}/x` : d.ruta, rutas) && !existe(d.ruta, rutas))
      .map((d) => `${d.ruta}${d.dinamico ? '/…' : ''}  ←  ${[...d.en].join(', ')}`);
    expect(sinRuta).toEqual([]);
  });

  it('las excepciones de la lista siguen siendo ciertas (si ya tienen ruta, se sacan de acá)', () => {
    for (const ruta of Object.keys(SIN_PANTALLA_A_PROPOSITO)) {
      expect(existe(ruta, rutas)).toBe(false);
      expect(destinos.has(ruta)).toBe(true);
    }
  });
});
