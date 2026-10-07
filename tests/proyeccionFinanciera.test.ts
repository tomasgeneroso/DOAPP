import { describe, it, expect } from '@jest/globals';
import {
  projectFinancials,
  proyeccionHastaMes,
  resumenPorHorizonte,
  resumirProyeccion,
  applyScenario,
  HORIZONTES,
  SCENARIOS,
  type ProjectionAssumptions,
  type EtapaBeta,
} from '../client/utils/financialProjection.js';

/**
 * El motor de la proyección tenía cero tests. Ahora tiene la beta (comisión 0%,
 * pocos usuarios, fijos propios) antes de la etapa real, y horizontes de 1, 3, 5 y
 * 10 años: con eso el motor decide si el negocio se sostiene, así que tiene que
 * estar verificado con números hechos a mano, no sólo "no rompe".
 */

/** Un negocio simple y sin impuestos, para poder hacer las cuentas de cabeza. */
const base = (over: Partial<ProjectionAssumptions> = {}): ProjectionAssumptions => ({
  growth: {
    usuariosIniciales: 100,
    modoCrecimiento: 'absoluto',
    crecimientoPct: 0,
    altasPorMes: 0,
    churnPct: 0,
    techoUsuarios: 0,
    horizonteMeses: 12,
    mesInicio: '2026-10',
  },
  revenue: {
    ticket: 100,
    contratosPorUsuario: 0.5,
    comisionPct: 10,
    membresiaPct: 0,
    membresiaPrecio: 0,
    publicidadMensual: 0,
    ingresosConIva: false,
  },
  costs: {
    soportePorUsuario: 0,
    infraPorUsuario: 0,
    pspPct: 0,
    disputasPct: 0,
    fraudePct: 0,
    cac: 0,
    fijosMensuales: 0,
    fijosCrecimientoPct: 0,
    costosConIvaPct: 0,
  },
  taxes: { ivaPct: 0, iibbPct: 0, chequePct: 0, gananciasPct: 0 },
  cajaInicial: 0,
  ...over,
});

const conBeta = (beta: Partial<EtapaBeta>, over: Partial<ProjectionAssumptions> = {}) =>
  base({
    beta: { meses: 3, comisionPct: 0, altasPorMes: 0, fijosMensuales: 0, soportePorUsuario: 0, ...beta },
    ...over,
  });

describe('sin beta: el motor se comporta como siempre', () => {
  it('100 usuarios × 0,5 contratos × US$100 = US$5.000 de volumen y US$500 de comisión', () => {
    const { meses } = projectFinancials(base());
    expect(meses[0].contratos).toBe(50);
    expect(meses[0].gmv).toBe(5000);
    expect(meses[0].ingresoComision).toBe(500);
    expect(meses.every((m) => m.etapa === 'real')).toBe(true);
  });

  it('una beta de 0 meses es lo mismo que no tener beta', () => {
    const a = projectFinancials(base());
    const b = projectFinancials(conBeta({ meses: 0, fijosMensuales: 99999, altasPorMes: 99999 }));
    expect(b.meses).toEqual(a.meses);
    expect(b.resumen).toEqual(a.resumen);
  });

  it('los costos fijos crecen por mes desde el primero', () => {
    const { meses } = projectFinancials(
      base({ costs: { ...base().costs, fijosMensuales: 1000, fijosCrecimientoPct: 10 } }),
    );
    expect(meses[0].costosFijos).toBeCloseTo(1000, 6);
    expect(meses[1].costosFijos).toBeCloseTo(1100, 6);
    expect(meses[2].costosFijos).toBeCloseTo(1210, 6);
  });
});

