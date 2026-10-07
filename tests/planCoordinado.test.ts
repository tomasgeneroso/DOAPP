import { describe, it, expect } from '@jest/globals';
import {
  coordinarPlan,
  cambiarMonedaDeLaProyeccion,
  mesesHastaFinDeBeta,
  rubrosDeLaEtapaReal,
  ACTIVOS_PCT_POR_DEFECTO,
  COMISION_EN_BETA_PCT,
  MESES_DE_BETA_MAXIMOS,
  type PlanCoordinable,
} from '../shared/pricing/planCoordinado.js';
import { projectFinancials, type ProjectionAssumptions } from '../client/utils/financialProjection.js';

/**
 * Los bloques del plan tienen que coincidir.
 *
 * Qué motivó esto: la economía unitaria usaba un ticket de US$21 y la proyección de
 * €22; los costos fijos de uno eran todo el presupuesto (US$7.600) y los del otro
 * €430,5, con la publicidad adentro y contada otra vez como adquisición. Cada
 * bloque era razonable por separado y juntos describían dos negocios distintos.
 * Estos tests fijan la regla: cada número se carga una vez y los demás lo derivan.
 */

const TASAS = { rateArs: 1560, rateUsd: 1.08 };

/** Un plan con los números de arranque, en las monedas en las que se cargan hoy. */
const plan = (over: Partial<PlanCoordinable> = {}): PlanCoordinable => ({
  ...TASAS,
  budgetCurrency: 'USD',
  budget: [
    { c: 'Meta Ads / adquisición', m: 3000 },
    { c: 'Retainer abogado laboral', m: 1800 },
    { c: 'Infraestructura tech (hosting, dominio, APIs)', m: 900 },
    { c: 'Soporte y resolución de disputas (manual)', m: 1200 },
    { c: 'Sueldos / founders', m: 0 },
    { c: 'Contingencia (10%)', m: 700 },
  ],
  betaMeses: 3,
  ueCurrency: 'USD',
  ue: { comision: 10, ticket: 21, contratos: 0.8, disputas: 2.5, soporte: 1, fijos: 18000, fraude: 0.8 },
  projectionCurrency: 'EUR',
  projection: {
    growth: { modoCrecimiento: 'absoluto', altasPorMes: 100, horizonteMeses: 36 },
    revenue: {
      ticket: 22,
      contratosPorUsuario: 0.15,
      comisionPct: 8,
      membresiaPrecio: 5,
      publicidadMensual: 0,
    },
    costs: {
      soportePorUsuario: 1.5,
      infraPorUsuario: 0,
      disputasPct: 1,
      fraudePct: 0.5,
      cac: 4,
      fijosMensuales: 430.5,
    },
  },
  ...over,
});

const aEur = (usd: number) => usd / TASAS.rateUsd;

describe('mesesHastaFinDeBeta', () => {
  const d = (s: string) => new Date(s);

  it('cuenta el mes en curso: del 6 de octubre al 31 de diciembre son 3 meses', () => {
    expect(mesesHastaFinDeBeta(d('2026-10-06T12:00:00Z'), d('2026-12-31T23:59:59Z'))).toBe(3);
  });

  it('en el mes del cierre queda 1', () => {
    expect(mesesHastaFinDeBeta(d('2026-12-01T12:00:00Z'), d('2026-12-31T23:59:59Z'))).toBe(1);
  });

  it('si la beta ya terminó, 0', () => {
    expect(mesesHastaFinDeBeta(d('2027-02-10T00:00:00Z'), d('2026-12-31T23:59:59Z'))).toBe(0);
  });

  it('cruza el año', () => {
    expect(mesesHastaFinDeBeta(d('2026-11-15T00:00:00Z'), d('2027-02-28T00:00:00Z'))).toBe(4);
  });

  it('con la fecha de cierre REAL (31/12 23:59 hora argentina) son 3 meses, no 4', () => {
    /**
     * Ese instante es el 1° de enero en UTC. Contado en UTC daba 4: la pantalla
     * mostraba una beta de cuatro meses cuando faltan tres (octubre, noviembre y
     * diciembre). Lo encontró mirar la pantalla real, no ningún test.
     * (BETA_ENDS_AT_DEFECTO, server/services/platformPhase.ts.)
     */
    const cierre = new Date('2026-12-31T23:59:59-03:00');
    expect(mesesHastaFinDeBeta(d('2026-10-07T15:00:00Z'), cierre)).toBe(3);
    expect(mesesHastaFinDeBeta(d('2026-12-15T12:00:00Z'), cierre)).toBe(1);
  });

  it('el mes se cuenta en hora argentina también del lado de "ahora"', () => {
    // 01:00 UTC del 1° de octubre son las 22:00 del 30 de septiembre en Argentina.
    const cierre = new Date('2026-12-31T23:59:59-03:00');
    expect(mesesHastaFinDeBeta(d('2026-10-01T01:00:00Z'), cierre)).toBe(4);
  });

  it('no pasa del máximo', () => {
    expect(mesesHastaFinDeBeta(d('2026-01-01T00:00:00Z'), d('2036-01-01T00:00:00Z'))).toBe(MESES_DE_BETA_MAXIMOS);
  });
});

