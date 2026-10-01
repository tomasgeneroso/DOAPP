import { describe, it, expect } from '@jest/globals';
import {
  calcularUnidad,
  discrepanciaDeCosto,
  COSTO_MARGINAL_SEGUN_EL_CODIGO,
} from '../shared/pricing/unidadEconomica.js';
import { COMMISSION_RATES } from '../shared/constants/membershipPricing.js';
import { MARGINAL_COST_PER_CONTRACT_ARS, precioDondeElPisoDejaDeMorder } from '../shared/pricing/minimums.js';

/**
 * La cuenta de la unidad económica.
 *
 * Existe este archivo porque la misma cuenta estaba escrita dos veces —en la
 * pantalla del plan y en el servicio de métricas— y las dos versiones no
 * coincidían: una trataba `disputas` y `fraude` como porcentajes del volumen,
 * la otra los sumaba como importes. Con los valores por defecto eso daba
 * $17.628 de costo por contrato donde el real era $3.031, y el error se
 * mostraba en pantalla como si fuera un dato.
 *
 * Lo que fijan estos tests no es la aritmética (que es trivial) sino la
 * interpretación de cada campo, que es lo que estaba mal.
 */

describe('qué significa cada campo', () => {
  it('soporte es un importe fijo, no un porcentaje', () => {
    // Dos escenarios con el mismo volumen y distinto soporte: la diferencia
    // tiene que ser exactamente la diferencia de soporte.
    const a = calcularUnidad({ ticket: 10000, contratos: 1, soporte: 100, disputasPct: 0, fraudePct: 0 });
    const b = calcularUnidad({ ticket: 10000, contratos: 1, soporte: 300, disputasPct: 0, fraudePct: 0 });
    expect(b.costoTotal - a.costoTotal).toBe(200);
  });

  it('disputas y fraude son porcentajes del volumen, no importes', () => {
    /**
     * Éste es EL test. Si alguien vuelve a sumarlos como dólares, acá se pone
     * en rojo: con 2,5% sobre un volumen de 10.000 el costo es 250, no 2,5.
     */
    const u = calcularUnidad({ ticket: 10000, contratos: 1, soporte: 0, disputasPct: 2.5, fraudePct: 0.8 });
    expect(u.costoDisputas).toBe(250);
    expect(u.costoFraude).toBe(80);
    expect(u.costoTotal).toBe(330);
  });

  it('escalan con el volumen, que es la razón de que sean porcentajes', () => {
    const chico = calcularUnidad({ ticket: 10000, contratos: 1, soporte: 0, disputasPct: 2.5, fraudePct: 0 });
    const grande = calcularUnidad({ ticket: 100000, contratos: 1, soporte: 0, disputasPct: 2.5, fraudePct: 0 });
    expect(grande.costoDisputas).toBe(chico.costoDisputas * 10);
  });

  it('todo es por usuario y por mes: el volumen es ticket × contratos', () => {
    const u = calcularUnidad({ ticket: 10000, contratos: 0.8, soporte: 0, disputasPct: 0, fraudePct: 0 });
    expect(u.volumen).toBe(8000);
  });
});

