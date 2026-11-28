import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Los retiros, atados a su trabajo y contrato (pedido del dueño, 2026-11-27): se muestra como disponible solo lo que de verdad se puede retirar, el pedido guarda de
 * dónde sale cada peso y la administración lo vuelve a comprobar antes de aprobar y de transferir.
 */
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: () => undefined } }));
jest.mock('../../server/services/fcm.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => undefined }) }));

import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { WithdrawalRequest } from '../../server/models/sql/WithdrawalRequest.model.js';
import { conSistema } from '../../server/db/contextoRls.js';
import { acreditarSaldo } from '../../server/services/quotePayment.js';
import { crearUsuario, crearTrabajo, crearContrato, crearDisputa } from '../helpers/fixtures.js';

const CBU = '0000003100012345678901';

describe('retiros atados a su trabajo y contrato', () => {
  let app: Express;
  let admin: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const cuenta = { accountHolder: 'Persona de Prueba', bankName: 'Mercado Pago', cbu: CBU, accountType: 'savings' };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/balance', (await import('../../server/routes/balance.js')).default);
    app.use('/api/admin/withdrawals', (await import('../../server/routes/admin/withdrawals.js')).default);
    admin = await crearUsuario({ role: 'admin', adminRole: 'owner' });
  });

  /** Una persona que cobró 30.000 por un contrato, con el contrato en el estado pedido. */
  const conUnCobro = async (estadoDelContrato: string) => {
    const quien: any = await crearUsuario({ role: 'doer', dniVerified: true, bankingInfo: { accountHolder: 'Persona de Prueba', bankName: 'Mercado Pago', cbu: CBU }, bankingInfoUpdatedAt: new Date(Date.now() - 48 * 3_600_000) });
    const cliente: any = await crearUsuario({ role: 'client' });
    const trabajo: any = await crearTrabajo(cliente.id, { price: 30000, status: estadoDelContrato === 'completed' ? 'completed' : 'in_progress' });
    const contrato: any = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: quien.id }, { status: estadoDelContrato, price: 30000 });
    await conSistema(() => acreditarSaldo(quien.id, 30000, 'Cobro por el trabajo', { tipo: 'payment', relatedModel: 'Contract', relatedId: contrato.id }));
    return { quien, cliente, trabajo, contrato };
  };
  const saldo = (u: any) => request(app).get('/api/balance').set(con(u));
  const retirar = (u: any) => request(app).post('/api/balance/withdraw').set(con(u)).send({ bankingInfo: cuenta, aceptaCostoPasarela: true });

  it('con el contrato sin terminar no figura como disponible, dice qué falta y no se puede pedir', async () => {
    const { quien, contrato, trabajo } = await conUnCobro('awaiting_confirmation');
    const r = await saldo(quien);
    expect([Number(r.body.balance), r.body.disponibleParaRetirar, r.body.enLiberacion]).toEqual([30000, 0, 30000]);
    const tarjeta = r.body.cobrosPendientes.find((c: any) => c.contrato?.id === contrato.id);
    expect(tarjeta).toMatchObject({ monto: 30000, trabajo: { id: trabajo.id } });
    expect(tarjeta.esperando).toMatch(/contrato termine/i);
    expect((await retirar(quien)).status).toBe(400);
    await conSistema(() => Contract.update({ status: 'completed' } as any, { where: { id: contrato.id } as any }));
    expect((await saldo(quien)).body.disponibleParaRetirar).toBe(30000);
  });

  it('el pedido guarda de qué contrato y trabajo sale, y administración lo ve con su estado', async () => {
    const { quien, contrato, trabajo } = await conUnCobro('completed');
    expect((await retirar(quien)).status).toBe(201);
    const w: any = await conSistema(() => WithdrawalRequest.findOne({ where: { userId: quien.id } as any }));
    expect(w.metadata.respaldo).toEqual([expect.objectContaining({ concepto: 'cobro_del_trabajo', monto: 30000, contratoId: contrato.id })]);
    const lista = await request(app).get('/api/admin/withdrawals?status=pending&limit=200').set(con(admin));
    const fila = lista.body.withdrawals.find((x: any) => x.id === w.id);
    expect(fila.deDondeSale).toEqual([expect.objectContaining({ trabajoId: trabajo.id, contratoId: contrato.id, espera: null })]);
  });

  it('si después de pedirlo se abre un reclamo, no se aprueba (y el saldo no se toca)', async () => {
    const { quien, cliente, contrato } = await conUnCobro('completed');
    expect((await retirar(quien)).status).toBe(201);
    const w: any = await conSistema(() => WithdrawalRequest.findOne({ where: { userId: quien.id } as any }));
    await conSistema(() => crearDisputa({ contractId: contrato.id, initiatedBy: cliente.id, against: quien.id } as any, { status: 'open' } as any));
    const r = await request(app).post(`/api/admin/withdrawals/${w.id}/approve`).set(con(admin)).send({});
    expect([r.status >= 400, r.body.code]).toEqual([true, 'RETIRO-CON-RESPALDO-EN-ESPERA']);
    expect(((await conSistema(() => WithdrawalRequest.findByPk(w.id))) as any).status).toBe('pending');
  });

  it('un reclamo ya cerrado no deja la plata trabada, aunque el contrato haya quedado marcado en disputa', async () => {
    const { quien, cliente, contrato } = await conUnCobro('completed');
    await conSistema(() => Contract.update({ status: 'disputed' } as any, { where: { id: contrato.id } as any }));
    const disputa: any = await conSistema(() => crearDisputa({ contractId: contrato.id, initiatedBy: cliente.id, against: quien.id } as any, { status: 'open' } as any));
    expect((await saldo(quien)).body.disponibleParaRetirar).toBe(0);
    // Resuelto «sin medidas»: el reclamo se cierra y el contrato queda como estaba (marcado en disputa).
    await conSistema(() => disputa.update({ status: 'resolved_released' }));
    expect((await saldo(quien)).body.disponibleParaRetirar).toBe(30000);
  });

  it('marcado en disputa sin ningún reclamo registrado: se frena para que lo mire una persona', async () => {
    const { quien, contrato } = await conUnCobro('completed');
    await conSistema(() => Contract.update({ status: 'disputed' } as any, { where: { id: contrato.id } as any }));
    expect((await saldo(quien)).body.disponibleParaRetirar).toBe(0);
  });

  it('si un trabajo terminado vuelve a abrirse antes de transferir, tampoco se completa', async () => {
    const quien: any = await crearUsuario({ role: 'client', dniVerified: true, bankingInfo: { accountHolder: 'Persona de Prueba', bankName: 'Mercado Pago', cbu: CBU }, bankingInfoUpdatedAt: new Date(Date.now() - 48 * 3_600_000) });
    const trabajo: any = await crearTrabajo(quien.id, { price: 20000, status: 'completed' });
    await conSistema(() => acreditarSaldo(quien.id, 5000, 'Saldo a favor por bajar el precio', { relatedModel: 'Job', relatedId: trabajo.id, metadata: { origen: 'baja_de_precio', reason: 'price_decrease', jobId: trabajo.id } }));
    expect((await retirar(quien)).status).toBe(201);
    const w: any = await conSistema(() => WithdrawalRequest.findOne({ where: { userId: quien.id } as any }));
    await conSistema(() => Job.update({ status: 'open' } as any, { where: { id: trabajo.id } as any }));
    const r = await request(app).post(`/api/admin/withdrawals/${w.id}/approve`).set(con(admin)).send({});
    expect(r.body.code).toBe('RETIRO-CON-RESPALDO-EN-ESPERA');
  });
});
