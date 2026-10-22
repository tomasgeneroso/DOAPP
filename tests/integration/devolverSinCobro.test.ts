import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import BalanceTransaction from '../../server/models/sql/BalanceTransaction.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

/**
 * Caso real (prod, 17/10): una publicación de prueba «try» de $400.000, marcada como pagada pero SIN pago registrado ni descuento de saldo (un
 * contrato libre de comisión), se canceló y devolvió $431.956,80 al saldo del dueño: plata que nunca entró. Sin cobro no hay devolución.
 */
jest.mock('../../server/services/mercadopago.js', () => ({ __esModule: true, default: { getPayment: jest.fn(), refundPayment: jest.fn() } }));

describe('cancelar una publicación que nunca se cobró', () => {
  let cliente: any;
  const jobs: string[] = [];
  const saldo = async () => Number(((await User.findByPk(cliente.id, { attributes: ['balanceArs'] })) as any).balanceArs) || 0;

  beforeAll(async () => {
    cliente = await crearUsuario({ role: 'client' });
  });

  afterAll(async () => {
    try {
      await Notification.destroy({ where: { recipientId: cliente.id } as any });
      await BalanceTransaction.destroy({ where: { userId: cliente.id } as any, force: true } as any);
      await Job.destroy({ where: { id: jobs } as any, force: true });
      await User.destroy({ where: { id: cliente.id } as any, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('figura pagada pero no hay pago ni descuento de saldo: NO se acredita nada', async () => {
    const { liquidarCancelacionDePublicacion } = await import('../../server/services/jobCancellation.js');
    const t = await crearTrabajo(cliente.id, { status: 'open', price: 400000, publicationPaid: true, publicationPaymentId: null, selectedWorkers: [] });
    jobs.push(t.id);
    const r: any = await liquidarCancelacionDePublicacion(t, { aprobada: true, horasHastaInicio: 120, actor: { id: 'system', tipo: 'admin' }, motivo: 'prueba' });
    expect(r.plataMovida).toBe(false);
    expect(await saldo()).toBe(0);
    expect(await BalanceTransaction.count({ where: { userId: cliente.id, type: 'refund' } as any })).toBe(0);
  });

  it('pagada con saldo de verdad (hay un descuento de saldo por esa publicación): sí se devuelve', async () => {
    const { liquidarCancelacionDePublicacion } = await import('../../server/services/jobCancellation.js');
    const { acreditarSaldo, debitarSaldo } = await import('../../server/services/quotePayment.js');
    const t = await crearTrabajo(cliente.id, { status: 'open', price: 2000, publicationPaid: true, publicationPaymentId: null, selectedWorkers: [] });
    jobs.push(t.id);
    await acreditarSaldo(String(cliente.id), 2000, 'saldo para publicar', { relatedModel: 'Job', relatedId: cliente.id, tipo: 'refund' });
    await debitarSaldo(String(cliente.id), 2000, 'Publicación pagada con saldo', { relatedModel: 'Job', relatedId: String(t.id) });
    expect(await saldo()).toBe(0);

    const r: any = await liquidarCancelacionDePublicacion(t, { aprobada: true, horasHastaInicio: 120, actor: { id: 'system', tipo: 'admin' }, motivo: 'prueba' });
    expect(r.plataMovida).toBe(true);
    expect(await saldo()).toBeGreaterThan(0);
  });
});
