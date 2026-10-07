import { describe, it, expect } from '@jest/globals';
import {
  tipoDeGasto,
  totalesPorTipo,
  totalesEnMoneda,
  TIPOS_DE_GASTO,
  ROTULO_DE_TIPO,
  PRESUPUESTO_DE_ARRANQUE_USD,
  FIJOS_DE_ARRANQUE_USD,
} from '../shared/pricing/gastos.js';
import {
  SUPUESTOS_UE_DE_ARRANQUE,
  calcularUnidad,
  discrepanciaDeCosto,
} from '../shared/pricing/unidadEconomica.js';

/**
 * Qué es cada gasto del presupuesto.
 *
 * Qué motivó esto: el servidor decidía qué era "publicidad" con la expresión
 * `/ads?|adquisi|marketing|pauta|publicidad|ventas/i`, que coincide con cualquier
 * texto que CONTENGA "ad". "Retainer abogado laboral" y "Honorarios
 * gestor/contador" contaban como publicidad: con el presupuesto por defecto el
 * gasto de adquisición salía US$4.800 en vez de US$3.000, o sea un CAC inflado un
 * 60% y de ahí un LTV/CAC y un payback peores de lo real. El número parecía
 * razonable, y por eso nadie lo vio.
 */

describe('tipoDeGasto: la clasificación por nombre', () => {
  it.each([
    ['Meta Ads / adquisición', 'adquisicion'],
    ['Publicidad en Google', 'adquisicion'],
    ['Pauta mensual', 'adquisicion'],
    ['Marketing de contenidos', 'adquisicion'],
    ['Leads de ventas', 'adquisicion'],
    ['Soporte y resolución de disputas (manual)', 'soporte'],
    ['Atención al cliente', 'soporte'],
    ['Infraestructura tech (hosting, dominio, APIs)', 'fijo'],
    ['Sueldos / founders', 'fijo'],
    ['Contingencia (10%)', 'fijo'],
  ] as const)('"%s" es %s', (nombre, esperado) => {
    expect(tipoDeGasto({ c: nombre })).toBe(esperado);
  });

  it('NO confunde "ad" dentro de otra palabra con publicidad (el error original)', () => {
    /**
     * LA regresión. Todas estas contienen "ad" y NINGUNA es publicidad.
     */
    for (const nombre of [
      'Retainer abogado laboral',
      'Honorarios gestor/contador',
      'Capacitación del equipo',
      'Uploads y almacenamiento',
      'Escribanía y legalización',
      'Seguro de responsabilidad',
      'Cadetería',
    ]) {
      expect({ nombre, tipo: tipoDeGasto({ c: nombre }) }).toEqual({ nombre, tipo: 'fijo' });
    }
  });

  it('no distingue mayúsculas ni acentos de la palabra clave', () => {
    expect(tipoDeGasto({ c: 'PUBLICIDAD' })).toBe('adquisicion');
    expect(tipoDeGasto({ c: 'meta ads' })).toBe('adquisicion');
    expect(tipoDeGasto({ c: 'ATENCIÓN AL CLIENTE' })).toBe('soporte');
  });

  it('el tipo ESCRITO manda sobre el nombre', () => {
    // Una línea llamada "Retainer abogado" pero que el owner marca como fija, o
    // una "Meta Ads" que marca como fija porque es un contrato anual.
    expect(tipoDeGasto({ c: 'Meta Ads', tipo: 'fijo' })).toBe('fijo');
    expect(tipoDeGasto({ c: 'Retainer abogado', tipo: 'adquisicion' })).toBe('adquisicion');
    expect(tipoDeGasto({ c: 'Cualquier cosa', tipo: 'soporte' })).toBe('soporte');
  });

  it('un tipo inválido se ignora y se deduce del nombre', () => {
    for (const tipo of ['marketing', '', null, undefined, 42, {}, ['fijo']]) {
      expect(tipoDeGasto({ c: 'Meta Ads', tipo })).toBe('adquisicion');
      expect(tipoDeGasto({ c: 'Abogado', tipo })).toBe('fijo');
    }
  });

  it('una línea sin nombre ni tipo es fija: es lo más prudente', () => {
    expect(tipoDeGasto({})).toBe('fijo');
    expect(tipoDeGasto({ c: '' })).toBe('fijo');
  });

  it('todos los tipos tienen rótulo', () => {
    for (const t of TIPOS_DE_GASTO) expect(ROTULO_DE_TIPO[t].length).toBeGreaterThan(3);
  });
});