describe('lo que viene de la economía unitaria', () => {
  it('el ticket de la proyección ES el de la economía unitaria, en la moneda de la proyección', () => {
    const p = plan();
    coordinarPlan(p);
    expect(p.projection.revenue.ticket).toBeCloseTo(aEur(21), 4);
    // y no el €22 que tenía cargado a mano
    expect(p.projection.revenue.ticket).not.toBe(22);
  });

  it('en la misma moneda es exacto', () => {
    const p = plan({ projectionCurrency: 'USD' });
    coordinarPlan(p);
    expect(p.projection.revenue.ticket).toBe(21);
  });

  it('comisión, disputas y fraude pasan tal cual: son porcentajes', () => {
    const p = plan();
    coordinarPlan(p);
    expect(p.projection.revenue.comisionPct).toBe(10);
    expect(p.projection.costs.disputasPct).toBe(2.5);
    expect(p.projection.costs.fraudePct).toBe(0.8);
  });

  it('contratos y soporte por usuario ACTIVO pasan a por usuario REGISTRADO con el % de activos', () => {
    const p = plan();
    p.projection.growth.activosPct = 25;
    coordinarPlan(p);
    expect(p.projection.revenue.contratosPorUsuario).toBeCloseTo(0.8 * 0.25, 9);
    expect(p.projection.costs.soportePorUsuario).toBeCloseTo(aEur(1) * 0.25, 4);
  });

  it('sin % de activos se usa el de arranque', () => {
    const p = plan();
    const d = coordinarPlan(p);
    expect(d.activosPct).toBe(ACTIVOS_PCT_POR_DEFECTO);
    expect(p.projection.growth.activosPct).toBe(ACTIVOS_PCT_POR_DEFECTO);
    expect(p.projection.revenue.contratosPorUsuario).toBeCloseTo(0.8 * (ACTIVOS_PCT_POR_DEFECTO / 100), 9);
  });

  it.each([
    [150, 100],
    [-5, 0],
    [NaN, ACTIVOS_PCT_POR_DEFECTO],
    ['x' as unknown as number, ACTIVOS_PCT_POR_DEFECTO],
  ])('un %% de activos de %p queda en %p', (entrada, esperado) => {
    const p = plan();
    p.projection.growth.activosPct = entrada;
    expect(coordinarPlan(p).activosPct).toBe(esperado);
  });

  it('cambiar el ticket en la economía unitaria cambia el de la proyección', () => {
    const a = plan();
    const b = plan();
    b.ue.ticket = 42;
    coordinarPlan(a);
    coordinarPlan(b);
    expect(b.projection.revenue.ticket).toBeCloseTo(a.projection.revenue.ticket * 2, 4);
  });
});

