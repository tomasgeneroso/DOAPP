import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * POST /api/admin/pending-payments/:contractId/mark-paid — la salida del dinero hacia el trabajador.
 *
 * Lo que había: (1) aceptaba cualquier contrato por su id, aunque el cliente nunca hubiera pagado o su
 * pago estuviera reembolsado o fallido, y marcaba como pagado "cualquier pago que encontrara"; (2) usaba
 * `deductions` y `finalAmountPaid` del cuerpo sin tipo ni tope (un texto rompía con un 500 DESPUÉS de
 * asentar el pago en el libro; un monto mayor que lo adeudado se transfería sin más); (3) un reintento
 * rehacía todo (notificación al trabajador, comprobante, asientos) porque el libro contesta "ok" a la
 * misma acción repetida.
 *
 * Base de pruebas real; nada sale a la red.
 */

jest.mock('../../server/index.js', () => ({ __esModule: true, socketService: {} }));
jest.mock('../../server/services/invoiceService.js', () => ({
  __esModule: true,
  generateWorkerPaymentInvoice: async () => undefined,
  getUserInvoices: async () => [],
  getInvoiceById: async () => null,
}));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { PaymentAction } from '../../server/models/sql/PaymentAction.model.js';
import { PaymentProof } from '../../server/models/sql/PaymentProof.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

const DEBIDO = 1000; // precio del contrato = lo que se le adeuda al trabajador

