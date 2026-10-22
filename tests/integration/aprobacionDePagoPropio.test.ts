import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Nadie aprueba un pago propio, salvo el dueño.
 *
 * Aprobar una transferencia es dar por buena una afirmación («el dinero entró al banco») que ninguna pasarela comprueba. Si quien la aprueba es
 * quien la hizo, no hay una segunda persona que la compruebe: así se devolvió al saldo, en prod, una transferencia de $431.956,80 que nunca tuvo
 * dinero detrás (caso «try»). Quien es parte del pago —lo pagó o lo cobra— no lo aprueba ni lo avanza: lo hace otra persona del equipo. El dueño sí
 * puede, y queda anotado como aprobación propia.
 *
 * Cubre las puertas que mueven un pago hacia «confirmado»: aprobar, verificar la garantía, confirmar para el pago, aprobar el comprobante y
 * marcar pagado al trabajador. Base de pruebas real; nada sale a la red.
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
import { bloqueoPorAprobacionPropia, esAprobacionPropiaDelDueno, esPagoPropio } from '../../server/services/aprobacionDePagos.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

const CODIGO = 'APROBACION-DE-PAGO-PROPIO';

describe('aprobacionDePagos (la regla sola)', () => {
  it('es parte del pago quien lo pagó o quien lo cobra, comparando ids como texto', () => {
    expect(esPagoPropio({ payerId: 'a', recipientId: 'b' }, { id: 'a' })).toBe(true);
    expect(esPagoPropio({ payerId: 'a', recipientId: 'b' }, { id: 'b' })).toBe(true);
    expect(esPagoPropio({ payerId: 'a', recipientId: 'b' }, { id: 'c' })).toBe(false);
    expect(esPagoPropio({ payerId: 7, recipientId: null }, { id: '7' })).toBe(true);
  });

  it('un pago sin pagador o sin cobrador no se le atribuye a nadie', () => {
    expect(esPagoPropio({ payerId: null, recipientId: undefined }, { id: 'a' })).toBe(false);
    expect(esPagoPropio({}, { id: 'a' })).toBe(false);
  });

  it('bloquea a un administrador que es parte; deja pasar a otro y al dueño', () => {
    const pago = { payerId: 'a', recipientId: 'b' };
    const bloqueo = bloqueoPorAprobacionPropia(pago, { id: 'a', adminRole: 'admin' });
    expect(bloqueo?.status).toBe(403);
    expect(bloqueo?.body.code).toBe(CODIGO);
    expect(String(bloqueo?.body.guia)).toBe(`/admin/guia-de-errores#${CODIGO}`);
    expect(bloqueoPorAprobacionPropia(pago, { id: 'b', adminRole: 'super_admin' })?.status).toBe(403);
    expect(bloqueoPorAprobacionPropia(pago, { id: 'c', adminRole: 'admin' })).toBeNull();
    expect(bloqueoPorAprobacionPropia(pago, { id: 'a', adminRole: 'owner' })).toBeNull();
  });

  it('solo el dueño que aprueba un pago propio queda marcado como aprobación propia', () => {
    const pago = { payerId: 'a', recipientId: null };
    expect(esAprobacionPropiaDelDueno(pago, { id: 'a', adminRole: 'owner' })).toBe(true);
    expect(esAprobacionPropiaDelDueno(pago, { id: 'z', adminRole: 'owner' })).toBe(false);
    expect(esAprobacionPropiaDelDueno(pago, { id: 'a', adminRole: 'admin' })).toBe(false);
  });
});