describe('lo que viene de los gastos de la etapa real', () => {
  const conReal = () =>
    plan({
      budgetRealCurrency: 'USD',
      budgetReal: [
        { c: 'Meta Ads', m: 8000 },
        { c: 'Abogado', m: 1000 },
        { c: 'Servidores', m: 500 },
        { c: 'Atención al cliente', m: 2000 },
        { c: 'Sueldo de soporte', m: 900, tipo: 'fijo' },
      ],
    });

  it('los costos fijos son los rubros fijos: sin publicidad ni soporte', () => {
    const p = conReal();
    coordinarPlan(p);
    // Abogado 1000 + Servidores 500 + Sueldo (marcado fijo) 900
    expect(p.projection.costs.fijosMensuales).toBeCloseTo(aEur(2400), 4);
  });

  it('la economía unitaria usa esos mismos costos fijos', () => {
    const p = conReal();
    coordinarPlan(p);
    expect(p.ue.fijos).toBe(2400); // en USD, la moneda de la sección
    expect(p.ueOrigen?.fijos).toEqual({ moneda: 'USD', monto: 2400 });
  });

  it('en otra moneda de la sección, el mismo costo equivalente', () => {
    const p = conReal();
    p.ueCurrency = 'EUR';
    coordinarPlan(p);
    expect(p.ue.fijos).toBeCloseTo(aEur(2400), 4);
  });

  it('la publicidad compra usuarios: altas = pauta ÷ CAC', () => {
    const p = conReal();
    const d = coordinarPlan(p);
    // 8000 USD = 7407.4 EUR; CAC 4 EUR
    expect(p.projection.growth.altasPorMes).toBeCloseTo(aEur(8000) / 4, 4);
    expect(d.real.altasPorMes).toBe(p.projection.growth.altasPorMes);
  });

  it('el doble de publicidad, el doble de altas; el doble de CAC, la mitad', () => {
    const a = conReal();
    const b = conReal();
    b.budgetReal![0].m = 16000;
    const c = conReal();
    c.projection.costs.cac = 8;
    coordinarPlan(a);
    coordinarPlan(b);
    coordinarPlan(c);
    expect(b.projection.growth.altasPorMes).toBeCloseTo(a.projection.growth.altasPorMes * 2, 4);
    expect(c.projection.growth.altasPorMes).toBeCloseTo(a.projection.growth.altasPorMes / 2, 4);
  });

  it('el tipo escrito manda sobre el nombre al derivar', () => {
    const p = conReal();
    p.budgetReal![0].tipo = 'fijo'; // la pauta anual contratada es un fijo
    coordinarPlan(p);
    expect(p.projection.costs.fijosMensuales).toBeCloseTo(aEur(10400), 4);
    expect(p.projection.growth.altasPorMes).toBe(0);
  });

  it('los rubros se pasan de la moneda de la tabla a la de la proyección', () => {
    const p = conReal();
    p.budgetRealCurrency = 'ARS';
    p.budgetReal = [{ c: 'Abogado', m: 1560000 }];
    coordinarPlan(p);
    expect(p.projection.costs.fijosMensuales).toBeCloseTo(1000, 4); // 1.560.000 ARS = 1.000 EUR
  });
});

describe('la beta', () => {
  it('queda definida con sus meses, sin comisión y con el soporte a mano como costo fijo', () => {
    const p = plan();
    coordinarPlan(p);
    const b = p.projection.beta!;
    expect(b.meses).toBe(3);
    expect(b.comisionPct).toBe(COMISION_EN_BETA_PCT);
    expect(b.comisionPct).toBe(0);
    // fijos (1800 + 900 + 0 + 700) + soporte manual 1200 = 4600 USD
    expect(b.fijosMensuales).toBeCloseTo(aEur(4600), 4);
    // el soporte por usuario de la beta es 0: ya está en los fijos, contarlo otra vez lo duplicaría
    expect(b.soportePorUsuario).toBe(0);
  });

  it('las altas de la beta salen de la publicidad de la beta', () => {
    const p = plan();
    const d = coordinarPlan(p);
    expect(p.projection.beta!.altasPorMes).toBeCloseTo(aEur(3000) / 4, 4);
    expect(d.beta.pauta).toBeCloseTo(aEur(3000), 4);
  });

  it('los meses se acotan', () => {
    const largo = plan({ betaMeses: 99 });
    coordinarPlan(largo);
    expect(largo.betaMeses).toBe(MESES_DE_BETA_MAXIMOS);
    const negativo = plan({ betaMeses: -4 });
    coordinarPlan(negativo);
    expect(negativo.betaMeses).toBe(0);
    const basura = plan({ betaMeses: 'x' as unknown as number });
    coordinarPlan(basura);
    expect(basura.betaMeses).toBe(0);
  });
});

