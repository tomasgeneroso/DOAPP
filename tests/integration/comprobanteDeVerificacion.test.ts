import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * El comprobante que sube la administración al verificar un pago, y el «comprobante duplicado».
 *
 * Qué pasaba (informe del dueño, 2026-11-07): al subir el comprobante en «Pagos pendientes» parecía que no se guardaba, y el estado de los verificados
 * «seguía en pendientes». Causas reales:
 *  - el comprobante de la administración se guarda aparte (kind 'admin_verification', no activo, para no pisar el recibo del cliente) y la lista de
 *    pagos solo traía los activos: un pago verificado con ese comprobante se veía como «Sin comprobante»;
 *  - un pago de publicación o de membresía pasa de «pendiente» a «completed» (no tiene garantía que verificar) pero la pantalla saltaba siempre a la
 *    pestaña «Verificado» (vacía) y decía que estaba ahí; el servidor ahora dice en qué estado quedó (`newStatus`);
 *  - un número de operación repetido en otro pago no dejaba ninguna marca.
 * Regla del dueño: el número repetido SE DEJA PASAR pero queda marcado como «comprobante duplicado».
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
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';
import { normalizarReferencia, describirReferenciaRepetida } from '../../server/services/comprobanteDuplicado.js';

describe('comprobanteDuplicado (la regla sola)', () => {
  it('compara sin distinguir mayúsculas ni espacios de más', () => {
    expect(normalizarReferencia('  OP-123  ')).toBe('op-123');
    expect(normalizarReferencia('Op   123')).toBe('op 123');
    expect(normalizarReferencia(null)).toBe('');
  });

  it('el texto nombra el número y cuántos pagos lo usan', () => {
    const uno = describirReferenciaRepetida({ referencia: 'OP-1', otrosPagos: [{ paymentId: 'abcdef12-0000', estado: 'verified', monto: 1, fecha: null }] });
    expect(uno).toContain('OP-1');
    expect(uno).toContain('otro pago');
    expect(uno).toContain('abcdef12');
    const tres = describirReferenciaRepetida({
      referencia: 'OP-2',
      otrosPagos: ['a', 'b', 'c', 'd', 'e'].map((x) => ({ paymentId: `${x}0000000-0`, estado: null, monto: null, fecha: null })),
    });
    expect(tres).toContain('5 pagos más');
    expect(tres).toContain('y 2 más');
  });
});

