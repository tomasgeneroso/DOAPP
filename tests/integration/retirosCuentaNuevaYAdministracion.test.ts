import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Retiros: a qué cuenta van, qué ve cada uno y que cada paso se haga una sola vez.
 *
 * Lo que mostró la prueba a mano del dueño:
 *  - «Cantidad pendiente $02407.52»: la base devuelve el monto como texto y la pantalla lo sumaba como texto.
 *  - Un código larguísimo pisaba la fecha: se mandaba a la pantalla el CBU CIFRADO tal como está en la base.
 *  - Se pidió poder cobrar en la cuenta del perfil o en otra (guardándola o no), y en Lemon (con $lemontag, alias o CVU).
 * Y del pedido de «que pagos, cancelaciones y aprobaciones se hagan una sola vez»: dos administradores (o un doble toque) aprobaban, rechazaban o
 * COMPLETABAN el mismo retiro dos veces; completarlo dos veces descontaba el saldo dos veces.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));
jest.mock('../../server/services/fcm.js', () => ({ __esModule: true, default: { sendToUser: async () => undefined } }));
jest.mock('../../server/services/invoiceService.js', () => ({
  __esModule: true,
  generateWithdrawalReceipt: async () => undefined,
  generateClientPaymentInvoice: async () => undefined,
  generateWorkerPaymentInvoice: async () => undefined,
  getUserInvoices: async () => [],
  getInvoiceById: async () => null,
}));

import { User } from '../../server/models/sql/User.model.js';
import { WithdrawalRequest } from '../../server/models/sql/WithdrawalRequest.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

const CBU_PERFIL = '0170099220000067797370';
const CBU_NUEVO = '0110012330001234567890';
// Una cuenta NUEVA cada vez: el modelo de usuario cifra el CBU sobre el mismo objeto que recibe, y compartirlo dejaba el CBU cifrado para los demás.
const cuentaDelPerfil = () => ({ accountHolder: 'Persona de Prueba', bankName: 'Banco de Prueba', cbu: CBU_PERFIL });