describe('la etapa real nace como copia de la beta', () => {
  it('sin rubros propios, copia los de la beta y su moneda', () => {
    const p = plan();
    coordinarPlan(p);
    expect(p.budgetReal).toEqual(p.budget);
    expect(p.budgetRealCurrency).toBe('USD');
  });

  it('es una copia, no el mismo arreglo: tocar la beta después no mueve la etapa real', () => {
    const p = plan();
    coordinarPlan(p);
    p.budget[0].m = 1;
    expect(p.budgetReal![0].m).toBe(3000);
    expect(p.budgetReal).not.toBe(p.budget);
  });

  it('una vez que tiene rubros propios no se vuelve a copiar', () => {
    const p = plan({ budgetReal: [{ c: 'Algo', m: 5 }], budgetRealCurrency: 'EUR' });
    coordinarPlan(p);
    expect(p.budgetReal).toEqual([{ c: 'Algo', m: 5 }]);
    expect(p.budgetRealCurrency).toBe('EUR');
  });

  it('una lista vacía es una etapa real vacía, no "falta": no se pisa con la beta', () => {
    const p = plan({ budgetReal: [], budgetRealCurrency: 'USD' });
    const d = coordinarPlan(p);
    expect(p.budgetReal).toEqual([]);
    expect(d.avisos.map((a) => a.codigo)).toContain('etapa-real-vacia');
  });

  it('rubrosDeLaEtapaReal devuelve los propios o una copia de la beta', () => {
    const base = plan();
    expect(rubrosDeLaEtapaReal(base)).toEqual(base.budget);
    expect(rubrosDeLaEtapaReal(base)).not.toBe(base.budget);
    expect(rubrosDeLaEtapaReal({ ...base, budgetReal: [{ c: 'X', m: 1 }] })).toEqual([{ c: 'X', m: 1 }]);
  });
});

describe('coordinarPlan es idempotente y pisa lo viejo', () => {
  it('aplicarlo dos veces da lo mismo que una', () => {
    const una = plan();
    const dos = plan();
    coordinarPlan(una);
    coordinarPlan(dos);
    coordinarPlan(dos);
    expect(dos).toEqual(una);
  });

  it('lo que un plan viejo traía cargado a mano se reemplaza por lo derivado', () => {
    const p = plan();
    p.projection.revenue.ticket = 9999;
    p.projection.revenue.comisionPct = 77;
    p.projection.costs.fijosMensuales = 123456;
    p.projection.growth.altasPorMes = 424242;
    p.projection.growth.horizonteMeses = 7;
    coordinarPlan(p);
    expect(p.projection.revenue.ticket).toBeCloseTo(aEur(21), 4);
    expect(p.projection.revenue.comisionPct).toBe(10);
    expect(p.projection.costs.fijosMensuales).toBeCloseTo(aEur(3400), 4);
    expect(p.projection.growth.altasPorMes).toBeCloseTo(aEur(3000) / 4, 4);
    expect(p.projection.growth.horizonteMeses).toBe(120);
  });

  it('cambiar de moneda la proyección no cambia el negocio: el mismo ticket en euros y en dólares', () => {
    const eur = plan({ projectionCurrency: 'EUR' });
    const usd = plan({ projectionCurrency: 'USD' });
    coordinarPlan(eur);
    coordinarPlan(usd);
    expect(usd.projection.revenue.ticket).toBeCloseTo(eur.projection.revenue.ticket * TASAS.rateUsd, 4);
    expect(usd.projection.costs.fijosMensuales).toBeCloseTo(eur.projection.costs.fijosMensuales * TASAS.rateUsd, 4);
  });
});

