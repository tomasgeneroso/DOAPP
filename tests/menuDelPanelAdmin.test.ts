import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * El menú del panel de administración no puede apuntar a una pantalla que no existe, y las direcciones que el servidor y los
 * favoritos ya usan (aunque las pantallas se hayan unido en pestañas) tienen que seguir llegando a algún lado.
 */
const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');
const layout = leer('client/pages/admin/AdminLayout.tsx');
const app = leer('client/App.tsx');

const rutasDelPanel = new Set([...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]));

describe('menú del panel de administración', () => {
  it('cada entrada del menú tiene su ruta', () => {
    const entradas = [...layout.matchAll(/path:\s*"\/admin\/?([^"]*)"/g)].map((m) => m[1]);
    expect(entradas.length).toBeGreaterThan(20);
    const sinRuta = entradas.filter((p) => p !== '' && !rutasDelPanel.has(p));
    expect(sinRuta).toEqual([]);
  });

  it('manual y guía de errores son UNA entrada (Ayuda y manuales); identidades baneadas y a revisar, UNA (Identidades)', () => {
    expect(layout).toContain('path: "/admin/ayuda"');
    expect(layout).not.toContain('path: "/admin/manual"');
    expect(layout).not.toContain('path: "/admin/guia-de-errores"');
    expect(layout).toContain('path: "/admin/identidades"');
    expect(layout).not.toContain('path: "/admin/banned-identities"');
    expect(layout).not.toContain('path: "/admin/identidad-a-revisar"');
  });

  it('las direcciones viejas siguen existiendo (el servidor linkea la guía con el código y los avisos de identidad)', () => {
    for (const vieja of ['manual', 'guia-de-errores', 'banned-identities', 'identidad-a-revisar', 'historial/:userId']) {
      expect(rutasDelPanel.has(vieja)).toBe(true);
    }
  });

  it('la ficha del usuario existe y la lista de usuarios abre la ficha, no el perfil público', () => {
    expect(rutasDelPanel.has('users/:userId')).toBe(true);
    expect(leer('client/pages/admin/Users.tsx')).toContain('navigate(`/admin/users/${user.id}`)');
  });

  it('«Usuarios con advertencia» queda en Soporte, donde lo ve el rol de soporte', () => {
    const iSoporte = layout.indexOf('label: "support"');
    const iAjustes = layout.indexOf('label: "settings"');
    const iMarcados = layout.indexOf('path: "/admin/usuarios-marcados"');
    expect(iMarcados).toBeGreaterThan(iSoporte);
    expect(iMarcados).toBeLessThan(iAjustes);
  });
});
