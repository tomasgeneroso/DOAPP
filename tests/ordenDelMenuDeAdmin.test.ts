import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { aplicarOrden, moverGrupo, moverUnLugar, leerOrdenGuardado, guardarOrden, claveDelOrdenDelMenu } from '../shared/admin/ordenDelMenu.js';

/**
 * El orden de los grupos del menú de administración (regla del dueño, 2026-11-09): se arrastran solo los grupos grandes, nunca los elementos de adentro;
 * el orden es de cada persona y sobrevive al cierre de sesión; sin nada guardado todo queda como siempre.
 */
const GRUPOS = ['hubs', 'general', 'operations', 'padrones', 'finance', 'support', 'settings'];

describe('aplicarOrden', () => {
  it('sin nada guardado (o algo roto) deja el orden de siempre', () => {
    expect(aplicarOrden(GRUPOS, null)).toEqual(GRUPOS);
    expect(aplicarOrden(GRUPOS, undefined)).toEqual(GRUPOS);
    expect(aplicarOrden(GRUPOS, 'padrones')).toEqual(GRUPOS);
    expect(aplicarOrden(GRUPOS, { 0: 'finance' })).toEqual(GRUPOS);
    expect(aplicarOrden(GRUPOS, [])).toEqual(GRUPOS);
  });

  it('respeta lo que la persona ordenó (padrones al final)', () => {
    const guardado = ['hubs', 'general', 'operations', 'finance', 'support', 'settings', 'padrones'];
    expect(aplicarOrden(GRUPOS, guardado)).toEqual(guardado);
  });

  it('un grupo nuevo que la persona no conoce va al final, en el orden de siempre', () => {
    expect(aplicarOrden([...GRUPOS, 'nuevo1', 'nuevo2'], ['finance', 'hubs'])).toEqual([
      'finance', 'hubs', 'general', 'operations', 'padrones', 'support', 'settings', 'nuevo1', 'nuevo2',
    ]);
  });

  it('ignora lo guardado que ya no existe (otro rol, un grupo que se quitó), los repetidos y lo que no es texto', () => {
    expect(aplicarOrden(['hubs', 'general'], ['fantasma', 'general', 'general', 7, null, 'hubs'])).toEqual(['general', 'hubs']);
  });

  it('nunca pierde ni inventa grupos: siempre devuelve exactamente los que hay', () => {
    const r = aplicarOrden(GRUPOS, ['support', 'x', 'hubs', 'hubs']);
    expect([...r].sort()).toEqual([...GRUPOS].sort());
  });
});

describe('moverGrupo', () => {
  it('arrastrar un grupo de arriba hacia abajo lo deja DESPUÉS del que se soltó', () => {
    expect(moverGrupo(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
  });
  it('arrastrar un grupo de abajo hacia arriba lo deja ANTES del que se soltó', () => {
    expect(moverGrupo(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });
  it('mandar «padrones» al final: soltarlo sobre el último', () => {
    expect(moverGrupo(GRUPOS, 'padrones', 'settings')).toEqual(['hubs', 'general', 'operations', 'finance', 'support', 'settings', 'padrones']);
  });
  it('soltar sobre sí mismo o con una clave que no existe no cambia nada ni modifica el original', () => {
    const original = ['a', 'b', 'c'];
    expect(moverGrupo(original, 'a', 'a')).toEqual(['a', 'b', 'c']);
    expect(moverGrupo(original, 'a', 'z')).toEqual(['a', 'b', 'c']);
    expect(moverGrupo(original, 'z', 'a')).toEqual(['a', 'b', 'c']);
    expect(original).toEqual(['a', 'b', 'c']);
  });
});

describe('moverUnLugar (los botones de subir y bajar)', () => {
  it('sube y baja un lugar', () => {
    expect(moverUnLugar(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moverUnLugar(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });
  it('en los extremos no hace nada', () => {
    expect(moverUnLugar(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moverUnLugar(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(moverUnLugar(['a', 'b', 'c'], 'z', 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('guardar y leer el orden (por persona, sin romper si el navegador no deja)', () => {
  const almacenEnMemoria = () => {
    const datos = new Map<string, string>();
    return {
      getItem: (k: string) => (datos.has(k) ? datos.get(k)! : null),
      setItem: (k: string, v: string) => void datos.set(k, v),
      removeItem: (k: string) => void datos.delete(k),
      datos,
    };
  };

  it('lo que se guarda se lee igual, y es de cada persona', () => {
    const a = almacenEnMemoria();
    expect(guardarOrden(a, 'u-1', ['finance', 'hubs'])).toBe(true);
    expect(leerOrdenGuardado(a, 'u-1')).toEqual(['finance', 'hubs']);
    expect(leerOrdenGuardado(a, 'u-2')).toBeNull(); // otra persona del equipo: su menú no cambió
    expect(claveDelOrdenDelMenu('u-1')).not.toBe(claveDelOrdenDelMenu('u-2'));
  });

  it('restablecer borra lo guardado', () => {
    const a = almacenEnMemoria();
    guardarOrden(a, 'u-1', ['finance']);
    expect(guardarOrden(a, 'u-1', null)).toBe(true);
    expect(leerOrdenGuardado(a, 'u-1')).toBeNull();
  });

  it('un valor roto o que no es una lista de textos se descarta', () => {
    const a = almacenEnMemoria();
    a.datos.set(claveDelOrdenDelMenu('u-1'), '{no es json');
    expect(leerOrdenGuardado(a, 'u-1')).toBeNull();
    a.datos.set(claveDelOrdenDelMenu('u-1'), JSON.stringify({ a: 1 }));
    expect(leerOrdenGuardado(a, 'u-1')).toBeNull();
    a.datos.set(claveDelOrdenDelMenu('u-1'), JSON.stringify(['a', 3]));
    expect(leerOrdenGuardado(a, 'u-1')).toBeNull();
  });

  it('si el almacenamiento está bloqueado (ventana privada, permisos) no lanza: devuelve null / false', () => {
    const bloqueado = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => { throw new Error('SecurityError'); },
    };
    expect(leerOrdenGuardado(bloqueado, 'u-1')).toBeNull();
    expect(guardarOrden(bloqueado, 'u-1', ['a'])).toBe(false);
    expect(guardarOrden(bloqueado, 'u-1', null)).toBe(false);
    expect(leerOrdenGuardado(null, 'u-1')).toBeNull();
    expect(guardarOrden(undefined, 'u-1', ['a'])).toBe(false);
  });
});

describe('el menú de la pantalla', () => {
  const layout = readFileSync(join(process.cwd(), 'client/pages/admin/AdminLayout.tsx'), 'utf8');

  it('solo los GRUPOS se arrastran: ningún enlace de la lista es arrastrable', () => {
    // El arrastre vive en el contenedor del grupo; los <Link> de los elementos no llevan `draggable` ni oyentes de arrastre.
    const enlaces = layout.match(/<Link[\s\S]*?>/g) ?? [];
    for (const e of enlaces) {
      expect(e).not.toMatch(/draggable|onDrag|onDrop/);
    }
    expect(layout).toMatch(/draggable=\{ordenando\}/);
  });

  it('usa el orden guardado por persona y los botones de subir y bajar como alternativa al arrastre', () => {
    expect(layout).toContain('shared/admin/ordenDelMenu');
    expect(layout).toMatch(/aplicarOrden\(/);
    expect(layout).toMatch(/moverUnLugar\(/);
    expect(layout).toMatch(/Restablecer/);
  });
});
