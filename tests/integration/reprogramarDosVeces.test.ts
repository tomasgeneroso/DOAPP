import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/** Una publicación sin postulantes vence, se reprograma, vuelve a vencer sin postulantes: se puede reprogramar otra vez. */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import BalanceTransaction from '../../server/models/sql/BalanceTransaction.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

const dias = (n: number) => new Date(Date.now() + n * 86_400_000);

describe('reprogramar una publicación sin postulantes, dos veces', () => {
  let app: Express;
  let cliente: any, trabajo: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const leer = async () => (await Job.findByPk(trabajo.id)) as any;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
    trabajo = await crearTrabajo(cliente.id, { status: 'open', publicationPaid: true, startDate: dias(-3), endDate: dias(-2) });
  });

  afterAll(async () => {
    try {
      await BalanceTransaction.destroy({ where: { userId: cliente.id }, force: true } as any);
      await Notification.destroy({ where: { recipientId: cliente.id } });
      await Job.destroy({ where: { id: trabajo.id }, force: true });
      await User.destroy({ where: { id: cliente.id }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  const vencerYReprogramar = async (vuelta: number) => {
    const { checkAndProcessUserExpiredJobs } = await import('../../server/jobs/autoCancelExpiredJobs.js');
    expect(await checkAndProcessUserExpiredJobs(cliente.id)).toBeGreaterThanOrEqual(1);
    const cancelado = await leer();
    expect(cancelado.status).toBe('cancelled');
    expect(cancelado.cancellationReason).toContain('Ningún trabajador se postuló');

    const r = await request(app).put(`/api/jobs/${trabajo.id}`).set(con(cliente))
      .send({ startDate: dias(5 + vuelta).toISOString(), endDate: dias(6 + vuelta).toISOString() });
    if (r.status !== 200) console.log('RESP', vuelta, JSON.stringify(r.body));
    expect(r.status).toBe(200);
    const reprogramado = await leer();
    expect(['pending_approval', 'pending_payment', 'open']).toContain(reprogramado.status);
  };

  it('primera reprogramación', async () => {
    await vencerYReprogramar(0);
  });

  it('la publicación vuelve a vencer sin nadie: se puede reprogramar otra vez', async () => {
    // el administrador la aprobó y pasó el tiempo otra vez
    await Job.update({ status: 'open', startDate: dias(-3), endDate: dias(-2) } as any, { where: { id: trabajo.id } });
    await vencerYReprogramar(1);
  });

  it('la devolución se reconoce por pago: el mismo pago no se devuelve dos veces, uno nuevo sí', async () => {
    const { publicacionDevuelta } = await import('../../server/services/creditoDePublicacion.js');
    const job = { id: trabajo.id, publicationPaymentId: '11111111-1111-1111-1111-111111111111' };
    expect(await publicacionDevuelta(job)).toBe(false);
    await BalanceTransaction.createRefund(cliente.id, 1000, 0, 'Saldo a favor por cancelación', undefined, { origen: 'cancelacion', jobId: trabajo.id, pagoId: job.publicationPaymentId } as any);
    expect(await publicacionDevuelta(job)).toBe(true);
    expect(await publicacionDevuelta({ ...job, publicationPaymentId: '22222222-2222-2222-2222-222222222222' })).toBe(false);
  });
});
