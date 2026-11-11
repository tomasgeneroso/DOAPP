import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Retiros: el administrador hace la transferencia a mano desde Mercado Pago, sube el COMPROBANTE (imagen o PDF) y recién ahí completa el retiro (regla del dueño, 2026-11-11).
 * Se puede completar desde «aprobado» (no hace falta pasar por «en proceso»). Un comprobante que apunta a un archivo que no es de la carpeta de comprobantes se rechaza antes de
 * descontar nada.
 */
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));
jest.mock('../../server/services/fcm.js', () => ({ __esModule: true, default: { sendToUser: async () => undefined } }));

import { User } from '../../server/models/sql/User.model.js';
import { WithdrawalRequest } from '../../server/models/sql/WithdrawalRequest.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { conSistema } from '../../server/db/contextoRls.js';
import { crearUsuario } from '../helpers/fixtures.js';

const CBU = '0170099220000067797370';
const COMPROBANTE = '/uploads/payment-proofs/admin-proof-1234-5678.pdf';

describe('retiro: comprobante de la transferencia manual', () => {
  let app: Express;
  let admin: any;
  const creados: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const cuenta = { accountHolder: 'Persona de Prueba', bankName: 'Mercado Pago', cbu: CBU, accountType: 'savings' };
  const saldoDe = async (u: any) => Number(((await conSistema(() => User.findByPk(u.id))) as any).balanceArs);

  /** Una persona con $5.000 de saldo que ya pidió retirar y cuyo retiro está APROBADO. */
  const retiroAprobado = async () => {
    const u: any = await crearUsuario({ role: 'doer', dniVerified: true, balanceArs: 0, bankingInfo: { accountHolder: 'Persona de Prueba', bankName: 'Mercado Pago', cbu: CBU }, bankingInfoUpdatedAt: new Date(Date.now() - 48 * 3_600_000) });
    creados.push(u.id);
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    await acreditarSaldo(String(u.id), 5000, 'devolución de prueba', { tipo: 'refund', metadata: {} });
    expect((await request(app).post('/api/balance/withdraw').set(con(u)).send({ bankingInfo: cuenta, aceptaCostoPasarela: true })).status).toBe(201);
    const p: any = await WithdrawalRequest.findOne({ where: { userId: u.id }, order: [['createdAt', 'DESC']] });
    expect((await request(app).post(`/api/admin/withdrawals/${p.id}/approve`).set(con(admin)).send({})).status).toBe(200);
    return { u, id: String(p.id) };
  };
  const completar = (id: string, cuerpo: Record<string, unknown>) => request(app).post(`/api/admin/withdrawals/${id}/complete`).set(con(admin)).send(cuerpo);
  const recargar = (id: string): Promise<any> => WithdrawalRequest.findByPk(id) as any;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/balance', (await import('../../server/routes/balance.js')).default);
    app.use('/api/admin/withdrawals', (await import('../../server/routes/admin/withdrawals.js')).default);
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
  });

  afterEach(async () => {
    await conSistema(() => WithdrawalRequest.destroy({ where: { userId: creados } as any })).catch(() => {});
  });

  afterAll(async () => {
    try {
      await conSistema(async () => {
        await BalanceTransaction.destroy({ where: { userId: [...creados, admin.id] } as any });
        await User.destroy({ where: { id: [...creados, admin.id] } as any, force: true });
      });
    } catch {
      /* el próximo DROP SCHEMA lo limpia */
    }
  });

  it('se completa directo desde «aprobado» con el comprobante subido: queda guardado y se descuenta el saldo', async () => {
    const { u, id } = await retiroAprobado();
    const r = await completar(id, { proofOfTransfer: COMPROBANTE, adminNotes: 'Operación: 987654' });
    expect(r.status).toBe(200);
    const p = await recargar(id);
    expect(p.status).toBe('completed');
    expect(p.proofOfTransfer).toBe(COMPROBANTE);
    expect(String(p.adminNotes)).toContain('987654');
    expect(await saldoDe(u)).toBe(0);
  });

  it('un número de operación en texto sigue valiendo como comprobante', async () => {
    const { id } = await retiroAprobado();
    expect((await completar(id, { proofOfTransfer: 'operacion-123456' })).status).toBe(200);
    expect((await recargar(id)).proofOfTransfer).toBe('operacion-123456');
  });

  it('un comprobante que apunta a otra carpeta del servidor (documentos de identidad, etc.) se rechaza y no se toca nada', async () => {
    const { u, id } = await retiroAprobado();
    for (const malo of ['/uploads/dni/otra-persona.jpg', '/uploads/payment-proofs/../dni/a.jpg', '/uploads/avatars/x.png']) {
      const r = await completar(id, { proofOfTransfer: malo });
      expect([malo, r.status]).toEqual([malo, 400]);
    }
    const p = await recargar(id);
    expect(p.status).toBe('approved');
    expect(p.proofOfTransfer ?? null).toBeNull();
    expect(await saldoDe(u)).toBe(5000);
  });
});
