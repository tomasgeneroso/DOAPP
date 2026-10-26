import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Solicitudes de cambio o cancelación de un contrato: de punta a punta, contra la base de pruebas.
 *
 * Lo que había: el flujo no corría. Crear una solicitud daba 500 (la ruta escribía `requestedById`, que el modelo no
 * tiene, y `requestedBy` es obligatorio), leerla también (se pedía una asociación con el alias de una columna), la
 * tabla no tenía migración y el escalamiento a soporte armaba tickets con campos que no existen. Y lo poco que se
 * podía hacer a mano hacía daño: aceptar una CANCELACIÓN dejaba el contrato en «cancelled» sin devolver ni un peso
 * (el pago en garantía quedaba retenido para siempre y se salteaba la revisión del administrador) y aceptar una
 * MODIFICACIÓN de precio escribía el precio nuevo con un total «×1,1» a mano.
 *
 * Reglas que fija este archivo:
 *  - aceptar una cancelación NO cancela: abre la cancelación oficial (de mutuo acuerdo), la resuelve un administrador;
 *  - el precio no se cambia por acá; sí las fechas y una nota, y se aplican al contrato y al trabajo (si tiene un lugar);
 *  - solo se pide sobre contratos vivos, una pendiente por contrato, solo responde la otra parte y una sola vez.
 */

const mockCorreos: Array<{ to: string; subject: string; html: string }> = [];
jest.mock('../../server/index.js', () => ({
  __esModule: true,
  socketService: new Proxy({}, { get: () => () => undefined }),
}));
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: {
    sendEmail: async (m: { to: string; subject: string; html: string }) => {
      mockCorreos.push(m);
      return true;
    },
  },
}));

import { Contract } from '../../server/models/sql/Contract.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { ContractChangeRequest } from '../../server/models/sql/ContractChangeRequest.model.js';
import { ContractCancellationRequest } from '../../server/models/sql/ContractCancellationRequest.model.js';
import { Ticket } from '../../server/models/sql/Ticket.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { sequelize } from '../../server/config/database.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';
import { ESTADO_PARA_UN_AJENO } from '../helpers/ajeno.js';

