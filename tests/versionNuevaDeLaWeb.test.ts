import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { esErrorDeVersionVieja, puedeRecargarSola, recargarPorVersionNueva, ESPERA_ENTRE_RECARGAS_MS } from '../client/utils/versionNuevaDeLaWeb';

/**
 * Pedido del dueño (2026-11-24): «Failed to fetch dynamically imported module: …/assets/UserSettings-YoahdqqD.js», a veces y en
 * pantallas imprevistas. Causa: una pestaña abierta antes de un deploy pide un archivo con nombre viejo que el deploy reemplazó.
 * Antes: recarga solo desde `vite:preloadError`, sin avisar en pantalla, y «Reintentar» no podía arreglarlo (React.lazy recuerda el fallo).
 */
describe('versión nueva de la web tras un deploy', () => {
  const raiz = process.cwd();
  const leer = (r: string) => readFileSync(join(raiz, r), 'utf8');

  describe('reconocer el error', () => {
    it.each([
      'Failed to fetch dynamically imported module: https://staging.doapparg.com/assets/UserSettings-YoahdqqD.js',
      'error loading dynamically imported module: https://x/assets/a.js',
      'Importing a module script failed.',
      'Unable to preload CSS for /assets/index-abc.css',
      'Loading chunk 12 failed.',
    ])('«%s» es una versión vieja', (mensaje) => {
      expect(esErrorDeVersionVieja(new Error(mensaje))).toBe(true);
    });

    it('un error común de la pantalla NO lo es (no se recarga por cualquier fallo)', () => {
      expect(esErrorDeVersionVieja(new Error("Cannot read properties of undefined (reading 'id')"))).toBe(false);
      expect(esErrorDeVersionVieja(null)).toBe(false);
      expect(esErrorDeVersionVieja(undefined)).toBe(false);
    });

    it('reconoce un ChunkLoadError por su nombre', () => {
      const e = new Error('x');
      e.name = 'ChunkLoadError';
      expect(esErrorDeVersionVieja(e)).toBe(true);
    });
  });

  describe('recargar una sola vez', () => {
    const guardado: Record<string, string> = {};
    const recargar = jest.fn();

    beforeEach(() => {
      for (const k of Object.keys(guardado)) delete guardado[k];
      recargar.mockClear();
      (globalThis as any).sessionStorage = {
        getItem: (k: string) => (k in guardado ? guardado[k] : null),
        setItem: (k: string, v: string) => { guardado[k] = v; },
      };
      (globalThis as any).window = { location: { href: 'https://staging.doapparg.com/settings', reload: recargar } };
      (globalThis as any).fetch = jest.fn(async () => ({}));
    });
    afterEach(() => {
      delete (globalThis as any).sessionStorage;
      delete (globalThis as any).window;
      delete (globalThis as any).fetch;
    });

    it('la primera vez recarga, y antes refresca la copia guardada de la dirección (index.html viejo en el navegador o en Cloudflare)', async () => {
      expect(puedeRecargarSola()).toBe(true);
      expect(await recargarPorVersionNueva()).toBe(true);
      expect(recargar).toHaveBeenCalledTimes(1);
      expect((globalThis as any).fetch).toHaveBeenCalledWith('https://staging.doapparg.com/settings', expect.objectContaining({ cache: 'reload' }));
    });

    it('la segunda vez, dentro de los 30 s, NO recarga sola (si no se arregló, no hay bucle)', async () => {
      await recargarPorVersionNueva();
      recargar.mockClear();
      expect(puedeRecargarSola()).toBe(false);
      expect(await recargarPorVersionNueva()).toBe(false);
      expect(recargar).not.toHaveBeenCalled();
    });

    it('pasado el límite vuelve a poder', async () => {
      await recargarPorVersionNueva();
      expect(puedeRecargarSola(Date.now() + ESPERA_ENTRE_RECARGAS_MS + 1000)).toBe(true);
    });

    it('el botón «Actualizar» (forzar) recarga aunque se haya recargado recién', async () => {
      await recargarPorVersionNueva();
      recargar.mockClear();
      expect(await recargarPorVersionNueva(true)).toBe(true);
      expect(recargar).toHaveBeenCalledTimes(1);
    });
  });

  describe('la pantalla lo usa', () => {
    it('la pantalla de error muestra un aviso tranquilo con «Actualizar», no el error en rojo, y recarga sola', () => {
      const fuente = leer('client/components/ErrorBoundary.tsx');
      expect(fuente).toContain('esErrorDeVersionVieja(this.state.error)');
      expect(fuente).toContain('data-testid="actualizar-version-nueva"');
      expect(fuente).toContain('recargarPorVersionNueva(true)');
      expect(fuente).toMatch(/componentDidCatch[\s\S]*esErrorDeVersionVieja\(error\)\) void recargarPorVersionNueva\(\)/);
    });

    it('main.tsx recarga desde vite:preloadError con el mismo límite y SIN frenar el error (Vite devolvería un módulo vacío)', () => {
      const fuente = leer('client/main.tsx');
      expect(fuente).toContain('vite:preloadError');
      expect(fuente).toContain('recargarPorVersionNueva');
      expect(fuente).not.toMatch(/evento\.preventDefault|event\.preventDefault/);
    });
  });
});
