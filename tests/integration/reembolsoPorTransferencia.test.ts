import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Reembolso de pagos por TRANSFERENCIA (regla del dueño, 2026-11-09): el equipo devuelve el pago al saldo del cliente o a su banco, y el cliente puede pedirlo.
 *
 * Qué se comprueba: que la plata sale una sola vez (aunque dos personas aprieten juntas), que no se devuelve lo que sostiene una publicación o un contrato en marcha,
 * que nadie reembolsa un pago propio (salvo el dueño), que por encima del tope lo hace el dueño, y el circuito completo del pedido del cliente (crear, ver, retirar,
 * aprobar, rechazar). Base de pruebas real; nada sale a la red.
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
import { Notification } from '../../server/models/sql/Notification.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { RefundRequest } from '../../server/models/sql/RefundRequest.model.js';
import { esPagoPorTransferencia, restanteReembolsable } from '../../server/services/reembolsoPorTransferencia.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

const MOTIVO = 'el cliente transfirió dos veces lo mismo';
const COMPROBANTE = '/uploads/payment-proofs/admin-proof-prueba.pdf';

describe('reembolsoPorTransferencia (las reglas solas)', () => {
  it('solo un pago por transferencia (sin id de pasarela) es reembolsable por acá', () => {
    expect(esPagoPorTransferencia({ paymentMethod: 'bank_transfer' })).toBe(true);
    expect(esPagoPorTransferencia({ paymentMethod: 'bank_transfer', mercadopagoPaymentId: 'mp-1' })).toBe(false);
    expect(esPagoPorTransferencia({ paymentMethod: 'bank_transfer', paypalCaptureId: 'pp-1' })).toBe(false);
    expect(esPagoPorTransferencia({ paymentMethod: 'mercadopago' })).toBe(false);
    expect(esPagoPorTransferencia({})).toBe(false);
  });
});

