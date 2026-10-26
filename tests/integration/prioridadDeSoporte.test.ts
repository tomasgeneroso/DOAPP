import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Prioridad de soporte (T&C 8.1): en el panel de administración los tickets de cuentas con la membresía PRO vigente van primero y vienen marcados.
 * Una membresía vencida, o una cuenta sin ella, no tiene prioridad.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Ticket } from '../../server/models/sql/Ticket.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

const DIA = 86_400_000;

describe('prioridad de soporte para la membresía PRO', () => {
  let app: Express;
  let equipo: any, pro: any, vencida: any, gratis: any;
  const ids: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const ticket = async (autor: any, asunto: string, haceDias: number) => {
    const t: any = await Ticket.create({ ticketNumber: `TK-T${Math.random().toString(36).slice(2, 9)}`, subject: asunto, category: 'support', priority: 'medium', status: 'open', createdBy: autor.id, messages: [], tags: [] } as any);
    // «hace N días»: createdAt se pisa después de crear para controlar el orden
    await Ticket.update({ createdAt: new Date(Date.now() - haceDias * DIA) } as any, { where: { id: t.id }, silent: true } as any);
    return t;
  };
  const lista = async (extra = '') => (await request(app).get(`/api/admin/tickets?limit=100${extra}`).set(con(equipo))).body;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/tickets', (await import('../../server/routes/admin/tickets.js')).default);
    equipo = await crearUsuario({ role: 'admin', adminRole: 'support' });
    pro = await crearUsuario({ role: 'client', membershipTier: 'pro', hasMembership: true, membershipExpiresAt: new Date(Date.now() + 20 * DIA) });
    vencida = await crearUsuario({ role: 'client', membershipTier: 'pro', hasMembership: true, membershipExpiresAt: new Date(Date.now() - 2 * DIA) });
    gratis = await crearUsuario({ role: 'client' });
    ids.push(equipo.id, pro.id, vencida.id, gratis.id);
  });

  afterAll(async () => {
    try {
      await Ticket.destroy({ where: { createdBy: ids }, force: true } as any);
      await User.destroy({ where: { id: ids }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('el ticket de una cuenta PRO va primero aunque sea el más viejo, y viene marcado', async () => {
    await ticket(gratis, 'Pregunta de una cuenta gratuita', 0);
    await ticket(vencida, 'Pregunta con la membresía vencida', 1);
    await ticket(pro, 'Pregunta de una cuenta PRO', 5);

    const r = await lista();

    const asuntos = r.data.map((t: any) => t.subject);
    expect(asuntos[0]).toBe('Pregunta de una cuenta PRO');
    expect(r.data[0].premium).toBe(true);
    // después, el orden de siempre (más nuevo primero)
    expect(asuntos.indexOf('Pregunta de una cuenta gratuita')).toBeLessThan(asuntos.indexOf('Pregunta con la membresía vencida'));
    expect(r.data.filter((t: any) => t.premium)).toHaveLength(1);
  });

  it('una membresía vencida o una cuenta gratuita no tienen prioridad', async () => {
    const r = await lista();
    const por = (asunto: string) => r.data.find((t: any) => t.subject === asunto);
    expect(por('Pregunta con la membresía vencida').premium).toBe(false);
    expect(por('Pregunta de una cuenta gratuita').premium).toBe(false);
  });

  it('quien no es del equipo no ve la lista de otros: la prioridad no cambia lo que se ve', async () => {
    const r = await request(app).get('/api/admin/tickets').set(con(gratis));
    expect(r.status).toBe(200);
    expect(r.body.data.every((t: any) => String(t.createdBy) === String(gratis.id))).toBe(true);
  });
});
