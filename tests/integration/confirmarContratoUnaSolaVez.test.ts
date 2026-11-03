import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Terminar un contrato: una sola vez, y el trabajo termina con él.
 *
 * Lo que mostró la prueba a mano: «el dueño del trabajo sigue viendo "en curso" a pesar de haber aceptado ambas partes que se terminó».
 *  - La confirmación AUTOMÁTICA (a las 24 h) cerraba el contrato pero nunca el trabajo: quedaba «en curso» para siempre.
 *  - Para terminar el trabajo se miraban todos los contratos que alguna vez tuvo, también los cancelados: uno cancelado lo dejaba «en curso» aunque quien
 *    trabajó ya hubiera terminado y cobrado.
 * Y del pedido de «que se haga una sola vez»: confirmar no era a prueba de doble toque. Los dos pedidos de la segunda parte llegaban hasta el cierre y
 * cada uno liberaba el pago y, en un trabajo con varios lugares, le acreditaba el cobro al trabajador (cobraba dos veces).
 */
const mockCron: { corrida: null | (() => Promise<void>) } = { corrida: null };
jest.mock('node-cron', () => ({
  __esModule: true,
  default: { schedule: (_expr: string, fn: () => Promise<void>) => { mockCron.corrida = fn; } },
}));
jest.mock('../../server/index.js', () => ({ __esModule: true, socketService: new Proxy({}, { get: () => () => undefined }) }));
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

