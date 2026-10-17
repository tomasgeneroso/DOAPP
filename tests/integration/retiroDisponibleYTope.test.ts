import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Retiros: (1) se retira solo lo DISPONIBLE (lo que Mercado Pago ya liberó); lo demás ya está en la cuenta pero espera su fecha;
 * (2) por encima de $200.000 por día el retiro se crea igual pero solo el DUEÑO puede aprobarlo.
 */
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));
jest.mock('../../server/services/fcm.js', () => ({ __esModule: true, default: { sendToUser: async () => undefined } }));

import { User } from '../../server/models/sql/User.model.js';
import { WithdrawalRequest } from '../../server/models/sql/WithdrawalRequest.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { conSistema } from '../../server/db/contextoRls.js';
import { crearUsuario } from '../helpers/fixtures.js';
import { TOPE_DIARIO_RETIRO_USUARIO_ARS } from '../../shared/constants/topesDeDinero.js';

const CBU = '0170099220000067797370';
const DIA = 86_400_000;

describe('retiro: solo lo disponible, y el tope diario pasa por el dueño', () => {
  let app: Express;
  let admin: any, dueno: any;
  const creados: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const cuenta = { accountHolder: 'Persona de Prueba', bankName: 'Mercado Pago', cbu: CBU, accountType: 'savings' };

  const usuario = async (saldoInicial = 0) => {
    const u: any = await crearUsuario({
      role: 'doer', dniVerified: true, balanceArs: saldoInicial,
      bankingInfo: { accountHolder: 'Persona de Prueba', bankName: 'Mercado Pago', cbu: CBU },
      bankingInfoUpdatedAt: new Date(Date.now() - 48 * 3_600_000),
    });
    creados.push(u.id);
    return u;
  };
  const acreditar = async (u: any, monto: number, disponibleDesde?: Date) => {
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    await acreditarSaldo(String(u.id), monto, 'devolución de prueba', { tipo: 'refund', metadata: disponibleDesde ? { disponibleDesde: disponibleDesde.toISOString() } : {} });
  };
  const retirar = (u: any) => request(app).post('/api/balance/withdraw').set(con(u)).send({ bankingInfo: cuenta, aceptaCostoPasarela: true });
  const pedidoDe = (u: any): Promise<any> => WithdrawalRequest.findOne({ where: { userId: u.id }, order: [['createdAt', 'DESC']] });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/balance', (await import('../../server/routes/balance.js')).default);
    app.use('/api/admin/withdrawals', (await import('../../server/routes/admin/withdrawals.js')).default);
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    dueno = await crearUsuario({ role: 'admin', adminRole: 'owner' });
  });

  afterEach(async () => {
    await conSistema(() => WithdrawalRequest.destroy({ where: { userId: creados } as any })).catch(() => {});
  });

  afterAll(async () => {
    try {
      await conSistema(async () => {
        await BalanceTransaction.destroy({ where: { userId: [...creados, admin.id, dueno.id] } as any });
        await User.destroy({ where: { id: [...creados, admin.id, dueno.id] } as any, force: true });
      });
    } catch {
      /* el próximo DROP SCHEMA lo limpia */
    }
  });

  describe('disponible vs en liberación', () => {
    it('GET /api/balance separa lo que se puede retirar de lo que todavía no liberó Mercado Pago', async () => {
      const u = await usuario();
      await acreditar(u, 2000); // ya liberado
      await acreditar(u, 3000, new Date(Date.now() + 4 * DIA)); // se libera en 4 días
      const r = await request(app).get('/api/balance').set(con(u));
      expect(r.status).toBe(200);
      expect(Number(r.body.balance)).toBe(5000);
      expect(r.body.disponibleParaRetirar).toBe(2000);
      expect(r.body.enLiberacion).toBe(3000);
      expect(new Date(r.body.proximaLiberacion).getTime()).toBeGreaterThan(Date.now() + 3 * DIA);
    });

    it('retira solo lo disponible: el pedido es por $2.000, el saldo antes es $5.000 y quedan $3.000 en la cuenta', async () => {
      const u = await usuario();
      await acreditar(u, 2000);
      await acreditar(u, 3000, new Date(Date.now() + 4 * DIA));
      const r = await retirar(u);
      expect(r.status).toBe(201);
      const p = await pedidoDe(u);
      expect(Number(p.amount)).toBe(2000);
      expect(Number(p.balanceBeforeWithdrawal)).toBe(5000);
      expect(Number(p.balanceAfterWithdrawal)).toBe(3000);
      expect(Number(p.metadata.saldoDebitado)).toBe(2000);
      expect(Number(p.metadata.enLiberacion)).toBe(3000);
    });

    it('recorrido completo con retiro parcial: pedir, aprobar, procesar y completar; se debita solo lo retirado y lo que sigue en liberación queda', async () => {
      const u = await usuario();
      await acreditar(u, 2000);
      await acreditar(u, 3000, new Date(Date.now() + 4 * DIA));
      expect((await retirar(u)).status).toBe(201);
      const p = await pedidoDe(u);
      for (const accion of ['approve', 'processing']) {
        const r = await request(app).post(`/api/admin/withdrawals/${p.id}/${accion}`).set(con(admin)).send({});
        expect([accion, r.status]).toEqual([accion, 200]);
      }
      const fin = await request(app).post(`/api/admin/withdrawals/${p.id}/complete`).set(con(admin)).send({ proofOfTransfer: 'comprobante-123' });
      expect([fin.status, fin.body.message]).toEqual([200, expect.anything()]);
      expect(Number(((await conSistema(() => User.findByPk(u.id))) as any).balanceArs)).toBe(3000);
      expect((await pedidoDe(u)).status).toBe('completed');
      const asiento: any = await conSistema(() => BalanceTransaction.findOne({ where: { userId: u.id, type: 'withdrawal' } as any }));
      expect(Number(asiento.amount)).toBe(-2000);
    });

    it('si todo está en liberación no hay retiro y el mensaje dice cuándo se libera', async () => {
      const u = await usuario();
      await acreditar(u, 5000, new Date(Date.now() + 3 * DIA));
      const r = await retirar(u);
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/Mercado Pago todavía no liberó ese pago/);
      expect(r.body.message).toMatch(/Se libera el/);
      expect(r.body.disponibleParaRetirar).toBe(0);
      expect(r.body.enLiberacion).toBe(5000);
      expect(await WithdrawalRequest.count({ where: { userId: u.id } })).toBe(0);
    });

    it('cuando llega la fecha, todo el saldo es retirable', async () => {
      const u = await usuario();
      await acreditar(u, 5000, new Date(Date.now() - 1000)); // la fecha ya pasó
      const r = await retirar(u);
      expect(r.status).toBe(201);
      expect(Number((await pedidoDe(u)).amount)).toBe(5000);
    });

    it('lo que el usuario gastó dentro de la app sale primero de lo disponible: nunca se puede retirar más de lo que hay', async () => {
      const u = await usuario();
      await acreditar(u, 1000);
      await acreditar(u, 3000, new Date(Date.now() + 4 * DIA));
      const { debitarSaldo } = await import('../../server/services/quotePayment.js');
      await debitarSaldo(String(u.id), 2500, 'pago con saldo dentro de la app'); // usar el saldo adentro NO espera
      const r = await request(app).get('/api/balance').set(con(u));
      expect(Number(r.body.balance)).toBe(1500);
      expect(r.body.enLiberacion).toBe(1500); // tope: no puede haber más en liberación que saldo
      expect(r.body.disponibleParaRetirar).toBe(0);
    });
  });

  describe('tope diario de $200.000 y aprobación del dueño', () => {
    it(`hasta $${TOPE_DIARIO_RETIRO_USUARIO_ARS.toLocaleString('es-AR')} el retiro sigue el circuito normal`, async () => {
      const u = await usuario(150_000);
      const r = await retirar(u);
      expect(r.status).toBe(201);
      expect(r.body.requiereAprobacionDelDueno).toBe(false);
      const p = await pedidoDe(u);
      expect(p.metadata.requiereDueno).toBe(false);
      expect((await request(app).post(`/api/admin/withdrawals/${p.id}/approve`).set(con(admin)).send({})).status).toBe(200);
    });

    it('por encima del tope el retiro se crea y avisa que lo aprueba el dueño; un admin NO puede aprobarlo, procesarlo ni completarlo', async () => {
      const u = await usuario(250_000);
      const r = await retirar(u);
      expect(r.status).toBe(201);
      expect(r.body.requiereAprobacionDelDueno).toBe(true);
      expect(r.body.message).toMatch(/lo tiene que aprobar el dueño|tiene que aprobarla el dueño/);
      const p = await pedidoDe(u);
      expect(p.metadata.requiereDueno).toBe(true);
      const aprobar = await request(app).post(`/api/admin/withdrawals/${p.id}/approve`).set(con(admin)).send({});
      expect([aprobar.status, aprobar.body.code]).toEqual([403, 'RETIRO-REQUIERE-DUENO']);
      expect(aprobar.body.guia).toBe('/admin/guia-de-errores#RETIRO-REQUIERE-DUENO');
      // Sin aprobar no se puede saltear al paso siguiente: procesar y completar piden que esté aprobado.
      for (const accion of ['processing', 'complete']) {
        const a = await request(app).post(`/api/admin/withdrawals/${p.id}/${accion}`).set(con(admin)).send({ proofOfTransfer: 'x' });
        expect([accion, a.status]).toEqual([accion, 400]);
      }
      expect((await pedidoDe(u)).status).toBe('pending'); // nada se movió
    });

    it('el dueño lo aprueba, queda anotado quién y cuándo, y desde ahí un admin puede continuar el circuito', async () => {
      const u = await usuario(250_000);
      await retirar(u);
      const p = await pedidoDe(u);
      const ok = await request(app).post(`/api/admin/withdrawals/${p.id}/approve`).set(con(dueno)).send({});
      expect(ok.status).toBe(200);
      const despues = await pedidoDe(u);
      expect(despues.status).toBe('approved');
      expect(despues.metadata.aprobadoPorDueno.by).toBe(String(dueno.id));
      expect(new Date(despues.metadata.aprobadoPorDueno.at).getTime()).toBeLessThanOrEqual(Date.now());
      expect((await request(app).post(`/api/admin/withdrawals/${p.id}/processing`).set(con(admin)).send({})).status).toBe(200);
    });

    it('cuenta lo ya retirado HOY: $150.000 completados + $100.000 nuevos superan el tope', async () => {
      const u = await usuario(100_000);
      await conSistema(() =>
        WithdrawalRequest.create({
          userId: u.id, amount: 150_000, bankingInfo: { ...cuenta }, status: 'completed',
          balanceBeforeWithdrawal: 150_000, balanceAfterWithdrawal: 0, metadata: {},
        } as any),
      );
      const r = await retirar(u);
      expect(r.status).toBe(201);
      expect(r.body.requiereAprobacionDelDueno).toBe(true);
      expect(Number((await pedidoDe(u)).metadata.retiradoHoy)).toBe(150_000);
    });

    it('lo retirado ayer no cuenta para el tope de hoy', async () => {
      const u = await usuario(100_000);
      const ayer: any = await conSistema(() =>
        WithdrawalRequest.create({
          userId: u.id, amount: 150_000, bankingInfo: { ...cuenta }, status: 'completed',
          balanceBeforeWithdrawal: 150_000, balanceAfterWithdrawal: 0, metadata: {},
        } as any),
      );
      await conSistema(() => WithdrawalRequest.update({ createdAt: new Date(Date.now() - 2 * DIA) } as any, { where: { id: ayer.id }, silent: true } as any));
      const r = await retirar(u);
      expect(r.status).toBe(201);
      expect(r.body.requiereAprobacionDelDueno).toBe(false);
    });
  });
});
