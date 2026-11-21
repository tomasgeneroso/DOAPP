import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Tickets desde el panel del equipo (pedido del dueño, 2026-11-21): cambiar el estado de un ticket tiene que cambiarlo, y la respuesta que escribe el equipo tiene que quedar
 * guardada y verla quien abrió el ticket (el aviso salía, pero el mensaje no se guardaba). Base de pruebas real.
 */
jest.mock('../../server/index.js', () => ({ __esModule: true, socketService: new Proxy({}, { get: () => () => undefined }) }));
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Ticket } from '../../server/models/sql/Ticket.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

describe('tickets: estado y respuestas del equipo', () => {
  let app: Express;
  let persona: any, equipo: any;
  const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/tickets', (await import('../../server/routes/admin/tickets.js')).default);
    app.use('/api/tickets', (await import('../../server/routes/tickets.js')).default);
    persona = await crearUsuario({ role: 'client' });
    equipo = await crearUsuario({ role: 'admin', adminRole: 'owner' });
  });

  afterAll(async () => {
    const ids = [persona.id, equipo.id];
    try {
      await Ticket.destroy({ where: { createdBy: ids }, force: true } as any);
      await Notification.destroy({ where: { recipientId: ids } });
      await User.destroy({ where: { id: ids }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  const nuevo = async () => {
    const r = await request(app).post('/api/tickets').set(como(persona)).send({ subject: 'No me anda', message: 'Hola, no me anda la pantalla.', category: 'support' });
    expect(r.status).toBe(201);
    return r.body.ticket.id as string;
  };

  it('el equipo cambia el estado del ticket y queda cambiado', async () => {
    const id = await nuevo();
    for (const estado of ['in_progress', 'waiting_user', 'resolved']) {
      const r = await request(app).put(`/api/admin/tickets/${id}/status`).set(como(equipo)).send({ status: estado });
      expect(r.status).toBe(200);
      expect(((await Ticket.findByPk(id)) as any).status).toBe(estado);
    }
  });

  it('la respuesta pública del equipo queda guardada, la ve quien abrió el ticket, y el aviso lo lleva a SU pantalla del ticket', async () => {
    const id = await nuevo();
    const r = await request(app).post(`/api/admin/tickets/${id}/messages`).set(como(equipo)).send({ message: 'Ya lo estamos viendo.' });
    expect(r.status).toBe(200);
    const t: any = await Ticket.findByPk(id);
    expect(t.messages).toHaveLength(2);
    expect(t.messages[1].message).toBe('Ya lo estamos viendo.');
    const g = await request(app).get(`/api/tickets/${id}`).set(como(persona));
    expect(g.body.ticket.messages.filter((m: any) => !m.isInternal)).toHaveLength(2);
    const aviso: any = await Notification.findOne({ where: { recipientId: persona.id, relatedId: id } as any });
    expect(aviso.actionUrl).toBe(`/tickets/${id}`);
  });

  it('una nota interna del equipo queda guardada pero quien abrió el ticket no la ve', async () => {
    const id = await nuevo();
    await request(app).post(`/api/admin/tickets/${id}/messages`).set(como(equipo)).send({ message: 'Ojo, es reincidente.', isInternal: true });
    expect(((await Ticket.findByPk(id)) as any).messages).toHaveLength(2);
    const g = await request(app).get(`/api/admin/tickets/${id}`).set(como(persona));
    expect(JSON.stringify(g.body)).not.toContain('reincidente');
  });
});