describe('avisos: lo que el modelo no usa se dice', () => {
  it('publicidad cargada pero CAC en 0: no se puede convertir en usuarios', () => {
    const p = plan();
    p.projection.costs.cac = 0;
    const d = coordinarPlan(p);
    expect(d.avisos.map((a) => a.codigo)).toContain('publicidad-sin-cac');
    expect(p.projection.growth.altasPorMes).toBe(0);
    expect(p.projection.beta!.altasPorMes).toBe(0);
  });

  it('en modo porcentaje la publicidad no se usa', () => {
    const p = plan();
    p.projection.growth.modoCrecimiento = 'porcentaje';
    const d = coordinarPlan(p);
    expect(d.avisos.map((a) => a.codigo)).toContain('publicidad-sin-uso');
  });

  it('soporte cargado como monto fijo en la etapa real: no se suma, y se avisa con el monto', () => {
    const p = plan();
    const d = coordinarPlan(p); // la etapa real copia la beta, que trae 1.200 de soporte
    const aviso = d.avisos.find((a) => a.codigo === 'soporte-sin-sumar');
    expect(aviso).toBeDefined();
    expect(aviso!.monto).toBeCloseTo(aEur(1200), 4);
    expect(aviso!.moneda).toBe('EUR');
    expect(d.real.soporteSinSumar).toBeCloseTo(aEur(1200), 4);
  });

  it('un plan coherente no tiene avisos', () => {
    const p = plan({
      budgetReal: [
        { c: 'Meta Ads', m: 1000 },
        { c: 'Abogado', m: 500 },
      ],
    });
    expect(coordinarPlan(p).avisos).toEqual([]);
  });
});

describe('cambiarMonedaDeLaProyeccion', () => {
  it('convierte lo que se carga a mano en la proyección', () => {
    const p = plan();
    p.projection.costs.cac = 4;
    p.projection.costs.infraPorUsuario = 0.5;
    p.projection.revenue.membresiaPrecio = 5;
    p.projection.revenue.publicidadMensual = 100;
    cambiarMonedaDeLaProyeccion(p, 'USD');
    expect(p.projectionCurrency).toBe('USD');
    expect(p.projection.costs.cac).toBeCloseTo(4 * TASAS.rateUsd, 4);
    expect(p.projection.costs.infraPorUsuario).toBeCloseTo(0.5 * TASAS.rateUsd, 4);
    expect(p.projection.revenue.membresiaPrecio).toBeCloseTo(5 * TASAS.rateUsd, 4);
    expect(p.projection.revenue.publicidadMensual).toBeCloseTo(100 * TASAS.rateUsd, 4);
  });

  it('ida y vuelta por cualquier camino vuelve al valor original', () => {
    const p = plan();
    p.projection.costs.cac = 4;
    for (const camino of [['USD', 'EUR'], ['ARS', 'EUR'], ['USD', 'ARS', 'EUR'], ['ARS', 'USD', 'ARS', 'EUR']] as const) {
      const copia = JSON.parse(JSON.stringify(p)) as PlanCoordinable;
      for (const m of camino) cambiarMonedaDeLaProyeccion(copia, m);
      expect(copia.projectionCurrency).toBe('EUR');
      expect(copia.projection.costs.cac).toBeCloseTo(4, 4);
    }
  });

  it('a la misma moneda no hace nada', () => {
    const p = plan();
    const antes = JSON.stringify(p);
    cambiarMonedaDeLaProyeccion(p, 'EUR');
    expect(JSON.stringify(p)).toBe(antes);
  });

  it('el CAC y la publicidad cambian de moneda juntos: las altas no se mueven', () => {
    // El error que esto evita: la publicidad (derivada) se convertía sola y el CAC
    // no, así que cambiar de euros a dólares inflaba las altas un 8%.
    const eur = plan();
    coordinarPlan(eur);
    const usd = JSON.parse(JSON.stringify(eur)) as PlanCoordinable;
    cambiarMonedaDeLaProyeccion(usd, 'USD');
    coordinarPlan(usd);
    expect(usd.projection.growth.altasPorMes).toBeCloseTo(eur.projection.growth.altasPorMes, 4);
    expect(usd.projection.beta!.altasPorMes).toBeCloseTo(eur.projection.beta!.altasPorMes, 4);
  });
});

