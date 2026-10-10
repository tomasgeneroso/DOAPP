import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Cotización pagada por MercadoPago: el administrador hace UN solo paso.
 *
 * Antes el administrador tenía que verificar el pago (y pasarlo a garantía) y, por separado, aprobar el contrato.
 * Ahora, al aprobar el contrato, el pago de la cotización queda verificado y en garantía y se vincula al contrato, pero
 * SÓLO si ese pago ya pasó todos los controles contra MercadoPago (monto exacto, moneda, sin cuotas ni cupón): el webhook
 * le pone `mercadopagoVerifiedAt` recién entonces. Un pago que quedó en revisión no se toca.
 */

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

describe('aprobar el contrato de una cotización pagada: un solo paso', () => {
  let app: Express;
  let cliente: any, otroCliente: any, trabajador: any, admin: any;
  const jobs: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  /** Una cotización aceptada: trabajo, propuesta aprobada, contrato pendiente de aprobación y el pago de la cotización. */
  const armar = async (pago: Record<string, unknown> = {}, quien: any = cliente) => {
    const trabajo: any = await crearTrabajo(quien.id, { status: 'open', price: 10000 });
    jobs.push(trabajo.id);
    const propuesta: any = await Proposal.create({
      jobId: trabajo.id, clientId: quien.id, freelancerId: trabajador.id, proposedPrice: 12000,
      coverLetter: 'Cotización', estimatedDuration: 3, status: 'approved',
    } as any);
    const contrato: any = await crearContrato(
      { jobId: trabajo.id, clientId: quien.id, doerId: trabajador.id },
      { status: 'pending', paymentStatus: 'pending', price: 12000 },
    );
    const p: any = await Payment.create({
      payerId: quien.id, recipientId: trabajador.id, contractId: null, amount: 2300, currency: 'ARS',
      status: 'pending_verification', paymentType: 'contract_payment', paymentMethod: 'mercadopago',
      isEscrow: true, platformFee: 0, platformFeePercentage: 0,
      mercadopagoVerifiedAt: new Date(),
      metadata: { tipo: 'aceptacion_cotizacion', proposalId: propuesta.id, jobId: trabajo.id, montoAcordado: 12000 },
      ...pago,
    } as any);
    return { trabajo, propuesta, contrato, pago: p };
  };
  const aprobar = (id: string) => request(app).post(`/api/admin/contracts/${id}/approve`).set(con(admin)).send({});
  const pagoDe = async (id: string) => (await Payment.findByPk(id)) as any;
  const contratoDe = async (id: string) => (await Contract.findByPk(id)) as any;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/contracts', (await import('../../server/routes/admin/contracts.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    otroCliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    admin = await crearUsuario({ role: 'admin', adminRole: 'owner' });
  });

  afterAll(async () => {
    try {
      const ids = [cliente.id, otroCliente.id, trabajador.id, admin.id];
      await Notification.destroy({ where: { recipientId: ids } });
      await Payment.destroy({ where: { payerId: ids } });
      await Contract.destroy({ where: { jobId: jobs }, force: true });
      await Proposal.destroy({ where: { jobId: jobs }, force: true });
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: ids }, force: true });
    } catch { /* ok */ }
  });

  it('al aprobar el contrato, el pago de la cotización queda en garantía y vinculado, y el contrato sigue su flujo', async () => {
    const { contrato, pago } = await armar();

    const r = await aprobar(contrato.id);

    expect(r.status).toBe(200);
    expect(r.body.pagoDeCotizacionVerificado).toBe(true);
    const p = await pagoDe(pago.id);
    expect(p.status).toBe('held_escrow');
    expect(String(p.contractId)).toBe(String(contrato.id));
    expect(String(p.escrowVerifiedBy)).toBe(String(admin.id));
    const c = await contratoDe(contrato.id);
    // Escrow SYNC: el pago, el escrow del contrato y el estado de pago del contrato cambian juntos
    expect(c.escrowStatus).toBe('held_escrow');
    expect(c.paymentStatus).toBe('escrow');
    // y el contrato sólo pasó a "listo": todavía tienen que aceptar las partes y empezar
    expect(c.status).toBe('ready');
  });

  it('un pago que quedó EN REVISIÓN (sin la verificación de MercadoPago) NO se verifica solo', async () => {
    const { contrato, pago } = await armar({ mercadopagoVerifiedAt: null });

    const r = await aprobar(contrato.id);

    expect(r.status).toBe(200);
    expect(r.body.pagoDeCotizacionVerificado).toBe(false);
    const p = await pagoDe(pago.id);
    expect(p.status).toBe('pending_verification');
    expect(p.contractId ?? null).toBeNull();
    const c = await contratoDe(contrato.id);
    expect(c.status).toBe('ready');
    expect(c.escrowStatus).not.toBe('held_escrow');
  });

  it('no toca el pago de OTRO cliente ni uno de otra propuesta', async () => {
    const a = await armar();
    const b = await armar({}, otroCliente);
    // el pago de b se mueve al cliente a: es de otro pagador respecto del contrato de b, y de otra propuesta respecto de a
    await Payment.update({ payerId: otroCliente.id } as any, { where: { id: a.pago.id } });

    const r = await aprobar(a.contrato.id);

    expect(r.body.pagoDeCotizacionVerificado).toBe(false);
    expect((await pagoDe(a.pago.id)).status).toBe('pending_verification');
    expect((await pagoDe(b.pago.id)).status).toBe('pending_verification');
  });

  it('un contrato sin pago de cotización se aprueba como siempre', async () => {
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'open', price: 5000 });
    jobs.push(trabajo.id);
    const contrato: any = await crearContrato(
      { jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id },
      { status: 'pending', paymentStatus: 'pending', price: 5000 },
    );

    const r = await aprobar(contrato.id);

    expect(r.status).toBe(200);
    expect(r.body.pagoDeCotizacionVerificado).toBe(false);
    expect((await contratoDe(contrato.id)).status).toBe('ready');
  });

  it('el pago ya vinculado queda registrado en el libro de dinero', async () => {
    const { contrato, pago } = await armar();
    await aprobar(contrato.id);
    const { AuditLog } = await import('../../server/models/sql/AuditLog.model.js');
    const evento: any = await AuditLog.findOne({ where: { action: 'QUOTE_PAYMENT_VERIFIED_ON_APPROVAL', targetId: String(contrato.id) } });
    expect(evento).not.toBeNull();
    expect(String(pago.id)).toBeTruthy();
  });
});
