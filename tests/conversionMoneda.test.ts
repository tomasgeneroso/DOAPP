import { describe, it, expect } from '@jest/globals';
import {
  aEuros,
  convertirMoneda,
  convertirImportesUe,
  CAMPOS_IMPORTE_UE,
  type Tasas,
} from '../shared/pricing/conversionMoneda.js';
import { calcularUnidad, mauDeEquilibrio } from '../shared/pricing/unidadEconomica.js';

/**
 * Cambiar la moneda de la sección "Unit economics" del plan.
 *
 * Qué motivó esto: al pasar el selector de dólares a pesos los números no
 * cambiaban, sólo el símbolo. `ticket = 21` pasaba de "US$21" a "$21": la
 * pantalla afirmaba un ticket de veintiún pesos y los equivalentes en euros
 * caían a cero.
 *
 * Y al arreglarlo apareció un segundo error, que estaba tapado: el punto de
 * equilibrio se calculaba con el margen REDONDEADO a centavos. En dólares, un
 * margen real de 0,1256 se redondeaba a 0,13 y el resultado salía 3,5% bajo; en
 * pesos el mismo margen es 181,43 y el redondeo no pesa. O sea que el punto de
 * equilibrio dependía de la moneda con que se mirara.
 */

const TASAS: Tasas = { rateArs: 1560, rateUsd: 1.08 };
const OTRAS: Tasas = { rateArs: 1432.57, rateUsd: 1.1632 };

/** Los valores por defecto del plan (server/routes/admin/businessPlan.ts). */
const UE_POR_DEFECTO = {
  comision: 10,
  ticket: 21,
  contratos: 0.8,
  disputas: 2.5,
  soporte: 1,
  fijos: 18000,
  fraude: 0.8,
  mauActual: 0,
};

const equilibrio = (ue: typeof UE_POR_DEFECTO) => {
  const u = calcularUnidad({
    ticket: ue.ticket,
    contratos: ue.contratos,
    comisionPct: ue.comision,
    soporte: ue.soporte,
    disputasPct: ue.disputas,
    fraudePct: ue.fraude,
  });
  return mauDeEquilibrio(ue.fijos, u.exacto.margen);
};

describe('convertirMoneda', () => {
  it('pasa por el euro: 1 EUR = 1560 ARS = 1,08 USD', () => {
    expect(convertirMoneda(1, 'EUR', 'ARS', TASAS)).toBe(1560);
    expect(convertirMoneda(1, 'EUR', 'USD', TASAS)).toBe(1.08);
    expect(aEuros(1.08, 'USD', TASAS)).toBeCloseTo(1, 10);
    expect(aEuros(1560, 'ARS', TASAS)).toBeCloseTo(1, 10);
  });

  it('de dólares a pesos usa la cruzada, no el euro de por medio', () => {
    expect(convertirMoneda(1, 'USD', 'ARS', TASAS)).toBeCloseTo(1560 / 1.08, 8);
  });

  it('la misma moneda devuelve el mismo monto', () => {
    for (const m of ['ARS', 'USD', 'EUR'] as const) {
      expect(convertirMoneda(123.45, m, m, TASAS)).toBe(123.45);
    }
  });

  it('ir y volver no cambia el monto', () => {
    for (const [a, b] of [['USD', 'ARS'], ['ARS', 'EUR'], ['EUR', 'USD']] as const) {
      const ida = convertirMoneda(1000, a, b, OTRAS);
      expect(convertirMoneda(ida, b, a, OTRAS)).toBeCloseTo(1000, 8);
    }
  });

  it('no se rompe con tasas faltantes ni montos basura', () => {
    expect(convertirMoneda(100, 'USD', 'ARS', { rateArs: 0, rateUsd: 0 })).toBe(100);
    expect(convertirMoneda(NaN, 'USD', 'ARS', TASAS)).toBe(0);
    expect(convertirMoneda('x' as unknown as number, 'USD', 'ARS', TASAS)).toBe(0);
  });
});

