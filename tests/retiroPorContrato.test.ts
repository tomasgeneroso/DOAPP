import { describe, it, expect } from '@jest/globals';
import { conceptoDelCredito, esperaDelCredito, type CreditoParaRetirar } from '../shared/pagos/retiroPorContrato';

/** La regla de cuándo se puede retirar cada peso (pedido del dueño, 2026-11-27: atar los retiros por contrato y verificar estados). */
const base: CreditoParaRetirar = { concepto: 'otro', creadoEl: '2026-11-01T00:00:00Z', tieneTrabajo: false, tieneContrato: false };
const ahora = new Date('2026-11-20T00:00:00Z');
const motivo = (c: Partial<CreditoParaRetirar>) => esperaDelCredito({ ...base, ...c }, ahora)?.motivo ?? null;

describe('cuándo se puede retirar', () => {
  it('lo que cobró quien trabajó espera a que su contrato termine', () => {
    const cobro = { concepto: 'cobro_del_trabajo' as const, tieneContrato: true };
    for (const estado of ['pending', 'accepted', 'in_progress', 'awaiting_confirmation', 'disputed']) expect(motivo({ ...cobro, contrato: { estado } })).toBe('contrato_sin_terminar');
    expect(motivo({ ...cobro, contrato: { estado: 'completed' } })).toBeNull();
    // Cancelado con parte para quien trabajó (T&C 9.3): el contrato está cerrado.
    expect(motivo({ ...cobro, contrato: { estado: 'cancelled' } })).toBeNull();
  });

  it('lo que quedó a favor por bajar un presupuesto espera a que el trabajo termine', () => {
    const bajaDe = (estado: string, canceladoEl?: string) => motivo({ concepto: 'baja_de_presupuesto', tieneTrabajo: true, trabajo: { estado, canceladoEl } });
    for (const estado of ['draft', 'open', 'paused', 'in_progress']) expect(bajaDe(estado)).toBe('trabajo_en_curso');
    expect(bajaDe('completed')).toBeNull();
    expect(bajaDe('cancelled')).toBeNull();
    // Se canceló después de la baja y se volvió a publicar: ese presupuesto ya se había cerrado.
    expect(bajaDe('open', '2026-11-05T00:00:00Z')).toBeNull();
    expect(bajaDe('open', '2026-10-01T00:00:00Z')).toBe('trabajo_en_curso');
  });

  it('con un reclamo abierto o sin la liberación de la pasarela, espera', () => {
    expect(motivo({ concepto: 'cobro_del_trabajo', tieneContrato: true, contrato: { estado: 'completed' }, conReclamo: true })).toBe('reclamo');
    expect(motivo({ disponibleDesde: '2026-11-25T00:00:00Z' })).toBe('liberacion');
    expect(motivo({ disponibleDesde: '2026-11-10T00:00:00Z' })).toBeNull();
  });

  it('si dice venir de un trabajo o contrato que no se encuentra, no sale', () => {
    expect(motivo({ concepto: 'baja_de_presupuesto', tieneTrabajo: true, trabajo: null })).toBe('sin_respaldo');
    expect(motivo({ concepto: 'cobro_del_trabajo', tieneContrato: true, contrato: null })).toBe('sin_respaldo');
  });

  it('reconoce de qué es cada movimiento del libro', () => {
    expect(conceptoDelCredito('payment', {})).toBe('cobro_del_trabajo');
    expect(conceptoDelCredito('refund', { origen: 'baja_de_precio' })).toBe('baja_de_presupuesto');
    expect(conceptoDelCredito('refund', { origen: 'cotizacion_menor', reason: 'price_decrease' })).toBe('baja_de_presupuesto');
    expect(conceptoDelCredito('refund', { origen: 'equipo_parcial' })).toBe('sobrante_de_presupuesto');
    expect(conceptoDelCredito('refund', { origen: 'cancelacion' })).toBe('devolucion');
    expect(conceptoDelCredito('adjustment', {})).toBe('otro');
  });
});