describe('totalesPorTipo', () => {
  const PRESUPUESTO_POR_DEFECTO = [
    { c: 'Meta Ads / adquisición', m: 3000 },
    { c: 'Retainer abogado laboral', m: 1800 },
    { c: 'Infraestructura tech (hosting, dominio, APIs)', m: 900 },
    { c: 'Soporte y resolución de disputas (manual)', m: 1200 },
    { c: 'Sueldos / founders', m: 0 },
    { c: 'Contingencia (10%)', m: 700 },
  ];

  it('con el presupuesto por defecto: la publicidad es US$3.000, no US$4.800', () => {
    const t = totalesPorTipo(PRESUPUESTO_POR_DEFECTO);
    expect(t.adquisicion).toBe(3000); // antes: 4800 (contaba el abogado)
    expect(t.fijo).toBe(1800 + 900 + 700);
    expect(t.soporte).toBe(1200);
    expect(t.total).toBe(7600);
  });

  it('los tres tipos suman el total', () => {
    const t = totalesPorTipo(PRESUPUESTO_POR_DEFECTO);
    expect(t.fijo + t.adquisicion + t.soporte).toBe(t.total);
  });

  it('el tipo escrito cambia los totales', () => {
    const t = totalesPorTipo([
      { c: 'Meta Ads', m: 1000, tipo: 'fijo' },
      { c: 'Abogado', m: 500, tipo: 'adquisicion' },
    ]);
    expect(t).toEqual({ fijo: 1000, adquisicion: 500, soporte: 0, total: 1500 });
  });

  it('ignora montos negativos, vacíos o basura', () => {
    const t = totalesPorTipo([
      { c: 'A', m: -500 },
      { c: 'B', m: NaN },
      { c: 'C', m: 'x' as unknown as number },
      { c: 'D' },
      { c: 'E', m: Infinity },
      { c: 'F', m: 100 },
    ]);
    expect(t.total).toBe(100);
  });

  it('tolera una lista que no es una lista', () => {
    for (const malo of [null, undefined, 'x', 5, {}]) {
      expect(totalesPorTipo(malo as never).total).toBe(0);
    }
  });
});

describe('totalesEnMoneda', () => {
  const TASAS = { rateArs: 1560, rateUsd: 1.08 };
  const FILAS = [
    { c: 'Meta Ads', m: 1080 },
    { c: 'Servidor', m: 108 },
  ];

  it('pasa cada tipo a la otra moneda (1,08 USD = 1 EUR)', () => {
    const t = totalesEnMoneda(FILAS, 'USD', 'EUR', TASAS);
    expect(t.adquisicion).toBeCloseTo(1000, 6);
    expect(t.fijo).toBeCloseTo(100, 6);
    expect(t.total).toBeCloseTo(1100, 6);
  });

  it('la misma moneda no cambia nada', () => {
    expect(totalesEnMoneda(FILAS, 'USD', 'USD', TASAS)).toEqual(totalesPorTipo(FILAS));
  });
});

describe('el presupuesto y los supuestos de arranque', () => {
  const USD_EN_ARS = 1560 / 1.08;

  it('el presupuesto de arranque se clasifica: publicidad 3.000, fijos 3.400, soporte 1.200', () => {
    const t = totalesPorTipo(PRESUPUESTO_DE_ARRANQUE_USD);
    expect(t).toEqual({ fijo: 3400, adquisicion: 3000, soporte: 1200, total: 7600 });
  });

  it('los costos fijos de arranque de la economía unitaria son los del presupuesto', () => {
    // La guía arma su ejemplo con SUPUESTOS_UE_DE_ARRANQUE.fijos: si no coincide con
    // lo que la pantalla deriva del presupuesto, el ejemplo describe otro negocio.
    expect(FIJOS_DE_ARRANQUE_USD).toBe(3400);
    expect(SUPUESTOS_UE_DE_ARRANQUE.fijos).toBe(FIJOS_DE_ARRANQUE_USD);
  });

  it('el costo por contrato de los supuestos de arranque no se aleja del que usa el código', () => {
    const A = SUPUESTOS_UE_DE_ARRANQUE;
    const porContrato = (A.soporte / A.contratos + (A.ticket * (A.disputas + A.fraude)) / 100) * USD_EN_ARS;
    expect(discrepanciaDeCosto(porContrato)).toBeNull();
    // ~US$0,59 ≈ $850, en el orden de los $450 del código
    expect(porContrato).toBeGreaterThan(450 / 3);
    expect(porContrato).toBeLessThan(450 * 3);
  });

  it('con los supuestos anteriores (soporte 1, disputas 2,5, fraude 0,8) el aviso SÍ saltaba', () => {
    const viejo = (1 / 0.8 + (21 * (2.5 + 0.8)) / 100) * USD_EN_ARS;
    expect(discrepanciaDeCosto(viejo)).not.toBeNull();
  });

  it('con los de arranque hay margen positivo: el plan por defecto tiene punto de equilibrio', () => {
    const A = SUPUESTOS_UE_DE_ARRANQUE;
    const u = calcularUnidad({
      ticket: A.ticket,
      contratos: A.contratos,
      comisionPct: A.comision,
      soporte: A.soporte,
      disputasPct: A.disputas,
      fraudePct: A.fraude,
    });
    expect(u.exacto.margen).toBeGreaterThan(0);
  });
});