describe('nadie aprueba un pago propio (salvo el dueño)', () => {
  let app: Express;
  let cliente: any, trabajador: any, adminPagador: any, adminCobrador: any, otroAdmin: any, dueno: any;
  const creados = { pagos: [] as string[], contratos: [] as string[], jobs: [] as string[] };
  const ids = () => [cliente, trabajador, adminPagador, adminCobrador, otroAdmin, dueno].map((u) => u.id);
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const esperar = async (cond: () => Promise<boolean>, ms = 4000) => {
    const hasta = Date.now() + ms;
    while (Date.now() < hasta) {
      if (await cond()) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  };

  /** Un pago por transferencia pendiente de aprobar. */
  const pagoDe = async (payerId: string, recipientId: string | null, over: Record<string, unknown> = {}) => {
    const p: any = await Payment.create({
      payerId, recipientId, amount: 5000, amountArs: 5000, currency: 'ARS', status: 'pending_verification', paymentType: 'job_publication',
      paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0, ...over,
    } as any);
    creados.pagos.push(p.id);
    return p;
  };
  const recargar = async (id: string) => (await Payment.findByPk(id)) as any;
  const aprobar = (quien: any, id: string, body: Record<string, unknown> = {}) => request(app).post(`/api/admin/payments/${id}/approve`).set(con(quien)).send(body);
  const anotada = async (pagoId: string) => {
    let fila: any = null;
    await esperar(async () => {
      fila = await AuditLog.findOne({ where: { targetId: pagoId, action: 'payment.approve' } as any });
      return !!fila;
    });
    return fila;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/payments', (await import('../../server/routes/admin/payments.js')).default);
    app.use('/api/payments', (await import('../../server/routes/payments.js')).default);
    app.use('/api/admin/pending-payments', (await import('../../server/routes/admin/pendingPayments.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    adminPagador = await crearUsuario({ role: 'client', adminRole: 'admin' });
    adminCobrador = await crearUsuario({ role: 'doer', adminRole: 'admin' });
    otroAdmin = await crearUsuario({ role: 'client', adminRole: 'admin' });
    dueno = await crearUsuario({ role: 'client', adminRole: 'owner' });
  });

  afterAll(async () => {
    try {
      await AuditLog.destroy({ where: { targetId: creados.pagos } as any });
      await PaymentProof.destroy({ where: { paymentId: creados.pagos } });
      await Notification.destroy({ where: { recipientId: ids() } });
      await Payment.destroy({ where: { id: creados.pagos }, force: true } as any);
      await Contract.destroy({ where: { id: creados.contratos }, force: true });
      await Job.destroy({ where: { id: creados.jobs }, force: true });
      await User.destroy({ where: { id: ids() }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  /* ---------------- aprobar ---------------- */

  describe('aprobar el pago (POST /api/admin/payments/:id/approve)', () => {
    it('un administrador que PAGÓ no aprueba su propio pago: 403 con el código y el pago queda como estaba', async () => {
      const p = await pagoDe(adminPagador.id, null);

      const r = await aprobar(adminPagador, p.id);

      expect(r.status).toBe(403);
      expect(r.body.success).toBe(false);
      expect(r.body.code).toBe(CODIGO);
      expect(r.body.guia).toBe(`/admin/guia-de-errores#${CODIGO}`);
      const despues = await recargar(p.id);
      expect(despues.status).toBe('pending_verification');
      expect(despues.approvedBy).toBeNull();
      expect(await AuditLog.count({ where: { targetId: p.id, action: 'payment.approve' } as any })).toBe(0);
    });

    it('un administrador que va a COBRAR el pago tampoco lo aprueba', async () => {
      const p = await pagoDe(cliente.id, adminCobrador.id);

      const r = await aprobar(adminCobrador, p.id);

      expect(r.status).toBe(403);
      expect(r.body.code).toBe(CODIGO);
      expect((await recargar(p.id)).status).toBe('pending_verification');
    });

    it('el bloqueo llega antes que todo lo demás: el comprobante que subía el administrador no se guarda', async () => {
      const p = await pagoDe(adminPagador.id, null);

      const r = await aprobar(adminPagador, p.id, { proofUrl: '/uploads/comprobante-falso.jpg', bankReference: 'XYZ-1' });

      expect(r.status).toBe(403);
      expect(await PaymentProof.count({ where: { paymentId: p.id } })).toBe(0);
    });

    it('otra persona del equipo sí lo aprueba, y queda anotado sin marca de aprobación propia', async () => {
      const p = await pagoDe(adminPagador.id, null);

      const r = await aprobar(otroAdmin, p.id);

      expect(r.status).toBe(200);
      const despues = await recargar(p.id);
      expect(despues.status).toBe('completed');
      expect(String(despues.approvedBy)).toBe(String(otroAdmin.id));
      const fila = await anotada(p.id);
      expect(fila).not.toBeNull();
      expect(fila.metadata?.aprobacionPropiaDelDueno).toBe(false);
    });

    it('un pago de un cliente cualquiera lo aprueba cualquier administrador (la regla no frena el trabajo normal)', async () => {
      const p = await pagoDe(cliente.id, null);

      const r = await aprobar(adminPagador, p.id);

      expect(r.status).toBe(200);
      expect((await recargar(p.id)).status).toBe('completed');
    });

    it('el dueño sí puede aprobar su propio pago, y queda anotado como aprobación propia', async () => {
      const p = await pagoDe(dueno.id, null);

      const r = await aprobar(dueno, p.id);

      expect(r.status).toBe(200);
      const despues = await recargar(p.id);
      expect(despues.status).toBe('completed');
      expect(String(despues.approvedBy)).toBe(String(dueno.id));
      const fila = await anotada(p.id);
      expect(fila).not.toBeNull();
      expect(fila.metadata?.aprobacionPropiaDelDueno).toBe(true);
    });
  });

  /* ---------------- pasos siguientes del pago de un contrato ---------------- */

  describe('verificar la garantía y confirmar para el pago', () => {
    const contratoDe = async (clientId: string, doerId: string) => {
      const trabajo: any = await crearTrabajo(clientId, { status: 'in_progress' });
      creados.jobs.push(trabajo.id);
      const contrato: any = await crearContrato({ jobId: trabajo.id, clientId, doerId }, { status: 'accepted', paymentStatus: 'pending_verification' });
      creados.contratos.push(contrato.id);
      return contrato;
    };

    it('verify-escrow: el administrador que pagó el contrato no lo pasa a garantía (403) y el pago no se mueve', async () => {
      const contrato = await contratoDe(adminPagador.id, trabajador.id);
      const p = await pagoDe(adminPagador.id, trabajador.id, { paymentType: 'contract_payment', contractId: contrato.id, status: 'verified', isEscrow: true });

      const r = await request(app).post(`/api/admin/payments/${p.id}/verify-escrow`).set(con(adminPagador)).send({});

      expect(r.status).toBe(403);
      expect(r.body.code).toBe(CODIGO);
      expect((await recargar(p.id)).status).toBe('verified');
      expect(((await Contract.findByPk(contrato.id)) as any).paymentStatus).toBe('pending_verification');
    });

    it('confirm-for-payout: el administrador que va a cobrar no confirma el pago para sí (403) y el pago no se mueve', async () => {
      const contrato = await contratoDe(cliente.id, adminCobrador.id);
      const p = await pagoDe(cliente.id, adminCobrador.id, { paymentType: 'contract_payment', contractId: contrato.id, status: 'held_escrow', isEscrow: true });

      const r = await request(app).post(`/api/admin/payments/${p.id}/confirm-for-payout`).set(con(adminCobrador)).send({});

      expect(r.status).toBe(403);
      expect(r.body.code).toBe(CODIGO);
      expect((await recargar(p.id)).status).toBe('held_escrow');
    });

    it('otra persona del equipo sí pasa el pago a garantía', async () => {
      const contrato = await contratoDe(adminPagador.id, trabajador.id);
      const p = await pagoDe(adminPagador.id, trabajador.id, { paymentType: 'contract_payment', contractId: contrato.id, status: 'verified', isEscrow: true });

      const r = await request(app).post(`/api/admin/payments/${p.id}/verify-escrow`).set(con(otroAdmin)).send({});

      expect(r.status).toBe(200);
      expect((await recargar(p.id)).status).toBe('held_escrow');
    });
  });

  /* ---------------- aprobar el comprobante ---------------- */

  describe('aprobar el comprobante (POST /api/payments/:id/proof/:proofId/approve)', () => {
    const comprobanteDe = async (pagoId: string, userId: string) =>
      (await PaymentProof.create({
        paymentId: pagoId, userId, kind: 'client_receipt', uploadedByRole: 'client', sequence: 1, fileUrl: '/uploads/comprobante.jpg', fileType: 'jpg',
        fileName: 'comprobante.jpg', fileSize: 1, status: 'pending', isActive: true, uploadedAt: new Date(),
      } as any)) as any;
    const aprobarComprobante = (quien: any, pagoId: string, proofId: string) =>
      request(app).post(`/api/payments/${pagoId}/proof/${proofId}/approve`).set(con(quien)).send({});

    it('el administrador que subió el comprobante de su propio pago no lo aprueba: 403 y el comprobante sigue pendiente', async () => {
      const p = await pagoDe(adminPagador.id, null);
      const proof = await comprobanteDe(p.id, adminPagador.id);

      const r = await aprobarComprobante(adminPagador, p.id, proof.id);

      expect(r.status).toBe(403);
      expect(r.body.code).toBe(CODIGO);
      expect(((await PaymentProof.findByPk(proof.id)) as any).status).toBe('pending');
      expect((await recargar(p.id)).status).toBe('pending_verification');
    });

    it('otra persona del equipo no es frenada: el comprobante se aprueba', async () => {
      const p = await pagoDe(adminPagador.id, null);
      const proof = await comprobanteDe(p.id, adminPagador.id);

      const r = await aprobarComprobante(otroAdmin, p.id, proof.id);

      // Solo se prueba que la regla la deja pasar. Esta ruta vieja después falla al avisarle al pagador (arma la notificación con campos que ya no
      // existen y devuelve 500 con el comprobante ya aprobado): no es de esta regla y no se afirma acá.
      expect(r.status).not.toBe(403);
      expect(r.body.code).not.toBe(CODIGO);
      expect(((await PaymentProof.findByPk(proof.id)) as any).status).toBe('approved');
    });
  });

  /* ---------------- marcar pagado al trabajador ---------------- */

  describe('marcar pagado al trabajador (POST /api/admin/pending-payments/:contractId/mark-paid)', () => {
    const contratoDe = async (clientId: string, doerId: string) => {
      const trabajo: any = await crearTrabajo(clientId, { status: 'completed' });
      creados.jobs.push(trabajo.id);
      const contrato: any = await crearContrato({ jobId: trabajo.id, clientId, doerId }, { status: 'completed', paymentStatus: 'pending_payout', escrowStatus: 'released' });
      creados.contratos.push(contrato.id);
      return contrato;
    };
    const marcar = (quien: any, contractId: string) => request(app).post(`/api/admin/pending-payments/${contractId}/mark-paid`).set(con(quien)).send({});

    it('el administrador que es el trabajador del contrato no se marca a sí mismo como pagado (403)', async () => {
      const contrato = await contratoDe(cliente.id, adminCobrador.id);

      const r = await marcar(adminCobrador, contrato.id);

      expect(r.status).toBe(403);
      expect(r.body.code).toBe(CODIGO);
      expect(((await Contract.findByPk(contrato.id)) as any).paymentStatus).toBe('pending_payout');
    });

    it('el administrador que es el cliente del contrato tampoco lo marca como pagado (403)', async () => {
      const contrato = await contratoDe(adminPagador.id, trabajador.id);

      const r = await marcar(adminPagador, contrato.id);

      expect(r.status).toBe(403);
      expect(r.body.code).toBe(CODIGO);
    });

    it('otra persona del equipo y el dueño pasan la regla (la frena después otra comprobación: no hay pago confirmado)', async () => {
      const contrato = await contratoDe(adminPagador.id, dueno.id);

      const otro = await marcar(otroAdmin, contrato.id);
      const elDueno = await marcar(dueno, contrato.id);

      expect(otro.body.code).not.toBe(CODIGO);
      expect(elDueno.body.code).not.toBe(CODIGO);
      expect(otro.status).toBe(409);
      expect(otro.body.code).toBe('PAYOUT_SIN_PAGO_CONFIRMADO');
    });
  });
});
