import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * La máquina de estados de los contratos.
 *
 * Lo que había: casi ninguna ruta miraba en qué estado estaba el contrato antes de moverlo.
 *  - POST /contracts creaba un contrato sobre un trabajo en borrador, pausado, cancelado o ya contratado,
 *    dejaba contratarse a uno mismo, concatenaba el precio si llegaba como texto y descontaba el contrato
 *    gratis ANTES de crear (si fallaba, se perdía; dos pedidos juntos gastaban el mismo).
 *  - POST /:id/confirm "completaba" un contrato pendiente, cancelado o en disputa.
 *  - generate-pairing lo podía usar cualquiera (pisaba el código de un contrato ajeno).
 *  - confirm-pairing y force-start-pairing arrancaban un contrato pendiente o cancelado.
 *  - PUT /:id/complete completaba cualquier contrato sin mirar nada, sin idempotencia.
 *
 * Base de pruebas real; los avisos por mail y socket son simulacros.
 */

jest.mock('../../server/index.js', () => ({
  __esModule: true,
  socketService: new Proxy({}, { get: () => () => undefined }),
}));
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

describe('contratos: cada ruta mira el estado antes de mover nada', () => {
  let app: Express;
  let cliente: any, trabajador: any, ajeno: any;
  const jobs: string[] = [];
  const contratos: string[] = [];
  const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);
  const token = (u: any) => jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret');
  const como = (u: any) => ({ Authorization: `Bearer ${token(u)}` });

  const trabajoEn = async (status: string, over: Record<string, unknown> = {}) => {
    const t = await crearTrabajo(cliente.id, { status, price: 5000, ...over });
    jobs.push(t.id);
    return t;
  };
  const contratoEn = async (status: string, over: Record<string, unknown> = {}) => {
    const t = await trabajoEn('in_progress');
    const c = await crearContrato(
      { jobId: t.id, clientId: cliente.id, doerId: trabajador.id },
      { status, paymentStatus: 'pending', price: 5000, ...over },
    );
    contratos.push(c.id);
    return c;
  };
  const estado = async (id: string) => ((await Contract.findByPk(id)) as any).status as string;
  const crearContratoVia = (body: Record<string, unknown>, quien = cliente) =>
    request(app).post('/api/contracts').set(como(quien)).send(body);
  const cuerpo = (jobId: string, extra: Record<string, unknown> = {}) => ({
    job: jobId,
    doer: trabajador.id,
    price: 5000,
    startDate: new Date(Date.now() + 86_400_000).toISOString(),
    endDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    termsAccepted: true,
    ...extra,
  });
  const gratisDe = async () => Number(((await User.findByPk(cliente.id)) as any).freeContractsRemaining);
  const contratosDelTrabajo = (jobId: string) => Contract.count({ where: { jobId } });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    const rutas = await import('../../server/routes/contracts.js');
    app.use('/api/contracts', rutas.default);
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    ajeno = await crearUsuario({ role: 'doer' });
  });

  afterAll(async () => {
    try {
      await Notification.destroy({ where: { recipientId: [cliente.id, trabajador.id, ajeno.id] } });
      await Contract.destroy({ where: { id: contratos }, force: true });
      await Contract.destroy({ where: { jobId: jobs }, force: true });
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: [cliente.id, trabajador.id, ajeno.id] }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /* ---------------- POST /contracts ---------------- */

  describe('POST /api/contracts', () => {
    beforeEach(async () => {
      await User.update({ freeContractsRemaining: 3 } as any, { where: { id: cliente.id } });
    });

    it('sobre un trabajo abierto crea el contrato y lo pasa a "en progreso"', async () => {
      const t = await trabajoEn('open');
      const r = await crearContratoVia(cuerpo(t.id));
      expect(r.status).toBe(201);
      expect(((await Job.findByPk(t.id)) as any).status).toBe('in_progress');
      expect(await contratosDelTrabajo(t.id)).toBe(1);
    });

    it.each(['draft', 'pending_payment', 'pending_approval', 'paused', 'cancelled', 'completed', 'in_progress'])(
      'sobre un trabajo "%s" responde 409: no crea contrato, no cambia el trabajo y no gasta el contrato gratis',
      async (estadoDelTrabajo) => {
        const t = await trabajoEn(estadoDelTrabajo);
        const r = await crearContratoVia(cuerpo(t.id, { useFreeContract: true }));
        expect([estadoDelTrabajo, r.status]).toEqual([estadoDelTrabajo, 409]);
        expect(await contratosDelTrabajo(t.id)).toBe(0);
        expect(((await Job.findByPk(t.id)) as any).status).toBe(estadoDelTrabajo);
        expect(await gratisDe()).toBe(3);
      },
    );

    it('un trabajo de varios trabajadores ya en marcha sí admite otro contrato', async () => {
      const t = await trabajoEn('in_progress', { maxWorkers: 3 });
      const r = await crearContratoVia(cuerpo(t.id));
      expect(r.status).toBe(201);
    });

    it('nadie se contrata a sí mismo', async () => {
      const t = await trabajoEn('open');
      const r = await crearContratoVia(cuerpo(t.id, { doer: cliente.id }));
      expect(r.status).toBe(400);
      expect(await contratosDelTrabajo(t.id)).toBe(0);
      expect(((await Job.findByPk(t.id)) as any).status).toBe('open');
    });

    it('un precio como texto numérico se trata como número (no se concatena con la comisión)', async () => {
      const t = await trabajoEn('open');
      const r = await crearContratoVia(cuerpo(t.id, { price: '5000' }));
      expect(r.status).toBe(201);
      const c: any = await Contract.findOne({ where: { jobId: t.id } });
      expect(Number(c.price)).toBe(5000);
      expect(Number(c.totalPrice)).toBe(5000 + Number(c.commission));
      expect(Number(c.totalPrice)).toBeLessThan(100000);
    });

    it.each([['abc'], [0], [-5], [null]])('un precio inválido (%p) es un 400', async (precio) => {
      const t = await trabajoEn('open');
      const r = await crearContratoVia(cuerpo(t.id, { price: precio }));
      expect(r.status).toBe(400);
      expect(await contratosDelTrabajo(t.id)).toBe(0);
    });

    it('la fecha de fin no puede ser anterior a la de inicio', async () => {
      const t = await trabajoEn('open');
      const r = await crearContratoVia(cuerpo(t.id, {
        startDate: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        endDate: new Date(Date.now() + 86_400_000).toISOString(),
      }));
      expect(r.status).toBe(400);
    });

    it('otro cliente no puede crear el contrato de un trabajo ajeno', async () => {
      const t = await trabajoEn('open');
      const r = await crearContratoVia(cuerpo(t.id), ajeno);
      expect(r.status).toBe(403);
    });

    it('con useFreeContract descuenta UN contrato gratis', async () => {
      const t = await trabajoEn('open');
      expect((await crearContratoVia(cuerpo(t.id, { useFreeContract: true }))).status).toBe(201);
      expect(await gratisDe()).toBe(2);
    });

    it('si la creación del contrato falla, el contrato gratis se devuelve (antes se perdía)', async () => {
      const t = await trabajoEn('open');
      jest.spyOn(Contract, 'create').mockRejectedValueOnce(new Error('falla simulada'));
      const r = await crearContratoVia(cuerpo(t.id, { useFreeContract: true }));
      expect(r.status).toBe(500);
      expect(await gratisDe()).toBe(3);
      expect(((await Job.findByPk(t.id)) as any).status).toBe('open');
    });

    it('con un solo contrato gratis y dos pedidos simultáneos, se gasta uno y nunca queda en negativo', async () => {
      await User.update({ freeContractsRemaining: 1 } as any, { where: { id: cliente.id } });
      const t1 = await trabajoEn('open');
      const t2 = await trabajoEn('open');
      const [a, b] = await Promise.all([
        crearContratoVia(cuerpo(t1.id, { useFreeContract: true })),
        crearContratoVia(cuerpo(t2.id, { useFreeContract: true })),
      ]);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(await gratisDe()).toBe(0);
    });
  });

  /* ---------------- PUT /:id/complete ---------------- */

  describe('PUT /api/contracts/:id/complete', () => {
    it('ya no existe (410): no completa nada, ni suma trabajos terminados', async () => {
      const c = await contratoEn('pending');
      const antes = Number(((await User.findByPk(trabajador.id)) as any).completedJobs || 0);
      const r = await request(app).put(`/api/contracts/${c.id}/complete`).set(como(cliente)).send({});
      expect(r.status).toBe(410);
      expect(await estado(c.id)).toBe('pending');
      expect(Number(((await User.findByPk(trabajador.id)) as any).completedJobs || 0)).toBe(antes);
    });
  });

  /* ---------------- POST /:id/confirm ---------------- */

  describe('POST /api/contracts/:id/confirm', () => {
    const confirmar = (id: string, quien = cliente) => request(app).post(`/api/contracts/${id}/confirm`).set(como(quien)).send({});

    it.each(['pending', 'ready', 'accepted', 'cancelled', 'disputed', 'completed', 'rejected'])(
      'un contrato "%s" no se puede confirmar (409): no cambia nada',
      async (st) => {
        const c = await contratoEn(st);
        const r = await confirmar(c.id);
        expect([st, r.status]).toEqual([st, 409]);
        expect(r.body.code).toBe('CONTRACT_NOT_CONFIRMABLE');
        const despues: any = await Contract.findByPk(c.id);
        expect(despues.status).toBe(st);
        expect(despues.clientConfirmed).toBeFalsy();
        expect(despues.paymentStatus).toBe('pending');
      },
    );

    it('uno en progreso: la primera parte propone las horas y pasa a "esperando confirmación"', async () => {
      const c = await contratoEn('in_progress', { startDate: hace(5), endDate: hace(1) });
      const r = await confirmar(c.id);
      expect(r.status).toBe(200);
      expect(await estado(c.id)).toBe('awaiting_confirmation');
      // la misma parte no puede confirmar dos veces
      expect((await confirmar(c.id)).status).toBe(400);
    });

    it('quien no es parte del contrato recibe 403', async () => {
      const c = await contratoEn('in_progress');
      expect((await confirmar(c.id, ajeno)).status).toBe(403);
      expect(await estado(c.id)).toBe('in_progress');
    });
  });

  /* ---------------- pareamiento ---------------- */

  describe('pareamiento', () => {
    const generar = (id: string, quien: any) => request(app).post(`/api/contracts/${id}/generate-pairing`).set(como(quien)).send({});
    const confirmarCodigo = (id: string, quien: any, code: string) =>
      request(app).post(`/api/contracts/${id}/confirm-pairing`).set(como(quien)).send({ code });
    const iniciar = (id: string, quien: any) => request(app).post(`/api/contracts/${id}/force-start-pairing`).set(como(quien)).send({});
    // pairing_code es único entre TODOS los contratos: cada uno lleva el suyo.
    let n = 0;
    const codigo = () => 'Z' + String(++n).padStart(5, '0');
    const proximo = { startDate: new Date(Date.now() + 2 * 3_600_000), endDate: new Date(Date.now() + 8 * 3_600_000) };

    it('generate-pairing: un usuario ajeno recibe 403 y NO pisa el código del contrato', async () => {
      const real = codigo();
      const c = await contratoEn('accepted', { ...proximo, pairingCode: real, pairingExpiry: new Date(Date.now() + 3_600_000) });
      const r = await generar(c.id, ajeno);
      expect(r.status).toBe(403);
      expect(((await Contract.findByPk(c.id)) as any).pairingCode).toBe(real);
    });

    it('generate-pairing: sólo en un contrato aceptado', async () => {
      for (const st of ['pending', 'ready', 'in_progress', 'cancelled', 'completed']) {
        const c = await contratoEn(st, proximo);
        const r = await generar(c.id, cliente);
        expect([st, r.status]).toEqual([st, 409]);
        expect(((await Contract.findByPk(c.id)) as any).pairingCode).toBeFalsy();
      }
    });

    it('generate-pairing: una parte, en un contrato aceptado, obtiene su código', async () => {
      const c = await contratoEn('accepted', proximo);
      const r = await generar(c.id, cliente);
      expect(r.status).toBe(200);
      expect(r.body.pairingCode).toBe(((await User.findByPk(cliente.id)) as any).personalPairingCode);
    });

    it('confirm-pairing: en un contrato que no está "aceptado" nunca pasa a "en progreso"', async () => {
      for (const st of ['pending', 'ready', 'cancelled', 'disputed', 'completed']) {
        const cod = codigo();
        const c = await contratoEn(st, { pairingCode: cod, pairingExpiry: new Date(Date.now() + 3_600_000) });
        const a = await confirmarCodigo(c.id, cliente, cod);
        const b = await confirmarCodigo(c.id, trabajador, cod);
        expect([st, a.status, b.status]).toEqual([st, 409, 409]);
        expect(await estado(c.id)).toBe(st);
      }
    });

    it('confirm-pairing: en un contrato aceptado, con el código y las dos partes, arranca', async () => {
      const cod = codigo();
      const c = await contratoEn('accepted', { pairingCode: cod, pairingExpiry: new Date(Date.now() + 3_600_000) });
      expect((await confirmarCodigo(c.id, cliente, cod)).status).toBe(200);
      expect(await estado(c.id)).toBe('accepted');
      expect((await confirmarCodigo(c.id, trabajador, cod.toLowerCase())).status).toBe(200);
      expect(await estado(c.id)).toBe('in_progress');
    });

    it('confirm-pairing: un código equivocado no arranca nada', async () => {
      const c = await contratoEn('accepted', { pairingCode: codigo(), pairingExpiry: new Date(Date.now() + 3_600_000) });
      expect((await confirmarCodigo(c.id, cliente, 'QQQQQQ')).status).toBe(400);
      expect(await estado(c.id)).toBe('accepted');
    });

    it('force-start-pairing: desde "pendiente" o "listo" NO arranca (se saltearía aceptación y revisión)', async () => {
      for (const st of ['pending', 'ready', 'cancelled', 'disputed']) {
        const c = await contratoEn(st);
        const a = await iniciar(c.id, cliente);
        const b = await iniciar(c.id, trabajador);
        expect([st, a.status, b.status]).toEqual([st, 400, 400]);
        expect(await estado(c.id)).toBe(st);
      }
    });

    it('force-start-pairing: desde "aceptado", con las dos partes, arranca en modo flexible', async () => {
      const c = await contratoEn('accepted');
      expect((await iniciar(c.id, cliente)).status).toBe(200);
      expect(await estado(c.id)).toBe('accepted');
      const r = await iniciar(c.id, trabajador);
      expect(r.status).toBe(200);
      expect(r.body.graceMode).toBe(true);
      expect(await estado(c.id)).toBe('in_progress');
    });
  });

  /* ---------------- extensiones ---------------- */

  describe('POST /api/contracts/:id/reject-extension', () => {
    it('una extensión rechazada queda rechazada de verdad: no se puede aprobar después', async () => {
      const c = await contratoEn('in_progress');
      await Contract.update(
        { extensionRequestedBy: cliente.id, extensionRequestedAt: new Date(), extensionDays: 3, extensionAmount: 6000 } as any,
        { where: { id: c.id } },
      );

      const rechazo = await request(app).post(`/api/contracts/${c.id}/reject-extension`).set(como(trabajador)).send({ reason: 'No puedo' });
      expect(rechazo.status).toBe(200);

      // antes: extensionRequestedBy quedaba puesto (Sequelize ignora los undefined al guardar)
      const fila: any = await Contract.findByPk(c.id);
      expect(fila.extensionRequestedBy ?? null).toBeNull();
      expect(fila.extensionDays ?? null).toBeNull();

      const aprobacion = await request(app).post(`/api/contracts/${c.id}/approve-extension`).set(como(trabajador)).send({});
      expect(aprobacion.status).toBe(400);
      expect(aprobacion.body.message).toContain('No hay solicitud de extensión pendiente');
    });
  });

  /* ---------------- aceptar ---------------- */

  describe('POST /api/contracts/:id/accept', () => {
    it('al aceptar las dos partes pasa a "aceptado" SIN declarar dinero retenido que no existe', async () => {
      const c = await contratoEn('ready', { termsAcceptedByClient: false, termsAcceptedByDoer: false });
      const a = await request(app).put(`/api/contracts/${c.id}/accept`).set(como(cliente)).send({});
      expect(a.status).toBe(200);
      const b = await request(app).put(`/api/contracts/${c.id}/accept`).set(como(trabajador)).send({});
      expect(b.status).toBe(200);
      const despues: any = await Contract.findByPk(c.id);
      expect(despues.status).toBe('accepted');
      expect(despues.paymentStatus).toBe('pending'); // antes quedaba en "held" aunque no hubiera pago
    });
  });
});
