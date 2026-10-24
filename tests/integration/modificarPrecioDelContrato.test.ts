import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Modificar el precio de un contrato (`PUT /api/contracts/:id/modify-price`) y la comisión.
 *
 * Antes la ruta leía la tasa GUARDADA en la cuenta (8, 3 o 1 en las cuentas con un plan viejo) y solo cobraba la diferencia de precio, no la comisión sobre ella.
 * Ahora la comisión sale de la política (`calculateCommission`) y, si el precio sube, se cobra la diferencia MÁS la comisión de la diferencia (con su IVA), para que
 * la comisión anotada en el contrato sea exactamente la que se cobró. Si baja, la comisión ya se retuvo al elegir al trabajador (T&C 7.6) y no se devuelve.
 * Fuera de la beta, que es cuando la comisión existe.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));
jest.mock('../../server/services/platformPhase.js', () => ({
  __esModule: true,
  ...(jest.requireActual('../../server/services/platformPhase.js') as object),
  isBetaPhase: async () => false,
  getPhaseInfo: async () => ({ phase: 'real', isBeta: false }),
}));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import BalanceTransaction from '../../server/models/sql/BalanceTransaction.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';
import { COMMISSION_RATES } from '../../shared/constants/membershipPricing.js';

const IVA = 1.21;
const redondear = (n: number) => Math.round(n * 100) / 100;

