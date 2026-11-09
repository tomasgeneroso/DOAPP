import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Pagarle al trabajador un contrato que respaldó el pago de la PUBLICACIÓN.
 *
 * Caso real (2026-11-09): en el flujo normal el cliente paga al publicar y el contrato nace sin pago propio. «Pagos a trabajadores» solo listaba contratos con un
 * pago de contrato en «confirmado para pagar», así que un contrato terminado de ese flujo quedaba en `pending_payout` sin aparecer en ninguna lista, y marcarle
 * el pago al trabajador pedía saltearse el control (solo owner o super_admin, con justificación).
 *
 * Base de pruebas real; nada sale a la red.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));
jest.mock('../../server/services/invoiceService.js', () => ({
  __esModule: true,
  generateClientPaymentInvoice: async () => undefined,
  generateWorkerPaymentInvoice: async () => undefined,
  getUserInvoices: async () => [],
  getInvoiceById: async () => null,
}));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { PaymentProof } from '../../server/models/sql/PaymentProof.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';
import { respaldadosPorLaPublicacion } from '../../server/services/pagosAlTrabajador.js';

describe('pagarle al trabajador un contrato respaldado por la publicación', () => {
  let app: Express;
  let cliente: any, trabajador: any, admin: any;
  const creados = { pagos: [] as string[], contratos: [] as string[], jobs: [] as string[] };
  const ids = () => [cliente, trabajador, admin].map((u) => u.id);
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const haceDias = (n: number) => new Date(Date.now() - n * 86_400_000);

  const pagoDePublicacion = async (over: Record<string, unknown> = {}) => {
    const p: any = await Payment.create({
      payerId: cliente.id, recipientId: null, amount: 10_000, amountArs: 10_000, currency: 'ARS', status: 'completed', paymentType: 'job_publication',
      paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0, approvedAt: haceDias(60), ...over,
    } as any);
    creados.pagos.push(p.id);
    return p;
  };

  /** Un trabajo pagado al publicarlo, con su contrato ya terminado y pendiente de pagarle al trabajador. */
  const escenario = async (opciones: { maxWorkers?: number; pagoEstado?: string; contrato?: Record<string, unknown>; terminadoHaceDias?: number } = {}) => {
    const pub = await pagoDePublicacion({ status: opciones.pagoEstado ?? 'completed' });
    const trabajo: any = await crearTrabajo(cliente.id, {
      status: 'completed', publicationPaid: true, publicationPaymentId: pub.id, maxWorkers: opciones.maxWorkers ?? 1,
    });
    creados.jobs.push(trabajo.id);
    const contrato: any = await crearContrato(
      { jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id },
      { status: 'completed', paymentStatus: 'pending_payout', escrowStatus: 'released', clientConfirmed: true, doerConfirmed: true, clientConfirmedAt: haceDias(opciones.terminadoHaceDias ?? 60), ...opciones.contrato },
    );
    creados.contratos.push(contrato.id);
    return { pub, trabajo, contrato };
  };

  const lista = async () => {
    const r = await request(app).get('/api/admin/pending-payments?period=monthly').set(con(admin));
    expect(r.status).toBe(200);
    return (r.body.report?.data ?? []) as any[];
  };
  const marcarPagado = (contratoId: string, body: Record<string, unknown> = {}) =>
    request(app).post(`/api/admin/pending-payments/${contratoId}/mark-paid`).set(con(admin)).send({ proofOfPayment: '/uploads/worker-payment-proofs/x.png', adminNotes: 'transferido', paymentMethod: 'bank_transfer', ...body });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/pending-payments', (await import('../../server/routes/admin/pendingPayments.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
  });

  afterAll(async () => {
    try {
      await AuditLog.destroy({ where: { targetId: [...creados.pagos, ...creados.contratos] } as any });
      await PaymentProof.destroy({ where: { paymentId: creados.pagos } });
      await BalanceTransaction.destroy({ where: { userId: ids() } as any });
      await Notification.destroy({ where: { recipientId: ids() } });
      await Contract.destroy({ where: { id: creados.contratos }, force: true });
      await Job.destroy({ where: { id: creados.jobs }, force: true });
      await Payment.destroy({ where: { id: creados.pagos }, force: true } as any);
      await User.destroy({ where: { id: ids() }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('el pago de la publicación queda vinculado al trabajo (el trabajo lo sabe desde el pago)', async () => {
    const { pub, trabajo } = await escenario();
    expect(String(((await Payment.findByPk(pub.id)) as any).jobId)).toBe(String(trabajo.id));
  });

  it('un contrato terminado que respalda el pago de la publicación APARECE en «Pagos a trabajadores»', async () => {
    const { contrato, pub } = await escenario();

    const filas = await lista();
    const fila = filas.find((f) => f.contractId === contrato.id);

    expect(fila).toBeDefined();
    expect(fila.paymentId).toBe(pub.id);
    expect(fila.paymentRecordStatus).toBe('completed');
    expect(fila.commissionVerified).toBe(true);
    expect(fila.enRetencion).toBe(false);
    expect(fila.workers[0].workerId).toBe(trabajador.id);
  });

  it('NO aparecen: trabajo de varios lugares (cobra por saldo), pago de la publicación sin verificar, contrato ya pagado o sin terminar', async () => {
    const variosLugares = await escenario({ maxWorkers: 2 });
    const sinVerificar = await escenario({ pagoEstado: 'pending_verification' });
    const yaPagado = await escenario({ contrato: { paymentStatus: 'completed' } });
    const enCurso = await escenario({ contrato: { status: 'in_progress', paymentStatus: 'escrow' } });

    const idsEnLista = (await lista()).map((f) => f.contractId);

    for (const e of [variosLugares, sinVerificar, yaPagado, enCurso]) expect(idsEnLista).not.toContain(e.contrato.id);
  });

  it('un contrato con un pago propio vigente no entra por la publicación (sigue su camino); con el propio «confirmado para pagar» entra UNA sola vez', async () => {
    const propioPendiente = await escenario();
    const p1: any = await Payment.create({
      payerId: cliente.id, recipientId: trabajador.id, contractId: propioPendiente.contrato.id, amount: 5000, amountArs: 5000, currency: 'ARS', status: 'pending_verification',
      paymentType: 'contract_payment', paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0,
    } as any);
    creados.pagos.push(p1.id);
    const propioConfirmado = await escenario();
    const p2: any = await Payment.create({
      payerId: cliente.id, recipientId: trabajador.id, contractId: propioConfirmado.contrato.id, amount: 5000, amountArs: 5000, currency: 'ARS', status: 'confirmed_for_payout',
      paymentType: 'contract_payment', paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0, approvedAt: haceDias(60),
    } as any);
    creados.pagos.push(p2.id);

    const filas = await lista();

    expect(filas.map((f) => f.contractId)).not.toContain(propioPendiente.contrato.id);
    expect(filas.filter((f) => f.contractId === propioConfirmado.contrato.id)).toHaveLength(1);
    expect(filas.find((f) => f.contractId === propioConfirmado.contrato.id).paymentId).toBe(p2.id);
  });

  describe('marcarle el pago al trabajador (POST /:contractId/mark-paid)', () => {
    it('se puede SIN saltear el control: el pago de la publicación vale como pago del cliente confirmado', async () => {
      const { contrato, pub } = await escenario();

      const r = await marcarPagado(contrato.id);

      expect(r.status).toBe(200);
      const despues: any = await Contract.findByPk(contrato.id);
      expect(despues.paymentStatus).toBe('completed');
      expect(despues.paymentProofUrl).toBe('/uploads/worker-payment-proofs/x.png');
      // El pago de la publicación NO cambia de estado (puede respaldar otras cosas); el comprobante queda como evidencia en él.
      expect(((await Payment.findByPk(pub.id)) as any).status).toBe('completed');
      const nota: any = await PaymentProof.findOne({ where: { paymentId: pub.id, kind: 'note' } as any });
      expect(nota?.fileUrl).toBe('/uploads/worker-payment-proofs/x.png');
      // Sale de «pendientes» y aparece en «pagados».
      expect((await lista()).map((f) => f.contractId)).not.toContain(contrato.id);
      expect(await respaldadosPorLaPublicacion(contrato.id)).toEqual([]);
    });

    it('un contrato ya pagado no se paga de nuevo', async () => {
      const { contrato } = await escenario();
      expect((await marcarPagado(contrato.id)).status).toBe(200);
      const otra = await marcarPagado(contrato.id);
      expect(otra.status).toBe(409);
      expect(otra.body.code).toBe('PAYOUT_YA_PAGADO');
    });

    it('la retención sigue valiendo: un contrato terminado hoy no se transfiere todavía (409) y no queda pagado', async () => {
      const { contrato } = await escenario({ terminadoHaceDias: 0 });
      const r = await marcarPagado(contrato.id);
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('PAYOUT_EN_RETENCION');
      expect(((await Contract.findByPk(contrato.id)) as any).paymentStatus).toBe('pending_payout');
    });

    it('lo que NO respalda la publicación sigue frenado: sin pago confirmado, 409 (solo owner o super_admin lo fuerzan)', async () => {
      const variosLugares = await escenario({ maxWorkers: 2 });
      const sinVerificar = await escenario({ pagoEstado: 'pending_verification' });
      for (const e of [variosLugares, sinVerificar]) {
        const r = await marcarPagado(e.contrato.id);
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('PAYOUT_SIN_PAGO_CONFIRMADO');
        expect(((await Contract.findByPk(e.contrato.id)) as any).paymentStatus).toBe('pending_payout');
      }
    });

    it('quien es parte del contrato no se marca a sí mismo como pagado (el control de siempre)', async () => {
      const { contrato } = await escenario();
      const adminCliente = await crearUsuario({ role: 'client', adminRole: 'admin' });
      await contrato.update({ clientId: adminCliente.id });
      try {
        const r = await request(app).post(`/api/admin/pending-payments/${contrato.id}/mark-paid`).set(con(adminCliente)).send({ proofOfPayment: '/x.png' });
        expect(r.status).toBe(403);
        expect(((await Contract.findByPk(contrato.id)) as any).paymentStatus).toBe('pending_payout');
      } finally {
        await contrato.update({ clientId: cliente.id });
        await User.destroy({ where: { id: adminCliente.id }, force: true });
      }
    });
  });
});
