import { describe, it, expect } from '@jest/globals';
import { validarPlanEnviado, LIMITES_DEL_PLAN } from '../server/utils/validarPlan.js';

/**
 * La forma del plan de negocio que llega por PUT: cada campo con el tipo de su valor por defecto,
 * sin NaN/infinitos y sin nombres de campo peligrosos. Lo escriben el owner y el analista; un plan
 * mal formado dejaba sin abrir la pantalla del owner.
 */

const defecto = () => ({
  baseCurrency: 'EUR',
  rateUsd: 1.08,
  ratesUpdatedAt: null as string | null,
  ue: { mauActual: 0, soporte: 1.5, activo: true },
  budget: [{ c: 'Hosting', m: 10 }],
  projection: { growth: { mesInicio: '2026-10' }, costs: { fijosMensuales: 100 } },
});

describe('validarPlanEnviado', () => {
  it('un plan igual al de fábrica no tiene problemas', () => {
    expect(validarPlanEnviado(defecto(), defecto())).toEqual([]);
  });

  it('acepta cambios de valor del mismo tipo, el cero y el false', () => {
    const p = defecto();
    p.ue.mauActual = 0;
    p.ue.activo = false;
    p.rateUsd = 0;
    p.budget.push({ c: 'Otro', m: 0 });
    expect(validarPlanEnviado(p, defecto())).toEqual([]);
  });

  it('null significa "sin valor" (el servidor repone el valor por defecto): se acepta', () => {
    const p: any = defecto();
    p.rateUsd = null;
    p.ue = null;
    expect(validarPlanEnviado(p, defecto())).toEqual([]);
  });

  it('acepta claves que el plan de fábrica no conoce (planes guardados con secciones viejas)', () => {
    const p: any = { ...defecto(), seccionVieja: { a: 1, b: ['x'] } };
    expect(validarPlanEnviado(p, defecto())).toEqual([]);
  });

  it.each([
    ['un texto donde va un número', (p: any) => { p.rateUsd = 'mucho'; }, 'rateUsd'],
    ['un número donde va un texto', (p: any) => { p.baseCurrency = 5; }, 'baseCurrency'],
    ['un texto donde va un objeto', (p: any) => { p.projection = 'hola'; }, 'projection'],
    ['un arreglo donde va un objeto', (p: any) => { p.ue = [1, 2]; }, 'ue'],
    ['un objeto donde va una lista', (p: any) => { p.budget = { 0: 'x' }; }, 'budget'],
    ['un número donde va una lista', (p: any) => { p.budget = 5; }, 'budget'],
    ['un texto dos niveles adentro', (p: any) => { p.projection.growth.mesInicio = 202610; }, 'projection.growth.mesInicio'],
    ['un booleano como texto', (p: any) => { p.ue.activo = 'true'; }, 'ue.activo'],
  ])('rechaza %s y dice en qué campo', (_nombre, mutar, ruta) => {
    const p: any = defecto();
    mutar(p);
    const problemas = validarPlanEnviado(p, defecto());
    expect(problemas.length).toBeGreaterThan(0);
    expect(problemas[0].ruta).toBe(ruta);
  });

  it('rechaza NaN, infinitos y números fuera de rango, también dentro de listas', () => {
    for (const malo of [NaN, Infinity, -Infinity, LIMITES_DEL_PLAN.numeroMaximo * 10]) {
      const p: any = defecto();
      p.ue.soporte = malo;
      expect(validarPlanEnviado(p, defecto()).map((x) => x.ruta)).toContain('ue.soporte');
    }
    const enLista: any = defecto();
    enLista.budget[0].m = Infinity;
    expect(validarPlanEnviado(enLista, defecto()).map((x) => x.ruta)).toContain('budget[0].m');
  });

  it('rechaza nombres de campo peligrosos aunque estén bien escondidos', () => {
    const conProto = JSON.parse('{"ue":{"__proto__":{"x":1},"mauActual":1}}');
    expect(validarPlanEnviado(conProto, defecto()).map((x) => x.motivo)).toContain('nombre de campo no permitido');
    const enLista = JSON.parse('{"budget":[{"constructor":{"prototype":{"x":1}}}]}');
    expect(validarPlanEnviado(enLista, defecto()).length).toBeGreaterThan(0);
  });

  it('rechaza textos enormes, listas enormes y anidados absurdos', () => {
    const texto: any = defecto();
    texto.baseCurrency = 'x'.repeat(LIMITES_DEL_PLAN.textoMaximo + 1);
    expect(validarPlanEnviado(texto, defecto()).length).toBeGreaterThan(0);

    const lista: any = defecto();
    lista.budget = new Array(LIMITES_DEL_PLAN.elementosMaximos + 1).fill({ c: 'x', m: 1 });
    expect(validarPlanEnviado(lista, defecto()).length).toBeGreaterThan(0);

    let hondo: any = { fin: 1 };
    for (let i = 0; i < LIMITES_DEL_PLAN.profundidad + 3; i++) hondo = { dentro: hondo };
    const profundo: any = { ...defecto(), extra: hondo };
    expect(validarPlanEnviado(profundo, defecto()).map((x) => x.motivo)).toContain('anidado demasiado profundo');
  });

  it('no es un objeto: se rechaza sin romper', () => {
    for (const malo of [null, undefined, 'plan', 3, [1], true]) {
      expect(validarPlanEnviado(malo, defecto()).length).toBeGreaterThan(0);
    }
  });

  it('informa sólo los primeros problemas, para no devolver una respuesta gigante', () => {
    const p: any = {};
    for (let i = 0; i < 50; i++) p['k' + i] = NaN;
    expect(validarPlanEnviado(p, defecto()).length).toBe(LIMITES_DEL_PLAN.problemasQueSeInforman);
  });
});
