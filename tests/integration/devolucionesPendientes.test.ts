import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Lo que se le devuelve a un cliente mientras el pago original sigue en Mercado Pago.
 *
 * Regla del dueño: si el dinero todavía no llegó a la cuenta de DOAPP, el cliente tampoco lo puede usar como saldo. Lo ve, con su motivo y la fecha en
 * que pasa a su saldo, pero está «a favor PENDIENTE»: no suma al saldo, no se usa, no se retira. Cuando Mercado Pago libera el pago pasa a saldo y recién
 * ahí es suyo. Vale para todo lo que vuelve al cliente: una cancelación, una baja de precio de la publicación o del contrato, el trabajador que no puede.
 * Si el pago no pasó por Mercado Pago (una transferencia que un administrador confirmó) o ya se liberó, es saldo en el momento.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));
jest.mock('../../server/services/mercadopago.js', () => ({
  __esModule: true,
  default: { getPayment: jest.fn(async () => ({})), refundPayment: jest.fn(async () => ({})) },
}));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { ContractCancellationRequest } from '../../server/models/sql/ContractCancellationRequest.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import BalanceTransaction from '../../server/models/sql/BalanceTransaction.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';
import { liquidarSaldosPendientes } from '../../server/services/presupuestoDelTrabajo.js';
import { publicacionDevuelta } from '../../server/services/creditoDePublicacion.js';
import { auditarSaldos } from '../../server/services/auditoriaSaldos.js';

const DIA = 86_400_000;
/** Precio + comisión de una publicación de 36.000 (lo que vuelve al cliente si cancela sin trabajador). */
const A_FAVOR = 40356;

