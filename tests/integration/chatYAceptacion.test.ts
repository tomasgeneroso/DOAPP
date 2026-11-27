import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Reporte del dueño (2026-11-27): «me mandaron postulación, envié un mensaje y no apareció; además acepto el trabajo y cuando recargo la aceptación sigue sin
 * registrarse». El camino completo por HTTP, con la protección por filas encendida como en el servidor.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: () => undefined } }));
jest.mock('../../server/services/fcm.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => undefined }) }));

import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { ChatMessage } from '../../server/models/sql/ChatMessage.model.js';
import { Conversation } from '../../server/models/sql/Conversation.model.js';
import { conSistema } from '../../server/db/contextoRls.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('postulación → mensaje → aceptación, como lo hace una persona', () => {
  let app: Express;
  let cliente: any, trabajador: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/proposals', (await import('../../server/routes/proposals.js')).default);
    app.use('/api/chat', (await import('../../server/routes/chat.js')).default);
    app.use('/api/contracts', (await import('../../server/routes/contracts.js')).default);
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    app.use('/api/notifications', (await import('../../server/routes/notifications.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer', dniVerified: true });
  });

  const recorrer = async (inicio: Date, fin: Date) => {
    const trabajo = await crearTrabajo(cliente.id, { status: 'open', price: 40000, publicationPaid: true, startDate: inicio, endDate: fin, title: `Flete y mudanza ${Date.now()}` });
    const postulacion = await request(app).post('/api/proposals').set(con(trabajador)).send({ job: trabajo.id, coverLetter: 'Me interesa el trabajo', proposedPrice: 40000, estimatedDuration: 1 });
    const propuesta: any = await conSistema(() => Proposal.findOne({ where: { jobId: trabajo.id, freelancerId: trabajador.id } as any }));
    return { trabajo, postulacion, propuesta };
  };

  it('el mensaje se guarda y la aceptación queda registrada (trabajo que todavía no empezó)', async () => {
    const { trabajo, postulacion, propuesta } = await recorrer(new Date(Date.now() + 3 * 86_400_000), new Date(Date.now() + 4 * 86_400_000));
    expect(postulacion.status).toBe(201);
    const tarjeta: any = await conSistema(() => ChatMessage.findOne({ where: { 'metadata.proposalId': propuesta.id } as any }));
    const mensaje = await request(app).post(`/api/chat/conversations/${tarjeta.conversationId}/messages`).set(con(cliente)).send({ content: 'hola, te acepto' });
    expect([mensaje.status, mensaje.body.message?.message ?? mensaje.body.message]).toEqual([201, 'hola, te acepto']);
    const aceptar = await request(app).put(`/api/proposals/${propuesta.id}/approve`).set(con(cliente)).send();
    expect([aceptar.status, aceptar.body.success]).toEqual([200, true]);
    const lista = await request(app).get(`/api/chat/conversations/${tarjeta.conversationId}/messages`).set(con(cliente));
    expect(lista.body.data.map((m: any) => m.message)).toContain('hola, te acepto');
    expect(lista.body.data.find((m: any) => m.id === tarjeta.id).metadata.proposalStatus).toBe('approved');
    expect(await conSistema(() => Contract.count({ where: { jobId: trabajo.id } as any }))).toBe(1);
  });

  it('con la hora de inicio ya pasada la aceptación también queda registrada y el trabajo empieza', async () => {
    const { trabajo, propuesta } = await recorrer(new Date(Date.now() - 3_600_000), new Date(Date.now() + 3_600_000));
    const aceptar = await request(app).put(`/api/proposals/${propuesta.id}/approve`).set(con(cliente)).send();
    expect([aceptar.status, ((await conSistema(() => Job.findByPk(trabajo.id))) as any).status]).toEqual([200, 'in_progress']);
  });

  it('una tarjeta guardada como «pendiente» se muestra con el estado de ahora', async () => {
    const { trabajo, propuesta } = await recorrer(new Date(Date.now() + 40 * 86_400_000), new Date(Date.now() + 41 * 86_400_000));
    const tarjeta: any = await conSistema(() => ChatMessage.findOne({ where: { 'metadata.proposalId': propuesta.id } as any }));
    // Se rechaza sin pasar por la ruta que actualiza la copia del mensaje.
    await conSistema(() => Proposal.update({ status: 'rejected' } as any, { where: { id: propuesta.id } as any }));
    await conSistema(() => Job.update({ status: 'cancelled' } as any, { where: { id: trabajo.id } as any }));
    const lista = await request(app).get(`/api/chat/conversations/${tarjeta.conversationId}/messages`).set(con(cliente));
    const vista = lista.body.data.find((m: any) => m.id === tarjeta.id).metadata;
    expect([vista.proposalStatus, vista.jobStatus]).toEqual(['rejected', 'cancelled']);
  });

  it('el chat del equipo de un trabajo terminado figura cerrado y ya no se escribe, aunque el cierre no hubiera llegado', async () => {
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'completed', maxWorkers: 3, title: `Equipo ${Date.now()}` });
    const chat: any = await conSistema(() => Conversation.create({ participants: [cliente.id, trabajador.id], jobId: trabajo.id, type: 'contract', lastMessageAt: new Date() } as any));
    await conSistema(() => Job.update({ groupChatId: chat.id } as any, { where: { id: trabajo.id } as any }));
    await conSistema(() => ChatMessage.create({ conversationId: chat.id, senderId: cliente.id, message: 'hola equipo' } as any));

    const lista = await request(app).get('/api/chat/conversations?limit=100').set(con(cliente));
    const visto = lista.body.data.find((c: any) => c.id === chat.id);
    expect(visto.cerrado).toEqual({ el: expect.any(String), borrarDesde: expect.any(String) });
    const escribir = await request(app).post(`/api/chat/conversations/${chat.id}/messages`).set(con(cliente)).send({ content: 'sigo escribiendo' });
    expect([escribir.status, escribir.body.code]).toEqual([403, 'CHAT_CERRADO']);
  });

  it('con cuentas del equipo (quien publica es «admin» y quien trabaja «soporte», sin poner la clave de panel) cada parte ve lo suyo y puede terminar', async () => {
    const antes = process.env.CLAVE_DE_PANEL_EN_PRUEBAS;
    process.env.CLAVE_DE_PANEL_EN_PRUEBAS = 'si';
    try {
      const jefa: any = await crearUsuario({ role: 'client', adminRole: 'admin' });
      const soporte: any = await crearUsuario({ role: 'doer', dniVerified: true, adminRole: 'support' });
      const trabajo = await crearTrabajo(jefa.id, { status: 'open', price: 40000, publicationPaid: true, startDate: new Date(Date.now() + 60 * 86_400_000), endDate: new Date(Date.now() + 61 * 86_400_000), title: `Equipo ${Date.now()}` });
      await request(app).post('/api/proposals').set(con(soporte)).send({ job: trabajo.id, coverLetter: 'Me interesa', proposedPrice: 40000, estimatedDuration: 1 }).expect(201);
      const propuesta: any = await conSistema(() => Proposal.findOne({ where: { jobId: trabajo.id } as any }));
      const aceptar = await request(app).put(`/api/proposals/${propuesta.id}/approve`).set(con(jefa));
      expect([aceptar.status, aceptar.body.message]).toEqual([200, expect.stringContaining('aprobada')]);

      const avisos = await request(app).get('/api/notifications?limit=50').set(con(soporte));
      const lista = avisos.body.notifications ?? avisos.body.data ?? [];
      expect(lista.map((n: any) => n.title)).toContain('¡Has sido seleccionado!');

      for (const persona of [soporte, jefa]) {
        const porTrabajo = await request(app).get(`/api/contracts/by-job/${trabajo.id}`).set(con(persona));
        expect([porTrabajo.status, porTrabajo.body.contract?.doerId]).toEqual([200, soporte.id]);
        const contrato = await request(app).get(`/api/contracts/${porTrabajo.body.contract.id}`).set(con(persona));
        expect(contrato.status).toBe(200);
        const mios = await request(app).get('/api/contracts?limit=50').set(con(persona));
        expect(mios.body.contracts.map((c: any) => c.id)).toContain(porTrabajo.body.contract.id);
        const ver = await request(app).get(`/api/jobs/${trabajo.id}`).set(con(persona));
        expect([ver.status, ver.body.job.selectedWorkers]).toEqual([200, [soporte.id]]);
      }
    } finally {
      if (antes === undefined) delete process.env.CLAVE_DE_PANEL_EN_PRUEBAS;
      else process.env.CLAVE_DE_PANEL_EN_PRUEBAS = antes;
    }
  });
});