describe('con beta: la comisión', () => {
  it('no se cobra mientras dura la beta y se cobra desde el mes siguiente', () => {
    const { meses } = projectFinancials(conBeta({ meses: 3, comisionPct: 0 }));
    expect(meses.slice(0, 3).map((m) => m.ingresoComision)).toEqual([0, 0, 0]);
    expect(meses[3].ingresoComision).toBe(500);
    expect(meses.slice(0, 3).every((m) => m.etapa === 'beta')).toBe(true);
    expect(meses[3].etapa).toBe('real');
  });

  it('si la beta cobrara algo, se usa ese porcentaje y no el de la etapa real', () => {
    const { meses } = projectFinancials(conBeta({ meses: 2, comisionPct: 4 }));
    expect(meses[0].ingresoComision).toBe(200); // 5000 × 4%
    expect(meses[2].ingresoComision).toBe(500); // 5000 × 10%
  });

  it('el volumen y los contratos NO cambian con la etapa: la gente trabaja igual', () => {
    const { meses } = projectFinancials(conBeta({ meses: 3 }));
    expect(meses[0].gmv).toBe(meses[3].gmv);
    expect(meses[0].contratos).toBe(meses[3].contratos);
  });
});

describe('con beta: los costos fijos', () => {
  const a = conBeta(
    { meses: 3, fijosMensuales: 1000 },
    { costs: { ...base().costs, fijosMensuales: 5000, fijosCrecimientoPct: 10 } },
  );

  it('la beta usa los suyos, planos (en la beta no se contrata)', () => {
    const { meses } = projectFinancials(a);
    expect(meses.slice(0, 3).map((m) => m.costosFijos)).toEqual([1000, 1000, 1000]);
  });

  it('al terminar la beta empiezan los de la etapa real, y recién ahí crecen', () => {
    const { meses } = projectFinancials(a);
    expect(meses[3].costosFijos).toBeCloseTo(5000, 6);
    expect(meses[4].costosFijos).toBeCloseTo(5500, 6);
    expect(meses[5].costosFijos).toBeCloseTo(6050, 6);
  });

  it('el soporte por usuario de la beta se aplica sólo en la beta', () => {
    const p = conBeta(
      { meses: 2, soportePorUsuario: 2 },
      { costs: { ...base().costs, soportePorUsuario: 5 } },
    );
    const { meses } = projectFinancials(p);
    // 100 usuarios sin altas ni bajas
    expect(meses[0].costosVariables).toBeCloseTo(200, 6);
    expect(meses[2].costosVariables).toBeCloseTo(500, 6);
  });
});

describe('con beta: las altas', () => {
  it('suman las de la beta, y desde la etapa real rige el crecimiento de la etapa real', () => {
    const p = conBeta(
      { meses: 3, altasPorMes: 50 },
      { growth: { ...base().growth, usuariosIniciales: 0, altasPorMes: 10 } },
    );
    const { meses } = projectFinancials(p);
    expect(meses.map((m) => m.usuarios).slice(0, 4)).toEqual([50, 100, 150, 160]);
  });

  it('el techo de mercado también frena las altas de la beta', () => {
    const p = conBeta(
      { meses: 3, altasPorMes: 100 },
      { growth: { ...base().growth, usuariosIniciales: 0, techoUsuarios: 100 } },
    );
    const { meses } = projectFinancials(p);
    expect(meses[2].usuarios).toBeLessThanOrEqual(100);
    // sin techo habría 300
    expect(meses[2].usuarios).toBeLessThan(300);
  });

  it('el costo de adquisición de la beta sale de las altas de la beta', () => {
    const p = conBeta(
      { meses: 2, altasPorMes: 40 },
      { costs: { ...base().costs, cac: 3 } },
    );
    const { meses } = projectFinancials(p);
    expect(meses[0].costoAdquisicion).toBeCloseTo(120, 6);
  });
});

