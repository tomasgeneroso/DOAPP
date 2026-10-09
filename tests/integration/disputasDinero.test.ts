import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * POST /api/admin/disputes/:id/resolve — la ruta que reparte la plata de un contrato en conflicto.
 *
 * Lo que había (era la copia VIEJA del movimiento de dinero; el servicio resolverDisputa, que ya tiene el
 * libro, la exclusión mutua y el tope de devoluciones, sólo lo usaban el cron de silencio y los acuerdos):
 *  - Marcaba el pago y la disputa como reembolsados ANTES de pedirle el reembolso a MercadoPago y se tragaba el
 *    error: si MercadoPago fallaba, la disputa quedaba cerrada como "reembolsada" sin que saliera un peso.
 *  - En el reembolso total calculaba `amountArs - commission` con campos que el pago no tiene: daba 0 y
 *    MercadoPago devolvía TODO el pago, comisión incluida.
 *  - No miraba si la disputa ya estaba resuelta.
 *  - Un fallo al avisar por mail o socket, DESPUÉS de mover la plata, respondía 500.
 */

const mockReembolsar = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.mock('../../server/services/mercadopago.js', () => ({
  __esModule: true,
  default: { refundPayment: (...a: unknown[]) => mockReembolsar(...a), getPayment: async () => ({}) },
}));
const mockMail = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: (_t, p) => (p === 'sendDisputeResolvedEmail' ? (...a: unknown[]) => mockMail(...a) : async () => true) }),
}));

import { Contract } from '../../server/models/sql/Contract.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Dispute } from '../../server/models/sql/Dispute.model.js';
import { crearEscenario, crearUsuario, crearDisputa } from '../helpers/fixtures.js';

