import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * La campanita y su lista cuentan lo mismo (reporte del dueño, 2026-11-17: «supuestamente tengo 7 notificaciones y no tengo ninguna»).
 * Con la base de pruebas real: 7 sin leer de distintas categorías → la lista trae 5 (límite) y el contador dice 7; al leerlas todas, 0.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { Notification } from '../../server/models/sql/Notification.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

describe('notificaciones: la lista y el contador coinciden', () => {
  let app: Express;
  let persona: any;
  const con = () => ({ Authorization: `Bearer ${jwt.sign({ id: persona.id, email: persona.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/notifications', (await import('../../server/routes/notifications.js')).default);
    persona = await crearUsuario({ role: 'client' });
    const categorias = ['chat', 'contract', 'payment', 'job', 'chat', 'system', 'proposal'];
    for (const [i, category] of categorias.entries()) {
      await Notification.create({ recipientId: persona.id, type: 'info', category, title: `Aviso ${i}`, message: `Texto ${i}`, read: false } as any);
    }
  });

  afterAll(async () => {
    try {
      await Notification.destroy({ where: { recipientId: persona.id } });
      await User.destroy({ where: { id: persona.id }, force: true });
    } catch { /* la limpieza no hace fallar la prueba */ }
  });

  it('con 7 sin leer: la lista (límite 5) trae 5 y el contador dice 7', async () => {
    const lista = await request(app).get('/api/notifications').query({ limit: 5 }).set(con());
    expect(lista.status).toBe(200);
    expect(lista.body.data).toHaveLength(5);
    expect(lista.body.unreadCount).toBe(7);
    const soloContar = await request(app).get('/api/notifications').query({ limit: 1, unreadOnly: 'true' }).set(con());
    expect(soloContar.status).toBe(200);
    expect(soloContar.body.unreadCount).toBe(7);
  });

  it('al marcar todas como leídas, el contador queda en 0 y la lista sigue mostrándolas', async () => {
    const r = await request(app).put('/api/notifications/read-all').set(con());
    expect(r.status).toBe(200);
    const lista = await request(app).get('/api/notifications').query({ limit: 5 }).set(con());
    expect(lista.body.unreadCount).toBe(0);
    expect(lista.body.data).toHaveLength(5);
  });
});
