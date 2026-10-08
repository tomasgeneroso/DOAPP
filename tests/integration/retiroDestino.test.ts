import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * POST /api/balance/withdraw — adónde va el dinero.
 *
 * Lo que había: la ruta tomaba la cuenta de destino del CUERPO del pedido y sólo medía que tuviera 22
 * caracteres (22 letras pasaban). El enfriamiento posterior a un cambio de CBU mide la fecha del último
 * cambio del PERFIL, que un CBU mandado por el formulario de retiro nunca toca: una sesión robada retiraba
 * todo el saldo a una cuenta nueva en una sola llamada, sin que el enfriamiento se enterara.
 */

jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));
jest.mock('../../server/services/fcm.js', () => ({
  __esModule: true,
  default: { sendToUser: async () => undefined },
}));

import { User } from '../../server/models/sql/User.model.js';
import { WithdrawalRequest } from '../../server/models/sql/WithdrawalRequest.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

const CBU_PERFIL = '0170099220000067797370';
const CBU_DEL_ATACANTE = '0110012330001234567890';

describe('retiro: el destino es la cuenta del perfil', () => {
  let app: Express;
  const creados: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const datos = (cbu: string) => ({ accountHolder: 'Persona de Prueba', bankName: 'Banco de Prueba', cbu, accountType: 'savings' });
  const retirar = (u: any, cbu: unknown) => request(app).post('/api/balance/withdraw').set(con(u)).send({ bankingInfo: datos(cbu as string), aceptaCostoPasarela: true });

  const usuario = async (over: Record<string, unknown> = {}) => {
    const u: any = await crearUsuario({ role: 'doer', dniVerified: true, balanceArs: 5000, ...over });
    creados.push(u.id);
    return u;
  };
  const pedidos = (u: any) => WithdrawalRequest.count({ where: { userId: u.id } });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/balance', (await import('../../server/routes/balance.js')).default);
  });

  afterEach(async () => {
    await WithdrawalRequest.destroy({ where: { userId: creados } });
  });

  afterAll(async () => {
    try { await User.destroy({ where: { id: creados }, force: true }); } catch { /* ok */ }
  });

  it('retira a la cuenta que está guardada en el perfil', async () => {
    const u = await usuario({ bankingInfo: { accountHolder: 'Persona de Prueba', bankName: 'Banco de Prueba', cbu: CBU_PERFIL } });
    const r = await retirar(u, CBU_PERFIL);
    expect(r.status).toBe(201);
    expect(await pedidos(u)).toBe(1);
  });

  it('a un CBU DISTINTO del perfil NO retira (la sesión robada que manda su propia cuenta)', async () => {
    const u = await usuario({ bankingInfo: { accountHolder: 'Persona de Prueba', bankName: 'Banco de Prueba', cbu: CBU_PERFIL } });
    const r = await retirar(u, CBU_DEL_ATACANTE);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('CBU_DIFFERS_FROM_PROFILE');
    expect(await pedidos(u)).toBe(0);
  });

  it('un usuario sin cuenta guardada en el perfil no retira: primero la guarda (y empieza el enfriamiento)', async () => {
    const u = await usuario();
    const r = await retirar(u, CBU_DEL_ATACANTE);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('BANKING_INFO_NOT_SAVED');
    expect(await pedidos(u)).toBe(0);
  });

  it('el CBU tiene que ser de 22 DÍGITOS (22 letras o símbolos ya no pasan)', async () => {
    const u = await usuario({ bankingInfo: { accountHolder: 'Persona de Prueba', bankName: 'Banco de Prueba', cbu: CBU_PERFIL } });
    for (const malo of ['a'.repeat(22), '0170099220000067797 7', '0170099220000067797370 ', '017009922000006779737', '01700992200000677973700', '{"$ne":null}']) {
      const r = await retirar(u, malo);
      expect([malo, r.status]).toEqual([malo, 400]);
    }
    for (const raro of [null, undefined, 12345678901234567890, ['0170099220000067797370']]) {
      const r = await retirar(u, raro);
      expect([JSON.stringify(raro), r.status]).toEqual([JSON.stringify(raro), 400]);
    }
    expect(await pedidos(u)).toBe(0);
  });

  it('si la cuenta del perfil se cambió hace poco, el enfriamiento sigue aplicando', async () => {
    const u = await usuario({
      bankingInfo: { accountHolder: 'Persona de Prueba', bankName: 'Banco de Prueba', cbu: CBU_PERFIL },
      bankingInfoUpdatedAt: new Date(),
    });
    const r = await retirar(u, CBU_PERFIL);
    expect(r.status).toBe(403);
    expect(r.body.enfriamiento).toBeTruthy();
    expect(await pedidos(u)).toBe(0);
  });

  it('con el enfriamiento ya cumplido, retira', async () => {
    const u = await usuario({
      bankingInfo: { accountHolder: 'Persona de Prueba', bankName: 'Banco de Prueba', cbu: CBU_PERFIL },
      bankingInfoUpdatedAt: new Date(Date.now() - 48 * 3_600_000),
    });
    expect((await retirar(u, CBU_PERFIL)).status).toBe(201);
  });

  it('sin identidad verificada no retira (control que ya existía)', async () => {
    const u = await usuario({ dniVerified: false, bankingInfo: { accountHolder: 'Persona de Prueba', bankName: 'Banco de Prueba', cbu: CBU_PERFIL } });
    expect((await retirar(u, CBU_PERFIL)).status).toBe(403);
  });
});