describe('retiros: cuenta del perfil o nueva, Lemon, lo que ve la persona y lo que hace administración', () => {
  let app: Express;
  let admin: any;
  const usuarios: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const sinEnfriamiento = () => ({ bankingInfo: cuentaDelPerfil(), bankingInfoUpdatedAt: new Date(Date.now() - 48 * 3_600_000) });
  const usuario = async (over: Record<string, unknown> = {}) => {
    const u: any = await crearUsuario({ role: 'doer', dniVerified: true, balanceArs: 5000, ...sinEnfriamiento(), ...over });
    usuarios.push(u.id);
    return u;
  };
  const pedir = (u: any, cuerpo: Record<string, unknown> = {}) => request(app).post('/api/balance/withdraw').set(con(u)).send({ aceptaCostoPasarela: true, ...cuerpo });
  const nueva = (extra: Record<string, unknown> = {}) => ({ accountHolder: 'Otra Persona', bankName: 'Banco Nuevo', cbu: CBU_NUEVO, ...extra });
  const retiroDe = async (u: any) => (await WithdrawalRequest.findOne({ where: { userId: u.id }, order: [['createdAt', 'DESC']] })) as any;
  const saldoDe = async (u: any) => Number(((await User.findByPk(u.id)) as any).balanceArs);
  const admin_ = (ruta: string, id: string, cuerpo: Record<string, unknown> = {}) => request(app).post(`/api/admin/withdrawals/${id}/${ruta}`).set(con(admin)).send(cuerpo);
  /** Deja el retiro listo para que administración lo procese (pasó el enfriamiento). */
  const liberar = async (w: any) => w.update({ metadata: { ...(w.metadata || {}), noSeProcesaAntesDe: new Date(Date.now() - 1000).toISOString() } });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/balance', (await import('../../server/routes/balance.js')).default);
    app.use('/api/admin/withdrawals', (await import('../../server/routes/admin/withdrawals.js')).default);
    admin = await crearUsuario({ role: 'client', adminRole: 'admin' });
    usuarios.push(admin.id);
  });

  afterEach(async () => {
    await WithdrawalRequest.destroy({ where: { userId: usuarios } });
  });

  afterAll(async () => {
    try {
      await AuditLog.destroy({ where: { performedBy: admin.id } as any });
      await Notification.destroy({ where: { recipientId: usuarios } });
      await BalanceTransaction.destroy({ where: { userId: usuarios } });
      await User.destroy({ where: { id: usuarios }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  describe('lo que ve la persona', () => {
    it('el monto vuelve como NÚMERO y el CBU enmascarado, nunca cifrado (antes salía «$02407.52» y un código largo)', async () => {
      const u = await usuario();
      expect((await pedir(u)).status).toBe(201);
      const lista = await request(app).get('/api/balance/withdrawals').set(con(u));
      const w = lista.body.withdrawals[0];
      expect(typeof w.amount).toBe('number');
      expect(w.amount).toBe(5000);
      expect(w.bankingInfo.cbu).toBe('****7370');
      expect(JSON.stringify(lista.body)).not.toContain(CBU_PERFIL);
      expect(w.bankingInfo.cbu).not.toMatch(/[:/]/); // el texto cifrado lleva iv:datos
      expect(w.metadata.ipAddress).toBeUndefined();
    });

    it('la respuesta al pedir el retiro tampoco trae el CBU cifrado y avisa que un administrador tiene que aprobarlo', async () => {
      const u = await usuario();
      const r = await pedir(u);
      expect(r.status).toBe(201);
      expect(r.body.withdrawal.bankingInfo.cbu).toBe('****7370');
      expect(r.body.message).toMatch(/administrador tiene que aprobar/i);
      expect(r.body.message).toMatch(/paciencia/i);
    });

    it('GET /balance dice cuál es la cuenta del perfil (sin el número entero) para ofrecerla como destino', async () => {
      const u = await usuario();
      const b = await request(app).get('/api/balance').set(con(u));
      expect(b.body.cuentaDelPerfil.etiqueta).toBe('Banco de Prueba · CBU ****7370');
      expect(JSON.stringify(b.body)).not.toContain(CBU_PERFIL);
      expect(b.body.enfriamientoDelPerfil).toBeNull();
    });

    it('si la cuenta del perfil se cambió hace poco, GET /balance lo dice para avisar antes de intentar', async () => {
      const u = await usuario({ bankingInfoUpdatedAt: new Date() });
      const b = await request(app).get('/api/balance').set(con(u));
      expect(b.body.enfriamientoDelPerfil.motivo).toMatch(/horas/);
    });
  });

  describe('otra cuenta', () => {
    it('una cuenta que no es la del perfil se puede pedir: espera 24 h, lo registra y le avisa a la persona', async () => {
      const u = await usuario();
      const r = await pedir(u, { bankingInfo: nueva() });
      expect(r.status).toBe(201);
      expect(r.body.esCuentaNueva).toBe(true);
      const w = await retiroDe(u);
      expect(w.metadata.destinoNuevo).toBe(true);
      expect(new Date(w.metadata.noSeProcesaAntesDe).getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
      expect(await Notification.count({ where: { recipientId: u.id, title: 'Pediste un retiro a una cuenta nueva' } })).toBe(1);
    });

    it('«guardar en mi perfil» la deja como cuenta del perfil; sin tildarlo, el perfil no cambia', async () => {
      const guardar = await usuario();
      expect((await pedir(guardar, { guardarEnPerfil: true, bankingInfo: nueva() })).status).toBe(201);
      const g: any = await User.findByPk(guardar.id);
      expect(g.bankingInfo.bankName).toBe('Banco Nuevo');
      expect(g.bankingInfoUpdatedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);

      const noGuardar = await usuario();
      expect((await pedir(noGuardar, { guardarEnPerfil: false, bankingInfo: nueva() })).status).toBe(201);
      const n: any = await User.findByPk(noGuardar.id);
      expect(n.bankingInfo.bankName).toBe('Banco de Prueba');
    });

    it('la misma cuenta del perfil (o sin cuenta en el pedido) no espera: es la de siempre', async () => {
      const u = await usuario();
      const a = await pedir(u, { bankingInfo: cuentaDelPerfil() });
      expect(a.status).toBe(201);
      expect(a.body.esCuentaNueva).toBe(false);
      expect((await retiroDe(u)).metadata.noSeProcesaAntesDe).toBeUndefined();

      const v = await usuario();
      const b = await pedir(v);
      expect(b.status).toBe(201);
      expect(b.body.esCuentaNueva).toBe(false);
    });

    it('un CBU mal escrito en la cuenta nueva se rechaza igual', async () => {
      const u = await usuario();
      for (const cbu of ['123', 'a'.repeat(22), `${CBU_NUEVO} `]) {
        expect([cbu, (await pedir(u, { bankingInfo: nueva({ cbu }) })).status]).toEqual([cbu, 400]);
      }
    });
  });

  describe('un solo retiro abierto por persona', () => {
    it('dos pedidos a la vez (dos pestañas, un doble toque): se crea UNO solo', async () => {
      const u = await usuario();
      const [a, b] = await Promise.all([pedir(u), pedir(u)]);
      expect([a.status, b.status].filter((s) => s === 201)).toHaveLength(1);
      expect([a.status, b.status].filter((s) => s !== 201)[0]).toBeGreaterThanOrEqual(400);
      expect(await WithdrawalRequest.count({ where: { userId: u.id } })).toBe(1);
    });

    it('con uno abierto, otro pedido recibe el aviso y no se crea', async () => {
      const u = await usuario();
      expect((await pedir(u)).status).toBe(201);
      const otra = await pedir(u);
      expect(otra.status).toBeGreaterThanOrEqual(400);
      expect(otra.body.message).toMatch(/pendiente/i);
      expect(await WithdrawalRequest.count({ where: { userId: u.id } })).toBe(1);
    });
  });

  describe('Lemon', () => {
    const lemon = (extra: Record<string, unknown>) => ({ accountHolder: 'Persona de Lemon', bankName: 'Lemon', ...extra });

    it('alcanza con el $lemontag (sin «$» también): se guarda en minúsculas y con el «$»', async () => {
      const u = await usuario();
      const r = await pedir(u, { bankingInfo: lemon({ lemonTag: 'Tomas.Generoso' }) });
      expect(r.status).toBe(201);
      expect(r.body.withdrawal.bankingInfo.lemonTag).toBe('$tomas.generoso');
      expect(r.body.withdrawal.bankingInfo.cbu).toBeUndefined();
    });

    it('alcanza con el alias, o con el CVU', async () => {
      const a = await usuario();
      expect((await pedir(a, { bankingInfo: lemon({ alias: 'mi.alias.lemon' }) })).status).toBe(201);
      const b = await usuario();
      expect((await pedir(b, { bankingInfo: lemon({ cbu: '0000003100012345678901' }) })).status).toBe(201);
    });

    it('sin ninguno de los tres, o con un $lemontag inválido, se rechaza con el motivo', async () => {
      const u = await usuario();
      const sin = await pedir(u, { bankingInfo: lemon({}) });
      expect(sin.status).toBe(400);
      expect(sin.body.message).toMatch(/lemontag.*alias.*CVU/i);
      const malo = await pedir(u, { bankingInfo: lemon({ lemonTag: '$a b!' }) });
      expect(malo.status).toBe(400);
      expect(malo.body.message).toMatch(/lemontag/i);
    });

    it('un retiro a Lemon es SIEMPRE a una cuenta nueva si el perfil tiene un banco: espera el enfriamiento', async () => {
      const u = await usuario();
      const r = await pedir(u, { bankingInfo: lemon({ lemonTag: '$tomas' }) });
      expect(r.body.esCuentaNueva).toBe(true);
    });
  });

  describe('administración', () => {
    it('un retiro a una cuenta nueva NO se aprueba antes de las 24 h (403), pero sí se puede rechazar', async () => {
      const u = await usuario();
      await pedir(u, { bankingInfo: nueva() });
      const w = await retiroDe(u);
      const a = await admin_('approve', w.id);
      expect(a.status).toBe(403);
      expect(a.body.code).toBe('WITHDRAWAL_NEW_DESTINATION_COOLDOWN');
      expect((await retiroDe(u)).status).toBe('pending');
      expect((await admin_('reject', w.id, { rejectionReason: 'no es de la persona' })).status).toBe(200);
    });

    it('cumplido el plazo se aprueba; aprobarlo dos veces seguidas: gana uno solo (200 y 409) y el aviso sale una vez', async () => {
      const u = await usuario();
      await pedir(u, { bankingInfo: nueva() });
      const w = await retiroDe(u);
      await liberar(w);
      const [a, b] = await Promise.all([admin_('approve', w.id), admin_('approve', w.id)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect([a.body.code, b.body.code]).toContain('WITHDRAWAL_ALREADY_PROCESSED');
      expect((await retiroDe(u)).status).toBe('approved');
    });

    it('la lista de administración trae el CBU entero (en la base está cifrado y hace falta para transferir)', async () => {
      const u = await usuario();
      await pedir(u);
      const lista = await request(app).get('/api/admin/withdrawals').set(con(admin));
      const w = lista.body.withdrawals.find((x: any) => String(x.userId) === String(u.id));
      expect(w.bankingInfo.cbu).toBe(CBU_PERFIL);
    });

    it('rechazar dos veces seguidas: gana uno solo', async () => {
      const u = await usuario();
      await pedir(u);
      const w = await retiroDe(u);
      const [a, b] = await Promise.all([admin_('reject', w.id, { rejectionReason: 'x' }), admin_('reject', w.id, { rejectionReason: 'x' })]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
    });

    it('COMPLETAR dos veces seguidas: el saldo se descuenta UNA vez, no dos', async () => {
      const u = await usuario();
      await pedir(u);
      const w = await retiroDe(u);
      expect((await admin_('approve', w.id)).status).toBe(200);

      const [a, b] = await Promise.all([admin_('complete', w.id, { proofOfTransfer: 'https://comprobante.local/1.png' }), admin_('complete', w.id, { proofOfTransfer: 'https://comprobante.local/1.png' })]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(await saldoDe(u)).toBe(0);
      expect(await BalanceTransaction.count({ where: { userId: u.id, type: 'withdrawal' } })).toBe(1);
      expect((await retiroDe(u)).status).toBe('completed');
    });

    it('si el descuento ya se hizo y el cierre quedó a medias, volver a completar cierra SIN descontar de nuevo', async () => {
      const u = await usuario();
      await pedir(u);
      const w = await retiroDe(u);
      await admin_('approve', w.id);
      // Una primera vuelta que descontó pero no llegó a marcar el retiro como completado.
      const { debitarSaldo } = await import('../../server/services/quotePayment.js');
      await debitarSaldo(String(u.id), 5000, 'Retiro a cuenta bancaria (Banco de Prueba)', { tipo: 'withdrawal', unicoPorMetadata: { campo: 'withdrawalId', valor: String(w.id) }, metadata: { withdrawalId: w.id } });
      expect(await saldoDe(u)).toBe(0);

      const r = await admin_('complete', w.id, { proofOfTransfer: 'https://comprobante.local/2.png' });
      expect(r.status).toBe(200);
      expect(await saldoDe(u)).toBe(0);
      expect(await BalanceTransaction.count({ where: { userId: u.id, type: 'withdrawal' } })).toBe(1);
    });

    it('la persona no puede cancelar un retiro que un administrador ya aprobó (409)', async () => {
      const u = await usuario();
      await pedir(u);
      const w = await retiroDe(u);
      await admin_('approve', w.id);
      const r = await request(app).post(`/api/balance/withdrawals/${w.id}/cancel`).set(con(u));
      expect(r.status).toBe(409);
      expect((await retiroDe(u)).status).toBe('approved');
    });

    it('cancelar y aprobar a la vez: gana uno solo', async () => {
      const u = await usuario();
      await pedir(u);
      const w = await retiroDe(u);
      const [c, a] = await Promise.all([request(app).post(`/api/balance/withdrawals/${w.id}/cancel`).set(con(u)), admin_('approve', w.id)]);
      const estado = (await retiroDe(u)).status;
      expect(['cancelled', 'approved']).toContain(estado);
      expect([c.status === 200, a.status === 200].filter(Boolean)).toHaveLength(1);
    });
  });
});