describe('modificar el precio de un contrato: la comisión sale de la política', () => {
  let app: Express;
  let doer: any;
  const usuarios: string[] = [];
  const jobs: string[] = [];
  const contratos: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  /** Un cliente con `saldo`, un trabajo y un contrato pendiente de `precio`, con la comisión que ya se cobró al elegir (10%). */
  const armar = async (saldo: number, precio: number, trabajo: Record<string, unknown> = {}, cliente: Record<string, unknown> = {}) => {
    const c: any = await crearUsuario({ role: 'client', dniVerified: true, balanceArs: saldo, ...cliente });
    usuarios.push(c.id);
    const j: any = await crearTrabajo(c.id, { status: 'open', price: precio, ...trabajo });
    jobs.push(j.id);
    const comision = redondear(precio * (COMMISSION_RATES.free / 100));
    const k: any = await crearContrato({ jobId: j.id, clientId: c.id, doerId: doer.id }, { status: 'pending', price: precio, commission: comision, totalPrice: precio + comision, paymentStatus: 'pending' });
    contratos.push(k.id);
    return { c, j, k, comision };
  };
  const modificar = (k: any, c: any, newPrice: number) =>
    request(app).put(`/api/contracts/${k.id}/modify-price`).set(con(c)).send({ newPrice, reason: 'Cambió el alcance del trabajo' });
  const saldoDe = async (c: any) => Number(((await User.findByPk(c.id, { attributes: ['balanceArs'] })) as any).balanceArs) || 0;
  const contrato = async (k: any) => (await Contract.findByPk(k.id)) as any;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/contracts', (await import('../../server/routes/contracts.js')).default);
    doer = await crearUsuario({ role: 'doer', dniVerified: true });
  });

  afterAll(async () => {
    try {
      const ids = [...usuarios, doer.id];
      await Contract.destroy({ where: { id: contratos }, force: true });
      await BalanceTransaction.destroy({ where: { userId: ids }, force: true } as any);
      await Job.destroy({ where: { id: jobs }, force: true });
      await Payment.destroy({ where: { payerId: ids }, force: true } as any);
      await User.destroy({ where: { id: ids }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('si el precio sube se cobra la diferencia MÁS la comisión de la diferencia con su IVA, y la comisión anotada es la del precio nuevo', async () => {
    const { c, k } = await armar(200_000, 100_000);

    const r = await modificar(k, c, 120_000);

    const comisionDeLaDiferencia = redondear(20_000 * (COMMISSION_RATES.free / 100) * IVA); // 2.000 + 21% = 2.420
    expect([r.status, r.body.success]).toEqual([200, true]);
    expect(r.body.comisionCobrada).toBeCloseTo(comisionDeLaDiferencia, 2);
    expect(await saldoDe(c)).toBeCloseTo(200_000 - 20_000 - comisionDeLaDiferencia, 2);
    const leido = await contrato(k);
    expect(Number(leido.price)).toBe(120_000);
    expect(Number(leido.commission)).toBeCloseTo(12_000, 2); // 10% de 120.000: lo cobrado en total es la comisión anotada
    expect(Number(leido.totalPrice)).toBeCloseTo(132_000, 2);
  });

  it('el asiento del libro dice cuánto fue de comisión (no queda plata movida sin explicación)', async () => {
    const { c, k } = await armar(200_000, 100_000);
    await modificar(k, c, 110_000);
    const [asiento] = (await BalanceTransaction.findAll({ where: { userId: c.id, relatedContractId: k.id } as any, order: [['createdAt', 'DESC']] })) as any[];
    expect([Number(asiento.metadata.previousPrice), Number(asiento.metadata.newPrice)]).toEqual([100_000, 110_000]);
    expect(Number(asiento.metadata.comisionDeLaDiferencia)).toBeCloseTo(1_210, 2);
    expect(Math.abs(Number(asiento.amount))).toBeCloseTo(10_000 + 1_210, 2);
  });

  it('si el saldo alcanza para la diferencia pero no para la diferencia más la comisión, pide pagar y no mueve nada', async () => {
    const { c, k } = await armar(21_000, 100_000); // 20.000 de diferencia + 2.420 de comisión = 22.420

    const r = await modificar(k, c, 120_000);

    expect(r.status).toBe(402);
    expect(r.body.requiresPayment).toBe(true);
    expect(r.body.amountRequired).toBeCloseTo(22_420, 2);
    expect(await saldoDe(c)).toBe(21_000);
    expect(Number((await contrato(k)).price)).toBe(100_000);
  });

  it('un trabajo que gastó un contrato libre de comisión sigue libre: se cobra solo la diferencia', async () => {
    const { c, k } = await armar(200_000, 100_000, { commissionFreeApplied: true });
    await Contract.update({ commission: 0, totalPrice: 100_000 } as any, { where: { id: k.id } });

    const r = await modificar(k, c, 120_000);

    expect([r.status, r.body.comisionCobrada]).toEqual([200, 0]);
    expect(await saldoDe(c)).toBeCloseTo(180_000, 2);
    expect(Number((await contrato(k)).commission)).toBe(0);
  });

  it('la tasa guardada en la cuenta (la de un plan viejo) ya no cuenta: manda la política', async () => {
    const { c, k } = await armar(200_000, 100_000, {}, { currentCommissionRate: 3 });

    const r = await modificar(k, c, 120_000);

    expect(r.status).toBe(200);
    expect(Number((await contrato(k)).commission)).toBeCloseTo(12_000, 2); // 10%, no el 3% guardado
  });

  it('si el precio baja, la diferencia vuelve y la comisión que se retuvo no se toca', async () => {
    const { c, k, comision } = await armar(0, 100_000);

    const r = await modificar(k, c, 80_000);

    expect([r.status, r.body.comisionCobrada]).toEqual([200, 0]);
    const leido = await contrato(k);
    expect(Number(leido.price)).toBe(80_000);
    expect(Number(leido.commission)).toBeCloseTo(comision, 2); // sigue siendo la que se retuvo
    expect(Number(leido.totalPrice)).toBeCloseTo(80_000 + comision, 2);
  });

  it('el mismo precio no cobra nada ni cambia la comisión', async () => {
    const { c, k, comision } = await armar(50_000, 100_000);
    const r = await modificar(k, c, 100_000);
    expect(r.status).toBe(200);
    expect(await saldoDe(c)).toBe(50_000);
    expect(Number((await contrato(k)).commission)).toBeCloseTo(comision, 2);
  });
});
