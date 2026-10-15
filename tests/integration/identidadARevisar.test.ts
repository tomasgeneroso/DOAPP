import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * El DNI que Didit leyó y ya usa OTRA cuenta no se cambia (falla cerrada) y queda en una lista de trabajo para administración:
 * «Identidad a revisar». El aviso se registra y se notifica UNA vez por choque (el estado de Didit se consulta seguido), y «revisado»
 * exige una nota que queda en el registro.
 */

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { aplicarIdentidadDeDidit } from '../../server/services/identidadDeDidit.js';
import { crearUsuario } from '../helpers/fixtures.js';

let n = 0;
const dniNuevo = () => String(48_000_000 + ++n * 7919 + Math.floor(Math.random() * 1000));
const decision = (dni: string) => ({ status: 'Approved', id_verifications: [{ document_number: dni, first_name: 'Ana', last_name: 'Pérez' }] });

describe('identidad a revisar (DNI repetido)', () => {
  let app: Express;
  let admin: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const lista = (q = '') => request(app).get(`/api/admin/hubs/identidad-a-revisar${q}`).set(con(admin));

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/hubs', (await import('../../server/routes/admin/hubs.js')).default);
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
  });

  async function crearChoque() {
    const dni = dniNuevo();
    const ajena: any = await crearUsuario({ dni, dniVerified: true, name: 'Cuenta Original' });
    const yo: any = await crearUsuario({ dni: dniNuevo(), name: 'Cuenta Duplicada' });
    await aplicarIdentidadDeDidit(yo, decision(dni));
    return { dni, ajena, yo };
  }

  it('el choque aparece en la lista con las dos cuentas y el DNI', async () => {
    const { dni, ajena, yo } = await crearChoque();
    const r = await lista();
    expect(r.status).toBe(200);
    const fila = r.body.data.find((c: any) => c.userId === String(yo.id));
    expect(fila).toBeTruthy();
    expect(fila).toMatchObject({ nombre: 'Cuenta Duplicada', dniDeDidit: dni, estado: 'pendiente', otraSigueConEseDni: true });
    expect(fila.otraCuenta).toMatchObject({ id: String(ajena.id), nombre: 'Cuenta Original', dniVerificado: true });
    expect(r.body.pendientes).toBeGreaterThan(0);
  });

  it('consultar el estado de Didit varias veces NO repite el evento ni el aviso', async () => {
    const dni = dniNuevo();
    await crearUsuario({ dni });
    const yo: any = await crearUsuario({ dni: dniNuevo() });
    for (let i = 0; i < 4; i++) await aplicarIdentidadDeDidit(yo, decision(dni));
    expect(await AuditLog.count({ where: { action: 'KYC_DNI_EN_USO', targetId: String(yo.id) } })).toBe(1);
    const avisos = await Notification.count({ where: { recipientId: admin.id, relatedId: String(yo.id) } as any });
    expect(avisos).toBe(1);
  });

  it('a administración le llega la notificación con el enlace a la lista', async () => {
    const { yo } = await crearChoque();
    const aviso: any = await Notification.findOne({ where: { recipientId: admin.id, relatedId: String(yo.id) } as any });
    expect(aviso).toBeTruthy();
    expect(aviso.actionUrl).toBe('/admin/identidad-a-revisar');
    expect(aviso.title).toMatch(/DNI repetido/i);
  });

  it('solo administración la ve (un usuario común, 403)', async () => {
    const comun = await crearUsuario({ role: 'client' });
    expect((await request(app).get('/api/admin/hubs/identidad-a-revisar').set(con(comun))).status).toBe(403);
    expect((await request(app).get('/api/admin/hubs/identidad-a-revisar')).status).toBe(401);
  });

  it('marcar revisado exige una nota; con nota sale de la lista y queda en el registro', async () => {
    const { yo } = await crearChoque();
    const sinNota = await request(app).post(`/api/admin/hubs/identidad-a-revisar/${yo.id}/revisar`).set(con(admin)).send({ nota: 'ok' });
    expect(sinNota.status).toBe(400);
    expect((await lista()).body.data.some((c: any) => c.userId === String(yo.id))).toBe(true);

    const nota = 'Era una cuenta duplicada de la misma persona: se dio de baja la nueva.';
    const bien = await request(app).post(`/api/admin/hubs/identidad-a-revisar/${yo.id}/revisar`).set(con(admin)).send({ nota });
    expect(bien.status).toBe(200);
    expect((await lista()).body.data.some((c: any) => c.userId === String(yo.id))).toBe(false);

    const con_revisados = (await lista('?revisados=1')).body.data.find((c: any) => c.userId === String(yo.id));
    expect(con_revisados).toMatchObject({ estado: 'revisado', nota });
    const evento: any = await AuditLog.findOne({ where: { action: 'KYC_DNI_EN_USO_REVISADO', targetId: String(yo.id) } });
    expect(evento.performedBy).toBe(String(admin.id));
    expect(JSON.stringify(evento.metadata)).toContain('duplicada');

    // no se revisa dos veces
    expect((await request(app).post(`/api/admin/hubs/identidad-a-revisar/${yo.id}/revisar`).set(con(admin)).send({ nota })).status).toBe(404);
  });

  it('una cuenta sin choque no se puede «revisar», y un id inventado tampoco', async () => {
    const limpia: any = await crearUsuario({});
    expect((await request(app).post(`/api/admin/hubs/identidad-a-revisar/${limpia.id}/revisar`).set(con(admin)).send({ nota: 'una nota larga de prueba' })).status).toBe(404);
  });

  it('un choque NUEVO (otro DNI) de una cuenta ya revisada vuelve a aparecer como pendiente', async () => {
    const { yo } = await crearChoque();
    await request(app).post(`/api/admin/hubs/identidad-a-revisar/${yo.id}/revisar`).set(con(admin)).send({ nota: 'Revisado la primera vez, sin problemas.' });
    const otroDni = dniNuevo();
    await crearUsuario({ dni: otroDni });
    await aplicarIdentidadDeDidit(yo, decision(otroDni));
    const fila = (await lista()).body.data.find((c: any) => c.userId === String(yo.id));
    expect(fila).toMatchObject({ estado: 'pendiente', dniDeDidit: otroDni });
  });

  it('si la cuenta termina con ese DNI (alguien lo corrigió), ya no hay nada que revisar', async () => {
    const { dni, ajena, yo } = await crearChoque();
    await User.update({ dni: null as any }, { where: { id: ajena.id } });
    await User.update({ dni }, { where: { id: yo.id } });
    expect((await lista()).body.data.some((c: any) => c.userId === String(yo.id))).toBe(false);
  });

  it('si la otra cuenta ya no tiene ese DNI, se marca (el choque se resolvió solo) pero sigue para revisar', async () => {
    const { ajena, yo } = await crearChoque();
    await User.update({ dni: dniNuevo() }, { where: { id: ajena.id } });
    const fila = (await lista()).body.data.find((c: any) => c.userId === String(yo.id));
    expect(fila.otraSigueConEseDni).toBe(false);
    expect(fila.estado).toBe('pendiente');
  });
});