describe('convertirImportesUe', () => {
  it('convierte los tres importes', () => {
    const r = convertirImportesUe(UE_POR_DEFECTO, 'USD', 'ARS', TASAS);
    // 21 USD = 21 × 1560 ÷ 1,08 = 30.333,33 ARS
    expect(r.ticket).toBe(30333.3333);
    expect(r.soporte).toBe(1444.4444);
    expect(r.fijos).toBe(26000000);
  });

  it('NO toca los porcentajes ni las cantidades', () => {
    /**
     * `comision`, `disputas` y `fraude` son porcentajes; `contratos` y
     * `mauActual` son cantidades. Convertirlos los rompería: un 10% de comisión
     * no pasa a ser 14.444% por cambiar de dólares a pesos.
     */
    const r = convertirImportesUe(UE_POR_DEFECTO, 'USD', 'ARS', TASAS);
    for (const campo of ['comision', 'disputas', 'fraude', 'contratos', 'mauActual'] as const) {
      expect(r[campo]).toBe(UE_POR_DEFECTO[campo]);
    }
  });

  it('los campos convertidos son exactamente los declarados como importes', () => {
    const r = convertirImportesUe(UE_POR_DEFECTO, 'USD', 'ARS', TASAS);
    const cambiaron = Object.keys(UE_POR_DEFECTO).filter(
      (k) => (r as Record<string, number>)[k] !== (UE_POR_DEFECTO as Record<string, number>)[k],
    );
    expect(cambiaron.sort()).toEqual([...CAMPOS_IMPORTE_UE].sort());
  });

  it('la misma moneda devuelve el mismo objeto, sin copiarlo', () => {
    expect(convertirImportesUe(UE_POR_DEFECTO, 'USD', 'USD', TASAS)).toBe(UE_POR_DEFECTO);
  });

  it('no muta el original', () => {
    const copia = { ...UE_POR_DEFECTO };
    convertirImportesUe(UE_POR_DEFECTO, 'USD', 'ARS', TASAS);
    expect(UE_POR_DEFECTO).toEqual(copia);
  });

  it('dólares -> pesos -> dólares vuelve EXACTAMENTE al valor original', () => {
    // El viaje que importa en Argentina. Con cualquier tasa.
    for (const tasas of [TASAS, OTRAS]) {
      const ida = convertirImportesUe(UE_POR_DEFECTO, 'USD', 'ARS', tasas);
      const vuelta = convertirImportesUe(ida, 'ARS', 'USD', tasas);
      expect(vuelta.ticket).toBe(UE_POR_DEFECTO.ticket);
      expect(vuelta.soporte).toBe(UE_POR_DEFECTO.soporte);
      expect(vuelta.fijos).toBe(UE_POR_DEFECTO.fijos);
    }
  });

  it('dando la vuelta por euros vuelve hasta la última cifra, no necesariamente exacto', () => {
    /**
     * Esto es lo que NO se promete, dicho en un test para que nadie lo prometa
     * por error. Al volver de euros a dólares el error de redondeo se multiplica
     * por la tasa (1,08 o 1,16), así que puede pasar de media unidad de la última
     * cifra y devolver 20,9999 en vez de 21. Con cifras significativas era peor:
     * 0,9999996 en vez de 1. Ningún redondeo fijo lo evita del todo.
     */
    for (const tasas of [TASAS, OTRAS]) {
      const enArs = convertirImportesUe(UE_POR_DEFECTO, 'USD', 'ARS', tasas);
      const enEur = convertirImportesUe(enArs, 'ARS', 'EUR', tasas);
      const vuelta = convertirImportesUe(enEur, 'EUR', 'USD', tasas);
      expect(Math.abs(vuelta.ticket - UE_POR_DEFECTO.ticket)).toBeLessThan(2e-4);
      expect(Math.abs(vuelta.soporte - UE_POR_DEFECTO.soporte)).toBeLessThan(2e-4);
      expect(Math.abs(vuelta.fijos - UE_POR_DEFECTO.fijos)).toBeLessThan(0.01);
    }
  });
});

describe('el punto de equilibrio no depende de la moneda', () => {
  it('el margen exacto no está redondeado, y el de mostrar sí', () => {
    const u = calcularUnidad({ ticket: 21, contratos: 0.8, comisionPct: 10, soporte: 1, disputasPct: 2.5, fraudePct: 0.8 });
    expect(u.margen).toBe(0.13); // lo que se muestra
    expect(u.exacto.margen).toBeCloseTo(0.1256, 4); // con lo que se divide
  });

  it.each([
    ['las tasas por defecto', TASAS],
    ['otras tasas', OTRAS],
  ])('USD, ARS y EUR dan el mismo equilibrio (%s)', (_nombre, tasas) => {
    const enUsd = equilibrio(UE_POR_DEFECTO)!;
    for (const moneda of ['ARS', 'EUR'] as const) {
      const convertido = convertirImportesUe(UE_POR_DEFECTO, 'USD', moneda, tasas);
      const mau = equilibrio(convertido)!;
      // Menos de 0,05% sobre ~143 mil usuarios: es el redondeo a cuatro decimales
      // de los campos convertidos, no una diferencia de método.
      expect(Math.abs(mau - enUsd) / enUsd).toBeLessThan(0.0005);
    }
  });

  it('con el margen redondeado, en cambio, daba 3,5% menos en dólares', () => {
    /**
     * Es lo que hacía la pantalla antes. Se deja como prueba de por qué existe
     * `exacto`: si alguien vuelve a dividir por `margen`, este número es el que
     * vuelve a aparecer.
     */
    const u = calcularUnidad({ ticket: 21, contratos: 0.8, comisionPct: 10, soporte: 1, disputasPct: 2.5, fraudePct: 0.8 });
    const viejo = Math.ceil(18000 / u.margen);
    const bueno = mauDeEquilibrio(18000, u.exacto.margen)!;
    expect(viejo).toBe(138462);
    expect(bueno).toBeGreaterThan(143000);
    expect((bueno - viejo) / bueno).toBeGreaterThan(0.03);
  });

  it('sin margen positivo no hay equilibrio, en vez de un número absurdo', () => {
    expect(mauDeEquilibrio(18000, 0)).toBeNull();
    expect(mauDeEquilibrio(18000, -5)).toBeNull();
    expect(mauDeEquilibrio(18000, NaN)).toBeNull();
    expect(mauDeEquilibrio(18000, Infinity)).toBeNull();
  });
});
