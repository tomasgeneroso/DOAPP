import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * «Hubo problemas durante el trabajo» con ticket (pedido del dueño, 2026-11-21): quien contrató abre un ticket; mientras esté abierto la confirmación automática se detiene y
 * el pago no se libera. El ticket se lleva a un reclamo o se resuelve con el mismo trabajo, y entonces quien contrató puede aceptar el fin del trabajo de nuevo (con un plazo
 * nuevo de 24 horas). Base de pruebas real.
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
import { Ticket } from '../../server/models/sql/Ticket.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

describe('hubo problemas durante el trabajo: ticket, pausa y vuelta a confirmar', () => {
  let app: Express;
  let cliente: any, trabajador: any, ajeno: any, soporte: any;
  const jobs: string[] = [];
  const contratos: string[] = [];
  const hace = (horas: number) => new Date(Date.now() - horas * 3_600_000);
  const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const contratoDe = async (id: string) => (await Contract.findByPk(id)) as any;
  const relato = 'El trabajador se fue sin terminar el piso de la cocina.';

  const nuevo = async (over: Record<string, unknown> = {}) => {
    const t = await crearTrabajo(cliente.id, { status: 'in_progress', price: 5000 });
    jobs.push(t.id);
    const c = await crearContrato(
      { jobId: t.id, clientId: cliente.id, doerId: trabajador.id },
      { status: 'awaiting_confirmation', paymentStatus: 'escrow', price: 5000, startDate: hace(100), endDate: hace(50), awaitingConfirmationAt: hace(30), doerConfirmed: true, doerConfirmedAt: hace(30), ...over },
    );
    contratos.push(c.id);
    return c;
  };
  const avisar = (id: string, quien: any, cuerpo: Record<string, unknown> = { categoria: 'incomplete_work', detalle: relato }) =>
    request(app).post(`/api/contracts/${id}/hubo-problemas`).set(como(quien)).send(cuerpo);
  const correrElBarrido = async () => {
    const { startAutoConfirmContractsJob } = await import('../../server/jobs/autoConfirmContracts.js');
    startAutoConfirmContractsJob();
    await mockCron.corrida!();
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/contracts', (await import('../../server/routes/contracts.js')).default);
    app.use('/api/tickets', (await import('../../server/routes/tickets.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    ajeno = await crearUsuario({ role: 'doer' });
    soporte = await crearUsuario({ role: 'admin', adminRole: 'support' });
  });

  afterAll(async () => {
    const ids = [cliente.id, trabajador.id, ajeno.id, soporte.id];
    try {
      await Ticket.destroy({ where: { createdBy: ids }, force: true } as any);
      await BalanceTransaction.destroy({ where: { userId: ids } });
      await Notification.destroy({ where: { recipientId: ids } });
      await Contract.destroy({ where: { id: contratos }, force: true } as any);
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: ids }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('quien contrató abre el ticket: queda ligado al contrato, con la categoría y el relato, y el trabajador recibe aviso', async () => {
    const c = await nuevo();
    const r = await avisar(c.id, cliente);
    expect(r.status).toBe(201);
    const t: any = await Ticket.findByPk(r.body.ticket.id);
    expect(t.relatedContract).toBe(c.id);
    expect(t.category).toBe('report_contract');
    expect(t.priority).toBe('high');
    expect(t.tags).toEqual(expect.arrayContaining(['hubo-problemas', 'incomplete_work']));
    expect(t.messages[0].message).toContain(relato);
    expect(await Notification.count({ where: { recipientId: trabajador.id, relatedId: c.id } as any })).toBeGreaterThan(0);
    // El contrato no cambia de estado: sigue esperando confirmación (no es un reclamo).
    expect((await contratoDe(c.id)).status).toBe('awaiting_confirmation');
  });

  it('el contrato dice que hay un problema abierto, con el ticket, a las dos partes', async () => {
    const c = await nuevo();
    const r = await avisar(c.id, cliente);
    const delCliente = await request(app).get(`/api/contracts/${c.id}`).set(como(cliente));
    expect(delCliente.body.contract.problemaAbierto).toMatchObject({ ticketId: r.body.ticket.id, categoria: 'incomplete_work', esMio: true });
    // El trabajador sabe que hay un aviso abierto y de qué tipo, pero no recibe el ticket ni lo que se escribió.
    const delTrabajador = await request(app).get(`/api/contracts/${c.id}`).set(como(trabajador));
    expect(delTrabajador.body.contract.problemaAbierto).toMatchObject({ ticketId: null, ticketNumber: null, categoria: 'incomplete_work', esMio: false });
    expect(JSON.stringify(delTrabajador.body.contract.problemaAbierto)).not.toContain('piso de la cocina');
  });

  it('solo quien contrató avisa; el relato es obligatorio; la categoría tiene que ser una de las cuatro', async () => {
    const c = await nuevo();
    expect((await avisar(c.id, trabajador)).status).toBe(403);
    // Quien no es parte ni ve el contrato (la seguridad por fila lo oculta): no se le confirma ni que existe.
    expect((await avisar(c.id, ajeno)).status).toBe(404);
    expect((await avisar(c.id, cliente, { categoria: 'incomplete_work', detalle: 'mal' })).body.code).toBe('RELATO_MUY_CORTO');
    expect((await avisar(c.id, cliente, { categoria: 'inventada', detalle: relato })).body.code).toBe('CATEGORIA_INVALIDA');
    expect(await Ticket.count({ where: { relatedContract: c.id } as any })).toBe(0);
  });

  it('un solo aviso abierto por contrato, y no se avisa de un contrato que no está en marcha', async () => {
    const c = await nuevo();
    const primero = await avisar(c.id, cliente);
    const segundo = await avisar(c.id, cliente);
    expect(segundo.status).toBe(409);
    expect(segundo.body.code).toBe('PROBLEMA_YA_ABIERTO');
    expect(segundo.body.ticketId).toBe(primero.body.ticket.id);
    const terminado = await nuevo({ status: 'completed' });
    expect((await avisar(terminado.id, cliente)).body.code).toBe('CONTRATO_FUERA_DE_MARCHA');
  });

  it('CON el aviso abierto el contrato NO se confirma solo aunque hayan pasado más de 24 horas; sin aviso, sí', async () => {
    const conAviso = await nuevo();
    const sinAviso = await nuevo();
    expect((await avisar(conAviso.id, cliente)).status).toBe(201);
    await correrElBarrido();
    expect((await contratoDe(conAviso.id)).status).toBe('awaiting_confirmation');
    expect((await contratoDe(sinAviso.id)).status).toBe('completed');
  });

  it('si ya había confirmado el fin del trabajo, esa confirmación se retira (el trabajador no lo completa solo al confirmar)', async () => {
    const c = await nuevo({ doerConfirmed: false, doerConfirmedAt: null, clientConfirmed: true, clientConfirmedAt: hace(2) });
    expect((await avisar(c.id, cliente)).status).toBe(201);
    expect((await contratoDe(c.id)).clientConfirmed).toBe(false);
    const confirmaElTrabajador = await request(app).post(`/api/contracts/${c.id}/confirm`).set(como(trabajador)).send({});
    expect(confirmaElTrabajador.status).toBe(200);
    expect((await contratoDe(c.id)).status).not.toBe('completed');
  });

  describe('resolverlo con el mismo trabajo', () => {
    it('quien abrió el ticket lo resuelve: el contrato sigue, el plazo de 24 h empieza de cero, y el barrido no lo confirma solo', async () => {
      const c = await nuevo();
      const r = await avisar(c.id, cliente);
      const antes = (await contratoDe(c.id)).awaitingConfirmationAt as Date;
      const s = await request(app).post(`/api/tickets/${r.body.ticket.id}/seguir-con-el-trabajo`).set(como(cliente)).send({ nota: 'Volvió y lo terminó.' });
      expect(s.status).toBe(200);
      expect(s.body.plazoNuevo).toBe(true);
      const t: any = await Ticket.findByPk(r.body.ticket.id);
      expect(t.status).toBe('resolved');
      expect(t.resolution).toContain('mismo trabajo');
      const despues = await contratoDe(c.id);
      expect(despues.status).toBe('awaiting_confirmation');
      expect(new Date(despues.awaitingConfirmationAt).getTime()).toBeGreaterThan(new Date(antes).getTime() + 20 * 3_600_000);
      // El aviso de que ya puede aceptar el fin del trabajo.
      expect(await Notification.count({ where: { recipientId: cliente.id, relatedId: c.id, title: 'Seguimos con el mismo trabajo' } as any })).toBe(1);
      // El barrido no lo confirma solo: el plazo es nuevo.
      await correrElBarrido();
      expect((await contratoDe(c.id)).status).toBe('awaiting_confirmation');
      // Y quien contrató puede aceptar el fin del trabajo otra vez: con las dos confirmaciones el contrato se completa.
      const confirma = await request(app).post(`/api/contracts/${c.id}/confirm`).set(como(cliente)).send({});
      expect(confirma.status).toBe(200);
      expect((await contratoDe(c.id)).status).toBe('completed');
    });

    it('el equipo también puede resolverlo; una persona ajena no, y un ticket cerrado no se vuelve a resolver', async () => {
      const c = await nuevo();
      const r = await avisar(c.id, cliente);
      // Una persona ajena no ve el ticket: tampoco se le confirma que existe.
      expect((await request(app).post(`/api/tickets/${r.body.ticket.id}/seguir-con-el-trabajo`).set(como(ajeno)).send({})).status).toBeGreaterThanOrEqual(403);
      expect((await Ticket.findByPk(r.body.ticket.id) as any).status).toBe('open');
      expect((await request(app).post(`/api/tickets/${r.body.ticket.id}/seguir-con-el-trabajo`).set(como(soporte)).send({})).status).toBe(200);
      const otraVez = await request(app).post(`/api/tickets/${r.body.ticket.id}/seguir-con-el-trabajo`).set(como(cliente)).send({});
      expect(otraVez.status).toBe(409);
      expect(otraVez.body.code).toBe('TICKET_YA_CERRADO');
    });

    it('si el equipo cierra el ticket por la vía de siempre, el plazo también empieza de nuevo (no se confirma solo al instante)', async () => {
      const c = await nuevo();
      const r = await avisar(c.id, cliente);
      const close = await request(app).put(`/api/tickets/${r.body.ticket.id}/close`).set(como(soporte)).send({ resolution: 'Hablamos con las dos partes.' });
      expect(close.status).toBe(200);
      expect(new Date((await contratoDe(c.id)).awaitingConfirmationAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
      await correrElBarrido();
      expect((await contratoDe(c.id)).status).toBe('awaiting_confirmation');
    });
  });

  describe('llevarlo a un reclamo', () => {
    it('al abrirse el reclamo, el ticket queda resuelto («llevado a reclamo») y manda el reclamo', async () => {
      const { alAbrirseUnReclamo } = await import('../../server/services/problemasDelTrabajo.js');
      const c = await nuevo();
      const r = await avisar(c.id, cliente);
      await alAbrirseUnReclamo(c.id, '11111111-2222-3333-4444-555555555555');
      const t: any = await Ticket.findByPk(r.body.ticket.id);
      expect(t.status).toBe('resolved');
      expect(t.resolution).toContain('reclamo');
    });
  });

  it('si quien contrató confirma el fin del trabajo, el aviso queda resuelto', async () => {
    const c = await nuevo();
    const r = await avisar(c.id, cliente);
    expect((await request(app).post(`/api/contracts/${c.id}/confirm`).set(como(cliente)).send({})).status).toBe(200);
    expect(((await Ticket.findByPk(r.body.ticket.id)) as any).status).toBe('resolved');
  });

  it('la lista de trabajadores del trabajo dice, por contrato, si hay un aviso abierto y cuál es su reclamo', async () => {
    const c = await nuevo();
    const antes = await request(app).get(`/api/contracts/all-by-job/${c.jobId}`).set(como(cliente));
    expect(antes.body.contracts[0]).toMatchObject({ id: c.id, problemaAbierto: false, disputeId: null });
    await avisar(c.id, cliente);
    const despues = await request(app).get(`/api/contracts/all-by-job/${c.jobId}`).set(como(cliente));
    expect(despues.body.contracts[0].problemaAbierto).toBe(true);
  });

  it('si no se pueden leer los avisos de problemas, el contrato y la lista del equipo se ven igual (antes un error acá dejaba la vista del trabajo sin contratos)', async () => {
    const c = await nuevo();
    const f1 = jest.spyOn(Ticket, 'findAll').mockRejectedValue(new Error('falla simulada'));
    const f2 = jest.spyOn(Ticket, 'findOne').mockRejectedValue(new Error('falla simulada'));
    const silencio = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const equipo = await request(app).get(`/api/contracts/all-by-job/${c.jobId}`).set(como(cliente));
      expect(equipo.status).toBe(200);
      expect(equipo.body.contracts).toHaveLength(1);
      expect(equipo.body.contracts[0].problemaAbierto).toBe(false);
      for (const quien of [cliente, trabajador]) {
        const g = await request(app).get(`/api/contracts/${c.id}`).set(como(quien));
        expect(g.status).toBe(200);
        expect(g.body.contract.problemaAbierto ?? null).toBeNull();
      }
      const porTrabajo = await request(app).get(`/api/contracts/by-job/${c.jobId}`).set(como(cliente));
      expect(porTrabajo.status).toBe(200);
    } finally {
      f1.mockRestore(); f2.mockRestore(); silencio.mockRestore();
    }
  });

  it('la pantalla del ticket sabe si es un problema del trabajo y si se puede seguir con el mismo trabajo', async () => {
    const c = await nuevo();
    const r = await avisar(c.id, cliente);
    const g = await request(app).get(`/api/tickets/${r.body.ticket.id}`).set(como(cliente));
    expect(g.body.ticket.problemaDelTrabajo).toMatchObject({ contractId: c.id, categoria: 'incomplete_work', abierto: true, puedeSeguirConElTrabajo: true });
    const comun = await request(app).post('/api/tickets').set(como(cliente)).send({ subject: 'Una duda', message: 'Hola, quería preguntar algo.', category: 'support' });
    const gc = await request(app).get(`/api/tickets/${comun.body.ticket.id}`).set(como(cliente));
    expect(gc.body.ticket.problemaDelTrabajo).toBeNull();
  });
});
