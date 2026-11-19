import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * La pantalla de pedidos de cancelación del equipo (/admin/contracts/cancelaciones) dio «User is associated to Contract multiple times» (reporte del dueño,
 * 2026-11-19): una consulta incluía a User sin decir cuál de las dos relaciones (cliente o trabajador). Con la base real: la lista y el detalle responden.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: () => undefined } }));

import { ContractCancellationRequest } from '../../server/models/sql/ContractCancellationRequest.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

describe('pedidos de cancelación en el panel', () => {
  let app: Express;
  let admin: any;
  let cliente: any;
  let trabajador: any;
  let pedido: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/contracts', (await import('../../server/routes/admin/contracts.js')).default);
    admin = await crearUsuario({ role: 'admin', adminRole: 'owner' });
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'in_progress' });
    const contrato: any = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'in_progress' });
    pedido = await ContractCancellationRequest.create({
      contractId: contrato.id, jobId: trabajo.id, requestedBy: cliente.id, otherPartyId: trabajador.id, reason: 'No nos ponemos de acuerdo con la fecha', status: 'pending', requestType: 'full_cancellation', category: 'other', priority: 'medium', previousJobStatus: 'in_progress', previousContractStatus: 'in_progress',
    } as any);
  });

  afterAll(async () => {
    try { await ContractCancellationRequest.destroy({ where: { id: pedido.id } }); } catch { /* la limpieza no hace fallar la prueba */ }
  });

  it('la lista responde con las personas del pedido', async () => {
    const r = await request(app).get('/api/admin/contracts/cancellation-requests').set(con(admin));
    expect(r.body.message ?? '').not.toMatch(/associated to/);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).toContain(pedido.id);
  });

  it('el detalle también', async () => {
    const r = await request(app).get(`/api/admin/contracts/cancellation-requests/${pedido.id}`).set(con(admin));
    expect(r.body.message ?? '').not.toMatch(/associated to/);
    expect(r.status).toBe(200);
  });
});
