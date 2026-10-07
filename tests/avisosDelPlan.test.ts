import { describe, it, expect } from '@jest/globals';
import { textoDelAviso } from '../client/content/avisosDelPlan.js';
import { N } from '../client/content/seccionesDelPlan.js';
import { coordinarPlan, type CodigoDeAviso, type PlanCoordinable } from '../shared/pricing/planCoordinado.js';

/**
 * Cada aviso del plan tiene su texto, y el texto nombra las secciones por su número
 * real. Un aviso sin mensaje sería un cartel vacío justo cuando el plan dice que algo
 * no cierra.
 */

const CODIGOS: CodigoDeAviso[] = ['publicidad-sin-cac', 'publicidad-sin-uso', 'soporte-sin-sumar', 'etapa-real-vacia'];
const fmt = (n: number) => `€${Math.round(n).toLocaleString('es-AR')}`;

describe('textoDelAviso', () => {
  it.each(CODIGOS)('"%s" tiene un mensaje con el monto', (codigo) => {
    const t = textoDelAviso({ codigo, monto: 2778, moneda: 'EUR' }, fmt);
    expect(t.length).toBeGreaterThan(40);
    if (codigo !== 'etapa-real-vacia') expect(t).toContain('€2.778');
  });

  it('cuando le dice a la persona dónde ir, usa el número de sección vigente', () => {
    expect(textoDelAviso({ codigo: 'publicidad-sin-cac', monto: 1, moneda: 'EUR' }, fmt)).toContain(N.supuestos);
    expect(textoDelAviso({ codigo: 'soporte-sin-sumar', monto: 1, moneda: 'EUR' }, fmt)).toContain(N.unitEconomics);
    expect(textoDelAviso({ codigo: 'publicidad-sin-uso', monto: 1, moneda: 'EUR' }, fmt)).toContain(N.supuestos);
  });

  it('todos los códigos que produce el plan tienen mensaje', () => {
    const plan = {
      rateArs: 1560, rateUsd: 1.08,
      budgetCurrency: 'USD', budget: [{ c: 'Meta Ads', m: 100 }, { c: 'Atención al cliente', m: 50 }],
      budgetReal: [{ c: 'Meta Ads', m: 100 }, { c: 'Atención al cliente', m: 50 }], budgetRealCurrency: 'USD',
      betaMeses: 3, ueCurrency: 'USD', projectionCurrency: 'EUR',
      ue: { comision: 10, ticket: 21, contratos: 0.8, disputas: 1, soporte: 0.25, fijos: 0, fraude: 0.3 },
      projection: {
        growth: { modoCrecimiento: 'porcentaje', altasPorMes: 0, horizonteMeses: 120 },
        revenue: { ticket: 0, contratosPorUsuario: 0, comisionPct: 0, membresiaPrecio: 0, publicidadMensual: 0 },
        costs: { soportePorUsuario: 0, infraPorUsuario: 0, disputasPct: 0, fraudePct: 0, cac: 0, fijosMensuales: 0 },
      },
    } as PlanCoordinable;
    const { avisos } = coordinarPlan(plan);
    expect(avisos.map((a) => a.codigo).sort()).toEqual(['publicidad-sin-cac', 'publicidad-sin-uso', 'soporte-sin-sumar'].sort());
    for (const a of avisos) expect(textoDelAviso(a, fmt).length).toBeGreaterThan(40);
  });
});
