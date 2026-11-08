import { describe, it, expect } from '@jest/globals';
import { horasDesde, ordenarTareas, textoDeEspera, UMBRALES_DE_ESPERA, urgenciaDe, type TareaPendiente } from '../shared/admin/pendientes.js';

/**
 * El panel de pendientes del administrador: qué es urgente, importante o normal, y en qué orden se muestra.
 *
 * La regla es una sola: cuánto lleva esperando lo más viejo (salvo lo que tiene un reloj externo, que siempre es urgente). Si estos números se
 * cambian sin querer, el administrador deja de ver primero lo que más corre.
 */

describe('urgenciaDe', () => {
  it('un retiro sube de nivel con la espera: normal, importante a las 24 h, urgente a las 48 h', () => {
    expect(urgenciaDe('retiros', 2)).toBe('normal');
    expect(urgenciaDe('retiros', 24)).toBe('importante');
    expect(urgenciaDe('retiros', 47.9)).toBe('importante');
    expect(urgenciaDe('retiros', 48)).toBe('urgente');
    expect(urgenciaDe('retiros', 24 * 30)).toBe('urgente');
  });

  it('una publicación y un pago de cliente sube antes (la persona espera para poder publicar): importante a las 6 h, urgente a las 24 h', () => {
    for (const clave of ['publicaciones', 'pagosPorVerificar']) {
      expect([clave, urgenciaDe(clave, 5)]).toEqual([clave, 'normal']);
      expect([clave, urgenciaDe(clave, 6)]).toEqual([clave, 'importante']);
      expect([clave, urgenciaDe(clave, 24)]).toEqual([clave, 'urgente']);
    }
  });

  it('un contracargo y un contrato retenido por fraude son urgentes siempre, aunque recién lleguen o no se pueda medir la espera', () => {
    for (const clave of ['contracargos', 'retencionesPorFraude']) {
      expect(urgenciaDe(clave, 0)).toBe('urgente');
      expect(urgenciaDe(clave, null)).toBe('urgente');
    }
  });

  it('lo que lleva poco esperando pero quien lo abrió marcó como urgente pasa a importante (nunca baja ni salta a urgente solo)', () => {
    expect(urgenciaDe('tickets', 1, true)).toBe('importante');
    expect(urgenciaDe('tickets', 1, false)).toBe('normal');
    expect(urgenciaDe('tickets', 100, true)).toBe('urgente');
  });

  it('sin espera medible no hay nivel de urgencia por espera (queda normal) y una clave desconocida tampoco rompe', () => {
    expect(urgenciaDe('retiros', null)).toBe('normal');
    expect(urgenciaDe('algo-que-no-existe', 999)).toBe('normal');
  });

  it('los umbrales son coherentes: «urgente» siempre pide más espera que «importante»', () => {
    for (const [clave, u] of Object.entries(UMBRALES_DE_ESPERA)) {
      if (u === 'siempre') continue;
      expect([clave, u.urgente > u.importante && u.importante > 0]).toEqual([clave, true]);
    }
  });
});

describe('ordenarTareas', () => {
  const t = (clave: string, urgencia: TareaPendiente['urgencia'], esperaHoras: number | null, cantidad = 1) => ({ clave, urgencia, esperaHoras, cantidad });

  it('primero lo urgente, después lo importante, después lo normal', () => {
    const orden = ordenarTareas([t('a', 'normal', 100), t('b', 'urgente', 1), t('c', 'importante', 50)]).map((x) => x.clave);
    expect(orden).toEqual(['b', 'c', 'a']);
  });

  it('dentro de un mismo nivel, lo que más espera va primero; si empatan, lo que tiene más cosas', () => {
    const orden = ordenarTareas([t('poco', 'urgente', 10, 1), t('mucho', 'urgente', 90, 1), t('empate-grande', 'urgente', 10, 5)]).map((x) => x.clave);
    expect(orden).toEqual(['mucho', 'empate-grande', 'poco']);
  });

  it('lo que no tiene espera medible (contracargo) queda después de lo que sí, dentro de su nivel, y no se pierde', () => {
    const orden = ordenarTareas([t('sin', 'urgente', null), t('con', 'urgente', 5)]).map((x) => x.clave);
    expect(orden).toEqual(['con', 'sin']);
  });

  it('no modifica la lista que recibe', () => {
    const original = [t('a', 'normal', 1), t('b', 'urgente', 1)];
    ordenarTareas(original);
    expect(original.map((x) => x.clave)).toEqual(['a', 'b']);
  });
});

describe('textoDeEspera y horasDesde', () => {
  it('lo dice como lo diría una persona', () => {
    expect(textoDeEspera(0.2)).toBe('hace menos de una hora');
    expect(textoDeEspera(1)).toBe('hace 1 hora');
    expect(textoDeEspera(5.9)).toBe('hace 5 horas');
    expect(textoDeEspera(47)).toBe('hace 47 horas');
    expect(textoDeEspera(48)).toBe('hace 2 días');
    expect(textoDeEspera(24 * 15)).toBe('hace 15 días');
  });

  it('lo que no se puede medir no dice nada (en vez de «hace NaN»)', () => {
    expect(textoDeEspera(null)).toBe('');
    expect(textoDeEspera(Number.NaN)).toBe('');
    expect(textoDeEspera(-3)).toBe('');
  });

  it('horasDesde nunca da negativo y tolera fechas rotas', () => {
    const ahora = new Date('2026-11-06T12:00:00Z');
    expect(horasDesde('2026-11-06T09:00:00Z', ahora)).toBe(3);
    expect(horasDesde('2026-11-07T09:00:00Z', ahora)).toBe(0);
    expect(horasDesde(null, ahora)).toBeNull();
    expect(horasDesde('esto no es una fecha', ahora)).toBeNull();
  });
});
