import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Cuándo se puede cambiar el presupuesto de un trabajo, probado por la API (reporte del dueño, 2026-11-27: «me deja cambiar el presupuesto faltando 3 minutos y con un postulante ya aceptado»).
 * El circuito se recorre por ESTADO: sin pagar, cancelado, con alguien elegido, cerca del inicio. En ningún caso se acredita plata que no entró.
 */
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: () => undefined } }));
jest.mock('../../server/services/fcm.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => undefined }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { conSistema } from '../../server/db/contextoRls.js';
import { bajasSinPago } from '../../server/services/bajasSinPago.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

const enDias = (n: number) => new Date(Date.now() + n * 86_400_000);
const enMinutos = (n: number) => new Date(Date.now() + n * 60_000);

describe('cambiar el presupuesto, según el estado del trabajo', () => {
  let app: Express;
  let trabajador: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    trabajador = await crearUsuario({ role: 'doer' });
  });

  /** Un cliente nuevo por caso: así el saldo y los asientos de uno no se mezclan con los de otro. */
  const armar = async (datos: Record<string, unknown>) => {
    const cliente: any = await crearUsuario({ role: 'client' });
    const trabajo: any = await crearTrabajo(cliente.id, { price: 100000, status: 'open', publicationPaid: true, startDate: enDias(5), endDate: enDias(6), ...datos });
    return { cliente, trabajo };
  };
  const cambiar = (cliente: any, trabajo: any, newPrice: number) =>
    request(app).patch(`/api/jobs/${trabajo.id}/budget`).set(con(cliente)).send({ newPrice, reason: 'Cambio de alcance del trabajo' });
  const editar = (cliente: any, trabajo: any, datos: Record<string, unknown>) =>
    request(app).put(`/api/jobs/${trabajo.id}`).set(con(cliente)).send({ endDate: new Date(trabajo.endDate).toISOString(), priceChangeReason: 'Cambio de alcance del trabajo', ...datos });
  const plata = async (cliente: any) => ({
    saldo: Number(((await conSistema(() => User.findByPk(cliente.id))) as any).balanceArs || 0),
    asientos: await conSistema(() => BalanceTransaction.count({ where: { userId: cliente.id } as any })),
  });
  const precio = async (trabajo: any) => Number(((await conSistema(() => Job.findByPk(trabajo.id))) as any).price);

  it('un borrador SIN PAGAR no acredita nada al bajar el precio', async () => {
    const { cliente, trabajo } = await armar({ status: 'draft', publicationPaid: false });
    const r = await cambiar(cliente, trabajo, 1000);
    expect(r.status).toBe(200);
    expect(await plata(cliente)).toEqual({ saldo: 0, asientos: 0 });
    expect(await precio(trabajo)).toBe(1000);
  });

  it('esperando el pago de la publicación: tampoco acredita', async () => {
    const { cliente, trabajo } = await armar({ status: 'pending_payment', publicationPaid: false });
    await cambiar(cliente, trabajo, 1000);
    expect(await plata(cliente)).toEqual({ saldo: 0, asientos: 0 });
  });

  it('un trabajo cancelado no cambia de presupuesto (su plata ya se liquidó)', async () => {
    const { cliente, trabajo } = await armar({ status: 'cancelled' });
    const r = await cambiar(cliente, trabajo, 1000);
    expect([r.status, r.body.code]).toEqual([409, 'TRABAJO_CANCELADO']);
    expect(await plata(cliente)).toEqual({ saldo: 0, asientos: 0 });
    expect(await precio(trabajo)).toBe(100000);
  });

  it.each([
    ['bajarlo', 60000],
    ['subirlo', 150000],
  ])('con alguien ya aceptado no se puede %s, por ninguna de las dos puertas', async (_nombre, nuevo) => {
    const { cliente, trabajo } = await armar({ selectedWorkers: [trabajador.id] });
    await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'accepted', price: 100000 });
    const r = await cambiar(cliente, trabajo, nuevo);
    expect([r.status, r.body.code]).toEqual([409, 'YA_HAY_ALGUIEN_ELEGIDO']);
    const e = await editar(cliente, trabajo, { price: nuevo });
    expect([e.status, e.body.code]).toEqual([409, 'YA_HAY_ALGUIEN_ELEGIDO']);
    expect(await precio(trabajo)).toBe(100000);
    expect(await plata(cliente)).toEqual({ saldo: 0, asientos: 0 });
  });

  it('el contrato alcanza para frenarlo aunque la lista de elegidos del trabajo esté vacía', async () => {
    const { cliente, trabajo } = await armar({});
    await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'pending', price: 100000 });
    expect((await cambiar(cliente, trabajo, 60000)).body.code).toBe('YA_HAY_ALGUIEN_ELEGIDO');
  });

  it('un contrato cancelado no cuenta: sin nadie elegido y con tiempo, se puede', async () => {
    const { cliente, trabajo } = await armar({});
    await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'cancelled', price: 100000 });
    expect((await cambiar(cliente, trabajo, 60000)).status).toBe(200);
    expect(await precio(trabajo)).toBe(60000);
  });

  it.each([
    ['faltan 3 minutos', enMinutos(3)],
    ['faltan 23 horas', enMinutos(23 * 60)],
    ['ya empezó', enMinutos(-30)],
  ])('si %s para el inicio no se puede subir ni bajar', async (_nombre, startDate) => {
    const { cliente, trabajo } = await armar({ startDate, endDate: enDias(2) });
    for (const nuevo of [60000, 150000]) {
      const r = await cambiar(cliente, trabajo, nuevo);
      expect([r.status, r.body.code]).toEqual([409, 'FALTA_POCO_PARA_EL_INICIO']);
      const e = await editar(cliente, trabajo, { price: nuevo });
      expect([e.status, e.body.code]).toEqual([409, 'FALTA_POCO_PARA_EL_INICIO']);
    }
    expect(await precio(trabajo)).toBe(100000);
    expect(await plata(cliente)).toEqual({ saldo: 0, asientos: 0 });
  });

  it('con alguien aceptado tampoco se cambian las fechas desde el trabajo (eso se acuerda en el contrato)', async () => {
    const { cliente, trabajo } = await armar({ selectedWorkers: [trabajador.id] });
    await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'accepted' });
    const r = await editar(cliente, trabajo, { startDate: enDias(8).toISOString(), endDate: enDias(9).toISOString() });
    expect([r.status, r.body.code]).toEqual([409, 'FECHAS_ACORDADAS_EN_EL_CONTRATO']);
  });

  it('sin nadie elegido y con 5 días por delante, bajar el precio sigue funcionando y devuelve la diferencia', async () => {
    const { cliente, trabajo } = await armar({});
    expect((await cambiar(cliente, trabajo, 80000)).status).toBe(200);
    expect(await precio(trabajo)).toBe(80000);
    expect((await plata(cliente)).asientos).toBe(1);
  });

  it('subir el precio de un borrador sin pagar lo guarda y listo: no hace pagar «la diferencia»', async () => {
    const { cliente, trabajo } = await armar({ status: 'draft', publicationPaid: false });
    const r = await editar(cliente, trabajo, { price: 250000 });
    expect(r.status).toBe(200);
    const j: any = await conSistema(() => Job.findByPk(trabajo.id));
    expect([Number(j.price), j.status, Number(j.pendingPaymentAmount || 0), j.publicationPaid]).toEqual([250000, 'draft', 0, false]);
  });

  it('con un comprobante de la publicación en revisión, el precio espera', async () => {
    const { cliente, trabajo } = await armar({ status: 'pending_payment', publicationPaid: false });
    const pago: any = await conSistema(() => Payment.create({ payerId: cliente.id, amount: 110000, currency: 'ARS', status: 'pending_verification', paymentType: 'job_publication', paymentMethod: 'bank_transfer', jobId: trabajo.id } as any));
    await conSistema(() => Job.update({ publicationPaymentId: pago.id } as any, { where: { id: trabajo.id } as any }));
    const r = await cambiar(cliente, trabajo, 150000);
    expect([r.status, r.body.code]).toEqual([409, 'PAGO_EN_REVISION']);
  });

  it('si el precio sube después de crear el pago y ese pago se paga, se publica por lo que se pagó', async () => {
    const { cliente, trabajo } = await armar({ status: 'pending_payment', publicationPaid: false });
    const pago: any = await conSistema(() => Payment.create({ payerId: cliente.id, amount: 110000, currency: 'ARS', status: 'pending', paymentType: 'job_publication', paymentMethod: 'mercadopago', jobId: trabajo.id, metadata: { precioDelTrabajo: 100000 } } as any));
    await conSistema(() => Job.update({ publicationPaymentId: pago.id } as any, { where: { id: trabajo.id } as any }));
    expect((await cambiar(cliente, trabajo, 900000)).status).toBe(200);
    // Lo que hace cualquier vía que confirma el pago (retorno, aviso de Mercado Pago, aprobación del equipo): marcar la publicación como pagada.
    const j: any = await conSistema(() => Job.findByPk(trabajo.id));
    j.publicationPaid = true;
    j.status = 'open';
    await conSistema(() => j.save());
    expect(await precio(trabajo)).toBe(100000);
  });

  it('la revisión encuentra un saldo acreditado sin pago detrás, y no marca una baja legítima', async () => {
    const falso: any = await armar({ status: 'draft', publicationPaid: false });
    await conSistema(() => BalanceTransaction.create({ userId: falso.cliente.id, type: 'refund', amount: 99000, balanceBefore: 0, balanceAfter: 99000, status: 'completed', description: 'Saldo a favor por bajar el precio', metadata: { reason: 'price_decrease', relatedModel: 'Job', relatedId: falso.trabajo.id } } as any));
    const real: any = await armar({});
    const pago: any = await conSistema(() => Payment.create({ payerId: real.cliente.id, amount: 110000, currency: 'ARS', status: 'completed', paymentType: 'job_publication', paymentMethod: 'mercadopago', jobId: real.trabajo.id } as any));
    await conSistema(() => Job.update({ publicationPaymentId: pago.id } as any, { where: { id: real.trabajo.id } as any }));
    expect((await cambiar(real.cliente, real.trabajo, 80000)).status).toBe(200);
    const personas = (await bajasSinPago()).map((c) => String(c.persona));
    expect(personas).toContain(String(falso.cliente.id));
    expect(personas).not.toContain(String(real.cliente.id));
  });
});