describe('mark-paid: sólo se paga lo que está confirmado, por un monto válido y una sola vez', () => {
  let app: Express;
  let cliente: any, trabajador: any, admin: any, owner: any, comun: any;
  const ids: Record<string, string> = {};
  const tokenDe = (u: any) => jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret');
  const como = (u: any) => ({ Authorization: `Bearer ${tokenDe(u)}` });
  const creados: { jobs: string[]; contratos: string[] } = { jobs: [], contratos: [] };

  const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);

  /** Un contrato terminado hace un mes (fuera de la retención) con un pago del cliente en el estado indicado. */
  const armar = async (estadoDelPago: string | null, over: Record<string, unknown> = {}) => {
    const trabajo = await crearTrabajo(cliente.id, { status: 'completed' });
    creados.jobs.push(trabajo.id);
    const contrato = await crearContrato(
      { jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id },
      { status: 'completed', paymentStatus: 'pending_payout', escrowStatus: 'released', price: DEBIDO, clientConfirmedAt: hace(30), completedAt: hace(30), ...over },
    );
    creados.contratos.push(contrato.id);
    if (estadoDelPago) {
      await Payment.create({
        contractId: contrato.id, payerId: cliente.id, recipientId: trabajador.id, amount: DEBIDO, currency: 'ARS',
        status: estadoDelPago, paymentType: 'contract_payment', paymentMethod: 'mercadopago', isEscrow: true,
        platformFee: 0, platformFeePercentage: 0, approvedAt: hace(30),
      } as any);
    }
    return contrato.id as string;
  };

  const pagar = (quien: any, contractId: string, body: Record<string, unknown> = {}) =>
    request(app).post(`/api/admin/pending-payments/${contractId}/mark-paid`).set(como(quien)).send(body);
  const asientos = (contractId: string) => PaymentAction.count({ where: { contractId } });
  const estadoContrato = async (id: string) => ((await Contract.findByPk(id)) as any).paymentStatus as string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    const rutas = await import('../../server/routes/admin/pendingPayments.js');
    app.use('/api/admin/pending-payments', rutas.default);

    cliente = await crearUsuario();
    trabajador = await crearUsuario({ role: 'doer', bankingInfo: { cbu: '0000000000000000000000', alias: 'doer.prueba' } });
    admin = await crearUsuario({ role: 'doer', adminRole: 'admin' });
    owner = await crearUsuario({ role: 'doer', adminRole: 'owner' });
    comun = await crearUsuario({ role: 'doer' });
    Object.assign(ids, { cliente: cliente.id, trabajador: trabajador.id, admin: admin.id, owner: owner.id, comun: comun.id });
  });

  afterAll(async () => {
    try {
      await PaymentAction.destroy({ where: { contractId: creados.contratos } });
      await Notification.destroy({ where: { recipientId: Object.values(ids) } });
      const pagos: any[] = await Payment.findAll({ where: { contractId: creados.contratos }, attributes: ['id'] });
      await PaymentProof.destroy({ where: { paymentId: pagos.map((p) => p.id) } });
      await Payment.destroy({ where: { contractId: creados.contratos } });
      await Contract.destroy({ where: { id: creados.contratos }, force: true });
      await Job.destroy({ where: { id: creados.jobs }, force: true });
      await User.destroy({ where: { id: Object.values(ids) }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  beforeEach(() => undefined);

  /* ---------------- el pago del cliente tiene que estar confirmado ---------------- */

  it('sin ningún pago del cliente: 409 y no se asienta nada', async () => {
    const id = await armar(null);
    const r = await pagar(admin, id);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('PAYOUT_SIN_PAGO_CONFIRMADO');
    expect(await estadoContrato(id)).toBe('pending_payout');
    expect(await asientos(id)).toBe(0);
  });

  it.each(['pending', 'processing', 'pending_verification', 'verified', 'held_escrow', 'refunded', 'failed', 'disputed'])(
    'con el pago del cliente en "%s" (no confirmado para pagar): 409',
    async (estado) => {
      const id = await armar(estado);
      const r = await pagar(admin, id);
      expect([estado, r.status]).toEqual([estado, 409]);
      expect(r.body.code).toBe('PAYOUT_SIN_PAGO_CONFIRMADO');
      expect(await estadoContrato(id)).toBe('pending_payout');
      expect(await asientos(id)).toBe(0);
      // y el pago no se tocó
      expect(((await Payment.findOne({ where: { contractId: id } })) as any).status).toBe(estado);
    },
  );

  it('con el pago en confirmed_for_payout se paga: contrato y pago quedan completados, con UN asiento', async () => {
    const id = await armar('confirmed_for_payout');
    const r = await pagar(admin, id, { proofOfPayment: 'comprobante-123' });
    expect(r.status).toBe(200);
    expect(await estadoContrato(id)).toBe('completed');
    expect(((await Payment.findOne({ where: { contractId: id } })) as any).status).toBe('completed');
    expect(await asientos(id)).toBe(1);
    // El comprobante de la transferencia quedó registrado como evidencia de administración (antes el create
    // faltaba campos obligatorios y la ruta respondía 500 con el pago ya hecho).
    const pago: any = await Payment.findOne({ where: { contractId: id } });
    const pruebas: any[] = await PaymentProof.findAll({ where: { paymentId: pago.id } });
    expect(pruebas.length).toBe(1);
    expect(pruebas[0].kind).toBe('note');
    expect(pruebas[0].isActive).toBe(false);
    expect(pruebas[0].fileUrl).toBe('comprobante-123');
  });

  it('un contrato cancelado no se paga', async () => {
    const id = await armar('confirmed_for_payout', { status: 'cancelled' });
    const r = await pagar(admin, id);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('PAYOUT_CONTRATO_NO_PAGABLE');
    expect(await asientos(id)).toBe(0);
  });

  /* ---------------- una sola vez ---------------- */

  it('un reintento no rehace nada: 409, y sigue habiendo un solo asiento y un solo aviso al trabajador', async () => {
    const id = await armar('confirmed_for_payout');
    expect((await pagar(admin, id)).status).toBe(200);
    const avisos = await Notification.count({ where: { recipientId: trabajador.id, relatedId: id } });

    const otra = await pagar(admin, id);
    expect(otra.status).toBe(409);
    expect(otra.body.code).toBe('PAYOUT_YA_PAGADO');
    expect(await asientos(id)).toBe(1);
    expect(await Notification.count({ where: { recipientId: trabajador.id, relatedId: id } })).toBe(avisos);
  });

  /* ---------------- los importes del cuerpo ---------------- */

  it.each([
    ['finalAmountPaid como texto', { deductions: { finalAmountPaid: '900' } }],
    ['finalAmountPaid negativo', { deductions: { finalAmountPaid: -50 } }],
    ['finalAmountPaid mayor que lo adeudado', { deductions: { finalAmountPaid: DEBIDO + 500 } }],
    ['taxAmount como texto', { deductions: { taxAmount: 'mucho' } }],
    ['bankFee negativo', { deductions: { bankFee: -1 } }],
    ['otherDeductions como objeto', { deductions: { otherDeductions: { a: 1 } } }],
    ['deducciones como texto', { deductions: 'todas' }],
    ['deducciones como lista', { deductions: [1, 2, 3] }],
  ])('rechaza con 400 %s, ANTES de asentar nada', async (_nombre, cuerpo) => {
    const id = await armar('confirmed_for_payout');
    const r = await pagar(admin, id, cuerpo as any);
    expect([_nombre, r.status]).toEqual([_nombre, 400]);
    expect(await estadoContrato(id)).toBe('pending_payout');
    expect(await asientos(id)).toBe(0);
    expect(((await Payment.findOne({ where: { contractId: id } })) as any).status).toBe('confirmed_for_payout');
  });

  it('un finalAmountPaid infinito (1e999 llega como Infinity por HTTP) se rechaza', async () => {
    const id = await armar('confirmed_for_payout');
    const r = await request(app)
      .post(`/api/admin/pending-payments/${id}/mark-paid`)
      .set(como(admin))
      .set('Content-Type', 'application/json')
      .send('{"deductions":{"finalAmountPaid":1e999}}');
    expect(r.status).toBe(400);
    expect(await asientos(id)).toBe(0);
  });

  it('un monto menor o igual a lo adeudado, con deducciones numéricas, se paga', async () => {
    const id = await armar('confirmed_for_payout');
    const r = await pagar(admin, id, { deductions: { bankFee: 30, taxAmount: 20, otherDeductions: 0, finalAmountPaid: 950 } });
    expect(r.status).toBe(200);
    expect(await estadoContrato(id)).toBe('completed');
    expect(await asientos(id)).toBe(1);
  });

  /* ---------------- la salida de emergencia ---------------- */

  it('un admin común NO puede saltear la confirmación del pago, ni con justificación', async () => {
    const id = await armar('refunded');
    const r = await pagar(admin, id, { forzarSinPago: true, justificacionSinPago: 'Autorizado por el dueño en una llamada' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('PAYOUT_SIN_PAGO_CONFIRMADO');
    expect(await asientos(id)).toBe(0);
  });

  it('el owner no puede saltearla sin una justificación de al menos 15 caracteres', async () => {
    const id = await armar('failed');
    for (const j of [undefined, '', 'corto', '   ']) {
      const r = await pagar(owner, id, { forzarSinPago: true, justificacionSinPago: j });
      expect([String(j), r.status]).toEqual([String(j), 409]);
    }
    expect(await asientos(id)).toBe(0);
  });

  it('el owner, con forzarSinPago y una justificación, puede pagar (queda asentado)', async () => {
    const id = await armar('failed');
    const r = await pagar(owner, id, { forzarSinPago: true, justificacionSinPago: 'El pago se acreditó por fuera del sistema, ver comprobante #12' });
    expect(r.status).toBe(200);
    expect(await estadoContrato(id)).toBe('completed');
    expect(await asientos(id)).toBe(1);
  });

  /* ---------------- quién puede ---------------- */

  it('un usuario sin rol de administración recibe 403 y no cambia nada', async () => {
    const id = await armar('confirmed_for_payout');
    const r = await pagar(comun, id);
    expect(r.status).toBe(403);
    expect(await estadoContrato(id)).toBe('pending_payout');
    expect(await asientos(id)).toBe(0);
  });

  it('un id de contrato que no es UUID es un 400, no un error de base de datos', async () => {
    const r = await pagar(admin, 'no-es-un-uuid');
    expect(r.status).toBe(400);
  });
});
