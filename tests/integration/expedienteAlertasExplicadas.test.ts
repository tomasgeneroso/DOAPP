import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Alertas del expediente «explicadas» (regla del dueño, 2026-11-09): el expediente de «try» marcaba como GRAVE que se había devuelto más de lo pagado y que el mismo pago se
 * devolvió dos veces, y el dueño sabía que eso quedó así en el registro pero nunca movió plata de verdad. Quería dejar anotado «esto se registró, pero fue de esta manera»
 * SIN borrar nada. Se anota en el registro de auditoría (que solo se agrega): quién, cuándo y por qué. La alerta sigue a la vista, atenuada, y no cuenta como pendiente.
 * Explicar NO toca saldos, pagos ni asientos.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import BalanceTransaction from '../../server/models/sql/BalanceTransaction.model.js';
import { conExplicaciones, type Alerta } from '../../server/services/expedienteDePublicacion.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

const MOTIVO = 'Era una prueba: ese saldo nunca existió de verdad ni se movió plata.';

describe('conExplicaciones (la parte pura)', () => {
  const alerta = (codigo: string, nivel: Alerta['nivel']): Alerta => ({ codigo, nivel, titulo: codigo, detalle: 'd' });
  const explicacion = { por: null, el: '2026-11-09T12:00:00.000Z', motivo: 'ya se sabe por qué' };

  it('pone la explicación, y manda al final lo explicado (lo pendiente se ve primero)', () => {
    const r = conExplicaciones([alerta('a', 'alta'), alerta('b', 'alta'), alerta('c', 'media')], new Map([['a', explicacion]]));
    expect(r.map((x) => x.codigo)).toEqual(['b', 'c', 'a']);
    expect(r[2].explicada?.motivo).toBe('ya se sabe por qué');
    expect(r[0].explicada).toBeUndefined();
  });

  it('una alerta de tipo «dato» no se explica aunque haya una anotación', () => {
    const r = conExplicaciones([alerta('d', 'info')], new Map([['d', explicacion]]));
    expect(r[0].explicada).toBeUndefined();
  });
});