describe('verificar un pago con el comprobante de la administración', () => {
  let app: Express;
  let cliente: any, trabajador: any, admin: any;
  const creados = { pagos: [] as string[], contratos: [] as string[], jobs: [] as string[] };
  const ids = () => [cliente, trabajador, admin].map((u) => u.id);
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const unica = () => `OP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

  const pagoDeContrato = async (over: Record<string, unknown> = {}) => {
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'in_progress' });
    creados.jobs.push(trabajo.id);
    const contrato: any = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'accepted', paymentStatus: 'pending_verification' });
    creados.contratos.push(contrato.id);
    const p: any = await Payment.create({
      payerId: cliente.id, recipientId: trabajador.id, contractId: contrato.id, amount: 5000, amountArs: 5000, currency: 'ARS',
      status: 'pending_verification', paymentType: 'contract_payment', paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0, isEscrow: true, ...over,
    } as any);
    creados.pagos.push(p.id);
    return p;
  };
  const pagoDePublicacion = async () => {
    const p: any = await Payment.create({
      payerId: cliente.id, recipientId: null, amount: 3000, amountArs: 3000, currency: 'ARS',
      status: 'pending_verification', paymentType: 'job_publication', paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0,
    } as any);
    creados.pagos.push(p.id);
    return p;
  };
  const aprobar = (id: string, body: Record<string, unknown>) => request(app).post(`/api/admin/payments/${id}/approve`).set(con(admin)).send(body);
  const fila = async (id: string, estado: string) => {
    const r = await request(app).get(`/api/admin/payments/pending?status=${estado}&search=${id}`).set(con(admin));
    expect(r.status).toBe(200);
    return (r.body.data as any[]).find((x) => x.id === id);
  };
  const esperar = async (cond: () => Promise<boolean>, ms = 4000) => {
    const hasta = Date.now() + ms;
    while (Date.now() < hasta) {
      if (await cond()) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/payments', (await import('../../server/routes/admin/payments.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    admin = await crearUsuario({ role: 'client', adminRole: 'admin' });
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

  it('el comprobante que sube la administración se guarda y la lista lo muestra (antes decía «Sin comprobante»)', async () => {
    const p = await pagoDeContrato();

    const r = await aprobar(p.id, { proofUrl: '/uploads/payment-proofs/admin-proof-1.png', bankReference: unica(), transferAmount: '5000', transferDate: '2026-11-07' });

    expect(r.status).toBe(200);
    expect(r.body.newStatus).toBe('verified');
    const guardado: any = await PaymentProof.findOne({ where: { paymentId: p.id } as any });
    expect(guardado).not.toBeNull();
    expect(guardado.kind).toBe('admin_verification');
    expect(guardado.fileUrl).toBe('/uploads/payment-proofs/admin-proof-1.png');

    const f = await fila(p.id, 'verified');
    expect(f).toBeDefined();
    expect(f.status).toBe('verified');
    expect(f.proofs).toHaveLength(0); // el recibo ACTIVO del cliente: no hay
    expect(f.adminProofs).toHaveLength(1); // pero el de la administración sí, y se ve
    expect(f.adminProofs[0].fileUrl).toBe('/uploads/payment-proofs/admin-proof-1.png');
    expect(f.hasProof).toBe(true);
    expect(f.comprobanteDuplicado).toBeNull();
  });

  it('un pago de contrato queda «verified» (pestaña Verificado) y ya no figura como pendiente', async () => {
    const p = await pagoDeContrato();
    expect(await fila(p.id, 'unverified')).toBeDefined();

    const r = await aprobar(p.id, { proofUrl: '/uploads/payment-proofs/admin-proof-2.png', bankReference: unica() });

    expect(r.body.newStatus).toBe('verified');
    expect(await fila(p.id, 'unverified')).toBeUndefined();
    expect(await fila(p.id, 'verified')).toBeDefined();
  });

  it('un pago de publicación queda «completed» y la respuesta lo dice: la pantalla no salta a una pestaña vacía', async () => {
    const p = await pagoDePublicacion();

    const r = await aprobar(p.id, { proofUrl: '/uploads/payment-proofs/admin-proof-3.png', bankReference: unica() });

    expect(r.status).toBe(200);
    expect(r.body.newStatus).toBe('completed');
    expect(r.body.data.payment.status).toBe('completed');
    expect(await fila(p.id, 'verified')).toBeUndefined();
    expect(await fila(p.id, 'completed')).toBeDefined();
  });

  describe('comprobante duplicado: se deja pasar y queda marcado', () => {
    it('el mismo número en otro pago (aunque cambie mayúsculas o haya espacios) se aprueba igual y se marca', async () => {
      const numero = unica();
      const primero = await pagoDeContrato();
      const segundo = await pagoDeContrato();

      const r1 = await aprobar(primero.id, { proofUrl: '/uploads/payment-proofs/a.png', bankReference: numero });
      expect(r1.status).toBe(200);
      expect(r1.body.comprobanteDuplicado).toBeNull();

      const r2 = await aprobar(segundo.id, { proofUrl: '/uploads/payment-proofs/b.png', bankReference: `  ${numero.toLowerCase()} ` });

      // Se deja pasar...
      expect(r2.status).toBe(200);
      expect((await Payment.findByPk(segundo.id) as any).status).toBe('verified');
      // ...pero queda marcado, y la respuesta dice con qué pago choca.
      expect(r2.body.comprobanteDuplicado).toBeTruthy();
      expect(r2.body.comprobanteDuplicado.otrosPagos.map((o: any) => o.paymentId)).toEqual([primero.id]);

      // La marca se ve en la lista, de los DOS lados (el primero también "tiene un gemelo").
      const f2 = await fila(segundo.id, 'verified');
      expect(f2.comprobanteDuplicado).toBeTruthy();
      expect(f2.comprobanteDuplicado.otrosPagos[0].paymentId).toBe(primero.id);
      const f1 = await fila(primero.id, 'verified');
      expect(f1.comprobanteDuplicado).toBeTruthy();
      expect(f1.comprobanteDuplicado.otrosPagos[0].paymentId).toBe(segundo.id);

      // Y queda el rastro fijo: en la nota del comprobante y en la auditoría.
      const comprobante: any = await PaymentProof.findOne({ where: { paymentId: segundo.id, kind: 'admin_verification' } as any });
      expect(comprobante.notes).toContain('Comprobante duplicado');
      let anotada: any = null;
      await esperar(async () => {
        anotada = await AuditLog.findOne({ where: { targetId: segundo.id, action: 'payment.approve' } as any });
        return !!anotada;
      });
      expect(anotada?.metadata?.comprobanteDuplicado?.otrosPagos).toEqual([primero.id]);
    });

    it('el detalle de los comprobantes del pago también trae la marca', async () => {
      const numero = unica();
      const a = await pagoDeContrato();
      const b = await pagoDeContrato();
      await aprobar(a.id, { proofUrl: '/uploads/payment-proofs/c.png', bankReference: numero });
      await aprobar(b.id, { proofUrl: '/uploads/payment-proofs/d.png', bankReference: numero });

      const r = await request(app).get(`/api/admin/payments/${b.id}/proofs`).set(con(admin));

      expect(r.status).toBe(200);
      expect(r.body.receipts).toHaveLength(1);
      expect(r.body.receipts[0].bankReference).toBe(numero);
      expect(r.body.receipts[0].comprobanteDuplicado.otrosPagos[0].paymentId).toBe(a.id);
    });

    it('un número único no se marca', async () => {
      const p = await pagoDeContrato();
      const r = await aprobar(p.id, { proofUrl: '/uploads/payment-proofs/e.png', bankReference: unica() });
      expect(r.body.comprobanteDuplicado).toBeNull();
      expect((await fila(p.id, 'verified')).comprobanteDuplicado).toBeNull();
    });

    it('el número de un comprobante RECHAZADO o de una nota no cuenta como repetido', async () => {
      const numero = unica();
      const ajeno = await pagoDeContrato();
      await PaymentProof.create({
        paymentId: ajeno.id, userId: cliente.id, fileUrl: '/uploads/payment-proofs/x.png', fileName: 'x.png', fileSize: 1, bankReference: numero,
        status: 'rejected', kind: 'client_receipt', isActive: false, uploadedAt: new Date(),
      } as any);
      await PaymentProof.create({
        paymentId: ajeno.id, userId: admin.id, fileUrl: '/uploads/payment-proofs/y.png', fileName: 'y.png', fileSize: 1, bankReference: numero,
        status: 'approved', kind: 'note', isActive: false, uploadedAt: new Date(),
      } as any);
      const p = await pagoDeContrato();

      const r = await aprobar(p.id, { proofUrl: '/uploads/payment-proofs/z.png', bankReference: numero });

      expect(r.status).toBe(200);
      expect(r.body.comprobanteDuplicado).toBeNull();
    });

    it('el mismo número dentro del MISMO pago no es un duplicado', async () => {
      const numero = unica();
      const p = await pagoDeContrato();
      // El cliente ya había declarado ese número en su recibo.
      await PaymentProof.create({
        paymentId: p.id, userId: cliente.id, fileUrl: '/uploads/payment-proofs/cliente.png', fileName: 'cliente.png', fileSize: 1, bankReference: numero,
        status: 'pending', kind: 'client_receipt', isActive: true, uploadedAt: new Date(),
      } as any);

      const r = await aprobar(p.id, { proofUrl: '/uploads/payment-proofs/admin.png', bankReference: numero });

      expect(r.status).toBe(200);
      expect(r.body.comprobanteDuplicado).toBeNull();
      const f = await fila(p.id, 'verified');
      expect(f.proofs).toHaveLength(1);
      expect(f.adminProofs).toHaveLength(1);
      expect(f.comprobanteDuplicado).toBeNull();
    });
  });
});
