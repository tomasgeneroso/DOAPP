import { describe, it, expect } from '@jest/globals';
import { splitFees } from '../shared/pricing/processingCost';

/**
 * Reporte del dueño, 2026-11-19: «si el contrato es de 10.000, Mercado Pago me pide pagar 10.560,99: ¿está bien calculada la comisión?». Durante la beta DOAPP no cobra comisión; lo que se suma
 * es el costo de procesamiento de la pasarela (4,39 % del total cobrado, la tarifa de MP a 10 días) más el IVA de ese costo. La cuenta cierra al centavo.
 */
describe('un trabajo de $10.000 en la beta', () => {
  const r = splitFees(10000, 0, 0, 0.0439);

  it('el total es el que pide Mercado Pago: precio + procesamiento + IVA del procesamiento', () => {
    expect(r.processingCharge).toBeCloseTo(463.63, 2);
    expect(r.processingVat).toBeCloseTo(97.36, 2);
    expect(r.clientPays).toBeCloseTo(10560.99, 2); // exactamente lo que mostró Mercado Pago
  });

  it('la tarifa de MP sobre el total queda cubierta por lo que se sumó (DOAPP no pierde ni gana en el procesamiento)', () => {
    expect(r.processingCost + r.processingCostVat).toBeCloseTo(r.processingCharge + r.processingVat, 1);
    expect(r.workerReceives).toBe(10000);
    expect(r.platformKeeps).toBeCloseTo(0, 1);
  });
});
