import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AYUDAS, LARGO_MAXIMO_DE_AYUDA } from '../client/content/ayudas';

/**
 * La «i» de las pantallas (pedido del dueño, 2026-11-19): cada título importante explica qué es. Esta prueba evita una «i» sin texto (no dibuja nada) y textos que no entran en el globo.
 */
const RAIZ = process.cwd();
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');
function archivos(dir: string): string[] {
  return readdirSync(join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivos(join(dir, e.name)) : /\.tsx$/.test(e.name) ? [join(dir, e.name)] : []));
}

describe('ayudas de la interfaz', () => {
  it('todo texto es breve y está en positivo', () => {
    for (const [clave, texto] of Object.entries(AYUDAS)) {
      expect([clave, texto.length <= LARGO_MAXIMO_DE_AYUDA]).toEqual([clave, true]);
      expect(texto).not.toMatch(/\b(no podés|prohibido|perderás)\b/i);
    }
  });

  it('cada «i» usada en una pantalla tiene su texto', () => {
    const usadas = new Set<string>();
    for (const f of archivos('client')) {
      if (f.split('\\').join('/').endsWith('components/ui/InfoIcono.tsx')) continue;
      for (const m of leer(f).matchAll(/<InfoIcono ayuda="([^"]+)"/g)) usadas.add(m[1]);
    }
    expect(usadas.size).toBeGreaterThanOrEqual(10);
    for (const clave of usadas) expect([clave, clave in AYUDAS]).toEqual([clave, true]);
  });

  it('las pantallas principales la llevan en su título', () => {
    const esperadas: Record<string, string> = {
      'client/pages/MyJobsScreen.tsx': 'ayuda="Mis trabajos"',
      'client/pages/ContractsScreen.tsx': 'ayuda="Mis contratos"',
      'client/pages/PaymentsScreen.tsx': 'ayuda="Mis pagos"',
      'client/pages/BalancePage.tsx': 'ayuda="Mi saldo"',
      'client/pages/NotificationsScreen.tsx': 'ayuda="Notificaciones"',
      'client/pages/UserSettings.tsx': 'ayuda="Configuración"',
      'client/pages/ProfilePage.tsx': 'ayuda="Puntuaciones"',
      'client/components/user/MultipleRatings.tsx': 'ayuda="Puntuación total"',
    };
    for (const [ruta, marca] of Object.entries(esperadas)) expect([ruta, leer(ruta).includes(marca)]).toEqual([ruta, true]);
    // en «Mis trabajos» cada pestaña explica la que está abierta
    for (const clave of ['"Mis publicaciones"', '"Mis aplicaciones"', '"Trabajos realizados"']) expect(leer('client/pages/MyJobsScreen.tsx')).toContain(clave);
  });

  it('el botón es accesible: nombre propio, se llega con teclado y Escape lo cierra', () => {
    const f = leer('client/components/ui/InfoIcono.tsx');
    expect(f).toContain('aria-label={`Más información: ${ayuda}`}');
    expect(f).toContain('<button');
    expect(f).toContain("e.key === 'Escape'");
    expect(f).toContain('role="tooltip"');
  });
});