describe('devoluciones al cliente: a favor pendiente mientras Mercado Pago no libere el pago original', () => {
  let app: Express;
  let cliente: any, admin: any, doer: any, superAdmin: any;
  const clientes: string[] = [];
  const jobs: string[] = [];
  const pagos: string[] = [];
  const contratos: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const dias = (n: number) => new Date(Date.now() + n * DIA);

  /** Una publicación de 36.000 pagada. `pago` pisa lo que haga falta del pago (por defecto: aprobado hoy por Mercado Pago, que lo libera en diez días). */
  const publicacion = async (pago: Record<string, unknown> = {}, job: Record<string, unknown> = {}) => {
    const p: any = await Payment.create({
      payerId: cliente.id, recipientId: cliente.id, amount: 42511.27, amountArs: 42511.27, currency: 'ARS', status: 'held_escrow',
      paymentType: 'job_publication', paymentMethod: 'mercadopago', platformFee: 3600, processingCharge: 1781.22,
      mercadopagoStatus: null, approvedBy: String(admin.id), approvedAt: new Date(),
      ...pago,
    } as any);
    pagos.push(p.id);
    const j: any = await crearTrabajo(cliente.id, {
      title: 'Arreglo de canilla', price: 36000, status: 'open', publicationPaid: true, publicationPaymentId: p.id, selectedWorkers: [], startDate: dias(5),
      ...job,
    });
    jobs.push(j.id);
    return { pago: p, job: j };
  };

  const saldo = async () => Number(((await User.findByPk(cliente.id, { attributes: ['balanceArs'] })) as any).balanceArs) || 0;
  const devoluciones = async () => (await BalanceTransaction.findAll({ where: { userId: cliente.id, type: 'refund' } as any, order: [['createdAt', 'ASC']] })) as any[];
  const miBalance = async () => (await request(app).get('/api/balance').set(con(cliente))).body;
  const cancelar = (job: any, salida: 'saldo' | 'devolucion' = 'saldo') =>
    request(app).patch(`/api/jobs/${job.id}/cancel`).set(con(cliente)).send({ reason: 'ya no lo necesito', salida });
  /** Pasa el tiempo: Mercado Pago ya liberó todo lo que estaba esperando. */
  const pasanLosDiez = () => liquidarSaldosPendientes(dias(11));
  const hallazgosDelCliente = async () => (await auditarSaldos()).hallazgos.filter((h) => h.userId === String(cliente.id));

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    app.use('/api/contracts', (await import('../../server/routes/contracts.js')).default);
    app.use('/api/balance', (await import('../../server/routes/balance.js')).default);
    app.use('/api/admin/contracts', (await import('../../server/routes/admin/contracts.js')).default);
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    // Aprobar la cancelación de un contrato pide el permiso contracts:update, que tienen el dueño y el super administrador.
    superAdmin = await crearUsuario({ role: 'admin', adminRole: 'super_admin' });
    doer = await crearUsuario({ role: 'doer', dniVerified: true });
  });

  // Un cliente nuevo por test: el saldo de uno no se mezcla con el del otro.
  beforeEach(async () => {
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
    clientes.push(cliente.id);
  });

  afterAll(async () => {
    try {
      const ids = [...clientes, admin.id, superAdmin.id, doer.id];
      await Notification.destroy({ where: { recipientId: ids } });
      await ContractCancellationRequest.destroy({ where: { contractId: contratos } } as any);
      await Contract.destroy({ where: { id: contratos }, force: true });
      await Proposal.destroy({ where: { jobId: jobs }, force: true });
      await BalanceTransaction.destroy({ where: { userId: ids }, force: true } as any);
      await Job.destroy({ where: { id: jobs }, force: true });
      await Payment.destroy({ where: { id: pagos }, force: true } as any);
      await User.destroy({ where: { id: ids }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  /* ---------------- cancelar una publicación sin trabajador ---------------- */

  it('cancelar con el pago todavía en Mercado Pago: queda a favor PENDIENTE, el saldo no se mueve y el cliente lo ve con su motivo y su fecha', async () => {
    const { job, pago } = await publicacion();

    const r = await cancelar(job);

    expect(r.status).toBe(200);
    expect(r.body.plataMovida).toBe(true);
    expect(r.body.saldoAFavorPendiente).toBeCloseTo(A_FAVOR, 0);
    expect(new Date(r.body.pendienteHasta).getTime()).toBeGreaterThan(Date.now() + 9 * DIA);
    expect(r.body.message).toMatch(/pendientes de liquidar/);
    expect(r.body.message).toMatch(/no los podés usar ni retirar/);
    expect(await saldo()).toBe(0);

    const [fila, ...otras] = await devoluciones();
    expect(otras).toHaveLength(0);
    expect(fila.status).toBe('pending');
    expect(Number(fila.amount)).toBeCloseTo(A_FAVOR, 0);
    expect(fila.metadata).toMatchObject({ pendienteDeLiquidacion: true, origen: 'cancelacion', pagoId: String(pago.id), vincularAlLiquidar: true });

    const balance = await miBalance();
    expect([Number(balance.balance), balance.aFavorPendiente]).toEqual([0, expect.closeTo(A_FAVOR, 0)]);
    expect(balance.aFavorPendienteDetalle).toHaveLength(1);
    expect(balance.aFavorPendienteDetalle[0]).toMatchObject({ motivo: 'cancelacion' });
    expect(new Date(balance.aFavorPendienteDetalle[0].disponibleDesde).getTime()).toBe(new Date(r.body.pendienteHasta).getTime());

    const aviso: any = await Notification.findOne({ where: { recipientId: cliente.id, category: 'payment' } as any, order: [['createdAt', 'DESC']] });
    expect(aviso.title).toBe('Saldo a favor pendiente');
    expect(aviso.message).toMatch(/pendientes de liquidar/);
    expect(await hallazgosDelCliente()).toEqual([]);
  });

  it('mientras está pendiente no hay saldo vinculado para reprogramar: la publicación cuenta como devuelta y volver a publicarla hay que pagarla', async () => {
    const { job } = await publicacion();
    await cancelar(job);

    const leido: any = await Job.findByPk(job.id);
    expect(Number(leido.publicationCredit) || 0).toBe(0);
    expect(await publicacionDevuelta(leido)).toBe(true);

    const r = await request(app).put(`/api/jobs/${job.id}`).set(con(cliente)).send({ startDate: dias(8).toISOString(), endDate: dias(9).toISOString() });
    expect([r.status, r.body.requiresPayment]).toEqual([200, true]);
  });

  it('cuando Mercado Pago libera el pago pasa a saldo, queda vinculado a su publicación y se avisa', async () => {
    const { job } = await publicacion();
    await cancelar(job);

    await pasanLosDiez();

    expect(await saldo()).toBeCloseTo(A_FAVOR, 0);
    const [fila] = await devoluciones();
    expect(fila.status).toBe('completed');
    expect(Number(fila.balanceAfter) - Number(fila.balanceBefore)).toBeCloseTo(A_FAVOR, 0);
    expect(fila.metadata.pendienteDeLiquidacion).toBe(false);
    expect(Number(((await Job.findByPk(job.id)) as any).publicationCredit)).toBeCloseTo(A_FAVOR, 0);

    const balance = await miBalance();
    expect([balance.aFavorPendiente, balance.aFavorPendienteDetalle]).toEqual([0, []]);
    expect(balance.saldoVinculado).toBeCloseTo(A_FAVOR, 0);
    expect(await Notification.count({ where: { recipientId: cliente.id, title: 'Ya tenés tu saldo a favor' } as any })).toBe(1);
    expect(await hallazgosDelCliente()).toEqual([]);

    // Liquidar dos veces no acredita dos veces.
    await pasanLosDiez();
    expect(await saldo()).toBeCloseTo(A_FAVOR, 0);
  });

  it('si el cliente ya volvió a pagar la publicación antes de la liquidación, el saldo es suyo pero NO queda vinculado a una publicación que ya está paga', async () => {
    const { job } = await publicacion();
    await cancelar(job);
    // Reprogramó y la pagó otra vez por la pasarela: ahora el pago actual de la publicación es otro.
    const { pago: pagoNuevo } = await publicacion({}, {});
    await Job.update({ status: 'open', publicationPaymentId: pagoNuevo.id } as any, { where: { id: job.id } });

    await pasanLosDiez();

    expect(await saldo()).toBeCloseTo(A_FAVOR, 0);
    expect(Number(((await Job.findByPk(job.id)) as any).publicationCredit) || 0).toBe(0);
  });

  it('si el pago original se devolvió o se cayó antes de la liquidación NO se acredita: queda bloqueado y se avisa a administración', async () => {
    const { job, pago } = await publicacion();
    await cancelar(job);
    await Payment.update({ status: 'refunded' } as any, { where: { id: pago.id } });

    await pasanLosDiez();

    expect(await saldo()).toBe(0);
    const [fila] = await devoluciones();
    expect(fila.status).toBe('pending');
    expect(fila.metadata.bloqueada.motivo).toMatch(/refunded/);
    expect(await Notification.count({ where: { recipientId: admin.id, actionUrl: '/admin/guia-de-errores#SALDO-PENDIENTE-BLOQUEADO' } as any })).toBeGreaterThan(0);
  });

  it('una transferencia confirmada por un administrador no pasa por Mercado Pago: es saldo en el momento', async () => {
    const { job } = await publicacion({ paymentMethod: 'bank_transfer' });

    const r = await cancelar(job);

    expect([r.status, r.body.pendienteHasta ?? null, r.body.saldoAFavorPendiente]).toEqual([200, null, 0]);
    expect(await saldo()).toBeCloseTo(A_FAVOR, 0);
    expect((await devoluciones())[0].status).toBe('completed');
    expect(Number(((await Job.findByPk(job.id)) as any).publicationCredit)).toBeCloseTo(A_FAVOR, 0);
  });

  it('un pago que Mercado Pago ya liberó (más de diez días) también es saldo en el momento', async () => {
    const { job } = await publicacion({ approvedAt: new Date(Date.now() - 12 * DIA) });

    const r = await cancelar(job);

    expect([r.status, r.body.pendienteHasta ?? null]).toEqual([200, null]);
    expect(await saldo()).toBeCloseTo(A_FAVOR, 0);
    expect(r.body.message).not.toMatch(/pendientes de liquidar/);
  });

  /* ---------------- bajar el precio ---------------- */

  it('bajar el presupuesto de una publicación pagada: la diferencia queda a favor PENDIENTE (con el pago de origen anotado) y no es saldo hasta la liberación', async () => {
    const { job, pago } = await publicacion();

    const r = await request(app).patch(`/api/jobs/${job.id}/budget`).set(con(cliente)).send({ newPrice: 30000, reason: 'Encontré una opción más barata' });

    expect([r.status, r.body.success]).toEqual([200, true]);
    expect(r.body.message).toMatch(/PENDIENTES de liquidar/);
    expect(r.body.balanceUpdate).toMatchObject({ refundedAmount: 6000, pendiente: true });
    expect(Number(r.body.balanceUpdate.newBalance)).toBe(0);
    expect(await saldo()).toBe(0);
    const [fila] = await devoluciones();
    expect(fila.status).toBe('pending');
    expect(fila.metadata).toMatchObject({ reason: 'price_decrease', pagoId: String(pago.id), pendienteDeLiquidacion: true });
    expect((await miBalance()).aFavorPendienteDetalle[0]).toMatchObject({ motivo: 'baja_de_precio' });

    await pasanLosDiez();
    expect(await saldo()).toBe(6000);
    // Una baja de precio no es la devolución de una publicación cancelada: no se vincula a ninguna.
    expect(Number(((await Job.findByPk(job.id)) as any).publicationCredit) || 0).toBe(0);
  });

  it('bajar el precio de un contrato pendiente: queda a favor PENDIENTE, con el pago de la publicación como origen (el contrato no tiene pago propio)', async () => {
    const { job, pago } = await publicacion({}, { price: 50000 });
    const contrato: any = await crearContrato({ jobId: job.id, clientId: cliente.id, doerId: doer.id }, { status: 'pending', price: 50000, paymentStatus: 'pending' });
    contratos.push(contrato.id);

    const r = await request(app).put(`/api/contracts/${contrato.id}/modify-price`).set(con(cliente)).send({ newPrice: 40000, reason: 'Se achicó el trabajo' });

    expect([r.status, r.body.success]).toEqual([200, true]);
    expect(r.body.message).toMatch(/PENDIENTES de liquidar/);
    expect(r.body.pendienteHasta).toBeTruthy();
    expect(await saldo()).toBe(0);
    const [fila] = await devoluciones();
    expect(fila.status).toBe('pending');
    expect(fila.metadata).toMatchObject({ pagoOrigenId: String(pago.id), pendienteDeLiquidacion: true });
    expect(Number(fila.amount)).toBe(10000);
    // El asiento pendiente queda atado al contrato: el historial de precios lo encuentra.
    expect(String(fila.relatedContractId)).toBe(String(contrato.id));

    await pasanLosDiez();
    expect(await saldo()).toBe(10000);
  });

  /* ---------------- el trabajador no puede ---------------- */

  it('el trabajador no puede y el cliente pide su saldo: queda a favor PENDIENTE, con el pago del contrato como origen', async () => {
    const { job, pago } = await publicacion({}, { price: 5000, status: 'in_progress', selectedWorkers: [] });
    await Job.update({ selectedWorkers: [doer.id] } as any, { where: { id: job.id } });
    const contrato: any = await crearContrato({ jobId: job.id, clientId: cliente.id, doerId: doer.id }, { status: 'accepted', price: 5000 });
    contratos.push(contrato.id);

    const { trabajadorNoDisponible } = await import('../../server/services/quotePayment.js');
    const r = await trabajadorNoDisponible(String(contrato.id), 'saldo', 'Se enfermó');

    expect([r.ok, r.aFavor]).toEqual([true, 5000]);
    expect(r.pendienteHasta).toBeTruthy();
    expect(await saldo()).toBe(0);
    const [fila] = await devoluciones();
    expect(fila.status).toBe('pending');
    expect(fila.metadata).toMatchObject({ motivo: 'trabajador_no_disponible', pagoOrigenId: String(pago.id), pendienteDeLiquidacion: true });
    // No lleva `pagoId`: ese es el nombre del pago en la devolución de una publicación cancelada (lo agrupan el expediente y la corrección de dobles
    // devoluciones). El pago del que sale esta plata va en `pagoOrigenId`, que solo lee la liquidación.
    expect(fila.metadata.pagoId).toBeUndefined();
    const aviso: any = await Notification.findOne({ where: { recipientId: cliente.id, title: 'El trabajador no puede realizar el trabajo' } as any });
    expect(aviso.message).toMatch(/PENDIENTES de liquidar/);

    await pasanLosDiez();
    expect(await saldo()).toBe(5000);
  });

  /* ---------------- un administrador aprueba cancelar un contrato ---------------- */

  it('cancelación de un contrato aprobada por un administrador: lo del cliente es a favor PENDIENTE y lo del trabajador entra a su saldo con la espera de siempre', async () => {
    const { job, pago } = await publicacion({}, { status: 'in_progress', selectedWorkers: [] });
    await Job.update({ selectedWorkers: [doer.id], maxWorkers: 1 } as any, { where: { id: job.id } });
    const contrato: any = await crearContrato({ jobId: job.id, clientId: cliente.id, doerId: doer.id }, {
      status: 'in_progress', price: 36000, paymentStatus: 'escrow', startDate: new Date(Date.now() + 12 * 3_600_000), endDate: dias(3),
    });
    contratos.push(contrato.id);
    const pedido: any = await ContractCancellationRequest.create({
      contractId: contrato.id, jobId: job.id, requestedBy: cliente.id, otherPartyId: doer.id, reason: 'Ya no necesito el trabajo',
      requestType: 'full_cancellation', previousJobStatus: 'in_progress', previousContractStatus: 'in_progress',
    } as any);
    const antesDelTrabajador = Number(((await User.findByPk(doer.id, { attributes: ['balanceArs'] })) as any).balanceArs) || 0;

    const r = await request(app).post(`/api/admin/contracts/cancellation-requests/${pedido.id}/approve`).set(con(superAdmin)).send({ resolutionNote: 'Aprobado por el equipo' });

    expect([r.status, r.body.success]).toEqual([200, true]);
    // Cancelación tardía con trabajador (empezaba en 12 horas): la mitad del precio para el trabajador y la otra mitad para el cliente.
    const [fila, ...otras] = await devoluciones();
    expect(otras).toHaveLength(0);
    expect(fila.status).toBe('pending');
    expect(Number(fila.amount)).toBe(18000);
    expect(fila.metadata).toMatchObject({ reason: 'contract_cancellation_approved', pagoOrigenId: String(pago.id), pendienteDeLiquidacion: true });
    expect(await saldo()).toBe(0);
    const aviso: any = await Notification.findOne({ where: { recipientId: cliente.id, title: 'Cancelación aprobada' } as any });
    expect(aviso.message).toMatch(/pendientes de liquidar/);

    // El trabajador cobra su compensación como siempre: se suma ya, y lleva su fecha para retirarla.
    const delTrabajador: any = await BalanceTransaction.findOne({ where: { userId: doer.id, type: 'payment', status: 'completed' } as any, order: [['createdAt', 'DESC']] });
    expect(Number(delTrabajador.amount)).toBe(18000);
    expect(new Date(delTrabajador.metadata.disponibleDesde).getTime()).toBeGreaterThan(Date.now());
    const despuesDelTrabajador = Number(((await User.findByPk(doer.id, { attributes: ['balanceArs'] })) as any).balanceArs) || 0;
    expect(despuesDelTrabajador).toBeCloseTo(antesDelTrabajador + Number(delTrabajador.amount), 2);

    await pasanLosDiez();
    expect(await saldo()).toBeCloseTo(Number(fila.amount), 2);
  });

  /* ---------------- anular el pago ---------------- */

  it('anular el pago de una publicación cancela lo que esté a favor PENDIENTE apuntando a él: esa plata nunca va a existir', async () => {
    const { job, pago } = await publicacion();
    await cancelar(job);
    const { anularPagoSinDinero } = await import('../../server/services/anulacionDePagos.js');

    const vista = await anularPagoSinDinero(String(pago.id), 'La transferencia nunca llegó al banco', { aplicar: false }, () => undefined);
    expect([vista.anulado, vista.aFavorPendienteCancelado]).toEqual([false, expect.closeTo(A_FAVOR, 0)]);
    expect((await devoluciones())[0].status).toBe('pending'); // la vista previa no escribe nada

    const r = await anularPagoSinDinero(String(pago.id), 'La transferencia nunca llegó al banco', { aplicar: true }, () => undefined);

    expect([r.anulado, r.aFavorPendienteCancelado]).toEqual([true, expect.closeTo(A_FAVOR, 0)]);
    const [fila] = await devoluciones();
    expect(fila.status).toBe('failed');
    expect(fila.metadata.cancelada.motivo).toMatch(/se anuló el pago/);
    const balance = await miBalance();
    expect([balance.aFavorPendiente, balance.aFavorPendienteDetalle]).toEqual([0, []]);
    await pasanLosDiez();
    expect(await saldo()).toBe(0);
  });
});
