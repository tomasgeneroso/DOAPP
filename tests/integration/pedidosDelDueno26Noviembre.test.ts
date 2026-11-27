import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Pedidos del dueño (2026-11-26), por la puerta pública y contra la base real:
 *  - «el owner o superadmin o support puede abrir un ticket ya cerrado»;
 *  - «el hubs no se actualiza, al menos el financial, todavía me dice que tengo comprobantes por verificar».
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { Ticket } from '../../server/models/sql/Ticket.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

describe('pedidos del dueño del 26 de noviembre', () => {
  let app: Express;
  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/tickets', (await import('../../server/routes/admin/tickets.js')).default);
    app.use('/api/admin/hubs', (await import('../../server/routes/admin/hubs.js')).default);
  });

  describe('reabrir un ticket cerrado', () => {
    const cerrado = async (estado: 'closed' | 'resolved' = 'closed') => {
      const persona: any = await crearUsuario();
      const t: any = await Ticket.create({ ticketNumber: `R-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, subject: 'Consulta', category: 'support', priority: 'medium', status: estado, closedAt: new Date(), closedBy: persona.id, createdBy: persona.id, messages: [] } as any);
      return { persona, t };
    };
    const equipo = (adminRole: string) => crearUsuario({ role: 'admin', adminRole });
    const reabrir = (id: string, quien: any) => request(app).put(`/api/admin/tickets/${id}/reopen`).set(como(quien)).send({});

    it('lo reabren el owner, un super admin y soporte; queda abierto, con rastro de lo que se vació y con aviso a quien lo escribió', async () => {
      for (const rol of ['owner', 'super_admin', 'support']) {
        const { persona, t } = await cerrado(rol === 'support' ? 'resolved' : 'closed');
        expect([rol, (await reabrir(t.id, await equipo(rol))).status]).toEqual([rol, 200]);
        await t.reload();
        expect([t.status, t.closedAt, t.closedBy]).toEqual(['open', null, null]);
        expect(await Notification.count({ where: { recipientId: persona.id, relatedId: t.id } as any })).toBe(1);
        const rastro: any = await AuditLog.findOne({ where: { action: 'reopen_ticket', targetId: String(t.id) } });
        expect(rastro).toBeTruthy();
      }
    });

    it('un admin común, marketing o la propia persona no lo reabren, ni por el botón ni cambiando el estado', async () => {
      const { persona, t } = await cerrado();
      for (const quien of [await equipo('admin'), await equipo('marketing'), persona]) {
        expect((await reabrir(t.id, quien)).status).toBe(403);
      }
      const porEstado = await request(app).put(`/api/admin/tickets/${t.id}/status`).set(como(await equipo('admin'))).send({ status: 'open' });
      expect([porEstado.status, porEstado.body.code]).toEqual([403, 'REABRIR_NO_PERMITIDO']);
      await t.reload();
      expect(t.status).toBe('closed');
    });

    it('dos toques a la vez lo reabren una sola vez', async () => {
      const { persona, t } = await cerrado();
      const dueno = await equipo('owner');
      const r = await Promise.all([reabrir(t.id, dueno), reabrir(t.id, dueno)]);
      expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
      expect(await Notification.count({ where: { recipientId: persona.id, relatedId: t.id } as any })).toBe(1);
    });
  });

  describe('Hub financiero', () => {
    it('«por verificar» no cuenta los intentos de pago que quedaron debajo de un pago hecho', async () => {
      const dueno: any = await crearUsuario({ role: 'admin', adminRole: 'owner' });
      const porVerificar = async () => (await request(app).get('/api/admin/hubs/financial/overview').set(como(dueno))).body.financial.paymentsToVerify as number;
      const antes = await porVerificar();
      const cliente: any = await crearUsuario();
      const descripcion = `Publicación: prueba del hub ${Date.now()}`;
      const pago = (status: string, hace: number) => Payment.create({ payerId: cliente.id, paymentType: 'job_publication', status, amount: 5000, currency: 'ARS', paymentMethod: 'mercadopago', description: descripcion, createdAt: new Date(Date.now() - hace * 60_000) } as any);
      await pago('pending', 30);
      await pago('pending', 20);
      expect(await porVerificar()).toBe(antes + 1); // sin ninguno pagado cuenta el último
      await pago('completed', 10);
      expect(await porVerificar()).toBe(antes); // pagado: los dos intentos quedan debajo y no hay nada por verificar
    });
  });
});
