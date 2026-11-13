import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * La lista de Pagos dice en qué está cada pago «de punta a punta» (pedido del dueño, 2026-11-12): en un pago de publicación cuyo contrato ya terminó pero
 * al trabajador todavía no se le pagó, el estado decía solo «Pendiente»; tiene que decir «falta pagar al trabajador».
 *
 * Lo dice la MISMA cuenta que el panel de Publicaciones (`shared/admin/resumenDePublicacion.ts`), calculada en cada lectura: si cambia el contrato, el
 * trabajo o el pago, la lista dice lo nuevo sin que nadie lo sincronice a mano. Base de pruebas real; nada sale a la red.
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

describe('situación de cada pago en la lista de Pagos', () => {
  let app: Express;
  let cliente: any, trabajador: any, admin: any;
  const creados = { pagos: [] as string[], contratos: [] as string[], jobs: [] as string[] };
  const ids = () => [cliente, trabajador, admin].map((u) => u.id);
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  const fila = async (id: string) => {
    const r = await request(app).get(`/api/admin/payments/pending?status=all&search=${id}`).set(con(admin));
    expect(r.status).toBe(200);
    return (r.body.data as any[]).find((x) => x.id === id);
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/payments', (await import('../../server/routes/admin/payments.js')).default);
    app.use('/api/admin/pending-payments', (await import('../../server/routes/admin/pendingPayments.js')).default);
    app.use('/api/admin/contracts', (await import('../../server/routes/admin/contracts.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    admin = await crearUsuario({ role: 'client', adminRole: 'admin' });
  });

  afterAll(async () => {
    try {
      await Payment.destroy({ where: { id: creados.pagos }, force: true } as any);
      await Contract.destroy({ where: { id: creados.contratos }, force: true });
      await Job.destroy({ where: { id: creados.jobs }, force: true });
      await User.destroy({ where: { id: ids() }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('publicación pagada con el contrato terminado y sin pagarle al trabajador: «falta pagar al trabajador»; al pagarle, «terminada y pagada»', async () => {
    const pago: any = await Payment.create({
      payerId: cliente.id, recipientId: null, amount: 5280.49, amountArs: 5280.49, currency: 'ARS',
      status: 'completed', paymentType: 'job_publication', paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0,
    } as any);
    creados.pagos.push(pago.id);
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'in_progress', publicationPaid: true, publicationPaymentId: pago.id });
    creados.jobs.push(trabajo.id);
    const contrato: any = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'completed', paymentStatus: 'escrow', clientConfirmed: true, doerConfirmed: true });
    creados.contratos.push(contrato.id);

    const antes = await fila(pago.id);
    expect(antes.situacion.estadoFinal).toEqual({ clave: 'terminada_falta_pagar', rotulo: 'Terminada: falta pagar al trabajador' });
    expect(antes.situacion.pago.clave).toBe('falta_pagar_trabajador');
    expect(antes.situacion.contrato.clave).toBe('terminado');
    expect(antes.situacion.trabajoId).toBe(trabajo.id);

    // Se le paga al trabajador: la lista lo dice en la lectura siguiente, sin sincronizar nada a mano.
    await Contract.update({ paymentStatus: 'completed' } as any, { where: { id: contrato.id } });
    const despues = await fila(pago.id);
    expect(despues.situacion.estadoFinal.clave).toBe('terminada_pagada');
    expect(despues.situacion.pago.clave).toBe('pagado_trabajador');
  });

  it('un pago de contrato dice lo mismo que su publicación (mismo trabajo, misma cuenta)', async () => {
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'in_progress' });
    creados.jobs.push(trabajo.id);
    const contrato: any = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'in_progress', paymentStatus: 'escrow' });
    creados.contratos.push(contrato.id);
    const pago: any = await Payment.create({
      payerId: cliente.id, recipientId: trabajador.id, contractId: contrato.id, amount: 1000, amountArs: 1000, currency: 'ARS',
      status: 'held_escrow', paymentType: 'contract_payment', paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0, isEscrow: true,
    } as any);
    creados.pagos.push(pago.id);

    const f = await fila(pago.id);
    expect(f.situacion.estadoFinal.clave).toBe('contrato_en_proceso');
    expect(f.situacion.contrato.clave).toBe('en_proceso');
  });

  it('la lista de contratos dice lo mismo que la de pagos (misma cuenta, misma publicación)', async () => {
    const pago: any = await Payment.create({
      payerId: cliente.id, recipientId: null, amount: 2000, amountArs: 2000, currency: 'ARS',
      status: 'completed', paymentType: 'job_publication', paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0,
    } as any);
    creados.pagos.push(pago.id);
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'in_progress', publicationPaid: true, publicationPaymentId: pago.id });
    creados.jobs.push(trabajo.id);
    const contrato: any = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'completed', paymentStatus: 'escrow' });
    creados.contratos.push(contrato.id);

    const deContratos = await request(app).get('/api/admin/contracts?search=' + contrato.id).set(con(admin));
    expect(deContratos.status).toBe(200);
    const c = (deContratos.body.data as any[]).find((x) => x.id === contrato.id);
    const deLosPagos = await fila(pago.id);
    expect(c.situacion.estadoFinal).toEqual({ clave: 'terminada_falta_pagar', rotulo: 'Terminada: falta pagar al trabajador' });
    expect(c.situacion).toEqual(expect.objectContaining({ estadoFinal: deLosPagos.situacion.estadoFinal, pago: deLosPagos.situacion.pago }));
  });

  it('la lista de Pagos a trabajadores también dice la situación de punta a punta', async () => {
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'in_progress' });
    creados.jobs.push(trabajo.id);
    const contrato: any = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'completed', paymentStatus: 'pending_payout', clientConfirmed: true, doerConfirmed: true });
    creados.contratos.push(contrato.id);
    const pago: any = await Payment.create({
      payerId: cliente.id, recipientId: trabajador.id, contractId: contrato.id, amount: 1000, amountArs: 1000, currency: 'ARS',
      status: 'confirmed_for_payout', paymentType: 'contract_payment', paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0, isEscrow: true,
    } as any);
    creados.pagos.push(pago.id);

    const r = await request(app).get('/api/admin/pending-payments?period=monthly').set(con(admin));
    expect(r.status).toBe(200);
    const fila = (r.body.report.data as any[]).find((x) => x.contractId === contrato.id);
    expect(fila).toBeDefined();
    expect(fila.situacion.estadoFinal.clave).toBe('terminada_falta_pagar');
    expect(fila.situacion.pago.clave).toBe('falta_pagar_trabajador');
  });

  it('un pago que no es de un trabajo (por ejemplo una membresía) no inventa una situación', async () => {
    const pago: any = await Payment.create({
      payerId: cliente.id, recipientId: null, amount: 900, amountArs: 900, currency: 'ARS',
      status: 'pending_verification', paymentType: 'membership', paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0,
    } as any);
    creados.pagos.push(pago.id);
    const f = await fila(pago.id);
    expect(f.situacion).toBeNull();
  });
});
