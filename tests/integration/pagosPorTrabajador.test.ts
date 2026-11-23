import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * «Gestión de Pagos → Pagos a trabajadores» (pedido del dueño, 2026-11-23): un trabajo con N trabajadores tiene N pagos, uno por trabajador.
 *
 * Antes la lista agrupaba el trabajo en UNA fila con los N trabajadores y con el id del primer contrato: «marcar pagado» pagaba solo a uno. Ahora cada contrato es su fila,
 * con su monto, su comprobante y su estado, y dice «Pago 1 de 2».
 */
jest.mock('../../server/index.js', () => ({ __esModule: true, socketService: {} }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

describe('pagos a trabajadores: un pago por trabajador', () => {
  let app: Express;
  let cliente: any, ana: any, beto: any, admin: any;
  let jobId: string, jobSolo: string;
  const contratos: string[] = [];
  const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);

  const contrato = async (trabajoId: string, doer: any, precio: number) => {
    const c: any = await crearContrato(
      { jobId: trabajoId, clientId: cliente.id, doerId: doer.id },
      { status: 'completed', paymentStatus: 'pending_payout', escrowStatus: 'released', price: precio, clientConfirmedAt: hace(30), completedAt: hace(30) },
    );
    contratos.push(c.id);
    // El pago de cada contrato, confirmado para pagar.
    await Payment.create({
      contractId: c.id, payerId: cliente.id, recipientId: doer.id, amount: precio, currency: 'ARS', status: 'confirmed_for_payout',
      paymentType: 'contract_payment', paymentMethod: 'mercadopago', isEscrow: true, platformFee: 0, platformFeePercentage: 0, approvedAt: hace(30),
    } as any);
    return c.id as string;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/pending-payments', (await import('../../server/routes/admin/pendingPayments.js')).default);
    cliente = await crearUsuario();
    ana = await crearUsuario({ role: 'doer', name: 'Ana Prueba', bankingInfo: { cbu: '0000000000000000000001', alias: 'ana.prueba' } });
    beto = await crearUsuario({ role: 'doer', name: 'Beto Prueba', bankingInfo: { cbu: '0000000000000000000002', alias: 'beto.prueba' } });
    admin = await crearUsuario({ role: 'doer', adminRole: 'owner' });
    const t: any = await crearTrabajo(cliente.id, { status: 'completed', maxWorkers: 2, price: 10000 });
    jobId = t.id;
    const solo: any = await crearTrabajo(cliente.id, { status: 'completed', price: 3000 });
    jobSolo = solo.id;
    await contrato(jobId, ana, 6000);
    await contrato(jobId, beto, 4000);
    await contrato(jobSolo, ana, 3000);
  });

  afterAll(async () => {
    try {
      await Payment.destroy({ where: { contractId: contratos } });
      await Contract.destroy({ where: { id: contratos }, force: true });
      await Job.destroy({ where: { id: [jobId, jobSolo] }, force: true });
      await User.destroy({ where: { id: [cliente.id, ana.id, beto.id, admin.id] }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('un trabajo con dos trabajadores sale en DOS filas, cada una con su trabajador y su monto', async () => {
    const r = await request(app).get('/api/admin/pending-payments?period=monthly&onlyVerified=true').set(como(admin));
    expect(r.status).toBe(200);
    const filas: any[] = r.body.report.data.filter((f: any) => String(f.jobId) === String(jobId));
    expect(filas).toHaveLength(2);
    for (const f of filas) expect(f.workers).toHaveLength(1);

    const deAna = filas.find((f) => f.workers[0].workerName === 'Ana Prueba');
    const deBeto = filas.find((f) => f.workers[0].workerName === 'Beto Prueba');
    expect(deAna.totalContractAmount).toBe(6000);
    expect(deBeto.totalContractAmount).toBe(4000);
    // cada fila trae el id de SU contrato (marcar pagado paga a ese trabajador y no al primero)
    expect(deAna.contractId).not.toBe(deBeto.contractId);
    expect(contratos).toContain(deAna.contractId);
    expect(contratos).toContain(deBeto.contractId);
    // «Pago 1 de 2», «Pago 2 de 2»
    expect(filas.map((f) => [f.pagoNumero, f.pagosDelTrabajo]).sort()).toEqual([[1, 2], [2, 2]]);
  });

  it('un trabajo de un solo lugar sigue siendo una fila («1 de 1»)', async () => {
    const r = await request(app).get('/api/admin/pending-payments?period=monthly&onlyVerified=true').set(como(admin));
    const filas: any[] = r.body.report.data.filter((f: any) => String(f.jobId) === String(jobSolo));
    expect(filas).toHaveLength(1);
    expect([filas[0].pagoNumero, filas[0].pagosDelTrabajo]).toEqual([1, 1]);
  });
});