describe('solicitudes de cambio de un contrato', () => {
  let app: Express;
  let cliente: any, trabajador: any, ajeno: any, admin: any;
  const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const manana = () => new Date(Date.now() + 2 * 86_400_000).toISOString();
  const enDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

  const contratoEn = async (status: string, over: Record<string, unknown> = {}, trabajoOver: Record<string, unknown> = {}) => {
    const t = await crearTrabajo(cliente.id, { status: 'in_progress', price: 5000, ...trabajoOver });
    return crearContrato({ jobId: t.id, clientId: cliente.id, doerId: trabajador.id }, { status, paymentStatus: 'escrow', escrowStatus: 'held_escrow', price: 5000, ...over });
  };
  const pedir = (quien: any, body: Record<string, unknown>) => request(app).post('/api/contract-change-requests').set(como(quien)).send(body);
  const responder = (quien: any, id: string, accept: unknown) => request(app).put(`/api/contract-change-requests/${id}/respond`).set(como(quien)).send({ accept });
  const motivo = 'Surgió un imprevisto y no puedo cumplir con lo acordado.';

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/contract-change-requests', (await import('../../server/routes/contractChangeRequests.js')).default);
    cliente = await crearUsuario({ role: 'client', name: 'Cliente de prueba' });
    trabajador = await crearUsuario({ role: 'client', name: 'Trabajador de prueba' });
    ajeno = await crearUsuario({ role: 'client', name: 'Ajeno' });
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
  });
  beforeEach(() => { mockCorreos.length = 0; });
  afterAll(async () => { /* la base se reconstruye en cada suite */ });

  describe('crear', () => {
    it('una cancelación: 201, queda pendiente y trae a las personas (no ids pelados)', async () => {
      const c = await contratoEn('in_progress');
      const r = await pedir(cliente, { contractId: c.id, type: 'cancel', reason: motivo });
      expect(r.status).toBe(201);
      expect(r.body.changeRequest).toMatchObject({ type: 'cancel', status: 'pending', requestedById: cliente.id });
      const guardada: any = await ContractChangeRequest.findByPk(r.body.changeRequest.id);
      expect(String(guardada.requestedBy)).toBe(String(cliente.id));
    });

    it('avisa a la otra parte, con el texto de la persona escapado (no es HTML)', async () => {
      const c = await contratoEn('in_progress');
      const r = await pedir(trabajador, { contractId: c.id, type: 'cancel', reason: 'Motivo <script>alert(1)</script> & más' });
      expect(r.status).toBe(201);
      const correo = mockCorreos.find((m) => m.to === cliente.email);
      expect(correo).toBeTruthy();
      expect(correo!.html).not.toContain('<script>');
      expect(correo!.html).toContain('&lt;script&gt;');
      expect(correo!.html).toContain(`/contracts/${c.id}/change-requests/${r.body.changeRequest.id}`);
      const aviso = await Notification.findOne({ where: { recipientId: cliente.id, relatedId: r.body.changeRequest.id } });
      expect(aviso).toBeTruthy();
    });

    it('un fallo al mandar el correo no tumba la solicitud que ya se creó', async () => {
      const c = await contratoEn('in_progress');
      const espia = jest.spyOn(await import('../../server/services/email.js').then((m) => m.default as any), 'sendEmail').mockRejectedValueOnce(new Error('SMTP caído'));
      const r = await pedir(cliente, { contractId: c.id, type: 'cancel', reason: motivo });
      expect(r.status).toBe(201);
      espia.mockRestore();
    });

    it('lo que no está bien se rechaza con un motivo (no un 500)', async () => {
      const c = await contratoEn('in_progress');
      expect((await pedir(ajeno, { contractId: c.id, type: 'cancel', reason: motivo })).status).toBe(ESTADO_PARA_UN_AJENO);
      expect((await pedir(cliente, { contractId: '00000000-0000-4000-8000-000000000000', type: 'cancel', reason: motivo })).status).toBe(404);
      expect((await pedir(cliente, { contractId: c.id, type: 'cancel', reason: 'no' })).status).toBe(400);
      expect((await pedir(cliente, { contractId: c.id, type: 'cancel', reason: 'x'.repeat(1001) })).status).toBe(400);
      expect((await pedir(cliente, { contractId: c.id, type: 'otro', reason: motivo })).status).toBe(400);
      expect((await request(app).post('/api/contract-change-requests').send({ contractId: c.id, type: 'cancel', reason: motivo })).status).toBe(401);
    });

    it('solo se pide sobre un contrato vivo', async () => {
      for (const estado of ['completed', 'cancelled', 'disputed', 'in_review', 'rejected', 'awaiting_confirmation']) {
        const c = await contratoEn(estado);
        const r = await pedir(cliente, { contractId: c.id, type: 'cancel', reason: motivo });
        expect([estado, r.status]).toEqual([estado, 400]);
      }
      for (const estado of ['pending', 'ready', 'accepted', 'in_progress']) {
        const c = await contratoEn(estado);
        expect([estado, (await pedir(cliente, { contractId: c.id, type: 'cancel', reason: motivo })).status]).toEqual([estado, 201]);
      }
    });

    it('una sola pendiente por contrato, también con dos pedidos a la vez', async () => {
      const c = await contratoEn('accepted');
      expect((await pedir(cliente, { contractId: c.id, type: 'cancel', reason: motivo })).status).toBe(201);
      expect((await pedir(trabajador, { contractId: c.id, type: 'cancel', reason: motivo })).status).toBe(400);

      const d = await contratoEn('accepted');
      const [a, b] = await Promise.all([
        pedir(cliente, { contractId: d.id, type: 'cancel', reason: motivo }),
        pedir(trabajador, { contractId: d.id, type: 'cancel', reason: motivo }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 400]);
      expect(await ContractChangeRequest.count({ where: { contractId: d.id, status: 'pending' } })).toBe(1);
    });

    it('no se pide cancelar mientras ya hay una cancelación oficial en revisión', async () => {
      const c = await contratoEn('accepted');
      await ContractCancellationRequest.create({
        contractId: c.id, jobId: c.jobId, requestedBy: cliente.id, otherPartyId: trabajador.id, reason: 'Cancelación en revisión del administrador',
        requestType: 'full_cancellation', status: 'pending', priority: 'medium', statusHistory: [],
      } as any);
      expect((await pedir(trabajador, { contractId: c.id, type: 'cancel', reason: motivo })).status).toBe(400);
    });

    it('una modificación: exige términos, y el precio NO se cambia por acá', async () => {
      const c = await contratoEn('accepted');
      expect((await pedir(cliente, { contractId: c.id, type: 'modify', reason: motivo })).status).toBe(400); // sin términos
      expect((await pedir(cliente, { contractId: c.id, type: 'modify', reason: motivo, newTerms: {} })).status).toBe(400);
      const precio = await pedir(cliente, { contractId: c.id, type: 'modify', reason: motivo, newTerms: { price: 1 } });
      expect(precio.status).toBe(400);
      expect(precio.body.message).toMatch(/precio/i);
      // y nada se guardó
      expect(await ContractChangeRequest.count({ where: { contractId: c.id } })).toBe(0);
    });

    it('las fechas tienen que ser válidas, futuras y en orden', async () => {
      const c = await contratoEn('accepted');
      const nuevo = (newTerms: Record<string, unknown>) => pedir(cliente, { contractId: c.id, type: 'modify', reason: motivo, newTerms });
      expect((await nuevo({ endDate: 'no es una fecha' })).status).toBe(400);
      expect((await nuevo({ endDate: new Date(Date.now() - 86_400_000).toISOString() })).status).toBe(400);
      expect((await nuevo({ startDate: enDias(10), endDate: enDias(5) })).status).toBe(400); // fin antes que inicio
      expect((await nuevo({ startDate: enDias(30) })).status).toBe(400); // inicio después del fin que ya tiene (14 días)
      expect((await nuevo({ description: 'y'.repeat(501) })).status).toBe(400);
      expect((await nuevo({ endDate: enDias(20) })).status).toBe(201);
    });

    it('una fecha de fin ya pasada no se acepta, aunque el trabajo haya empezado hace días', async () => {
      const c = await contratoEn('in_progress', { startDate: new Date(Date.now() - 3 * 86_400_000) });
      const r = await pedir(cliente, { contractId: c.id, type: 'modify', reason: motivo, newTerms: { endDate: new Date(Date.now() - 86_400_000).toISOString() } });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/futura/i);
    });

    it('con el trabajo en curso solo se mueve la fecha de fin', async () => {
      const c = await contratoEn('in_progress');
      const inicio = await pedir(cliente, { contractId: c.id, type: 'modify', reason: motivo, newTerms: { startDate: enDias(1), endDate: enDias(20) } });
      expect(inicio.status).toBe(400);
      expect(inicio.body.message).toMatch(/empez/i);
      expect((await pedir(cliente, { contractId: c.id, type: 'modify', reason: motivo, newTerms: { endDate: enDias(20) } })).status).toBe(201);
    });
  });

  describe('leer', () => {
    it('las dos partes ven la solicitud con personas y contrato; un ajeno no', async () => {
      const c = await contratoEn('in_progress');
      const id = (await pedir(cliente, { contractId: c.id, type: 'cancel', reason: motivo })).body.changeRequest.id;

      const detalle = await request(app).get(`/api/contract-change-requests/${id}`).set(como(trabajador));
      expect(detalle.status).toBe(200);
      expect(detalle.body.changeRequest.requestedBy).toMatchObject({ id: cliente.id, name: 'Cliente de prueba' });
      expect(detalle.body.changeRequest.contract).toMatchObject({ id: c.id });
      expect(detalle.body.changeRequest.contract.client).toMatchObject({ id: cliente.id });

      const lista = await request(app).get(`/api/contract-change-requests/contract/${c.id}`).set(como(cliente));
      expect(lista.status).toBe(200);
      expect(lista.body.changeRequests).toHaveLength(1);
      expect(lista.body.changeRequests[0].requestedBy).toMatchObject({ id: cliente.id });

      expect((await request(app).get(`/api/contract-change-requests/${id}`).set(como(ajeno))).status).toBe(ESTADO_PARA_UN_AJENO);
      expect((await request(app).get(`/api/contract-change-requests/contract/${c.id}`).set(como(ajeno))).status).toBe(ESTADO_PARA_UN_AJENO);
      expect((await request(app).get(`/api/contract-change-requests/00000000-0000-4000-8000-000000000000`).set(como(cliente))).status).toBe(404);
    });
  });

  describe('responder', () => {
    it('solo la otra parte, y una sola vez', async () => {
      const c = await contratoEn('in_progress');
      const id = (await pedir(cliente, { contractId: c.id, type: 'cancel', reason: motivo })).body.changeRequest.id;
      expect((await responder(cliente, id, true)).status).toBe(400); // no puede aceptar su propia solicitud
      expect((await responder(ajeno, id, true)).status).toBe(ESTADO_PARA_UN_AJENO);
      expect((await responder(trabajador, id, 'quizás')).status).toBe(400);
      expect((await responder(trabajador, id, false)).status).toBe(200);
      expect((await responder(trabajador, id, true)).status).toBe(400); // ya procesada
      const guardada: any = await ContractChangeRequest.findByPk(id);
      expect(guardada.status).toBe('rejected');
      expect(String(guardada.respondedBy)).toBe(String(trabajador.id));
    });

    it('rechazar no toca el contrato y avisa a quien pidió', async () => {
      const c = await contratoEn('in_progress');
      const id = (await pedir(cliente, { contractId: c.id, type: 'cancel', reason: motivo })).body.changeRequest.id;
      mockCorreos.length = 0;
      expect((await responder(trabajador, id, false)).status).toBe(200);
      expect(((await Contract.findByPk(c.id)) as any).status).toBe('in_progress');
      expect(mockCorreos.some((m) => m.to === cliente.email && /rechazada/i.test(m.subject))).toBe(true);
    });

    it('dos respuestas a la vez: una sola se procesa', async () => {
      const c = await contratoEn('in_progress');
      const id = (await pedir(cliente, { contractId: c.id, type: 'cancel', reason: motivo })).body.changeRequest.id;
      const [a, b] = await Promise.all([responder(trabajador, id, true), responder(trabajador, id, true)]);
      expect([a.status, b.status].sort()).toEqual([200, 400]);
      expect(await ContractCancellationRequest.count({ where: { contractId: c.id } })).toBe(1);
    });

    describe('aceptar una CANCELACIÓN', () => {
      it('NO cancela el contrato ni mueve plata: abre la cancelación oficial, de mutuo acuerdo', async () => {
        const c = await contratoEn('in_progress', {}, { status: 'in_progress' });
        const id = (await pedir(cliente, { contractId: c.id, type: 'cancel', reason: motivo })).body.changeRequest.id;
        const r = await responder(trabajador, id, true);
        expect(r.status).toBe(200);
        expect(r.body.message).toMatch(/administrador/i);

        const despues: any = await Contract.findByPk(c.id);
        expect(despues.status).toBe('in_progress'); // el contrato no se cancela solo
        expect(despues.paymentStatus).toBe('escrow'); // el dinero queda donde está: lo resuelve un administrador
        expect(despues.escrowStatus).toBe('held_escrow');

        const oficial: any = await ContractCancellationRequest.findOne({ where: { contractId: c.id } });
        expect(oficial).toBeTruthy();
        expect(oficial).toMatchObject({ status: 'pending', requestType: 'full_cancellation', previousContractStatus: 'in_progress', priority: 'urgent' });
        expect(String(oficial.requestedBy)).toBe(String(cliente.id)); // la pidió el cliente
        expect(String(oficial.otherPartyId)).toBe(String(trabajador.id)); // y la aceptó el trabajador
        expect(oficial.reason).toMatch(/mutuo acuerdo/i);
        expect(r.body.cancellationRequestId).toBe(oficial.id);
      });

      it('el trabajo queda en pausa mientras se revisa, como en el camino oficial', async () => {
        const c = await contratoEn('accepted', {}, { status: 'in_progress' });
        const id = (await pedir(trabajador, { contractId: c.id, type: 'cancel', reason: motivo })).body.changeRequest.id;
        await responder(cliente, id, true);
        const trabajo: any = await Job.findByPk(c.jobId);
        expect(trabajo.status).toBe('paused');
        const oficial: any = await ContractCancellationRequest.findOne({ where: { contractId: c.id } });
        expect(oficial.previousJobStatus).toBe('in_progress');
      });

      it('los administradores reciben el aviso de revisar', async () => {
        const c = await contratoEn('accepted');
        const id = (await pedir(cliente, { contractId: c.id, type: 'cancel', reason: motivo })).body.changeRequest.id;
        await responder(trabajador, id, true);
        const oficial: any = await ContractCancellationRequest.findOne({ where: { contractId: c.id } });
        const aviso = await Notification.findOne({ where: { recipientId: admin.id, relatedId: oficial.id } });
        expect(aviso).toBeTruthy();
      });

      it('queda asentado quién pidió, quién aceptó y cuándo', async () => {
        const c = await contratoEn('accepted');
        const id = (await pedir(cliente, { contractId: c.id, type: 'cancel', reason: motivo })).body.changeRequest.id;
        await responder(trabajador, id, true);
        const filas: any[] = await AuditLog.findAll({ where: { targetId: String(c.id) } });
        expect(filas.map((f) => f.action)).toEqual(expect.arrayContaining(['CONTRACT_CHANGE_REQUESTED', 'CONTRACT_CHANGE_ACCEPTED']));
      });

      it('si el contrato dejó de admitir cambios mientras esperaba, no se acepta', async () => {
        const c = await contratoEn('accepted');
        const id = (await pedir(cliente, { contractId: c.id, type: 'cancel', reason: motivo })).body.changeRequest.id;
        await Contract.update({ status: 'completed' }, { where: { id: c.id } });
        const r = await responder(trabajador, id, true);
        expect(r.status).toBe(409);
        expect(((await ContractChangeRequest.findByPk(id)) as any).status).toBe('pending'); // sigue sin responder
        expect(await ContractCancellationRequest.count({ where: { contractId: c.id } })).toBe(0);
      });
    });

    describe('aceptar una MODIFICACIÓN', () => {
      it('aplica las fechas al contrato y, con un solo lugar, también al trabajo; el precio no cambia', async () => {
        const c = await contratoEn('accepted', { price: 5000, totalPrice: 5500, commission: 500 }, { maxWorkers: 1, reminder12hSent: true });
        const inicio = enDias(5);
        const fin = enDias(9);
        const id = (await pedir(cliente, { contractId: c.id, type: 'modify', reason: motivo, newTerms: { startDate: inicio, endDate: fin } })).body.changeRequest.id;
        const r = await responder(trabajador, id, true);
        expect(r.status).toBe(200);

        const despues: any = await Contract.findByPk(c.id);
        expect(new Date(despues.startDate).toISOString()).toBe(new Date(inicio).toISOString());
        expect(new Date(despues.endDate).toISOString()).toBe(new Date(fin).toISOString());
        // lo que mueve plata queda exactamente igual (nada de «×1,1» ni de recalcular a mano)
        expect(Number(despues.price)).toBe(5000);
        expect(Number(despues.totalPrice)).toBe(5500);
        expect(Number(despues.commission)).toBe(500);

        const trabajo: any = await Job.findByPk(c.jobId);
        expect(new Date(trabajo.startDate).toISOString()).toBe(new Date(inicio).toISOString());
        expect(trabajo.reminder12hSent).toBe(false); // los avisos vuelven a contar desde la fecha nueva
      });

      it('con varios lugares las fechas del trabajo son de todos: no se tocan', async () => {
        const c = await contratoEn('accepted', {}, { maxWorkers: 3 });
        const antes: any = await Job.findByPk(c.jobId);
        const fin = enDias(20);
        const id = (await pedir(cliente, { contractId: c.id, type: 'modify', reason: motivo, newTerms: { endDate: fin } })).body.changeRequest.id;
        await responder(trabajador, id, true);
        const trabajo: any = await Job.findByPk(c.jobId);
        expect(new Date(trabajo.startDate).toISOString()).toBe(new Date(antes.startDate).toISOString());
        expect(new Date(trabajo.endDate ?? 0).toISOString()).toBe(new Date(antes.endDate ?? 0).toISOString());
        // el contrato sí cambia
        expect(new Date(((await Contract.findByPk(c.id)) as any).endDate).toISOString()).toBe(new Date(fin).toISOString());
      });

      it('la nota queda en el contrato, con fecha, sin pisar lo que había', async () => {
        const c = await contratoEn('accepted', { notes: 'Llevar herramientas propias.' });
        const id = (await pedir(cliente, { contractId: c.id, type: 'modify', reason: motivo, newTerms: { description: 'Entrar por el portón lateral.' } })).body.changeRequest.id;
        await responder(trabajador, id, true);
        const notas = ((await Contract.findByPk(c.id)) as any).notes as string;
        expect(notas).toContain('Llevar herramientas propias.');
        expect(notas).toContain('Entrar por el portón lateral.');
        expect(notas).toMatch(/Cambio acordado/);
      });

      it('si entre el pedido y la respuesta la fecha quedó vencida, no se aplica', async () => {
        const c = await contratoEn('accepted');
        const id = (await pedir(cliente, { contractId: c.id, type: 'modify', reason: motivo, newTerms: { endDate: enDias(20) } })).body.changeRequest.id;
        await ContractChangeRequest.update({ newTerms: { endDate: new Date(Date.now() - 3_600_000).toISOString() } as any }, { where: { id } });
        const r = await responder(trabajador, id, true);
        expect(r.status).toBe(409);
        expect(((await ContractChangeRequest.findByPk(id)) as any).status).toBe('pending');
      });

      it('una solicitud vieja con precio (de antes de esta regla) no mueve plata: se rechaza al aceptar', async () => {
        const c = await contratoEn('accepted', { price: 5000, totalPrice: 5500, commission: 500 });
        const vieja: any = await ContractChangeRequest.create({ contractId: c.id, requestedBy: cliente.id, type: 'modify', reason: motivo, newTerms: { price: 9000 } } as any, { validate: false });
        const r = await responder(trabajador, vieja.id, true);
        expect(r.status).toBe(409);
        const despues: any = await Contract.findByPk(c.id);
        expect(Number(despues.price)).toBe(5000);
        expect(Number(despues.totalPrice)).toBe(5500);
      });
    });
  });

  describe('sin respuesta: pasa a soporte', () => {
    const vencer = (id: string, horas: number) =>
      sequelize.query('UPDATE contract_change_requests SET created_at = :cuando WHERE id = :id', { replacements: { id, cuando: new Date(Date.now() - horas * 3_600_000) } });

    it('a las 48 h se crea el ticket con los campos del modelo y se avisa a las dos partes', async () => {
      const c = await contratoEn('accepted');
      const id = (await pedir(cliente, { contractId: c.id, type: 'cancel', reason: motivo })).body.changeRequest.id;
      await vencer(id, 49);
      mockCorreos.length = 0;

      const r = await request(app).post('/api/contract-change-requests/escalate-expired').set(como(admin)).send({});
      expect(r.status).toBe(200);
      expect(r.body.count).toBeGreaterThanOrEqual(1);

      const sol: any = await ContractChangeRequest.findByPk(id);
      expect(sol.status).toBe('escalated_to_support');
      expect(sol.supportTicketId).toBeTruthy();
      const ticket: any = await Ticket.findByPk(sol.supportTicketId);
      expect(ticket).toMatchObject({ category: 'report_contract', priority: 'high', status: 'open' });
      expect(String(ticket.createdBy)).toBe(String(cliente.id));
      expect(String(ticket.relatedContract)).toBe(String(c.id));
      expect(ticket.ticketNumber).toMatch(/^TK-\d{6}$/);
      expect(ticket.messages[0].message).toContain(motivo);

      const aCliente = mockCorreos.find((m) => m.to === cliente.email);
      const aTrabajador = mockCorreos.find((m) => m.to === trabajador.email);
      expect(aCliente?.html).toContain(`/tickets/${ticket.id}`); // la pantalla de tickets que existe en la web
      expect(aCliente?.html).not.toContain('/support/tickets');
      expect(aTrabajador?.html).toContain(`/contracts/${c.id}/change-requests/${id}`);
    });

    it('antes de las 48 h no se toca, y corrida dos veces no duplica el ticket', async () => {
      const c = await contratoEn('accepted');
      const id = (await pedir(cliente, { contractId: c.id, type: 'cancel', reason: motivo })).body.changeRequest.id;
      await vencer(id, 47);
      await request(app).post('/api/contract-change-requests/escalate-expired').set(como(admin)).send({});
      expect(((await ContractChangeRequest.findByPk(id)) as any).status).toBe('pending');

      await vencer(id, 49);
      await Promise.all([
        request(app).post('/api/contract-change-requests/escalate-expired').set(como(admin)).send({}),
        request(app).post('/api/contract-change-requests/escalate-expired').set(como(admin)).send({}),
      ]);
      expect(await Ticket.count({ where: { relatedContract: c.id } })).toBe(1);
    });

    it('una solicitud ya respondida no se escala', async () => {
      const c = await contratoEn('accepted');
      const id = (await pedir(cliente, { contractId: c.id, type: 'cancel', reason: motivo })).body.changeRequest.id;
      await responder(trabajador, id, false);
      await vencer(id, 100);
      await request(app).post('/api/contract-change-requests/escalate-expired').set(como(admin)).send({});
      expect(((await ContractChangeRequest.findByPk(id)) as any).status).toBe('rejected');
    });
  });
});