describe('resolver una disputa: la plata sale por el servicio, no por una copia vieja', () => {
  let app: Express;
  let admin: any, soporte: any, adminComun: any, moderador: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  /** Contrato de $50.000 pagado con $55.000 (precio + $5.000 de comisión) por MercadoPago, y una disputa abierta. */
  const armar = async (over: { mpId?: string | null } = {}) => {
    const e: any = await crearEscenario({ trabajo: { price: 50000, status: 'in_progress' }, contrato: { price: 50000 } });
    const mpId = over.mpId === undefined ? String(900000 + Math.floor(Math.random() * 99999)) : over.mpId;
    const pago: any = await Payment.create({
      contractId: e.contrato.id, payerId: e.cliente.id, recipientId: e.trabajador.id, amount: 55000, currency: 'ARS',
      status: 'held_escrow', paymentType: 'contract_payment', paymentMethod: mpId ? 'mercadopago' : 'bank_transfer',
      isEscrow: true, platformFee: 5000, platformFeePercentage: 10, ...(mpId ? { mercadopagoPaymentId: mpId } : {}),
    } as any);
    const disputa: any = await crearDisputa({ contractId: e.contrato.id, initiatedBy: e.cliente.id, against: e.trabajador.id }, { paymentId: pago.id });
    return { e, pago, disputa };
  };
  const resolver = (quien: any, id: string, body: Record<string, unknown>) =>
    request(app).post(`/api/admin/disputes/${id}/resolve`).set(con(quien)).send({ resolution: 'Resolución de prueba suficientemente larga', ...body });
  const estadoDe = async (id: string) => ((await Dispute.findByPk(id)) as any).status as string;
  const pagoDe = async (id: string) => (await Payment.findByPk(id)) as any;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/disputes', (await import('../../server/routes/admin/disputes.js')).default);
    admin = await crearUsuario({ role: 'admin', adminRole: 'super_admin' });
    soporte = await crearUsuario({ role: 'admin', adminRole: 'support' });
    adminComun = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    moderador = await crearUsuario({ role: 'admin', adminRole: 'moderator' });
  });

  beforeEach(() => {
    mockReembolsar.mockReset();
    mockReembolsar.mockResolvedValue({ refundId: 'refund-ok' });
    mockMail.mockReset();
    mockMail.mockResolvedValue(true);
  });

  it('si MercadoPago FALLA, la disputa NO se cierra como reembolsada y el pago y el contrato quedan como estaban', async () => {
    const { e, pago, disputa } = await armar();
    mockReembolsar.mockRejectedValue(new Error('MercadoPago no respondió'));

    const r = await resolver(admin, disputa.id, { resolutionType: 'full_refund' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('DISPUTE_NOT_RESOLVED');
    expect(await estadoDe(disputa.id)).toBe('open');
    const p = await pagoDe(pago.id);
    expect(p.status).toBe('held_escrow');
    expect(Number(p.refundedAmount || 0)).toBe(0);
    const c: any = await Contract.findByPk(e.contrato.id);
    expect(c.status).not.toBe('cancelled');
    expect(c.paymentStatus).not.toBe('refunded');
  });

  it('el reembolso total devuelve el PRECIO del trabajo, no el total pagado: la comisión no se devuelve', async () => {
    const { pago, disputa } = await armar();
    const r = await resolver(admin, disputa.id, { resolutionType: 'full_refund' });
    expect(r.status).toBe(200);
    expect(mockReembolsar).toHaveBeenCalledTimes(1);
    const [mpId, proveedor, monto] = mockReembolsar.mock.calls[0] as [string, string, number];
    expect(mpId).toBe((await pagoDe(pago.id)).mercadopagoPaymentId);
    expect(proveedor).toBe('mercadopago');
    expect(monto).toBe(50000); // antes: 0 → MercadoPago devolvía los $55.000 enteros
    expect(await estadoDe(disputa.id)).toBe('resolved_refunded');
    expect(Number((await pagoDe(pago.id)).refundedAmount)).toBe(50000);
  });

  it('una devolución parcial devuelve el monto pedido', async () => {
    const { disputa } = await armar();
    const r = await resolver(admin, disputa.id, { resolutionType: 'partial_refund', refundAmount: 20000 });
    expect(r.status).toBe(200);
    expect((mockReembolsar.mock.calls[0] as unknown[])[2]).toBe(20000);
    expect(await estadoDe(disputa.id)).toBe('resolved_partial');
  });

  it('una devolución parcial exige un monto válido; uno mayor al pago se limita a lo pagado', async () => {
    const { disputa } = await armar();
    for (const malo of [undefined, 0, -5, 'mucho', null]) {
      const r = await resolver(admin, disputa.id, { resolutionType: 'partial_refund', refundAmount: malo });
      expect([String(malo), r.status]).toEqual([String(malo), 400]);
    }
    expect(mockReembolsar).not.toHaveBeenCalled();
    const r = await resolver(admin, disputa.id, { resolutionType: 'partial_refund', refundAmount: 9_999_999 });
    expect(r.status).toBe(200);
    expect((mockReembolsar.mock.calls[0] as unknown[])[2] ?? 55000).toBeLessThanOrEqual(55000);
  });

  it('una disputa ya resuelta no se vuelve a resolver (y no se reembolsa dos veces)', async () => {
    const { disputa } = await armar();
    expect((await resolver(admin, disputa.id, { resolutionType: 'full_refund' })).status).toBe(200);
    const otra = await resolver(admin, disputa.id, { resolutionType: 'full_refund' });
    expect(otra.status).toBe(409);
    expect(mockReembolsar).toHaveBeenCalledTimes(1);
  });

  it('un pago que NO es de MercadoPago no se cierra como reembolsado sin que alguien confirme que la devolución se hizo', async () => {
    const { e, pago, disputa } = await armar({ mpId: null });
    const r = await resolver(admin, disputa.id, { resolutionType: 'full_refund' });
    expect(r.status).toBe(409);
    expect(r.body.message).toContain('devolucionManual');
    expect(await estadoDe(disputa.id)).toBe('open');
    expect((await pagoDe(pago.id)).status).toBe('held_escrow');
    expect(((await Contract.findByPk(e.contrato.id)) as any).status).not.toBe('cancelled');
    expect(mockReembolsar).not.toHaveBeenCalled();
  });

  it('con devolucionManual: true se cierra, queda asentado y no se le pide nada a MercadoPago', async () => {
    const { pago, disputa } = await armar({ mpId: null });
    const r = await resolver(admin, disputa.id, { resolutionType: 'full_refund', devolucionManual: true });
    expect(r.status).toBe(200);
    expect(mockReembolsar).not.toHaveBeenCalled();
    expect(await estadoDe(disputa.id)).toBe('resolved_refunded');
    expect((await pagoDe(pago.id)).status).toBe('refunded');
  });

  it('sin el casillero, el rechazo trae un código que la pantalla usa para pedir la confirmación', async () => {
    const { disputa } = await armar({ mpId: null });
    const r = await resolver(admin, disputa.id, { resolutionType: 'full_refund' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('DEVOLUCION_MANUAL_REQUERIDA');
  });

  it('un admin común (rol "admin") puede resolver una disputa: la documentación le da las disputas', async () => {
    const { disputa } = await armar();
    const r = await resolver(adminComun, disputa.id, { resolutionType: 'full_release' });
    expect(r.status).toBe(200);
    expect(await estadoDe(disputa.id)).toBe('resolved_released');
  });

  it('el rol moderator resuelve, pero NO puede confirmar una devolución "por fuera"', async () => {
    const { disputa, pago } = await armar({ mpId: null });
    const r = await resolver(moderador, disputa.id, { resolutionType: 'full_refund', devolucionManual: true });
    expect(r.status).toBe(403);
    expect(await estadoDe(disputa.id)).toBe('open');
    expect((await pagoDe(pago.id)).status).toBe('held_escrow');
  });

  describe('ejecutar un acuerdo aceptado por las partes', () => {
    const conAcuerdo = async (mpId: string | null) => {
      const a = await armar({ mpId });
      await Dispute.update({ agreementProposal: { tipo: 'reembolso_total' }, agreementAcceptedAt: new Date() } as any, { where: { id: a.disputa.id } });
      return a;
    };
    const ejecutar = (quien: any, id: string, body: Record<string, unknown> = {}) =>
      request(app).post(`/api/admin/disputes/${id}/ejecutar-acuerdo`).set(con(quien)).send(body);

    it('soporte NO puede dar por hecha una devolución "por fuera": 403 y la disputa sigue abierta', async () => {
      const { disputa, pago } = await conAcuerdo(null);
      const r = await ejecutar(soporte, disputa.id, { devolucionManual: true });
      expect(r.status).toBe(403);
      expect(await estadoDe(disputa.id)).toBe('open');
      expect((await pagoDe(pago.id)).status).toBe('held_escrow');
    });

    it('soporte sí ejecuta un acuerdo cuyo pago es de MercadoPago (sale por MercadoPago)', async () => {
      const { disputa } = await conAcuerdo(String(800000 + Math.floor(Math.random() * 99999)));
      const r = await ejecutar(soporte, disputa.id);
      expect(r.status).toBe(200);
      expect(mockReembolsar).toHaveBeenCalledTimes(1);
    });

    it('un pago sin MercadoPago pide la confirmación (400 con código) y no cierra nada', async () => {
      const { disputa } = await conAcuerdo(null);
      const r = await ejecutar(admin, disputa.id);
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('DEVOLUCION_MANUAL_REQUERIDA');
      expect(await estadoDe(disputa.id)).toBe('open');
    });

    it('admin confirma la devolución por fuera: se cierra y no se le pide nada a MercadoPago', async () => {
      const { disputa, pago } = await conAcuerdo(null);
      const r = await ejecutar(admin, disputa.id, { devolucionManual: true });
      expect(r.status).toBe(200);
      expect(mockReembolsar).not.toHaveBeenCalled();
      expect(await estadoDe(disputa.id)).toBe('resolved_refunded');
      expect((await pagoDe(pago.id)).status).toBe('refunded');
    });
  });

  it('liberar el pago al trabajador no pide ningún reembolso', async () => {
    const { disputa } = await armar();
    const r = await resolver(admin, disputa.id, { resolutionType: 'full_release' });
    expect(r.status).toBe(200);
    expect(mockReembolsar).not.toHaveBeenCalled();
    expect(await estadoDe(disputa.id)).toBe('resolved_released');
  });

  it('si el mail de aviso falla DESPUÉS de mover la plata, la ruta responde 200 (no 500) y la disputa queda resuelta', async () => {
    const { disputa } = await armar();
    mockMail.mockRejectedValue(new Error('SMTP caído'));
    const r = await resolver(admin, disputa.id, { resolutionType: 'full_release' });
    expect(r.status).toBe(200);
    expect(await estadoDe(disputa.id)).toBe('resolved_released');
  });

  it('sólo owner, super_admin y moderator resuelven: soporte recibe 403 y no cambia nada', async () => {
    const { disputa } = await armar();
    const r = await resolver(soporte, disputa.id, { resolutionType: 'full_refund' });
    expect(r.status).toBe(403);
    expect(await estadoDe(disputa.id)).toBe('open');
    expect(mockReembolsar).not.toHaveBeenCalled();
  });

  it('una disputa inexistente es 404', async () => {
    const r = await resolver(admin, '123e4567-e89b-12d3-a456-426614174000', { resolutionType: 'full_release' });
    expect(r.status).toBe(404);
  });
});