describe('explicar una alerta del expediente (admin)', () => {
  let app: Express;
  let admin: any, otroAdmin: any, dueno: any, comun: any;
  const jobs: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const rutaDe = (id: string, codigo: string, accion: 'explicar' | 'quitar-explicacion') => `/api/admin/jobs/${id}/expediente/alertas/${codigo}/${accion}`;
  const saldoDe = async (u: any) => Number(((await User.findByPk(u.id)) as any).balanceArs) || 0;
  const expediente = async (id: string) => (await request(app).get(`/api/admin/jobs/${id}/expediente`).set(con(admin))).body.data;

  /** Una publicación cancelada que devolvió plata sin que nunca se cobrara: la alerta ALTA «devolucion-sin-cobro». */
  const publicacionConAlertaGrave = async () => {
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    const t = await crearTrabajo(dueno.id, {
      title: 'try', status: 'cancelled', price: 5000, publicationPaid: true, publicationPaymentId: null,
      cancelledById: dueno.id, cancelledByRole: 'owner', cancelledAt: new Date(), cancellationReason: 'prueba',
    });
    jobs.push(t.id);
    await acreditarSaldo(String(dueno.id), 5000, 'Saldo a favor por cancelación de "try"', {
      relatedModel: 'Job', relatedId: t.id, tipo: 'refund',
      metadata: { origen: 'cancelacion', reason: 'job_cancelled_sin_trabajador', jobId: String(t.id), jobPrice: 5000, actor: { id: String(dueno.id), tipo: 'cliente' }, disponibleDesde: new Date().toISOString() },
    });
    return t;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/jobs', (await import('../../server/routes/admin/jobs.js')).default);
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    otroAdmin = await crearUsuario({ role: 'admin', adminRole: 'super_admin' });
    dueno = await crearUsuario({ role: 'client', dniVerified: true });
    comun = await crearUsuario({ role: 'client' });
  });

  afterAll(async () => {
    try {
      await AuditLog.destroy({ where: { targetId: jobs } as any });
      await Notification.destroy({ where: { recipientId: [admin.id, dueno.id] } });
      await BalanceTransaction.destroy({ where: { userId: dueno.id }, force: true } as any);
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: [admin.id, otroAdmin.id, dueno.id, comun.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('cada alerta trae su código estable y la grave arranca sin explicar', async () => {
    const t = await publicacionConAlertaGrave();
    const e = await expediente(t.id);
    const grave = e.alertas.find((a: any) => a.nivel === 'alta');
    expect(grave.codigo).toBe('devolucion-sin-cobro');
    expect(grave.explicada).toBeUndefined();
    for (const a of e.alertas) expect(typeof a.codigo).toBe('string');
  });

  it('el circuito: explicar (con motivo) → queda a la vista con quién/cuándo/por qué, sin tocar plata → quitar', async () => {
    const t = await publicacionConAlertaGrave();
    const saldoAntes = await saldoDe(dueno);
    const asientosAntes = await BalanceTransaction.count({ where: { userId: dueno.id } as any });

    const ok = await request(app).post(rutaDe(t.id, 'devolucion-sin-cobro', 'explicar')).set(con(admin)).send({ motivo: MOTIVO });
    expect(ok.status).toBe(200);

    const e = await expediente(t.id);
    const alerta = e.alertas.find((a: any) => a.codigo === 'devolucion-sin-cobro');
    expect(alerta.explicada).toMatchObject({ motivo: MOTIVO });
    expect(alerta.explicada.por.email).toBe(admin.email);
    expect(alerta.explicada.el).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // sigue a la vista con todo lo que decía (no se borra ni se acorta)
    expect(alerta.titulo).toMatch(/nunca se cobró/);
    expect(alerta.detalle).toContain('5.000');
    expect(alerta.queHacer).toMatch(/ajustarSaldo/);
    // quedó al final: lo pendiente va primero
    expect(e.alertas[e.alertas.length - 1].codigo === 'devolucion-sin-cobro' || e.alertas.findIndex((a: any) => a.codigo === 'devolucion-sin-cobro') >= e.alertas.filter((a: any) => !a.explicada).length).toBe(true);

    // NO se movió plata ni se borró un asiento
    expect(await saldoDe(dueno)).toBe(saldoAntes);
    expect(await BalanceTransaction.count({ where: { userId: dueno.id } as any })).toBe(asientosAntes);

    // el asiento del registro dice quién, cuándo, por qué y qué decía la alerta
    const asiento: any = await AuditLog.findOne({ where: { targetId: t.id, action: 'expediente.explicar_alerta' } as any });
    expect(asiento.performedBy).toBe(admin.id);
    expect(asiento.metadata).toMatchObject({ codigo: 'devolucion-sin-cobro', motivo: MOTIVO, nivel: 'alta' });
    expect(String(asiento.metadata.tituloDeLaAlerta)).toMatch(/nunca se cobró/);

    // quitar la explicación: vuelve a figurar pendiente y el asiento anterior sigue en el registro
    const quitada = await request(app).post(rutaDe(t.id, 'devolucion-sin-cobro', 'quitar-explicacion')).set(con(otroAdmin)).send({ motivo: 'Me equivoqué: sí hay que revisar este caso.' });
    expect(quitada.status).toBe(200);
    const despues = await expediente(t.id);
    expect(despues.alertas.find((a: any) => a.codigo === 'devolucion-sin-cobro').explicada).toBeUndefined();
    expect(await AuditLog.count({ where: { targetId: t.id, action: 'expediente.explicar_alerta' } as any })).toBe(1);
    expect(await AuditLog.count({ where: { targetId: t.id, action: 'expediente.quitar_explicacion' } as any })).toBe(1);
  });

  it('se puede explicar de nuevo después de quitarla (la última anotación manda)', async () => {
    const t = await publicacionConAlertaGrave();
    await request(app).post(rutaDe(t.id, 'devolucion-sin-cobro', 'explicar')).set(con(admin)).send({ motivo: MOTIVO });
    await request(app).post(rutaDe(t.id, 'devolucion-sin-cobro', 'quitar-explicacion')).set(con(admin)).send({ motivo: 'La quito para revisar de nuevo.' });
    const otra = await request(app).post(rutaDe(t.id, 'devolucion-sin-cobro', 'explicar')).set(con(otroAdmin)).send({ motivo: 'Ahora sí: fue una prueba del dueño.' });
    expect(otra.status).toBe(200);
    const alerta = (await expediente(t.id)).alertas.find((a: any) => a.codigo === 'devolucion-sin-cobro');
    expect(alerta.explicada.motivo).toBe('Ahora sí: fue una prueba del dueño.');
    expect(alerta.explicada.por.email).toBe(otroAdmin.email);
  });

  it('pide un motivo de verdad, y no acepta códigos inventados ni alertas que no están', async () => {
    const t = await publicacionConAlertaGrave();
    const corto = await request(app).post(rutaDe(t.id, 'devolucion-sin-cobro', 'explicar')).set(con(admin)).send({ motivo: 'prueba' });
    expect(corto.status).toBe(400);
    expect((await request(app).post(rutaDe(t.id, 'devolucion-sin-cobro', 'explicar')).set(con(admin)).send({})).status).toBe(400);
    expect((await request(app).post(rutaDe(t.id, 'una-alerta-inventada', 'explicar')).set(con(admin)).send({ motivo: MOTIVO })).status).toBe(400);
    // una alerta válida que esta publicación no tiene
    expect((await request(app).post(rutaDe(t.id, 'doble-devolucion', 'explicar')).set(con(admin)).send({ motivo: MOTIVO })).status).toBe(404);
    expect((await expediente(t.id)).alertas.find((a: any) => a.codigo === 'devolucion-sin-cobro').explicada).toBeUndefined();
  });

  it('no se explica dos veces, ni se quita lo que no está explicado', async () => {
    const t = await publicacionConAlertaGrave();
    expect((await request(app).post(rutaDe(t.id, 'devolucion-sin-cobro', 'quitar-explicacion')).set(con(admin)).send({ motivo: MOTIVO })).status).toBe(409);
    expect((await request(app).post(rutaDe(t.id, 'devolucion-sin-cobro', 'explicar')).set(con(admin)).send({ motivo: MOTIVO })).status).toBe(200);
    expect((await request(app).post(rutaDe(t.id, 'devolucion-sin-cobro', 'explicar')).set(con(otroAdmin)).send({ motivo: MOTIVO })).status).toBe(409);
  });

  it('quien no es del equipo no puede, y una publicación inexistente da 404', async () => {
    const t = await publicacionConAlertaGrave();
    expect((await request(app).post(rutaDe(t.id, 'devolucion-sin-cobro', 'explicar')).set(con(comun)).send({ motivo: MOTIVO })).status).toBe(403);
    expect((await request(app).post(rutaDe('00000000-0000-4000-8000-000000000000', 'devolucion-sin-cobro', 'explicar')).set(con(admin)).send({ motivo: MOTIVO })).status).toBe(404);
    expect((await expediente(t.id)).alertas.find((a: any) => a.codigo === 'devolucion-sin-cobro').explicada).toBeUndefined();
  });
});
