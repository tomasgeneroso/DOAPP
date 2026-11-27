import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Qué pasa al aceptar una postulación, elija quien publicó o elija el sistema (reporte del dueño, 2026-11-27: «no me llegó la notificación», «no dice si la aceptación fue del dueño o
 * automática», «no veo el botón de terminar»).
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
const correos: any[] = [];
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: (_t, nombre) => async (datos: any) => { if (nombre === 'sendEmail') correos.push(datos); return true; } }),
}));
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: () => undefined } }));
jest.mock('../../server/services/fcm.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => undefined }) }));

import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { ChatMessage } from '../../server/models/sql/ChatMessage.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { conSistema } from '../../server/db/contextoRls.js';
import { autoSeleccionar } from '../../server/jobs/autoSelectWorker.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

const enHoras = (h: number) => new Date(Date.now() + h * 3_600_000);

describe('aceptar una postulación', () => {
  let app: Express;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/proposals', (await import('../../server/routes/proposals.js')).default);
    app.use('/api/chat', (await import('../../server/routes/chat.js')).default);
    app.use('/api/contracts', (await import('../../server/routes/contracts.js')).default);
  });

  const armar = async (inicio: Date, fin: Date) => {
    const cliente: any = await crearUsuario({ role: 'client' });
    const trabajador: any = await crearUsuario({ role: 'doer', dniVerified: true });
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'open', price: 40000, publicationPaid: true, startDate: inicio, endDate: fin, title: `Flete ${Date.now()}${Math.random()}` });
    await request(app).post('/api/proposals').set(con(trabajador)).send({ job: trabajo.id, coverLetter: 'Me interesa', proposedPrice: 40000, estimatedDuration: 1 }).expect(201);
    const propuesta: any = await conSistema(() => Proposal.findOne({ where: { jobId: trabajo.id } as any }));
    return { cliente, trabajador, trabajo, propuesta };
  };
  const contratoDe = (jobId: string) => conSistema(() => Contract.findOne({ where: { jobId } as any })) as Promise<any>;
  const tarjetaDe = async (propuesta: any, quien: any) => {
    const t: any = await conSistema(() => ChatMessage.findOne({ where: { 'metadata.proposalId': propuesta.id } as any }));
    const lista = await request(app).get(`/api/chat/conversations/${t.conversationId}/messages`).set(con(quien));
    return lista.body.data.find((m: any) => m.id === t.id).metadata;
  };

  it('elegida por quien publicó: queda dicho, y al trabajador le llegan el aviso y el correo', async () => {
    const { cliente, trabajador, trabajo, propuesta } = await armar(enHoras(72), enHoras(74));
    correos.length = 0;
    await request(app).put(`/api/proposals/${propuesta.id}/approve`).set(con(cliente)).expect(200);

    const tarjeta = await tarjetaDe(propuesta, trabajador);
    expect([tarjeta.proposalStatus, tarjeta.aceptadaPor, typeof tarjeta.aceptadaEl]).toEqual(['approved', 'cliente', 'string']);
    expect(await conSistema(() => Notification.count({ where: { recipientId: trabajador.id, title: '¡Has sido seleccionado!' } as any }))).toBe(1);
    expect(correos.filter((c) => c.to === trabajador.email)).toHaveLength(1);

    const visto = await request(app).get(`/api/contracts/by-job/${trabajo.id}`).set(con(trabajador)).expect(200);
    expect(visto.body.contract.aceptacion).toEqual({ como: 'cliente', cuando: expect.any(String) });
    const uno = await request(app).get(`/api/contracts/${visto.body.contract.id}`).set(con(cliente)).expect(200);
    expect(uno.body.contract.aceptacion.como).toBe('cliente');
  });

  it('aceptada cuando la hora de inicio ya pasó: el contrato empieza en el momento (ya se puede terminar)', async () => {
    const { cliente, trabajo, propuesta } = await armar(enHoras(-1), enHoras(1));
    await request(app).put(`/api/proposals/${propuesta.id}/approve`).set(con(cliente)).expect(200);
    expect((await contratoDe(trabajo.id)).status).toBe('in_progress');
  });

  it('la selección automática usa las fechas del trabajo, suma bien el total y queda marcada como automática', async () => {
    const inicio = enHoras(10);
    const fin = enHoras(14);
    const { trabajador, trabajo, propuesta } = await armar(inicio, fin);
    await conSistema(() => autoSeleccionar());

    const contrato = await contratoDe(trabajo.id);
    expect([new Date(contrato.startDate).getTime(), new Date(contrato.endDate).getTime()]).toEqual([inicio.getTime(), fin.getTime()]);
    expect([Number(contrato.price), Number(contrato.totalPrice)]).toEqual([40000, 40000 + Number(contrato.commission)]);
    const tarjeta = await tarjetaDe(propuesta, trabajador);
    expect([tarjeta.proposalStatus, tarjeta.aceptadaPor]).toEqual(['approved', 'automatica']);
    expect(await conSistema(() => Notification.count({ where: { recipientId: trabajador.id, title: '¡Has sido seleccionado automáticamente!' } as any }))).toBe(1);
  });

  it('la selección automática no contrata por encima de lo que se pagó', async () => {
    const { trabajo, propuesta } = await armar(enHoras(10), enHoras(14));
    await conSistema(() => Proposal.update({ proposedPrice: 90000 } as any, { where: { id: propuesta.id } as any }));
    await conSistema(() => autoSeleccionar());
    expect(await contratoDe(trabajo.id)).toBeNull();
    expect(((await conSistema(() => Job.findByPk(trabajo.id))) as any).selectedWorkers ?? []).toEqual([]);
  });
});