describe('con beta: el resumen', () => {
  it('cuenta los meses de beta y guarda la caja con la que termina', () => {
    const p = conBeta({ meses: 3, fijosMensuales: 1000 }, { cajaInicial: 10000 });
    const { meses, resumen } = projectFinancials(p);
    expect(resumen.mesesDeBeta).toBe(3);
    expect(resumen.cajaAlTerminarLaBeta).toBe(meses[2].cajaAcumulada);
    expect(resumen.cajaAlTerminarLaBeta).toBeCloseTo(10000 - 3 * 1000, 6);
  });

  it('sin beta no hay caja "al terminar la beta"', () => {
    const { resumen } = projectFinancials(base());
    expect(resumen.mesesDeBeta).toBe(0);
    expect(resumen.cajaAlTerminarLaBeta).toBeNull();
  });

  it('el margen por usuario se mide en la etapa real, no en la beta sin comisión', () => {
    // En la beta el ingreso por usuario es 0; medir ahí daría un negocio inviable.
    const { resumen } = projectFinancials(
      conBeta({ meses: 6 }, { growth: { ...base().growth, horizonteMeses: 12 } }),
    );
    expect(resumen.margenContribucionUsuario).toBeCloseTo(5, 6); // 500 de comisión ÷ 100 usuarios
  });

  it('una beta más larga que lo proyectado no rompe: todo el tramo es beta', () => {
    const { meses, resumen } = projectFinancials(conBeta({ meses: 50 }));
    expect(meses).toHaveLength(12);
    expect(meses.every((m) => m.etapa === 'beta')).toBe(true);
    expect(resumen.mesesDeBeta).toBe(12);
  });

  it('con la beta, la caja es más baja que sin beta: la comisión que no se cobra', () => {
    const sin = projectFinancials(base()).resumen.cajaFinal;
    const con = projectFinancials(conBeta({ meses: 3 })).resumen.cajaFinal;
    expect(sin - con).toBeCloseTo(3 * 500, 6);
  });
});

