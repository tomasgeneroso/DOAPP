import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * El chat del equipo (pedido del dueño, 2026-11-22): trae las novedades del trabajo (también los reclamos), sus integrantes siguen a los elegidos, se cierra cuando el trabajo termina
 * (nadie puede escribir) y se borra pasado el plazo para reclamar, salvo que haya un reclamo abierto. Base de pruebas real.
 */
jest.mock('../../server/index.js', () => ({ __esModule: true, socketService: new Proxy({}, { get: () => () => undefined }) }));
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Dispute } from '../../server/models/sql/Dispute.model.js';
import { Conversation } from '../../server/models/sql/Conversation.model.js';
import { ChatMessage } from '../../server/models/sql/ChatMessage.model.js';
import { crearUsuario, crearTrabajo, crearContrato, crearDisputa } from '../helpers/fixtures.js';
import { avisarContratoAlChatDelEquipo, avisarAlChatDelEquipo, sincronizarChatDelEquipo, cerrarChatDelEquipo, barrerChatsDelEquipo } from '../../server/services/chatDelEquipo.js';

describe('chat del equipo de un trabajo', () => {
  let app: Express;
  let cliente: any, ana: any, beto: any, ajeno: any;
  const creados = { jobs: [] as string[], contratos: [] as string[], chats: [] as string[] };
  const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const mensajes = async (chatId: string) => ((await ChatMessage.findAll({ where: { conversationId: chatId } as any, order: [['createdAt', 'ASC']] })) as any[]).map((m) => String(m.message));

  /** Un trabajo de 2 lugares con su chat de equipo y los dos contratos. */
  const equipo = async (jobOver: Record<string, unknown> = {}) => {
    const job: any = await crearTrabajo(cliente.id, { status: 'in_progress', price: 10000, maxWorkers: 2, selectedWorkers: [ana.id, beto.id], ...jobOver });
    creados.jobs.push(job.id);
    const chat: any = await Conversation.create({ participants: [cliente.id, ana.id, beto.id], jobId: job.id, type: 'contract', lastMessage: 'Chat creado', lastMessageAt: new Date() } as any);
    creados.chats.push(chat.id);
    await Job.update({ groupChatId: chat.id } as any, { where: { id: job.id } });
    const ca: any = await crearContrato({ jobId: job.id, clientId: cliente.id, doerId: ana.id }, { status: 'in_progress', price: 5000 });
    const cb: any = await crearContrato({ jobId: job.id, clientId: cliente.id, doerId: beto.id }, { status: 'in_progress', price: 5000 });
    creados.contratos.push(ca.id, cb.id);
    return { job, chat, ca, cb };
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/chat', (await import('../../server/routes/chat.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    ana = await crearUsuario({ role: 'doer', name: 'Ana Gómez' });
    beto = await crearUsuario({ role: 'doer', name: 'Beto Ruiz' });
    ajeno = await crearUsuario({ role: 'doer' });
  });

  afterAll(async () => {
    const ids = [cliente.id, ana.id, beto.id, ajeno.id];
    try {
      await Dispute.destroy({ where: { contractId: creados.contratos }, force: true } as any);
      await ChatMessage.destroy({ where: { conversationId: creados.chats } as any });
      await Conversation.destroy({ where: { id: creados.chats } as any });
      await Contract.destroy({ where: { id: creados.contratos }, force: true } as any);
      await Job.destroy({ where: { id: creados.jobs }, force: true });
      await User.destroy({ where: { id: ids }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('las novedades del trabajo aparecen en el chat del equipo con el nombre de quien corresponde', async () => {
    const { job, chat, ca } = await equipo();
    await avisarContratoAlChatDelEquipo(ca.id, (n) => `✅ ${n} avisó que terminó el trabajo.`, 'trabajador_termino');
    await avisarAlChatDelEquipo(job.id, '⚠️ Se abrió un reclamo en el trabajo de Ana.', 'reclamo_abierto');
    const textos = await mensajes(chat.id);
    expect(textos).toContain('✅ Ana avisó que terminó el trabajo.');
    expect(textos).toContain('⚠️ Se abrió un reclamo en el trabajo de Ana.');
    expect(((await Conversation.findByPk(chat.id)) as any).lastMessage).toContain('reclamo');
  });

  it('un trabajo sin chat de equipo (un solo trabajador) no hace nada ni falla', async () => {
    const job: any = await crearTrabajo(cliente.id, { status: 'in_progress', maxWorkers: 1 });
    creados.jobs.push(job.id);
    await expect(avisarAlChatDelEquipo(job.id, 'algo', 'novedad')).resolves.toBeUndefined();
  });

  it('los integrantes siguen a los elegidos: si un contrato se cancela, esa persona sale del chat y queda anotado', async () => {
    const { job, chat, cb } = await equipo();
    await Contract.update({ status: 'cancelled' } as any, { where: { id: cb.id } });
    await sincronizarChatDelEquipo(job.id);
    const despues: any = await Conversation.findByPk(chat.id);
    expect(despues.participants.map(String).sort()).toEqual([cliente.id, ana.id].map(String).sort());
    expect((await mensajes(chat.id)).some((t) => /Beto salió del equipo \(1 de 2\)/.test(t))).toBe(true);
  });

  it('cerrado el chat nadie puede escribir (API), y el chat avisa cuándo se borra', async () => {
    const { job, chat } = await equipo();
    const antes = await request(app).post(`/api/chat/conversations/${chat.id}/messages`).set(como(ana)).send({ content: 'Llego en 10 minutos.' });
    expect(antes.status).toBe(201);
    await cerrarChatDelEquipo(job.id, 'completado');
    const cerrado: any = await Conversation.findByPk(chat.id);
    expect(cerrado.metadata.cerradoEl).toBeTruthy();
    expect(cerrado.metadata.borrarDesde).toBeTruthy();
    const despues = await request(app).post(`/api/chat/conversations/${chat.id}/messages`).set(como(ana)).send({ content: 'Otro mensaje.' });
    expect(despues.status).toBe(403);
    expect(despues.body.code).toBe('CHAT_CERRADO');
    expect((await mensajes(chat.id)).some((t) => /se cierra y no se puede escribir más/.test(t))).toBe(true);
    // Cerrarlo dos veces no repite el aviso.
    const cantidad = (await mensajes(chat.id)).length;
    await cerrarChatDelEquipo(job.id, 'completado');
    expect((await mensajes(chat.id)).length).toBe(cantidad);
  });

  it('el barrido cierra el chat de un trabajo ya terminado, y borra el chat cuyo plazo venció (y limpia la referencia del trabajo)', async () => {
    const { job, chat } = await equipo({ status: 'completed' });
    const r1 = await barrerChatsDelEquipo();
    expect(r1.cerrados).toBeGreaterThanOrEqual(1);
    expect(((await Conversation.findByPk(chat.id)) as any).metadata.cerradoEl).toBeTruthy();
    // Todavía dentro del plazo: no se borra.
    expect(await Conversation.findByPk(chat.id)).not.toBeNull();
    // Vencido el plazo: se borra con sus mensajes.
    const c: any = await Conversation.findByPk(chat.id);
    c.metadata = { ...c.metadata, borrarDesde: new Date(Date.now() - 3_600_000).toISOString() };
    c.changed('metadata', true);
    await c.save();
    const r2 = await barrerChatsDelEquipo();
    expect(r2.borrados).toBeGreaterThanOrEqual(1);
    expect(await Conversation.findByPk(chat.id)).toBeNull();
    expect(await ChatMessage.count({ where: { conversationId: chat.id } as any })).toBe(0);
    expect(((await Job.findByPk(job.id)) as any).groupChatId).toBeNull();
  });

  it('con un reclamo abierto del trabajo el chat NO se borra aunque el plazo haya vencido; resuelto el reclamo, sí', async () => {
    const { job, chat, ca } = await equipo({ status: 'completed' });
    await barrerChatsDelEquipo();
    const c: any = await Conversation.findByPk(chat.id);
    c.metadata = { ...c.metadata, borrarDesde: new Date(Date.now() - 3_600_000).toISOString() };
    c.changed('metadata', true);
    await c.save();
    const d: any = await crearDisputa({ contractId: ca.id, initiatedBy: cliente.id, against: ana.id }, { status: 'open' });
    await barrerChatsDelEquipo();
    expect(await Conversation.findByPk(chat.id)).not.toBeNull();
    await Dispute.update({ status: 'resolved_released', resolution: 'x', resolvedAt: new Date(), resolvedBy: cliente.id, resolutionType: 'full_release' } as any, { where: { id: d.id } });
    await barrerChatsDelEquipo();
    expect(await Conversation.findByPk(chat.id)).toBeNull();
    expect(((await Job.findByPk(job.id)) as any).groupChatId).toBeNull();
  });
});
