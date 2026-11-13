import { describe, it, expect } from '@jest/globals';
import { diasQueFaltan, textoDelCobro, RECORDATORIO_DE_LIBERACION } from '../shared/pagos/cobroEnEspera.js';
import { POLITICAS } from '../shared/constants/policies.js';

/**
 * Pedido del dueño (2026-11-13): el cobro en espera de liberación se ve con los días que faltan, se recuerda cuánto tarda en liberarse y se dice si ya se puede
 * retirar o no. El trabajador lo puede pedir solo cuando ya está liberado.
 */
describe('cobro en espera de liberación (textos)', () => {
  const ahora = new Date('2026-11-13T12:00:00Z');
  const enDias = (n: number) => new Date(ahora.getTime() + n * 86_400_000).toISOString();

  it('cuenta los días que faltan hacia arriba (hasta que llega la fecha no es «0 días»)', () => {
    expect(diasQueFaltan(enDias(3), ahora)).toBe(3);
    expect(diasQueFaltan(new Date(ahora.getTime() + 3_600_000).toISOString(), ahora)).toBe(1);
    expect(diasQueFaltan(enDias(-2), ahora)).toBe(0);
    expect(diasQueFaltan(null, ahora)).toBe(0);
    expect(diasQueFaltan('no es una fecha', ahora)).toBe(0);
  });

  it('en espera: dice cuántos días faltan, desde cuándo, y recuerda los plazos (los números salen de POLITICAS)', () => {
    const t = textoDelCobro({ liberado: false, disponibleDesde: enDias(4) }, ahora);
    expect(t.estado).toBe('En espera de liberación');
    expect(t.puedePedir).toBe(false);
    expect(t.detalle).toContain('Faltan 4 días');
    expect(t.detalle).toContain(String(POLITICAS.DIAS_LIBERACION_PAGO));
    expect(t.detalle).toContain(String(POLITICAS.DIAS_PARA_DISPUTAR));
    expect(RECORDATORIO_DE_LIBERACION).toContain(`${POLITICAS.DIAS_LIBERACION_PAGO} días`);
    expect(textoDelCobro({ liberado: false, disponibleDesde: enDias(1) }, ahora).detalle).toContain('Faltan 1 día:');
  });

  it('liberado: se puede pedir (cobro de un trabajo) o retirar (cobro por saldo)', () => {
    const pedir = textoDelCobro({ liberado: true, disponibleDesde: enDias(-1) }, ahora);
    expect(pedir).toMatchObject({ estado: 'Liberado', puedePedir: true });
    expect(pedir.detalle).toContain('pedí el cobro');
    const saldo = textoDelCobro({ liberado: true, disponibleDesde: enDias(-1) }, ahora, true);
    expect(saldo.puedePedir).toBe(false);
    expect(saldo.detalle).toContain('retirar');
  });

  it('ya pedido: lo paga el equipo, no se vuelve a pedir', () => {
    const t = textoDelCobro({ liberado: true, disponibleDesde: enDias(-1), pedidoEl: ahora.toISOString() }, ahora);
    expect(t.estado).toBe('Cobro pedido');
    expect(t.puedePedir).toBe(false);
  });

  it('una fecha que ya pasó cuenta como liberado aunque el servidor no lo haya marcado', () => {
    expect(textoDelCobro({ liberado: false, disponibleDesde: enDias(-1) }, ahora).estado).toBe('Liberado');
  });
});