/* ------------------------------------------------------------------ *
 * El motor, alimentado por el plan coordinado
 * ------------------------------------------------------------------ */

describe('el gasto de la proyección ES el de las tablas', () => {
  const correr = (p: PlanCoordinable) => {
    coordinarPlan(p);
    const a: ProjectionAssumptions = {
      growth: {
        ...p.projection.growth,
        usuariosIniciales: 0,
        churnPct: 0,
        techoUsuarios: 0,
        crecimientoPct: 0,
        mesInicio: '2026-10',
      } as ProjectionAssumptions['growth'],
      revenue: { ...p.projection.revenue, membresiaPct: 0, ingresosConIva: false } as ProjectionAssumptions['revenue'],
      costs: {
        ...p.projection.costs,
        pspPct: 0,
        fijosCrecimientoPct: 0,
        costosConIvaPct: 0,
      } as ProjectionAssumptions['costs'],
      taxes: { ivaPct: 0, iibbPct: 0, chequePct: 0, gananciasPct: 0 },
      cajaInicial: 0,
      beta: p.projection.beta,
    };
    return projectFinancials(a).meses;
  };

  it('en la beta: fijos + adquisición del mes = el gasto mensual de la tabla de la beta', () => {
    const p = plan();
    const meses = correr(p);
    // Tabla de la beta: 3000 (publicidad) + 4600 (fijos y soporte) = 7600 USD
    const esperado = aEur(7600);
    for (const m of meses.slice(0, 3)) {
      expect(m.etapa).toBe('beta');
      expect(m.costosFijos + m.costoAdquisicion).toBeCloseTo(esperado, 3);
    }
  });

  it('en la etapa real: fijos + adquisición del mes = fijos + publicidad de la tabla real', () => {
    const p = plan({
      budgetRealCurrency: 'USD',
      budgetReal: [
        { c: 'Meta Ads', m: 5000 },
        { c: 'Abogado', m: 1000 },
        { c: 'Servidores', m: 800 },
      ],
    });
    const meses = correr(p);
    const esperado = aEur(5000 + 1000 + 800);
    for (const m of meses.slice(3, 12)) {
      expect(m.etapa).toBe('real');
      expect(m.costosFijos + m.costoAdquisicion).toBeCloseTo(esperado, 3);
    }
  });

  it('el pasaje de beta a real se nota en los costos y no en el volumen por usuario', () => {
    const p = plan({
      budgetRealCurrency: 'USD',
      budgetReal: [
        { c: 'Meta Ads', m: 6000 },
        { c: 'Abogado', m: 2000 },
      ],
    });
    const meses = correr(p);
    expect(meses[3].costosFijos).toBeCloseTo(aEur(2000), 3);
    expect(meses[3].costoAdquisicion).toBeCloseTo(aEur(6000), 3);
    expect(meses[2].ingresoComision).toBe(0);
    expect(meses[3].ingresoComision).toBeGreaterThan(0);
  });

  it('el ingreso por comisión usa el ticket y la comisión de la economía unitaria', () => {
    const p = plan({ projectionCurrency: 'USD' });
    const meses = correr(p);
    const m = meses[5]; // etapa real
    // volumen = contratos × ticket; comisión = 10% del volumen (de la economía unitaria)
    expect(m.ingresoComision).toBeCloseTo(m.gmv * 0.1, 4);
    expect(m.gmv / (m.contratos || 1)).toBeCloseTo(21, 0);
  });
});
