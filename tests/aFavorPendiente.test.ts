import { describe, it, expect } from '@jest/globals';
import { ETIQUETA_DEL_A_FAVOR, esAFavorPendiente, etiquetaDelAFavor, fechaDeLiquidacion } from '../shared/pagos/aFavorPendiente.js';

/**
 * Lo que el cliente tiene a favor PENDIENTE de liquidar (el pago original sigue en Mercado Pago). La web y la app lo nombran con las mismas palabras
 * y reconocen el movimiento con la misma función: un retiro pendiente o un asiento ya liquidado no son «a favor pendiente».
 */
describe('a favor pendiente: lo que comparten la web y la app', () => {
  it('solo un asiento «pending» marcado como pendiente de liquidación es a favor pendiente', () => {
    expect(esAFavorPendiente({ status: 'pending', metadata: { pendienteDeLiquidacion: true } })).toBe(true);
    // ya liquidado: pasó a saldo
    expect(esAFavorPendiente({ status: 'completed', metadata: { pendienteDeLiquidacion: false } })).toBe(false);
    // un movimiento pendiente de otra cosa (un retiro que espera aprobación) no lo es
    expect(esAFavorPendiente({ status: 'pending', metadata: {} })).toBe(false);
    expect(esAFavorPendiente({ status: 'pending' })).toBe(false);
    expect(esAFavorPendiente({ status: 'pending', metadata: null })).toBe(false);
    // cancelado por la anulación del pago
    expect(esAFavorPendiente({ status: 'failed', metadata: { pendienteDeLiquidacion: false } })).toBe(false);
  });

  it('cada motivo tiene su nombre y uno desconocido cae en «Devolución»', () => {
    expect(etiquetaDelAFavor('sobrante_de_presupuesto')).toBe('Sobrante de un presupuesto');
    expect(etiquetaDelAFavor('cancelacion')).toBe('Devolución por una cancelación');
    expect(etiquetaDelAFavor('baja_de_precio')).toBe('Baja de precio');
    expect(etiquetaDelAFavor('otro')).toBe('Devolución');
    expect(etiquetaDelAFavor('algo-que-no-existe')).toBe(ETIQUETA_DEL_A_FAVOR.otro);
    expect(etiquetaDelAFavor(undefined)).toBe(ETIQUETA_DEL_A_FAVOR.otro);
  });

  it('la fecha se muestra en formato argentino y sin fecha queda vacía', () => {
    const iso = '2026-11-02T12:00:00.000Z';
    expect(fechaDeLiquidacion(iso)).toBe(new Date(iso).toLocaleDateString('es-AR'));
    expect(fechaDeLiquidacion(null)).toBe('');
    expect(fechaDeLiquidacion(undefined)).toBe('');
  });
});
