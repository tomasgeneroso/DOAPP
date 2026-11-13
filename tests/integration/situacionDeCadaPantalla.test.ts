import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Cada persona ve, en SU pantalla (lista y detalle de contratos, «Mis trabajos»), el mismo estado que ve el equipo, dicho para su rol (regla del dueño, 2026-11-12:
 * «todo debe estar con los mismos estados»). Misma cuenta (`resumenDePublicacion`), otras palabras (`situacionParaLaPersona`). Base de pruebas real.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

describe('situación para cada persona en sus pantallas', () => {
  let app: Express;
  let cliente: any, trabajador: any, ajeno: any;
  let trabajo: any, contrato: any, pago: any;
  const ids = () => [cliente, trabajador, ajeno].map((u) => u.id);
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/contracts', (await import('../../server/routes/contracts.js')).default);
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    ajeno = await crearUsuario({ role: 'client' });
    pago = await Payment.create({
      payerId: cliente.id, recipientId: null, amount: 5000, amountArs: 5000, currency: 'ARS',
      status: 'completed', paymentType: 'job_publication', paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0,
    } as any);
    trabajo = await crearTrabajo(cliente.id, { status: 'in_progress', publicationPaid: true, publicationPaymentId: pago.id });
    contrato = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'completed', paymentStatus: 'escrow', clientConfirmed: true, doerConfirmed: true });
  });

  afterAll(async () => {
    try {
      await Contract.destroy({ where: { id: contrato.id }, force: true });
      await Payment.destroy({ where: { id: pago.id }, force: true } as any);
      await Job.destroy({ where: { id: trabajo.id }, force: true });
      await User.destroy({ where: { id: ids() }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('lista de contratos: el cliente y el trabajador ven el MISMO estado, cada uno con sus palabras', async () => {
    const c = await request(app).get('/api/contracts').set(con(cliente));
    const t = await request(app).get('/api/contracts').set(con(trabajador));
    expect(c.status).toBe(200);
    expect(t.status).toBe(200);
    const deC = (c.body.contracts as any[]).find((x) => x.id === contrato.id).situacion;
    const deT = (t.body.contracts as any[]).find((x) => x.id === contrato.id).situacion;
    expect(deC.clave).toBe('terminada_falta_pagar');
    expect(deT.clave).toBe('terminada_falta_pagar');
    expect(deC.etiqueta).toBe('Terminado: DOAPP le paga al trabajador');
    expect(deT.etiqueta).toBe('Terminado: falta que te paguen');
  });

  it('detalle del contrato: lo mismo, y al pagarle al trabajador ambos pasan a «terminado»', async () => {
    const antes = await request(app).get(`/api/contracts/${contrato.id}`).set(con(trabajador));
    expect(antes.status).toBe(200);
    expect(antes.body.contract.situacion.etiqueta).toBe('Terminado: falta que te paguen');

    await Contract.update({ paymentStatus: 'completed' } as any, { where: { id: contrato.id } });
    const c = await request(app).get(`/api/contracts/${contrato.id}`).set(con(cliente));
    const t = await request(app).get(`/api/contracts/${contrato.id}`).set(con(trabajador));
    expect(c.body.contract.situacion.etiqueta).toBe('Terminado y pagado');
    expect(t.body.contract.situacion.etiqueta).toBe('Terminado y cobrado');
    expect(c.body.contract.situacion.clave).toBe(t.body.contract.situacion.clave);
  });

  it('«Mis trabajos» trae la situación de cada trabajo; la respuesta no lleva ids ni montos del pago', async () => {
    const r = await request(app).get('/api/jobs/my-jobs').set(con(cliente));
    expect(r.status).toBe(200);
    const j = (r.body.jobs as any[]).find((x) => x.id === trabajo.id);
    expect(j.situacion.clave).toBe('terminada_pagada');
    expect(Object.keys(j.situacion).sort()).toEqual(['clave', 'etiqueta', 'explicacion', 'tono']);
  });

  it('el detalle del trabajo trae la situación solo para quien lo publicó', async () => {
    const dueno = await request(app).get(`/api/jobs/${trabajo.id}`).set(con(cliente));
    expect(dueno.status).toBe(200);
    expect(dueno.body.job.situacion.clave).toBe('terminada_pagada');
    const otro = await request(app).get(`/api/jobs/${trabajo.id}`).set(con(ajeno));
    expect(otro.body.job?.situacion).toBeUndefined();
  });
});