describe('terminar un contrato: una sola vez, y el trabajo termina con él', () => {
  let app: Express;
  let cliente: any, trabajador: any, otroTrabajador: any;
  const jobs: string[] = [];
  const contratos: string[] = [];
  const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);
  const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const confirmar = (id: string, quien: any) => request(app).post(`/api/contracts/${id}/confirm`).set(como(quien)).send({});
  const trabajoDe = async (id: string) => (await Job.findByPk(id)) as any;
  const contratoDe = async (id: string) => (await Contract.findByPk(id)) as any;

  const trabajo = async (over: Record<string, unknown> = {}) => {
    const t = await crearTrabajo(cliente.id, { status: 'in_progress', price: 5000, ...over });
    jobs.push(t.id);
    return t;
  };
  const contrato = async (jobId: string, doer: any, over: Record<string, unknown> = {}) => {
    const c = await crearContrato(
      { jobId, clientId: cliente.id, doerId: doer.id },
      { status: 'in_progress', paymentStatus: 'escrow', price: 2500, startDate: hace(5), endDate: hace(1), ...over },
    );
    contratos.push(c.id);
    return c;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/contracts', (await import('../../server/routes/contracts.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    otroTrabajador = await crearUsuario({ role: 'doer' });
  });

  afterAll(async () => {
    const ids = [cliente.id, trabajador.id, otroTrabajador.id];
    try {
      await BalanceTransaction.destroy({ where: { userId: ids } });
      await Notification.destroy({ where: { recipientId: ids } });
      await Contract.destroy({ where: { id: contratos }, force: true } as any);
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: ids }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  describe('confirmando las dos partes', () => {
    it('un trabajo de un lugar: al confirmar las dos partes, el contrato y el trabajo quedan terminados', async () => {
      const t = await trabajo();
      const c = await contrato(t.id, trabajador, { price: 5000 });
      expect((await confirmar(c.id, cliente)).status).toBe(200);
      expect((await trabajoDe(t.id)).status).toBe('in_progress'); // falta la otra parte
      expect((await confirmar(c.id, trabajador)).status).toBe(200);
      expect((await contratoDe(c.id)).status).toBe('completed');
      expect((await trabajoDe(t.id)).status).toBe('completed');
    });

    it('DOS pedidos seguidos de la segunda parte: se termina una sola vez (200 y 409) y el trabajador cobra una sola vez', async () => {
      // Un trabajo de varios lugares es donde el cobro se acredita al saldo en el momento: ahí el doble toque pagaba dos veces.
      const t = await trabajo({ maxWorkers: 2 });
      const c = await contrato(t.id, trabajador);
      expect((await confirmar(c.id, cliente)).status).toBe(200);

      const [a, b] = await Promise.all([confirmar(c.id, trabajador), confirmar(c.id, trabajador)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect([a.body.code, b.body.code]).toContain('CONTRACT_ALREADY_CONFIRMED');
      expect(await BalanceTransaction.count({ where: { userId: trabajador.id, type: 'payment', status: 'completed', metadata: { contractId: c.id } } as any })).toBe(1);
      expect((await contratoDe(c.id)).status).toBe('completed');
    });

    it('la primera parte también: dos toques seguidos a «terminó el trabajo» proponen una sola vez', async () => {
      const t = await trabajo();
      const c = await contrato(t.id, trabajador, { price: 5000 });
      const [a, b] = await Promise.all([confirmar(c.id, cliente), confirmar(c.id, cliente)]);
      expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1);
      expect((await contratoDe(c.id)).status).toBe('awaiting_confirmation');
    });

    it('las dos partes a la vez: nunca quedan las dos confirmaciones SIN cierre (o se completa, o gana una y la otra recibe el aviso)', async () => {
      // Si los pedidos se atienden uno tras otro es «propone y acepta» (se completa); si llegan juntos, gana uno y el otro recibe 409. Lo que no puede
      // pasar es lo de antes: las dos confirmaciones puestas y el contrato esperando para siempre (el cierre automático solo mira contratos con alguna sin confirmar).
      const t = await trabajo();
      const c = await contrato(t.id, trabajador, { price: 5000 });
      const [a, b] = await Promise.all([confirmar(c.id, cliente), confirmar(c.id, trabajador)]);
      expect([a.status, b.status].filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
      const despues = await contratoDe(c.id);
      expect(despues.clientConfirmed && despues.doerConfirmed && despues.status === 'awaiting_confirmation').toBe(false);
    });
  });

  describe('cuándo termina el trabajo', () => {
    it('un contrato CANCELADO del mismo trabajo no impide que termine (antes lo dejaba «en curso» para siempre)', async () => {
      const t = await trabajo({ maxWorkers: 2 });
      await contrato(t.id, otroTrabajador, { status: 'cancelled', paymentStatus: 'refunded' });
      const c = await contrato(t.id, trabajador);
      await confirmar(c.id, cliente);
      await confirmar(c.id, trabajador);
      expect((await trabajoDe(t.id)).status).toBe('completed');
    });

    it('un contrato vigente que todavía no terminó SÍ lo mantiene «en curso»', async () => {
      const t = await trabajo({ maxWorkers: 2 });
      await contrato(t.id, otroTrabajador, { status: 'in_progress' });
      const c = await contrato(t.id, trabajador);
      await confirmar(c.id, cliente);
      await confirmar(c.id, trabajador);
      expect((await contratoDe(c.id)).status).toBe('completed');
      expect((await trabajoDe(t.id)).status).toBe('in_progress');
    });
  });

  describe('confirmación automática (a las 24 h)', () => {
    const correrElCron = async () => {
      const { startAutoConfirmContractsJob } = await import('../../server/jobs/autoConfirmContracts.js');
      startAutoConfirmContractsJob();
      expect(mockCron.corrida).toBeTruthy();
      await mockCron.corrida!();
    };

    it('cierra el contrato Y el trabajo (antes el trabajo quedaba «en curso» para siempre)', async () => {
      const t = await trabajo();
      const c = await contrato(t.id, trabajador, { status: 'awaiting_confirmation', awaitingConfirmationAt: hace(2), clientConfirmed: true, doerConfirmed: false, price: 5000 });
      await correrElCron();
      expect((await contratoDe(c.id)).status).toBe('completed');
      expect((await trabajoDe(t.id)).status).toBe('completed');
    });

    it('correrla dos veces no repite el cierre: un solo asiento de pago pendiente', async () => {
      const t = await trabajo();
      const c = await contrato(t.id, trabajador, { status: 'awaiting_confirmation', awaitingConfirmationAt: hace(2), clientConfirmed: true, doerConfirmed: false, price: 5000 });
      await correrElCron();
      await correrElCron();
      expect(await BalanceTransaction.count({ where: { userId: trabajador.id, type: 'payment', relatedContractId: c.id } as any })).toBe(1);
    });
  });
});
