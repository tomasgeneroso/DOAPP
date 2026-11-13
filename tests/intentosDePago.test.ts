import { describe, it, expect } from '@jest/globals';
import { emparejarIntentos, esEstadoSinPago, SQL_ES_UN_INTENTO_ANIDADO } from '../shared/pagos/intentosDePago';

/**
 * Intentos de pago anidados al pago efectivo (pedido del dueño, 2026-11-13): se tocó «Pagar» 3 veces y solo una se pagó; en Transacciones tiene que salir UNA
 * fila (la del pago) con los 2 intentos anidados como rastro.
 */
const pago = (id: string, status: string, min: number, over: Record<string, unknown> = {}) => ({
  id, status, payerId: 'u1', paymentType: 'job_publication', jobId: 'j1', createdAt: new Date(Date.UTC(2026, 10, 13, 21, min)), ...over,
});

describe('emparejarIntentos', () => {
  it('3 intentos y solo el último pagado: los 2 primeros se anidan al pagado', () => {
    const todos = [pago('a', 'pending', 46), pago('b', 'pending', 51), pago('c', 'held_escrow', 57)];
    const m = emparejarIntentos(todos, todos);
    expect([...m.keys()]).toEqual(['c']);
    expect(m.get('c')!.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('un intento POSTERIOR al pago efectivo no se anida (no es un intento previo)', () => {
    const todos = [pago('c', 'held_escrow', 46), pago('d', 'pending', 57)];
    expect(emparejarIntentos(todos, todos).size).toBe(0);
  });

  it('no mezcla trabajos, personas ni tipos distintos', () => {
    const todos = [
      pago('a', 'pending', 40, { jobId: 'otro' }),
      pago('b', 'pending', 41, { payerId: 'u2' }),
      pago('c', 'pending', 42, { paymentType: 'membership' }),
      pago('ok', 'completed', 50),
    ];
    expect(emparejarIntentos(todos, todos).size).toBe(0);
  });

  it('el trabajo también se reconoce por la metadata, y un contrato une los intentos de un pago de contrato', () => {
    const a = pago('a', 'pending', 10, { jobId: null, metadataJobId: 'j9' });
    const b = pago('b', 'completed', 20, { jobId: 'j9' });
    expect(emparejarIntentos([a, b], [a, b]).get('b')!.map((i) => i.id)).toEqual(['a']);
    const c = pago('c', 'cancelled', 10, { jobId: null, contractId: 'k1', paymentType: 'contract_payment' });
    const d = pago('d', 'held_escrow', 20, { jobId: null, contractId: 'k1', paymentType: 'contract_payment' });
    expect(emparejarIntentos([c, d], [c, d]).get('d')!.map((i) => i.id)).toEqual(['c']);
  });

  it('si no hay ningún pago efectivo, los intentos quedan sueltos (se listan solos)', () => {
    const todos = [pago('a', 'pending', 46), pago('b', 'pending', 51)];
    expect(emparejarIntentos(todos, todos).size).toBe(0);
  });

  it('con varios pagos efectivos, cada intento va al más cercano que vino después', () => {
    const todos = [pago('a', 'pending', 10), pago('p1', 'completed', 20), pago('b', 'pending', 30), pago('p2', 'completed', 40)];
    const m = emparejarIntentos(todos, todos);
    expect(m.get('p1')!.map((i) => i.id)).toEqual(['a']);
    expect(m.get('p2')!.map((i) => i.id)).toEqual(['b']);
  });

  it('la condición SQL usa los mismos estados sin pago', () => {
    for (const e of ['pending', 'processing', 'failed', 'cancelled']) {
      expect(esEstadoSinPago(e)).toBe(true);
      expect(SQL_ES_UN_INTENTO_ANIDADO).toContain(`'${e}'`);
    }
    expect(esEstadoSinPago('held_escrow')).toBe(false);
  });
});
