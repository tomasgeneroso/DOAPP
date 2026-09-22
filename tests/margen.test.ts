import { costosDeOperacion } from '../shared/pricing/margen.js';
import { MINIMUM_COMMISSION_ARS } from '../shared/pricing/minimums.js';
import { COMMISSION_RATES } from '../shared/constants/membershipPricing.js';
import { POLITICAS } from '../shared/constants/policies.js';

/**
 * ¿La comision cubre IVA, IIBB y retenciones? Se prueba con el PEOR caso
 * (retencion del 3% por no inscripto, IIBB propio del 5%) y con el piso: si
 * cierra ahi, cierra siempre. Si alguna vez deja de cerrar, este test es el
 * que lo dice antes que el contador.
 */
describe('que le queda a DOAPP de cada operacion', () => {
  const peor = { rateCobrada: 0.0419, retencionIIBB: 0.03, iibbPropio: 0.05 };

  it('el procesamiento entra y sale: a la tasa de credito, lo cobrado al cliente cubre la tarifa de MP al centavo', () => {
    const c = costosDeOperacion({ precio: 36000, comision: 3600, ...peor });
    expect(c.procesamientoCobrado).toBeCloseTo(c.pasarela, 0);
    expect(Math.abs(c.diferenciaProcesamiento)).toBeLessThan(1);
    // El IVA que MP le factura a DOAPP se descuenta del que DOAPP cobro; lo
    // que gira es el IVA de la comision.
    expect(c.ivaAPagar).toBeCloseTo(756, 0);
  });

  it('con debito (mas barato que la tasa cobrada) la diferencia queda para DOAPP', () => {
    const c = costosDeOperacion({ precio: 36000, comision: 3600, ...peor, ratePasarela: 0.0275 });
    expect(c.diferenciaProcesamiento).toBeGreaterThan(500);
    expect(c.ingreso).toBeGreaterThan(3600);
  });

  it('con la comision del 10% el margen es positivo aunque el credito de IIBB se pierda entero', () => {
    // COMMISSION_RATES esta en porcentaje entero (10), no en fraccion.
    const c = costosDeOperacion({ precio: 36000, comision: 36000 * (COMMISSION_RATES.free / 100), ...peor });
    expect(c.ingreso).toBeCloseTo(3600, 0);
    expect(c.iibbPropio).toBeCloseTo(180, 0);
    // MP retiene sobre el TOTAL acreditado (procesamiento incluido), no sobre
    // la comision: es lo que sorprende.
    expect(c.iibbRetenido).toBeCloseTo(c.totalCobrado * 0.03, 1);
    expect(c.iibbCreditoExcedente).toBeGreaterThan(900);
    expect(c.margenSiCreditoSeUsa).toBeCloseTo(3420, 0);
    expect(c.margenSiCreditoSePierde).toBeGreaterThan(2000);
  });

  it('con el piso de comision, un trabajo chico tambien cierra en el peor caso', () => {
    // Trabajo de $5.000: la comision del 10% seria $500 pero rige el piso.
    const c = costosDeOperacion({ precio: 5000, comision: MINIMUM_COMMISSION_ARS, ...peor });
    expect(c.margenSiCreditoSePierde).toBeGreaterThan(0);
  });

  it('cancelacion sin trabajador con retiro: la media comision retenida cubre IIBB propio y la retencion', () => {
    // Se retiene la mitad de la comision (con su IVA). El procesamiento lo
    // pago el cliente al pagar, asi que para DOAPP sigue siendo cero.
    const mitad = 3600 * POLITICAS.CANCELACION_EN_REVISION_PARTE_COMISION;
    const original = costosDeOperacion({ precio: 36000, comision: 3600, ...peor });
    const c = costosDeOperacion({ precio: 36000, comision: mitad, iva: 378, ...peor });
    // La retencion se sufrio sobre el total original acreditado, no sobre lo retenido.
    expect(mitad - c.iibbPropio - original.iibbRetenido).toBeGreaterThan(0);
  });

  it('durante la beta (comision 0) cada operacion deja la retencion de IIBB como costo sin ingreso', () => {
    // No es un error del codigo: es el costo de la beta, y hay que saberlo.
    // El procesamiento no ayuda: entra y sale.
    const c = costosDeOperacion({ precio: 36000, comision: 0, iva: 0, ...peor });
    expect(c.ingreso).toBeCloseTo(0, 0);
    expect(c.iibbRetenido).toBeCloseTo(c.totalCobrado * 0.03, 1);
    expect(c.margenSiCreditoSePierde).toBeLessThan(0);
  });

  it('sin variables de entorno usa el peor caso, no el mejor', () => {
    const c = costosDeOperacion({ precio: 36000, comision: 3600 });
    expect(c.iibbRetenido).toBeGreaterThanOrEqual(c.totalCobrado * 0.03 - 1);
  });
});
