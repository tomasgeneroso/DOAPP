import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Escribirle a soporte sobre un contrato o un usuario: SIEMPRE se puede, sin importar el estado.
 *
 * Lo que había: el formulario mandaba `relatedContractId` y el servidor leía `relatedContract` (el enlace se perdía); el modal de reporte de perfiles
 * mandaba `description` y la categoría `abuse` (el servidor respondía 400: ningún reporte de usuario llegó nunca); y las cuentas del equipo (admin,
 * super_admin, marketing, dpo) no tenían permiso para crear tickets.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Ticket } from '../../server/models/sql/Ticket.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';
import { armarReporte } from '../../shared/tickets/reportes.js';

const ESTADOS_DE_CONTRATO = ['pending', 'ready', 'accepted', 'in_progress', 'awaiting_confirmation', 'completed', 'cancelled', 'rejected', 'disputed', 'in_review'];

describe('reportar un problema o una sugerencia a soporte', () => {
  let app: Express;
  let cliente: any, trabajador: any, tercero: any, equipo: any, suspendido: any, reportado: any;
  const jobs: string[] = [];
  const contratos: Record<string, any> = {};
  const usuarios: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const reportar = (quien: any, cuerpo: Record<string, unknown>) => request(app).post('/api/tickets').set(con(quien)).send(cuerpo);
  const cuerpo = (extra: Record<string, unknown> = {}) => ({ subject: 'Algo pasó', category: 'report_contract', message: 'Contanos qué pasó', ...extra });
  const guardado = async (id: string) => (await Ticket.findByPk(id)) as any;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/tickets', (await import('../../server/routes/tickets.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    tercero = await crearUsuario({ role: 'client' });
    equipo = await crearUsuario({ role: 'client', adminRole: 'admin' });
    suspendido = await crearUsuario({ role: 'doer', isBanned: true, banReason: 'prueba', banExpiresAt: new Date(Date.now() + 30 * 86_400_000) });
    reportado = await crearUsuario({ role: 'doer', isBanned: true, banReason: 'prueba', banExpiresAt: new Date(Date.now() + 30 * 86_400_000) });
    usuarios.push(cliente.id, trabajador.id, tercero.id, equipo.id, suspendido.id, reportado.id);
    for (const estado of ESTADOS_DE_CONTRATO) {
      const trabajo: any = await crearTrabajo(cliente.id, { status: 'open' });
      jobs.push(trabajo.id);
      contratos[estado] = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: estado });
    }
  });

  afterAll(async () => {
    try {
      await Ticket.destroy({ where: { createdBy: usuarios }, force: true } as any);
      await Notification.destroy({ where: { recipientId: usuarios } });
      await Contract.destroy({ where: { jobId: jobs }, force: true });
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: usuarios }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it.each(ESTADOS_DE_CONTRATO)('un contrato «%s» se reporta igual: el ticket queda enlazado a ese contrato', async (estado) => {
    const c = contratos[estado];

    const r = await reportar(cliente, cuerpo({ relatedContract: c.id }));

    expect([r.status, r.body.message]).toEqual([201, undefined]);
    expect(String((await guardado(r.body.ticket.id)).relatedContract)).toBe(String(c.id));
  });

  it('el trabajador también, y una sugerencia sobre el contrato se enlaza igual (categoría «feature»)', async () => {
    const c = contratos.completed;

    const r = await reportar(trabajador, cuerpo({ category: 'feature', subject: 'Sugerencia sobre el contrato', relatedContract: c.id, tags: ['sugerencia'] }));

    expect(r.status).toBe(201);
    const t = await guardado(r.body.ticket.id);
    expect([String(t.relatedContract), t.category, t.tags]).toEqual([String(c.id), 'feature', ['sugerencia']]);
  });

  it('un usuario se reporta en cualquier estado, también suspendido: el ticket queda enlazado a esa persona', async () => {
    for (const quien of [tercero, reportado]) {
      const r = await reportar(cliente, cuerpo({ category: 'report_user', relatedUser: quien.id }));
      expect([quien.id, r.status]).toEqual([quien.id, 201]);
      expect(String((await guardado(r.body.ticket.id)).relatedUser)).toBe(String(quien.id));
    }
  });

  it('el contrato y el usuario a la vez (reportar a la otra parte desde el contrato)', async () => {
    const r = await reportar(cliente, cuerpo({ category: 'report_user', relatedUser: trabajador.id, relatedContract: contratos.cancelled.id }));

    expect(r.status).toBe(201);
    const t = await guardado(r.body.ticket.id);
    expect([String(t.relatedUser), String(t.relatedContract)]).toEqual([String(trabajador.id), String(contratos.cancelled.id)]);
  });

  it('también se aceptan los nombres que mandaba el formulario viejo (relatedContractId, relatedUserId)', async () => {
    const r = await reportar(cliente, cuerpo({ relatedContractId: contratos.rejected.id, relatedUserId: trabajador.id }));

    expect(r.status).toBe(201);
    const t = await guardado(r.body.ticket.id);
    expect([String(t.relatedContract), String(t.relatedUser)]).toEqual([String(contratos.rejected.id), String(trabajador.id)]);
  });

  it('una cuenta suspendida también puede escribirle a soporte (y reportar un contrato propio)', async () => {
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'open' });
    jobs.push(trabajo.id);
    const propio = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: suspendido.id }, { status: 'cancelled' });

    const r = await reportar(suspendido, cuerpo({ relatedContract: propio.id }));

    expect(r.status).toBe(201);
    expect(String((await guardado(r.body.ticket.id)).relatedContract)).toBe(String(propio.id));
  });

  it('las cuentas del equipo (admin, super_admin, marketing, dpo) también pueden crear tickets', async () => {
    for (const adminRole of ['admin', 'super_admin', 'marketing', 'dpo', 'support']) {
      const u = await crearUsuario({ role: 'client', adminRole });
      usuarios.push(u.id);
      const r = await reportar(u, cuerpo({ category: 'support' }));
      expect([adminRole, r.status]).toEqual([adminRole, 201]);
    }
  });

  it('un contrato ajeno no se enlaza (404, y no se crea ningún ticket); el equipo sí puede enlazar cualquiera', async () => {
    const antes = await Ticket.count({ where: { createdBy: tercero.id } as any });

    const ajeno = await reportar(tercero, cuerpo({ relatedContract: contratos.in_progress.id }));
    const delEquipo = await reportar(equipo, cuerpo({ relatedContract: contratos.in_progress.id }));

    expect([ajeno.status, ajeno.body.success]).toEqual([404, false]);
    expect(await Ticket.count({ where: { createdBy: tercero.id } as any })).toBe(antes);
    expect(delEquipo.status).toBe(201);
  });

  it('ids que no son válidos o que no existen: se explica qué pasó, sin crear el ticket', async () => {
    const inexistente = '00000000-0000-4000-8000-000000000000';

    expect((await reportar(cliente, cuerpo({ relatedContract: 'no-es-un-id' }))).status).toBe(400);
    expect((await reportar(cliente, cuerpo({ relatedContract: inexistente }))).status).toBe(404);
    expect((await reportar(cliente, cuerpo({ category: 'report_user', relatedUser: 'no-es-un-id' }))).status).toBe(400);
    const r = await reportar(cliente, cuerpo({ category: 'report_user', relatedUser: inexistente }));
    expect([r.status, r.body.message]).toEqual([404, 'No encontramos a ese usuario']);
  });

  it('el reporte armado con el helper compartido (el que usan la web y la app) lo acepta el servidor tal cual', async () => {
    const problema = armarReporte({ sobre: 'usuario', usuarioId: reportado.id, contratoId: contratos.disputed.id, nombre: 'Persona de prueba', detalle: 'Me insultó en el chat' });
    const sugerencia = armarReporte({ sobre: 'contrato', tipo: 'sugerencia', contratoId: contratos.completed.id, nombre: 'Trabajo de prueba', detalle: 'Estaría bueno poder adjuntar fotos' });

    const a = await reportar(cliente, problema as unknown as Record<string, unknown>);
    const b = await reportar(cliente, sugerencia as unknown as Record<string, unknown>);

    expect([a.status, b.status]).toEqual([201, 201]);
    const ta = await guardado(a.body.ticket.id);
    const tb = await guardado(b.body.ticket.id);
    expect([ta.category, String(ta.relatedUser), String(ta.relatedContract)]).toEqual(['report_user', String(reportado.id), String(contratos.disputed.id)]);
    expect([tb.category, tb.tags, String(tb.relatedContract)]).toEqual(['feature', ['sugerencia'], String(contratos.completed.id)]);
    expect(ta.messages[0].message).toContain('Me insultó en el chat');
  });
});