describe('la cuenta cierra', () => {
  it('ingreso menos costo es el margen, siempre', () => {
    for (const ticket of [1000, 32760, 132600, 1_000_000]) {
      for (const contratos of [0.15, 0.8, 3]) {
        const u = calcularUnidad({ ticket, contratos, soporte: 1560, disputasPct: 2.5, fraudePct: 0.8 });
        expect(Math.abs(u.ingreso - u.costoTotal - u.margen)).toBeLessThan(0.02);
        expect(Math.abs(u.costoSoporte + u.costoDisputas + u.costoFraude - u.costoTotal)).toBeLessThan(0.02);
      }
    }
  });

  it('el por-contrato es el mensual dividido por la frecuencia', () => {
    const u = calcularUnidad({ ticket: 32760, contratos: 0.8, soporte: 1560, disputasPct: 2.5, fraudePct: 0.8 });
    expect(Math.abs(u.porContrato.margen * 0.8 - u.margen)).toBeLessThan(0.02);
    // El ingreso por contrato es ticket × comisión, sin importar la frecuencia.
    expect(u.porContrato.ingreso).toBeCloseTo(32760 * (COMMISSION_RATES.free / 100), 1);
  });

  it('con frecuencia cero no divide por cero', () => {
    const u = calcularUnidad({ ticket: 10000, contratos: 0, soporte: 500, disputasPct: 2.5, fraudePct: 0.8 });
    expect(u.porContrato.ingreso).toBe(0);
    expect(u.porContrato.costo).toBe(0);
    expect(Number.isFinite(u.margen)).toBe(true);
  });

  it('basura de entrada no produce NaN', () => {
    for (const malo of [NaN, Infinity, -5, null, undefined, 'x']) {
      const u = calcularUnidad({
        ticket: malo as any,
        contratos: malo as any,
        soporte: malo as any,
        disputasPct: malo as any,
        fraudePct: malo as any,
      });
      for (const v of [u.volumen, u.ingreso, u.costoTotal, u.margen]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe('la comisión sale del código', () => {
  it('sin comisión declarada usa la que se cobra de verdad', () => {
    // El plan tuvo 12% durante meses mientras el código cobraba 10%: toda
    // proyección hecha con ese plan sobreestimaba el ingreso un 20%.
    const u = calcularUnidad({ ticket: 10000, contratos: 1, soporte: 0, disputasPct: 0, fraudePct: 0 });
    expect(u.comisionPct).toBe(COMMISSION_RATES.free);
    expect(u.ingreso).toBe(10000 * (COMMISSION_RATES.free / 100));
  });

  it('una comisión explícita se respeta, para poder explorar escenarios', () => {
    const u = calcularUnidad({ ticket: 10000, contratos: 1, comisionPct: 25, soporte: 0, disputasPct: 0, fraudePct: 0 });
    expect(u.ingreso).toBe(2500);
  });
});

describe('el aviso de discrepancia con el costo del código', () => {
  it('no avisa cuando están en el mismo orden', () => {
    expect(discrepanciaDeCosto(MARGINAL_COST_PER_CONTRACT_ARS)).toBeNull();
    expect(discrepanciaDeCosto(MARGINAL_COST_PER_CONTRACT_ARS * 2)).toBeNull();
    expect(discrepanciaDeCosto(MARGINAL_COST_PER_CONTRACT_ARS / 2)).toBeNull();
  });

  it('avisa cuando el plan se va de rango, para arriba o para abajo', () => {
    const arriba = discrepanciaDeCosto(MARGINAL_COST_PER_CONTRACT_ARS * 10);
    expect(arriba).toMatch(/más/i);
    expect(arriba).toMatch(/minimums\.ts/);

    const abajo = discrepanciaDeCosto(MARGINAL_COST_PER_CONTRACT_ARS / 10);
    expect(abajo).toMatch(/menos/i);
  });

  it('con cero o basura no avisa nada', () => {
    for (const malo of [0, -1, NaN, Infinity]) {
      expect(discrepanciaDeCosto(malo)).toBeNull();
    }
  });

  it('el costo de referencia es el del código, no una copia', () => {
    // Si alguien cambia MARGINAL_COST_PER_CONTRACT_ARS, esto lo sigue solo.
    expect(COSTO_MARGINAL_SEGUN_EL_CODIGO).toBe(MARGINAL_COST_PER_CONTRACT_ARS);
  });
});

describe('los supuestos por defecto del plan dan un negocio que cierra', () => {
  /**
   * No es un test de aritmética: es una verificación de que los valores con los
   * que arranca el plan describen algo viable. Estuvieron en ticket USD 85 y
   * soporte USD 8, que daban margen negativo por contrato — y el tablero lo
   * mostraba como si fuera el negocio real.
   */
  const USD_ARS = 1560;
  const DEFAULTS = { ticket: 21, contratos: 0.8, comision: 10, soporte: 1, disputas: 2.5, fraude: 0.8 };

  const u = calcularUnidad({
    ticket: DEFAULTS.ticket * USD_ARS,
    contratos: DEFAULTS.contratos,
    comisionPct: DEFAULTS.comision,
    soporte: DEFAULTS.soporte * USD_ARS,
    disputasPct: DEFAULTS.disputas,
    fraudePct: DEFAULTS.fraude,
  });

  it('el margen por contrato es positivo', () => {
    expect(u.porContrato.margen).toBeGreaterThan(0);
  });

  it('el ticket por defecto está cerca del precio donde el piso deja de morder', () => {
    // Por debajo de ese precio la comisión mínima se come una proporción
    // grande del trabajo, así que es el ticket más chico que tiene sentido
    // modelar. Antes el default era cuatro veces más alto.
    const piso = precioDondeElPisoDejaDeMorder(1736.7);
    const ticketArs = DEFAULTS.ticket * USD_ARS;
    expect(ticketArs).toBeGreaterThan(piso * 0.7);
    expect(ticketArs).toBeLessThan(piso * 1.5);
  });

  it('la comisión por defecto es la que se cobra de verdad', () => {
    expect(DEFAULTS.comision).toBe(COMMISSION_RATES.free);
  });
});
