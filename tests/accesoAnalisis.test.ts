import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { decidirAccesoAnalisis, ROLES_DE_ANALISIS } from '../shared/auth/accesoAnalisis.js';

/**
 * El acceso a /analisis.
 *
 * Qué motivó esto: la página quedaba cargando para siempre si quien la abría no
 * tenía sesión. Esperaba con `!isAuthenticated && !user`, pero `isAuthenticated`
 * es `!!user`, así que esa condición era verdadera tanto mientras cargaba como
 * cuando no había sesión. La pantalla no podía distinguir "todavía no sé" de
 * "ya sé que no hay", y el segundo caso nunca llegaba al redirect.
 *
 * Es el tipo de error que el tipado no ve —las dos ramas compilan— y que sólo
 * aparece al abrir la ruta en una ventana sin sesión, que es justo lo que casi
 * nadie prueba de su propia pantalla.
 */

describe('decidirAccesoAnalisis', () => {
  it('espera mientras la sesión se resuelve, haya o no usuario', () => {
    expect(decidirAccesoAnalisis({ isLoading: true, user: null })).toBe('cargando');
    expect(decidirAccesoAnalisis({ isLoading: true, user: undefined })).toBe('cargando');
    // Con usuario ya cargado pero isLoading todavía en alto: no decide aún.
    expect(decidirAccesoAnalisis({ isLoading: true, user: { adminRole: 'owner' } })).toBe(
      'cargando',
    );
  });

  it('sin sesión, una vez resuelta, manda al login (el spinner infinito)', () => {
    /**
     * LA prueba. Con la lógica anterior este caso daba "seguir esperando", y
     * como la espera no termina porque no hay nada que esperar, la pantalla
     * quedaba cargando para siempre.
     */
    expect(decidirAccesoAnalisis({ isLoading: false, user: null })).toBe('login');
    expect(decidirAccesoAnalisis({ isLoading: false, user: undefined })).toBe('login');
  });

  it('nunca espera cuando ya se sabe que no hay sesión', () => {
    // La misma idea al revés: "cargando" sólo puede salir de isLoading.
    for (const user of [null, undefined, { adminRole: null }, { adminRole: 'owner' }]) {
      expect(decidirAccesoAnalisis({ isLoading: false, user })).not.toBe('cargando');
    }
  });

  it('deja entrar al owner y al analista', () => {
    expect(decidirAccesoAnalisis({ isLoading: false, user: { adminRole: 'owner' } })).toBe(
      'permitido',
    );
    expect(decidirAccesoAnalisis({ isLoading: false, user: { adminRole: 'analista' } })).toBe(
      'permitido',
    );
  });

  it('no deja entrar a los demás roles del panel, que tienen otras pantallas', () => {
    for (const adminRole of ['admin', 'super_admin', 'support', 'marketing', 'dpo']) {
      expect(decidirAccesoAnalisis({ isLoading: false, user: { adminRole } })).toBe('inicio');
    }
  });

  it('un usuario común, sin rol, va a inicio y no al login', () => {
    // Tiene sesión: mandarlo a iniciar sesión otra vez sería un bucle.
    for (const adminRole of [null, undefined, '']) {
      expect(decidirAccesoAnalisis({ isLoading: false, user: { adminRole } })).toBe('inicio');
    }
  });

  it('el rol no se confunde por mayúsculas ni por parecido', () => {
    for (const adminRole of ['Owner', 'ANALISTA', 'owner ', 'analista2', 'superowner']) {
      expect(decidirAccesoAnalisis({ isLoading: false, user: { adminRole } })).toBe('inicio');
    }
  });
});

describe('una sola lista de roles', () => {
  /**
   * La página y la API tenían cada una su `['owner', 'analista']` escrita a
   * mano. Si divergen, o la página deja entrar a alguien y la API le contesta
   * 403 (pantalla rota), o la API abre datos a un rol que la pantalla no
   * muestra. Los dos leen ahora de `ROLES_DE_ANALISIS`.
   */
  const RAIZ = process.cwd();
  const sinComentarios = (archivo: string) =>
    readFileSync(join(RAIZ, archivo), 'utf8')
      .split('\n')
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join('\n');

  it('la lista es la esperada', () => {
    expect([...ROLES_DE_ANALISIS]).toEqual(['owner', 'analista']);
  });

  it('ni la página ni la API la repiten a mano', () => {
    for (const archivo of [
      'client/pages/Analisis.tsx',
      'client/pages/admin/BusinessPlan.tsx',
      'server/routes/admin/businessPlan.ts',
    ]) {
      expect({ archivo, repite: /['"]analista['"]/.test(sinComentarios(archivo)) }).toEqual({
        archivo,
        repite: false,
      });
    }
  });

  it('la pantalla de la proyección deja entrar a los mismos roles que la API', () => {
    /**
     * Decidía con `adminRole === "owner"`, así que el analista —que existe
     * justamente para colaborar con estos números y al que el servidor sí deja
     * pasar— veía "Acceso restringido" en la pestaña Proyección. La mitad de lo que
     * su rol debía mostrarle estaba cerrada, y nadie lo notó porque nunca se probó
     * la pantalla con ese rol.
     */
    const fuente = sinComentarios('client/pages/admin/BusinessPlan.tsx');
    expect(fuente).toContain('ROLES_DE_ANALISIS');
    expect(fuente).not.toMatch(/adminRole\s*===\s*['"]owner['"]/);
  });

  it('la API lee la lista compartida', () => {
    expect(sinComentarios('server/routes/admin/businessPlan.ts')).toContain(
      'requireAdminRole(...ROLES_DE_ANALISIS)',
    );
  });
});
