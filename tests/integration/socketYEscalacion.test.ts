import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Dos huecos de la auditoría de autenticación (A10 y A13):
 *  - Socket: «escribiendo…», «leído» y «marcar conversación como leída» no verificaban que quien los mandaba
 *    fuera parte de la conversación (cualquiera, conociendo un id, tocaba conversaciones ajenas).
 *  - POST /contract-change-requests/escalate-expired no pedía sesión: crea tickets y manda correos, y cualquiera
 *    podía dispararla (dos llamadas juntas duplicaban tickets).
 */

jest.mock('../../server/index.js', () => ({
  __esModule: true,
  socketService: new Proxy({}, { get: () => () => undefined }),
}));
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

import { SocketService } from '../../server/services/socket.js';
import { ChatMessage } from '../../server/models/sql/ChatMessage.model.js';
import { Conversation } from '../../server/models/sql/Conversation.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

type Emitido = { sala: string; evento: string; datos: any };

describe('socket: sólo participantes tocan una conversación', () => {
  const emitidos: Emitido[] = [];
  let servicio: any;
  const sala = (id: string) => `conversation:${id}`;
  const socketDe = (userId: string, salas: string[]): any => ({
    userId,
    user: { name: 'Persona' },
    rooms: new Set(salas),
    emit: jest.fn(),
    to: (room: string) => ({ emit: (evento: string, datos: any) => emitidos.push({ sala: room, evento, datos }) }),
  });

  beforeAll(() => {
    servicio = Object.create(SocketService.prototype);
    servicio.io = { to: (room: string) => ({ emit: (evento: string, datos: any) => emitidos.push({ sala: room, evento, datos }) }) };
  });
  beforeEach(() => { emitidos.length = 0; });
  afterEach(() => { jest.restoreAllMocks(); });

  it('«escribiendo…»: sólo desde dentro de la conversación', () => {
    servicio.handleTyping(socketDe('u1', [sala('c1')]), { conversationId: 'c1' }, true);
    expect(emitidos).toHaveLength(1);
    expect(emitidos[0]).toMatchObject({ sala: sala('c1'), evento: 'typing:update' });

    emitidos.length = 0;
    servicio.handleTyping(socketDe('intruso', []), { conversationId: 'c1' }, true); // no está en la sala
    servicio.handleTyping(socketDe('intruso', [sala('otra')]), { conversationId: 'c1' }, true);
    servicio.handleTyping(socketDe('intruso', []), {}, true); // sin id de conversación
    expect(emitidos).toHaveLength(0);
  });

  it('«leído»: sólo desde la conversación y sólo para un mensaje de ESA conversación', async () => {
    const guardar = jest.fn(async () => undefined);
    const mensaje: any = { id: 'm1', conversationId: 'c1', read: false, save: guardar };
    const buscar = jest.spyOn(ChatMessage, 'findByPk').mockResolvedValue(mensaje);

    await servicio.handleReadReceipt(socketDe('u1', [sala('c1')]), { conversationId: 'c1', messageId: 'm1' });
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(emitidos.map((e) => e.evento)).toEqual(['message:read']);

    // fuera de la sala: ni siquiera se busca el mensaje
    guardar.mockClear(); buscar.mockClear(); emitidos.length = 0;
    await servicio.handleReadReceipt(socketDe('intruso', []), { conversationId: 'c1', messageId: 'm1' });
    expect(buscar).not.toHaveBeenCalled();
    expect(guardar).not.toHaveBeenCalled();
    expect(emitidos).toHaveLength(0);

    // dentro de OTRA sala, apuntando a un mensaje de c1 con el id de su propia conversación
    await servicio.handleReadReceipt(socketDe('intruso', [sala('c2')]), { conversationId: 'c2', messageId: 'm1' });
    expect(guardar).not.toHaveBeenCalled();
    expect(emitidos).toHaveLength(0);
  });

  it('«marcar conversación como leída»: sólo un participante', async () => {
    const guardar = jest.fn(async () => undefined);
    const conversacion: any = { participants: ['u1', 'u2'], unreadCount: { u1: 3 }, changed: jest.fn(), save: guardar };
    jest.spyOn(Conversation, 'findByPk').mockResolvedValue(conversacion);
    const actualizar = jest.spyOn(ChatMessage, 'update').mockResolvedValue([0] as any);

    const participante = socketDe('u1', []);
    await servicio.handleMarkConversationRead(participante, 'c1');
    expect(actualizar).toHaveBeenCalledTimes(1);
    expect(participante.emit).toHaveBeenCalledWith('conversation:marked-read', { conversationId: 'c1' });
    expect(conversacion.unreadCount.u1).toBe(0);

    actualizar.mockClear(); guardar.mockClear();
    const intruso = socketDe('intruso', []);
    await servicio.handleMarkConversationRead(intruso, 'c1');
    expect(actualizar).not.toHaveBeenCalled();
    expect(guardar).not.toHaveBeenCalled();
    expect(intruso.emit).not.toHaveBeenCalled();
  });
});

describe('POST /api/contract-change-requests/escalate-expired: sólo administración', () => {
  let app: Express;
  let admin: any, comun: any, soporte: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/contract-change-requests', (await import('../../server/routes/contractChangeRequests.js')).default);
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    soporte = await crearUsuario({ role: 'admin', adminRole: 'support' });
    comun = await crearUsuario({ role: 'client' });
  });

  it('sin sesión: 401', async () => {
    expect((await request(app).post('/api/contract-change-requests/escalate-expired').send({})).status).toBe(401);
  });

  it('un usuario común y soporte: 403', async () => {
    expect((await request(app).post('/api/contract-change-requests/escalate-expired').set(con(comun)).send({})).status).toBe(403);
    expect((await request(app).post('/api/contract-change-requests/escalate-expired').set(con(soporte)).send({})).status).toBe(403);
  });

  it('un administrador sí la puede correr', async () => {
    const r = await request(app).post('/api/contract-change-requests/escalate-expired').set(con(admin)).send({});
    expect(r.status).toBe(200);
  });
});
