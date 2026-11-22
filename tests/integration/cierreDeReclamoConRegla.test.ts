import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Cerrar un reclamo directo (pedido del dueño, 2026-11-22): «Aceptar y cerrar el reclamo» daba «violates check constraint chk_resolution_fields» porque cerraba sin dejar quién lo
 * resolvió, y retirar un reclamo igual. Y «No acepto» pasa el reclamo a un administrador.
 *
 * La base de pruebas se arma sin las reglas de las migraciones (y no se pueden crear acá), así que la prueba comprueba la MISMA condición que la regla de producción (migración
 * 20260506100000, `chk_resolution_fields`): un reclamo cerrado tiene que traer quién lo resolvió, cuándo, cómo y qué se resolvió. Sin eso este error no se veía.
 */
jest.mock('../../server/index.js', () => ({ __esModule: true, socketService: new Proxy({}, { get: () => () => undefined }) }));
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Dispute } from '../../server/models/sql/Dispute.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { crearUsuario, crearTrabajo, crearContrato, crearDisputa } from '../helpers/fixtures.js';

describe('cerrar un reclamo directo cumpliendo la regla de la base de producción', () => {
  let app: Express;
  let cliente: any, trabajador: any;
  let jobId: string, contractId: string;
  const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const nuevoReclamo = async () => {
    const d: any = await crearDisputa({ contractId, initiatedBy: cliente.id, against: trabajador.id }, { status: 'negotiation', contractStatusBefore: 'in_progress', negotiationDeadline: new Date(Date.now() + 72 * 3_600_000) });
    return d;
  };
  const dePrueba = async (id: string) => (await Dispute.findByPk(id)) as any;
  /** La condición de `chk_resolution_fields` en producción: si está cerrado («cancelled» o «resolved_*»), no puede faltar ninguno de los cuatro datos. */
  const cumpleLaReglaDeProduccion = (d: any) => {
    const cerrado = ['resolved_released', 'resolved_refunded', 'resolved_partial', 'cancelled'].includes(String(d.status));
    return !cerrado || (d.resolution != null && d.resolvedAt != null && d.resolvedBy != null && d.resolutionType != null);
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/disputes', (await import('../../server/routes/disputes.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    const t: any = await crearTrabajo(cliente.id, { status: 'in_progress' });
    jobId = t.id;
    const c: any = await crearContrato({ jobId, clientId: cliente.id, doerId: trabajador.id }, { status: 'disputed' });
    contractId = c.id;
  });

  afterAll(async () => {
    const ids = [cliente.id, trabajador.id];
    try {
      await Dispute.destroy({ where: { contractId }, force: true } as any);
      await Notification.destroy({ where: { recipientId: ids } });
      await Contract.destroy({ where: { id: contractId }, force: true } as any);
      await Job.destroy({ where: { id: jobId }, force: true });
      await User.destroy({ where: { id: ids }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('la condición de la regla detecta lo que fallaba (un reclamo cerrado sin quién lo resolvió)', () => {
    expect(cumpleLaReglaDeProduccion({ status: 'cancelled', resolution: 'x', resolvedAt: new Date(), resolutionType: 'no_action', resolvedBy: null })).toBe(false);
    expect(cumpleLaReglaDeProduccion({ status: 'cancelled', resolution: 'x', resolvedAt: new Date(), resolutionType: 'no_action', resolvedBy: 'u-1' })).toBe(true);
    expect(cumpleLaReglaDeProduccion({ status: 'open', resolvedBy: null })).toBe(true);
  });

  it('«Aceptar y cerrar el reclamo» (rehacer el trabajo): se cierra, queda quién lo cerró y el contrato vuelve a donde estaba', async () => {
    const d = await nuevoReclamo();
    const p = await request(app).post(`/api/disputes/${d.id}/acuerdo`).set(como(cliente)).send({ tipo: 'rehacer', nota: 'Que lo rehaga.' });
    expect(p.status).toBe(200);
    const a = await request(app).post(`/api/disputes/${d.id}/acuerdo/aceptar`).set(como(trabajador)).send({});
    expect(a.status).toBe(200);
    const despues = await dePrueba(d.id);
    expect(despues.status).toBe('cancelled');
    expect(String(despues.resolvedBy)).toBe(String(trabajador.id));
    expect(cumpleLaReglaDeProduccion(despues)).toBe(true);
    expect(((await Contract.findByPk(contractId)) as any).status).toBe('in_progress');
    await Contract.update({ status: 'disputed' } as any, { where: { id: contractId } });
  });

  it('retirar el reclamo también se cierra bien (quedaba el mismo error)', async () => {
    const d = await nuevoReclamo();
    const r = await request(app).post(`/api/disputes/${d.id}/retirar`).set(como(cliente)).send({ nota: 'Ya lo arreglamos.' });
    expect(r.status).toBe(200);
    const despues = await dePrueba(d.id);
    expect(despues.status).toBe('cancelled');
    expect(String(despues.resolvedBy)).toBe(String(cliente.id));
    expect(cumpleLaReglaDeProduccion(despues)).toBe(true);
    await Contract.update({ status: 'disputed' } as any, { where: { id: contractId } });
  });

  it('«No acepto»: no hay acuerdo y el reclamo pasa a resolución de un administrador, con aviso a las dos partes', async () => {
    const d = await nuevoReclamo();
    await request(app).post(`/api/disputes/${d.id}/acuerdo`).set(como(cliente)).send({ tipo: 'rehacer', nota: 'Que lo rehaga.' });
    const r = await request(app).post(`/api/disputes/${d.id}/acuerdo/rechazar`).set(como(trabajador)).send({ nota: 'No estoy de acuerdo.' });
    expect(r.status).toBe(200);
    const despues = await dePrueba(d.id);
    expect(despues.status).toBe('open');
    expect(despues.escalationReason).toBe('propuesta_rechazada');
    expect(despues.agreementProposal).toBeNull();
    for (const parte of [cliente, trabajador]) {
      expect(await Notification.count({ where: { recipientId: parte.id, relatedId: d.id, title: 'Interviene un administrador' } as any })).toBe(1);
    }
    // Ya no está entre las partes: no se puede volver a proponer ni a rechazar.
    const otra = await request(app).post(`/api/disputes/${d.id}/acuerdo`).set(como(cliente)).send({ tipo: 'rehacer' });
    expect(otra.status).toBe(400);
  });
});