describe('entradas rotas', () => {
  it('NaN, texto o negativos en la beta no contaminan el resultado', () => {
    const p = conBeta({
      meses: 3,
      comisionPct: NaN,
      altasPorMes: 'x' as unknown as number,
      fijosMensuales: -500,
      soportePorUsuario: undefined as unknown as number,
    });
    const { meses } = projectFinancials(p);
    for (const m of meses) {
      for (const v of Object.values(m)) {
        if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe('horizontes: 1, 3, 5 y 10 años', () => {
  const larga = (over: Partial<ProjectionAssumptions> = {}) => {
    const a = conBeta(
      { meses: 3, fijosMensuales: 800, altasPorMes: 20 },
      {
        growth: { ...base().growth, usuariosIniciales: 20, horizonteMeses: 120, altasPorMes: 30, churnPct: 3 },
        costs: { ...base().costs, fijosMensuales: 2000, cac: 5 },
        cajaInicial: 20000,
        ...over,
      },
    );
    return { a, p: projectFinancials(a) };
  };

  it('son 12, 36, 60 y 120 meses', () => {
    expect(HORIZONTES.map((h) => h.meses)).toEqual([12, 36, 60, 120]);
    expect(HORIZONTES.map((h) => h.anios)).toEqual([1, 3, 5, 10]);
    for (const h of HORIZONTES) expect(h.meses).toBe(h.anios * 12);
  });

  it('el motor llega a 120 meses', () => {
    const { p } = larga();
    expect(p.meses).toHaveLength(120);
  });

  it('un tramo de la corrida larga es IGUAL a correr sólo ese tramo (sin mirar al futuro)', () => {
    const { a, p } = larga();
    for (const { meses } of HORIZONTES.slice(0, 3)) {
      const tramo = proyeccionHastaMes(p, a, meses);
      const aparte = projectFinancials({ ...a, growth: { ...a.growth, horizonteMeses: meses } });
      expect(tramo.meses).toEqual(aparte.meses);
      expect(tramo.resumen).toEqual(aparte.resumen);
    }
  });

  it('resumenPorHorizonte devuelve los cuatro, en orden', () => {
    const { a, p } = larga();
    const r = resumenPorHorizonte(p, a);
    expect(r.map((x) => x.anios)).toEqual([1, 3, 5, 10]);
    expect(r.map((x) => x.rotulo)).toEqual(['1 año', '3 años', '5 años', '10 años']);
  });

  it('los usuarios y la caja de cada horizonte son los del último mes de ese tramo', () => {
    const { a, p } = larga();
    const r = resumenPorHorizonte(p, a);
    for (const h of r) {
      expect(h.usuarios).toBe(p.meses[h.meses - 1].usuarios);
      expect(h.cajaAcumulada).toBe(p.meses[h.meses - 1].cajaAcumulada);
    }
  });

  it('los ingresos del "último año" son los 12 meses que cierran el horizonte', () => {
    const { a, p } = larga();
    const r = resumenPorHorizonte(p, a);
    for (const h of r) {
      const esperado = p.meses.slice(h.meses - 12, h.meses).reduce((s, m) => s + m.ingresoNeto, 0);
      expect(h.ingresosDelUltimoAnio).toBeCloseTo(esperado, 6);
      const ebitda = p.meses.slice(h.meses - 12, h.meses).reduce((s, m) => s + m.ebitda, 0);
      expect(h.ebitdaDelUltimoAnio).toBeCloseTo(ebitda, 6);
    }
  });

  it('el resultado acumulado crece de un horizonte al siguiente si el negocio es rentable', () => {
    const { a, p } = larga({
      growth: { ...base().growth, usuariosIniciales: 500, horizonteMeses: 120 },
      costs: { ...base().costs, fijosMensuales: 100 },
    });
    const r = resumenPorHorizonte(p, a);
    for (let i = 1; i < r.length; i++) {
      expect(r[i].resultadoAcumulado).toBeGreaterThan(r[i - 1].resultadoAcumulado);
    }
  });

  it('capital mínimo: lo que hace falta para no quedarse sin caja, o 0 si alcanza', () => {
    // Sin ingresos: fijos de 1.000 por mes sobre 2.500 de caja → se hunde
    const pierde = projectFinancials(
      base({
        growth: { ...base().growth, usuariosIniciales: 0, horizonteMeses: 120 },
        costs: { ...base().costs, fijosMensuales: 1000 },
        cajaInicial: 2500,
      }),
    );
    const r1 = resumenPorHorizonte(pierde, base());
    expect(r1[0].capitalMinimo).toBeCloseTo(12 * 1000 - 2500, 6);
    expect(r1[0].mesSinCaja).toBe(3);

    // Con caja de sobra: no hace falta capital
    const sobra = projectFinancials(
      base({
        growth: { ...base().growth, usuariosIniciales: 0, horizonteMeses: 120 },
        costs: { ...base().costs, fijosMensuales: 1000 },
        cajaInicial: 10_000_000,
      }),
    );
    expect(resumenPorHorizonte(sobra, base())[0].capitalMinimo).toBe(0);
  });

  it('proyeccionHastaMes no se pasa del largo de la corrida ni baja de 1', () => {
    const { a, p } = larga();
    expect(proyeccionHastaMes(p, a, 9999).meses).toHaveLength(120);
    expect(proyeccionHastaMes(p, a, 0).meses).toHaveLength(1);
  });

  it('resumirProyeccion de la corrida entera es el resumen que ya traía', () => {
    const { a, p } = larga();
    expect(resumirProyeccion(p.meses, a)).toEqual(p.resumen);
  });
});

describe('escenarios con beta', () => {
  it('mueven las altas de la beta igual que las del crecimiento', () => {
    const a = conBeta({ meses: 3, altasPorMes: 100 });
    expect(applyScenario(a, 'optimista').beta?.altasPorMes).toBeCloseTo(100 * SCENARIOS.optimista.growth, 6);
    expect(applyScenario(a, 'conservador').beta?.altasPorMes).toBeCloseTo(100 * SCENARIOS.conservador.growth, 6);
    expect(applyScenario(a, 'base').beta?.altasPorMes).toBe(100);
  });

  it('sin beta, el escenario no inventa una', () => {
    expect(applyScenario(base(), 'optimista').beta).toBeUndefined();
  });

  it('no toca el objeto original', () => {
    const a = conBeta({ meses: 3, altasPorMes: 100 });
    applyScenario(a, 'optimista');
    expect(a.beta?.altasPorMes).toBe(100);
  });
});
