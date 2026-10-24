import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Una publicación cancelada sin trabajador devuelve su plata como saldo A FAVOR VINCULADO a ella. Reprogramarla la deja pendiente de pago (no
 * sale gratis), se paga con ese saldo, y si el cliente retira ese saldo la publicación ya no se puede volver a publicar sin pagar de nuevo.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));
jest.mock('../../server/services/mercadopago.js', () => ({ __esModule: true, default: { getPayment: jest.fn(), refundPayment: jest.fn() } }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import BalanceTransaction from '../../server/models/sql/BalanceTransaction.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

const dias = (n: number) => new Date(Date.now() + n * 86_400_000);

describe('saldo vinculado a una publicación', () => {
  let app: Express;
  let cliente: any;
  const jobs: string[] = [];
  const pagos: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const saldo = async () => Number(((await User.findByPk(cliente.id, { attributes: ['balanceArs'] })) as any).balanceArs) || 0;
  const leer = async (id: string) => (await Job.findByPk(id)) as any;

  async function publicacionPagada(precio = 10000) {
    const p: any = await Payment.create({
      payerId: cliente.id, recipientId: cliente.id, amount: precio * 1.1, amountArs: precio * 1.1, currency: 'ARS', status: 'held_escrow',
      paymentType: 'job_publication', paymentMethod: 'mercadopago', platformFee: precio * 0.1, processingCharge: 0, mercadopagoStatus: 'approved',
      // Mercado Pago ya liberó este pago (más de diez días): lo que vuelve es saldo en el momento. Si el pago siguiera retenido, lo que vuelve sería «a favor
      // pendiente» y no se vincularía a la publicación hasta liberarse (ver tests/integration/devolucionesPendientes.test.ts).
      approvedAt: new Date(Date.now() - 12 * 86_400_000),
    } as any);
    pagos.push(p.id);
    const j: any = await crearTrabajo(cliente.id, { status: 'open', price: precio, publicationPaid: true, publicationPaymentId: p.id, selectedWorkers: [] });
    jobs.push(j.id);
    return { pago: p, job: j };
  }

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    app.use('/api/payments', (await import('../../server/routes/payments.js')).default);
    app.use('/api/balance', (await import('../../server/routes/balance.js')).default);
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
  });

  afterAll(async () => {
    try {
      await Notification.destroy({ where: { recipientId: cliente.id } });
      await BalanceTransaction.destroy({ where: { userId: cliente.id }, force: true } as any);
      await Job.destroy({ where: { id: jobs }, force: true });
      await Payment.destroy({ where: { id: pagos }, force: true } as any);
      await User.destroy({ where: { id: cliente.id }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('cancelar sin trabajador devuelve al saldo y lo deja vinculado; reprogramar NO sale gratis; se paga con ese saldo', async () => {
    const { job } = await publicacionPagada();
    const { liquidarCancelacionDePublicacion } = await import('../../server/services/jobCancellation.js');
    const r: any = await liquidarCancelacionDePublicacion(job, { aprobada: true, horasHastaInicio: 120, actor: { id: 'system', tipo: 'admin' }, motivo: 'sin postulantes' });
    expect(r.errores ?? []).toEqual([]);
    await Job.update({ status: 'cancelled', cancellationReason: 'Cancelado automáticamente: Ningún trabajador se postuló antes de la fecha programada.', cancelledAt: new Date() } as any, { where: { id: job.id } });

    const credito = (await leer(job.id)).publicationCredit;
    expect(Number(credito)).toBeGreaterThan(0);
    expect(await saldo()).toBeCloseTo(Number(credito), 2);

    // el balance muestra la plata dividida
    const b = await request(app).get('/api/balance').set(con(cliente));
    expect(b.body.saldoVinculado).toBeCloseTo(Number(credito), 2);
    expect(b.body.saldoLibre).toBeCloseTo(0, 2);
    expect(b.body.publicacionesVinculadas[0].jobId).toBe(job.id);

    // reprogramar: pendiente de pago, no gratis
    const e = await request(app).put(`/api/jobs/${job.id}`).set(con(cliente)).send({ startDate: dias(5).toISOString(), endDate: dias(6).toISOString() });
    expect(e.status).toBe(200);
    expect(e.body.requiresPayment).toBe(true);
    const reprogramado = await leer(job.id);
    expect(reprogramado.status).toBe('pending_payment');
    expect(reprogramado.publicationPaid).toBe(false);

    // pagar con el saldo
    const antes = await saldo();
    const p = await request(app).post('/api/payments/create-order').set(con(cliente)).send({ jobId: job.id, paymentType: 'job_publication', paymentMethod: 'balance' });
    expect(p.status).toBe(200);
    expect(p.body.paidWithBalance).toBe(true);
    const pagada = await leer(job.id);
    expect(['pending_approval', 'open']).toContain(pagada.status);
    expect(pagada.publicationPaid).toBe(true);
    expect(String(pagada.publicationPaymentId)).toBe(String(p.body.paymentId));
    expect(await saldo()).toBeLessThan(antes);
    const pagoConSaldo: any = await Payment.findByPk(p.body.paymentId);
    pagos.push(pagoConSaldo.id);
    expect(pagoConSaldo.paymentMethod).toBe('balance');
    expect(Number(pagoConSaldo.amount)).toBeCloseTo(antes - (await saldo()), 2);
  });

  it('el saldo liberado paga CUALQUIER publicación, no solo la reprogramación de la que salió (si alcanza el total)', async () => {
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    await acreditarSaldo(String(cliente.id), 900000, 'saldo ganado', { relatedModel: 'Job', relatedId: cliente.id });
    const { job } = await publicacionPagada(500000);
    await Job.update({ status: 'pending_payment', publicationPaid: false } as any, { where: { id: job.id } });
    const antes = await saldo();
    const b = await request(app).get('/api/balance').set(con(cliente));
    expect(b.body.saldoParaPagar).toBeGreaterThanOrEqual(550000);

    const p = await request(app).post('/api/payments/create-order').set(con(cliente)).send({ jobId: job.id, paymentType: 'job_publication', paymentMethod: 'balance' });

    expect([p.status, p.body.paidWithBalance]).toEqual([200, true]);
    expect(['pending_approval', 'open']).toContain((await leer(job.id)).status);
    expect(await saldo()).toBeLessThan(antes);
    pagos.push(p.body.paymentId);
  });

  it('si el saldo liberado no alcanza para el total, no paga nada y dice cuánto tiene (no hay pago parcial por este camino)', async () => {
    const { job } = await publicacionPagada(5_000_000);
    await Job.update({ status: 'pending_payment', publicationPaid: false } as any, { where: { id: job.id } });
    const antes = await saldo();
    const p = await request(app).post('/api/payments/create-order').set(con(cliente)).send({ jobId: job.id, paymentType: 'job_publication', paymentMethod: 'balance' });
    expect([p.status, p.body.code]).toEqual([402, 'SALDO_INSUFICIENTE']);
    expect(p.body.total).toBeGreaterThan(p.body.saldo);
    expect(await saldo()).toBe(antes);
    expect((await leer(job.id)).status).toBe('pending_payment');
  });

  it('el saldo que sigue «en liberación» (la pasarela no liberó ese pago) no se usa para pagar', async () => {
    const otro: any = await crearUsuario({ role: 'client', dniVerified: true });
    try {
      const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
      await acreditarSaldo(String(otro.id), 800000, 'cobro de un trabajo', { relatedModel: 'Job', relatedId: otro.id, tipo: 'payment', metadata: { disponibleDesde: dias(5).toISOString() } });
      const { saldoLiberadoUsable } = await import('../../server/services/creditoDePublicacion.js');
      expect(await saldoLiberadoUsable(String(otro.id))).toBe(0);
      const j: any = await crearTrabajo(otro.id, { status: 'pending_payment', price: 100000 });
      const p = await request(app).post('/api/payments/create-order').set(con(otro)).send({ jobId: j.id, paymentType: 'job_publication', paymentMethod: 'balance' });
      expect([p.status, p.body.code]).toEqual([402, 'SALDO_INSUFICIENTE']);
    } finally {
      await Job.destroy({ where: { clientId: otro.id }, force: true });
      await BalanceTransaction.destroy({ where: { userId: otro.id }, force: true } as any);
      await User.destroy({ where: { id: otro.id }, force: true });
    }
  });

  describe('lo pendiente de una publicación cancelada sirve para volver a publicar ESA publicación y ninguna otra', () => {
    const creados: string[] = [];
    afterAll(async () => {
      try {
        await Job.destroy({ where: { clientId: creados }, force: true });
        await Payment.destroy({ where: { payerId: creados }, force: true } as any);
        await BalanceTransaction.destroy({ where: { userId: creados }, force: true } as any);
        await User.destroy({ where: { id: creados }, force: true });
      } catch { /* la limpieza no puede hacer fallar el test */ }
    });

    /** Un cliente con "liberado" de saldo, una publicación reprogramada (pendiente de pago) y "pendiente" a favor que viene de su cancelación. */
    async function escenario(liberado: number, pendiente: number, pagoOriginal: Record<string, unknown> = {}) {
      const c: any = await crearUsuario({ role: 'client', dniVerified: true, balanceArs: liberado });
      creados.push(c.id);
      const original: any = await Payment.create({
        payerId: c.id, recipientId: c.id, amount: 10000, amountArs: 10000, currency: 'ARS', status: 'held_escrow', paymentType: 'job_publication',
        paymentMethod: 'mercadopago', platformFee: 0, processingCharge: 0, mercadopagoStatus: 'approved', approvedAt: new Date(), ...pagoOriginal,
      } as any);
      const j: any = await crearTrabajo(c.id, { status: 'pending_payment', price: 10000, publicationPaid: false, publicationPaymentId: original.id, selectedWorkers: [] });
      const hasta = dias(8);
      const fila: any = await BalanceTransaction.create({
        userId: c.id, type: 'refund', amount: pendiente, balanceBefore: liberado, balanceAfter: liberado + pendiente, status: 'pending',
        description: 'Devolución por cancelar la publicación',
        metadata: { origen: 'cancelacion', reason: 'job_cancelled_by_client', jobId: String(j.id), pagoId: String(original.id), pendienteDeLiquidacion: true, disponibleDesde: hasta.toISOString(), vincularAlLiquidar: true },
      } as any);
      return { c, j, original, fila, hasta };
    }
    const pagar = (c: any, j: any) => request(app).post('/api/payments/create-order').set(con(c)).send({ jobId: j.id, paymentType: 'job_publication', paymentMethod: 'balance' });

    it('completa el pago con lo pendiente de esa publicación; el saldo que sobra queda en liberación y el pago hereda la fecha', async () => {
      const { c, j, fila, hasta } = await escenario(3000, 8000); // 3.000 liberados + 8.000 pendientes de esta publicación = 11.000 para pagar 10.000

      const b = await request(app).get('/api/balance').set(con(c));
      expect([b.body.saldoParaPagar, b.body.pendientePorPublicacion[String(j.id)]]).toEqual([3000, 8000]);

      const r = await pagar(c, j);

      expect([r.status, r.body.paidWithBalance]).toEqual([200, true]);
      const fin: any = await BalanceTransaction.findByPk(fila.id);
      expect(fin.status).toBe('completed'); // pasó a saldo para pagar esto y nada más
      const u: any = await User.findByPk(c.id);
      expect(Number(u.balanceArs)).toBe(1000);
      // Lo que sobró sigue "en liberación": no se puede retirar ni usar en otra cosa hasta la fecha de la pasarela.
      const { saldoRetirable } = await import('../../server/services/liberacionDeSaldo.js');
      expect((await saldoRetirable(String(c.id), 1000)).disponible).toBe(0);
      const { saldoLiberadoUsable } = await import('../../server/services/creditoDePublicacion.js');
      expect(await saldoLiberadoUsable(String(c.id))).toBe(0);
      // El pago nuevo hereda esa fecha: si se vuelve a cancelar antes, lo que vuelva tampoco es saldo retirable.
      const nuevo: any = await Payment.findByPk(r.body.paymentId);
      pagos.push(nuevo.id);
      expect(nuevo.paymentMethod).toBe('balance');
      expect(new Date(nuevo.moneyReleaseDate).getTime()).toBe(hasta.getTime());
      const { liberaMpEl } = await import('../../server/services/liberacionDeSaldo.js');
      expect(liberaMpEl(nuevo)?.getTime()).toBe(hasta.getTime());
      expect(['pending_approval', 'open']).toContain((await leer(j.id)).status);
    });

    it('si el saldo liberado alcanza solo, no toca lo pendiente', async () => {
      const { c, j, fila } = await escenario(20000, 8000);
      const r = await pagar(c, j);
      expect(r.status).toBe(200);
      pagos.push(r.body.paymentId);
      expect(((await BalanceTransaction.findByPk(fila.id)) as any).status).toBe('pending');
      expect(Number(((await User.findByPk(c.id)) as any).balanceArs)).toBe(10000);
    });

    it('lo pendiente de una publicación NO sirve para publicar otra distinta: hay que pagarla', async () => {
      const { c, fila } = await escenario(3000, 8000);
      const otra: any = await crearTrabajo(c.id, { status: 'pending_payment', price: 10000, publicationPaid: false, selectedWorkers: [] });

      const r = await pagar(c, otra);

      expect([r.status, r.body.code]).toEqual([402, 'SALDO_INSUFICIENTE']);
      expect(r.body.pendienteDeEstaPublicacion).toBe(0);
      expect(((await BalanceTransaction.findByPk(fila.id)) as any).status).toBe('pending');
      expect(Number(((await User.findByPk(c.id)) as any).balanceArs)).toBe(3000);
    });

    it('si no alcanza ni con lo pendiente, no se mueve nada', async () => {
      const { c, j, fila } = await escenario(1000, 2000);
      const r = await pagar(c, j);
      expect([r.status, r.body.code]).toEqual([402, 'SALDO_INSUFICIENTE']);
      expect(((await BalanceTransaction.findByPk(fila.id)) as any).status).toBe('pending');
    });

    it('si el pago original se devolvió o se cayó, ya no hay plata detrás: no se usa y se frena el pago', async () => {
      const { c, j, fila } = await escenario(3000, 8000, { status: 'refunded' });
      const r = await pagar(c, j);
      expect([r.status, r.body.code]).toEqual([409, 'PENDIENTE_NO_DISPONIBLE']);
      expect(((await BalanceTransaction.findByPk(fila.id)) as any).status).toBe('pending');
      expect(Number(((await User.findByPk(c.id)) as any).balanceArs)).toBe(3000);
      expect(['pending_payment', 'draft']).toContain((await leer(j.id)).status);
    });
  });

  it('retirar saldo vinculado baja el crédito de la publicación y avisa; lo libre se gasta primero', async () => {
    const { consumirCreditosAlRetirar, desgloseDelSaldo } = await import('../../server/services/creditoDePublicacion.js');
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    const { job } = await publicacionPagada();
    await Job.update({ status: 'cancelled', publicationCredit: 3000 } as any, { where: { id: job.id } });
    await acreditarSaldo(String(cliente.id), 3000 + 1000, 'prueba', { relatedModel: 'Job', relatedId: job.id });
    const s = await saldo();

    const d = await desgloseDelSaldo(String(cliente.id), s);
    const mio = d.publicaciones.find((p) => p.jobId === job.id)!;
    expect(mio.monto).toBe(3000);
    expect(d.libre).toBeGreaterThanOrEqual(1000);

    // retira solo lo libre: el crédito queda
    expect(await consumirCreditosAlRetirar(String(cliente.id), d.libre, s)).toEqual([]);
    expect(Number((await leer(job.id)).publicationCredit)).toBe(3000);

    // retira todo: el crédito se consume y se avisa
    const afectadas = await consumirCreditosAlRetirar(String(cliente.id), s, s);
    expect(afectadas.map((a) => a.jobId)).toContain(job.id);
    expect(Number((await leer(job.id)).publicationCredit)).toBe(0);
    expect(await Notification.count({ where: { recipientId: cliente.id, title: 'Retiraste el saldo de una publicación' } })).toBeGreaterThan(0);
  });

  it('una devolución VIEJA (sin pago anotado) también hace que reprogramar no salga gratis, y la migración le vincula el crédito', async () => {
    const { publicacionDevuelta } = await import('../../server/services/creditoDePublicacion.js');
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    const { job } = await publicacionPagada(7000);
    await Job.update({ status: 'cancelled' } as any, { where: { id: job.id } });
    expect(await publicacionDevuelta({ id: job.id, publicationPaymentId: job.publicationPaymentId })).toBe(false);

    // devolución de antes de que existiera el vínculo: sin pagoId ni crédito en la publicación
    await acreditarSaldo(String(cliente.id), 7000, 'Saldo a favor por cancelación de "try"', {
      relatedModel: 'Job', relatedId: job.id, tipo: 'refund', metadata: { origen: 'cancelacion', jobId: String(job.id) },
    });
    expect(await publicacionDevuelta({ id: job.id, publicationPaymentId: job.publicationPaymentId })).toBe(true);
    expect(Number((await leer(job.id)).publicationCredit)).toBe(0);

    const { default: migracion } = await import('../../migrations/20261022100000-credito-heredado-de-devoluciones.cjs');
    const { sequelize } = await import('../../server/config/database.js');
    await (migracion as any).up({ sequelize });
    // el crédito es lo devuelto, sin pasar de lo que el usuario tiene hoy
    const hoy = await saldo();
    expect(Number((await leer(job.id)).publicationCredit)).toBeCloseTo(Math.min(7000, hoy), 2);
    expect(Number((await leer(job.id)).publicationCredit)).toBeGreaterThan(0);
  });
});
