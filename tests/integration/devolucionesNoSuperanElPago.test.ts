import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

/**
 * Un pago no se devuelve más de lo que costó.
 *
 * El caso: «Reembolsos totales $12.500» en la cuenta de quien pagó $5.000. Una publicación cancelada dos veces con el mismo pago devolvía el precio cada
 * vez. El control de «no devolver más de lo pagado» solo miraba lo que Mercado Pago había reembolsado (`refundedAmount`), no lo ya acreditado al saldo,
 * así que la segunda devolución pasaba. Ahora el control suma también lo que el libro ya le acreditó por ESE pago, y la auditoría tiene un invariante nuevo
 * (el 9) que lista cualquier pago devuelto de más, sea cual sea el camino por el que se devolvió.
 */
import { User } from '../../server/models/sql/User.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { controlarPagoOriginal, acreditadoAlSaldoPorElPago } from '../../server/services/controlesDeDinero.js';
import { auditarSaldos } from '../../server/services/auditoriaSaldos.js';
import { crearUsuario } from '../helpers/fixtures.js';

describe('un pago no se devuelve más de lo que costó', () => {
  let cliente: any;
  const pagos: string[] = [];

  const pago = async (over: Record<string, unknown> = {}) => {
    const p: any = await Payment.create({
      payerId: cliente.id, recipientId: null, amount: 5000, amountArs: 5000, currency: 'ARS', status: 'completed', paymentType: 'job_publication',
      paymentMethod: 'mercadopago', mercadopagoStatus: 'approved', platformFee: 0, platformFeePercentage: 0, ...over,
    } as any);
    pagos.push(p.id);
    return p;
  };
  const devolucion = (pagoId: string, monto: number, extra: Record<string, unknown> = {}, status = 'completed') =>
    BalanceTransaction.create({
      userId: cliente.id, type: 'refund', amount: monto, balanceBefore: 0, balanceAfter: monto, description: 'devolución de prueba', status,
      metadata: { pagoId, origen: 'cancelacion', reason: 'job_cancelled_no_worker', ...extra },
    } as any);
  const correccion = (pagoId: string, monto: number) =>
    BalanceTransaction.create({
      userId: cliente.id, type: 'adjustment', amount: -monto, balanceBefore: monto, balanceAfter: 0, description: 'corrección', status: 'completed',
      metadata: { origen: 'correccion_doble_devolucion', pagoId },
    } as any);
  const hallazgos = async (pagoId: string) => (await auditarSaldos()).hallazgos.filter((h) => h.invariante === 9 && h.detalle.includes(pagoId));

  beforeAll(async () => {
    cliente = await crearUsuario({ role: 'client' });
  });

  afterAll(async () => {
    try {
      await BalanceTransaction.destroy({ where: { userId: cliente.id } });
      await Payment.destroy({ where: { id: pagos }, force: true } as any);
      await User.destroy({ where: { id: cliente.id }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  describe('el control antes de devolver (controlarPagoOriginal)', () => {
    const controlar = (acreditado: number, monto = 5000, refundedAmount = 0) => {
      const p = { id: 'pago-1', payerId: 'cliente-1', amount: 5000, currency: 'ARS', status: 'completed', paymentType: 'job_publication', mercadopagoStatus: 'approved', refundedAmount, createdAt: new Date(Date.now() - 86_400_000) };
      return controlarPagoOriginal({
        job: { id: 'job-1', clientId: 'cliente-1', price: 5000, publicationPaymentId: 'pago-1', publicationPaid: true },
        pago: p,
        monto,
        destino: 'saldo',
        canceladoEl: new Date(),
        acreditadoAlSaldoDelPago: acreditado,
      });
    };
    const falla = (r: ReturnType<typeof controlar>) => r.fallidos.map((c) => c.id);

    it('un pago de $5.000 sin nada devuelto: se puede devolver $5.000', () => {
      expect(falla(controlar(0))).not.toContain('no_supera_lo_pagado');
    });

    it('si ya se le acreditaron $5.000 al saldo por ese pago, devolver otros $5.000 FALLA (el caso de los $12.500)', () => {
      const r = controlar(5000);
      expect(falla(r)).toContain('no_supera_lo_pagado');
      const c = r.fallidos.find((x) => x.id === 'no_supera_lo_pagado')!;
      expect(c.esperado).toMatch(/ya acreditado a su saldo \$5\.000/);
    });

    it('lo acreditado al saldo y lo devuelto por Mercado Pago se suman: $3.000 + $3.000 sobre un pago de $5.000 no entra', () => {
      expect(falla(controlar(3000, 3000, 3000))).toContain('no_supera_lo_pagado');
    });

    it('lo que sobra sí se puede devolver: $2.500 acreditados, otros $2.500 entran', () => {
      expect(falla(controlar(2500, 2500))).not.toContain('no_supera_lo_pagado');
    });
  });

  describe('lo que el libro ya acreditó por un pago', () => {
    it('suma las devoluciones completadas y las a favor pendiente de ESE pago, y descuenta las correcciones', async () => {
      const p = await pago();
      expect(await acreditadoAlSaldoPorElPago(p.id)).toBe(0);
      await devolucion(p.id, 2500);
      await devolucion(p.id, 1000, {}, 'pending');
      expect(await acreditadoAlSaldoPorElPago(p.id)).toBe(3500);
      await correccion(p.id, 1000);
      expect(await acreditadoAlSaldoPorElPago(p.id)).toBe(2500);
    });

    it('no mezcla pagos distintos', async () => {
      const a = await pago();
      const b = await pago();
      await devolucion(a.id, 4000);
      expect(await acreditadoAlSaldoPorElPago(b.id)).toBe(0);
    });
  });

  describe('invariante 9 de la auditoría: devuelto de más por un mismo pago', () => {
    it('un pago de $5.000 devuelto DOS veces ($5.000 + $5.000) se lista, con el exceso y el comando para corregir', async () => {
      const p = await pago();
      await devolucion(p.id, 5000);
      await devolucion(p.id, 5000);
      const h = await hallazgos(p.id);
      expect(h).toHaveLength(1);
      expect(h[0].gravedad).toBe('alta');
      expect(h[0].monto).toBe(5000);
      expect(h[0].detalle).toMatch(/corregirDobleDevolucion/);
    });

    it('$5.000 + $2.500 (la diferencia a favor) sobre un pago de $5.000 también: son $2.500 de más', async () => {
      const p = await pago();
      await devolucion(p.id, 5000);
      await devolucion(p.id, 2500, { origen: 'cotizacion_menor', reason: undefined });
      const h = await hallazgos(p.id);
      expect(h).toHaveLength(1);
      expect(h[0].monto).toBe(2500);
    });

    it('una sola devolución, o varias que suman lo pagado, NO se lista', async () => {
      const una = await pago();
      await devolucion(una.id, 5000);
      expect(await hallazgos(una.id)).toHaveLength(0);

      const partes = await pago();
      await devolucion(partes.id, 2500);
      await devolucion(partes.id, 2500, { origen: 'equipo_parcial', reason: undefined });
      expect(await hallazgos(partes.id)).toHaveLength(0);
    });

    it('lo devuelto por Mercado Pago cuenta: $3.000 reembolsados + $3.000 al saldo sobre $5.000 se lista', async () => {
      const p = await pago({ refundedAmount: 3000 });
      await devolucion(p.id, 3000);
      const h = await hallazgos(p.id);
      expect(h).toHaveLength(1);
      expect(h[0].monto).toBe(1000);
    });

    it('una vez corregida con el descuento de la corrección, deja de listarse', async () => {
      const p = await pago();
      await devolucion(p.id, 5000);
      await devolucion(p.id, 5000);
      expect(await hallazgos(p.id)).toHaveLength(1);
      await correccion(p.id, 5000);
      expect(await hallazgos(p.id)).toHaveLength(0);
    });

    it('un pago en otra moneda no se juzga (los montos no son comparables)', async () => {
      const p = await pago({ currency: 'USD' });
      await devolucion(p.id, 9000);
      expect(await hallazgos(p.id)).toHaveLength(0);
    });
  });
});
