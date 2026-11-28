import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Notificaciones por los mensajes de reclamos y tickets (pedido del dueño, 2026-11-21): quien no escribió el mensaje recibe una notificación con el enlace a SU pantalla; quien lo escribió, nunca.
 * Base de pruebas real.
 */
jest.mock('../../server/index.js', () => ({ __esModule: true, socketService: new Proxy({}, { get: () => () => undefined }) }));
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Dispute } from '../../server/models/sql/Dispute.model.js';
import { Ticket } from '../../server/models/sql/Ticket.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { crearUsuario, crearTrabajo, crearContrato, crearDisputa } from '../helpers/fixtures.js';

describe('avisos por mensajes en reclamos y tickets', () => {
  let app: Express;
  let cliente: any, trabajador: any, equipo: any, otroEquipo: any;
  let jobId: string, contractId: string;
  const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  // Sin contar el «Recibimos tu consulta» que acompaña al correo de alta del ticket: acá se miden los avisos por MENSAJES.
  const avisos = async (u: any, relatedId: string) => (await Notification.findAll({ where: { recipientId: u.id, relatedId } as any })).filter((n: any) => !String(n.title).startsWith('Recibimos tu consulta'));

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/disputes', (await import('../../server/routes/disputes.js')).default);
    app.use('/api/admin/disputes', (await import('../../server/routes/admin/disputes.js')).default);
    app.use('/api/tickets', (await import('../../server/routes/tickets.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    equipo = await crearUsuario({ role: 'admin', adminRole: 'owner' });
    otroEquipo = await crearUsuario({ role: 'admin', adminRole: 'support' });
    const t: any = await crearTrabajo(cliente.id, { status: 'in_progress' });
    jobId = t.id;
    const c: any = await crearContrato({ jobId, clientId: cliente.id, doerId: trabajador.id }, { status: 'disputed' });
    contractId = c.id;
  });

  afterAll(async () => {
    const ids = [cliente.id, trabajador.id, equipo.id, otroEquipo.id];
    try {
      await Ticket.destroy({ where: { createdBy: ids }, force: true } as any);
      await Dispute.destroy({ where: { contractId }, force: true } as any);
      await Notification.destroy({ where: { recipientId: ids } });
      await Contract.destroy({ where: { id: contractId }, force: true } as any);
      await Job.destroy({ where: { id: jobId }, force: true });
      await User.destroy({ where: { id: ids }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('reclamo: si escribe una parte, la otra recibe el aviso con el enlace a su reclamo y quien escribió no', async () => {
    const d: any = await crearDisputa({ contractId, initiatedBy: cliente.id, against: trabajador.id });
    const r = await request(app).post(`/api/disputes/${d.id}/messages`).set(como(cliente)).send({ message: 'Adjunto lo que pasó.' });
    expect(r.status).toBe(200);
    const aviso: any[] = await avisos(trabajador, d.id);
    expect(aviso).toHaveLength(1);
    expect(aviso[0].actionUrl).toBe(`/disputes/${d.id}`);
    expect(await avisos(cliente, d.id)).toHaveLength(0);
    await Dispute.destroy({ where: { id: d.id }, force: true } as any);
  });

  it('reclamo: si escribe el equipo (desde el panel), las dos partes reciben el aviso', async () => {
    const d: any = await crearDisputa({ contractId, initiatedBy: cliente.id, against: trabajador.id });
    const r = await request(app).post(`/api/admin/disputes/${d.id}/messages`).set(como(equipo)).send({ message: 'Necesitamos fotos del trabajo.' });
    expect(r.status).toBe(200);
    expect(await avisos(cliente, d.id)).toHaveLength(1);
    expect(await avisos(trabajador, d.id)).toHaveLength(1);
    await Dispute.destroy({ where: { id: d.id }, force: true } as any);
  });

  it('reclamo: si hay un integrante del equipo asignado y escribe una parte, a esa persona le llega el aviso al panel', async () => {
    const d: any = await crearDisputa({ contractId, initiatedBy: cliente.id, against: trabajador.id }, { assignedTo: otroEquipo.id });
    await request(app).post(`/api/disputes/${d.id}/messages`).set(como(trabajador)).send({ message: 'Mi versión de lo que pasó.' });
    const aviso: any[] = await avisos(otroEquipo, d.id);
    expect(aviso).toHaveLength(1);
    expect(aviso[0].actionUrl).toBe(`/admin/disputes/${d.id}`);
    await Dispute.destroy({ where: { id: d.id }, force: true } as any);
  });

  it('ticket: si responde el equipo, quien lo abrió recibe el aviso a SU ticket; una nota interna no avisa a nadie', async () => {
    const t = await request(app).post('/api/tickets').set(como(cliente)).send({ subject: 'Una duda', message: 'Hola, tengo una duda.', category: 'support' });
    const id = t.body.ticket.id as string;
    await request(app).post(`/api/tickets/${id}/messages`).set(como(equipo)).send({ message: 'Ya lo vemos.' });
    const aviso: any[] = await avisos(cliente, id);
    expect(aviso).toHaveLength(1);
    expect(aviso[0].actionUrl).toBe(`/tickets/${id}`);
    await request(app).post(`/api/tickets/${id}/messages`).set(como(equipo)).send({ message: 'Ojo, es reincidente.', isInternal: true });
    expect(await avisos(cliente, id)).toHaveLength(1);
  });

  it('ticket: si escribe quien lo abrió y hay alguien asignado, a esa persona le llega el aviso al panel', async () => {
    const t = await request(app).post('/api/tickets').set(como(cliente)).send({ subject: 'Otra duda', message: 'Hola, otra duda.', category: 'support' });
    const id = t.body.ticket.id as string;
    await Ticket.update({ assignedTo: otroEquipo.id } as any, { where: { id } });
    await request(app).post(`/api/tickets/${id}/messages`).set(como(cliente)).send({ message: 'Sigo esperando.' });
    const aviso: any[] = await avisos(otroEquipo, id);
    expect(aviso).toHaveLength(1);
    expect(aviso[0].actionUrl).toBe(`/admin/tickets/${id}`);
    expect(await avisos(cliente, id)).toHaveLength(0);
  });
});
