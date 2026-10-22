import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import BalanceTransaction from '../../server/models/sql/BalanceTransaction.model.js';
import { auditarSaldos } from '../../server/services/auditoriaSaldos.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

/**
 * Invariante 6 de la auditoría: plata acreditada sin cobro. Caso real: la publicación «try» de $400.000, marcada como pagada sin ningún pago
 * registrado, se canceló y devolvió $431.956,80 al saldo del dueño.
 */
describe('auditoría: plata acreditada sin cobro (invariante 6)', () => {
  let cliente: any;
  const jobs: string[] = [];

  beforeAll(async () => {
    cliente = await crearUsuario({ role: 'client' });
  });
  afterAll(async () => {
    try {
      await BalanceTransaction.destroy({ where: { userId: cliente.id }, force: true } as any);
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: cliente.id }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('una devolución por cancelación sin pago ni descuento de saldo detrás es un hallazgo GRAVE; con el descuento de saldo, no', async () => {
    const { acreditarSaldo, debitarSaldo } = await import('../../server/services/quotePayment.js');
    const t = await crearTrabajo(cliente.id, { status: 'cancelled', price: 400000, publicationPaid: true, publicationPaymentId: null });
    jobs.push(t.id);
    await acreditarSaldo(String(cliente.id), 431956.8, 'Saldo a favor por cancelación de "try"', {
      relatedModel: 'Job', relatedId: t.id, tipo: 'refund',
      metadata: { origen: 'cancelacion', reason: 'job_cancelled_sin_trabajador', jobId: String(t.id), disponibleDesde: new Date().toISOString() },
    });

    const antes = (await auditarSaldos()).hallazgos.filter((h) => h.invariante === 6 && h.jobId === String(t.id));
    expect(antes.length).toBeGreaterThan(0);
    expect(antes.some((h) => h.gravedad === 'alta' && /sin pago registrado/i.test(h.titulo))).toBe(true);
    expect(antes.find((h) => h.gravedad === 'alta')?.monto).toBe(431956.8);

    // si en realidad se había pagado con saldo (hay un descuento por esa publicación), la devolución es legítima
    await debitarSaldo(String(cliente.id), 400000, 'Publicación pagada con saldo', { relatedModel: 'Job', relatedId: String(t.id) }).catch(() => {});
    const despues = (await auditarSaldos()).hallazgos.filter((h) => h.invariante === 6 && h.jobId === String(t.id));
    expect(despues).toEqual([]);
  });

  it('una publicación que figura pagada sin pago ni descuento es un hallazgo a revisar (media)', async () => {
    const t = await crearTrabajo(cliente.id, { status: 'open', price: 9000, publicationPaid: true, publicationPaymentId: null });
    jobs.push(t.id);
    const h = (await auditarSaldos()).hallazgos.filter((x) => x.invariante === 6 && x.jobId === String(t.id));
    expect(h.length).toBe(1);
    expect(h[0].gravedad).toBe('media');
  });

  it('una devolución sin cobro que ya se corrigió con un ajuste manual (ajustarSaldo --publicacion) deja de marcarse', async () => {
    const { acreditarSaldo, debitarSaldo } = await import('../../server/services/quotePayment.js');
    const t = await crearTrabajo(cliente.id, { status: 'cancelled', price: 7000, publicationPaid: true, publicationPaymentId: null });
    jobs.push(t.id);
    await acreditarSaldo(String(cliente.id), 7000, 'Saldo a favor por cancelación', {
      relatedModel: 'Job', relatedId: t.id, tipo: 'refund', metadata: { origen: 'cancelacion', reason: 'job_cancelled_sin_trabajador', jobId: String(t.id), disponibleDesde: new Date().toISOString() },
    });
    expect((await auditarSaldos()).hallazgos.some((h) => h.invariante === 6 && h.jobId === String(t.id))).toBe(true);

    await debitarSaldo(String(cliente.id), 7000, 'Ajuste manual: devolución sin cobro', {
      tipo: 'adjustment', metadata: { origen: 'ajuste_manual', motivo: 'sin cobro', corrigeLaPublicacion: String(t.id) },
    });
    expect((await auditarSaldos()).hallazgos.some((h) => h.invariante === 6 && h.jobId === String(t.id))).toBe(false);
  });

  it('la devolución de un trabajador que no está disponible (se respalda con el pago del contrato) NO se marca como «sin cobro»', async () => {
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    const t = await crearTrabajo(cliente.id, { status: 'open', price: 6000, publicationPaid: true, publicationPaymentId: null });
    jobs.push(t.id);
    await acreditarSaldo(String(cliente.id), 2500, 'Devolución por trabajador no disponible', {
      metadata: { origen: 'cancelacion', jobId: String(t.id), motivo: 'trabajador_no_disponible', alRetirar: { comision: 0 }, disponibleDesde: new Date().toISOString() },
    });
    const h = (await auditarSaldos()).hallazgos.filter((x) => x.invariante === 6 && x.jobId === String(t.id));
    expect(h.filter((x) => /Devolución sin pago/.test(x.titulo))).toEqual([]);
  });
});