describe('reembolso de pagos por transferencia', () => {
  let app: Express;
  let cliente: any, otroCliente: any, trabajador: any, admin: any, otroAdmin: any, adminPagador: any, dueno: any;
  const creados = { pagos: [] as string[], contratos: [] as string[], jobs: [] as string[] };
  const ids = () => [cliente, otroCliente, trabajador, admin, otroAdmin, adminPagador, dueno].map((u) => u.id);
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  const pagoDe = async (payerId: string, over: Record<string, unknown> = {}) => {
    const p: any = await Payment.create({
      payerId, amount: 5000, amountArs: 5000, currency: 'ARS', status: 'completed', paymentType: 'job_publication', paymentMethod: 'bank_transfer',
      platformFee: 0, platformFeePercentage: 0, ...over,
    } as any);
    creados.pagos.push(p.id);
    return p;
  };
  const recargar = async (id: string) => (await Payment.findByPk(id)) as any;
  const saldoDe = async (u: any) => Number(((await User.findByPk(u.id)) as any).balanceArs) || 0;
  const reembolsar = (quien: any, id: string, body: Record<string, unknown>) => request(app).post(`/api/admin/payments/${id}/refund-transfer`).set(con(quien)).send(body);
  const pedir = (quien: any, body: Record<string, unknown>) => request(app).post('/api/refund-requests').set(con(quien)).send(body);

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/payments', (await import('../../server/routes/admin/payments.js')).default);
    app.use('/api/admin/refund-requests', (await import('../../server/routes/admin/refundRequests.js')).default);
    app.use('/api/refund-requests', (await import('../../server/routes/refundRequests.js')).default);
    app.use('/api/payments', (await import('../../server/routes/payments.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    otroCliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    admin = await crearUsuario({ role: 'client', adminRole: 'admin' });
    otroAdmin = await crearUsuario({ role: 'client', adminRole: 'admin' });
    adminPagador = await crearUsuario({ role: 'client', adminRole: 'admin' });
    dueno = await crearUsuario({ role: 'client', adminRole: 'owner' });
  });

  afterAll(async () => {
    try {
      await RefundRequest.destroy({ where: { paymentId: creados.pagos } });
      await AuditLog.destroy({ where: { targetId: creados.pagos } as any });
      await BalanceTransaction.destroy({ where: { userId: ids() } });
      await Notification.destroy({ where: { recipientId: ids() } });
      await Payment.destroy({ where: { id: creados.pagos }, force: true } as any);
      await Contract.destroy({ where: { id: creados.contratos }, force: true });
      await Job.destroy({ where: { id: creados.jobs }, force: true });
      await User.destroy({ where: { id: ids() }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  /* ---------------- el equipo reembolsa ---------------- */

  describe('POST /api/admin/payments/:id/refund-transfer', () => {
    it('al SALDO: se acredita en el momento, el pago queda devuelto y el cliente recibe un aviso', async () => {
      const p = await pagoDe(cliente.id);
      const antes = await saldoDe(cliente);

      const r = await reembolsar(admin, p.id, { destino: 'saldo', motivo: MOTIVO });

      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ monto: 5000, destino: 'saldo', completo: true, restante: 0 });
      expect(await saldoDe(cliente)).toBe(antes + 5000);
      const despues = await recargar(p.id);
      expect(despues.status).toBe('refunded');
      expect(despues.refundedBy).toBe(admin.id);
      const asiento: any = await BalanceTransaction.findOne({ where: { userId: cliente.id, type: 'refund' } as any, order: [['createdAt', 'DESC']] });
      expect(Number(asiento.amount)).toBe(5000);
      expect(await Notification.count({ where: { recipientId: cliente.id, title: 'Te devolvimos tu dinero' } as any })).toBeGreaterThanOrEqual(1);
    });

    it('una vez devuelto no se devuelve de nuevo: 409 y el saldo no se mueve', async () => {
      const p = await pagoDe(cliente.id);
      expect((await reembolsar(admin, p.id, { destino: 'saldo', motivo: MOTIVO })).status).toBe(200);
      const saldo = await saldoDe(cliente);

      const otra = await reembolsar(otroAdmin, p.id, { destino: 'saldo', motivo: MOTIVO });

      expect(otra.status).toBe(409);
      expect(await saldoDe(cliente)).toBe(saldo);
    });

    it('parcial al saldo y el resto al BANCO (con comprobante): cada centavo cuenta una vez', async () => {
      const p = await pagoDe(cliente.id);
      const antes = await saldoDe(cliente);

      const parcial = await reembolsar(admin, p.id, { destino: 'saldo', monto: 2000, motivo: MOTIVO });
      expect(parcial.status).toBe(200);
      expect(parcial.body.data).toMatchObject({ monto: 2000, completo: false, restante: 3000 });
      expect((await recargar(p.id)).status).toBe('completed');
      expect(await restanteReembolsable(await recargar(p.id))).toBe(3000);

      const demasiado = await reembolsar(admin, p.id, { destino: 'banco', monto: 3500, motivo: MOTIVO, comprobanteUrl: COMPROBANTE });
      expect(demasiado.status).toBe(400);
      expect(demasiado.body.code).toBe('REEMBOLSO_MONTO');

      const sinComprobante = await reembolsar(admin, p.id, { destino: 'banco', motivo: MOTIVO });
      expect(sinComprobante.status).toBe(400);
      expect(sinComprobante.body.code).toBe('REEMBOLSO_SIN_COMPROBANTE');

      const resto = await reembolsar(admin, p.id, { destino: 'banco', motivo: MOTIVO, comprobanteUrl: COMPROBANTE });
      expect(resto.status).toBe(200);
      expect(resto.body.data).toMatchObject({ monto: 3000, destino: 'banco', completo: true });
      const final = await recargar(p.id);
      expect(final.status).toBe('refunded');
      expect(Number(final.refundedAmount)).toBe(3000); // lo que salió al banco; lo del saldo está en el libro del cliente
      expect(await saldoDe(cliente)).toBe(antes + 2000); // el banco no toca el saldo
    });

    it('dos personas que aprietan juntas: sale UNA vez', async () => {
      const p = await pagoDe(cliente.id);
      const antes = await saldoDe(cliente);

      const [a, b] = await Promise.all([
        reembolsar(admin, p.id, { destino: 'saldo', motivo: MOTIVO }),
        reembolsar(otroAdmin, p.id, { destino: 'saldo', motivo: MOTIVO }),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(await saldoDe(cliente)).toBe(antes + 5000);
    });

    it('un pago de Mercado Pago no se reembolsa por acá (tiene su botón «Devolver»)', async () => {
      const p = await pagoDe(cliente.id, { paymentMethod: 'mercadopago', mercadopagoPaymentId: `mp-${Date.now()}` });
      const r = await reembolsar(admin, p.id, { destino: 'saldo', motivo: MOTIVO });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('REEMBOLSO_NO_ES_TRANSFERENCIA');
    });

    it('un pago que todavía no tiene plata en DOAPP no se devuelve', async () => {
      const p = await pagoDe(cliente.id, { status: 'pending_verification' });
      const r = await reembolsar(admin, p.id, { destino: 'saldo', motivo: MOTIVO });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('REEMBOLSO_PAGO_SIN_PLATA');
    });

    it('lo que respalda un contrato en marcha no se devuelve; cancelado el contrato, sí', async () => {
      const job = await crearTrabajo(cliente.id, { status: 'in_progress' });
      creados.jobs.push(job.id);
      const contrato = await crearContrato({ jobId: job.id, clientId: cliente.id, doerId: trabajador.id });
      creados.contratos.push(contrato.id);
      const p = await pagoDe(cliente.id, { paymentType: 'contract_payment', contractId: contrato.id, recipientId: trabajador.id });

      const bloqueado = await reembolsar(admin, p.id, { destino: 'saldo', motivo: MOTIVO });
      expect(bloqueado.status).toBe(409);
      expect(bloqueado.body.code).toBe('REEMBOLSO_CONTRATO_VIGENTE');
      expect((await recargar(p.id)).status).toBe('completed');

      await Contract.update({ status: 'cancelled' } as any, { where: { id: contrato.id } });
      const ok = await reembolsar(admin, p.id, { destino: 'saldo', motivo: MOTIVO });
      expect(ok.status).toBe(200);
    });

    it('la publicación que sostiene el pago tiene que estar cancelada', async () => {
      const job = await crearTrabajo(cliente.id, { status: 'open' });
      creados.jobs.push(job.id);
      const p = await pagoDe(cliente.id);
      await Job.update({ publicationPaymentId: p.id, publicationPaid: true } as any, { where: { id: job.id } });

      const bloqueado = await reembolsar(admin, p.id, { destino: 'saldo', motivo: MOTIVO });
      expect(bloqueado.status).toBe(409);
      expect(bloqueado.body.code).toBe('REEMBOLSO_PUBLICACION_ACTIVA');

      await Job.update({ status: 'cancelled' } as any, { where: { id: job.id } });
      expect((await reembolsar(admin, p.id, { destino: 'saldo', motivo: MOTIVO })).status).toBe(200);
    });

    it('sin motivo suficiente: 400, y no se mueve nada', async () => {
      const p = await pagoDe(cliente.id);
      const r = await reembolsar(admin, p.id, { destino: 'saldo', motivo: 'error' });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('REEMBOLSO_SIN_MOTIVO');
      expect((await recargar(p.id)).status).toBe('completed');
    });

    it('quien no es del equipo no puede: 403', async () => {
      const p = await pagoDe(cliente.id);
      const r = await reembolsar(cliente, p.id, { destino: 'saldo', motivo: MOTIVO });
      expect(r.status).toBe(403);
      expect((await recargar(p.id)).status).toBe('completed');
    });

    it('nadie reembolsa un pago propio: un administrador que pagó, no; el dueño sí (y queda anotado)', async () => {
      const propio = await pagoDe(adminPagador.id);
      const r = await reembolsar(adminPagador, propio.id, { destino: 'saldo', motivo: MOTIVO });
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('APROBACION-DE-PAGO-PROPIO');
      expect((await recargar(propio.id)).status).toBe('completed');

      const delDueno = await pagoDe(dueno.id);
      const ok = await reembolsar(dueno, delDueno.id, { destino: 'saldo', motivo: MOTIVO });
      expect(ok.status).toBe(200);
      const fila: any = await AuditLog.findOne({ where: { targetId: delDueno.id } as any });
      expect(JSON.stringify(fila?.metadata ?? {})).toContain('aprobacionPropiaDelDueno');
    });

    it('por encima del tope lo hace el dueño: un administrador recibe 403 y el pago no se toca', async () => {
      const p = await pagoDe(cliente.id, { amount: 250000, amountArs: 250000 });
      const r = await reembolsar(admin, p.id, { destino: 'saldo', motivo: MOTIVO });
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('REEMBOLSO_PIDE_AL_DUENO');
      expect((await recargar(p.id)).status).toBe('completed');
    });
  });

  /* ---------------- el cliente pide ---------------- */

  describe('pedidos del cliente (/api/refund-requests)', () => {
    it('el circuito: pedir → verlo en «mis pagos» → retirarlo → pedir de nuevo', async () => {
      const p = await pagoDe(cliente.id);

      const c = await pedir(cliente, { paymentId: p.id, reason: 'transferí dos veces por error' });
      expect(c.status).toBe(201);
      expect(c.body.data).toMatchObject({ status: 'pending', paymentId: p.id });

      const lista = await request(app).get('/api/payments/my/list').set(con(cliente));
      const fila = lista.body.data.find((x: any) => x.id === p.id);
      expect(fila.reembolso.puede).toBe(false);
      expect(fila.reembolso.solicitud.status).toBe('pending');
      expect(fila.reembolso.restante).toBe(5000);

      const repetido = await pedir(cliente, { paymentId: p.id, reason: 'transferí dos veces por error' });
      expect(repetido.status).toBe(409);
      expect(repetido.body.code).toBe('REEMBOLSO_PEDIDO_REPETIDO');

      const ajeno = await request(app).post(`/api/refund-requests/${c.body.data.id}/cancel`).set(con(otroCliente));
      expect(ajeno.status).toBe(409); // no es suyo: no se retira

      const retirado = await request(app).post(`/api/refund-requests/${c.body.data.id}/cancel`).set(con(cliente));
      expect(retirado.status).toBe(200);
      expect(retirado.body.data.status).toBe('cancelled');

      expect((await pedir(cliente, { paymentId: p.id, reason: 'ahora sí lo necesito de vuelta' })).status).toBe(201);
    });

    it('no se pide por un pago ajeno (como si no existiera), ni sin motivo, ni de más', async () => {
      const ajeno = await pagoDe(otroCliente.id);
      const a = await pedir(cliente, { paymentId: ajeno.id, reason: 'quiero lo que no es mío' });
      expect(a.status).toBe(404);

      const propio = await pagoDe(cliente.id);
      expect((await pedir(cliente, { paymentId: propio.id, reason: 'corto' })).body.code).toBe('REEMBOLSO_SIN_MOTIVO');
      expect((await pedir(cliente, { paymentId: propio.id, amount: 9999, reason: 'pido más de lo que pagué' })).body.code).toBe('REEMBOLSO_MONTO');
      expect((await pedir(cliente, { paymentId: 'no-es-un-id', reason: 'un id inventado cualquiera' })).status).toBe(400);
    });

    it('un pago de Mercado Pago no admite pedido por acá', async () => {
      const mp = await pagoDe(cliente.id, { paymentMethod: 'mercadopago', mercadopagoPaymentId: `mp-${Date.now()}-b` });
      const r = await pedir(cliente, { paymentId: mp.id, reason: 'quiero que me lo devuelvan' });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('REEMBOLSO_NO_ES_TRANSFERENCIA');
    });

    it('el equipo APRUEBA: la plata llega al saldo, el pedido queda resuelto y el cliente lo ve', async () => {
      const p = await pagoDe(cliente.id);
      const c = await pedir(cliente, { paymentId: p.id, reason: 'transferí dos veces por error' });
      const antes = await saldoDe(cliente);

      const pendientes = await request(app).get('/api/admin/refund-requests?status=pending').set(con(admin));
      expect(pendientes.status).toBe(200);
      const item = pendientes.body.data.pedidos.find((x: any) => x.id === c.body.data.id);
      expect(item).toMatchObject({ status: 'pending', restante: 5000, bloqueo: null });

      const noEsDelEquipo = await request(app).post(`/api/admin/refund-requests/${c.body.data.id}/approve`).set(con(cliente)).send({ destino: 'saldo' });
      expect(noEsDelEquipo.status).toBe(403);

      const ok = await request(app).post(`/api/admin/refund-requests/${c.body.data.id}/approve`).set(con(admin)).send({ destino: 'saldo', nota: 'Listo, ya está en tu saldo.' });
      expect(ok.status).toBe(200);
      expect(await saldoDe(cliente)).toBe(antes + 5000);
      const pedido: any = await RefundRequest.findByPk(c.body.data.id);
      expect(pedido).toMatchObject({ status: 'approved', destination: 'saldo', resolvedBy: admin.id });
      expect(Number(pedido.resolvedAmount)).toBe(5000);

      const lista = await request(app).get('/api/payments/my/list').set(con(cliente));
      const fila = lista.body.data.find((x: any) => x.id === p.id);
      expect(fila.reembolso.solicitud).toMatchObject({ status: 'approved', destination: 'saldo' });

      const otraVez = await request(app).post(`/api/admin/refund-requests/${c.body.data.id}/approve`).set(con(otroAdmin)).send({ destino: 'saldo' });
      expect(otraVez.status).toBe(409);
      expect(await saldoDe(cliente)).toBe(antes + 5000);
    });

    it('si no se puede devolver (contrato en marcha), el pedido sigue pendiente y la lista explica por qué', async () => {
      const job = await crearTrabajo(cliente.id, { status: 'in_progress' });
      creados.jobs.push(job.id);
      const contrato = await crearContrato({ jobId: job.id, clientId: cliente.id, doerId: trabajador.id });
      creados.contratos.push(contrato.id);
      const p = await pagoDe(cliente.id);
      const c = await pedir(cliente, { paymentId: p.id, reason: 'transferí dos veces por error' });
      expect(c.status).toBe(201);
      await Payment.update({ contractId: contrato.id } as any, { where: { id: p.id } });

      const lista = await request(app).get('/api/admin/refund-requests?status=pending').set(con(admin));
      const item = lista.body.data.pedidos.find((x: any) => x.id === c.body.data.id);
      expect(item.bloqueo.code).toBe('REEMBOLSO_CONTRATO_VIGENTE');

      const r = await request(app).post(`/api/admin/refund-requests/${c.body.data.id}/approve`).set(con(admin)).send({ destino: 'saldo' });
      expect(r.status).toBe(409);
      expect(((await RefundRequest.findByPk(c.body.data.id)) as any).status).toBe('pending');
      expect((await recargar(p.id)).status).toBe('completed');
    });

    it('el equipo RECHAZA con un motivo que lee el cliente; no se rechaza dos veces ni se aprueba después', async () => {
      const p = await pagoDe(cliente.id);
      const c = await pedir(cliente, { paymentId: p.id, reason: 'quiero mi plata de vuelta' });

      const corto = await request(app).post(`/api/admin/refund-requests/${c.body.data.id}/reject`).set(con(admin)).send({ nota: 'no' });
      expect(corto.status).toBe(400);

      const nota = 'El pago sostiene un contrato en marcha: cancelalo primero.';
      const ok = await request(app).post(`/api/admin/refund-requests/${c.body.data.id}/reject`).set(con(admin)).send({ nota });
      expect(ok.status).toBe(200);
      expect(await Notification.count({ where: { recipientId: cliente.id, title: 'Tu pedido de reembolso no se aprobó' } as any })).toBeGreaterThanOrEqual(1);

      const lista = await request(app).get('/api/payments/my/list').set(con(cliente));
      const fila = lista.body.data.find((x: any) => x.id === p.id);
      expect(fila.reembolso.solicitud).toMatchObject({ status: 'rejected', resolutionNote: nota });
      expect(fila.reembolso.puede).toBe(true); // puede volver a pedir

      expect((await request(app).post(`/api/admin/refund-requests/${c.body.data.id}/reject`).set(con(otroAdmin)).send({ nota })).status).toBe(409);
      expect((await request(app).post(`/api/admin/refund-requests/${c.body.data.id}/approve`).set(con(otroAdmin)).send({ destino: 'saldo' })).status).toBe(409);
      expect((await recargar(p.id)).status).toBe('completed');
    });

    it('un administrador no aprueba el pedido de un pago suyo', async () => {
      const p = await pagoDe(adminPagador.id);
      const c = await pedir(adminPagador, { paymentId: p.id, reason: 'es mi propio pago, lo quiero de vuelta' });
      expect(c.status).toBe(201);

      const r = await request(app).post(`/api/admin/refund-requests/${c.body.data.id}/approve`).set(con(adminPagador)).send({ destino: 'saldo' });
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('APROBACION-DE-PAGO-PROPIO');
      expect(((await RefundRequest.findByPk(c.body.data.id)) as any).status).toBe('pending');

      const otro = await request(app).post(`/api/admin/refund-requests/${c.body.data.id}/approve`).set(con(otroAdmin)).send({ destino: 'saldo' });
      expect(otro.status).toBe(200);
    });
  });
});
